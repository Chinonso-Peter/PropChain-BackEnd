import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
  score: number;
}

@Injectable()
export class PasswordValidator {
  constructor(private readonly configService: ConfigService) {}

  validatePassword(password: string): PasswordValidationResult {
    const errors: string[] = [];
    let score = 0;

    // Length validation
    const minLength = this.configService.get<number>('PASSWORD_MIN_LENGTH', 12);
    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    } else {
      score += password.length >= 16 ? 2 : 1;
    }

    // Lowercase validation
    const lowercaseRegex = /[a-z]/;
    if (!lowercaseRegex.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    // Uppercase validation
    if (this.configService.get<boolean>('PASSWORD_REQUIRE_UPPERCASE', true)) {
      const uppercaseRegex = /[A-Z]/;
      if (!uppercaseRegex.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      } else {
        score += 1;
      }
    }

    // Numbers validation
    if (this.configService.get<boolean>('PASSWORD_REQUIRE_NUMBERS', true)) {
      const numberRegex = /\d/;
      if (!numberRegex.test(password)) {
        errors.push('Password must contain at least one number');
      } else {
        score += 1;
      }
    }

    // Special characters validation
    if (this.configService.get<boolean>('PASSWORD_REQUIRE_SPECIAL_CHARS', true)) {
      const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;
      if (!specialCharRegex.test(password)) {
        errors.push('Password must contain at least one special character');
      } else {
        score += 1;
      }
    }

    // Entropy check - bonus points for complexity
    const uniqueChars = new Set(password).size;
    if (uniqueChars >= password.length * 0.7) {
      score += 1;
    }

    // Sequential characters check
    if (this.hasSequentialChars(password)) {
      errors.push('Password must not contain sequential characters (e.g., abc, 123)');
    } else {
      score += 1;
    }

    // Repeated characters check
    if (this.hasRepeatedChars(password)) {
      errors.push('Password must not contain repeated characters (e.g., aaa, 111)');
    } else {
      score += 1;
    }

    // Common password patterns to avoid
    const commonPatterns = [
      /password/i,
      /123456/,
      /qwerty/i,
      /abc123/i,
      /admin/i,
      /welcome/i,
      /letmein/i,
      /monkey/i,
      /dragon/i,
      /master/i,
      /sunshine/i,
      /princess/i,
      /football/i,
      /baseball/i,
      /iloveyou/i,
      /trustno1/i,
      /shadow/i,
      /ashley/i,
      /michael/i,
      /jesus/i,
      /mustang/i,
      /access/i,
      /love/i,
      /pussy/i,
      /696969/i,
      /qwertyuiop/i,
      /qazwsx/i,
      /zaq12wsx/i,
      /!@#\$%^&\*/,
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns that are easy to guess');
        break;
      }
    }

    // Check for keyboard patterns
    if (this.hasKeyboardPattern(password)) {
      errors.push('Password must not contain keyboard patterns (e.g., asdf, qwer)');
    } else {
      score += 1;
    }

    // Determine strength
    let strength: 'weak' | 'medium' | 'strong' = 'weak';
    if (score >= 7) {
      strength = 'strong';
    } else if (score >= 5) {
      strength = 'medium';
    }

    return {
      valid: errors.length === 0,
      errors,
      strength,
      score,
    };
  }

  isPasswordStrong(password: string): boolean {
    const { valid, strength } = this.validatePassword(password);
    return valid && strength === 'strong';
  }

  getValidationMessage(password: string): string {
    const { errors } = this.validatePassword(password);
    return errors.join(', ') || 'Password is valid';
  }

  calculateEntropy(password: string): number {
    let poolSize = 0;
    if (/[a-z]/.test(password)) {
      poolSize += 26;
    }
    if (/[A-Z]/.test(password)) {
      poolSize += 26;
    }
    if (/\d/.test(password)) {
      poolSize += 10;
    }
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      poolSize += 32;
    }

    return Math.log2(Math.pow(poolSize, password.length));
  }

  private hasSequentialChars(password: string): boolean {
    const lowerPassword = password.toLowerCase();
    const sequences = ['abcdefghijklmnopqrstuvwxyz', '0123456789'];

    for (const seq of sequences) {
      for (let i = 0; i < seq.length - 2; i++) {
        const pattern = seq.substring(i, i + 3);
        if (lowerPassword.includes(pattern)) {
          return true;
        }
      }
    }
    return false;
  }

  private hasRepeatedChars(password: string): boolean {
    const repeatedPattern = /(.)\1{2,}/;
    return repeatedPattern.test(password);
  }

  private hasKeyboardPattern(password: string): boolean {
    const keyboardPatterns = [
      'qwerty',
      'asdf',
      'zxcv',
      'qwer',
      'wasd',
      'qazwsx',
      'zaq12wsx',
      '1qaz2wsx',
      'qaz',
      'wsx',
      'edc',
      'rfv',
      'tgb',
      'yhn',
      'ujm',
      'ikl',
      'ppp',
      'ooo',
      'lll',
      'kkk',
    ];

    const lowerPassword = password.toLowerCase();
    for (const pattern of keyboardPatterns) {
      if (lowerPassword.includes(pattern)) {
        return true;
      }
    }
    return false;
  }
}
