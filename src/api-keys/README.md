# API Key Authentication System

## Overview

The API Key authentication system provides secure authentication for external services and integrations. API keys are encrypted at rest, have configurable rate limits, and support scope-based permissions.

## Features

- ✅ **Secure Storage**: Keys encrypted using AES encryption with `ENCRYPTION_KEY`
- ✅ **One-time Display**: Full API key shown only once at creation
- ✅ **Scope-based Permissions**: Control access to specific resources
- ✅ **Rate Limiting**: Configurable per-key or global rate limits (requests per minute)
- ✅ **Usage Tracking**: Track request count and last used timestamp
- ✅ **Revocation**: Soft-delete keys to deactivate them

## API Key Format

```
propchain_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

- **Prefix**: `propchain_live_` (environment identifier)
- **Length**: 32 random characters after prefix
- **Total**: 48 characters

## Available Scopes

```typescript
- read:properties    - Read access to property data
- write:properties   - Create/update property data
- read:transactions  - Read access to transaction data
```

## API Endpoints

### Create API Key

```http
POST /api-keys
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Production Integration Key",
  "scopes": ["read:properties", "write:properties"],
  "rateLimit": 100  // Optional, defaults to global limit
}
```

**Response** (201 Created):
```json
{
  "id": "cly1234567890",
  "name": "Production Integration Key",
  "key": "propchain_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "keyPrefix": "propchain_live_a1b2c3d4",
  "scopes": ["read:properties", "write:properties"],
  "requestCount": "0",
  "lastUsedAt": null,
  "isActive": true,
  "rateLimit": 100,
  "createdAt": "2026-01-22T10:00:00.000Z",
  "updatedAt": "2026-01-22T10:00:00.000Z"
}
```

⚠️ **Important**: Save the full `key` value immediately - it will never be shown again!

### List API Keys

```http
GET /api-keys
Authorization: Bearer <jwt_token>
```

**Response** (200 OK):
```json
[
  {
    "id": "cly1234567890",
    "name": "Production Integration Key",
    "keyPrefix": "propchain_live_a1b2c3d4",
    "scopes": ["read:properties", "write:properties"],
    "requestCount": "12345",
    "lastUsedAt": "2026-01-22T15:30:00.000Z",
    "isActive": true,
    "rateLimit": 100,
    "createdAt": "2026-01-22T10:00:00.000Z",
    "updatedAt": "2026-01-22T10:00:00.000Z"
  }
]
```

### Get API Key Details

```http
GET /api-keys/:id
Authorization: Bearer <jwt_token>
```

### Update API Key

```http
PATCH /api-keys/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Updated Key Name",
  "scopes": ["read:properties"],
  "rateLimit": 200
}
```

### Revoke API Key

```http
DELETE /api-keys/:id
Authorization: Bearer <jwt_token>
```

**Response**: 204 No Content

## Using API Keys

### Option 1: Authorization Header

```http
GET /properties
Authorization: Bearer propchain_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### Option 2: X-API-Key Header

```http
GET /properties
X-API-Key: propchain_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

## Protecting Routes with API Keys

### Using the API Key Guard

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RequireScopes } from '../common/decorators/require-scopes.decorator';
import { ApiKey } from '../common/decorators/api-key.decorator';

@Controller('properties')
@UseGuards(ApiKeyGuard)
export class PropertiesController {
  
  @Get()
  @RequireScopes('read:properties')
  async findAll(@ApiKey() apiKey: any) {
    // apiKey contains: { id, name, scopes, rateLimit }
    console.log(`Request from API key: ${apiKey.name}`);
    // Your logic here
  }

  @Post()
  @RequireScopes('write:properties')
  async create(@ApiKey() apiKey: any, @Body() createDto: any) {
    // Only keys with 'write:properties' scope can access this
  }
}
```

### Protecting Specific Endpoints

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RequireScopes } from '../common/decorators/require-scopes.decorator';

@Controller('external-api')
export class ExternalApiController {
  
  // This endpoint requires API key with read:properties scope
  @Get('properties')
  @UseGuards(ApiKeyGuard)
  @RequireScopes('read:properties')
  async getProperties() {
    return { data: 'properties' };
  }

  // This endpoint requires multiple scopes
  @Post('properties')
  @UseGuards(ApiKeyGuard)
  @RequireScopes('read:properties', 'write:properties')
  async createProperty() {
    return { success: true };
  }
}
```

## Rate Limiting

### Global Rate Limit

Set in environment variables:

```env
API_KEY_RATE_LIMIT_PER_MINUTE=60
```

### Per-Key Rate Limit

Specify when creating or updating an API key:

```json
{
  "name": "High Volume Integration",
  "scopes": ["read:properties"],
  "rateLimit": 1000
}
```

Rate limits are enforced using Redis with a sliding window of 1 minute.

### Rate Limit Errors

When rate limit is exceeded:

```json
{
  "statusCode": 401,
  "message": "Rate limit exceeded"
}
```

## Security Best Practices

1. **Store Securely**: Save API keys in environment variables or secure vaults, never in code
2. **Use HTTPS**: Always use HTTPS in production to protect keys in transit
3. **Minimum Scopes**: Grant only the minimum required scopes
4. **Rotate Regularly**: Create new keys and revoke old ones periodically
5. **Monitor Usage**: Check `requestCount` and `lastUsedAt` to detect anomalies
6. **Set Rate Limits**: Configure appropriate rate limits for each integration

## Environment Variables

Add to your `.env` file:

```env
# Required for encryption
ENCRYPTION_KEY=your-32-character-encryption-key-here

# Optional rate limit configuration
API_KEY_RATE_LIMIT_PER_MINUTE=60
```

⚠️ **Important**: `ENCRYPTION_KEY` must be exactly 32 characters for AES-256 encryption.

## Example Integration

### Node.js/JavaScript

```javascript
const axios = require('axios');

const API_KEY = 'propchain_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
const BASE_URL = 'https://api.propchain.io';

// Using Authorization header
const response = await axios.get(`${BASE_URL}/properties`, {
  headers: {
    'Authorization': `Bearer ${API_KEY}`
  }
});

// Or using X-API-Key header
const response = await axios.get(`${BASE_URL}/properties`, {
  headers: {
    'X-API-Key': API_KEY
  }
});
```

### Python

```python
import requests

API_KEY = 'propchain_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
BASE_URL = 'https://api.propchain.io'

# Using Authorization header
response = requests.get(
    f'{BASE_URL}/properties',
    headers={'Authorization': f'Bearer {API_KEY}'}
)

# Or using X-API-Key header
response = requests.get(
    f'{BASE_URL}/properties',
    headers={'X-API-Key': API_KEY}
)
```

### cURL

```bash
# Using Authorization header
curl -H "Authorization: Bearer propchain_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \
  https://api.propchain.io/properties

# Using X-API-Key header
curl -H "X-API-Key: propchain_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \
  https://api.propchain.io/properties
```

## Troubleshooting

### "Invalid API key format"
- Ensure the key starts with `propchain_live_`
- Check for extra spaces or line breaks

### "Invalid or revoked API key"
- Key might be revoked - check with `GET /api-keys/:id`
- Key might be from a different environment

### "Insufficient permissions"
- Check that the API key has the required scopes
- Update scopes with `PATCH /api-keys/:id`

### "Rate limit exceeded"
- Wait 1 minute for the rate limit window to reset
- Or increase the rate limit for the key

## Testing

Run unit tests:
```bash
npm run test -- api-key.service.spec.ts
```

Run e2e tests:
```bash
npm run test:e2e -- api-keys.e2e-spec.ts
```

## Database Schema

```prisma
model ApiKey {
  id           String    @id @default(cuid())
  name         String
  key          String    @unique
  keyPrefix    String    @map("key_prefix")
  scopes       String[]
  requestCount BigInt    @default(0) @map("request_count")
  lastUsedAt   DateTime? @map("last_used_at")
  isActive     Boolean   @default(true) @map("is_active")
  rateLimit    Int?      @map("rate_limit")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("api_keys")
}
```
