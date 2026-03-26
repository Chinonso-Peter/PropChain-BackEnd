import { Controller, Get, Post, Param, Body, ValidationPipe, HttpCode, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { ValuationService } from './valuation.service';
import { ValuationResult } from './valuation.types';
import { PropertyFeaturesDto } from './dto/property-features.dto';
import { BatchValuationRequestDto } from './dto/batch-valuation-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiStandardErrorResponse } from '../common/errors/api-standard-error-response.decorator';

@ApiTags('valuation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('valuation')
export class ValuationController {
  private readonly logger = new Logger(ValuationController.name);

  constructor(private readonly valuationService: ValuationService) {}

  @Post(':propertyId')
  @ApiOperation({ summary: 'Get property valuation' })
  @ApiParam({ name: 'propertyId', description: 'ID of the property to value' })
  @ApiBody({ type: PropertyFeaturesDto, description: 'Property features for valuation', required: false })
  @ApiResponse({ status: 200, description: 'Property valuation successful' })
  @ApiStandardErrorResponse([400, 401, 404, 422])
  @HttpCode(HttpStatus.OK)
  async getValuation(
    @Param('propertyId') propertyId: string,
    @Body() features?: PropertyFeaturesDto,
  ): Promise<ValuationResult> {
    this.logger.log(`Requesting valuation for property ${propertyId}`);
    return this.valuationService.getValuation(propertyId, features);
  }

  @Get(':propertyId/history')
  @ApiOperation({ summary: 'Get property valuation history' })
  @ApiParam({ name: 'propertyId', description: 'ID of the property' })
  @ApiResponse({ status: 200, description: 'Property valuation history retrieved' })
  @ApiStandardErrorResponse([401, 404])
  async getPropertyHistory(@Param('propertyId') propertyId: string): Promise<ValuationResult[]> {
    this.logger.log(`Requesting valuation history for property ${propertyId}`);
    return this.valuationService.getPropertyHistory(propertyId);
  }

  @Get('trends/:location')
  @ApiOperation({ summary: 'Get market trend analysis for a location' })
  @ApiParam({ name: 'location', description: 'Location (address or ZIP) to analyze market trends' })
  @ApiResponse({ status: 200, description: 'Market trend analysis retrieved' })
  @ApiStandardErrorResponse([400, 401, 404])
  async getMarketTrendAnalysis(@Param('location') location: string) {
    this.logger.log(`Requesting market trend analysis for location ${location}`);
    return this.valuationService.getMarketTrendAnalysis(location);
  }

  @Get(':propertyId/latest')
  @ApiOperation({ summary: 'Get latest valuation for a property', description: 'Retrieves the most recent valuation from history.' })
  @ApiParam({ name: 'propertyId', description: 'ID of the property' })
  @ApiResponse({ status: 200, description: 'Latest valuation retrieved' })
  @ApiStandardErrorResponse([401, 404])
  async getLatestValuation(@Param('propertyId') propertyId: string): Promise<ValuationResult> {
    const history = await this.valuationService.getPropertyHistory(propertyId);
    if (history.length === 0) {
      throw new Error(`No valuations found for property ${propertyId}`);
    }
    return history[0]; // Latest is first since ordered by desc date
  }

  @Post('batch')
  @ApiOperation({ summary: 'Get valuations for multiple properties', description: 'Processes a batch of property IDs and optional features for valuation.' })
  @ApiBody({ type: BatchValuationRequestDto })
  @ApiResponse({ status: 200, description: 'Batch valuations processed.' })
  @ApiStandardErrorResponse([400, 401])
  @HttpCode(HttpStatus.OK)
  async getBatchValuations(
    @Body() requestBody: BatchValuationRequestDto,
  ) {
    const results = [];
    for (const item of requestBody.properties) {
      try {
        const valuation = await this.valuationService.getValuation(item.propertyId, item.features);
        results.push({ propertyId: item.propertyId, valuation, status: 'success' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ propertyId: item.propertyId, error: errorMessage, status: 'error' });
      }
    }
    return results;
  }
}
