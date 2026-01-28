import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService } from '../../api-keys/api-key.service';
import { REQUIRED_SCOPES_KEY } from '../decorators/require-scopes.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const apiKey = this.extractApiKey(request);
    
    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    const apiKeyData = await this.apiKeyService.validateApiKey(apiKey);
    
    request.apiKey = apiKeyData;

    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredScopes && requiredScopes.length > 0) {
      const hasRequiredScopes = requiredScopes.every(scope =>
        apiKeyData.scopes.includes(scope),
      );

      if (!hasRequiredScopes) {
        throw new UnauthorizedException(
          `Insufficient permissions. Required scopes: ${requiredScopes.join(', ')}`,
        );
      }
    }

    return true;
  }

  private extractApiKey(request: any): string | null {
    const authHeader = request.headers['authorization'];
    
    if (!authHeader) {
      return request.headers['x-api-key'] || null;
    }

    if (authHeader.startsWith('Bearer ') && authHeader.includes('propchain_live_')) {
      return authHeader.substring(7);
    }

    return request.headers['x-api-key'] || null;
  }
}
