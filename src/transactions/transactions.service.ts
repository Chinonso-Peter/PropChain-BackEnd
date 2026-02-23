import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/database';
import { TransactionStatus } from 'src/models/transaction.entity';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchainService: BlockchainService,
  ) {}

  private calculateFees(amount: number) {
    const platformFee = amount * 0.02; // 2%
    const estimatedGas = this.blockchainService.estimateGas();

    return {
      platformFee,
      estimatedGas,
    };
  }

  private validateTransition(
  current: TransactionStatus,
  next: TransactionStatus,
) {
  const allowedTransitions = {
    PENDING: ['ESCROW_FUNDED', 'CANCELLED'],
    ESCROW_FUNDED: ['BLOCKCHAIN_SUBMITTED'],
    BLOCKCHAIN_SUBMITTED: ['CONFIRMING'],
    CONFIRMING: ['CONFIRMED', 'FAILED'],
    CONFIRMED: ['COMPLETED'],
  };

  if (!allowedTransitions[current]?.includes(next)) {
    throw new BusinessException(
      ERROR_CODES.INVALID_TRANSACTION_STATE,
      `Invalid transition from ${current} to ${next}`,
    );
  }
}
  async createTransaction(dto: CreateTransactionDto) {
    const fees = this.calculateFees(dto.amount);

    return this.prisma.transaction.create({
      data: {
        ...dto,
        status: 'PENDING',
        platformFee: fees.platformFee,
        gasFee: fees.estimatedGas,
      },
    });
  }

  async fundEscrow(transactionId: string) {
  const tx = await this.getTransaction(transactionId);

  const escrowWallet = await this.blockchainService.createEscrowWallet();

  await this.prisma.transaction.update({
    where: { id: transactionId },
    data: {
      escrowWallet,
      status: 'ESCROW_FUNDED',
    },
  });

  return escrowWallet;
}

async monitorBlockchain(transactionId: string) {
  const tx = await this.getTransaction(transactionId);

  if (!tx.blockchainHash) return;

  const receipt = await this.blockchainService.getTransactionReceipt(
    tx.blockchainHash,
  );

  if (receipt.confirmations >= 6) {
    await this.prisma.transaction.update({
      where: { id: tx.id },
      data: {
        confirmations: receipt.confirmations,
        status: 'CONFIRMED',
      },
    });
  }
}
}
