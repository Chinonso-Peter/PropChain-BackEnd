const { validateMigrations } = require('../../scripts/validate-migrations');
import { getTestPrismaClient, setupTestDatabase, teardownTestDatabase } from '../database/test-container';

describe('Migration safety', () => {
  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('requires rollback scripts and rejects unsafe migration patterns', () => {
    const result = validateMigrations(process.cwd());

    expect(result.errors).toEqual([]);
  });

  it(
    'applies prisma migrations to a clean database',
    async () => {
      try {
        await setupTestDatabase();
      } catch (error) {
        const message = (error as Error).message.toLowerCase();
        if (message.includes('docker') || message.includes('container runtime')) {
          return;
        }
        throw error;
      }

      const prisma = await getTestPrismaClient();
      const tables = (await prisma.$queryRawUnsafe(`
        SELECT
          to_regclass('public.users') AS users,
          to_regclass('public.properties') AS properties,
          to_regclass('public.api_keys') AS api_keys
      `)) as Array<{ users: string | null; properties: string | null; api_keys: string | null }>;

      expect(tables[0].users).toBe('users');
      expect(tables[0].properties).toBe('properties');
      expect(tables[0].api_keys).toBe('api_keys');
    },
    180000,
  );
});
