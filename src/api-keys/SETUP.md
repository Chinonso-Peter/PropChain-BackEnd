# API Key System - Setup Checklist

Follow these steps to complete the API key authentication setup:

## ✅ Prerequisites

- [x] Prisma schema updated with ApiKey model
- [x] API key service, controller, and guard created
- [x] Module integrated into AppModule
- [x] Unit and integration tests created

## 🚀 Required Steps

### 1. Set Environment Variable

Add to your `.env` file (create if it doesn't exist):

```bash
# Must be at least 32 characters long
ENCRYPTION_KEY=your-secure-32-character-encryption-key-here-minimum
```

**Generate a secure key:**
```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: Using OpenSSL
openssl rand -hex 32

# Option 3: Using Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Run Database Migration

Create and apply the migration for the `api_keys` table:

```bash
# Create migration
npx prisma migrate dev --name add_api_keys

# Or if migration already exists
npx prisma migrate dev
```

### 3. Generate Prisma Client

Update the Prisma client with the new ApiKey model:

```bash
npx prisma generate
```

### 4. Verify Installation

Check that everything is working:

```bash
# Run unit tests
npm run test -- api-key.service.spec.ts

# Run integration tests (requires database)
npm run test:e2e -- api-key.e2e-spec.ts

# Start the application
npm run start:dev
```

### 5. Create Your First API Key

Once the server is running:

1. **Register/Login** to get a JWT token:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

2. **Create an API key**:
```bash
curl -X POST http://localhost:3000/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Integration",
    "description": "Testing API keys",
    "scopes": ["read:properties", "write:properties"],
    "rateLimit": 60
  }'
```

3. **Save the returned API key** - it will only be shown once!

### 6. Test API Key Authentication

Test the API key works:

```bash
# Using X-API-Key header
curl -H "X-API-Key: propchain_test_YOUR_KEY" \
  http://localhost:3000/health

# Using Authorization header
curl -H "Authorization: Bearer propchain_test_YOUR_KEY" \
  http://localhost:3000/health
```

## 📝 Next Steps

### Protect Your Routes

Apply the API key guard to routes that should accept API key authentication:

```typescript
import { UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { ApiKeyScopes } from '../common/decorators/api-key-scopes.decorator';

@Controller('your-resource')
export class YourController {
  @Get()
  @UseGuards(ApiKeyGuard)
  @ApiKeyScopes('read:properties')
  yourMethod() {
    // Protected with API key
  }
}
```

See `src/api-keys/examples/properties-with-api-keys.example.ts` for detailed examples.

### Add Custom Scopes

To add new scopes for your specific use case:

1. Define scope constants (optional but recommended):
```typescript
// src/api-keys/constants/scopes.ts
export const API_KEY_SCOPES = {
  // Properties
  READ_PROPERTIES: 'read:properties',
  WRITE_PROPERTIES: 'write:properties',
  
  // Transactions
  READ_TRANSACTIONS: 'read:transactions',
  WRITE_TRANSACTIONS: 'write:transactions',
  
  // Add your custom scopes here
  READ_ANALYTICS: 'read:analytics',
  ADMIN_ACCESS: 'admin:all',
} as const;
```

2. Use the scopes in your controllers:
```typescript
@ApiKeyScopes(API_KEY_SCOPES.READ_ANALYTICS)
```

### Configure Swagger/OpenAPI

The API key endpoints are already documented with Swagger. To add API key authentication to Swagger UI, update your `main.ts`:

```typescript
const config = new DocumentBuilder()
  .setTitle('PropChain API')
  .addBearerAuth()
  .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'X-API-Key')
  .build();
```

## 🔒 Security Checklist

- [ ] `ENCRYPTION_KEY` is set and at least 32 characters
- [ ] `ENCRYPTION_KEY` is not committed to version control
- [ ] Production uses `propchain_live_` prefix (NODE_ENV=production)
- [ ] Test environment uses `propchain_test_` prefix
- [ ] Rate limits are configured appropriately
- [ ] Minimum necessary scopes are granted to each key
- [ ] API keys are stored securely by clients
- [ ] Monitoring is in place for suspicious usage patterns

## 📊 Monitoring

Track API key usage:

```bash
# List all API keys with usage statistics
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api-keys
```

Check the response for:
- `requestCount` - Total requests made
- `lastUsedAt` - Last time the key was used
- `isActive` - Whether the key is still active

## 🐛 Troubleshooting

### Migration Issues

If migration fails:
```bash
# Reset database (⚠️ WARNING: This deletes all data)
npx prisma migrate reset

# Or manually create migration
npx prisma migrate dev --create-only --name add_api_keys
# Then edit the migration file if needed
npx prisma migrate dev
```

### Encryption Errors

If you see "ENCRYPTION_KEY must be at least 32 characters":
```bash
# Verify your .env file has the key
cat .env | grep ENCRYPTION_KEY

# Generate a new one if needed
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rate Limiting Issues

If requests are being rate limited unexpectedly:
- Current implementation is simple (checks lastUsedAt within 1 minute)
- For production, consider implementing Redis-based rate limiting
- See `RedisService` for integration

## 📚 Resources

- [README.md](./README.md) - Full documentation
- [examples/](./examples/) - Code examples
- [Test files](../../test/api-keys/) - Test examples

## ✅ Setup Complete!

Once all steps are completed, your API key authentication system is ready to use! 🎉
