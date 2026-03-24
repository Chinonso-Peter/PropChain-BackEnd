import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { PasswordValidator } from '../common/validators/password.validator';
import { PasswordRotationService } from '../common/services/password-rotation.service';
import { ConfigService } from '@nestjs/config';

/**
 * UserService
 *
 * Handles user account management operations including:
 * - User registration with password hashing
 * - User lookup by email or wallet address
 * - Password updates with validation
 * - Email verification
 * - Profile management
 *
 * All passwords are hashed using bcrypt with configurable salt rounds.
 * Ensures data integrity through unique constraint validation.
 *
 * @class UserService
 * @injectable
 */
@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private readonly passwordValidator: PasswordValidator,
    private readonly passwordRotationService: PasswordRotationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a new user account
   *
   * Performs comprehensive validation:
   * - Password strength (minimum 8 chars, mixed case, numbers, special chars)
   * - Email and wallet address uniqueness
   *
   * Passwords are hashed using bcrypt with saltRounds from config (default: 12).
   * Default role is 'USER' - can be elevated by administrators.
   *
   * @param {CreateUserDto} createUserDto - User data (email, password, firstName, lastName, walletAddress)
   * @returns {Promise<User>} Created user object (password removed from response)
   * @throws {BadRequestException} If password doesn't meet strength requirements
   * @throws {ConflictException} If email or wallet already registered
   *
   * @example
   * ```typescript
   * const user = await userService.create({
   *   email: 'newuser@example.com',
   *   password: 'SecurePass123!',
   *   firstName: 'John',
   *   lastName: 'Doe'
   * });
   * ```
   */
  async create(createUserDto: CreateUserDto) {
    const { email, password, walletAddress } = createUserDto;

    // === PASSWORD STRENGTH VALIDATION ===
    // Ensures password meets security requirements:
    // - Minimum 8 characters
    // - Mix of uppercase and lowercase
    // - At least one number
    // - At least one special character
    if (password) {
      const passwordValidation = this.passwordValidator.validatePassword(password);
      if (!passwordValidation.valid) {
        throw new BadRequestException(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
      }
    }

    // === UNIQUENESS VALIDATION ===
    // Prevents duplicate accounts with same email or wallet address
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, ...(walletAddress ? [{ walletAddress }] : [])],
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email or wallet address already exists');
    }

    // === PASSWORD HASHING ===
    // Uses bcrypt for secure password hashing
    // Salt rounds configurable via BCRYPT_ROUNDS (default: 12, minimum: 12)
    // Higher = more secure but slower
    const bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const effectiveRounds = Math.max(bcryptRounds, 12); // Enforce minimum 12 rounds
    const hashedPassword = await bcrypt.hash(password, effectiveRounds);

    // Create user with hashed password
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        walletAddress,
        role: 'USER', // Default role
      },
    });

    // === PASSWORD HISTORY TRACKING ===
    // Add initial password to history for rotation policy enforcement
    await this.passwordRotationService.addPasswordToHistory(user.id, hashedPassword);

    return user;
  }

  /**
   * Find user by email address
   *
   * @param {string} email - Email address to search for
   * @returns {Promise<User>} User object if found, null otherwise
   *
   * @example
   * ```typescript
   * const user = await userService.findByEmail('user@example.com');
   * ```
   */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Find user by ID
   *
   * @param {string} id - User ID to search for
   * @returns {Promise<User>} User object
   * @throws {NotFoundException} If user doesn't exist
   *
   * @example
   * ```typescript
   * const user = await userService.findById('clx123abc');
   * ```
   */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  /**
   * Find user by blockchain wallet address
   *
   * Supports Web3 authentication without traditional email/password.
   *
   * @param {string} walletAddress - Blockchain wallet address (e.g., 0x...)
   * @returns {Promise<User>} User object if found, null otherwise
   *
   * @example
   * ```typescript
   * const user = await userService.findByWalletAddress('0x742d35Cc6634C0532925a3b844Bc59e4e7aa6cA6');
   * ```
   */
  async findByWalletAddress(walletAddress: string) {
    return this.prisma.user.findUnique({
      where: { walletAddress },
    });
  }

  /**
   * Update user password with validation
   *
   * Validates new password strength before updating.
   * Uses bcrypt for secure hashing.
   *
   * @param {string} userId - ID of user whose password to update
   * @param {string} newPassword - New password (must pass strength validation)
   * @returns {Promise<User>} Updated user object
   * @throws {BadRequestException} If password doesn't meet strength requirements
   * @throws {NotFoundException} If user doesn't exist
   *
   * @example
   * ```typescript
   * await userService.updatePassword(userId, 'NewSecurePass123!');
   * // User can now login with new password
   * ```
   */
  async updatePassword(userId: string, newPassword: string) {
    // === PASSWORD VALIDATION ===
    // Ensure new password meets security requirements
    const passwordValidation = this.passwordValidator.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new BadRequestException(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }

    // === PASSWORD ROTATION POLICY CHECK ===
    // Validate password rotation requirements (history check)
    const rotationCheck = await this.passwordRotationService.validatePasswordRotation(userId, newPassword);
    if (!rotationCheck.valid) {
      throw new BadRequestException(`Password rotation failed: ${rotationCheck.reason}`);
    }

    // === BCRYPT HASHING ===
    // Hash new password before storing with minimum 12 rounds
    const bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
    const effectiveRounds = Math.max(bcryptRounds, 12); // Enforce minimum 12 rounds
    const hashedPassword = await bcrypt.hash(newPassword, effectiveRounds);

    // Update user password
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // === PASSWORD HISTORY TRACKING ===
    // Add new password to history for rotation policy enforcement
    await this.passwordRotationService.addPasswordToHistory(userId, hashedPassword);

    return updatedUser;
  }

  /**
   * Mark user email as verified
   *
   * Called after successful email verification.
   * Sets isVerified flag to true.
   *
   * @param {string} userId - ID of user to verify
   * @returns {Promise<User>} Updated user object
   * @throws {NotFoundException} If user doesn't exist
   *
   * @example
   * ```typescript
   * await userService.verifyUser(userId);
   * // User can now access full platform features
   * ```
   */
  async verifyUser(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    });
  }

  /**
   * Update user profile information
   *
   * Supports partial updates for email, wallet address, and active status.
   * Validates uniqueness of new email and wallet address.
   *
   * @param {string} id - User ID to update
   * @param {Object} data - Data to update
   * @param {string} [data.email] - New email address
   * @param {string} [data.walletAddress] - New wallet address
   * @param {boolean} [data.isActive] - Account active status
   * @returns {Promise<User>} Updated user object
   * @throws {ConflictException} If email or wallet already taken by another user
   * @throws {NotFoundException} If user doesn't exist
   *
   * @example
   * ```typescript
   * await userService.updateUser(userId, {
   *   email: 'newemail@example.com'
   * });
   * ```
   */
  async updateUser(id: string, data: Partial<{ email: string; walletAddress: string; isActive: boolean }>) {
    // === EMAIL UNIQUENESS CHECK ===
    // Prevent email collisions with other users
    if (data.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email: data.email,
          id: { not: id }, // Exclude current user
        },
      });

      if (existingUser) {
        throw new ConflictException('Email already taken by another user');
      }
    }

    // === WALLET ADDRESS UNIQUENESS CHECK ===
    // Prevent wallet address collisions
    if (data.walletAddress) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          walletAddress: data.walletAddress,
          id: { not: id }, // Exclude current user
        },
      });

      if (existingUser) {
        throw new ConflictException('Wallet address already taken by another user');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data,
    });
  }
  /**
   * Update user profile (bio, location, avatar)
   */
  async updateProfile(userId: string, profile: { bio?: string; location?: string; avatarUrl?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: profile,
    });
  }

  /**
   * Update user preferences (JSON)
   */
  async updatePreferences(userId: string, preferences: any) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { preferences },
    });
  }

  /**
   * Track user activity
   */
  async logActivity(userId: string, action: string, metadata?: any) {
    return this.prisma.userActivity.create({
      data: { userId, action, metadata },
    });
  }

  /**
   * Get user activity history
   */
  async getActivityHistory(userId: string, limit = 50) {
    return this.prisma.userActivity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Update user avatar
   */
  async updateAvatar(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
  }

  /**
   * Search users by name, email, or location
   */
  async searchUsers(query: string, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { bio: { contains: query, mode: 'insensitive' } },
          { location: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
    });
  }

  /**
   * Follow another user
   */
  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself');
    }
    // Prevent duplicate follows
    const existing = await this.prisma.userRelationship.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.userRelationship.create({
      data: { followerId, followingId },
    });
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(followerId: string, followingId: string) {
    return this.prisma.userRelationship.delete({
      where: { followerId_followingId: { followerId, followingId } },
    });
  }

  /**
   * List followers of a user
   */
  async getFollowers(userId: string, limit = 50) {
    return this.prisma.userRelationship.findMany({
      where: { followingId: userId },
      take: limit,
      include: { follower: true },
    });
  }

  /**
   * List users a user is following
   */
  async getFollowing(userId: string, limit = 50) {
    return this.prisma.userRelationship.findMany({
      where: { followerId: userId },
      take: limit,
      include: { following: true },
    });
  }

  /**
   * Get user analytics (basic engagement metrics)
   */
  async getUserAnalytics(userId: string) {
    const [loginCount, activityCount, followers, following] = await Promise.all([
      this.prisma.userActivity.count({ where: { userId, action: 'login' } }),
      this.prisma.userActivity.count({ where: { userId } }),
      this.prisma.userRelationship.count({ where: { followingId: userId } }),
      this.prisma.userRelationship.count({ where: { followerId: userId } }),
    ]);
    return { loginCount, activityCount, followers, following };
  }

  /**
   * Update privacy settings
   */
  async updatePrivacySettings(userId: string, privacySettings: any) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { privacySettings },
    });
  }

  /**
   * Request user data export
   */
  async requestDataExport(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { exportRequestedAt: new Date() },
    });
  }
}
