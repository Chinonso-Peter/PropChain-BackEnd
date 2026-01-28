import { SetMetadata } from '@nestjs/common';

export const ApiKeyScopes = (...scopes: string[]) => SetMetadata('scopes', scopes);
