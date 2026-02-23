import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/propchain_test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  
  // Mock console methods to reduce noise in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(async () => {
  // Restore console methods
  jest.restoreAllMocks();
});

// Global test timeout
jest.setTimeout(30000);

// Global test utilities
(global as any).createTestModule = async (imports: any[], providers: any[] = []) => {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({
          NODE_ENV: 'test',
          DATABASE_URL: 'postgresql://test:test@localhost:5432/propchain_test',
          JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-characters-long',
          JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-that-is-long-enough',
          JWT_EXPIRES_IN: '1h',
          REDIS_URL: 'redis://localhost:6379/1',
          S3_BUCKET: 'test-bucket',
          S3_REGION: 'us-east-1',
          ENCRYPTION_KEY: 'test-encryption-key-32-chars-long-1234567890',
          RPC_URL: 'http://localhost:8545',
          PRIVATE_KEY: 'test-private-key-that-is-long-enough-for-testing',
          SESSION_SECRET: 'test-session-secret-32-chars-long-1234567890',
        })],
      }),
      ...imports,
    ],
    providers,
  }).compile();
};

// Mock data generators
(global as any).generateMockUser = (overrides = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  password: 'hashedPassword',
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
  isVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

(global as any).generateMockProperty = (overrides = {}) => ({
  id: 'property-123',
  title: 'Test Property',
  description: 'A beautiful test property',
  price: 500000,
  type: 'RESIDENTIAL',
  status: 'AVAILABLE',
  bedrooms: 3,
  bathrooms: 2,
  squareFootage: 2000,
  address: {
    street: '123 Test St',
    city: 'Test City',
    state: 'TS',
    zipCode: '12345',
    country: 'Test Country',
    latitude: 40.7128,
    longitude: -74.0060,
  },
  userId: 'user-123',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

(global as any).generateMockApiKey = (overrides = {}) => ({
  id: 'api-key-123',
  name: 'Test API Key',
  key: 'test-api-key-123',
  userId: 'user-123',
  scopes: ['properties:read', 'properties:write'],
  isActive: true,
  dailyLimit: 1000,
  monthlyLimit: 30000,
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});
