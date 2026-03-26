import { Logger } from '@nestjs/common';
import { ClassConstructor } from 'class-transformer';
import { BoundaryValidationOptions, BoundaryValidationService } from '../validation';

export abstract class BaseService {
  protected readonly logger: Logger;

  protected constructor(
    protected readonly boundaryValidation: BoundaryValidationService,
    private readonly serviceName: string,
  ) {
    this.logger = new Logger(serviceName);
  }

  protected async validateInput<T extends object>(
    dtoClass: ClassConstructor<T>,
    payload: unknown,
    operation: string,
    options?: BoundaryValidationOptions,
  ): Promise<T> {
    return this.boundaryValidation.validateAndTransform(dtoClass, payload, {
      ...options,
      context: `${this.serviceName}.${operation}`,
    });
  }

  protected mapOutput<T extends object>(dtoClass: ClassConstructor<T>, payload: unknown): T {
    return this.boundaryValidation.transform(dtoClass, payload);
  }

  protected mapOutputArray<T extends object>(dtoClass: ClassConstructor<T>, payload: unknown[]): T[] {
    return this.boundaryValidation.transformArray(dtoClass, payload);
  }

  protected async executeWithLogging<T>(operation: string, task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`${operation} failed: ${message}`, stack);
      throw error;
    }
  }
}
