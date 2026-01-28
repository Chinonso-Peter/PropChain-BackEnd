/**
 * EXAMPLE: How to protect routes with API Key authentication
 * 
 * This is a sample implementation showing how to use the API key
 * authentication system in your controllers.
 */

import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyScopes } from '../../common/decorators/api-key-scopes.decorator';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesExampleController {
  /**
   * EXAMPLE 1: Public endpoint (no authentication required)
   */
  @Get('public')
  @ApiOperation({ summary: 'Get public properties - no auth required' })
  getPublicProperties() {
    return {
      properties: [
        { id: '1', title: 'Public Property 1', price: 100000 },
        { id: '2', title: 'Public Property 2', price: 200000 },
      ],
    };
  }

  /**
   * EXAMPLE 2: Protected with API key - any valid key works
   */
  @Get()
  @UseGuards(ApiKeyGuard)
  @ApiOperation({ summary: 'Get all properties - API key required' })
  @ApiSecurity('X-API-Key')
  getAllProperties(@Req() req) {
    return {
      message: 'Authenticated with API key',
      apiKeyId: req.apiKey?.id,
      properties: [],
    };
  }

  /**
   * EXAMPLE 3: Protected with API key + read scope
   */
  @Get('detailed')
  @UseGuards(ApiKeyGuard)
  @ApiKeyScopes('read:properties')
  @ApiOperation({ summary: 'Get detailed properties - requires read:properties scope' })
  @ApiSecurity('X-API-Key')
  getDetailedProperties(@Req() req) {
    return {
      message: 'Authenticated with read:properties scope',
      apiKeyId: req.apiKey?.id,
      properties: [],
    };
  }

  /**
   * EXAMPLE 4: Protected with API key + write scope
   */
  @Post()
  @UseGuards(ApiKeyGuard)
  @ApiKeyScopes('write:properties')
  @ApiOperation({ summary: 'Create property - requires write:properties scope' })
  @ApiSecurity('X-API-Key')
  createProperty(@Body() data: any, @Req() req) {
    return {
      message: 'Property created with write:properties scope',
      apiKeyId: req.apiKey?.id,
      apiKeyName: req.apiKey?.name,
      property: data,
    };
  }

  /**
   * EXAMPLE 5: Protected with API key + multiple scopes
   */
  @Post('transfer')
  @UseGuards(ApiKeyGuard)
  @ApiKeyScopes('write:properties', 'read:transactions')
  @ApiOperation({ summary: 'Transfer property - requires multiple scopes' })
  @ApiSecurity('X-API-Key')
  transferProperty(@Body() data: any, @Req() req) {
    return {
      message: 'Property transfer initiated',
      apiKeyId: req.apiKey?.id,
      requiredScopes: ['write:properties', 'read:transactions'],
      transfer: data,
    };
  }
}

/**
 * USAGE EXAMPLES:
 * 
 * 1. Create an API key via the management endpoint:
 * 
 *    POST /api-keys
 *    Authorization: Bearer <JWT_TOKEN>
 *    {
 *      "name": "Mobile App",
 *      "scopes": ["read:properties", "write:properties"],
 *      "rateLimit": 100
 *    }
 * 
 * 2. Use the API key to access protected endpoints:
 * 
 *    GET /properties
 *    X-API-Key: propchain_live_abc123def456...
 * 
 *    or
 * 
 *    GET /properties
 *    Authorization: Bearer propchain_live_abc123def456...
 * 
 * 3. The API key is validated automatically:
 *    - Format check (must start with 'propchain_')
 *    - Active status (not revoked)
 *    - Rate limit check
 *    - Scope verification (if @ApiKeyScopes decorator is used)
 *    - Usage tracking (increments requestCount, updates lastUsedAt)
 * 
 * 4. Access the API key data in your handler:
 * 
 *    @Get()
 *    @UseGuards(ApiKeyGuard)
 *    myHandler(@Req() req) {
 *      const apiKey = req.apiKey;
 *      console.log('Key ID:', apiKey.id);
 *      console.log('Key Name:', apiKey.name);
 *      console.log('Scopes:', apiKey.scopes);
 *      console.log('Rate Limit:', apiKey.rateLimit);
 *      console.log('Request Count:', apiKey.requestCount);
 *    }
 */
