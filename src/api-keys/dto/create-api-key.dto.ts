import { IsString, IsNotEmpty, IsArray, IsOptional, IsInt, Min, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ApiKeyScope } from '../enums/api-key-scope.enum';

export class CreateApiKeyDto {
  @ApiProperty({
    description: 'Friendly name for the API key',
    example: 'Production Integration Key',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Scopes/permissions for the API key',
    example: ['read:properties', 'write:properties'],
    enum: ApiKeyScope,
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopes: string[];

  @ApiProperty({
    description: 'Rate limit (requests per minute) for this key. If not provided, uses global default.',
    example: 100,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimit?: number;
}
