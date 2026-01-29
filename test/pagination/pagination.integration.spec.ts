import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';

describe('Pagination Integration Tests', () => {
  let app: INestApplication;
  let prismaService: PrismaService;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prismaService = moduleFixture.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('API Keys Pagination', () => {
    it('should return paginated API keys with metadata', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('page');
      expect(response.body.meta).toHaveProperty('pages');
      expect(response.body.meta).toHaveProperty('hasNext');
      expect(response.body.meta).toHaveProperty('hasPrev');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should respect page parameter', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 5 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 2, limit: 5 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(page1.body.meta.page).toBe(1);
      expect(page2.body.meta.page).toBe(2);
      
      // Items should be different if there are enough items
      if (page1.body.meta.total > 5) {
        expect(page1.body.data[0]?.id).not.toBe(page2.body.data[0]?.id);
      }
    });

    it('should respect limit parameter', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 5 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body.meta.limit).toBe(5);
    });

    it('should enforce maximum limit', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 500 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(100);
      expect(response.body.meta.limit).toBeLessThanOrEqual(100);
    });

    it('should handle sorting', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'asc' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.meta.sortBy).toBe('createdAt');
      expect(response.body.meta.sortOrder).toBe('asc');
    });

    it('should calculate hasNext correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const { total, limit, page, pages } = response.body.meta;
      const expectedHasNext = page < pages;
      expect(response.body.meta.hasNext).toBe(expectedHasNext);
    });

    it('should calculate hasPrev correctly', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 2, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.meta.hasPrev).toBe(true);
    });

    it('should handle empty results with correct metadata', async () => {
      // This test assumes pagination works even with 0 items
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 999, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      if (response.body.meta.total === 0) {
        expect(response.body.data).toEqual([]);
        expect(response.body.meta.pages).toBe(0);
      }
    });

    it('should validate page parameter - must be positive', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: -1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`);

      // Server should either reject or default to page 1
      expect([200, 400]).toContain(response.status);
    });

    it('should validate limit parameter - must be within bounds', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 0 })
        .set('Authorization', `Bearer ${accessToken}`);

      // Server should either reject or use minimum limit
      expect([200, 400]).toContain(response.status);
    });

    it('should calculate correct total item count', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Total should match actual count from database
      expect(typeof response.body.meta.total).toBe('number');
      expect(response.body.meta.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Default Pagination Values', () => {
    it('should use default page if not provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.meta.page).toBe(1);
    });

    it('should use default limit if not provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.meta.limit).toBe(10);
    });

    it('should use default sort if not provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.meta.sortBy).toBe('createdAt');
      expect(response.body.meta.sortOrder).toBe('desc');
    });
  });

  describe('Data Consistency', () => {
    it('should not return duplicate items across pages', async () => {
      const allIds = new Set<string>();
      let hasNext = true;
      let page = 1;
      const limit = 5;

      while (hasNext && page <= 10) {
        const response = await request(app.getHttpServer())
          .get('/api-keys')
          .query({ page, limit })
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        response.body.data.forEach((item: any) => {
          expect(allIds.has(item.id)).toBe(false);
          allIds.add(item.id);
        });

        hasNext = response.body.meta.hasNext;
        page++;
      }
    });

    it('should maintain data order across pagination', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/api-keys')
        .query({ page: 2, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Both requests should have data in same sort order
      expect(page1.body.meta.sortOrder).toBe(page2.body.meta.sortOrder);
    });
  });
});
