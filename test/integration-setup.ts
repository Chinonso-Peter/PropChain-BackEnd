import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

// Integration test setup
beforeAll(async () => {
  // Set integration test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/propchain_integration';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/2';
  
  console.log('Setting up integration test environment...');
});

afterAll(async () => {
  console.log('Cleaning up integration test environment...');
});

// Database cleanup utilities
(global as any).cleanupDatabase = async (prisma: any) => {
  // Clean up in order to respect foreign key constraints
  const tables = [
    'transaction',
    'document',
    'property',
    'api_key',
    'user_session',
    'user',
  ];

  for (const table of tables) {
    try {
      await (prisma as any)[table].deleteMany();
    } catch (error: any) {
      console.warn(`Failed to clean table ${table}:`, error.message);
    }
  }
};

// Redis cleanup utilities
(global as any).cleanupRedis = async (redis: any) => {
  try {
    await redis.flushdb();
  } catch (error: any) {
    console.warn('Failed to flush Redis:', error.message);
  }
};

// Test data seeding utilities
(global as any).seedTestData = async (prisma: any) => {
  // Create test user
  const user = await (prisma as any).user.create({
    data: {
      email: 'integration-test@example.com',
      password: 'hashedPassword',
      firstName: 'Integration',
      lastName: 'Test',
      isActive: true,
      isVerified: true,
    },
  });

  // Create test property
  const property = await (prisma as any).property.create({
    data: {
      title: 'Integration Test Property',
      description: 'Property for integration testing',
      price: 750000,
      type: 'RESIDENTIAL',
      status: 'AVAILABLE',
      bedrooms: 4,
      bathrooms: 3,
      squareFootage: 2500,
      address: {
        street: '456 Integration Ave',
        city: 'Test City',
        state: 'TS',
        zipCode: '67890',
        country: 'Test Country',
        latitude: 40.7589,
        longitude: -73.9851,
      },
      userId: user.id,
    },
  });

  // Create test API key
  const apiKey = await (prisma as any).api_key.create({
    data: {
      name: 'Integration Test API Key',
      key: 'integration-test-key-123',
      userId: user.id,
      scopes: ['properties:read', 'properties:write', 'users:read'],
      isActive: true,
      dailyLimit: 500,
      monthlyLimit: 15000,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
    },
  });

  return { user, property, apiKey };
};

// Integration test module builder
(global as any).createIntegrationTestModule = async (imports: any[], providers: any[] = []) => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({
          NODE_ENV: 'test',
          DATABASE_URL: process.env.DATABASE_URL,
          REDIS_URL: process.env.REDIS_URL,
          JWT_SECRET: 'integration-test-jwt-secret',
          JWT_EXPIRES_IN: '1h',
          S3_BUCKET: 'integration-test-bucket',
          S3_REGION: 'us-east-1',
        })],
      }),
      ...imports,
    ],
    providers,
  }).compile();

  return module;
};
