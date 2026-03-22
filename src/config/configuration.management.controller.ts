import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Response,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigHotReloadService } from './utils/config.hot-reload';
import { ConfigVersioningService, ConfigRollbackResult } from './utils/config.versioning';
import { ConfigAuditService } from './utils/config.audit';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';

@Controller('config/management')
@UseGuards(JwtAuthGuard)
export class ConfigurationManagementController {
  private readonly logger = new Logger(ConfigurationManagementController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly hotReloadService: ConfigHotReloadService,
    private readonly versioningService: ConfigVersioningService,
    private readonly auditService: ConfigAuditService,
  ) {}

  /**
   * Get current configuration
   */
  @Get()
  async getCurrentConfig(@Request() req) {
    const config: Record<string, string> = {};

    // Get all environment variables (excluding sensitive ones for display)
    for (const [key, value] of Object.entries(process.env)) {
      if (value && !key.startsWith('npm_') && !key.startsWith('NODE_')) {
        config[key] = this.auditService['maskSensitiveValue'](key, value);
      }
    }

    // Log access
    await this.auditService.logAccess('all_config', req.user?.sub, req.ip, req.headers['user-agent']);

    return {
      success: true,
      data: config,
      timestamp: new Date(),
    };
  }

  /**
   * Get configuration value by key
   */
  @Get(':key')
  async getConfigValue(@Param('key') key: string, @Request() req) {
    const value = this.configService.get(key);

    if (!value) {
      return {
        success: false,
        error: `Configuration key '${key}' not found`,
      };
    }

    // Log access
    await this.auditService.logAccess(key, req.user?.sub, req.ip, req.headers['user-agent']);

    return {
      success: true,
      data: {
        key,
        value: this.auditService['maskSensitiveValue'](key, value),
      },
    };
  }

  /**
   * Update configuration value
   */
  @Put(':key')
  async updateConfigValue(@Param('key') key: string, @Body() body: { value: string }, @Request() req) {
    const oldValue = process.env[key];
    const newValue = body.value;

    try {
      // Validate the new value
      const validationResult = this.validateConfigValue(key, newValue);
      if (!validationResult.valid) {
        return {
          success: false,
          error: validationResult.error,
        };
      }

      // Update the environment variable
      process.env[key] = newValue;

      // Create a version before making changes
      await this.versioningService.createVersion(`Updated ${key}`, req.user?.sub, ['update']);

      // Log the change
      await this.auditService.logUpdate(
        key,
        oldValue || '',
        newValue,
        req.user?.sub,
        req.ip,
        req.headers['user-agent'],
      );

      this.logger.log(`Configuration key ${key} updated by user ${req.user?.sub}`);

      return {
        success: true,
        data: {
          key,
          oldValue: this.auditService['maskSensitiveValue'](key, oldValue || ''),
          newValue: this.auditService['maskSensitiveValue'](key, newValue),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to update configuration key ${key}:`, error);

      // Restore old value
      if (oldValue) {
        process.env[key] = oldValue;
      } else {
        delete process.env[key];
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete configuration value
   */
  @Delete(':key')
  async deleteConfigValue(@Param('key') key: string, @Request() req) {
    const oldValue = process.env[key];

    if (!oldValue) {
      return {
        success: false,
        error: `Configuration key '${key}' not found`,
      };
    }

    try {
      // Check if it's a required key
      if (this.isRequiredKey(key)) {
        return {
          success: false,
          error: `Cannot delete required configuration key '${key}'`,
        };
      }

      // Create a version before deletion
      await this.versioningService.createVersion(`Deleted ${key}`, req.user?.sub, ['delete']);

      // Delete the environment variable
      delete process.env[key];

      // Log the deletion
      await this.auditService.logDelete(key, oldValue, req.user?.sub, req.ip, req.headers['user-agent']);

      this.logger.log(`Configuration key ${key} deleted by user ${req.user?.sub}`);

      return {
        success: true,
        data: {
          key,
          oldValue: this.auditService['maskSensitiveValue'](key, oldValue),
        },
      };
    } catch (error) {
      this.logger.error(`Failed to delete configuration key ${key}:`, error);

      // Restore old value
      process.env[key] = oldValue;

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get configuration versions
   */
  @Get('versions/list')
  async getVersions() {
    const versions = this.versioningService.getVersions();

    return {
      success: true,
      data: versions,
    };
  }

  /**
   * Get specific version
   */
  @Get('versions/:versionId')
  async getVersion(@Param('versionId') versionId: string) {
    const version = this.versioningService.getVersion(versionId);

    if (!version) {
      return {
        success: false,
        error: `Version ${versionId} not found`,
      };
    }

    // Mask sensitive values
    const maskedConfig: Record<string, string> = {};
    for (const [key, value] of Object.entries(version.config)) {
      maskedConfig[key] = this.auditService['maskSensitiveValue'](key, value);
    }

    return {
      success: true,
      data: {
        ...version,
        config: maskedConfig,
      },
    };
  }

  /**
   * Create configuration version
   */
  @Post('versions')
  async createVersion(@Body() body: { description: string; tags?: string[] }, @Request() req) {
    try {
      const version = await this.versioningService.createVersion(body.description, req.user?.sub, body.tags);

      return {
        success: true,
        data: version,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Rollback to version
   */
  @Post('versions/:versionId/rollback')
  async rollbackToVersion(@Param('versionId') versionId: string, @Request() req) {
    try {
      const result = await this.versioningService.rollbackToVersion(versionId);

      if (result.success) {
        // Log the rollback
        await this.auditService.logRollback(
          versionId,
          result.changes || [],
          req.user?.sub,
          req.ip,
          req.headers['user-agent'],
        );

        this.logger.log(`Configuration rolled back to version ${versionId} by user ${req.user?.sub}`);
      }

      return {
        success: result.success,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compare versions
   */
  @Get('versions/:versionId1/compare/:versionId2')
  async compareVersions(@Param('versionId1') versionId1: string, @Param('versionId2') versionId2: string) {
    try {
      const comparison = this.versioningService.compareVersions(versionId1, versionId2);

      // Mask sensitive values
      const maskedComparison = comparison.map(item => ({
        ...item,
        value1: this.auditService['maskSensitiveValue']('', item.value1),
        value2: this.auditService['maskSensitiveValue']('', item.value2),
      }));

      return {
        success: true,
        data: maskedComparison,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get audit logs
   */
  @Get('audit/logs')
  async getAuditLogs(@Query() query: any) {
    try {
      const logs = await this.auditService.getAuditLogs({
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        action: query.action,
        key: query.key,
        userId: query.userId,
        limit: query.limit ? parseInt(query.limit) : undefined,
        offset: query.offset ? parseInt(query.offset) : undefined,
      });

      return {
        success: true,
        data: logs,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get audit statistics
   */
  @Get('audit/statistics')
  async getAuditStatistics() {
    try {
      const stats = await this.auditService.getAuditStatistics();

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Export audit logs
   */
  @Get('audit/export')
  async exportAuditLogs(
    @Query() query: { format?: 'json' | 'csv'; startDate?: string; endDate?: string },
    @Response() res,
  ) {
    try {
      const filename = `audit-logs-${new Date().toISOString().split('T')[0]}.${query.format || 'json'}`;
      const outputPath = `./temp/${filename}`;

      await this.auditService.exportAuditLogs(outputPath, {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        format: query.format,
      });

      // Send file
      const fileStream = fs.createReadStream(outputPath);

      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', query.format === 'csv' ? 'text/csv' : 'application/json');

      fileStream.pipe(res);

      // Clean up temp file
      fileStream.on('end', () => {
        fs.unlinkSync(outputPath);
      });
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Force configuration reload
   */
  @Post('reload')
  async forceReload(@Request() req) {
    try {
      this.hotReloadService.forceReload();

      // Log the reload
      await this.auditService.logAccess('force_reload', req.user?.sub, req.ip, req.headers['user-agent']);

      this.logger.log(`Configuration force reloaded by user ${req.user?.sub}`);

      return {
        success: true,
        message: 'Configuration reloaded successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate configuration value
   */
  private validateConfigValue(key: string, value: string): { valid: boolean; error?: string } {
    // Basic validation rules
    if (key.includes('URL') && value && !value.startsWith('http')) {
      return { valid: false, error: 'Invalid URL format' };
    }

    if (key.includes('PORT') && value && isNaN(Number(value))) {
      return { valid: false, error: 'Port must be a number' };
    }

    if (key.includes('EMAIL') && value && !value.includes('@')) {
      return { valid: false, error: 'Invalid email format' };
    }

    if (key.includes('SECRET') && value && value.length < 32) {
      return { valid: false, error: 'Secret must be at least 32 characters' };
    }

    return { valid: true };
  }

  /**
   * Check if key is required
   */
  private isRequiredKey(key: string): boolean {
    const requiredKeys = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'SESSION_SECRET'];

    return requiredKeys.includes(key);
  }
}
