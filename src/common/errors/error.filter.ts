import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { ErrorResponseDto } from './error.dto';
import { ErrorCode, ErrorMessages } from './error.codes';
import { AppException } from './exceptions';
import { StructuredLoggerService } from '../logging/logger.service';
import { getCorrelationId } from '../logging/correlation-id';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: StructuredLoggerService,
    private readonly i18n: I18nService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.getRequestId(request);
    const correlationId = this.getCorrelationId(request, requestId);

    const errorResponse =
      exception instanceof HttpException
        ? this.handleHttpException(exception, request, requestId, correlationId)
        : this.handleUnknownException(exception, request, requestId, correlationId);

    response.setHeader('x-request-id', requestId);
    response.setHeader('x-correlation-id', correlationId);

    this.logException(exception, request, errorResponse);

    response.status(errorResponse.statusCode).json(errorResponse);
  }

  private handleHttpException(
    exception: HttpException,
    request: Request,
    requestId: string,
    correlationId: string,
  ): ErrorResponseDto {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const lang = I18nContext.current()?.lang || request.headers['accept-language'] || 'en';

    let errorCode = this.mapStatusToErrorCode(status);
    let message = this.resolveMessage(errorCode, lang);
    let details: string[] | undefined;

    if (exception instanceof AppException) {
      errorCode = exception.code || errorCode;
      message = exception.message;
      details = exception.fieldErrors?.map(fieldError => `${fieldError.field}: ${fieldError.message}`);
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as Record<string, unknown>;

      if (Array.isArray(responseObj.message)) {
        errorCode = ErrorCode.VALIDATION_ERROR;
        message = this.resolveMessage(errorCode, lang);
        details = this.normalizeDetails(responseObj.message);
      } else {
        const responseCode = responseObj.errorCode || responseObj.code;
        errorCode = typeof responseCode === 'string' ? (responseCode as ErrorCode) : errorCode;
        message =
          typeof responseObj.message === 'string' && responseObj.message.length > 0
            ? responseObj.message
            : this.resolveMessage(errorCode, lang);
        details = this.normalizeDetails(responseObj.details);
      }
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    }

    return new ErrorResponseDto({
      statusCode: status,
      message,
      path: request.url,
      requestId,
      correlationId,
      error: {
        code: errorCode,
        details,
      },
    });
  }

  private handleUnknownException(
    exception: unknown,
    request: Request,
    requestId: string,
    correlationId: string,
  ): ErrorResponseDto {
    const mappedError = this.mapUnknownException(exception);
    const lang = I18nContext.current()?.lang || request.headers['accept-language'] || 'en';
    const safeMessage =
      mappedError.status >= HttpStatus.INTERNAL_SERVER_ERROR && !this.shouldExposeInternalDetails()
        ? this.resolveMessage(mappedError.errorCode, lang)
        : mappedError.message;

    return new ErrorResponseDto({
      statusCode: mappedError.status,
      message: safeMessage,
      path: request.url,
      requestId,
      correlationId,
      error: {
        code: mappedError.errorCode,
        details:
          this.shouldExposeInternalDetails() && exception instanceof Error ? [exception.message] : undefined,
      },
    });
  }

  private mapUnknownException(exception: unknown): { status: number; errorCode: ErrorCode; message: string } {
    if (exception instanceof Error) {
      const normalizedMessage = exception.message.toLowerCase();

      if (this.isDatabaseError(exception)) {
        return {
          status: HttpStatus.SERVICE_UNAVAILABLE,
          errorCode: ErrorCode.DATABASE_ERROR,
          message: ErrorMessages[ErrorCode.DATABASE_ERROR],
        };
      }

      if (normalizedMessage.includes('timeout')) {
        return {
          status: HttpStatus.GATEWAY_TIMEOUT,
          errorCode: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: 'Request processing timed out',
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: ErrorCode.INTERNAL_SERVER_ERROR,
      message: ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR],
    };
  }

  private logException(exception: unknown, request: Request, errorResponse: ErrorResponseDto): void {
    const metadata = {
      requestId: errorResponse.requestId,
      correlationId: errorResponse.correlationId,
      path: request.url,
      method: request.method,
      statusCode: errorResponse.statusCode,
      details: errorResponse.error.details,
      userId: (request as any).user?.id,
      ip: request.ip || request.socket?.remoteAddress,
    };

    if (errorResponse.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.loggerService.error(
        `Unhandled error: ${errorResponse.error.code} - ${errorResponse.message}`,
        exception instanceof Error ? exception.stack : undefined,
        metadata,
      );
      return;
    }

    this.loggerService.warn(`Handled client error: ${errorResponse.error.code} - ${errorResponse.message}`, metadata);
  }

  private getRequestId(request: Request): string {
    return (
      (request.headers['x-request-id'] as string) ||
      (request.headers['x-correlation-id'] as string) ||
      (request as any).id ||
      uuidv4()
    );
  }

  private getCorrelationId(request: Request, requestId: string): string {
    return (request.headers['x-correlation-id'] as string) || getCorrelationId() || requestId;
  }

  private normalizeDetails(details: unknown): string[] | undefined {
    if (!details) {
      return undefined;
    }

    if (Array.isArray(details)) {
      return details.map(detail => (typeof detail === 'string' ? detail : JSON.stringify(detail)));
    }

    if (typeof details === 'string') {
      return [details];
    }

    return [JSON.stringify(details)];
  }

  private shouldExposeInternalDetails(): boolean {
    return this.configService.get<string>('NODE_ENV', 'development') !== 'production';
  }

  private resolveMessage(errorCode: ErrorCode, lang: string): string {
    const translatedMessage = this.i18n.translate(`errors.${errorCode}`, { lang }) as string;
    return translatedMessage !== `errors.${errorCode}` ? translatedMessage : ErrorMessages[errorCode];
  }

  private isDatabaseError(exception: Error): boolean {
    const errorName = exception.name.toLowerCase();
    const errorMessage = exception.message.toLowerCase();

    return (
      errorName.includes('prisma') ||
      errorName.includes('typeorm') ||
      errorName.includes('queryfailed') ||
      errorMessage.includes('database') ||
      errorMessage.includes('constraint') ||
      errorMessage.includes('connection')
    );
  }

  private mapStatusToErrorCode(status: HttpStatus): ErrorCode {
    const statusToErrorCode: Record<number, ErrorCode> = {
      [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
      [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
      [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMIT_EXCEEDED,
      [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
      [HttpStatus.INTERNAL_SERVER_ERROR]: ErrorCode.INTERNAL_SERVER_ERROR,
    };

    return statusToErrorCode[status] || ErrorCode.INTERNAL_SERVER_ERROR;
  }
}

export { AllExceptionsFilter as AppExceptionFilter };
