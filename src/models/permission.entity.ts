import { Permission as PrismaPermission } from '@prisma/client';

export class Permission implements PrismaPermission {
    id: string;
    resource: string;
    action: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export type CreatePermissionInput = {
    resource: string;
    action: string;
    description?: string;
};

export type UpdatePermissionInput = Partial<Pick<CreatePermissionInput, 'description'>>;
