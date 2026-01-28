import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { UpdateApiKeyDto } from './dto/update-api-key.dto';
import { ApiKeyResponseDto, CreateApiKeyResponseDto } from './dto/api-key-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('API Keys')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) { }

  @Post()
  @ApiOperation({
    summary: 'Create a new API key',
    description: 'Generate a new API key for external service integration. The full key is only shown once.',
  })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully',
    type: CreateApiKeyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid scopes provided' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(@Body() createApiKeyDto: CreateApiKeyDto): Promise<CreateApiKeyResponseDto> {
    return this.apiKeyService.create(createApiKeyDto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all API keys',
    description: 'Retrieve all API keys with partial key display',
  })
  @ApiResponse({
    status: 200,
    description: 'List of API keys retrieved successfully',
    type: [ApiKeyResponseDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(): Promise<ApiKeyResponseDto[]> {
    return this.apiKeyService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get API key details',
    description: 'Retrieve details of a specific API key by ID',
  })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({
    status: 200,
    description: 'API key details retrieved successfully',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findOne(@Param('id') id: string): Promise<ApiKeyResponseDto> {
    return this.apiKeyService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update API key',
    description: 'Update API key settings (name, scopes, rate limit)',
  })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({
    status: 200,
    description: 'API key updated successfully',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async update(
    @Param('id') id: string,
    @Body() updateApiKeyDto: UpdateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    return this.apiKeyService.update(id, updateApiKeyDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke API key',
    description: 'Revoke (soft delete) an API key, making it inactive',
  })
  @ApiParam({ name: 'id', description: 'API key ID' })
  @ApiResponse({ status: 204, description: 'API key revoked successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async revoke(@Param('id') id: string): Promise<void> {
    return this.apiKeyService.revoke(id);
  }
}
