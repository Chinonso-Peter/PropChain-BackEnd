import { ApiProperty } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({ example: 'cly1234567890abcdef' })
  id: string;

  @ApiProperty({ example: 'Production Integration Key' })
  name: string;

  @ApiProperty({ example: 'propchain_live_abc123...' })
  keyPrefix: string;

  @ApiProperty({ example: ['read:properties', 'write:properties'] })
  scopes: string[];

  @ApiProperty({ example: 12345 })
  requestCount: string;

  @ApiProperty({ example: '2026-01-22T10:30:00.000Z', nullable: true })
  lastUsedAt: Date | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: 100, nullable: true })
  rateLimit: number | null;

  @ApiProperty({ example: '2026-01-15T08:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-22T09:00:00.000Z' })
  updatedAt: Date;
}

export class CreateApiKeyResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    example: 'propchain_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    description: 'Full API key - shown only once at creation',
  })
  key: string;
}
