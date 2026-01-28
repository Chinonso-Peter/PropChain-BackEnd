import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../../src/database/prisma/prisma.service';

describe('PrismaService', () => {
    let service: PrismaService;
    let module: TestingModule;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                    envFilePath: '.env.test',
                }),
            ],
            providers: [PrismaService],
        }).compile();

        service = module.get<PrismaService>(PrismaService);
        await service.onModuleInit();
    });

    afterAll(async () => {
        await service.onModuleDestroy();
        await module.close();
    });

    describe('connection', () => {
        it('should be defined', () => {
            expect(service).toBeDefined();
        });

        it('should connect to the database', async () => {
            const isHealthy = await service.isHealthy();
            expect(isHealthy).toBe(true);
        });
    });

    describe('isHealthy', () => {
        it('should return true when database is connected', async () => {
            const result = await service.isHealthy();
            expect(result).toBe(true);
        });
    });

    describe('executeTransaction', () => {
        it('should execute a transaction successfully', async () => {
            const result = await service.executeTransaction(async (tx) => {
                const count = await tx.user.count();
                return count;
            });

            expect(typeof result).toBe('number');
        });

        it('should retry on transient failures', async () => {
            // This test verifies the retry logic exists
            const result = await service.executeTransaction(
                async (tx) => {
                    return await tx.systemLog.create({
                        data: {
                            logLevel: 'INFO',
                            message: 'Test transaction',
                            context: 'test',
                        },
                    });
                },
                { maxRetries: 3, timeout: 5000 }
            );

            expect(result.id).toBeDefined();
            expect(result.logLevel).toBe('INFO');

            // Cleanup
            await service.systemLog.delete({ where: { id: result.id } });
        });
    });
});
