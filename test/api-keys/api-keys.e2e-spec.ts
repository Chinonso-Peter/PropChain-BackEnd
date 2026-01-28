import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { ApiKeyScope } from '../../src/api-keys/enums/api-key-scope.enum';

describe('ApiKeysController (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let authToken: string;
  let createdApiKeyId: string;
  let fullApiKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    
    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    
    await app.init();

    authToken = await getAuthToken();
  });

  afterAll(async () => {
    if (createdApiKeyId) {
      await prismaService.apiKey.delete({ where: { id: createdApiKeyId } }).catch(() => {});
    }
    await app.close();
  });

  async function getAuthToken(): Promise<string> {
    const testUser = {
      email: 'apikey-test@example.com',
      password: 'password123',
    };

    try {
      await prismaService.user.create({
        data: {
          email: testUser.email,
          password: '$2b$10$abcdefghijklmnopqrstuvwxyz',
          role: 'ADMIN',
        },
      });
    } catch (error) {
      // User might already exist
    }

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send(testUser);

    return loginResponse.body.access_token;
  }

  describe('POST /api-keys', () => {
    it('should create a new API key', async () => {
      const createDto = {
        name: 'Test API Key',
        scopes: [ApiKeyScope.READ_PROPERTIES],
        rateLimit: 100,
      };

      const response = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('key');
      expect(response.body.key).toMatch(/^propchain_live_/);
      expect(response.body.name).toBe(createDto.name);
      expect(response.body.scopes).toEqual(createDto.scopes);
      expect(response.body.rateLimit).toBe(createDto.rateLimit);
      expect(response.body.isActive).toBe(true);
      expect(response.body.requestCount).toBe('0');

      createdApiKeyId = response.body.id;
      fullApiKey = response.body.key;
    });

    it('should return 400 for invalid scopes', async () => {
      const createDto = {
        name: 'Invalid Scopes Key',
        scopes: ['invalid:scope'],
      };

      await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(400);
    });

    it('should return 401 without authentication', async () => {
      const createDto = {
        name: 'Test API Key',
        scopes: [ApiKeyScope.READ_PROPERTIES],
      };

      await request(app.getHttpServer())
        .post('/api-keys')
        .send(createDto)
        .expect(401);
    });
  });

  describe('GET /api-keys', () => {
    it('should return all API keys', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      
      const apiKey = response.body.find((k) => k.id === createdApiKeyId);
      expect(apiKey).toBeDefined();
      expect(apiKey).not.toHaveProperty('key');
      expect(apiKey).toHaveProperty('keyPrefix');
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api-keys')
        .expect(401);
    });
  });

  describe('GET /api-keys/:id', () => {
    it('should return a specific API key', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api-keys/${createdApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdApiKeyId);
      expect(response.body.name).toBe('Test API Key');
      expect(response.body).not.toHaveProperty('key');
      expect(response.body).toHaveProperty('keyPrefix');
    });

    it('should return 404 for non-existent API key', async () => {
      await request(app.getHttpServer())
        .get('/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api-keys/:id', () => {
    it('should update an API key', async () => {
      const updateDto = {
        name: 'Updated API Key',
        scopes: [ApiKeyScope.READ_PROPERTIES, ApiKeyScope.WRITE_PROPERTIES],
      };

      const response = await request(app.getHttpServer())
        .patch(`/api-keys/${createdApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200);

      expect(response.body.name).toBe(updateDto.name);
      expect(response.body.scopes).toEqual(updateDto.scopes);
    });

    it('should return 404 for non-existent API key', async () => {
      await request(app.getHttpServer())
        .patch('/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api-keys/:id', () => {
    it('should revoke an API key', async () => {
      await request(app.getHttpServer())
        .delete(`/api-keys/${createdApiKeyId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const revokedKey = await prismaService.apiKey.findUnique({
        where: { id: createdApiKeyId },
      });

      expect(revokedKey.isActive).toBe(false);
    });

    it('should return 404 for non-existent API key', async () => {
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
      const createDto = {
        name: 'Test Auth Key',
        scopes: [ApiKeyScope.READ_PROPERTIES],
      };

      const response = await request(app.getHttpServer())
        .post('/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto);

      testApiKey = response.body.key;
      testApiKeyId = response.body.id;
    });

    afterAll(async () => {
      if (testApiKeyId) {
        await prismaService.apiKey.delete({ where: { id: testApiKeyId } }).catch(() => {});
      }
    });

    it('should authenticate with valid API key in Authorization header', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('Authorization', `Bearer ${testApiKey}`);

      expect(response.status).not.toBe(401);
    });

    it('should authenticate with valid API key in x-api-key header', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('x-api-key', testApiKey);

      expect(response.status).not.toBe(401);
    });

    it('should reject invalid API key', async () => {
      const response = await request(app.getHttpServer())
        .get('/properties')
        .set('x-api-key', 'propchain_live_invalid');

      expect(response.status).toBe(401);
    });
  });
});
