import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Environment variable validation utilities
 */
export class EnvValidator {
  private static configService: ConfigService;

  /**
   * Initialize the validator with ConfigService
   */
  static initialize(configService: ConfigService) {
    this.configService = configService;
  }

  /**
   * Validate all required environment variables on startup
   */
  static validateOnStartup(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const requiredVars = this.getRequiredVariables();

    for (const [key, config] of Object.entries(requiredVars)) {
      const value = this.configService.get(key);

      if (!value) {
        errors.push(`Missing required environment variable: ${key}`);
        continue;
      }

      // Type validation
      if (config.type === 'url' && !this.isValidUrl(value)) {
        errors.push(`Invalid URL format for ${key}: ${value}`);
      }

      if (config.type === 'email' && !this.isValidEmail(value)) {
        errors.push(`Invalid email format for ${key}: ${value}`);
      }

      if (config.type === 'number' && !this.isValidNumber(value)) {
        errors.push(`Invalid number format for ${key}: ${value}`);
      }

      if (config.type === 'ethereum-address' && !this.isValidEthereumAddress(value)) {
        errors.push(`Invalid Ethereum address format for ${key}: ${value}`);
      }

      if (config.type === 'private-key' && !this.isValidPrivateKey(value)) {
        errors.push(`Invalid private key format for ${key}`);
      }

      // Custom validation
      if (config.validator && !config.validator(value)) {
        errors.push(`Custom validation failed for ${key}: ${value}`);
      }
    }

    // Security checks
    this.performSecurityChecks(errors);

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get all required environment variables with their validation rules
   */
  private static getRequiredVariables(): Record<
    string,
    {
      type: 'string' | 'url' | 'email' | 'number' | 'ethereum-address' | 'private-key';
      validator?: (value: string) => boolean;
      description: string;
    }
  > {
    return {
      // Database
      DATABASE_URL: {
        type: 'url',
        description: 'PostgreSQL connection string',
      },

      // JWT
      JWT_SECRET: {
        type: 'string',
        validator: (value: string) => value.length >= 32,
        description: 'JWT secret key (minimum 32 characters)',
      },
      JWT_REFRESH_SECRET: {
        type: 'string',
        validator: (value: string) => value.length >= 32,
        description: 'JWT refresh secret key (minimum 32 characters)',
      },

      // Encryption
      ENCRYPTION_KEY: {
        type: 'string',
        validator: (value: string) => value.length === 32,
        description: '32-character encryption key for AES-256',
      },

      // Blockchain
      RPC_URL: {
        type: 'url',
        description: 'Blockchain RPC endpoint URL',
      },
      PRIVATE_KEY: {
        type: 'private-key',
        description: 'Ethereum private key (0x followed by 64 hex characters)',
      },

      // Session
      SESSION_SECRET: {
        type: 'string',
        validator: (value: string) => value.length >= 32,
        description: 'Session secret key (minimum 32 characters)',
      },

      // Email
      EMAIL_FROM: {
        type: 'email',
        description: 'Default email address for sending emails',
      },
    };
  }

  /**
   * Perform security checks on environment variables
   */
  private static performSecurityChecks(errors: string[]): void {
    const securityVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'PRIVATE_KEY', 'SESSION_SECRET'];

    for (const key of securityVars) {
      const value = this.configService.get(key);
      if (value && this.isInsecureValue(value)) {
        errors.push(`Security risk: ${key} appears to be using a default or insecure value`);
      }
    }

    // Check for development values in production
    if (this.configService.get('NODE_ENV') === 'production') {
      const devValues = ['development', 'test', 'localhost', 'password', 'secret'];
      for (const devValue of devValues) {
        for (const [key, config] of Object.entries(this.getRequiredVariables())) {
          const value = this.configService.get(key);
          if (value && value.toLowerCase().includes(devValue)) {
            errors.push(`Production security warning: ${key} contains development value`);
          }
        }
      }
    }
  }

  /**
   * Check if a value is commonly used as default/insecure
   */
  private static isInsecureValue(value: string): boolean {
    const insecurePatterns = [
      /your.*secret.*here/i,
      /your.*key.*here/i,
      /your.*password.*here/i,
      /change.*this.*in.*production/i,
      /super.*secret/i,
      /default/i,
      /test/i,
      /demo/i,
    ];

    return insecurePatterns.some(pattern => pattern.test(value));
  }

  /**
   * Validate URL format
   */
  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate email format
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate number format
   */
  private static isValidNumber(value: string): boolean {
    return !isNaN(Number(value));
  }

  /**
   * Validate Ethereum address format
   */
  private static isValidEthereumAddress(address: string): boolean {
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    return addressRegex.test(address);
  }

  /**
   * Validate Ethereum private key format
   */
  private static isValidPrivateKey(privateKey: string): boolean {
    const privateKeyRegex = /^0x[a-fA-F0-9]{64}$/;
    return privateKeyRegex.test(privateKey);
  }

  /**
   * Generate environment variable documentation
   */
  static generateDocumentation(): string {
    const variables = this.getRequiredVariables();
    let docs = '# Environment Variables Documentation\n\n';
    docs += 'This document describes all required environment variables for the PropChain Backend.\n\n';

    for (const [key, config] of Object.entries(variables)) {
      docs += `## ${key}\n\n`;
      docs += `**Description:** ${config.description}\n\n`;
      docs += `**Type:** ${config.type}\n\n`;
      docs += `**Required:** Yes\n\n`;

      // Add example based on type
      switch (config.type) {
        case 'url':
          docs += `**Example:** \`https://example.com\`\n\n`;
          break;
        case 'email':
          docs += `**Example:** \`noreply@example.com\`\n\n`;
          break;
        case 'number':
          docs += `**Example:** \`3000\`\n\n`;
          break;
        case 'ethereum-address':
          docs += `**Example:** \`0x1234567890123456789012345678901234567890\`\n\n`;
          break;
        case 'private-key':
          docs += `**Example:** \`0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef\`\n\n`;
          break;
        default:
          docs += `**Example:** \`your-secret-value\`\n\n`;
      }

      if (config.validator) {
        docs += `**Additional Validation:** Custom validation rules apply\n\n`;
      }
    }

    return docs;
  }

  /**
   * Create environment variable templates
   */
  static createTemplates(): { development: string; production: string; staging: string } {
    const templates = {
      development: `# Development Environment Configuration
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/propchain_dev

# JWT
JWT_SECRET=dev-super-secret-jwt-key-32-chars-minimum
JWT_REFRESH_SECRET=dev-super-secret-refresh-key-32-chars
ENCRYPTION_KEY=dev-32-char-encryption-key-here

# Blockchain
BLOCKCHAIN_NETWORK=sepolia
RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_private_key_here

# Session
SESSION_SECRET=dev-session-secret-key-32-chars-min

# Email
EMAIL_FROM=dev@propchain.local
`,

      staging: `# Staging Environment Configuration
NODE_ENV=staging
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@staging-db:5432/propchain_staging

# JWT
JWT_SECRET=staging-super-secret-jwt-key-32-chars-minimum
JWT_REFRESH_SECRET=staging-super-secret-refresh-key-32-chars
ENCRYPTION_KEY=staging-32-char-encryption-key-here

# Blockchain
BLOCKCHAIN_NETWORK=sepolia
RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_staging_private_key

# Session
SESSION_SECRET=staging-session-secret-key-32-chars-min

# Email
EMAIL_FROM=staging@propchain.io
`,

      production: `# Production Environment Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:secure_password@prod-db:5432/propchain_prod

# JWT
JWT_SECRET=prod-super-secret-jwt-key-32-chars-minimum
JWT_REFRESH_SECRET=prod-super-secret-refresh-key-32-chars
ENCRYPTION_KEY=prod-32-char-encryption-key-here

# Blockchain
BLOCKCHAIN_NETWORK=mainnet
RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=your_production_private_key

# Session
SESSION_SECRET=prod-session-secret-key-32-chars-min

# Email
EMAIL_FROM=noreply@propchain.io
`,
    };

    return templates;
  }

  /**
   * Save documentation and templates to files
   */
  static saveDocumentationAndTemplates(outputDir: string = './docs'): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save documentation
    const docs = this.generateDocumentation();
    fs.writeFileSync(path.join(outputDir, 'ENVIRONMENT_VARIABLES.md'), docs);

    // Save templates
    const templates = this.createTemplates();
    fs.writeFileSync(path.join(outputDir, '.env.development.template'), templates.development);
    fs.writeFileSync(path.join(outputDir, '.env.staging.template'), templates.staging);
    fs.writeFileSync(path.join(outputDir, '.env.production.template'), templates.production);

    console.log(`Environment documentation and templates saved to ${outputDir}`);
  }
}
