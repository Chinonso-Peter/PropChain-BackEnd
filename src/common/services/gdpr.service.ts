import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditService, AuditOperation } from './audit.service';

export interface UserDataExport {
  user: any;
  properties: any[];
  transactions: any[];
  documents: any[];
  auditLogs: any[];
}

@Injectable()
export class GdprService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Export all personal data for a specific user (Right to Data Portability)
   */
  async exportUserData(userId: string): Promise<UserDataExport> {
    // Fetch user data
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Fetch related data
    const [properties, transactions, documents, auditLogs] = await Promise.all([
      this.prisma.property.findMany({
        where: { ownerId: userId },
      }),
      this.prisma.transaction.findMany({
        where: {
          OR: [
            { fromAddress: user.walletAddress },
            { toAddress: user.walletAddress },
          ],
        },
      }),
      this.prisma.document.findMany({
        where: { uploadedById: userId },
      }),
      this.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 1000, // Limit to prevent huge exports
      }),
    ]);

    // Sanitize sensitive data before export
    const sanitizedUser = this.sanitizeUserData(user);

    await this.auditService.logAction({
      tableName: 'users',
      operation: AuditOperation.READ,
      newData: { action: 'GDPR_DATA_EXPORT', userId },
      userId: userId,
    });

    return {
      user: sanitizedUser,
      properties,
      transactions,
      documents,
      auditLogs,
    };
  }

  /**
   * Delete user data (Right to be Forgotten)
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Log the deletion before it happens
    await this.auditService.logDelete('users', user, userId);

    // Perform soft delete or hard delete based on compliance requirements
    // For financial/real estate applications, we may want to preserve records for legal reasons
    // So we'll anonymize the user instead of completely deleting
    
    await this.prisma.$transaction(async (tx) => {
      // Anonymize user data (keep for legal compliance but remove personal info)
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@example.com`,
          walletAddress: null,
          password: null,
          isVerified: false,
        },
      });

      // For documents, we might want to anonymize or mark as deleted
      await tx.document.updateMany({
        where: { uploadedById: userId },
        data: {
          name: '[ANONYMIZED]',
          fileUrl: '[REDACTED]',
          description: '[REDACTED]',
        },
      });

      // Add an audit log entry for the GDPR deletion
      await tx.auditLog.create({
        data: {
          tableName: 'users',
          operation: 'GDPR_DELETE',
          oldData: { id: userId, email: user.email },
          newData: { action: 'GDPR_RIGHT_TO_FORGET', anonymized: true },
          userId,
          timestamp: new Date(),
        },
      });
    });
  }

  /**
   * Anonymize user data completely (hard delete alternative)
   */
  async anonymizeUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Store original data for audit before anonymization
      const originalData = {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
        role: user.role,
      };

      // Anonymize the user record
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `anonymized-${userId}`,
          walletAddress: null,
          password: null,
          isVerified: false,
          // Keep role for system functionality but anonymize
        },
      });

      // Anonymize related records where possible
      await tx.property.updateMany({
        where: { ownerId: userId },
        data: {
          title: '[ANONYMIZED PROPERTY]',
          description: '[REDACTED FOR PRIVACY]',
          location: '[REDACTED]',
        },
      });

      await tx.document.updateMany({
        where: { uploadedById: userId },
        data: {
          name: '[ANONYMIZED DOCUMENT]',
          fileUrl: '[REDACTED]',
          description: '[REDACTED]',
        },
      });

      // Log the anonymization action
      await this.auditService.logAction({
        tableName: 'users',
        operation: AuditOperation.UPDATE,
        oldData: originalData,
        newData: { id: userId, status: 'ANONYMIZED' },
        userId: userId,
      });
    });
  }

  /**
   * Get user's consent preferences
   */
  async getUserConsents(userId: string) {
    // In a real implementation, this would fetch from a consent management system
    // For now, we'll return a mock implementation
    return await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        // Add consent-related fields when implemented
      },
    });
  }

  /**
   * Update user's consent preferences
   */
  async updateUserConsent(userId: string, consentTypes: string[], granted: boolean) {
    // In a real implementation, this would update a consent management system
    // For now, we'll just log the action
    await this.auditService.logAction({
      tableName: 'consents',
      operation: granted ? AuditOperation.CREATE : AuditOperation.UPDATE,
      newData: { userId, consentTypes, granted },
      userId,
    });

    return { success: true, userId, consentTypes, granted };
  }

  /**
   * Sanitize user data to remove sensitive information for export
   */
  private sanitizeUserData(user: any): any {
    const sanitized = { ...user };
    
    // Remove sensitive fields that shouldn't be exported
    delete sanitized.password;
    delete sanitized.twoFactorSecret;
    delete sanitized.refreshToken;
    
    return sanitized;
  }

  /**
   * Check if user data has been anonymized
   */
  async isUserAnonymized(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        walletAddress: true,
      },
    });

    if (!user) {
      return true; // User doesn't exist, so it's anonymized
    }

    // Check if user has been anonymized
    return (
      user.email?.startsWith('anonymized-') ||
      user.email?.startsWith('deleted-') ||
      user.walletAddress === null
    );
  }
}