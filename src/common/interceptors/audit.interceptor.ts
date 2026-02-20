import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { AuditService, AuditOperation } from '../services/audit.service';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface AuditMetadata {
  enabled?: boolean;
  excludeFields?: string[];
  tableName?: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const handler = context.getHandler();
    const parentClass = context.getClass();

    // Get audit metadata from decorators
    const auditMetadata: AuditMetadata = this.reflector.get<AuditMetadata>(
      'audit',
      handler,
    ) || this.reflector.get<AuditMetadata>('audit', parentClass);

    // Skip audit if disabled
    if (auditMetadata?.enabled === false) {
      return next.handle();
    }

    const startTime = Date.now();
    const originalBody = { ...request.body };
    const originalParams = { ...request.params };
    const originalQuery = { ...request.query };

    // Process the request first
    return next.handle().pipe(
      tap({
        next: async (result) => {
          try {
            const duration = Date.now() - startTime;
            
            // Determine operation type based on HTTP method
            const method = request.method;
            const operation = this.getOperationFromMethod(method);
            
            if (operation === AuditOperation.READ) {
              // For read operations, we might want to log differently
              return;
            }

            // Get user info if available
            const userId = request.user?.id || null;

            // Determine table name from route or metadata
            let tableName = auditMetadata?.tableName;
            if (!tableName) {
              tableName = this.extractTableNameFromRoute(request.route?.path);
            }

            // Log the operation
            if (tableName && operation) {
              const auditData = this.prepareAuditData(
                operation,
                tableName,
                originalBody,
                result,
                auditMetadata?.excludeFields || [],
                userId,
              );

              await this.auditService.logAction({
                tableName,
                operation,
                oldData: auditData.oldData,
                newData: auditData.newData,
                userId,
              });
            }
          } catch (error) {
            this.logger.error('Failed to log audit trail:', error);
          }
        },
        error: async (error) => {
          try {
            const method = request.method;
            const userId = request.user?.id || null;
            const tableName = this.extractTableNameFromRoute(request.route?.path);

            // Log failed operations
            await this.auditService.logAction({
              tableName: tableName || 'unknown',
              operation: AuditOperation.UPDATE, // Use UPDATE as default for errors
              newData: {
                action: 'FAILED_OPERATION',
                method,
                error: error.message,
                url: request.url,
              },
              userId,
            });
          } catch (auditError) {
            this.logger.error('Failed to log audit trail for error:', auditError);
          }
        },
      }),
    );
  }

  /**
   * Map HTTP method to audit operation
   */
  private getOperationFromMethod(method: string): AuditOperation {
    switch (method.toUpperCase()) {
      case 'POST':
        return AuditOperation.CREATE;
      case 'PUT':
      case 'PATCH':
        return AuditOperation.UPDATE;
      case 'DELETE':
        return AuditOperation.DELETE;
      case 'GET':
        return AuditOperation.READ;
      default:
        return AuditOperation.UPDATE; // Default fallback
    }
  }

  /**
   * Extract table name from route path
   */
  private extractTableNameFromRoute(routePath?: string): string {
    if (!routePath) {
      return 'unknown';
    }

    // Extract entity name from route (e.g., /api/users/:id -> users)
    const parts = routePath.split('/');
    // Look for the first non-parameter segment after /api or similar prefixes
    const relevantParts = parts.filter(part => 
      part && !part.startsWith(':') && part !== 'api' && part !== 'v1'
    );

    if (relevantParts.length > 0) {
      // Take the first relevant part and pluralize if needed
      return relevantParts[0].toLowerCase();
    }

    return 'unknown';
  }

  /**
   * Prepare audit data based on operation type
   */
  private prepareAuditData(
    operation: AuditOperation,
    tableName: string,
    originalData: any,
    resultData: any,
    excludeFields: string[],
    userId: string | null,
  ): { oldData?: any; newData?: any } {
    let oldData: any;
    let newData: any;

    switch (operation) {
      case AuditOperation.CREATE:
        newData = this.filterSensitiveData(resultData, excludeFields);
        break;

      case AuditOperation.UPDATE:
        // For updates, we need to get the old data if possible
        oldData = this.filterSensitiveData(originalData, excludeFields);
        newData = this.filterSensitiveData(resultData, excludeFields);
        break;

      case AuditOperation.DELETE:
        oldData = this.filterSensitiveData(originalData, excludeFields);
        break;

      case AuditOperation.READ:
        newData = this.filterSensitiveData(resultData, excludeFields);
        break;

      default:
        newData = this.filterSensitiveData(resultData, excludeFields);
        break;
    }

    return { oldData, newData };
  }

  /**
   * Filter out sensitive data from audit logs
   */
  private filterSensitiveData(data: any, excludeFields: string[]): any {
    if (!data) return data;

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.filterSensitiveData(item, excludeFields));
    }

    // Handle objects
    if (typeof data === 'object') {
      const filtered: any = {};
      
      for (const [key, value] of Object.entries(data)) {
        // Skip excluded fields
        if (excludeFields.includes(key)) {
          continue;
        }

        // Skip sensitive fields
        if (this.isSensitiveField(key)) {
          filtered[key] = '[REDACTED]';
          continue;
        }

        // Recursively filter nested objects
        filtered[key] = this.filterSensitiveData(value, excludeFields);
      }

      return filtered;
    }

    return data;
  }

  /**
   * Check if a field is sensitive and should be redacted
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'apiKey',
      'privateKey',
      'encrypted',
      'salt',
      'hash',
      'cvv',
      'cardNumber',
      'ssn',
      'socialSecurity',
      'pin',
      'verificationCode',
      'otp',
      'twoFactorSecret',
    ];

    const lowerFieldName = fieldName.toLowerCase();
    return sensitiveFields.some(sensitive => 
      lowerFieldName.includes(sensitive)
    );
  }
}