import { Transaction as PrismaTransaction, TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export { TransactionStatus, TransactionType };

export class Transaction implements PrismaTransaction {
    id: string;
    fromAddress: string;
    toAddress: string;
    amount: Decimal;
    txHash: string | null;
    status: TransactionStatus;
    type: TransactionType;
    propertyId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export type CreateTransactionInput = {
    fromAddress: string;
    toAddress: string;
    amount: number | Decimal;
    txHash?: string;
    status?: TransactionStatus;
    type: TransactionType;
    propertyId?: string;
};

export type UpdateTransactionInput = Partial<Pick<CreateTransactionInput, 'txHash' | 'status'>>;
