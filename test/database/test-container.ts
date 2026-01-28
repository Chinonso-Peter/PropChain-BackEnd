import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

/**
 * Test container configuration for PostgreSQL database testing.
 * This module provides utilities for setting up isolated database environments
 * for integration and e2e tests.
 */

export interface TestDatabaseConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    connectionUrl: string;
}

export class TestDatabaseContainer {
    private container: StartedTestContainer | null = null;
    private prisma: PrismaClient | null = null;

    /**
     * Start a PostgreSQL test container
     */
    async start(): Promise<TestDatabaseConfig> {
        const container = new GenericContainer('postgres:15-alpine')
            .withEnvironment({
                POSTGRES_USER: 'test',
                POSTGRES_PASSWORD: 'test',
                POSTGRES_DB: 'propchain_test',
            })
            .withExposedPorts(5432)
            .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/))
            .withStartupTimeout(60000);

        this.container = await container.start();

        const config: TestDatabaseConfig = {
            host: this.container.getHost(),
            port: this.container.getMappedPort(5432),
            username: 'test',
            password: 'test',
            database: 'propchain_test',
            connectionUrl: `postgresql://test:test@${this.container.getHost()}:${this.container.getMappedPort(5432)}/propchain_test`,
        };

        // Set environment variable for Prisma
        process.env.DATABASE_URL = config.connectionUrl;

        return config;
    }

    /**
     * Run Prisma migrations on the test database
     */
    async migrate(): Promise<void> {
        if (!this.container) {
            throw new Error('Container not started. Call start() first.');
        }

        // Run prisma migrations
        execSync('npx prisma migrate deploy', {
            env: {
                ...process.env,
                DATABASE_URL: process.env.DATABASE_URL,
            },
            stdio: 'pipe',
        });
    }

    /**
     * Get a Prisma client connected to the test database
     */
    async getPrismaClient(): Promise<PrismaClient> {
        if (!this.container) {
            throw new Error('Container not started. Call start() first.');
        }

        if (!this.prisma) {
            this.prisma = new PrismaClient({
                datasources: {
                    db: {
                        url: process.env.DATABASE_URL,
                    },
                },
            });
            await this.prisma.$connect();
        }

        return this.prisma;
    }

    /**
     * Clean all data from the test database
     */
    async cleanDatabase(): Promise<void> {
        if (!this.prisma) {
            throw new Error('Prisma client not initialized. Call getPrismaClient() first.');
        }

        // Delete in reverse order of dependencies
        await this.prisma.document.deleteMany();
        await this.prisma.transaction.deleteMany();
        await this.prisma.property.deleteMany();
        await this.prisma.roleChangeLog.deleteMany();
        await this.prisma.rolePermission.deleteMany();
        await this.prisma.permission.deleteMany();
        await this.prisma.apiKey.deleteMany();
        await this.prisma.user.deleteMany();
        await this.prisma.role.deleteMany();
        await this.prisma.auditLog.deleteMany();
        await this.prisma.systemLog.deleteMany();
    }

    /**
     * Stop the test container and cleanup resources
     */
    async stop(): Promise<void> {
        if (this.prisma) {
            await this.prisma.$disconnect();
            this.prisma = null;
        }

        if (this.container) {
            await this.container.stop();
            this.container = null;
        }
    }
}

/**
 * Global test database container for sharing across test suites
 */
let globalContainer: TestDatabaseContainer | null = null;

export async function setupTestDatabase(): Promise<TestDatabaseConfig> {
    if (!globalContainer) {
        globalContainer = new TestDatabaseContainer();
        const config = await globalContainer.start();
        await globalContainer.migrate();
        return config;
    }
    return {
        host: '',
        port: 0,
        username: 'test',
        password: 'test',
        database: 'propchain_test',
        connectionUrl: process.env.DATABASE_URL || '',
    };
}

export async function teardownTestDatabase(): Promise<void> {
    if (globalContainer) {
        await globalContainer.stop();
        globalContainer = null;
    }
}

export async function getTestPrismaClient(): Promise<PrismaClient> {
    if (!globalContainer) {
        throw new Error('Test database not set up. Call setupTestDatabase() first.');
    }
    return globalContainer.getPrismaClient();
}

export async function cleanTestDatabase(): Promise<void> {
    if (!globalContainer) {
        throw new Error('Test database not set up. Call setupTestDatabase() first.');
    }
    await globalContainer.cleanDatabase();
}
