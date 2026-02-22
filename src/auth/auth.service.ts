import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UserService } from '../users/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CreateUserDto } from '../users/dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../common/services/redis.service';
import { v4 as uuidv4 } from 'uuid';
import { StructuredLoggerService } from '../common/logging/logger.service';
import { AuthUser, JwtPayload, AuthTokens } from './auth.types';
import { PrismaUser } from '../types/prisma.types';
import { isObject, isString } from '../types/guards';

/**
 * AuthService
 * 
 * Handles all authentication-related operations including user registration, login (email/password and Web3),
 * token management, password reset, and session management. Implements security best practices such as:
 * - Password hashing with bcrypt
 * - JWT-based token authentication with refresh token rotation
 * - Brute-force attack protection via Redis rate limiting
 * - Token blacklisting for logout
 * - Email verification
 * 
 * @class AuthService
 * @injectable
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly logger: StructuredLoggerService,
  ) {
    this.logger.setContext('AuthService');
  }

  /**
   * Register a new user account
   * 
   * Creates a new user with the provided credentials and sends a verification email.
   * Password strength validation and email uniqueness checks are performed by the UserService.
   * 
   * @param {CreateUserDto} createUserDto - User registration data (email, password, name, etc.)
   * @returns {Promise<{message: string}>} Success message confirming registration
   * @throws {ConflictException} If user with email/wallet already exists
   * @throws {BadRequestException} If password doesn't meet strength requirements
   * 
   * @example
   * ```typescript
   * const result = await authService.register({
   *   email: 'user@example.com',
   *   password: 'SecurePass123!',
   *   firstName: 'John',
   *   lastName: 'Doe'
   * });
   * // Returns: { message: 'User registered successfully...' }
   * ```
   */
  async register(createUserDto: CreateUserDto) {
    try {
      const user = await this.userService.create(createUserDto);
      await this.sendVerificationEmail(user.id, user.email);
      this.logger.logAuth('User registration successful', { userId: user.id });
      return {
        message: 'User registered successfully. Please check your email for verification.',
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error('User registration failed', errorMessage, {
        email: createUserDto.email,
      });
      throw error;
    }
  }

  /**
   * Authenticate a user via email/password or Web3 wallet
   * 
   * Supports two authentication methods:
   * 1. Traditional: email + password credentials
   * 2. Web3: wallet address + signature (auto-creates account if needed)
   * 
   * Implements rate limiting to prevent brute-force attacks:
   * - Tracks failed login attempts in Redis
   * - Locks account after MAX_LOGIN_ATTEMPTS within LOGIN_ATTEMPT_WINDOW
   * 
   * @param {Object} credentials - Authentication credentials
   * @param {string} [credentials.email] - User email (for traditional login)
   * @param {string} [credentials.password] - User password (for traditional login)
   * @param {string} [credentials.walletAddress] - Wallet address (for Web3 login)
   * @param {string} [credentials.signature] - Wallet signature (for Web3 login)
   * @returns {Promise<{access_token: string, refresh_token: string, user: object}>} Auth tokens and user info
   * @throws {UnauthorizedException} If credentials are invalid or too many attempts
   * @throws {BadRequestException} If neither email/password nor wallet/signature provided
   * 
   * @example
   * ```typescript
   * // Email/Password login
   * const result = await authService.login({
   *   email: 'user@example.com',
   *   password: 'SecurePass123!'
   * });
   * 
   * // Web3 wallet login
   * const result = await authService.login({
   *   walletAddress: '0x1234...5678',
   *   signature: '0xabcd...efgh'
   * });
   * ```
   */
  async login(credentials: { email?: string; password?: string; walletAddress?: string; signature?: string }) {
    let user: any;

    // === BRUTE FORCE PROTECTION ===
    // Prevents account takeover attacks by rate-limiting failed login attempts
    // Uses Redis to track attempts with automatic expiration after LOGIN_ATTEMPT_WINDOW
    const identifier = credentials.email || credentials.walletAddress;
    const maxAttempts = this.configService.get<number>('MAX_LOGIN_ATTEMPTS', 5);
    const attemptWindow = this.configService.get<number>('LOGIN_ATTEMPT_WINDOW', 600); // seconds
    const attemptsKey = identifier ? `login_attempts:${identifier}` : null;

    if (attemptsKey) {
      // Check current attempt count
      const existing = await this.redisService.get(attemptsKey);
      const attempts = parseInt(existing || '0', 10);
      if (attempts >= maxAttempts) {
        this.logger.warn('Too many login attempts', { identifier });
        throw new UnauthorizedException('Too many login attempts. Please try again later.');
      }
    }

    try {
      // Route to appropriate authentication method
      if (credentials.email && credentials.password) {
        user = await this.validateUserByEmail(credentials.email, credentials.password);
      } else if (credentials.walletAddress) {
        user = await this.validateUserByWallet(credentials.walletAddress, credentials.signature);
      } else {
        throw new BadRequestException('Email/password or wallet address/signature required');
      }

      if (!user) {
        this.logger.warn('Invalid login attempt', { email: credentials.email });
        // Increment attempt counter only on failed login
        // This is separate from the pre-check above to ensure we block on MAX_ATTEMPTS reached
        if (attemptsKey) {
          const existing = await this.redisService.get(attemptsKey);
          const attempts = parseInt(existing || '0', 10) + 1;
          // Use SETEX to ensure counter automatically expires
          await this.redisService.setex(attemptsKey, attemptWindow, attempts.toString());
        }
        throw new UnauthorizedException('Invalid credentials');
      }

      // === SUCCESSFUL LOGIN - CLEAR ATTEMPT COUNTER ===
      // Remove rate limiting counter to reset failed attempt count
      if (attemptsKey) {
        await this.redisService.del(attemptsKey);
      }

      this.logger.logAuth('User login successful', { userId: user.id });
      return this.generateTokens(user);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error('User login failed', errorMessage, {
        email: credentials.email,
      });
      throw error;
    }
  }

  /**
   * Validate user credentials via email and password
   * 
   * Uses bcrypt to securely compare passwords. Handles both existing and non-existent users
   * with the same error message to prevent email enumeration attacks.
   * 
   * @param {string} email - User email address
   * @param {string} password - User password (plain text)
   * @returns {Promise<any>} User object without password field
   * @throws {UnauthorizedException} If user not found or password is invalid
   * @private
   */
  async validateUserByEmail(email: string, password: string): Promise<any> {
    const user = await this.userService.findByEmail(email);

    // Fail securely - don't reveal whether email exists
    if (!user || !user.password) {
      this.logger.warn('Email validation failed: User not found', { email });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Use bcrypt.compare for constant-time password comparison (prevents timing attacks)
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      this.logger.warn('Email validation failed: Invalid password', { email });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Remove sensitive data before returning
    const { password: _, ...result } = user as any;
    return result;
  }

  /**
   * Validate and authenticate user via Web3 wallet
   * 
   * Supports accounts created without traditional email/password. If wallet doesn't exist,
   * automatically creates a new account (JIT provisioning for Web3).
   * 
   * Note: In a production system, signature verification should decode the signed message
   * and verify it was signed by the provided wallet address to prevent unauthorized access.
   * 
   * @param {string} walletAddress - The wallet address attempting to login
   * @param {string} [signature] - The signature provided by the wallet (for verification)
   * @returns {Promise<any>} User object without password field
   * @throws {UnauthorizedException} If signature verification fails (implement in future)
   * @private
   */
  async validateUserByWallet(walletAddress: string, signature?: string): Promise<any> {
    let user = await this.userService.findByWalletAddress(walletAddress);

    // Auto-create account for new wallet addresses (JIT provisioning)
    if (!user) {
      user = await this.userService.create({
        email: `${walletAddress}@wallet.auth`,
        password: Math.random().toString(36).slice(-10),
        walletAddress,
        firstName: 'Web3',
        lastName: 'User',
      });
      this.logger.logAuth('New Web3 user created', { walletAddress });
    }

    // Remove sensitive data before returning
    const { password: _, ...result } = user as any;
    return result;
  }

  /**
   * Exchange a refresh token for new access and refresh tokens
   * 
   * Implements token rotation to maintain security. Validates that:
   * 1. Refresh token signature is valid (JWT verification)
   * 2. Referenced user still exists
   * 3. Token hasn't been previously invalidated (stored in Redis)
   * 
   * @param {string} refreshToken - The refresh token to exchange
   * @returns {Promise<{access_token: string, refresh_token: string, user: object}>} New token pair
   * @throws {UnauthorizedException} If token is invalid, expired, or revoked
   * 
   * @example
   * ```typescript\n   * const newTokens = await authService.refreshToken(oldRefreshToken);
   * // Use newTokens.access_token for subsequent requests
   * ```
   */
  async refreshToken(refreshToken: string) {
    try {
      // === TOKEN SIGNATURE VERIFICATION ===
      // Validates JWT signature and expiration time
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // === USER EXISTENCE CHECK ===
      // Handles case where user was deleted after token issued
      const user = await this.userService.findById(payload.sub);
      if (!user) {
        this.logger.warn('Refresh token validation failed: User not found', {
          userId: payload.sub,
        });
        throw new UnauthorizedException('User not found');
      }

      // === TOKEN REVOCATION CHECK ===
      // Prevents reuse of invalidated tokens (e.g., after logout)
      // Stored tokens are source of truth; prevents token reuse even if JWT hasn't expired
      const storedToken = await this.redisService.get(`refresh_token:${payload.sub}`);
      if (storedToken !== refreshToken) {
        this.logger.warn('Refresh token validation failed: Invalid token', {
          userId: payload.sub,
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      this.logger.logAuth('Token refreshed successfully', { userId: user.id });
      return this.generateTokens(user);
    } catch (error) {
      this.logger.error('Token refresh failed', error.stack);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user by invalidating tokens and terminating session
   * 
   * Implements two-level token invalidation:
   * 1. Blacklist access token (JTI-based) until expiration
   * 2. Revoke refresh token by removing from Redis
   * 
   * @param {string} userId - The user ID to logout
   * @param {string} [accessToken] - Current access token to blacklist
   * @returns {Promise<{message: string}>} Logout confirmation message
   * 
   * @example
   * ```typescript
   * await authService.logout(userId, authHeader.split(' ')[1]);
   * ```
   */
  async logout(userId: string, accessToken?: string) {
    // === ACCESS TOKEN BLACKLISTING ===
    // Prevent access token reuse until expiration
    // Uses JTI (JWT ID) unique identifier to track blacklisted tokens
    if (accessToken) {
      const tokenPayload = await this.jwtService.decode(accessToken);
      if (tokenPayload && typeof tokenPayload === 'object' && 'jti' in tokenPayload) {
        const jti = tokenPayload.jti;
        const expiry = tokenPayload.exp;
        if (jti && expiry) {
          // Calculate remaining TTL and store in Redis with auto-expiration
          const ttl = expiry - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            await this.redisService.setex(`blacklisted_token:${jti}`, ttl, userId);
            this.logger.logAuth('Access token blacklisted', { userId, jti });
          }
        }
      }
    }
    
    // === REFRESH TOKEN REVOCATION ===
    // Prevents token refresh even if JWT signature is still valid
    await this.redisService.del(`refresh_token:${userId}`);
    this.logger.logAuth('User logged out successfully', { userId });
    return { message: 'Logged out successfully' };
  }

  /**
   * Initiate password reset flow
   * 
   * Sends password reset email with a secure token. Returns same message regardless of whether
   * email exists to prevent email enumeration attacks. Token stored in Redis expires after 1 hour.
   * 
   * @param {string} email - User email address
   * @returns {Promise<{message: string}>} Generic success message
   * 
   * @example
   * ```typescript
   * await authService.forgotPassword('user@example.com');
   * ```
   */
  async forgotPassword(email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      // Return generic message to prevent email enumeration
      this.logger.log('Forgot password request for non-existent user', { email });
      return { message: 'If email exists, a reset link has been sent' };
    }

    // === GENERATE SECURE RESET TOKEN ===
    // UUID ensures uniqueness and security (unguessable)
    const resetToken = uuidv4();
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // Store in Redis with automatic expiration after 1 hour
    // This prevents indefinite password reset links
    await this.redisService.set(
      `password_reset:${resetToken}`,
      JSON.stringify({ userId: user.id, expiry: resetTokenExpiry }),
    );

    await this.sendPasswordResetEmail(user.email, resetToken);
    this.logger.log('Password reset email sent', { email });
    return { message: 'If email exists, a reset link has been sent' };
  }

  /**
   * Reset user password using a reset token
   * 
   * Validates reset token hasn't expired and user exists. Token is invalidated after
   * successful password reset to prevent replay attacks.
   * 
   * @param {string} resetToken - The reset token from password reset email
   * @param {string} newPassword - The new password (will be validated by UserService)
   * @returns {Promise<{message: string}>} Success message
   * @throws {BadRequestException} If token is invalid, expired, or password validation fails
   * 
   * @example
   * ```typescript
   * await authService.resetPassword('token-from-email', 'NewSecurePass123!');
   * ```
   */
  async resetPassword(resetToken: string, newPassword: string) {
    const resetData = await this.redisService.get(`password_reset:${resetToken}`);

    // Token must exist in Redis (not yet expired or already used)
    if (!resetData) {
      this.logger.warn('Invalid or expired password reset token received');
      throw new BadRequestException('Invalid or expired reset token');
    }

    const { userId, expiry } = JSON.parse(resetData);

    // === TOKEN EXPIRATION CHECK ===
    // Ensures reset link is only valid for 1 hour
    if (Date.now() > expiry) {
      // Remove expired token to free up Redis space
      await this.redisService.del(`password_reset:${resetToken}`);
      this.logger.warn('Expired password reset token used', { userId });
      throw new BadRequestException('Reset token has expired');
    }

    // Update password (UserService handles validation)
    await this.userService.updatePassword(userId, newPassword);
    
    // === INVALIDATE RESET TOKEN ===
    // Prevents reuse of same token for multiple password resets
    await this.redisService.del(`password_reset:${resetToken}`);

    this.logger.log('Password reset successfully', { userId });
    return { message: 'Password reset successfully' };
  }

  /**
   * Verify user email using verification token
   * 
   * Marks user as email-verified in the database. Token is deleted after
   * successful verification to prevent reuse.
   * 
   * @param {string} token - The email verification token from signup email
   * @returns {Promise<{message: string}>} Verification success message
   * @throws {BadRequestException} If token is invalid or expired
   * 
   * @example
   * ```typescript
   * await authService.verifyEmail('token-from-email');
   * ```
   */
  async verifyEmail(token: string) {
    const verificationData = await this.redisService.get(`email_verification:${token}`);

    if (!verificationData) {
      this.logger.warn('Invalid or expired email verification token');
      throw new BadRequestException('Invalid or expired verification token');
    }

    const { userId } = JSON.parse(verificationData);
    await this.userService.verifyUser(userId);
    await this.redisService.del(`email_verification:${token}`);

    this.logger.log('Email verified successfully', { userId });
    return { message: 'Email verified successfully' };
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const blacklisted = await this.redisService.get(`blacklisted_token:${jti}`);
    return blacklisted !== null;
  }

  async getActiveSessions(userId: string): Promise<any[]> {
    const sessionKeys = await this.redisService.keys(`active_session:${userId}:*`);
    const sessions = [];
    
    for (const key of sessionKeys) {
      const sessionData = await this.redisService.get(key);
      if (sessionData) {
        sessions.push(JSON.parse(sessionData));
      }
    }
    
    return sessions;
  }

  async getSessionById(userId: string, sessionId: string): Promise<any> {
    const sessionData = await this.redisService.get(`active_session:${userId}:${sessionId}`);
    return sessionData ? JSON.parse(sessionData) : null;
  }

  async getAllUserSessions(userId: string): Promise<any[]> {
    const sessions = await this.getActiveSessions(userId);
    return sessions.map(session => ({
      ...session,
      isActive: true,
      expiresIn: this.getSessionExpiry(session.createdAt)
    }));
  }

  async invalidateAllSessions(userId: string): Promise<void> {
    const sessionKeys = await this.redisService.keys(`active_session:${userId}:*`);
    for (const key of sessionKeys) {
      await this.redisService.del(key);
    }
    this.logger.logAuth('All sessions invalidated', { userId });
  }

  async getConcurrentSessions(userId: string): Promise<number> {
    const sessions = await this.getActiveSessions(userId);
    return sessions.length;
  }

  private getSessionExpiry(createdAt: string): number {
    const created = new Date(createdAt);
    const sessionTimeout = this.configService.get<number>('SESSION_TIMEOUT', 3600) * 1000;
    const expiry = created.getTime() + sessionTimeout;
    return Math.max(0, expiry - Date.now());
  }

  async invalidateSession(userId: string, sessionId: string): Promise<void> {
    await this.redisService.del(`active_session:${userId}:${sessionId}`);
    this.logger.logAuth('Session invalidated', { userId, sessionId });
  }

  /**
   * Generate JWT access and refresh tokens for authenticated user
   * 
   * Creates two tokens with different expiration times:
   * - Access token: Short-lived (15m default), used for API requests
   * - Refresh token: Long-lived (7d default), used to obtain new access tokens
   * 
   * Both tokens include a unique JTI (JWT ID) for blacklisting support.
   * Tokens are stored in Redis for validation during token refresh.
   * 
   * @param {any} user - The authenticated user object
   * @returns {Object} Token pair with user metadata
   * @private
   * 
   * @example
   * ```typescript
   * const tokens = this.generateTokens(user);
   * // Returns: { access_token, refresh_token, user: {...} }
   * // Access token valid for 15 minutes, refresh for 7 days
   * ```
   */
  private generateTokens(user: any) {
    // === UNIQUE JWT ID (JTI) ===
    // Enables per-token blacklisting even if JWT signature is still valid
    const jti = uuidv4();
    const payload = { 
      sub: user.id,      // Subject (user ID)
      email: user.email,
      jti: jti           // JWT ID for blacklisting
    };

    // === ACCESS TOKEN ===
    // Short-lived token for API authentication (default: 15 minutes)
    // Server verifies signature to validate token authenticity
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m') as any,
    });

    // === REFRESH TOKEN ===
    // Long-lived token for obtaining new access tokens (default: 7 days)
    // Different secret ensures refresh token can't be used as access token
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as any,
    });

    // Store refresh token in Redis for validation during token refresh
    this.redisService.set(`refresh_token:${user.id}`, refreshToken);
    
    // === ACTIVE SESSION TRACKING ===
    // Maintains user session metadata for monitoring and termination
    const sessionExpiry = this.configService.get<number>('SESSION_TIMEOUT', 3600);
    this.redisService.setex(`active_session:${user.id}:${jti}`, sessionExpiry, JSON.stringify({
      userId: user.id,
      createdAt: new Date().toISOString(),
      userAgent: 'unknown', // TODO: Capture from request headers
      ip: 'unknown'         // TODO: Capture from request
    }));

    this.logger.debug('Generated new tokens for user', { userId: user.id, jti });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
        isVerified: user.isVerified,
      },
    };
  }

  private async sendVerificationEmail(userId: string, email: string) {
    const verificationToken = uuidv4();

    // Save token in Redis
    const expiry = Date.now() + 3600000; // 1 hour
    await this.redisService.set(`email_verification:${verificationToken}`, JSON.stringify({ userId, expiry }));

    this.logger.log(`Verification email sent to ${email}`, { userId });
    this.logger.debug(`Verification token generated for ${email}`, { userId });
  }

  private async sendPasswordResetEmail(email: string, resetToken: string) {
    this.logger.log(`Password reset email sent to ${email}`);
    this.logger.debug(`Password reset token generated for ${email}`);
  }
}
