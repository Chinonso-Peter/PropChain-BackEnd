import { SetMetadata } from '@nestjs/common';
import { RateLimitOptions } from '../guards/advanced-rate-limit.guard';

export const RateLimit = (options?: RateLimitOptions) => SetMetadata('rateLimitOptions', options || {});
