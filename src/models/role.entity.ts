import { Role as PrismaRole } from '@prisma/client';

export class Role implements PrismaRole {
    id: string;
    name: string;
    description: string | null;
    level: number;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export type CreateRoleInput = {
    name: string;
    description?: string;
    level?: number;
    isSystem?: boolean;
};

export type UpdateRoleInput = Partial<Omit<CreateRoleInput, 'isSystem'>>;
