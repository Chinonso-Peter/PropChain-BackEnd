import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

export interface PasswordRotationCheck {
  canRotate: boolean;
  reason?: string;
  daysUntilExpiry?: number;
  lastRotation?: Date;
}

export interface PasswordHistoryEntry {
  id: string;
  userId: string;
  createdAt: Date;
}

@Injectable()
export class PasswordRotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if password rotation is required for a user
   */
  async checkRotationStatus(userId: string): Promise<PasswordRotationCheck> {
    const passwordExpiryDays = this.configService.get<number>('PASSWORD_EXPIRY_DAYS', 90);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        passwordHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user || !user.password) {
      return { canRotate: false, reason: 'User not found or no password set' };
    }

    // Check if password has expired
    const lastPasswordChange = user.passwordHistory[0]?.createdAt || user.createdAt;
    const daysSinceChange = Math.floor((Date.now() - lastPasswordChange.getTime()) / (1000 * 60 * 60 * 24));
    const daysUntilExpiry = Math.max(0, passwordExpiryDays - daysSinceChange);

    if (daysSinceChange >= passwordExpiryDays) {
      return {
        canRotate: true,
        reason: 'Password has expired and must be changed',
        daysUntilExpiry: 0,
        lastRotation: lastPasswordChange,
      };
    }

    return {
      canRotate: true,
      daysUntilExpiry,
      lastRotation: lastPasswordChange,
    };
  }

  /**
   * Validate that a new password is not in the user's password history
   */
  async validatePasswordNotInHistory(
    userId: string,
    newPassword: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    const passwordHistoryCount = this.configService.get<number>('PASSWORD_HISTORY_COUNT', 5);

    // Get recent password history
    const passwordHistory = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: passwordHistoryCount,
    });

    // Check against each historical password
    for (const entry of passwordHistory) {
      const isMatch = await bcrypt.compare(newPassword, entry.passwordHash);
      if (isMatch) {
        return {
          valid: false,
          reason: `Cannot reuse any of your last ${passwordHistoryCount} passwords`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Add a password to the user's history
   */
  async addPasswordToHistory(userId: string, passwordHash: string): Promise<void> {
    const passwordHistoryCount = this.configService.get<number>('PASSWORD_HISTORY_COUNT', 5);

    await this.prisma.$transaction(async tx => {
      // Add new password to history
      await tx.passwordHistory.create({
        data: {
          userId,
          passwordHash,
        },
      });

      // Remove old entries beyond the history limit
      const historyEntries = await tx.passwordHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: passwordHistoryCount,
      });

      if (historyEntries.length > 0) {
        await tx.passwordHistory.deleteMany({
          where: {
            id: {
              in: historyEntries.map(entry => entry.id),
            },
          },
        });
      }
    });
  }

  /**
   * Validate password rotation requirements before allowing password change
   */
  async validatePasswordRotation(userId: string, newPassword: string): Promise<{ valid: boolean; reason?: string }> {
    // Check rotation status
    const rotationStatus = await this.checkRotationStatus(userId);
    if (!rotationStatus.canRotate && rotationStatus.reason) {
      return { valid: false, reason: rotationStatus.reason };
    }

    // Check password history
    const historyCheck = await this.validatePasswordNotInHistory(userId, newPassword);
    if (!historyCheck.valid) {
      return { valid: false, reason: historyCheck.reason };
    }

    return { valid: true };
  }

  /**
   * Get password history for a user
   */
  async getPasswordHistory(userId: string, limit = 10): Promise<PasswordHistoryEntry[]> {
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        createdAt: true,
      },
    });

    return history;
  }

  /**
   * Clear password history for a user (admin function)
   */
  async clearPasswordHistory(userId: string): Promise<void> {
    await this.prisma.passwordHistory.deleteMany({
      where: { userId },
    });
  }

  /**
   * Get users with expired passwords
   */
  async getUsersWithExpiredPasswords(): Promise<{ userId: string; email: string; daysExpired: number }[]> {
    const passwordExpiryDays = this.configService.get<number>('PASSWORD_EXPIRY_DAYS', 90);

    const users = await this.prisma.user.findMany({
      where: {
        password: { not: null },
      },
      include: {
        passwordHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const expiredUsers: { userId: string; email: string; daysExpired: number }[] = [];

    for (const user of users) {
      const lastPasswordChange = user.passwordHistory[0]?.createdAt || user.createdAt;
      const daysSinceChange = Math.floor((Date.now() - lastPasswordChange.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceChange > passwordExpiryDays) {
        expiredUsers.push({
          userId: user.id,
          email: user.email,
          daysExpired: daysSinceChange - passwordExpiryDays,
        });
      }
    }

    return expiredUsers;
  }

  /**
   * Check if user needs to rotate password (for middleware/guard usage)
   */
  async requiresPasswordRotation(userId: string): Promise<boolean> {
    const passwordExpiryDays = this.configService.get<number>('PASSWORD_EXPIRY_DAYS', 90);
    const warningDays = this.configService.get<number>('PASSWORD_EXPIRY_WARNING_DAYS', 7);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        passwordHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user || !user.password) {
      return false;
    }

    const lastPasswordChange = user.passwordHistory[0]?.createdAt || user.createdAt;
    const daysSinceChange = Math.floor((Date.now() - lastPasswordChange.getTime()) / (1000 * 60 * 60 * 24));

    // Require rotation if expired or within warning period
    return daysSinceChange >= passwordExpiryDays - warningDays;
  }
}
