import { Test, TestingModule } from '@nestjs/testing';
import { AppExceptionFilter } from '../../../src/common/errors/error.filter';
import { ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from '../../../src/common/logging/logger.service';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { ErrorCode } from '../../../src/common/errors/error.codes';
import { I18nService } from 'nestjs-i18n';

describe('AppExceptionFilter', () => {
  let filter: AppExceptionFilter;
  let configService: ConfigService;
  let loggerService: StructuredLoggerService;

  const mockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  };

  const mockRequest = {
    url: '/test',
    method: 'GET',
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    headers: {},
  };

  const mockArgumentsHost = {
    switchToHttp: jest.fn().mockReturnThis(),
    getResponse: jest.fn().mockReturnValue(mockResponse),
    getRequest: jest.fn().mockReturnValue(mockRequest),
  } as unknown as ArgumentsHost;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppExceptionFilter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
              if (key === 'NODE_ENV') {
                return 'development';
              }
              return defaultValue;
            }),
          },
        },
        {
          provide: StructuredLoggerService,
          useValue: {
            error: jest.fn(),
            warn: jest.fn(),
          },
        },
        {
          provide: I18nService,
          useValue: {
            translate: jest.fn().mockImplementation((key) => {
              if (key === `errors.${ErrorCode.VALIDATION_ERROR}`) {
                return 'The provided data is invalid';
              }
              return key;
            }),
          },
        },
      ],
    }).compile();

    filter = module.get<AppExceptionFilter>(AppExceptionFilter);
    configService = module.get<ConfigService>(ConfigService);
    loggerService = module.get<StructuredLoggerService>(StructuredLoggerService);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should format HttpException correctly', () => {
    const status = HttpStatus.BAD_REQUEST;
    const message = 'Bad Request';
    const exception = new HttpException(message, status);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(status);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: status,
        message,
        path: mockRequest.url,
        requestId: expect.any(String),
        correlationId: expect.any(String),
        error: expect.objectContaining({
          code: ErrorCode.BAD_REQUEST,
        }),
      }),
    );
  });

  it('should format validation errors (array message) correctly', () => {
    const status = HttpStatus.BAD_REQUEST;
    const validationErrors = ['email must be an email'];
    const exception = new HttpException({ message: validationErrors }, status);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(status);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: status,
        message: 'The provided data is invalid',
        error: expect.objectContaining({
          code: ErrorCode.VALIDATION_ERROR,
          details: validationErrors,
        }),
      }),
    );
  });

  it('should format unknown exceptions as internal server error', () => {
    const exception = new Error('Unknown error');

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred. Please try again later',
        error: expect.objectContaining({
          code: ErrorCode.INTERNAL_SERVER_ERROR,
        }),
      }),
    );
    expect(loggerService.error).toHaveBeenCalled();
  });

  it('should preserve correlation id and redact internal details in production', () => {
    jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: unknown) => {
      if (key === 'NODE_ENV') {
        return 'production';
      }
      return defaultValue;
    });

    const productionRequest = {
      ...mockRequest,
      headers: {
        'x-correlation-id': 'corr-123',
      },
    };
    (mockArgumentsHost.getRequest as jest.Mock).mockReturnValueOnce(productionRequest);

    filter.catch(new Error('database password leaked'), mockArgumentsHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: 'corr-123',
        error: expect.objectContaining({
          code: ErrorCode.INTERNAL_SERVER_ERROR,
          details: undefined,
        }),
      }),
    );
  });
});
