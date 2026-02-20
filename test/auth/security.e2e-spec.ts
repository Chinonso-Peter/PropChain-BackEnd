import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuthModule } from '../../src/auth/auth.module';
import { UsersModule } from '../../src/users/users.module';
import { ConfigModule } from '@nestjs/config';
import configuration from '../../src/config/configuration';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { RedisService } from '../../src/common/services/redis.service';

describe('Authentication Security (e2e)', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let redisService: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
        }),
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
    redisService = moduleFixture.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear test data
    await redisService.flushdb();
  });

  describe('Token Blacklisting', () => {
    it('should blacklist token on logout', async () => {
      // Register a test user
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(registerResponse.status).toBe(201);

      // Login to get tokens
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
        });

      expect(loginResponse.status).toBe(200);
      const { access_token } = loginResponse.body;

      // Logout to blacklist the token
      const logoutResponse = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${access_token}`);

      expect(logoutResponse.status).toBe(200);

      // Try to use the blacklisted token
      const protectedResponse = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${access_token}`);

      expect(protectedResponse.status).toBe(401);
    });
  });

  describe('Brute Force Protection', () => {
    it('should lock account after too many failed attempts', async () => {
      const email = 'brute-force@test.com';
      
      // Register test user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          firstName: 'Test',
          lastName: 'User',
        });

      // Make 6 failed login attempts
      for (let i = 0; i < 6; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            email,
            password: 'wrong-password',
          });

        if (i < 5) {
          expect(response.status).toBe(401);
        } else {
          // Should be locked on 6th attempt
          expect(response.status).toBe(401);
          expect(response.body.message).toContain('locked');
        }
      }

      // Correct password should still fail when locked
      const correctResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email,
          password: 'SecurePass123!',
        });

      expect(correctResponse.status).toBe(401);
      expect(correctResponse.body.message).toContain('locked');
    });
  });

  describe('Password Security', () => {
    it('should reject weak passwords', async () => {
      const weakPasswords = [
        'password',
        '123456',
        'qwerty',
        'Password123', // No special character
        'Password!', // No number
        'password123!', // No uppercase
        'Pass123!', // Too short
      ];

      for (const password of weakPasswords) {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email: `${Math.random()}@test.com`,
            password,
            firstName: 'Test',
            lastName: 'User',
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('Password validation failed');
      }
    });

    it('should accept strong passwords', async () => {
      const strongPasswords = [
        'SecurePass123!',
        'MyStr0ngP@ssw0rd',
        'Complex123#Password',
      ];

      for (const password of strongPasswords) {
        const email = `${Math.random()}@test.com`;
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send({
            email,
            password,
            firstName: 'Test',
            lastName: 'User',
          });

        expect(response.status).toBe(201);
        
        // Cleanup
        await prismaService.user.delete({ where: { email } });
      }
    });
  });

  describe('Session Management', () => {
    it('should manage active sessions', async () => {
      // Register and login
      const email = 'session@test.com';
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'SecurePass123!',
          firstName: 'Test',
          lastName: 'User',
        });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email,
          password: 'SecurePass123!',
        });

      const { access_token } = loginResponse.body;

      // Get sessions
      const sessionsResponse = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${access_token}`);

      expect(sessionsResponse.status).toBe(200);
      expect(Array.isArray(sessionsResponse.body)).toBe(true);
      expect(sessionsResponse.body.length).toBeGreaterThan(0);

      // Invalidate specific session
      const sessionId = sessionsResponse.body[0].jti;
      const invalidateResponse = await request(app.getHttpServer())
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${access_token}`);

      expect(invalidateResponse.status).toBe(200);

      // Invalidate all sessions
      const invalidateAllResponse = await request(app.getHttpServer())
        .delete('/auth/sessions')
        .set('Authorization', `Bearer ${access_token}`);

      expect(invalidateAllResponse.status).toBe(200);
    });
  });
});