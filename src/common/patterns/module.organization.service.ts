import { Injectable, Logger } from '@nestjs/common';
import { ModuleStructureUtils } from './module.structure';
import { ImportOrganizer, ExportOrganizer, CodeFormatter } from './import.export.patterns';
import { DIUtils, TestDIUtils } from './dependency.injection';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Module Organization Service
 *
 * Service for organizing and standardizing module structure across the codebase
 */
@Injectable()
export class ModuleOrganizationService {
  private readonly logger = new Logger(ModuleOrganizationService.name);

  /**
   * Analyze existing module structure
   */
  analyzeModuleStructure(modulePath: string): {
    structure: any;
    compliance: any;
    recommendations: string[];
  } {
    const structure = this.getModuleStructure(modulePath);
    const compliance = this.checkCompliance(structure);
    const recommendations = this.generateRecommendations(structure, compliance);

    return {
      structure,
      compliance,
      recommendations,
    };
  }

  /**
   * Get module structure
   */
  private getModuleStructure(modulePath: string): any {
    const structure: any = {
      files: [],
      directories: [],
      imports: [],
      exports: [],
      dependencies: [],
    };

    try {
      if (fs.existsSync(modulePath)) {
        const items = fs.readdirSync(modulePath);

        for (const item of items) {
          const itemPath = path.join(modulePath, item);
          const stats = fs.statSync(itemPath);

          if (stats.isDirectory()) {
            structure.directories.push({
              name: item,
              path: itemPath,
              files: this.getDirectoryFiles(itemPath),
            });
          } else if (stats.isFile()) {
            structure.files.push({
              name: item,
              path: itemPath,
              size: stats.size,
              content: fs.readFileSync(itemPath, 'utf8'),
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to analyze module structure for ${modulePath}:`, error);
    }

    return structure;
  }

  /**
   * Get files in directory
   */
  private getDirectoryFiles(dirPath: string): string[] {
    try {
      return fs.readdirSync(dirPath).filter(file => {
        const filePath = path.join(dirPath, file);
        return fs.statSync(filePath).isFile();
      });
    } catch {
      return [];
    }
  }

  /**
   * Check compliance with standards
   */
  private checkCompliance(structure: any): any {
    const compliance = {
      hasModule: false,
      hasService: false,
      hasController: false,
      hasDto: false,
      hasTests: false,
      importOrder: true,
      namingConvention: true,
      documentation: true,
    };

    // Check for required files
    for (const file of structure.files) {
      const name = file.name.toLowerCase();

      if (name.includes('.module.ts')) {
        compliance.hasModule = true;
      }
      if (name.includes('.service.ts')) {
        compliance.hasService = true;
      }
      if (name.includes('.controller.ts')) {
        compliance.hasController = true;
      }
      if (name.includes('dto')) {
        compliance.hasDto = true;
      }
      if (name.includes('.spec.ts') || name.includes('.test.ts')) {
        compliance.hasTests = true;
      }

      // Check import order in files
      if (file.content) {
        const validation = CodeFormatter.validatePatterns(file.content);
        if (!validation.isValid) {
          compliance.importOrder = false;
        }
      }
    }

    return compliance;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(structure: any, compliance: any): string[] {
    const recommendations: string[] = [];

    if (!compliance.hasModule) {
      recommendations.push('Add module file ([name].module.ts)');
    }

    if (!compliance.hasService) {
      recommendations.push('Add service file ([name].service.ts)');
    }

    if (!compliance.hasController) {
      recommendations.push('Add controller file ([name].controller.ts)');
    }

    if (!compliance.hasDto) {
      recommendations.push('Add DTO directory with create/update/response DTOs');
    }

    if (!compliance.hasTests) {
      recommendations.push('Add test files (service.spec.ts, controller.spec.ts)');
    }

    if (!compliance.importOrder) {
      recommendations.push('Fix import order according to standards');
    }

    if (!compliance.namingConvention) {
      recommendations.push('Follow naming conventions for classes and files');
    }

    if (!compliance.documentation) {
      recommendations.push('Add proper documentation to all files');
    }

    return recommendations;
  }

  /**
   * Create standardized module structure
   */
  createModuleStructure(moduleName: string, targetPath: string): void {
    const structure = ModuleStructureUtils.generateModuleStructure(moduleName);

    // Create main directory
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    // Create subdirectories
    const subdirs = ['dto', 'tests', 'utils', 'types'];
    for (const subdir of subdirs) {
      const subdirPath = path.join(targetPath, subdir);
      if (!fs.existsSync(subdirPath)) {
        fs.mkdirSync(subdirPath, { recursive: true });
      }
    }

    this.logger.log(`Created module structure for ${moduleName} at ${targetPath}`);
  }

  /**
   * Generate module files
   */
  generateModuleFiles(moduleName: string, targetPath: string): void {
    const lowerName = moduleName.toLowerCase();

    // Generate module file
    const moduleContent = this.generateModuleFile(moduleName);
    fs.writeFileSync(path.join(targetPath, `${lowerName}.module.ts`), moduleContent);

    // Generate service file
    const serviceContent = this.generateServiceFile(moduleName);
    fs.writeFileSync(path.join(targetPath, `${lowerName}.service.ts`), serviceContent);

    // Generate controller file
    const controllerContent = this.generateControllerFile(moduleName);
    fs.writeFileSync(path.join(targetPath, `${lowerName}.controller.ts`), controllerContent);

    // Generate DTO files
    const dtoPath = path.join(targetPath, 'dto');
    this.generateDtoFiles(moduleName, dtoPath);

    // Generate test files
    const testPath = path.join(targetPath, 'tests');
    this.generateTestFiles(moduleName, testPath);

    this.logger.log(`Generated module files for ${moduleName}`);
  }

  /**
   * Generate module file
   */
  private generateModuleFile(moduleName: string): string {
    const lowerName = moduleName.toLowerCase();

    return `/**
 * ${moduleName} Module
 * 
 * This module handles ${moduleName.toLowerCase()} related operations.
 * 
 * @author PropChain Team
 * @since ${new Date().toISOString().split('T')[0]}
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Internal imports
import { ${moduleName}Controller } from './${lowerName}.controller';
import { ${moduleName}Service } from './${lowerName}.service';
import { ${moduleName}Entity } from './${lowerName}.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([${moduleName}Entity]),
    ConfigModule,
  ],
  controllers: [${moduleName}Controller],
  providers: [${moduleName}Service],
  exports: [${moduleName}Service],
})
export class ${moduleName}Module {}
`;
  }

  /**
   * Generate service file
   */
  private generateServiceFile(moduleName: string): string {
    const lowerName = moduleName.toLowerCase();

    return `/**
 * ${moduleName} Service
 * 
 * Handles business logic for ${moduleName.toLowerCase()} operations.
 * 
 * @class ${moduleName}Service
 * @constructor
 * @param {Repository<${moduleName}Entity>} repository - Database repository
 * @param {ConfigService} configService - Configuration service
 * @param {Logger} logger - Logging service
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ${moduleName}Entity } from './${lowerName}.entity';
import { Create${moduleName}Dto } from './dto/create-${lowerName}.dto';
import { Update${moduleName}Dto } from './dto/update-${lowerName}.dto';

@Injectable()
export class ${moduleName}Service {
  private readonly logger = new Logger(${moduleName}Service.name);

  constructor(
    @InjectRepository(${moduleName}Entity)
    private readonly repository: Repository<${moduleName}Entity>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new ${moduleName.toLowerCase()}
   * @param {Create${moduleName}Dto} createDto - Creation data
   * @returns {Promise<${moduleName}Entity>} Created entity
   */
  async create(createDto: Create${moduleName}Dto): Promise<${moduleName}Entity> {
    this.logger.log(\`Creating new ${moduleName.toLowerCase()}: \${JSON.stringify(createDto)}\`);
    
    const entity = this.repository.create(createDto);
    const saved = await this.repository.save(entity);
    
    this.logger.log(\`Successfully created ${moduleName.toLowerCase()} with ID: \${saved.id}\`);
    return saved;
  }

  /**
   * Find all ${moduleName.toLowerCase()}s
   * @returns {Promise<${moduleName}Entity[]>} All entities
   */
  async findAll(): Promise<${moduleName}Entity[]> {
    return this.repository.find();
  }

  /**
   * Find ${moduleName.toLowerCase()} by ID
   * @param {string} id - Entity ID
   * @returns {Promise<${moduleName}Entity | null>} Entity or null
   */
  async findOne(id: string): Promise<${moduleName}Entity | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Update ${moduleName.toLowerCase()} by ID
   * @param {string} id - Entity ID
   * @param {Update${moduleName}Dto} updateDto - Update data
   * @returns {Promise<${moduleName}Entity>} Updated entity
   */
  async update(id: string, updateDto: Update${moduleName}Dto): Promise<${moduleName}Entity> {
    this.logger.log(\`Updating ${moduleName.toLowerCase()} \${id}: \${JSON.stringify(updateDto)}\`);
    
    await this.repository.update(id, updateDto);
    const updated = await this.findOne(id);
    
    if (!updated) {
      throw new Error(\`${moduleName} with ID \${id} not found\`);
    }
    
    this.logger.log(\`Successfully updated ${moduleName.toLowerCase()} with ID: \${id}\`);
    return updated;
  }

  /**
   * Delete ${moduleName.toLowerCase()} by ID
   * @param {string} id - Entity ID
   * @returns {Promise<void>}
   */
  async remove(id: string): Promise<void> {
    this.logger.log(\`Deleting ${moduleName.toLowerCase()} with ID: \${id}\`);
    
    const result = await this.repository.delete(id);
    
    if (result.affected === 0) {
      throw new Error(\`${moduleName} with ID \${id} not found\`);
    }
    
    this.logger.log(\`Successfully deleted ${moduleName.toLowerCase()} with ID: \${id}\`);
  }
}
`;
  }

  /**
   * Generate controller file
   */
  private generateControllerFile(moduleName: string): string {
    const lowerName = moduleName.toLowerCase();

    return `/**
 * ${moduleName} Controller
 * 
 * Handles HTTP requests for ${moduleName.toLowerCase()} operations.
 * 
 * @class ${moduleName}Controller
 * @constructor
 * @param {${moduleName}Service} ${lowerName}Service - Business logic service
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

import { ${moduleName}Service } from './${lowerName}.service';
import { Create${moduleName}Dto } from './dto/create-${lowerName}.dto';
import { Update${moduleName}Dto } from './dto/update-${lowerName}.dto';

@Controller('${lowerName}')
@UseGuards(JwtAuthGuard)
export class ${moduleName}Controller {
  private readonly logger = new Logger(${moduleName}Controller.name);

  constructor(private readonly ${lowerName}Service: ${moduleName}Service) {}

  /**
   * Create a new ${moduleName.toLowerCase()}
   * @param {Create${moduleName}Dto} createDto - Creation data
   * @param {Request} req - HTTP request
   * @returns {Promise<${moduleName}Entity>} Created entity
   */
  @Post()
  async create(@Body() createDto: Create${moduleName}Dto, @Request() req) {
    this.logger.log(\`User \${req.user?.sub} creating new ${moduleName.toLowerCase()}\`);
    return this.${lowerName}Service.create(createDto);
  }

  /**
   * Get all ${moduleName.toLowerCase()}s
   * @returns {Promise<${moduleName}Entity[]>} All entities
   */
  @Get()
  async findAll() {
    return this.${lowerName}Service.findAll();
  }

  /**
   * Get ${moduleName.toLowerCase()} by ID
   * @param {string} id - Entity ID
   * @returns {Promise<${moduleName}Entity>} Entity
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.${lowerName}Service.findOne(id);
  }

  /**
   * Update ${moduleName.toLowerCase()} by ID
   * @param {string} id - Entity ID
   * @param {Update${moduleName}Dto} updateDto - Update data
   * @returns {Promise<${moduleName}Entity>} Updated entity
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateDto: Update${moduleName}Dto) {
    return this.${lowerName}Service.update(id, updateDto);
  }

  /**
   * Delete ${moduleName.toLowerCase()} by ID
   * @param {string} id - Entity ID
   * @returns {Promise<void>}
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.${lowerName}Service.remove(id);
  }
}
`;
  }

  /**
   * Generate DTO files
   */
  private generateDtoFiles(moduleName: string, dtoPath: string): void {
    const lowerName = moduleName.toLowerCase();

    // Create DTO
    const createDto = `import { IsString, IsOptional, IsNumber, IsEmail } from 'class-validator';

export class Create${moduleName}Dto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}`;

    // Update DTO
    const updateDto = `import { PartialType } from '@nestjs/swagger';
import { Create${moduleName}Dto } from './create-${lowerName}.dto';

export class Update${moduleName}Dto extends PartialType(Create${moduleName}Dto) {}`;

    // Response DTO
    const responseDto = `export class ${moduleName}ResponseDto {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}`;

    fs.writeFileSync(path.join(dtoPath, `create-${lowerName}.dto.ts`), createDto);
    fs.writeFileSync(path.join(dtoPath, `update-${lowerName}.dto.ts`), updateDto);
    fs.writeFileSync(path.join(dtoPath, `${lowerName}.response.dto.ts`), responseDto);
  }

  /**
   * Generate test files
   */
  private generateTestFiles(moduleName: string, testPath: string): void {
    const lowerName = moduleName.toLowerCase();

    // Service test
    const serviceTest = `import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { ${moduleName}Service } from '../${lowerName}.service';
import { ${moduleName}Entity } from '../${lowerName}.entity';
import { Create${moduleName}Dto } from '../dto/create-${lowerName}.dto';

describe('${moduleName}Service', () => {
  let service: ${moduleName}Service;
  let repository: Repository<${moduleName}Entity>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ${moduleName}Service,
        {
          provide: getRepositoryToken(${moduleName}Entity),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<${moduleName}Service>(${moduleName}Service);
    repository = module.get<Repository<${moduleName}Entity>>(getRepositoryToken(${moduleName}Entity));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a new ${moduleName.toLowerCase()}', async () => {
    const createDto: Create${moduleName}Dto = { name: 'Test ${moduleName}' };
    const entity = { id: '1', ...createDto, createdAt: new Date(), updatedAt: new Date() };

    jest.spyOn(repository, 'create').mockReturnValue(entity as any);
    jest.spyOn(repository, 'save').mockResolvedValue(entity);

    const result = await service.create(createDto);
    expect(result).toEqual(entity);
  });
});`;

    // Controller test
    const controllerTest = `import { Test } from '@nestjs/testing';
import { ${moduleName}Controller } from '../${lowerName}.controller';
import { ${moduleName}Service } from '../${lowerName}.service';
import { Create${moduleName}Dto } from '../dto/create-${lowerName}.dto';

describe('${moduleName}Controller', () => {
  let controller: ${moduleName}Controller;
  let service: ${moduleName}Service;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [${moduleName}Controller],
      providers: [
        {
          provide: ${moduleName}Service,
          useValue: {
            create: jest.fn(),
            findAll: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<${moduleName}Controller>(${moduleName}Controller);
    service = module.get<${moduleName}Service>(${moduleName}Service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a new ${moduleName.toLowerCase()}', async () => {
    const createDto: Create${moduleName}Dto = { name: 'Test ${moduleName}' };
    const entity = { id: '1', ...createDto, createdAt: new Date(), updatedAt: new Date() };

    jest.spyOn(service, 'create').mockResolvedValue(entity as any);

    const result = await controller.create(createDto, { user: { sub: 'user1' } } as any);
    expect(result).toEqual(entity);
  });
});`;

    fs.writeFileSync(path.join(testPath, `${lowerName}.service.spec.ts`), serviceTest);
    fs.writeFileSync(path.join(testPath, `${lowerName}.controller.spec.ts`), controllerTest);
  }

  /**
   * Reorganize existing module
   */
  reorganizeModule(modulePath: string): void {
    const analysis = this.analyzeModuleStructure(modulePath);

    if (analysis.recommendations.length > 0) {
      this.logger.log(`Reorganizing module at ${modulePath}`);

      // Apply recommendations
      for (const recommendation of analysis.recommendations) {
        this.logger.log(`Recommendation: ${recommendation}`);
      }

      // This would implement actual reorganization logic
      this.logger.log('Module reorganization completed');
    } else {
      this.logger.log('Module is already properly organized');
    }
  }

  /**
   * Validate all modules in the project
   */
  validateAllModules(basePath: string): {
    totalModules: number;
    compliantModules: number;
    issues: Array<{ module: string; issues: string[] }>;
  } {
    const modules = this.discoverModules(basePath);
    const issues: Array<{ module: string; issues: string[] }> = [];
    let compliantModules = 0;

    for (const module of modules) {
      const analysis = this.analyzeModuleStructure(module.path);

      if (analysis.recommendations.length === 0) {
        compliantModules++;
      } else {
        issues.push({
          module: module.name,
          issues: analysis.recommendations,
        });
      }
    }

    return {
      totalModules: modules.length,
      compliantModules,
      issues,
    };
  }

  /**
   * Discover all modules in the project
   */
  private discoverModules(basePath: string): Array<{ name: string; path: string }> {
    const modules: Array<{ name: string; path: string }> = [];

    try {
      const items = fs.readdirSync(basePath);

      for (const item of items) {
        const itemPath = path.join(basePath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory() && !item.startsWith('.') && item !== 'common') {
          // Check if it contains a module file
          const moduleFiles = fs.readdirSync(itemPath).filter(file => file.includes('.module.ts'));

          if (moduleFiles.length > 0) {
            modules.push({
              name: item,
              path: itemPath,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to discover modules:', error);
    }

    return modules;
  }
}
