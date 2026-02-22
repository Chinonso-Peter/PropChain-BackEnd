import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreatePropertyDto, PropertyStatus as DTOPropertyStatus } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyQueryDto } from './dto/property-query.dto';
import { ConfigService } from '@nestjs/config';
import { PrismaProperty, PrismaUser } from '../types/prisma.types';
import { isObject } from '../types/guards';

/**
 * PropertiesService
 * 
 * Core service handling all property-related operations including CRUD operations,
 * advanced search/filtering, geospatial queries, and property management.
 * 
 * Features:
 * - Full-text search across property titles, descriptions, and locations
 * - Advanced filtering by type, price range, bedroom count, etc.
 * - Geospatial querying for nearby property searches
 * - Pagination and sorting support
 * - Property valuation history and document tracking
 * 
 * @class PropertiesService
 * @injectable
 */
@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Create a new property listing
   * 
   * Validates owner exists and creates a new property entry with provided details.
   * Formats address into a standardized location string for geospatial operations.
   * Automatically includes owner information in response.
   * 
   * @param {CreatePropertyDto} createPropertyDto - Property creation data
   * @param {string} ownerId - ID of the property owner
   * @returns {Promise<Property>} Created property with owner details
   * @throws {NotFoundException} If owner doesn't exist
   * @throws {BadRequestException} If creation fails
   * 
   * @example
   * ```typescript
   * const property = await propertiesService.create({
   *   title: '3BR Modern Apartment',
   *   description: 'Spacious apartment in downtown',
   *   address: {
   *     street: '123 Main St',
   *     city: 'New York',
   *     state: 'NY',
   *     zipCode: '10001',
   *     country: 'USA'
   *   },
   *   type: 'APARTMENT',
   *   price: 500000,
   *   bedrooms: 3,
   *   bathrooms: 2,
   *   areaSqFt: 1500,
   *   status: 'AVAILABLE'
   * }, userId);
   * ```
   */
  async create(createPropertyDto: CreatePropertyDto, ownerId: string) {
    try {
      // === OWNER VALIDATION ===
      // Ensures property ownership is assigned to an existing user
      const owner = await (this.prisma as any).user.findUnique({
        where: { id: ownerId },
      });

      if (!owner) {
        throw new NotFoundException(`User with ID ${ownerId} not found`);
      }

      // === ADDRESS FORMATTING ===
      // Converts address components into standardized location string
      // Used for geographic searching and filtering
      const location = this.formatAddress(createPropertyDto.address);

      const property = await (this.prisma as any).property.create({
        data: {
          title: createPropertyDto.title,
          description: createPropertyDto.description,
          location,
          price: createPropertyDto.price,
          status: this.mapPropertyStatus(createPropertyDto.status || DTOPropertyStatus.AVAILABLE),
          ownerId,
          // Property features
          bedrooms: createPropertyDto.bedrooms,
          bathrooms: createPropertyDto.bathrooms,
          squareFootage: createPropertyDto.areaSqFt,
          propertyType: createPropertyDto.type,
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      });

      this.logger.log(`Property created: ${property.id} by user ${ownerId}`);
      return property;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Failed to create property', error);
      throw new BadRequestException('Failed to create property');
    }
  }

  /**
   * Get all properties with advanced filtering, sorting, and pagination
   * 
   * Provides comprehensive property search with support for:
   * - Full-text search across multiple fields
   * - Type filtering (apartment, house, commercial, etc.)
   * - Price range filtering
   * - Bedroom/bathroom count filtering
   * - Location filtering (city, country)
   * - Status filtering
   * - Custom sorting and pagination
   * 
   * @param {PropertyQueryDto} [query] - Query parameters for filtering and pagination
   * @param {number} [query.page=1] - Page number for pagination
   * @param {number} [query.limit=20] - Results per page
   * @param {string} [query.sortBy='createdAt'] - Field to sort by
   * @param {string} [query.sortOrder='desc'] - Sort direction (asc/desc)
   * @param {string} [query.search] - Full-text search term
   * @param {string} [query.type] - Property type filter
   * @param {string} [query.status] - Property status filter
   * @param {string} [query.city] - City filter
   * @param {string} [query.country] - Country filter
   * @param {number} [query.minPrice] - Minimum price filter
   * @param {number} [query.maxPrice] - Maximum price filter
   * @param {number} [query.minBedrooms] - Minimum bedroom count
   * @param {number} [query.maxBedrooms] - Maximum bedroom count
   * @param {string} [query.ownerId] - Filter by owner ID
   * 
   * @returns {Promise<{properties: Property[], total: number, page: number, limit: number, totalPages: number}>}
   * Paginated results with total count
   * 
   * @example
   * ```typescript
   * // Search for 2-3 bedroom apartments under $500k in New York
   * const results = await propertiesService.findAll({
   *   search: 'downtown',
   *   type: 'APARTMENT',
   *   minBedrooms: 2,
   *   maxBedrooms: 3,
   *   maxPrice: 500000,
   *   city: 'New York',
   *   sortBy: 'price',
   *   sortOrder: 'asc',
   *   page: 1,
   *   limit: 20
   * });
   * ```
   */
  async findAll(query?: PropertyQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      search,
      type,
      status,
      city,
      country,
      minPrice,
      maxPrice,
      minBedrooms,
      maxBedrooms,
      ownerId,
    } = query || {};

    const skip = (page - 1) * limit;
    const where: Record<string, any> = {};

    // === FULL-TEXT SEARCH ===
    // Searches across title, description, and location fields
    // Uses case-insensitive matching for better UX
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    // === PROPERTY TYPE FILTER ===
    if (type) {
      where.propertyType = type;
    }

    // === STATUS FILTER ===
    if (status) {
      where.status = this.mapPropertyStatus(status);
    }

    // === LOCATION FILTERS ===
    // City and country filtering via location string
    if (city) {
      where.location = { contains: city, mode: 'insensitive' };
    }

    if (country) {
      where.location = { contains: country, mode: 'insensitive' };
    }

    // === PRICE RANGE FILTER ===
    // Supports minimum, maximum, or both bounds
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) {
        where.price.gte = minPrice;
      }
      if (maxPrice !== undefined) {
        where.price.lte = maxPrice;
      }
    }

    // === BEDROOM COUNT FILTER ===
    // Allows filtering by minimum, maximum, or range
    if (minBedrooms !== undefined || maxBedrooms !== undefined) {
      where.bedrooms = {};
      if (minBedrooms !== undefined) {
        where.bedrooms.gte = minBedrooms;
      }
      if (maxBedrooms !== undefined) {
        where.bedrooms.lte = maxBedrooms;
      }
    }

    // === OWNER FILTER ===
    if (ownerId) {
      where.ownerId = ownerId;
    }

    try {
      // === PARALLEL DATA FETCHING ===
      // Fetch properties and total count concurrently for better performance
      const [properties, total] = await Promise.all([
        (this.prisma as any).property.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            owner: {
              select: {
                id: true,
                email: true,
                role: true,
              },
            },
          },
        }),
        (this.prisma as any).property.count({ where }),
      ]);

      return {
        properties,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error('Failed to fetch properties', error);
      throw new BadRequestException('Failed to fetch properties');
    }
  }

  /**
   * Get a single property by ID with full details
   * 
   * Retrieves comprehensive property information including:
   * - Owner details
   * - Associated documents (deeds, certificates, etc.)
   * - Recent valuation history (last 5 valuations)
   * 
   * @param {string} id - Property ID
   * @returns {Promise<Property>} Complete property object with related data
   * @throws {NotFoundException} If property doesn't exist
   * @throws {BadRequestException} If fetch fails
   * 
   * @example
   * ```typescript
   * const property = await propertiesService.findOne('prop-id-123');
   * // Returns property with owner, documents, and valuations
   * ```
   */
  async findOne(id: string) {
    try {
      const property = await (this.prisma as any).property.findUnique({
        where: { id },
        include: {
          // Include owner information for display
          owner: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
          // Include associated documents (deeds, certificates, etc.)
          documents: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              createdAt: true,
            },
          },
          // Include recent valuations sorted by date (newest first)
          // Limited to last 5 for performance
          valuations: {
            orderBy: { valuationDate: 'desc' },
            take: 5,
          },
        },
      });

      if (!property) {
        throw new NotFoundException(`Property with ID ${id} not found`);
      }

      return property;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to fetch property ${id}`, error);
      throw new BadRequestException('Failed to fetch property');
    }
  }

  /**
   * Update an existing property
   * 
   * Supports partial updates - only provided fields are updated.
   * Validates property existence before updating.
   * Handles address formatting for location updates.
   * 
   * @param {string} id - Property ID to update
   * @param {UpdatePropertyDto} updatePropertyDto - Fields to update
   * @returns {Promise<Property>} Updated property object
   * @throws {NotFoundException} If property doesn't exist
   * @throws {BadRequestException} If update fails
   * 
   * @example
   * ```typescript
   * // Update only the price and status
   * const updated = await propertiesService.update(id, {
   *   price: 550000,
   *   status: 'PENDING'
   * });
   * ```
   */
  async update(id: string, updatePropertyDto: UpdatePropertyDto) {
    try {
      // === EXISTENCE VALIDATION ===
      // Ensures property exists before attempting update
      const existingProperty = await (this.prisma as any).property.findUnique({
        where: { id },
      });

      if (!existingProperty) {
        throw new NotFoundException(`Property with ID ${id} not found`);
      }

      const updateData: any = {};

      // === SELECTIVE FIELD UPDATES ===
      // Only update fields that were explicitly provided
      // This allows partial updates without requiring all fields
      if (updatePropertyDto.title !== undefined) {
        updateData.title = updatePropertyDto.title;
      }

      if (updatePropertyDto.description !== undefined) {
        updateData.description = updatePropertyDto.description;
      }

      if (updatePropertyDto.price !== undefined) {
        updateData.price = updatePropertyDto.price;
      }

      if (updatePropertyDto.address) {
        updateData.location = this.formatAddress(updatePropertyDto.address);
      }
      }

      if (updatePropertyDto.status !== undefined) {
        updateData.status = this.mapPropertyStatus(updatePropertyDto.status);
      }

      if (updatePropertyDto.bedrooms !== undefined) {
        updateData.bedrooms = updatePropertyDto.bedrooms;
      }

      if (updatePropertyDto.bathrooms !== undefined) {
        updateData.bathrooms = updatePropertyDto.bathrooms;
      }

      if (updatePropertyDto.areaSqFt !== undefined) {
        updateData.squareFootage = updatePropertyDto.areaSqFt;
      }

      if (updatePropertyDto.type !== undefined) {
        updateData.propertyType = updatePropertyDto.type;
      }

      const property = await (this.prisma as any).property.update({
        where: { id },
        data: updateData,
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      });

      this.logger.log(`Property updated: ${property.id}`);
      return property;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to update property ${id}`, error);
      throw new BadRequestException('Failed to update property');
    }
  }

  /**
   * Delete a property
   */
  async remove(id: string): Promise<void> {
    try {
      const existingProperty = await (this.prisma as any).property.findUnique({
        where: { id },
      });

      if (!existingProperty) {
        throw new NotFoundException(`Property with ID ${id} not found`);
      }

      await (this.prisma as any).property.delete({
        where: { id },
      });

      this.logger.log(`Property deleted: ${id}`);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete property ${id}`, error);
      throw new BadRequestException('Failed to delete property');
    }
  }

  /**
   * Search properties with geospatial capabilities
   */
  async searchNearby(latitude: number, longitude: number, _radiusKm: number = 10, query?: PropertyQueryDto) {
    try {
      // For now, we'll implement a basic text-based search
      // In a production environment, you would use PostGIS or similar for true geospatial queries
      const where: Record<string, any> = {
        location: { contains: '', mode: 'insensitive' }, // Basic location filter
      };

      // Apply additional filters from query
      if (query?.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      if (query?.type) {
        where.propertyType = query.type;
      }

      if (query?.status) {
        where.status = this.mapPropertyStatus(query.status);
      }

      if (query?.minPrice !== undefined || query?.maxPrice !== undefined) {
        where.price = {};
        if (query.minPrice !== undefined) {
          where.price.gte = query.minPrice;
        }
        if (query.maxPrice !== undefined) {
          where.price.lte = query.maxPrice;
        }
      }

      const properties = await (this.prisma as any).property.findMany({
        where,
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      });

      // TODO: Implement actual distance calculation when geospatial data is available
      // For now, return all filtered properties
      return {
        properties,
        total: properties.length,
      };
    } catch (error) {
      this.logger.error('Failed to search nearby properties', error);
      throw new BadRequestException('Failed to search nearby properties');
    }
  }

  /**
   * Update property status with workflow validation
   */
  async updateStatus(id: string, newStatus: DTOPropertyStatus, userId?: string) {
    try {
      const property = await (this.prisma as any).property.findUnique({
        where: { id },
      });

      if (!property) {
        throw new NotFoundException(`Property with ID ${id} not found`);
      }

      const currentStatus = property.status;
      const targetStatus = this.mapPropertyStatus(newStatus);

      // Validate status transition
      if (!this.isValidStatusTransition(property.status, targetStatus)) {
        throw new BadRequestException(`Invalid status transition from ${currentStatus} to ${targetStatus}`);
      }

      const updatedProperty = await (this.prisma as any).property.update({
        where: { id },
        data: { status: targetStatus },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      });

      this.logger.log(
        `Property status updated: ${id} from ${currentStatus} to ${targetStatus}${userId ? ` by user ${userId}` : ''}`,
      );

      return updatedProperty;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to update property status ${id}`, error);
      throw new BadRequestException('Failed to update property status');
    }
  }

  /**
   * Get properties by owner
   */
  async findByOwner(ownerId: string, query?: PropertyQueryDto) {
    try {
      const ownerQuery = { ...query, ownerId };
      const result = await this.findAll(ownerQuery);
      return {
        properties: result.properties,
        total: result.total,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch properties for owner ${ownerId}`, error);
      throw new BadRequestException('Failed to fetch owner properties');
    }
  }

  /**
   * Get property statistics
   */
  async getStatistics(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    averagePrice: number;
  }> {
    try {
      const [total, avgPrice] = await Promise.all([
        (this.prisma as any).property.count(),
        (this.prisma as any).property.aggregate({ _avg: { price: true } }),
        (this.prisma as any).property.count({ where: { status: 'LISTED' } }),
      ]);

      const statusResult = await (this.prisma as any).property.groupBy({
        by: ['status'],
        _count: {
          id: true,
        },
      });

      const typeResult = await (this.prisma as any).property.groupBy({
        by: ['propertyType'],
        _count: {
          id: true,
        },
      });

      const byStatus = (statusResult || []).reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      );

      const byType = (typeResult || []).reduce(
        (acc, item) => {
          acc[item.propertyType] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      );

      return {
        total,
        byStatus,
        byType,
        averagePrice: Number(avgPrice._avg.price || 0),
      };
    } catch (error) {
      this.logger.error('Failed to fetch property statistics', error);
      throw new BadRequestException('Failed to fetch property statistics');
    }
  }

  /**
   * Helper method to format address into location string
   */
  private formatAddress(address: any): string {
    const parts = [address.street, address.city, address.state, address.postalCode, address.country].filter(Boolean);
    return parts.join(', ');
  }

  /**
   * Helper method to map DTO status to Prisma status
   */
  private mapPropertyStatus(status: DTOPropertyStatus): string {
    const statusMap: Record<DTOPropertyStatus, string> = {
      [DTOPropertyStatus.AVAILABLE]: 'LISTED',
      [DTOPropertyStatus.PENDING]: 'PENDING',
      [DTOPropertyStatus.SOLD]: 'SOLD',
      [DTOPropertyStatus.RENTED]: 'SOLD', // Map RENTED to SOLD for now
    };
    return statusMap[status] || 'DRAFT';
  }

  /**
   * Helper method to validate status transitions
   */
  private isValidStatusTransition(currentStatus: string, targetStatus: string): boolean {
    const validTransitions: Record<string, string[]> = {
      DRAFT: ['DRAFT', 'PENDING', 'APPROVED'],
      PENDING: ['PENDING', 'APPROVED', 'DRAFT'],
      APPROVED: ['APPROVED', 'LISTED', 'DRAFT'],
      LISTED: ['LISTED', 'SOLD', 'REMOVED'],
      SOLD: ['SOLD'],
      REMOVED: ['REMOVED', 'DRAFT'],
    };

    return validTransitions[currentStatus]?.includes(targetStatus) || false;
  }
}
