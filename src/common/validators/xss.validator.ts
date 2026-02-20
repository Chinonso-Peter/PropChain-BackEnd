import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import xss from 'xss';

/**
 * Custom validator constraint for XSS protection
 */
@ValidatorConstraint({ async: false })
export class XssValidatorConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    if (typeof value !== 'string') {
      return true; // Only validate strings
    }

    // Check if sanitized value differs from original (indicating potential XSS)
    const sanitized = xss(value);
    return sanitized === value;
  }

  defaultMessage() {
    return 'The input contains potentially malicious content (XSS)';
  }
}

/**
 * Decorator to validate and sanitize input against XSS attacks
 */
export function IsXssSafe(validationOptions?: ValidationOptions) {
  return function (object: Record<string, any>, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: XssValidatorConstraint,
    });
  };
}

/**
 * Function to sanitize input against XSS
 */
export function sanitizeXss(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  return xss(input);
}

/**
 * Function to sanitize an object against XSS
 */
export function sanitizeObjectXss(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeXss(obj);
  }

  if (typeof obj === 'object') {
    const sanitized: any = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeObjectXss(obj[key]);
      }
    }

    return sanitized;
  }

  return obj;
}
