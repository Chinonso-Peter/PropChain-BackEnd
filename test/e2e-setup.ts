import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

// E2E test setup
beforeAll(async () => {
  // Set E2E test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgresql://test:test@localhost:5432/propchain_e2e';
  process.env.REDIS_URL = process.env.E2E_REDIS_URL || 'redis://localhost:6379/3';
  process.env.PORT = '0'; // Use random port
  
  console.log('Setting up E2E test environment...');
});

afterAll(async () => {
  console.log('Cleaning up E2E test environment...');
});

// E2E test utilities
(global as any).createE2ETestApp = async (moduleImports: any[] = []) => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => ({
          NODE_ENV: 'test',
          DATABASE_URL: process.env.DATABASE_URL,
          REDIS_URL: process.env.REDIS_URL,
          JWT_SECRET: 'e2e-test-jwt-secret',
          JWT_EXPIRES_IN: '1h',
          S3_BUCKET: 'e2e-test-bucket',
          S3_REGION: 'us-east-1',
          PORT: '0',
        })],
      }),
      ...moduleImports,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  
  // Configure app for testing
  app.enableCors({
    origin: '*',
    credentials: true,
  });
  
  await app.init();
  
  return app;
};

// HTTP request utilities
(global as any).makeRequest = (app: INestApplication) => {
  const agent = request.agent(app.getHttpServer());
  
  return {
    get: (url: string) => agent.get(url),
    post: (url: string) => agent.post(url),
    put: (url: string) => agent.put(url),
    patch: (url: string) => agent.patch(url),
    delete: (url: string) => agent.delete(url),
    
    // Auth helpers
    withAuth: (token: string) => ({
      get: (url: string) => agent.get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) => agent.post(url).set('Authorization', `Bearer ${token}`),
      put: (url: string) => agent.put(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) => agent.patch(url).set('Authorization', `Bearer ${token}`),
      delete: (url: string) => agent.delete(url).set('Authorization', `Bearer ${token}`),
    }),
    
    // API key helpers
    withApiKey: (apiKey: string) => ({
      get: (url: string) => agent.get(url).set('X-API-Key', apiKey),
      post: (url: string) => agent.post(url).set('X-API-Key', apiKey),
      put: (url: string) => agent.put(url).set('X-API-Key', apiKey),
      patch: (url: string) => agent.patch(url).set('X-API-Key', apiKey),
      delete: (url: string) => agent.delete(url).set('X-API-Key', apiKey),
    }),
  };
};

// Test data factories for E2E
(global as any).createE2ETestUser = async (app: INestApplication) => {
  const response = await (global as any).makeRequest(app)
    .post('/auth/register')
    .send({
      email: 'e2e-test@example.com',
      password: 'TestPassword123!',
      firstName: 'E2E',
      lastName: 'Test',
    })
    .expect(201);

  return response.body;
};

(global as any).loginE2ETestUser = async (app: INestApplication, email: string, password: string) => {
  const response = await (global as any).makeRequest(app)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return response.body.access_token;
};

(global as any).createE2ETestProperty = async (app: INestApplication, token: string) => {
  const response = await (global as any).makeRequest(app)
    .withAuth(token)
    .post('/properties')
    .send({
      title: 'E2E Test Property',
      description: 'Property for E2E testing',
      price: 850000,
      type: 'RESIDENTIAL',
      status: 'AVAILABLE',
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1800,
      address: {
        street: '789 E2E Street',
        city: 'Test City',
        state: 'TS',
        zipCode: '11223',
        country: 'Test Country',
        latitude: 40.7614,
        longitude: -73.9776,
      },
    })
    .expect(201);

  return response.body;
};

// Flow testing utilities
(global as any).testUserFlow = async (app: INestApplication) => {
  // 1. Register user
  const user = await (global as any).createE2ETestUser(app);
  
  // 2. Login user
  const token = await (global as any).loginE2ETestUser(app, 'e2e-test@example.com', 'TestPassword123!');
  
  // 3. Create property
  const property = await (global as any).createE2ETestProperty(app, token);
  
  // 4. Get property
  const retrievedProperty = await (global as any).makeRequest(app)
    .withAuth(token)
    .get(`/properties/${property.id}`)
    .expect(200);
  
  // 5. Update property
  const updatedProperty = await (global as any).makeRequest(app)
    .withAuth(token)
    .patch(`/properties/${property.id}`)
    .send({ status: 'PENDING' })
    .expect(200);
  
  // 6. Delete property
  await (global as any).makeRequest(app)
    .withAuth(token)
    .delete(`/properties/${property.id}`)
    .expect(200);
  
  return { user, token, property };
};
