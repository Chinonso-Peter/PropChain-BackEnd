import { IsString, IsOptional, IsArray, IsInt, Min, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ApiKeyScope } from '../enums/api-key-scope.enum';

export class UpdateApiKeyDto {
  @ApiProperty({
    description: 'Friendly name for the API key',
    example: 'Updated Integration Key',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Scopes/permissions for the API key',
    example: ['read:properties'],
    enum: ApiKeyScope,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  scopes?: string[];

  @ApiProperty({
    description: 'Rate limit (requests per minute) for this key',
    example: 200,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimit?: number;
}
