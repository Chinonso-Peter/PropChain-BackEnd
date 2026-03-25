import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { FileValidationService } from '../../src/security/services/file-validation.service';

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileValidationService],
    }).compile();

    service = module.get<FileValidationService>(FileValidationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateFile', () => {
    it('should reject empty files', () => {
      const emptyBuffer = Buffer.alloc(0);
      const result = service.validateFile(emptyBuffer);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Empty file'));
    });

    it('should detect JPEG image using magic numbers', () => {
      // JPEG magic bytes: FFD8FF
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);
      const result = service.validateFile(jpegBuffer, 'image/jpeg');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toEqual({ ext: 'jpg', mime: 'image/jpeg' });
      expect(result.checksum).toBeDefined();
    });

    it('should detect PNG image using magic numbers', () => {
      // PNG magic bytes: 89504E470D0A1A0A
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        ...Array(100).fill(0),
      ]);
      const result = service.validateFile(pngBuffer, 'image/png');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toEqual({ ext: 'png', mime: 'image/png' });
    });

    it('should detect PDF document using magic numbers', () => {
      // PDF magic bytes: 255044462D (starts with %PDF-)
      const pdfBuffer = Buffer.from([
        0x25, 0x50, 0x44, 0x46, 0x2D,
        ...Array(100).fill(0),
      ]);
      const result = service.validateFile(pdfBuffer, 'application/pdf');
      
      expect(result.isValid).toBe(true);
      expect(result.fileType).toEqual({ ext: 'pdf', mime: 'application/pdf' });
    });

    it('should detect MIME type mismatch', () => {
      // Create JPEG buffer but claim it's PNG
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(100).fill(0)]);
      const result = service.validateFile(jpegBuffer, 'image/png');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining('MIME type mismatch'),
      );
    });

    it('should calculate checksum correctly', () => {
      const buffer = Buffer.from('test content');
      const result = service.validateFile(buffer);
      
      expect(result.checksum).toBeDefined();
      expect(result.checksum!.length).toBe(64); // SHA-256 produces 64 hex chars
    });
  });

  describe('validateFilename', () => {
    it('should accept valid filenames', () => {
      expect(() => service.validateFilename('document.pdf')).not.toThrow();
      expect(() => service.validateFilename('image.jpg')).not.toThrow();
    });

    it('should reject path traversal attempts', () => {
      expect(() => service.validateFilename('../etc/passwd')).toThrow(BadRequestException);
      expect(() => service.validateFilename('..\\..\\windows\\system32')).toThrow(BadRequestException);
      expect(() => service.validateFilename('/etc/shadow')).toThrow(BadRequestException);
    });

    it('should reject dangerous file extensions', () => {
      expect(() => service.validateFilename('malware.exe')).toThrow(BadRequestException);
      expect(() => service.validateFilename('script.bat')).toThrow(BadRequestException);
      expect(() => service.validateFilename('hack.php')).toThrow(BadRequestException);
    });

    it('should reject filenames with null bytes', () => {
      expect(() => service.validateFilename('file\0.txt')).toThrow(BadRequestException);
    });

    it('should reject very long filenames', () => {
      const longName = 'a'.repeat(256) + '.txt';
      expect(() => service.validateFilename(longName)).toThrow(BadRequestException);
    });
  });

  describe('isDangerousExtension', () => {
    it('should identify dangerous extensions', () => {
      expect(service.isDangerousExtension('file.exe')).toBe(true);
      expect(service.isDangerousExtension('script.php')).toBe(true);
      expect(service.isDangerousExtension('hack.asp')).toBe(true);
    });

    it('should allow safe extensions', () => {
      expect(service.isDangerousExtension('document.pdf')).toBe(false);
      expect(service.isDangerousExtension('image.jpg')).toBe(false);
      expect(service.isDangerousExtension('file.txt')).toBe(false);
    });
  });

  describe('getSupportedMimeTypes', () => {
    it('should return all supported MIME types for "all" category', () => {
      const mimeTypes = service.getSupportedMimeTypes('all');
      expect(mimeTypes.length).toBeGreaterThan(10);
      expect(mimeTypes).toContain('image/jpeg');
      expect(mimeTypes).toContain('application/pdf');
    });

    it('should return image MIME types', () => {
      const mimeTypes = service.getSupportedMimeTypes('image');
      expect(mimeTypes).toContain('image/jpeg');
      expect(mimeTypes).toContain('image/png');
    });

    it('should return document MIME types', () => {
      const mimeTypes = service.getSupportedMimeTypes('document');
      expect(mimeTypes).toContain('application/pdf');
    });
  });

  describe('isMimeTypeAllowed', () => {
    it('should allow exact MIME type matches', () => {
      const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
      expect(service.isMimeTypeAllowed('image/jpeg', allowed)).toBe(true);
      expect(service.isMimeTypeAllowed('application/pdf', allowed)).toBe(true);
    });

    it('should reject non-matching MIME types', () => {
      const allowed = ['image/jpeg', 'image/png'];
      expect(service.isMimeTypeAllowed('application/pdf', allowed)).toBe(false);
    });

    it('should support wildcard matching', () => {
      const allowed = ['image/*', 'application/pdf'];
      expect(service.isMimeTypeAllowed('image/gif', allowed)).toBe(true);
      expect(service.isMimeTypeAllowed('image/png', allowed)).toBe(true);
      expect(service.isMimeTypeAllowed('application/pdf', allowed)).toBe(true);
    });
  });
});
