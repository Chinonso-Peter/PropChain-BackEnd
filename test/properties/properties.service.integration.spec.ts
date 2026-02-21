import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesService } from '../../src/properties/properties.service';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PropertiesService Integration Tests', () => {
  let service: PropertiesService;
  let prismaService: PrismaService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await (global as any).createIntegrationTestModule([
      // Import the PropertiesModule here when available
    ], [PropertiesService]);

    service = module.get<PropertiesService>(PropertiesService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await module.close();
  });

  beforeEach(async () => {
    await (global as any).cleanupDatabase(prismaService);
  });

  describe('Property CRUD Operations', () => {
    it('should create and retrieve a property', async () => {
      const createPropertyDto = {
        title: 'Integration Test Property',
        description: 'Property for integration testing',
        price: 750000,
        type: 'RESIDENTIAL',
        bedrooms: 4,
        bathrooms: 3,
        squareFootage: 2500,
        address: {
          street: '456 Integration Ave',
          city: 'Test City',
          state: 'TS',
          zipCode: '67890',
          country: 'Test Country',
          latitude: 40.7589,
          longitude: -73.9851,
        },
      };

      const userId = 'integration-user-123';
      
      // Create property
      const createdProperty = await service.create(createPropertyDto, userId);
      
      expect(createdProperty).toBeDefined();
      expect(createdProperty.id).toBeDefined();
      expect(createdProperty.title).toBe(createPropertyDto.title);
      expect(createdProperty.userId).toBe(userId);
      expect(createdProperty.status).toBe('AVAILABLE');

      // Retrieve property
      const retrievedProperty = await service.findOne(createdProperty.id);
      
      expect(retrievedProperty).toEqual(createdProperty);
    });

    it('should update a property', async () => {
      // First create a property
      const createPropertyDto = {
        title: 'Original Property',
        price: 500000,
        type: 'RESIDENTIAL',
        address: {
          street: '123 Original St',
          city: 'Original City',
          state: 'OR',
          zipCode: '12345',
          country: 'Original Country',
          latitude: 40.7128,
          longitude: -74.0060,
        },
      };

      const userId = 'integration-user-123';
      const createdProperty = await service.create(createPropertyDto, userId);

      // Update property
      const updateDto = {
        title: 'Updated Property',
        price: 600000,
        status: 'PENDING',
      };

      const updatedProperty = await service.update(createdProperty.id, updateDto, userId);

      expect(updatedProperty.title).toBe(updateDto.title);
      expect(updatedProperty.price).toBe(updateDto.price);
      expect(updatedProperty.status).toBe(updateDto.status);
      expect(updatedProperty.updatedAt).not.toEqual(createdProperty.updatedAt);
    });

    it('should delete a property', async () => {
      // Create a property
      const createPropertyDto = {
        title: 'Property to Delete',
        price: 400000,
        type: 'COMMERCIAL',
        address: {
          street: '789 Delete St',
          city: 'Delete City',
          state: 'DL',
          zipCode: '98765',
          country: 'Delete Country',
          latitude: 40.7614,
          longitude: -73.9776,
        },
      };

      const userId = 'integration-user-123';
      const createdProperty = await service.create(createPropertyDto, userId);

      // Delete property
      const deletedProperty = await service.remove(createdProperty.id, userId);

      expect(deletedProperty.id).toBe(createdProperty.id);

      // Verify property is deleted
      await expect(service.findOne(createdProperty.id)).rejects.toThrow(NotFoundException);
    });

    it('should handle property ownership', async () => {
      const createPropertyDto = {
        title: 'Ownership Test Property',
        price: 300000,
        type: 'RESIDENTIAL',
        address: {
          street: '321 Ownership St',
          city: 'Ownership City',
          state: 'OW',
          zipCode: '54321',
          country: 'Ownership Country',
          latitude: 40.7580,
          longitude: -73.9855,
        },
      };

      const userId1 = 'user-1';
      const userId2 = 'user-2';

      // Create property with user 1
      const createdProperty = await service.create(createPropertyDto, userId1);

      // Try to update with user 2 (should fail)
      await expect(service.update(createdProperty.id, { title: 'Hacked' }, userId2))
        .rejects.toThrow('Forbidden');

      // Try to delete with user 2 (should fail)
      await expect(service.remove(createdProperty.id, userId2))
        .rejects.toThrow('Forbidden');

      // Update with user 1 (should succeed)
      const updatedProperty = await service.update(createdProperty.id, { title: 'Valid Update' }, userId1);
      expect(updatedProperty.title).toBe('Valid Update');
    });
  });

  describe('Property Search and Filtering', () => {
    beforeEach(async () => {
      // Seed test data
      const properties = [
        {
          title: 'Luxury Villa',
          price: 1500000,
          type: 'LUXURY',
          status: 'AVAILABLE',
          bedrooms: 5,
          bathrooms: 4,
          squareFootage: 4000,
          address: {
            street: '100 Luxury Ln',
            city: 'Beverly Hills',
            state: 'CA',
            zipCode: '90210',
            country: 'USA',
            latitude: 34.0901,
            longitude: -118.4065,
          },
        },
        {
          title: 'Cozy Apartment',
          price: 350000,
          type: 'RESIDENTIAL',
          status: 'AVAILABLE',
          bedrooms: 2,
          bathrooms: 1,
          squareFootage: 800,
          address: {
            street: '200 Cozy Ave',
            city: 'Manhattan',
            state: 'NY',
            zipCode: '10001',
            country: 'USA',
            latitude: 40.7589,
            longitude: -73.9851,
          },
        },
        {
          title: 'Office Space',
          price: 800000,
          type: 'COMMERCIAL',
          status: 'PENDING',
          bedrooms: 0,
          bathrooms: 2,
          squareFootage: 2000,
          address: {
            street: '300 Business Blvd',
            city: 'Chicago',
            state: 'IL',
            zipCode: '60601',
            country: 'USA',
            latitude: 41.8781,
            longitude: -87.6298,
          },
        },
        {
          title: 'Beach House',
          price: 1200000,
          type: 'LUXURY',
          status: 'SOLD',
          bedrooms: 4,
          bathrooms: 3,
          squareFootage: 3500,
          address: {
            street: '400 Beach Rd',
            city: 'Miami',
            state: 'FL',
            zipCode: '33101',
            country: 'USA',
            latitude: 25.7617,
            longitude: -80.1918,
          },
        },
      ];

      for (const property of properties) {
        await service.create(property, 'test-user');
      }
    });

    it('should filter properties by type', async () => {
      const result = await service.findAll({ type: 'LUXURY', page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.data.every(p => p.type === 'LUXURY')).toBe(true);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter properties by status', async () => {
      const result = await service.findAll({ status: 'AVAILABLE', page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.data.every(p => p.status === 'AVAILABLE')).toBe(true);
      expect(result.pagination.total).toBe(2);
    });

    it('should filter properties by price range', async () => {
      const result = await service.findAll({ 
        minPrice: 500000, 
        maxPrice: 1000000, 
        page: 1, 
        limit: 10 
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].price).toBe(800000);
      expect(result.pagination.total).toBe(1);
    });

    it('should search properties by title', async () => {
      const result = await service.findAll({ 
        search: 'luxury', 
        page: 1, 
        limit: 10 
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toContain('Luxury');
      expect(result.pagination.total).toBe(1);
    });

    it('should combine multiple filters', async () => {
      const result = await service.findAll({ 
        type: 'LUXURY',
        status: 'AVAILABLE',
        minPrice: 1000000,
        page: 1, 
        limit: 10 
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('LUXURY');
      expect(result.data[0].status).toBe('AVAILABLE');
      expect(result.data[0].price).toBe(1500000);
      expect(result.pagination.total).toBe(1);
    });

    it('should handle pagination correctly', async () => {
      const result1 = await service.findAll({ page: 1, limit: 2 });
      const result2 = await service.findAll({ page: 2, limit: 2 });

      expect(result1.data).toHaveLength(2);
      expect(result2.data).toHaveLength(2);
      expect(result1.pagination.page).toBe(1);
      expect(result2.pagination.page).toBe(2);
      expect(result1.pagination.totalPages).toBe(2);
      expect(result2.pagination.totalPages).toBe(2);
    });
  });

  describe('Location-based Search', () => {
    beforeEach(async () => {
      // Create properties at different locations
      const locations = [
        {
          title: 'Downtown Apartment',
          price: 600000,
          type: 'RESIDENTIAL',
          address: {
            street: '500 Downtown St',
            city: 'New York',
            state: 'NY',
            zipCode: '10001',
            country: 'USA',
            latitude: 40.7589,  // Close to Empire State Building
            longitude: -73.9851,
          },
        },
        {
          title: 'Brooklyn House',
          price: 800000,
          type: 'RESIDENTIAL',
          address: {
            street: '600 Brooklyn Ave',
            city: 'Brooklyn',
            state: 'NY',
            zipCode: '11201',
            country: 'USA',
            latitude: 40.6892,  // Further away
            longitude: -73.9442,
          },
        },
        {
          title: 'Queens Apartment',
          price: 450000,
          type: 'RESIDENTIAL',
          address: {
            street: '700 Queens Blvd',
            city: 'Queens',
            state: 'NY',
            zipCode: '11375',
            country: 'USA',
            latitude: 40.7282,  // Medium distance
            longitude: -73.7949,
          },
        },
      ];

      for (const property of locations) {
        await service.create(property, 'test-user');
      }
    });

    it('should find properties within a radius', async () => {
      const locationQuery = {
        latitude: 40.7589,  // Empire State Building location
        longitude: -73.9851,
        radius: 5, // 5 miles
        limit: 10,
      };

      const results = await service.searchByLocation(locationQuery);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Downtown Apartment');
    });

    it('should return empty results for distant locations', async () => {
      const locationQuery = {
        latitude: 0,  // Far from all properties
        longitude: 0,
        radius: 1, // 1 mile
        limit: 10,
      };

      const results = await service.searchByLocation(locationQuery);

      expect(results).toHaveLength(0);
    });
  });

  describe('Property Statistics', () => {
    beforeEach(async () => {
      const properties = [
        { title: 'Prop 1', price: 300000, type: 'RESIDENTIAL', status: 'AVAILABLE' },
        { title: 'Prop 2', price: 500000, type: 'RESIDENTIAL', status: 'PENDING' },
        { title: 'Prop 3', price: 700000, type: 'COMMERCIAL', status: 'AVAILABLE' },
        { title: 'Prop 4', price: 900000, type: 'LUXURY', status: 'SOLD' },
      ];

      for (const property of properties) {
        await service.create({
          ...property,
          address: {
            street: 'Test St',
            city: 'Test City',
            state: 'TS',
            zipCode: '12345',
            country: 'Test',
            latitude: 40.7128,
            longitude: -74.0060,
          },
        }, 'test-user');
      }
    });

    it('should calculate correct statistics', async () => {
      const stats = await service.getPropertyStats();

      expect(stats.total).toBe(4);
      expect(stats.byType.RESIDENTIAL).toBe(2);
      expect(stats.byType.COMMERCIAL).toBe(1);
      expect(stats.byType.LUXURY).toBe(1);
      expect(stats.byStatus.AVAILABLE).toBe(2);
      expect(stats.byStatus.PENDING).toBe(1);
      expect(stats.byStatus.SOLD).toBe(1);
      expect(stats.avgPrice).toBe(600000); // (300k + 500k + 700k + 900k) / 4
    });
  });

  describe('Data Validation', () => {
    it('should validate required fields', async () => {
      const invalidProperties = [
        { title: '', price: 500000, type: 'RESIDENTIAL' }, // Empty title
        { title: 'Test', price: -1000, type: 'RESIDENTIAL' }, // Negative price
        { title: 'Test', price: 500000, type: 'INVALID' }, // Invalid type
        { title: 'Test', price: 500000, type: 'RESIDENTIAL', address: null }, // Missing address
      ];

      for (const invalidProperty of invalidProperties) {
        await expect(service.create(invalidProperty as any, 'user-123'))
          .rejects.toThrow(BadRequestException);
      }
    });

    it('should validate address coordinates', async () => {
      const invalidAddresses = [
        { latitude: 91, longitude: 0 }, // Invalid latitude
        { latitude: -91, longitude: 0 }, // Invalid latitude
        { latitude: 0, longitude: 181 }, // Invalid longitude
        { latitude: 0, longitude: -181 }, // Invalid longitude
      ];

      for (const invalidAddress of invalidAddresses) {
        const property = {
          title: 'Test Property',
          price: 500000,
          type: 'RESIDENTIAL',
          address: {
            street: 'Test St',
            city: 'Test City',
            state: 'TS',
            zipCode: '12345',
            country: 'Test',
            ...invalidAddress,
          },
        };

        await expect(service.create(property as any, 'user-123'))
          .rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('Transaction Handling', () => {
    it('should handle concurrent operations safely', async () => {
      const propertyDto = {
        title: 'Concurrent Test Property',
        price: 400000,
        type: 'RESIDENTIAL',
        address: {
          street: '800 Concurrent St',
          city: 'Test City',
          state: 'TS',
          zipCode: '12345',
          country: 'Test',
          latitude: 40.7128,
          longitude: -74.0060,
        },
      };

      // Create multiple properties concurrently
      const promises = Array.from({ length: 5 }, (_, i) =>
        service.create({ ...propertyDto, title: `Property ${i}` }, `user-${i}`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(new Set(results.map(r => r.id)).size).toBe(5); // All IDs are unique

      // Verify all properties exist
      for (const property of results) {
        const retrieved = await service.findOne(property.id);
        expect(retrieved).toBeDefined();
        expect(retrieved.title).toContain('Property');
      }
    });
  });
});
