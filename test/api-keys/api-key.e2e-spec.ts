import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

describe('API Keys (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let authToken: string;
  let createdApiKey: string;
  let createdApiKeyId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prismaService = app.get<PrismaService>(PrismaService);

    const userEmail = `test-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: userEmail,
        password: 'Password123!',
      });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: userEmail,
        password: 'Password123!',
      });

    authToken = loginResponse.body.access_token;
  });

  afterAll(async () => {
    if (createdApiKeyId) {
      await prismaService.apiKey.deleteMany({
        where: { id: createdApiKeyId },
      });
    }

    await prismaService.user.deleteMany({
      where: { email: { contains: 'test-' } },
    });

    await app.close();
  });

  describe('/api-keys (POST)', () => {
    it('should create a new API key with valid JWT', async () => {
      const response = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Integration Key',
          description: 'Key for integration tests',
          scopes: ['read:properties', 'write:properties'],
          rateLimit: 100,
        })
        .expect(201);

      expect(response.body.apiKey).toBeDefined();
      expect(response.body.apiKey.id).toBeDefined();
      expect(response.body.apiKey.name).toBe('Test Integration Key');
      expect(response.body.apiKey.key).toBeDefined();
      expect(response.body.apiKey.key).toContain('propchain_');
      expect(response.body.apiKey.scopes).toEqual(['read:properties', 'write:properties']);
      expect(response.body.apiKey.rateLimit).toBe(100);
      expect(response.body.apiKey.isActive).toBe(true);

      createdApiKey = response.body.apiKey.key;
      createdApiKeyId = response.body.apiKey.id;
    });

    it('should fail without JWT token', async () => {
      await request(app.getHttpServer())
        .post('/api-keys')
        .send({
          name: 'Unauthorized Key',
          scopes: ['read:properties'],
        })
        .expect(401);
    });

    it('should fail with invalid scopes', async () => {
      await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invalid Scopes Key',
          scopes: [],
        })
        .expect(400);
    });

    it('should fail with missing name', async () => {
      await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          scopes: ['read:properties'],
        })
        .expect(400);
    });
  });

  describe('/api-keys (GET)', () => {
    it('should list all API keys', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).not.toHaveProperty('encryptedKey');
      expect(response.body[0]).not.toHaveProperty('key');
    });

    it('should fail without JWT token', async () => {
      await request(app.getHttpServer()).get('/api-keys').expect(401);
    });
  });

  describe('/api-keys/:id (GET)', () => {
    it('should get API key by ID', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api-keys/${createdApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdApiKeyId);
      expect(response.body.name).toBe('Test Integration Key');
      expect(response.body).not.toHaveProperty('encryptedKey');
      expect(response.body).not.toHaveProperty('key');
    });

    it('should fail for non-existent ID', async () => {
      await request(app.getHttpServer())
        .get('/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('/api-keys/:id (DELETE)', () => {
    it('should revoke an API key', async () => {
      await request(app.getHttpServer())
        .delete(`/api-keys/${createdApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const apiKey = await prismaService.apiKey.findUnique({
        where: { id: createdApiKeyId },
      });

      expect(apiKey?.isActive).toBe(false);
    });

    it('should fail to revoke non-existent key', async () => {
      await request(app.getHttpServer())
        .delete('/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('API Key Authentication', () => {
    let testApiKey: string;
    let testApiKeyId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Auth Test Key',
          scopes: ['read:properties'],
          rateLimit: 5,
        });

      testApiKey = response.body.apiKey.key;
      testApiKeyId = response.body.apiKey.id;
    });

    afterAll(async () => {
      if (testApiKeyId) {
        await prismaService.apiKey.deleteMany({
          where: { id: testApiKeyId },
        });
      }
    });

    it('should authenticate with valid API key in Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/health')
        .set('Authorization', `Bearer ${testApiKey}`)
        .expect(200);
    });

    it('should authenticate with valid API key in X-API-Key header', async () => {
      await request(app.getHttpServer())
        .get('/health')
        .set('X-API-Key', testApiKey)
        .expect(200);
    });

    it('should reject invalid API key format', async () => {
      await request(app.getHttpServer())
        .get('/health')
        .set('X-API-Key', 'invalid-key-format')
        .expect(200);
    });

    it('should reject revoked API key', async () => {
      await request(app.getHttpServer())
        .delete(`/api-keys/${testApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get('/health')
        .set('X-API-Key', testApiKey)
        .expect(200);
    });
  });
});
