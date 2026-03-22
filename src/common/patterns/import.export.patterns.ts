/**
 * Standard import/export patterns for PropChain Backend
 *
 * This file defines the standardized import/export patterns that all modules should follow
 * to ensure consistency and maintainability across the codebase.
 */

export interface ImportPattern {
  type: 'external' | 'nestjs' | 'internal' | 'relative' | 'type-only';
  order: number;
  description: string;
  examples: string[];
}

export interface ExportPattern {
  type: 'service' | 'controller' | 'repository' | 'guard' | 'interceptor' | 'middleware';
  description: string;
  template: string;
}

/**
 * Standard import order and patterns
 */
export const STANDARD_IMPORT_PATTERNS: ImportPattern[] = [
  {
    type: 'external',
    order: 1,
    description: 'External libraries from node_modules',
    examples: [
      "import { Injectable, Logger } from '@nestjs/common';",
      "import { ConfigService } from '@nestjs/config';",
      "import * as fs from 'fs';",
      "import * as path from 'path';",
    ],
  },
  {
    type: 'nestjs',
    order: 2,
    description: 'NestJS specific modules and decorators',
    examples: [
      "import { Module } from '@nestjs/common';",
      "import { TypeOrmModule } from '@nestjs/typeorm';",
      "import { InjectRepository } from '@nestjs/typeorm';",
      "import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';",
    ],
  },
  {
    type: 'internal',
    order: 3,
    description: 'Internal modules from different directories',
    examples: [
      "import { UserService } from '../users/user.service';",
      "import { PropertyEntity } from '../properties/property.entity';",
      "import { ConfigAuditService } from '../config/utils/config.audit';",
    ],
  },
  {
    type: 'relative',
    order: 4,
    description: 'Relative imports from same module',
    examples: [
      "import { CreatePropertyDto } from './dto/create-property.dto';",
      "import { PropertyEntity } from './property.entity';",
      "import { PropertyRepository } from './property.repository';",
    ],
  },
  {
    type: 'type-only',
    order: 5,
    description: 'Type-only imports (should use import type)',
    examples: [
      "import type { Request } from 'express';",
      "import type { User } from '../users/user.types';",
      "import type { CreatePropertyDto } from './dto/create-property.dto';",
    ],
  },
];

/**
 * Standard export patterns
 */
export const STANDARD_EXPORT_PATTERNS: ExportPattern[] = [
  {
    type: 'service',
    description: 'Service exports',
    template: `// Service exports
export { [Name]Service } from './[name].service';
export type { [Name]ServiceInterface } from './[name].service';`,
  },
  {
    type: 'controller',
    description: 'Controller exports',
    template: `// Controller exports
export { [Name]Controller } from './[name].controller';`,
  },
  {
    type: 'repository',
    description: 'Repository exports',
    template: `// Repository exports
export { [Name]Repository } from './[name].repository';
export type { [Name]RepositoryInterface } from './[name].repository';`,
  },
  {
    type: 'guard',
    description: 'Guard exports',
    template: `// Guard exports
export { [Name]Guard } from './[name].guard';`,
  },
  {
    type: 'interceptor',
    description: 'Interceptor exports',
    template: `// Interceptor exports
export { [Name]Interceptor } from './[name].interceptor';`,
  },
  {
    type: 'middleware',
    description: 'Middleware exports',
    template: `// Middleware exports
export { [Name]Middleware } from './[name].middleware';`,
  },
];

/**
 * Import organization utility
 */
export class ImportOrganizer {
  /**
   * Sort imports according to standard patterns
   */
  static sortImports(imports: string[]): string[] {
    return imports.sort((a, b) => {
      const orderA = this.getImportOrder(a);
      const orderB = this.getImportOrder(b);

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Within same group, sort alphabetically
      return a.localeCompare(b);
    });
  }

  /**
   * Get import order based on pattern
   */
  private static getImportOrder(importStatement: string): number {
    const lowerImport = importStatement.toLowerCase();

    // Type-only imports
    if (lowerImport.includes('import type')) {
      return 5;
    }

    // Relative imports
    if (lowerImport.includes('./') || lowerImport.includes('../')) {
      return 4;
    }

    // Internal modules (check for known internal patterns)
    if (lowerImport.includes('../') || lowerImport.includes('@propchain')) {
      return 3;
    }

    // NestJS modules
    if (lowerImport.includes('@nestjs')) {
      return 2;
    }

    // External libraries
    return 1;
  }

  /**
   * Group imports by type
   */
  static groupImportsByType(imports: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {
      external: [],
      nestjs: [],
      internal: [],
      relative: [],
      typeOnly: [],
    };

    for (const importStatement of imports) {
      const type = this.getImportType(importStatement);
      groups[type].push(importStatement);
    }

    return groups;
  }

  /**
   * Get import type
   */
  private static getImportType(importStatement: string): string {
    const lowerImport = importStatement.toLowerCase();

    if (lowerImport.includes('import type')) {
      return 'typeOnly';
    }

    if (lowerImport.includes('./') || lowerImport.includes('../')) {
      return 'relative';
    }

    if (lowerImport.includes('../') || lowerImport.includes('@propchain')) {
      return 'internal';
    }

    if (lowerImport.includes('@nestjs')) {
      return 'nestjs';
    }

    return 'external';
  }

  /**
   * Format imports with proper spacing
   */
  static formatImports(imports: string[]): string {
    const grouped = this.groupImportsByType(imports);
    const sorted = this.sortImports(imports);

    let formatted = '';
    let lastOrder = 0;

    for (const importStatement of sorted) {
      const order = this.getImportOrder(importStatement);

      // Add blank line between different import groups
      if (order > lastOrder && formatted.length > 0) {
        formatted += '\n';
      }

      formatted += `${importStatement}\n`;
      lastOrder = order;
    }

    return formatted.trim();
  }
}

/**
 * Export organization utility
 */
export class ExportOrganizer {
  /**
   * Generate standard export statements for a module
   */
  static generateExports(
    moduleName: string,
    components: {
      service?: boolean;
      controller?: boolean;
      repository?: boolean;
      guard?: boolean;
      interceptor?: boolean;
      middleware?: boolean;
    },
  ): string {
    const exports: string[] = [];

    if (components.service) {
      exports.push(`export { ${moduleName}Service } from './${moduleName.toLowerCase()}.service';`);
    }

    if (components.controller) {
      exports.push(`export { ${moduleName}Controller } from './${moduleName.toLowerCase()}.controller';`);
    }

    if (components.repository) {
      exports.push(`export { ${moduleName}Repository } from './${moduleName.toLowerCase()}.repository';`);
    }

    if (components.guard) {
      exports.push(`export { ${moduleName}Guard } from './${moduleName.toLowerCase()}.guard';`);
    }

    if (components.interceptor) {
      exports.push(`export { ${moduleName}Interceptor } from './${moduleName.toLowerCase()}.interceptor';`);
    }

    if (components.middleware) {
      exports.push(`export { ${moduleName}Middleware } from './${moduleName.toLowerCase()}.middleware';`);
    }

    return exports.join('\n');
  }

  /**
   * Generate index file for module
   */
  static generateIndexFile(
    moduleName: string,
    components: {
      service?: boolean;
      controller?: boolean;
      repository?: boolean;
      guard?: boolean;
      interceptor?: boolean;
      middleware?: boolean;
      dto?: string[];
      entities?: string[];
      types?: string[];
    },
  ): string {
    let content = `/**
 * ${moduleName} Module Index
 * 
 * Centralized exports for ${moduleName} module
 */

`;

    // Add exports
    content += this.generateExports(moduleName, components);

    // Add DTO exports
    if (components.dto && components.dto.length > 0) {
      content += '\n\n// DTO exports\n';
      for (const dto of components.dto) {
        content += `export { ${dto} } from './dto/${dto.toLowerCase()}';\n`;
      }
    }

    // Add entity exports
    if (components.entities && components.entities.length > 0) {
      content += '\n// Entity exports\n';
      for (const entity of components.entities) {
        content += `export { ${entity} } from './${entity.toLowerCase()}.entity';\n`;
      }
    }

    // Add type exports
    if (components.types && components.types.length > 0) {
      content += '\n// Type exports\n';
      for (const type of components.types) {
        content += `export type { ${type} } from './types/${type.toLowerCase()}';\n`;
      }
    }

    return content;
  }
}

/**
 * Code formatting utilities
 */
export class CodeFormatter {
  /**
   * Format file according to standards
   */
  static formatFile(content: string): string {
    // Remove extra blank lines
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

    // Ensure file ends with newline
    if (!content.endsWith('\n')) {
      content += '\n';
    }

    return content;
  }

  /**
   * Add proper spacing around imports
   */
  static formatImports(content: string): string {
    const lines = content.split('\n');
    const importLines: string[] = [];
    const otherLines: string[] = [];
    let inImports = false;

    for (const line of lines) {
      if (line.trim().startsWith('import')) {
        importLines.push(line);
        inImports = true;
      } else if (inImports && line.trim() === '') {
        importLines.push(line);
      } else {
        otherLines.push(line);
        inImports = false;
      }
    }

    const formattedImports = ImportOrganizer.formatImports(importLines);
    return `${formattedImports}\n\n${otherLines.join('\n')}`;
  }

  /**
   * Validate import/export patterns
   */
  static validatePatterns(content: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for proper import order
    const lines = content.split('\n');
    const importLines = lines.filter(line => line.trim().startsWith('import'));
    const sortedImports = ImportOrganizer.sortImports(importLines);

    if (JSON.stringify(importLines) !== JSON.stringify(sortedImports)) {
      warnings.push('Imports are not in the correct order');
    }

    // Check for type-only imports
    for (const line of lines) {
      if (
        line.includes('import') &&
        !line.includes('import type') &&
        (line.includes('type ') || line.includes('interface ') || line.includes('enum '))
      ) {
        warnings.push(`Consider using 'import type' for: ${line.trim()}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
