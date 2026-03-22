/**
 * Standard module structure patterns for PropChain Backend
 *
 * This file defines the standardized organization patterns that all modules should follow
 * to ensure consistency across the codebase.
 */

export interface ModuleStructure {
  // Core module files
  module: string; // [name].module.ts
  controller?: string; // [name].controller.ts
  service?: string; // [name].service.ts

  // Subdirectories
  dto?: string[]; // Data Transfer Objects
  entities?: string[]; // Database entities
  repositories?: string[]; // Repository patterns
  guards?: string[]; // Auth guards
  interceptors?: string[]; // Request/response interceptors
  middleware?: string[]; // Express middleware
  strategies?: string[]; // Auth strategies
  utils?: string[]; // Utility functions
  types?: string[]; // TypeScript types
  constants?: string[]; // Module constants
  tests?: string[]; // Test files
}

export const STANDARD_MODULE_STRUCTURE: ModuleStructure = {
  module: '[name].module.ts',
  controller: '[name].controller.ts',
  service: '[name].service.ts',
  dto: ['create-[name].dto.ts', 'update-[name].dto.ts', '[name].response.dto.ts'],
  entities: ['[name].entity.ts'],
  repositories: ['[name].repository.ts'],
  guards: ['[name].guard.ts'],
  interceptors: ['[name].interceptor.ts'],
  middleware: ['[name].middleware.ts'],
  strategies: ['[name].strategy.ts'],
  utils: ['[name].utils.ts'],
  types: ['[name].types.ts'],
  constants: ['[name].constants.ts'],
  tests: ['[name].service.spec.ts', '[name].controller.spec.ts', '[name].e2e.spec.ts'],
};

/**
 * Naming conventions for different file types
 */
export const NAMING_CONVENTIONS = {
  // Files
  MODULE: '[name].module.ts',
  CONTROLLER: '[name].controller.ts',
  SERVICE: '[name].service.ts',
  ENTITY: '[name].entity.ts',
  REPOSITORY: '[name].repository.ts',
  GUARD: '[name].guard.ts',
  INTERCEPTOR: '[name].interceptor.ts',
  MIDDLEWARE: '[name].middleware.ts',
  STRATEGY: '[name].strategy.ts',
  UTILS: '[name].utils.ts',
  TYPES: '[name].types.ts',
  CONSTANTS: '[name].constants.ts',

  // DTOs
  CREATE_DTO: 'create-[name].dto.ts',
  UPDATE_DTO: 'update-[name].dto.ts',
  RESPONSE_DTO: '[name].response.dto.ts',
  QUERY_DTO: '[name].query.dto.ts',

  // Tests
  SERVICE_TEST: '[name].service.spec.ts',
  CONTROLLER_TEST: '[name].controller.spec.ts',
  E2E_TEST: '[name].e2e.spec.ts',
  UNIT_TEST: '[name].unit.spec.ts',
  INTEGRATION_TEST: '[name].integration.spec.ts',

  // Classes and Interfaces
  CLASS_NAME: 'PascalCase',
  INTERFACE_NAME: 'PascalCase',
  TYPE_NAME: 'PascalCase',
  CONSTANT_NAME: 'UPPER_SNAKE_CASE',
  METHOD_NAME: 'camelCase',
  PROPERTY_NAME: 'camelCase',
  PRIVATE_PROPERTY: '_camelCase',
  STATIC_PROPERTY: 'UPPER_SNAKE_CASE',
};

/**
 * Import/export patterns
 */
export const IMPORT_EXPORT_PATTERNS = {
  // Order of imports
  IMPORT_ORDER: [
    'External libraries (node_modules)',
    'NestJS modules',
    'Internal modules (same level)',
    'Internal modules (different level)',
    'Relative imports',
    'Type-only imports',
  ],

  // Export patterns
  MODULE_EXPORTS: ['Services', 'Controllers', 'Repositories', 'Guards', 'Interceptors', 'Middleware'],
};

/**
 * Dependency injection patterns
 */
export const DEPENDENCY_INJECTION_PATTERNS = {
  // Service injection
  SERVICE_INJECTION: {
    CONSTRUCTOR: 'constructor(private readonly serviceName: ServiceName) {}',
    INJECT_DECORATOR: '@Inject(SERVICE_TOKEN) private readonly serviceName: ServiceName',
  },

  // Repository injection
  REPOSITORY_INJECTION: {
    CONSTRUCTOR: 'constructor(private readonly repository: Repository<Entity>) {}',
    INJECT_REPOSITORY: '@InjectRepository(Entity) private readonly repository: Repository<Entity>',
  },

  // Config injection
  CONFIG_INJECTION: {
    CONSTRUCTOR: 'constructor(private readonly configService: ConfigService) {}',
  },
};

/**
 * Module documentation template
 */
export const MODULE_DOCUMENTATION_TEMPLATE = `/**
 * [Module Name] Module
 * 
 * This module handles [brief description of module functionality].
 * 
 * Features:
 * - [Feature 1]
 * - [Feature 2]
 * - [Feature 3]
 * 
 * Endpoints:
 * - GET /api/[route] - [Description]
 * - POST /api/[route] - [Description]
 * - PUT /api/[route] - [Description]
 * - DELETE /api/[route] - [Description]
 * 
 * @author [Author Name]
 * @since [Date]
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Internal imports
import { [Name]Controller } from './[name].controller';
import { [Name]Service } from './[name].service';
import { [Name]Repository } from './[name].repository';
import { [Name]Entity } from './[name].entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([[Name]Entity]),
    ConfigModule,
  ],
  controllers: [[Name]Controller],
  providers: [
    [Name]Service,
    [Name]Repository,
  ],
  exports: [
    [Name]Service,
    [Name]Repository,
  ],
})
export class [Name]Module {}
`;

/**
 * Service documentation template
 */
export const SERVICE_DOCUMENTATION_TEMPLATE = `/**
 * [Name] Service
 * 
 * Handles business logic for [description].
 * 
 * @class [Name]Service
 * @constructor
 * @param {[Name]Repository} repository - Database repository
 * @param {ConfigService} configService - Configuration service
 * @param {Logger} logger - Logging service
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { [Name]Entity } from './[name].entity';
import { Create[Name]Dto } from './dto/create-[name].dto';
import { Update[Name]Dto } from './dto/update-[name].dto';

@Injectable()
export class [Name]Service {
  private readonly logger = new Logger([Name]Service.name);

  constructor(
    @InjectRepository([Name]Entity)
    private readonly repository: Repository<[Name]Entity>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new [name]
   * @param {Create[Name]Dto} createDto - Creation data
   * @returns {Promise<[Name]Entity>} Created entity
   */
  async create(createDto: Create[Name]Dto): Promise<[Name]Entity> {
    this.logger.log(\`Creating new [name]: \${JSON.stringify(createDto)}\`);
    
    const entity = this.repository.create(createDto);
    const saved = await this.repository.save(entity);
    
    this.logger.log(\`Successfully created [name] with ID: \${saved.id}\`);
    return saved;
  }

  /**
   * Find all [names]
   * @returns {Promise<[Name]Entity[]>} All entities
   */
  async findAll(): Promise<[Name]Entity[]> {
    return this.repository.find();
  }

  /**
   * Find [name] by ID
   * @param {string} id - Entity ID
   * @returns {Promise<[Name]Entity | null>} Entity or null
   */
  async findOne(id: string): Promise<[Name]Entity | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Update [name] by ID
   * @param {string} id - Entity ID
   * @param {Update[Name]Dto} updateDto - Update data
   * @returns {Promise<[Name]Entity>} Updated entity
   */
  async update(id: string, updateDto: Update[Name]Dto): Promise<[Name]Entity> {
    this.logger.log(\`Updating [name] \${id}: \${JSON.stringify(updateDto)}\`);
    
    await this.repository.update(id, updateDto);
    const updated = await this.findOne(id);
    
    if (!updated) {
      throw new Error(\`[Name] with ID \${id} not found\`);
    }
    
    this.logger.log(\`Successfully updated [name] with ID: \${id}\`);
    return updated;
  }

  /**
   * Delete [name] by ID
   * @param {string} id - Entity ID
   * @returns {Promise<void>}
   */
  async remove(id: string): Promise<void> {
    this.logger.log(\`Deleting [name] with ID: \${id}\`);
    
    const result = await this.repository.delete(id);
    
    if (result.affected === 0) {
      throw new Error(\`[Name] with ID \${id} not found\`);
    }
    
    this.logger.log(\`Successfully deleted [name] with ID: \${id}\`);
  }
}
`;

/**
 * Controller documentation template
 */
export const CONTROLLER_DOCUMENTATION_TEMPLATE = `/**
 * [Name] Controller
 * 
 * Handles HTTP requests for [description].
 * 
 * @class [Name]Controller
 * @constructor
 * @param {[Name]Service} [name]Service - Business logic service
 */

import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete,
  UseGuards,
  Request,
  Logger 
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { [Name]Service } from './[name].service';
import { Create[Name]Dto } from './dto/create-[name].dto';
import { Update[Name]Dto } from './dto/update-[name].dto';

@Controller('[route]')
@UseGuards(JwtAuthGuard)
export class [Name]Controller {
  private readonly logger = new Logger([Name]Controller.name);

  constructor(private readonly [name]Service: [Name]Service) {}

  /**
   * Create a new [name]
   * @param {Create[Name]Dto} createDto - Creation data
   * @param {Request} req - HTTP request
   * @returns {Promise<[Name]Entity>} Created entity
   */
  @Post()
  async create(@Body() createDto: Create[Name]Dto, @Request() req) {
    this.logger.log(\`User \${req.user?.sub} creating new [name]\`);
    return this.[name]Service.create(createDto);
  }

  /**
   * Get all [names]
   * @returns {Promise<[Name]Entity[]>} All entities
   */
  @Get()
  async findAll() {
    return this.[name]Service.findAll();
  }

  /**
   * Get [name] by ID
   * @param {string} id - Entity ID
   * @returns {Promise<[Name]Entity>} Entity
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.[name]Service.findOne(id);
  }

  /**
   * Update [name] by ID
   * @param {string} id - Entity ID
   * @param {Update[Name]Dto} updateDto - Update data
   * @returns {Promise<[Name]Entity>} Updated entity
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: Update[Name]Dto) {
    return this.[name]Service.update(id, updateDto);
  }

  /**
   * Delete [name] by ID
   * @param {string} id - Entity ID
   * @returns {Promise<void>}
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.[name]Service.remove(id);
  }
}
`;

/**
 * Utility functions for module structure
 */
export class ModuleStructureUtils {
  /**
   * Generate module structure for a given name
   */
  static generateModuleStructure(name: string): ModuleStructure {
    const structure = { ...STANDARD_MODULE_STRUCTURE };

    // Replace [name] placeholders with actual name
    const replaceName = (template: string) => template.replace(/\[name\]/g, name.toLowerCase());

    if (structure.controller) {
      structure.controller = replaceName(structure.controller);
    }

    if (structure.service) {
      structure.service = replaceName(structure.service);
    }

    if (structure.dto) {
      structure.dto = structure.dto.map(replaceName);
    }

    if (structure.entities) {
      structure.entities = structure.entities.map(replaceName);
    }

    if (structure.repositories) {
      structure.repositories = structure.repositories.map(replaceName);
    }

    return structure;
  }

  /**
   * Validate module structure against standards
   */
  static validateModuleStructure(modulePath: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // This would implement actual file system checks
    // For now, return placeholder
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get recommended file structure for new module
   */
  static getRecommendedStructure(name: string): string[] {
    const structure = this.generateModuleStructure(name);
    const files: string[] = [];

    if (structure.module) {
      files.push(structure.module);
    }
    if (structure.controller) {
      files.push(structure.controller);
    }
    if (structure.service) {
      files.push(structure.service);
    }
    if (structure.dto) {
      files.push(...structure.dto);
    }
    if (structure.entities) {
      files.push(...structure.entities);
    }
    if (structure.repositories) {
      files.push(...structure.repositories);
    }

    return files;
  }
}
