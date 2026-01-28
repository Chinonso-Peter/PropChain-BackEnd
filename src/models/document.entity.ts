import { Document as PrismaDocument, DocumentType, DocumentStatus } from '@prisma/client';

export { DocumentType, DocumentStatus };

export class Document implements PrismaDocument {
    id: string;
    name: string;
    type: DocumentType;
    status: DocumentStatus;
    fileUrl: string;
    fileHash: string | null;
    mimeType: string | null;
    fileSize: number | null;
    description: string | null;
    propertyId: string | null;
    transactionId: string | null;
    uploadedById: string;
    verifiedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export type CreateDocumentInput = {
    name: string;
    type: DocumentType;
    status?: DocumentStatus;
    fileUrl: string;
    fileHash?: string;
    mimeType?: string;
    fileSize?: number;
    description?: string;
    propertyId?: string;
    transactionId?: string;
    uploadedById: string;
    expiresAt?: Date;
};

export type UpdateDocumentInput = Partial<Pick<CreateDocumentInput, 'name' | 'description' | 'status' | 'expiresAt'>>;
