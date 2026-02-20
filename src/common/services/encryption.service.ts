import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly saltLength = 16; // 128 bits
  
  private readonly encryptionKey: Buffer;

  constructor(private configService: ConfigService) {
    // Get encryption key from environment or generate one
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (!key) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    // Ensure the key is the correct length
    this.encryptionKey = this.normalizeKey(key);
  }

  /**
   * Normalize the encryption key to the required length
   */
  private normalizeKey(key: string): Buffer {
    if (key.length < this.keyLength) {
      // Pad the key if it's too short
      key = key.padEnd(this.keyLength, '0');
    } else if (key.length > this.keyLength) {
      // Truncate the key if it's too long
      key = key.substring(0, this.keyLength);
    }
    
    return Buffer.from(key, 'utf8');
  }

  /**
   * Encrypt data with AES-256-GCM
   */
  encrypt(data: string | Buffer): { encrypted: string; iv: string; authTag: string } {
    try {
      // Generate a random IV for each encryption
      const iv = crypto.randomBytes(this.ivLength);
      
      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      // Encrypt the data
      let dataBuffer: Buffer;
      if (typeof data === 'string') {
        dataBuffer = Buffer.from(data, 'utf8');
      } else {
        dataBuffer = data;
      }
      
      const encrypted = Buffer.concat([
        cipher.update(dataBuffer),
        cipher.final(),
      ]);
      
      // Get the authentication tag
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      };
    } catch (error) {
      this.logger.error(`Encryption failed: ${error.message}`);
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data with AES-256-GCM
   */
  decrypt(encryptedData: { encrypted: string; iv: string; authTag: string }): string {
    try {
      // Convert hex strings back to buffers
      const encryptedBuffer = Buffer.from(encryptedData.encrypted, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      
      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      
      // Set the authentication tag
      decipher.setAuthTag(authTag);
      
      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final(),
      ]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      this.logger.error(`Decryption failed: ${error.message}`);
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash data using SHA-256 with salt
   */
  hashWithSalt(data: string): { hash: string; salt: string } {
    const salt = crypto.randomBytes(this.saltLength).toString('hex');
    const hash = crypto
      .pbkdf2Sync(data, salt, 10000, 64, 'sha256')
      .toString('hex');
    
    return { hash, salt };
  }

  /**
   * Verify hashed data
   */
  verifyHash(data: string, hash: string, salt: string): boolean {
    const computedHash = crypto
      .pbkdf2Sync(data, salt, 10000, 64, 'sha256')
      .toString('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computedHash, 'hex')
    );
  }

  /**
   * Generate a cryptographically secure random string
   */
  generateRandomString(length: number): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').substring(0, length);
  }

  /**
   * Encrypt sensitive fields in an object
   */
  encryptObject<T extends Record<string, any>>(obj: T, fieldsToEncrypt: string[]): T {
    const encryptedObj = { ...obj };
    
    for (const field of fieldsToEncrypt) {
      if (encryptedObj.hasOwnProperty(field) && encryptedObj[field] !== null && encryptedObj[field] !== undefined) {
        const value = encryptedObj[field];
        if (typeof value === 'string' || Buffer.isBuffer(value)) {
          const encrypted = this.encrypt(value);
          // Store as encrypted object
          encryptedObj[field as keyof T] = {
            __encrypted__: true,
            ...encrypted
          } as T[keyof T];
        }
      }
    }
    
    return encryptedObj;
  }

  /**
   * Decrypt sensitive fields in an object
   */
  decryptObject<T extends Record<string, any>>(obj: T, fieldsToDecrypt: string[]): T {
    const decryptedObj = { ...obj };
    
    for (const field of fieldsToDecrypt) {
      if (
        decryptedObj.hasOwnProperty(field) &&
        decryptedObj[field] !== null &&
        typeof decryptedObj[field] === 'object' &&
        (decryptedObj[field] as any).__encrypted__
      ) {
        // Extract encrypted data
        const encryptedData = {
          encrypted: (decryptedObj[field] as any).encrypted,
          iv: (decryptedObj[field] as any).iv,
          authTag: (decryptedObj[field] as any).authTag
        };
        
        // Decrypt the value
        const decryptedValue = this.decrypt(encryptedData);
        decryptedObj[field as keyof T] = decryptedValue as T[keyof T];
      }
    }
    
    return decryptedObj;
  }

  /**
   * Encrypt a file buffer
   */
  encryptFile(buffer: Buffer): { encryptedBuffer: Buffer; iv: Buffer; authTag: Buffer } {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(buffer),
        cipher.final(),
      ]);
      
      const authTag = cipher.getAuthTag();
      
      return {
        encryptedBuffer: encrypted,
        iv,
        authTag,
      };
    } catch (error) {
      this.logger.error(`File encryption failed: ${error.message}`);
      throw new Error(`File encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt a file buffer
   */
  decryptFile(encryptedData: { encryptedBuffer: Buffer; iv: Buffer; authTag: Buffer }): Buffer {
    try {
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, encryptedData.iv);
      decipher.setAuthTag(encryptedData.authTag);
      
      return Buffer.concat([
        decipher.update(encryptedData.encryptedBuffer),
        decipher.final(),
      ]);
    } catch (error) {
      this.logger.error(`File decryption failed: ${error.message}`);
      throw new Error(`File decryption failed: ${error.message}`);
    }
  }

  /**
   * Create a digital signature for data integrity
   */
  createSignature(data: string | Buffer): string {
    try {
      let dataBuffer: Buffer;
      if (typeof data === 'string') {
        dataBuffer = Buffer.from(data, 'utf8');
      } else {
        dataBuffer = data;
      }
      
      const sign = crypto.createSign('SHA256');
      sign.write(dataBuffer);
      sign.end();
      
      const privateKey = this.configService.get<string>('SIGNING_PRIVATE_KEY');
      if (!privateKey) {
        throw new Error('SIGNING_PRIVATE_KEY environment variable is required for signing');
      }
      
      return sign.sign(privateKey, 'hex');
    } catch (error) {
      this.logger.error(`Signature creation failed: ${error.message}`);
      throw new Error(`Signature creation failed: ${error.message}`);
    }
  }

  /**
   * Verify a digital signature
   */
  verifySignature(data: string | Buffer, signature: string): boolean {
    try {
      let dataBuffer: Buffer;
      if (typeof data === 'string') {
        dataBuffer = Buffer.from(data, 'utf8');
      } else {
        dataBuffer = data;
      }
      
      const verify = crypto.createVerify('SHA256');
      verify.write(dataBuffer);
      verify.end();
      
      const publicKey = this.configService.get<string>('SIGNING_PUBLIC_KEY');
      if (!publicKey) {
        throw new Error('SIGNING_PUBLIC_KEY environment variable is required for signature verification');
      }
      
      return verify.verify(publicKey, signature, 'hex');
    } catch (error) {
      this.logger.error(`Signature verification failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if encryption key is properly configured
   */
  isEncryptionConfigured(): boolean {
    return !!this.configService.get<string>('ENCRYPTION_KEY');
  }

  /**
   * Rotate the encryption key (advanced feature)
   */
  async rotateKey(oldKey: string, newKey: string): Promise<void> {
    // This would involve re-encrypting all data with the new key
    // Implementation would depend on specific requirements and data volume
    this.logger.warn('Key rotation functionality would need to be implemented based on specific requirements');
  }
}