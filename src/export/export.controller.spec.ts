import { Test, TestingModule } from '@nestjs/testing';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { BullModule } from '@nestjs/bull';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateExportJobDto, ExportDataType, ExportFormat } from './dto/export.dto';

describe('ExportController', () => {
  let controller: ExportController;
  let service: ExportService;
  let prismaService: PrismaService;

  const mockUser = {
    id: 'user123',
    email: 'test@example.com',
    role: 'USER',
  };

  const mockExportJob = {
    id: 'job123',
    userId: 'user123',
    dataType: ExportDataType.PROPERTIES,
    format: ExportFormat.CSV,
    status: 'pending',
    createdAt: new Date(),
    totalRecords: 0,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExportController],
      providers: [
        {
          provide: ExportService,
          useValue: {
            createExportJob: jest.fn().mockResolvedValue(mockExportJob),
            getExportJobs: jest.fn().mockResolvedValue({ jobs: [mockExportJob], total: 1 }),
            getExportJob: jest.fn().mockResolvedValue(mockExportJob),
            cancelExportJob: jest.fn().mockResolvedValue(mockExportJob),
            getExportFile: jest.fn().mockResolvedValue({ filePath: 'exports/test.csv', fileName: 'test.csv' }),
            deleteExportJob: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            exportJob: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    })
    .compile();

    controller = module.get<ExportController>(ExportController);
    service = module.get<ExportService>(ExportService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
    expect(prismaService).toBeDefined();
  });

  describe('createExportJob', () => {
    it('should create an export job', async () => {
      const createExportJobDto: CreateExportJobDto = {
        dataType: ExportDataType.PROPERTIES,
        format: ExportFormat.CSV,
        startDate: '2023-01-01',
        endDate: '2023-12-31',
      };

      const mockRequest = { user: mockUser };
      
      const result = await controller.createExportJob(createExportJobDto, mockRequest);
      
      expect(service.createExportJob).toHaveBeenCalledWith(mockUser.id, createExportJobDto);
      expect(result).toEqual(mockExportJob);
    });
  });

  describe('getExportJobs', () => {
    it('should return user export jobs', async () => {
      const mockRequest = { user: mockUser };
      
      const result = await controller.getExportJobs('1', '10', mockRequest);
      
      expect(service.getExportJobs).toHaveBeenCalledWith(mockUser.id, 1, 10);
      expect(result).toEqual({ jobs: [mockExportJob], total: 1 });
    });
  });

  describe('getExportJob', () => {
    it('should return a specific export job', async () => {
      const mockRequest = { user: mockUser };
      
      const result = await controller.getExportJob('job123', mockRequest);
      
      expect(service.getExportJob).toHaveBeenCalledWith(mockUser.id, 'job123');
      expect(result).toEqual(mockExportJob);
    });
  });

  describe('cancelExportJob', () => {
    it('should cancel an export job', async () => {
      const mockRequest = { user: mockUser };
      
      const result = await controller.cancelExportJob('job123', mockRequest);
      
      expect(service.cancelExportJob).toHaveBeenCalledWith(mockUser.id, 'job123');
      expect(result).toEqual(mockExportJob);
    });
  });

  describe('getAvailableFormats', () => {
    it('should return available export formats', async () => {
      const result = await controller.getAvailableFormats();
      
      expect(result).toHaveProperty('formats');
      expect(result.formats).toBeInstanceOf(Array);
      expect(result.formats.length).toBeGreaterThan(0);
      
      const csvFormat = result.formats.find(f => f.value === 'csv');
      expect(csvFormat).toBeDefined();
      expect(csvFormat.label).toBe('CSV');
    });
  });

  describe('getAvailableDataTypes', () => {
    it('should return available data types for regular user', async () => {
      const mockRequest = { user: { ...mockUser, role: 'USER' } };
      
      const result = await controller.getAvailableDataTypes(mockRequest);
      
      expect(result).toHaveProperty('dataTypes');
      expect(result.dataTypes).toBeInstanceOf(Array);
      
      // Regular users should not see admin-only data types
      const adminOnlyTypes = result.dataTypes.filter(t => t.adminOnly);
      expect(adminOnlyTypes).toHaveLength(0);
    });

    it('should return all data types for admin user', async () => {
      const mockRequest = { user: { ...mockUser, role: 'ADMIN' } };
      
      const result = await controller.getAvailableDataTypes(mockRequest);
      
      expect(result).toHaveProperty('dataTypes');
      expect(result.dataTypes).toBeInstanceOf(Array);
      
      // Admin users should see all data types
      const allDataType = result.dataTypes.find(t => t.value === 'all');
      expect(allDataType).toBeDefined();
      expect(allDataType.adminOnly).toBe(true);
    });
  });
});
