import * as CircuitBreaker from 'opossum';
import { InternalServerErrorException } from '@nestjs/common';

export async function withResilience<T>(
  action: () => Promise<T>,
  options: {
    name: string;
    retries?: number;
    fallback?: (err: any) => T | Promise<T>;
  },
): Promise<T> {
  const breaker = new CircuitBreaker(action, {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  });

  breaker.fallback(
    options.fallback ||
      (err => {
        throw new InternalServerErrorException(`${options.name} failed and no fallback available.`);
      }),
  );
  let attempt = 0;
  const maxRetries = options.retries || 3;

  while (attempt < maxRetries) {
    try {
      return await breaker.fire();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries || breaker.opened) {
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
