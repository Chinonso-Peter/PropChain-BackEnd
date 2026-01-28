import { ApiKey as PrismaApiKey } from '@prisma/client';

export class ApiKey implements PrismaApiKey {
    id: string;
    name: string;
    key: string;
    keyPrefix: string;
    scopes: string[];
    requestCount: bigint;
    lastUsedAt: Date | null;
    isActive: boolean;
    rateLimit: number | null;
    createdAt: Date;
    updatedAt: Date;
}

export type CreateApiKeyInput = {
    name: string;
    key: string;
    keyPrefix: string;
    scopes: string[];
    isActive?: boolean;
    rateLimit?: number;
};

export type UpdateApiKeyInput = Partial<Pick<CreateApiKeyInput, 'name' | 'scopes' | 'isActive' | 'rateLimit'>>;
