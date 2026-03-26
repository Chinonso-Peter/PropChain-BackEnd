import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ValidationException } from '../errors/custom.exceptions';

export interface BoundaryValidationOptions {
  context?: string;
  skipMissingProperties?: boolean;
  allowUnknownValues?: boolean;
}

@Injectable()
export class BoundaryValidationService {
  private readonly logger = new Logger(BoundaryValidationService.name);

  async validateAndTransform<T extends object>(
    dtoClass: ClassConstructor<T>,
    payload: unknown,
    options: BoundaryValidationOptions = {},
  ): Promise<T> {
    const instance = plainToInstance(dtoClass, payload as object, {
      enableImplicitConversion: true,
      exposeDefaultValues: true,
    });

    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: !options.allowUnknownValues,
      skipMissingProperties: options.skipMissingProperties ?? false,
      validationError: {
        target: false,
        value: false,
      },
    });

    if (errors.length > 0) {
      const details = this.flattenValidationErrors(errors);
      const context = options.context ? ` (${options.context})` : '';
      this.logger.warn(`Boundary validation failed${context}: ${details.join('; ')}`);
      throw new ValidationException(details, options.context ? `${options.context} validation failed` : undefined);
    }

    return instance;
  }

  transform<T extends object>(dtoClass: ClassConstructor<T>, payload: unknown): T {
    return plainToInstance(dtoClass, payload as object, {
      enableImplicitConversion: true,
      exposeUnsetFields: false,
    });
  }

  transformArray<T extends object>(dtoClass: ClassConstructor<T>, payload: unknown[]): T[] {
    return payload.map(item => this.transform(dtoClass, item));
  }

  private flattenValidationErrors(errors: ValidationError[], parentPath?: string, collector: string[] = []): string[] {
    for (const error of errors) {
      const propertyPath = parentPath ? `${parentPath}.${error.property}` : error.property;

      if (error.constraints) {
        for (const message of Object.values(error.constraints)) {
          collector.push(`${propertyPath}: ${message}`);
        }
      }

      if (error.children?.length) {
        this.flattenValidationErrors(error.children, propertyPath, collector);
      }
    }

    return collector;
  }
}
