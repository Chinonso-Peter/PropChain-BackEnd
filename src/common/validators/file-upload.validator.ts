import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { HttpStatus } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { fileTypeFromBuffer } from 'file-type';

// Common file types for documents and images
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/tiff',
  'image/bmp',
  'image/x-icon',

  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/json',
  'application/xml',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-7z-compressed',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Custom validator constraint for file upload validation
 */
@ValidatorConstraint({ async: true })
export class FileUploadValidatorConstraint implements ValidatorConstraintInterface {
  async validate(file: Express.Multer.File) {
    if (!file) {
      return false;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return false;
    }

    // Check MIME type
    const detectedType = await fileTypeFromBuffer(file.buffer);
    if (!detectedType || !ALLOWED_MIME_TYPES.includes(detectedType.mime)) {
      return false;
    }

    // Check file extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    const validExtensions = this.getAllowedExtensions();
    if (!validExtensions.some(ext => ext === fileExtension)) {
      return false;
    }

    // Additional security checks for potential malicious content
    if (await this.containsMaliciousContent(file.buffer)) {
      return false;
    }

    return true;
  }

  private getAllowedExtensions(): string[] {
    const extensionsMap: { [key: string]: string[] } = {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif'],
      'image/svg+xml': ['.svg'],
      'image/tiff': ['.tiff', '.tif'],
      'image/bmp': ['.bmp'],
      'image/x-icon': ['.ico'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'application/json': ['.json'],
      'application/xml': ['.xml'],
      'application/zip': ['.zip'],
      'application/x-rar-compressed': ['.rar'],
      'application/x-tar': ['.tar'],
      'application/gzip': ['.gz'],
      'application/x-7z-compressed': ['.7z'],
    };

    const extensions: string[] = [];
    ALLOWED_MIME_TYPES.forEach(mimeType => {
      if (extensionsMap[mimeType]) {
        extensions.push(...extensionsMap[mimeType]);
      }
    });

    return extensions;
  }

  private async containsMaliciousContent(buffer: Buffer): Promise<boolean> {
    // Check for common malicious patterns in the file content
    const maliciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // JavaScript in HTML
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, // iframe in HTML
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, // object in HTML
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, // embed in HTML
      /<link[^>]+rel=["']stylesheet["'][^>]*href=["']javascript:/gi, // JS in link href
      /<meta[^>]+http-equiv=["']refresh["'][^>]*content=["']\d+;url=javascript:/gi, // JS in meta refresh
      /vbscript:/gi, // VBScript protocol
      /javascript:/gi, // JavaScript protocol
      /data:text\/html/gi, // Data URI with HTML
      /eval\s*\(/gi, // eval function
      /expression\s*\(/gi, // expression function (IE)
      /onload\s*=/gi, // onload event
      /onerror\s*=/gi, // onerror event
      /onclick\s*=/gi, // onclick event
      /onmouseover\s*=/gi, // onmouseover event
      /onfocus\s*=/gi, // onfocus event
      /onblur\s*=/gi, // onblur event
    ];

    const content = buffer.toString('utf-8').toLowerCase();

    for (const pattern of maliciousPatterns) {
      if (pattern.test(content)) {
        return true;
      }
    }

    return false;
  }

  defaultMessage() {
    return 'File upload validation failed: invalid file type, size, or contains malicious content';
  }
}

/**
 * Decorator to validate uploaded files
 */
export function IsValidFileUpload(validationOptions?: ValidationOptions) {
  return function (object: Record<string, any>, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: FileUploadValidatorConstraint,
    });
  };
}

/**
 * Function to validate file upload with custom parameters
 */
export async function validateFileUpload(
  file: Express.Multer.File,
  allowedMimeTypes: string[] = ALLOWED_MIME_TYPES,
  maxSize: number = MAX_FILE_SIZE,
): Promise<{ isValid: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!file) {
    errors.push('File is required');
    return { isValid: false, errors };
  }

  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)} MB`);
  }

  // Check MIME type
  const detectedType = await fileTypeFromBuffer(file.buffer);
  if (!detectedType || !allowedMimeTypes.includes(detectedType.mime)) {
    errors.push(`File type ${detectedType?.mime || 'unknown'} is not allowed`);
  }

  // Check file extension
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const validExtensions = getAllowedExtensionsForMimeTypes(allowedMimeTypes);
  if (!validExtensions.some(ext => ext === fileExtension)) {
    errors.push(`File extension ${fileExtension} is not allowed`);
  }

  // Additional security checks for potential malicious content
  if (await containsMaliciousContent(file.buffer)) {
    errors.push('File contains potentially malicious content');
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Helper function to get allowed extensions for given mime types
 */
function getAllowedExtensionsForMimeTypes(allowedMimeTypes: string[]): string[] {
  const extensionsMap: { [key: string]: string[] } = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    'image/gif': ['.gif'],
    'image/svg+xml': ['.svg'],
    'image/tiff': ['.tiff', '.tif'],
    'image/bmp': ['.bmp'],
    'image/x-icon': ['.ico'],
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.ms-excel': ['.xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'application/vnd.ms-powerpoint': ['.ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
    'text/plain': ['.txt'],
    'text/csv': ['.csv'],
    'application/json': ['.json'],
    'application/xml': ['.xml'],
    'application/zip': ['.zip'],
    'application/x-rar-compressed': ['.rar'],
    'application/x-tar': ['.tar'],
    'application/gzip': ['.gz'],
    'application/x-7z-compressed': ['.7z'],
  };

  const extensions: string[] = [];
  allowedMimeTypes.forEach(mimeType => {
    if (extensionsMap[mimeType]) {
      extensions.push(...extensionsMap[mimeType]);
    }
  });

  return extensions;
}

/**
 * Helper function to check for malicious content in buffer
 */
async function containsMaliciousContent(buffer: Buffer): Promise<boolean> {
  // Check for common malicious patterns in the file content
  const maliciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // JavaScript in HTML
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, // iframe in HTML
    /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, // object in HTML
    /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, // embed in HTML
    /<link[^>]+rel=["']stylesheet["'][^>]*href=["']javascript:/gi, // JS in link href
    /<meta[^>]+http-equiv=["']refresh["'][^>]*content=["']\d+;url=javascript:/gi, // JS in meta refresh
    /vbscript:/gi, // VBScript protocol
    /javascript:/gi, // JavaScript protocol
    /data:text\/html/gi, // Data URI with HTML
    /eval\s*\(/gi, // eval function
    /expression\s*\(/gi, // expression function (IE)
    /onload\s*=/gi, // onload event
    /onerror\s*=/gi, // onerror event
    /onclick\s*=/gi, // onclick event
    /onmouseover\s*=/gi, // onmouseover event
    /onfocus\s*=/gi, // onfocus event
    /onblur\s*=/gi, // onblur event
  ];

  const content = buffer.toString('utf-8').toLowerCase();

  for (const pattern of maliciousPatterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * Get file type information
 */
export async function getFileTypeInfo(
  buffer: Buffer,
): Promise<{ mimeType: string; extension: string; isValid: boolean }> {
  const detectedType = await fileTypeFromBuffer(buffer);

  if (!detectedType) {
    return { mimeType: 'unknown', extension: '', isValid: false };
  }

  return {
    mimeType: detectedType.mime,
    extension: `.${detectedType.ext}`,
    isValid: ALLOWED_MIME_TYPES.includes(detectedType.mime),
  };
}
