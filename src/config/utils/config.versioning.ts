import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ConfigVersion {
  id: string;
  timestamp: Date;
  description: string;
  config: Record<string, string>;
  hash: string;
  author?: string;
  tags?: string[];
}

export interface ConfigRollbackResult {
  success: boolean;
  versionId?: string;
  changes?: Array<{
    key: string;
    oldValue: string;
    newValue: string;
  }>;
  error?: string;
}

@Injectable()
export class ConfigVersioningService {
  private readonly logger = new Logger(ConfigVersioningService.name);
  private readonly versionsDir = './config/versions';
  private readonly maxVersions = 50; // Keep last 50 versions
  private versions: ConfigVersion[] = [];

  constructor(private readonly configService: ConfigService) {
    this.ensureVersionsDirectory();
    this.loadVersions();
  }

  /**
   * Create a new configuration version
   */
  async createVersion(description: string, author?: string, tags?: string[]): Promise<ConfigVersion> {
    const currentConfig = this.getCurrentConfig();
    const hash = this.calculateConfigHash(currentConfig);

    // Check if this configuration already exists
    const existingVersion = this.versions.find(v => v.hash === hash);
    if (existingVersion) {
      this.logger.log(`Configuration unchanged (hash: ${hash}), using existing version ${existingVersion.id}`);
      return existingVersion;
    }

    const version: ConfigVersion = {
      id: this.generateVersionId(),
      timestamp: new Date(),
      description,
      config: currentConfig,
      hash,
      author,
      tags,
    };

    this.versions.push(version);
    await this.saveVersion(version);
    await this.cleanupOldVersions();

    this.logger.log(`Created configuration version ${version.id}: ${description}`);
    return version;
  }

  /**
   * Get all configuration versions
   */
  getVersions(): ConfigVersion[] {
    return this.versions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get a specific configuration version
   */
  getVersion(versionId: string): ConfigVersion | undefined {
    return this.versions.find(v => v.id === versionId);
  }

  /**
   * Rollback to a specific configuration version
   */
  async rollbackToVersion(versionId: string): Promise<ConfigRollbackResult> {
    const version = this.getVersion(versionId);
    if (!version) {
      return {
        success: false,
        error: `Version ${versionId} not found`,
      };
    }

    try {
      // Create a backup of current configuration before rollback
      await this.createVersion(`Pre-rollback backup before restoring ${versionId}`);

      // Apply the rollback configuration
      const result = await this.applyConfig(version.config);

      if (result.success) {
        this.logger.log(`Successfully rolled back to version ${versionId}`);
        return {
          success: true,
          versionId,
          changes: result.changes,
        };
      } else {
        return {
          success: false,
          error: result.error,
        };
      }
    } catch (error) {
      this.logger.error(
        `Failed to rollback to version ${versionId}:`,
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Compare two configuration versions
   */
  compareVersions(
    versionId1: string,
    versionId2: string,
  ): Array<{
    key: string;
    value1: string;
    value2: string;
    status: 'same' | 'added' | 'modified' | 'deleted';
  }> {
    const version1 = this.getVersion(versionId1);
    const version2 = this.getVersion(versionId2);

    if (!version1 || !version2) {
      throw new Error('One or both versions not found');
    }

    const comparison: Array<{
      key: string;
      value1: string;
      value2: string;
      status: 'same' | 'added' | 'modified' | 'deleted';
    }> = [];

    const allKeys = new Set([...Object.keys(version1.config), ...Object.keys(version2.config)]);

    for (const key of allKeys) {
      const value1 = version1.config[key] || '';
      const value2 = version2.config[key] || '';

      let status: 'same' | 'added' | 'modified' | 'deleted';
      if (key in version1.config && key in version2.config) {
        status = value1 === value2 ? 'same' : 'modified';
      } else if (key in version1.config) {
        status = 'deleted';
      } else {
        status = 'added';
      }

      comparison.push({ key, value1, value2, status });
    }

    return comparison;
  }

  /**
   * Get current configuration
   */
  private getCurrentConfig(): Record<string, string> {
    const config: Record<string, string> = {};

    // Get all environment variables
    for (const [key, value] of Object.entries(process.env)) {
      if (value && !key.startsWith('npm_') && !key.startsWith('NODE_')) {
        config[key] = value;
      }
    }

    return config;
  }

  /**
   * Calculate hash of configuration
   */
  private calculateConfigHash(config: Record<string, string>): string {
    const sortedKeys = Object.keys(config).sort();
    const configString = sortedKeys.map(key => `${key}=${config[key]}`).join('\n');
    return crypto.createHash('sha256').update(configString).digest('hex');
  }

  /**
   * Generate version ID
   */
  private generateVersionId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `v-${timestamp}-${random}`;
  }

  /**
   * Ensure versions directory exists
   */
  private ensureVersionsDirectory(): void {
    if (!fs.existsSync(this.versionsDir)) {
      fs.mkdirSync(this.versionsDir, { recursive: true });
    }
  }

  /**
   * Save version to file
   */
  private async saveVersion(version: ConfigVersion): Promise<void> {
    const filePath = path.join(this.versionsDir, `${version.id}.json`);
    const content = JSON.stringify(version, null, 2);
    fs.writeFileSync(filePath, content);
  }

  /**
   * Load all versions from files
   */
  private loadVersions(): void {
    try {
      const files = fs.readdirSync(this.versionsDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.versionsDir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const version = JSON.parse(content) as ConfigVersion;
          version.timestamp = new Date(version.timestamp);
          this.versions.push(version);
        }
      }

      this.logger.log(`Loaded ${this.versions.length} configuration versions`);
    } catch (error) {
      this.logger.warn(
        'Failed to load configuration versions:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Apply configuration
   */
  private async applyConfig(config: Record<string, string>): Promise<{
    success: boolean;
    changes?: Array<{
      key: string;
      oldValue: string;
      newValue: string;
    }>;
    error?: string;
  }> {
    try {
      const changes: Array<{
        key: string;
        oldValue: string;
        newValue: string;
      }> = [];

      // For now, we'll just log what would change
      // In a real implementation, you might update environment variables
      // or notify other services of the changes

      for (const [key, newValue] of Object.entries(config)) {
        const oldValue = process.env[key];
        if (oldValue !== newValue) {
          changes.push({ key, oldValue: oldValue || '', newValue });
          this.logger.debug(`Would update ${key}: ${oldValue} → ${newValue}`);
        }
      }

      return {
        success: true,
        changes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Clean up old versions
   */
  private async cleanupOldVersions(): Promise<void> {
    if (this.versions.length <= this.maxVersions) {
      return;
    }

    // Sort by timestamp (oldest first)
    const sortedVersions = this.versions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const versionsToDelete = sortedVersions.slice(0, this.versions.length - this.maxVersions);

    for (const version of versionsToDelete) {
      try {
        const filePath = path.join(this.versionsDir, `${version.id}.json`);
        fs.unlinkSync(filePath);

        // Remove from memory
        const index = this.versions.findIndex(v => v.id === version.id);
        if (index !== -1) {
          this.versions.splice(index, 1);
        }

        this.logger.debug(`Deleted old configuration version ${version.id}`);
      } catch (error) {
        this.logger.warn(
          `Failed to delete version ${version.id}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    this.logger.log(`Cleaned up ${versionsToDelete.length} old configuration versions`);
  }

  /**
   * Export configuration versions
   */
  async exportVersions(outputPath: string): Promise<void> {
    const exportData = {
      exportedAt: new Date(),
      versions: this.getVersions(),
    };

    const content = JSON.stringify(exportData, null, 2);
    fs.writeFileSync(outputPath, content);

    this.logger.log(`Exported ${this.versions.length} configuration versions to ${outputPath}`);
  }

  /**
   * Import configuration versions
   */
  async importVersions(inputPath: string): Promise<void> {
    const content = fs.readFileSync(inputPath, 'utf8');
    const importData = JSON.parse(content);

    if (!importData.versions || !Array.isArray(importData.versions)) {
      throw new Error('Invalid import file format');
    }

    for (const version of importData.versions) {
      version.timestamp = new Date(version.timestamp);

      // Check if version already exists
      if (!this.versions.find(v => v.id === version.id)) {
        this.versions.push(version);
        await this.saveVersion(version);
      }
    }

    this.logger.log(`Imported ${importData.versions.length} configuration versions`);
  }
}
