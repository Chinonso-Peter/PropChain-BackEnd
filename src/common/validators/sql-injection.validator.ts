import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Common SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
  /(;|\-\-|\#|\/\*|\*\/)/g,
  /(\b(OR|AND)\b\s*\d+\s*[=<>]\s*\d+)/gi,
  /(=\s*'?\d+'\s*(OR|AND))/gi,
  /('|--|#|\/\*|\*\/)/g,
  /\b(OR|AND)\b\s+1\s*=\s*1/gi,
  /\b(OR|AND)\b\s+'1'\s*=\s*'1'/gi,
];

/**
 * Custom validator constraint for SQL injection prevention
 */
@ValidatorConstraint({ async: false })
export class SqlInjectionValidatorConstraint implements ValidatorConstraintInterface {
  validate(value: any) {
    if (typeof value !== 'string') {
      return true; // Only validate strings
    }

    // Check against known SQL injection patterns
    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(value)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage() {
    return 'The input contains potentially malicious SQL injection content';
  }
}

/**
 * Decorator to validate input against SQL injection
 */
export function IsNotSqlInjection(validationOptions?: ValidationOptions) {
  return function (object: Record<string, any>, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: SqlInjectionValidatorConstraint,
    });
  };
}

/**
 * Function to check if a string contains potential SQL injection patterns
 */
export function containsSqlInjection(input: string): boolean {
  if (typeof input !== 'string') {
    return false;
  }

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }

  return false;
}

/**
 * Function to sanitize input against SQL injection
 */
export function sanitizeSqlInjection(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }

  let sanitized = input;

  // Remove potentially dangerous SQL keywords and characters
  sanitized = sanitized.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi, '');
  sanitized = sanitized.replace(/(;|\-\-|\#|\/\*|\*\/)/g, '');
  sanitized = sanitized.replace(/(\b(OR|AND)\b\s*\d+\s*[=<>]\s*\d+)/gi, '');
  sanitized = sanitized.replace(/('|--|#|\/\*|\*\/)/g, '');

  return sanitized.trim();
}

/**
 * Function to sanitize an object against SQL injection
 */
export function sanitizeObjectSqlInjection(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeSqlInjection(obj);
  }

  if (typeof obj === 'object') {
    const sanitized: any = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeObjectSqlInjection(obj[key]);
      }
    }

    return sanitized;
  }

  return obj;
}
