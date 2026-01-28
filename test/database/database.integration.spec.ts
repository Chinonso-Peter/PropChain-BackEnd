import { PrismaClient, UserRole, PropertyStatus, TransactionStatus, TransactionType, DocumentType, DocumentStatus } from '@prisma/client';
import {
    TestDatabaseContainer,
    setupTestDatabase,
    teardownTestDatabase,
    getTestPrismaClient,
    cleanTestDatabase,
} from './test-container';

describe('Database Integration Tests', () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
        await setupTestDatabase();
        prisma = await getTestPrismaClient();
    }, 120000); // 2 minute timeout for container startup

    afterAll(async () => {
        await teardownTestDatabase();
    });

    beforeEach(async () => {
        await cleanTestDatabase();
    });

    describe('User Model', () => {
        it('should create a user', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'test@example.com',
                    walletAddress: '0x1234567890123456789012345678901234567890',
                    role: UserRole.USER,
                },
            });

            expect(user.id).toBeDefined();
            expect(user.email).toBe('test@example.com');
            expect(user.walletAddress).toBe('0x1234567890123456789012345678901234567890');
            expect(user.role).toBe(UserRole.USER);
        });

        it('should enforce unique email constraint', async () => {
            await prisma.user.create({
                data: {
                    email: 'unique@example.com',
                    role: UserRole.USER,
                },
            });

            await expect(
                prisma.user.create({
                    data: {
                        email: 'unique@example.com',
                        role: UserRole.USER,
                    },
                })
            ).rejects.toThrow();
        });

        it('should enforce unique wallet address constraint', async () => {
            const walletAddress = '0x9876543210987654321098765432109876543210';

            await prisma.user.create({
                data: {
                    email: 'user1@example.com',
                    walletAddress,
                    role: UserRole.USER,
                },
            });

            await expect(
                prisma.user.create({
                    data: {
                        email: 'user2@example.com',
                        walletAddress,
                        role: UserRole.USER,
                    },
                })
            ).rejects.toThrow();
        });
    });

    describe('Property Model', () => {
        it('should create a property with owner relationship', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'owner@example.com',
                    role: UserRole.SELLER,
                },
            });

            const property = await prisma.property.create({
                data: {
                    title: 'Test Property',
                    description: 'A test property',
                    location: '123 Test Street',
                    price: 500000,
                    status: PropertyStatus.DRAFT,
                    ownerId: user.id,
                },
                include: {
                    owner: true,
                },
            });

            expect(property.id).toBeDefined();
            expect(property.owner.id).toBe(user.id);
        });

        it('should cascade delete properties when owner is deleted', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'cascade@example.com',
                    role: UserRole.SELLER,
                },
            });

            await prisma.property.create({
                data: {
                    title: 'Cascade Test Property',
                    location: '456 Test Avenue',
                    price: 300000,
                    ownerId: user.id,
                },
            });

            await prisma.user.delete({ where: { id: user.id } });

            const properties = await prisma.property.findMany({
                where: { ownerId: user.id },
            });

            expect(properties.length).toBe(0);
        });
    });

    describe('Transaction Model', () => {
        it('should create a transaction linked to property', async () => {
            const seller = await prisma.user.create({
                data: {
                    email: 'seller@example.com',
                    walletAddress: '0x1111111111111111111111111111111111111111',
                    role: UserRole.SELLER,
                },
            });

            const buyer = await prisma.user.create({
                data: {
                    email: 'buyer@example.com',
                    walletAddress: '0x2222222222222222222222222222222222222222',
                    role: UserRole.BUYER,
                },
            });

            const property = await prisma.property.create({
                data: {
                    title: 'Transaction Test Property',
                    location: '789 Transaction Street',
                    price: 450000,
                    ownerId: seller.id,
                },
            });

            const transaction = await prisma.transaction.create({
                data: {
                    fromAddress: buyer.walletAddress!,
                    toAddress: seller.walletAddress!,
                    amount: 450000,
                    type: TransactionType.PURCHASE,
                    status: TransactionStatus.PENDING,
                    propertyId: property.id,
                },
                include: {
                    property: true,
                    recipient: true,
                },
            });

            expect(transaction.id).toBeDefined();
            expect(transaction.property?.id).toBe(property.id);
            expect(transaction.recipient?.id).toBe(seller.id);
        });
    });

    describe('Document Model', () => {
        it('should create a document linked to property and user', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'uploader@example.com',
                    role: UserRole.AGENT,
                },
            });

            const property = await prisma.property.create({
                data: {
                    title: 'Document Test Property',
                    location: '101 Document Lane',
                    price: 600000,
                    ownerId: user.id,
                },
            });

            const document = await prisma.document.create({
                data: {
                    name: 'Title Deed',
                    type: DocumentType.TITLE_DEED,
                    status: DocumentStatus.PENDING,
                    fileUrl: 'https://storage.example.com/docs/title-deed.pdf',
                    fileHash: '0xabcdef1234567890',
                    mimeType: 'application/pdf',
                    fileSize: 1024000,
                    propertyId: property.id,
                    uploadedById: user.id,
                },
                include: {
                    property: true,
                    uploadedBy: true,
                },
            });

            expect(document.id).toBeDefined();
            expect(document.property?.id).toBe(property.id);
            expect(document.uploadedBy.id).toBe(user.id);
        });

        it('should link document to transaction', async () => {
            const user = await prisma.user.create({
                data: {
                    email: 'transactor@example.com',
                    walletAddress: '0x3333333333333333333333333333333333333333',
                    role: UserRole.BUYER,
                },
            });

            const transaction = await prisma.transaction.create({
                data: {
                    fromAddress: user.walletAddress!,
                    toAddress: '0x4444444444444444444444444444444444444444',
                    amount: 100000,
                    type: TransactionType.ESCROW,
                    status: TransactionStatus.PENDING,
                },
            });

            const document = await prisma.document.create({
                data: {
                    name: 'Escrow Agreement',
                    type: DocumentType.CONTRACT,
                    status: DocumentStatus.VERIFIED,
                    fileUrl: 'https://storage.example.com/docs/escrow.pdf',
                    transactionId: transaction.id,
                    uploadedById: user.id,
                    verifiedAt: new Date(),
                },
                include: {
                    transaction: true,
                },
            });

            expect(document.transaction?.id).toBe(transaction.id);
        });
    });

    describe('Role and Permission Models', () => {
        it('should create role with permissions', async () => {
            const role = await prisma.role.create({
                data: {
                    name: 'Test Role',
                    description: 'A test role',
                    level: 50,
                    isSystem: false,
                },
            });

            const permission = await prisma.permission.create({
                data: {
                    resource: 'test',
                    action: 'read',
                    description: 'Read test resources',
                },
            });

            const rolePermission = await prisma.rolePermission.create({
                data: {
                    roleId: role.id,
                    permissionId: permission.id,
                },
                include: {
                    role: true,
                    permission: true,
                },
            });

            expect(rolePermission.role.name).toBe('Test Role');
            expect(rolePermission.permission.action).toBe('read');
        });
    });
});
