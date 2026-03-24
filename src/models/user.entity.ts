import { User as PrismaUser, UserRole } from '@prisma/client';

export { UserRole };

export class User implements PrismaUser {
  id: string;
  email: string;
  password: string | null;

  walletAddress: string | null;

  isVerified: boolean;

  roleId: string | null;
  role: UserRole;

  createdAt: Date;
  updatedAt: Date;

  // Advanced profile fields
  bio: string | null;
  location: string | null;
  avatarUrl: string | null;

  // Preferences and privacy
  preferences: any | null;
  privacySettings: any | null;
  exportRequestedAt: Date | null;


  // Relationships
  followers?: any[];
  following?: any[];

  // Activity
  activities?: any[];
}

/**
 * Input used when creating a user
// User activity entity
export class UserActivity {
  id: string;
  userId: string;
  action: string;
  metadata?: any;
  createdAt: Date;
}

// User relationship entity
export class UserRelationship {
  id: string;
  followerId: string;
  followingId: string;
  status: string;
  createdAt: Date;
  follower?: User;
  following?: User;
}
 * Flexible enough for email/password and Web3 users
 */
export type CreateUserInput = {
  email: string;
  password?: string;
  walletAddress?: string;
  role?: UserRole;
  roleId?: string;
};

export type UpdateUserInput = Partial<CreateUserInput>;
