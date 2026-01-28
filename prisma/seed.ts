import { PrismaClient, UserRole, PropertyStatus, TransactionStatus, TransactionType, DocumentType, DocumentStatus, Permission } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Starting database seeding...');

    // Clean existing data (in reverse order of dependencies)
    await prisma.document.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.property.deleteMany();
    await prisma.roleChangeLog.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.systemLog.deleteMany();

    console.log('🧹 Cleaned existing data');

    // Create Roles
    const adminRole = await prisma.role.create({
        data: {
            name: 'Administrator',
            description: 'Full system access with all permissions',
            level: 100,
            isSystem: true,
        },
    });

    const agentRole = await prisma.role.create({
        data: {
            name: 'Agent',
            description: 'Property management and listing permissions',
            level: 50,
            isSystem: true,
        },
    });

    const userRole = await prisma.role.create({
        data: {
            name: 'User',
            description: 'Standard user permissions',
            level: 10,
            isSystem: true,
        },
    });

    console.log('✅ Created roles');

    // Create Permissions
    const permissions = await Promise.all([
        prisma.permission.create({
            data: { resource: 'users', action: 'create', description: 'Create new users' },
        }),
        prisma.permission.create({
            data: { resource: 'users', action: 'read', description: 'View user information' },
        }),
        prisma.permission.create({
            data: { resource: 'users', action: 'update', description: 'Update user information' },
        }),
        prisma.permission.create({
            data: { resource: 'users', action: 'delete', description: 'Delete users' },
        }),
        prisma.permission.create({
            data: { resource: 'properties', action: 'create', description: 'Create property listings' },
        }),
        prisma.permission.create({
            data: { resource: 'properties', action: 'read', description: 'View properties' },
        }),
        prisma.permission.create({
            data: { resource: 'properties', action: 'update', description: 'Update property listings' },
        }),
        prisma.permission.create({
            data: { resource: 'properties', action: 'delete', description: 'Delete properties' },
        }),
        prisma.permission.create({
            data: { resource: 'properties', action: 'approve', description: 'Approve property listings' },
        }),
        prisma.permission.create({
            data: { resource: 'transactions', action: 'create', description: 'Create transactions' },
        }),
        prisma.permission.create({
            data: { resource: 'transactions', action: 'read', description: 'View transactions' },
        }),
        prisma.permission.create({
            data: { resource: 'transactions', action: 'update', description: 'Update transactions' },
        }),
        prisma.permission.create({
            data: { resource: 'documents', action: 'create', description: 'Upload documents' },
        }),
        prisma.permission.create({
            data: { resource: 'documents', action: 'read', description: 'View documents' },
        }),
        prisma.permission.create({
            data: { resource: 'documents', action: 'verify', description: 'Verify documents' },
        }),
    ]);

    console.log('✅ Created permissions');

    // Assign all permissions to admin role
    for (const permission of permissions) {
        await prisma.rolePermission.create({
            data: {
                roleId: adminRole.id,
                permissionId: permission.id,
            },
        });
    }

    // Assign property and document permissions to agent role
    const agentPermissions = permissions.filter(
        (p: Permission) => p.resource === 'properties' || p.resource === 'documents' || (p.resource === 'transactions' && p.action === 'read')
    );
    for (const permission of agentPermissions) {
        await prisma.rolePermission.create({
            data: {
                roleId: agentRole.id,
                permissionId: permission.id,
            },
        });
    }

    // Assign basic read permissions to user role
    const userPermissions = permissions.filter(
        (p: Permission) => p.action === 'read' || (p.resource === 'documents' && p.action === 'create')
    );
    for (const permission of userPermissions) {
        await prisma.rolePermission.create({
            data: {
                roleId: userRole.id,
                permissionId: permission.id,
            },
        });
    }

    console.log('✅ Assigned permissions to roles');

    // Create Users
    const adminUser = await prisma.user.create({
        data: {
            email: 'admin@propchain.io',
            walletAddress: '0x1234567890123456789012345678901234567890',
            role: UserRole.ADMIN,
            roleId: adminRole.id,
        },
    });

    const agentUser = await prisma.user.create({
        data: {
            email: 'agent@propchain.io',
            walletAddress: '0x2345678901234567890123456789012345678901',
            role: UserRole.AGENT,
            roleId: agentRole.id,
        },
    });

    const buyerUser = await prisma.user.create({
        data: {
            email: 'buyer@example.com',
            walletAddress: '0x3456789012345678901234567890123456789012',
            role: UserRole.BUYER,
            roleId: userRole.id,
        },
    });

    const sellerUser = await prisma.user.create({
        data: {
            email: 'seller@example.com',
            walletAddress: '0x4567890123456789012345678901234567890123',
            role: UserRole.SELLER,
            roleId: userRole.id,
        },
    });

    console.log('✅ Created users');

    // Create Properties
    const property1 = await prisma.property.create({
        data: {
            title: 'Modern Downtown Apartment',
            description: 'A beautiful 2-bedroom apartment in the heart of downtown with stunning city views.',
            location: '123 Main Street, Downtown District',
            price: 450000,
            status: PropertyStatus.LISTED,
            ownerId: sellerUser.id,
        },
    });

    const property2 = await prisma.property.create({
        data: {
            title: 'Suburban Family Home',
            description: 'Spacious 4-bedroom family home with large backyard and modern amenities.',
            location: '456 Oak Avenue, Suburbia',
            price: 750000,
            status: PropertyStatus.APPROVED,
            ownerId: sellerUser.id,
        },
    });

    const property3 = await prisma.property.create({
        data: {
            title: 'Luxury Penthouse Suite',
            description: 'Exclusive penthouse with panoramic views, private elevator, and rooftop terrace.',
            location: '789 Skyline Tower, Financial District',
            price: 2500000,
            status: PropertyStatus.PENDING,
            ownerId: agentUser.id,
        },
    });

    console.log('✅ Created properties');

    // Create Transactions
    const transaction1 = await prisma.transaction.create({
        data: {
            fromAddress: buyerUser.walletAddress!,
            toAddress: sellerUser.walletAddress!,
            amount: 450000,
            txHash: '0xabc123def456789012345678901234567890123456789012345678901234567890',
            status: TransactionStatus.COMPLETED,
            type: TransactionType.PURCHASE,
            propertyId: property1.id,
        },
    });

    const transaction2 = await prisma.transaction.create({
        data: {
            fromAddress: buyerUser.walletAddress!,
            toAddress: sellerUser.walletAddress!,
            amount: 75000,
            status: TransactionStatus.PENDING,
            type: TransactionType.ESCROW,
            propertyId: property2.id,
        },
    });

    console.log('✅ Created transactions');

    // Create Documents
    await prisma.document.create({
        data: {
            name: 'Property Title Deed',
            type: DocumentType.TITLE_DEED,
            status: DocumentStatus.VERIFIED,
            fileUrl: 'https://storage.propchain.io/documents/title-deed-1.pdf',
            fileHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            mimeType: 'application/pdf',
            fileSize: 1024000,
            description: 'Official title deed for the downtown apartment',
            propertyId: property1.id,
            uploadedById: sellerUser.id,
            verifiedAt: new Date(),
        },
    });

    await prisma.document.create({
        data: {
            name: 'Property Inspection Report',
            type: DocumentType.INSPECTION_REPORT,
            status: DocumentStatus.VERIFIED,
            fileUrl: 'https://storage.propchain.io/documents/inspection-1.pdf',
            fileHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            mimeType: 'application/pdf',
            fileSize: 2048000,
            description: 'Professional inspection report dated 2025',
            propertyId: property1.id,
            transactionId: transaction1.id,
            uploadedById: agentUser.id,
            verifiedAt: new Date(),
        },
    });

    await prisma.document.create({
        data: {
            name: 'Purchase Contract',
            type: DocumentType.CONTRACT,
            status: DocumentStatus.PENDING,
            fileUrl: 'https://storage.propchain.io/documents/contract-2.pdf',
            mimeType: 'application/pdf',
            fileSize: 512000,
            description: 'Purchase agreement for suburban home',
            propertyId: property2.id,
            transactionId: transaction2.id,
            uploadedById: buyerUser.id,
        },
    });

    console.log('✅ Created documents');

    // Create API Keys
    await prisma.apiKey.create({
        data: {
            name: 'Development API Key',
            key: 'pk_dev_1234567890abcdef1234567890abcdef',
            keyPrefix: 'pk_dev',
            scopes: ['read:properties', 'read:transactions'],
            isActive: true,
            rateLimit: 1000,
        },
    });

    await prisma.apiKey.create({
        data: {
            name: 'Integration Test Key',
            key: 'pk_test_abcdef1234567890abcdef1234567890',
            keyPrefix: 'pk_test',
            scopes: ['read:properties', 'write:properties', 'read:transactions'],
            isActive: true,
            rateLimit: 100,
        },
    });

    console.log('✅ Created API keys');

    // Create System Log entry
    await prisma.systemLog.create({
        data: {
            logLevel: 'INFO',
            message: 'Database seeded successfully',
            context: 'seed',
        },
    });

    console.log('🎉 Database seeding completed successfully!');
}

main()
    .catch((e) => {
        console.error('❌ Error seeding database:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
