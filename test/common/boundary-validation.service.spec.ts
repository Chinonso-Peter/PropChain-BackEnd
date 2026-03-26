import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { BoundaryValidationService } from '../../src/common/validation';

class ExampleBoundaryDto {
  @IsString()
  name: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number;

  @IsOptional()
  @IsString()
  tag?: string;
}

describe('BoundaryValidationService', () => {
  let service: BoundaryValidationService;

  beforeEach(() => {
    service = new BoundaryValidationService();
  });

  it('transforms payloads into validated DTO instances', async () => {
    const result = await service.validateAndTransform(ExampleBoundaryDto, {
      name: 'properties',
      limit: '5',
    });

    expect(result).toBeInstanceOf(ExampleBoundaryDto);
    expect(result.limit).toBe(5);
  });

  it('returns structured validation errors for invalid payloads', async () => {
    await expect(
      service.validateAndTransform(ExampleBoundaryDto, {
        name: 'properties',
        limit: '0',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        errorCode: 'VALIDATION_ERROR',
        details: expect.arrayContaining(['limit: limit must not be less than 1']),
      }),
    });
  });
});
