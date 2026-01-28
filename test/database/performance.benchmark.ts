import { PrismaClient, UserRole, PropertyStatus, TransactionStatus, TransactionType, DocumentType, DocumentStatus } from '@prisma/client';

/**
 * PropChain Database Performance Benchmarks
 * 
 * This script runs performance benchmarks on database queries to measure
 * query execution times and identify potential bottlenecks.
 * 
 * Usage: npx ts-node test/database/performance.benchmark.ts
 */

const prisma = new PrismaClient({
    log: [{ level: 'query', emit: 'event' }],
});

interface BenchmarkResult {
    name: string;
    iterations: number;
    avgTime: number;
    minTime: number;
    maxTime: number;
    totalTime: number;
}

const results: BenchmarkResult[] = [];

async function benchmark(
    name: string,
    fn: () => Promise<void>,
    iterations: number = 100
): Promise<BenchmarkResult> {
    const times: number[] = [];

    // Warm up
    for (let i = 0; i < 5; i++) {
        await fn();
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await fn();
        const end = performance.now();
        times.push(end - start);
    }

    const totalTime = times.reduce((a, b) => a + b, 0);
    const avgTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    const result: BenchmarkResult = {
        name,
        iterations,
        avgTime,
        minTime,
        maxTime,
        totalTime,
    };

    results.push(result);
    return result;
}

async function setupTestData() {
    console.log('Setting up test data...');

    // Create roles
    const role = await prisma.role.upsert({
        where: { name: 'BenchmarkRole' },
        update: {},
        create: {
            name: 'BenchmarkRole',
            description: 'Role for benchmarks',
            level: 10,
        },
    });

    // Create test users
    const users: string[] = [];
    for (let i = 0; i < 100; i++) {
        const user = await prisma.user.create({
            data: {
                email: `benchmark_user_${i}_${Date.now()}@test.com`,
                walletAddress: `0x${i.toString().padStart(40, '0')}${Date.now().toString().slice(-6)}`,
                role: UserRole.USER,
                roleId: role.id,
            },
        });
        users.push(user.id);
    }

    // Create test properties
    const properties: string[] = [];
    for (let i = 0; i < 50; i++) {
        const property = await prisma.property.create({
            data: {
                title: `Benchmark Property ${i}`,
                description: `Description for benchmark property ${i}`,
                location: `${i} Benchmark Street, Test City`,
                price: 100000 + (i * 10000),
                status: PropertyStatus.LISTED,
                ownerId: users[i % users.length],
            },
        });
        properties.push(property.id);
    }

    // Create test transactions
    for (let i = 0; i < 100; i++) {
        await prisma.transaction.create({
            data: {
                fromAddress: `0x${(i * 2).toString().padStart(40, '0')}`,
                toAddress: `0x${(i * 2 + 1).toString().padStart(40, '0')}`,
                amount: 50000 + (i * 1000),
                type: TransactionType.PURCHASE,
                status: TransactionStatus.COMPLETED,
                propertyId: properties[i % properties.length],
            },
        });
    }

    // Create test documents
    for (let i = 0; i < 100; i++) {
        await prisma.document.create({
            data: {
                name: `Benchmark Document ${i}`,
                type: DocumentType.TITLE_DEED,
                status: DocumentStatus.VERIFIED,
                fileUrl: `https://storage.test.com/docs/benchmark_${i}.pdf`,
                propertyId: properties[i % properties.length],
                uploadedById: users[i % users.length],
            },
        });
    }

    console.log(`Created: ${users.length} users, ${properties.length} properties, 100 transactions, 100 documents`);

    return { users, properties, role };
}

async function cleanupTestData() {
    console.log('Cleaning up test data...');

    await prisma.document.deleteMany({
        where: { name: { startsWith: 'Benchmark' } },
    });

    await prisma.transaction.deleteMany({
        where: { fromAddress: { startsWith: '0x00' } },
    });

    await prisma.property.deleteMany({
        where: { title: { startsWith: 'Benchmark' } },
    });

    await prisma.user.deleteMany({
        where: { email: { contains: 'benchmark_user' } },
    });

    await prisma.role.deleteMany({
        where: { name: 'BenchmarkRole' },
    });

    console.log('Cleanup complete');
}

async function runBenchmarks() {
    console.log('=== PropChain Database Performance Benchmarks ===\n');

    const { users, properties } = await setupTestData();

    try {
        // User queries
        await benchmark('User: Find by ID', async () => {
            await prisma.user.findUnique({ where: { id: users[0] } });
        });

        await benchmark('User: Find by email (indexed)', async () => {
            const user = await prisma.user.findFirst();
            if (user) {
                await prisma.user.findUnique({ where: { email: user.email } });
            }
        });

        await benchmark('User: Find many with pagination', async () => {
            await prisma.user.findMany({ take: 10, skip: 0 });
        });

        await benchmark('User: Count all', async () => {
            await prisma.user.count();
        });

        // Property queries
        await benchmark('Property: Find by ID with owner', async () => {
            await prisma.property.findUnique({
                where: { id: properties[0] },
                include: { owner: true },
            });
        });

        await benchmark('Property: Find by status (indexed)', async () => {
            await prisma.property.findMany({
                where: { status: PropertyStatus.LISTED },
                take: 10,
            });
        });

        await benchmark('Property: Search by location', async () => {
            await prisma.property.findMany({
                where: { location: { contains: 'Benchmark' } },
                take: 10,
            });
        });

        await benchmark('Property: Find with transactions', async () => {
            await prisma.property.findUnique({
                where: { id: properties[0] },
                include: { transactions: true },
            });
        });

        await benchmark('Property: Find with documents', async () => {
            await prisma.property.findUnique({
                where: { id: properties[0] },
                include: { documents: true },
            });
        });

        // Transaction queries
        await benchmark('Transaction: Find by property', async () => {
            await prisma.transaction.findMany({
                where: { propertyId: properties[0] },
            });
        });

        await benchmark('Transaction: Find by status (indexed)', async () => {
            await prisma.transaction.findMany({
                where: { status: TransactionStatus.COMPLETED },
                take: 10,
            });
        });

        await benchmark('Transaction: Count by status', async () => {
            await prisma.transaction.count({
                where: { status: TransactionStatus.COMPLETED },
            });
        });

        // Document queries
        await benchmark('Document: Find by property', async () => {
            await prisma.document.findMany({
                where: { propertyId: properties[0] },
            });
        });

        await benchmark('Document: Find by type (indexed)', async () => {
            await prisma.document.findMany({
                where: { type: DocumentType.TITLE_DEED },
                take: 10,
            });
        });

        // Complex queries
        await benchmark('Complex: Property with all relations', async () => {
            await prisma.property.findUnique({
                where: { id: properties[0] },
                include: {
                    owner: true,
                    transactions: true,
                    documents: true,
                },
            });
        });

        await benchmark('Complex: User with all properties and transactions', async () => {
            await prisma.user.findUnique({
                where: { id: users[0] },
                include: {
                    properties: {
                        include: { transactions: true },
                    },
                },
            });
        });

        await benchmark('Aggregation: Group transactions by status', async () => {
            await prisma.transaction.groupBy({
                by: ['status'],
                _count: true,
                _sum: { amount: true },
            });
        });

        // Print results
        console.log('\n=== Benchmark Results ===\n');
        console.log('| Query | Iterations | Avg (ms) | Min (ms) | Max (ms) |');
        console.log('|-------|------------|----------|----------|----------|');

        for (const result of results) {
            console.log(
                `| ${result.name.padEnd(45)} | ${result.iterations.toString().padStart(10)} | ${result.avgTime.toFixed(2).padStart(8)} | ${result.minTime.toFixed(2).padStart(8)} | ${result.maxTime.toFixed(2).padStart(8)} |`
            );
        }

        // Summary
        const avgOverall = results.reduce((a, b) => a + b.avgTime, 0) / results.length;
        console.log('\n=== Summary ===');
        console.log(`Total benchmarks: ${results.length}`);
        console.log(`Overall average query time: ${avgOverall.toFixed(2)}ms`);

        // Identify slow queries (> 10ms average)
        const slowQueries = results.filter(r => r.avgTime > 10);
        if (slowQueries.length > 0) {
            console.log('\n⚠️  Slow queries (>10ms average):');
            for (const query of slowQueries) {
                console.log(`  - ${query.name}: ${query.avgTime.toFixed(2)}ms`);
            }
        } else {
            console.log('\n✅ All queries completed within acceptable time (<10ms)');
        }

    } finally {
        await cleanupTestData();
    }
}

async function main() {
    try {
        await prisma.$connect();
        await runBenchmarks();
    } catch (error) {
        console.error('Benchmark failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
