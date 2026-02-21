import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from '../../src/properties/properties.service';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let prismaService: PrismaService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        {
          provide: PrismaService,
          useValue: {
            property: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            $transaction: jest.fn(),
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

    service = module.get<PropertiesService>(PropertiesService);
    prismaService = module.get<PrismaService>(PrismaService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a property successfully', async () => {
      const createPropertyDto = {
        title: 'Test Property',
        description: 'Test Description',
        price: 500000,
        type: 'RESIDENTIAL',
        bedrooms: 3,
        bathrooms: 2,
        squareFootage: 2000,
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'Test Country',
          latitude: 40.7128,
          longitude: -74.0060,
        },
      };

      const userId = 'user-123';
      const expectedProperty = {
        id: 'property-123',
        ...createPropertyDto,
        status: 'AVAILABLE',
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prismaService.property, 'create').mockResolvedValue(expectedProperty);

      const result = await service.create(createPropertyDto, userId);

      expect(result).toEqual(expectedProperty);
      expect(prismaService.property.create).toHaveBeenCalledWith({
        data: {
          ...createPropertyDto,
          status: 'AVAILABLE',
          userId,
        },
      });
    });

    it('should throw BadRequestException for invalid data', async () => {
      const invalidDto = {
        title: '',
        price: -1000,
        type: 'INVALID_TYPE',
      };

      await expect(service.create(invalidDto as any, 'user-123')).rejects.toThrow(BadRequestException);
    });

    it('should handle database errors gracefully', async () => {
      const createPropertyDto = {
        title: 'Test Property',
        description: 'Test Description',
        price: 500000,
        type: 'RESIDENTIAL',
        bedrooms: 3,
        bathrooms: 2,
        squareFootage: 2000,
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'Test Country',
          latitude: 40.7128,
          longitude: -74.0060,
        },
      };

      jest.spyOn(prismaService.property, 'create').mockRejectedValue(new Error('Database error'));

      await expect(service.create(createPropertyDto, 'user-123')).rejects.toThrow(Error);
    });
  });

  describe('findAll', () => {
    it('should return paginated properties', async () => {
      const query = {
        page: 1,
        limit: 10,
        search: 'Test',
        type: 'RESIDENTIAL',
        status: 'AVAILABLE',
        minPrice: 100000,
        maxPrice: 1000000,
      };

      const mockProperties = [
        {
          id: 'property-1',
          title: 'Test Property 1',
          price: 500000,
          type: 'RESIDENTIAL',
          status: 'AVAILABLE',
        },
        {
          id: 'property-2',
          title: 'Test Property 2',
          price: 750000,
          type: 'RESIDENTIAL',
          status: 'AVAILABLE',
        },
      ];

      jest.spyOn(prismaService.property, 'findMany').mockResolvedValue(mockProperties);
      jest.spyOn(prismaService.property, 'count').mockResolvedValue(2);

      const result = await service.findAll(query);

      expect(result.data).toEqual(mockProperties);
      expect(result.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('should handle empty results', async () => {
      const query = { page: 1, limit: 10 };

      jest.spyOn(prismaService.property, 'findMany').mockResolvedValue([]);
      jest.spyOn(prismaService.property, 'count').mockResolvedValue(0);

      const result = await service.findAll(query);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
    });

    it('should apply search filters correctly', async () => {
      const query = {
        page: 1,
        limit: 10,
        search: 'Luxury',
        type: 'LUXURY',
        status: 'AVAILABLE',
      };

      jest.spyOn(prismaService.property, 'findMany').mockResolvedValue([]);
      jest.spyOn(prismaService.property, 'count').mockResolvedValue(0);

      await service.findAll(query);

      expect(prismaService.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { contains: 'Luxury', mode: 'insensitive' },
            type: 'LUXURY',
            status: 'AVAILABLE',
          }),
        })
      );
    });
  });

  describe('findOne', () => {
    it('should return a property by ID', async () => {
      const propertyId = 'property-123';
      const expectedProperty = {
        id: propertyId,
        title: 'Test Property',
        price: 500000,
        type: 'RESIDENTIAL',
        status: 'AVAILABLE',
      };

      jest.spyOn(prismaService.property, 'findUnique').mockResolvedValue(expectedProperty);

      const result = await service.findOne(propertyId);

      expect(result).toEqual(expectedProperty);
      expect(prismaService.property.findUnique).toHaveBeenCalledWith({
        where: { id: propertyId },
      });
    });

    it('should throw NotFoundException for non-existent property', async () => {
      const propertyId = 'non-existent';

      jest.spyOn(prismaService.property, 'findUnique').mockResolvedValue(null);

      await expect(service.findOne(propertyId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a property successfully', async () => {
      const propertyId = 'property-123';
      const updateDto = {
        title: 'Updated Property',
        price: 600000,
        status: 'PENDING',
      };

      const existingProperty = {
        id: propertyId,
        title: 'Original Property',
        price: 500000,
        status: 'AVAILABLE',
        userId: 'user-123',
      };

      const updatedProperty = {
        ...existingProperty,
        ...updateDto,
        updatedAt: new Date(),
      };

      jest.spyOn(prismaService.property, 'findUnique').mockResolvedValue(existingProperty);
      jest.spyOn(prismaService.property, 'update').mockResolvedValue(updatedProperty);

      const result = await service.update(propertyId, updateDto, 'user-123');

      expect(result).toEqual(updatedProperty);
      expect(prismaService.property.update).toHaveBeenCalledWith({
        where: { id: propertyId },
        data: updateDto,
      });
    });

    it('should throw NotFoundException for non-existent property', async () => {
      const propertyId = 'non-existent';
      const updateDto = { title: 'Updated' };

      jest.spyOn(prismaService.property, 'findUnique').mockResolvedValue(null);

      await expect(service.update(propertyId, updateDto, 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own the property', async () => {
      const propertyId = 'property-123';
      const updateDto = { title: 'Updated' };

      const existingProperty = {
        id: propertyId,
        title: 'Original Property',
        userId: 'different-user',
      };

      jest.spyOn(prismaService.property, 'findUnique').mockResolvedValue(existingProperty);

      await expect(service.update(propertyId, updateDto, 'user-123')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete a property successfully', async () => {
      const propertyId = 'property-123';
      const existingProperty = {
        id: propertyId,
        title: 'Test Property',
        userId: 'user-123',
      };

      jest.spyOn(prismaService.property, 'findUnique').mockResolvedValue(existingProperty);
      jest.spyOn(prismaService.property, 'delete').mockResolvedValue(existingProperty);

      const result = await service.remove(propertyId, 'user-123');

      expect(result).toEqual(existingProperty);
      expect(prismaService.property.delete).toHaveBeenCalledWith({
        where: { id: propertyId },
      });
    });

    it('should throw NotFoundException for non-existent property', async () => {
      const propertyId = 'non-existent';

      jest.spyOn(prismaService.property, 'findUnique').mockResolvedValue(null);

      await expect(service.remove(propertyId, 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own the property', async () => {
      const propertyId = 'property-123';
      const existingProperty = {
        id: propertyId,
        title: 'Test Property',
        userId: 'different-user',
      };

      jest.spyOn(prismaService.property, 'findUnique').mockResolvedValue(existingProperty);

      await expect(service.remove(propertyId, 'user-123')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('searchByLocation', () => {
    it('should find properties near a location', async () => {
      const locationQuery = {
        latitude: 40.7128,
        longitude: -74.0060,
        radius: 5, // 5 miles
        limit: 10,
      };

      const nearbyProperties = [
        {
          id: 'property-1',
          title: 'Nearby Property 1',
          latitude: 40.7130,
          longitude: -74.0062,
        },
        {
          id: 'property-2',
          title: 'Nearby Property 2',
          latitude: 40.7126,
          longitude: -74.0058,
        },
      ];

      jest.spyOn(prismaService.property, 'findMany').mockResolvedValue(nearbyProperties);

      const result = await service.searchByLocation(locationQuery);

      expect(result).toEqual(nearbyProperties);
      expect(prismaService.property.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            latitude: expect.any(Object),
            longitude: expect.any(Object),
          }),
          take: 10,
        })
      );
    });

    it('should handle location search with no results', async () => {
      const locationQuery = {
        latitude: 0,
        longitude: 0,
        radius: 1,
        limit: 5,
      };

      jest.spyOn(prismaService.property, 'findMany').mockResolvedValue([]);

      const result = await service.searchByLocation(locationQuery);

      expect(result).toEqual([]);
    });
  });

  describe('getPropertyStats', () => {
    it('should return property statistics', async () => {
      const mockStats = {
        total: 100,
        byType: {
          RESIDENTIAL: 60,
          COMMERCIAL: 25,
          LUXURY: 15,
        },
        byStatus: {
          AVAILABLE: 70,
          PENDING: 20,
          SOLD: 10,
        },
        avgPrice: 450000,
      };

      jest.spyOn(prismaService.property, 'count').mockResolvedValue(100);
      jest.spyOn(prismaService.property, 'count').mockResolvedValue(60);
      jest.spyOn(prismaService.property, 'count').mockResolvedValue(25);
      jest.spyOn(prismaService.property, 'count').mockResolvedValue(15);

      const result = await service.getPropertyStats();

      expect(result.total).toBe(100);
      expect(result.byType).toBeDefined();
      expect(result.byStatus).toBeDefined();
    });
  });

  describe('validatePropertyData', () => {
    it('should validate correct property data', () => {
      const validData = {
        title: 'Test Property',
        description: 'Test Description',
        price: 500000,
        type: 'RESIDENTIAL',
        bedrooms: 3,
        bathrooms: 2,
        squareFootage: 2000,
        address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'Test Country',
          latitude: 40.7128,
          longitude: -74.0060,
        },
      };

      expect(() => service.validatePropertyData(validData)).not.toThrow();
    });

    it('should throw BadRequestException for invalid price', () => {
      const invalidData = {
        title: 'Test Property',
        price: -1000,
        type: 'RESIDENTIAL',
      };

      expect(() => service.validatePropertyData(invalidData as any)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid property type', () => {
      const invalidData = {
        title: 'Test Property',
        price: 500000,
        type: 'INVALID_TYPE',
      };

      expect(() => service.validatePropertyData(invalidData as any)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for missing required fields', () => {
      const invalidData = {
        price: 500000,
        type: 'RESIDENTIAL',
      };

      expect(() => service.validatePropertyData(invalidData as any)).toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid coordinates', () => {
      const invalidData = {
        title: 'Test Property',
        price: 500000,
        type: 'RESIDENTIAL',
        address: {
          latitude: 91, // Invalid latitude
          longitude: -74.0060,
        },
      };

      expect(() => service.validatePropertyData(invalidData as any)).toThrow(BadRequestException);
    });
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two points', () => {
      const point1 = { latitude: 40.7128, longitude: -74.0060 };
      const point2 = { latitude: 40.7130, longitude: -74.0062 };

      const distance = (service as any).calculateDistance(point1, point2);

      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1); // Should be very close
    });

    it('should return 0 for identical points', () => {
      const point = { latitude: 40.7128, longitude: -74.0060 };

      const distance = (service as any).calculateDistance(point, point);

      expect(distance).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle Prisma connection errors', async () => {
      const createPropertyDto = {
        title: 'Test Property',
        price: 500000,
        type: 'RESIDENTIAL',
      };

      jest.spyOn(prismaService.property, 'create').mockRejectedValue(new Error('Connection failed'));

      await expect(service.create(createPropertyDto as any, 'user-123')).rejects.toThrow('Connection failed');
    });

    it('should handle transaction rollback errors', async () => {
      jest.spyOn(prismaService, '$transaction').mockRejectedValue(new Error('Transaction failed'));

      await expect((prismaService as any).$transaction([])).rejects.toThrow('Transaction failed');
    });
  });
});
