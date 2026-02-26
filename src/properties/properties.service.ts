import { Injectable, Logger } from '@nestjs/common';
import { NotFoundException, UserNotFoundException, InvalidInputException, BusinessRuleViolationException } from '../common/errors/custom.exceptions';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreatePropertyDto, PropertyStatus as DTOPropertyStatus } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyQueryDto } from './dto/property-query.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) { }

  async create(createPropertyDto: CreatePropertyDto, ownerId: string) {
    try {
      const owner = await (this.prisma as any).user.findUnique({
        where: { id: ownerId },
      });

      if (!owner) {
        throw new UserNotFoundException(ownerId);
      }

      const location = this.formatAddress(createPropertyDto.address);

      const property = await (this.prisma as any).property.create({
        data: {
          title: createPropertyDto.title,
          description: createPropertyDto.description,
          location,
          price: createPropertyDto.price,
          status: this.mapPropertyStatus(createPropertyDto.status || DTOPropertyStatus.AVAILABLE),
          ownerId,
          bedrooms: createPropertyDto.bedrooms,
          bathrooms: createPropertyDto.bathrooms,
          squareFootage: createPropertyDto.areaSqFt,
          propertyType: createPropertyDto.type,
        },
        include: {
          owner: {
            select: { id: true, email: true, role: true },
          },
        },
      });

      this.logger.log(`Property created: ${property.id} by user ${ownerId}`);
      return property;
    } catch (error) {
      if (error instanceof UserNotFoundException || error instanceof InvalidInputException) {
        throw error;
      }
      this.logger.error('Failed to create property', error);
      throw new InvalidInputException(undefined, 'Failed to create property');
    }
  }

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
      minBathrooms,
      maxBathrooms,
      minArea,
      maxArea,
      ownerId,
    } = query || {};

    const skip = (page - 1) * limit;
    const where: Record<string, any> = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (type) {
      where.propertyType = type;
    }

    if (status) {
      where.status = this.mapPropertyStatus(status);
    }

    if (city || country) {
      const locationParts: string[] = [];
      if (city) locationParts.push(city);
      if (country) locationParts.push(country);
      where.location = { contains: locationParts.join(', '), mode: 'insensitive' };
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (minBedrooms !== undefined || maxBedrooms !== undefined) {
      where.bedrooms = {};
      if (minBedrooms !== undefined) where.bedrooms.gte = minBedrooms;
      if (maxBedrooms !== undefined) where.bedrooms.lte = maxBedrooms;
    }

    if (minBathrooms !== undefined || maxBathrooms !== undefined) {
      where.bathrooms = {};
      if (minBathrooms !== undefined) where.bathrooms.gte = minBathrooms;
      if (maxBathrooms !== undefined) where.bathrooms.lte = maxBathrooms;
    }

    if (minArea !== undefined || maxArea !== undefined) {
      where.squareFootage = {};
      if (minArea !== undefined) where.squareFootage.gte = minArea;
      if (maxArea !== undefined) where.squareFootage.lte = maxArea;
    }

    if (ownerId) {
      where.ownerId = ownerId;
    }

    try {
      const [properties, total] = await Promise.all([
        (this.prisma as any).property.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            owner: { select: { id: true, email: true, role: true } },
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
      throw new InvalidInputException(undefined, 'Failed to fetch properties');
    }
  }

  async findOne(id: string) {
    try {
      const property = await (this.prisma as any).property.findUnique({
        where: { id },
        include: {
          owner: { select: { id: true, email: true, role: true } },
          documents: { select: { id: true, name: true, type: true, status: true, createdAt: true } },
          valuations: { orderBy: { valuationDate: 'desc' }, take: 5 },
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
      throw new InvalidInputException(undefined, 'Failed to fetch property');
    }
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto) {
    try {
      const existingProperty = await (this.prisma as any).property.findUnique({
        where: { id },
      });

      if (!existingProperty) {
        throw new NotFoundException(`Property with ID ${id} not found`);
      }

      const updateData: any = {};

      if (updatePropertyDto.title !== undefined) updateData.title = updatePropertyDto.title;
      if (updatePropertyDto.description !== undefined) updateData.description = updatePropertyDto.description;
      if (updatePropertyDto.price !== undefined) updateData.price = updatePropertyDto.price;
      if (updatePropertyDto.address) updateData.location = this.formatAddress(updatePropertyDto.address);
      if (updatePropertyDto.status !== undefined) updateData.status = this.mapPropertyStatus(updatePropertyDto.status);
      if (updatePropertyDto.bedrooms !== undefined) updateData.bedrooms = updatePropertyDto.bedrooms;
      if (updatePropertyDto.bathrooms !== undefined) updateData.bathrooms = updatePropertyDto.bathrooms;
      if (updatePropertyDto.areaSqFt !== undefined) updateData.squareFootage = updatePropertyDto.areaSqFt;
      if (updatePropertyDto.type !== undefined) updateData.propertyType = updatePropertyDto.type;

      const property = await (this.prisma as any).property.update({
        where: { id },
        data: updateData,
        include: {
          owner: { select: { id: true, email: true, role: true } },
        },
      });

      this.logger.log(`Property updated: ${property.id}`);
      return property;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof InvalidInputException) {
        throw error;
      }
      this.logger.error(`Failed to update property ${id}`, error);
      throw new InvalidInputException(undefined, 'Failed to update property');
    }
  }

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
      throw new InvalidInputException(undefined, 'Failed to delete property');
    }
  }

  async searchNearby(latitude: number, longitude: number, _radiusKm: number = 10, query?: PropertyQueryDto) {
    try {
      const where: Record<string, any> = {
        location: { contains: '', mode: 'insensitive' },
      };

      if (query?.search) {
        where.OR = [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ];
      }

      if (query?.type) where.propertyType = query.type;
      if (query?.status) where.status = this.mapPropertyStatus(query.status);
      if (query?.minPrice !== undefined || query?.maxPrice !== undefined) {
        where.price = {};
        if (query.minPrice !== undefined) where.price.gte = query.minPrice;
        if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
      }
      if (query?.minBedrooms !== undefined || query?.maxBedrooms !== undefined) {
        where.bedrooms = {};
        if (query.minBedrooms !== undefined) where.bedrooms.gte = query.minBedrooms;
        if (query.maxBedrooms !== undefined) where.bedrooms.lte = query.maxBedrooms;
      }
      if (query?.minBathrooms !== undefined || query?.maxBathrooms !== undefined) {
        where.bathrooms = {};
        if (query.minBathrooms !== undefined) where.bathrooms.gte = query.minBathrooms;
        if (query.maxBathrooms !== undefined) where.bathrooms.lte = query.maxBathrooms;
      }
      if (query?.minArea !== undefined || query?.maxArea !== undefined) {
        where.squareFootage = {};
        if (query.minArea !== undefined) where.squareFootage.gte = query.minArea;
        if (query.maxArea !== undefined) where.squareFootage.lte = query.maxArea;
      }

      const properties = await (this.prisma as any).property.findMany({
        where,
        include: {
          owner: { select: { id: true, email: true, role: true } },
        },
      });

      return { properties, total: properties.length };
    } catch (error) {
      this.logger.error('Failed to search nearby properties', error);
      throw new InvalidInputException(undefined, 'Failed to search nearby properties');
    }
  }

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

      if (!this.isValidStatusTransition(property.status, targetStatus)) {
        throw new BusinessRuleViolationException(`Invalid status transition from ${currentStatus} to ${targetStatus}`);
      }

      const updatedProperty = await (this.prisma as any).property.update({
        where: { id },
        data: { status: targetStatus },
        include: {
          owner: { select: { id: true, email: true, role: true } },
        },
      });

      this.logger.log(`Property status updated: ${id} from ${currentStatus} to ${targetStatus}${userId ? ` by user ${userId}` : ''}`);

      return updatedProperty;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BusinessRuleViolationException) {
        throw error;
      }
      this.logger.error(`Failed to update property status ${id}`, error);
      throw new InvalidInputException(undefined, 'Failed to update property status');
    }
  }

  async findByOwner(ownerId: string, query?: PropertyQueryDto) {
    try {
      const ownerQuery = { ...query, ownerId };
      const result = await this.findAll(ownerQuery);
      return { properties: result.properties, total: result.total };
    } catch (error) {
      this.logger.error(`Failed to fetch properties for owner ${ownerId}`, error);
      throw new InvalidInputException(undefined, 'Failed to fetch owner properties');
    }
  }

  async getStatistics(): Promise<{ total: number; byStatus: Record<string, number>; byType: Record<string, number>; averagePrice: number; }> {
    try {
      const [total, avgPrice] = await Promise.all([
        (this.prisma as any).property.count(),
        (this.prisma as any).property.aggregate({ _avg: { price: true } }),
        (this.prisma as any).property.count({ where: { status: 'LISTED' } }),
      ]);

      const statusResult = await (this.prisma as any).property.groupBy({
        by: ['status'],
        _count: { id: true },
      });

      const typeResult = await (this.prisma as any).property.groupBy({
        by: ['propertyType'],
        _count: { id: true },
      });

      const byStatus = (statusResult || []).reduce((acc: Record<string, number>, item: { status: string; _count: number }) => {
        acc[item.status] = item._count;
        return acc;
      }, {} as Record<string, number>);

      const byType = (typeResult || []).reduce((acc: Record<string, number>, item: { propertyType: string; _count: number }) => {
        acc[item.propertyType] = item._count;
        return acc;
      }, {} as Record<string, number>);

      return { total, byStatus, byType, averagePrice: Number(avgPrice._avg.price || 0) };
    } catch (error) {
      this.logger.error('Failed to fetch property statistics', error);
      throw new InvalidInputException(undefined, 'Failed to fetch property statistics');
    }
  }

  private formatAddress(address: any): string {
    const parts = [address.street, address.city, address.state, address.postalCode, address.country].filter(Boolean);
    return parts.join(', ');
  }

  private mapPropertyStatus(status: DTOPropertyStatus): string {
    const statusMap: Record<DTOPropertyStatus, string> = {
      [DTOPropertyStatus.AVAILABLE]: 'LISTED',
      [DTOPropertyStatus.PENDING]: 'PENDING',
      [DTOPropertyStatus.SOLD]: 'SOLD',
      [DTOPropertyStatus.RENTED]: 'SOLD',
    };
    return statusMap[status] || 'DRAFT';
  }

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
