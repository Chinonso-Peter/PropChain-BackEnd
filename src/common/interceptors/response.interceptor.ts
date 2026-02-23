import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { StructuredLoggerService } from '../logging/logger.service';

export interface Response<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data?: T;
  timestamp: string;
  path: string;
  method: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  constructor(private readonly loggerService: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const request = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();
    const userId = (request as any).user?.id;

    return next.handle().pipe(
      map(data => {
        const duration = Date.now() - startTime;
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;
        this.loggerService.logResponse(request.method, request.url, statusCode, duration, {
          userId,
        });

        // Determine message based on status code
        let message = 'Success';
        if (statusCode >= 200 && statusCode < 300) {
          message = this.getSuccessMessage(request.method);
        }

        return {
          success: true,
          statusCode,
          message,
          data,
          timestamp: new Date().toISOString(),
          path: request.url,
          method: request.method,
        };
      }),
    );
  }

  private getSuccessMessage(method: string): string {
    const messages: Record<string, string> = {
      GET: 'Resource retrieved successfully',
      POST: 'Resource created successfully',
      PUT: 'Resource updated successfully',
      PATCH: 'Resource updated successfully',
      DELETE: 'Resource deleted successfully',
    };

    return messages[method] || 'Operation completed successfully';
  }
}
