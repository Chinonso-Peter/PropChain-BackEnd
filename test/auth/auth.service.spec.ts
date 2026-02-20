import { Test } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
import { UserService } from '../../src/users/user.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../src/common/services/redis.service';
import { CreateUserDto } from '../../src/users/dto/create-user.dto';
import { StructuredLoggerService } from '../../src/common/logging/logger.service';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: UserService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            findById: jest.fn(),
            updatePassword: jest.fn(),
            verifyUser: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            setex: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
          },
        },
        StructuredLoggerService,
      ],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    userService = moduleRef.get<UserService>(UserService);
  });

  describe('register', () => {
    it('should register a new user', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        password: 'Password1!',
        firstName: 'Test',
        lastName: 'User',
      };

      jest.spyOn(userService, 'create').mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        password: null,
        isVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        walletAddress: null,
        role: 'USER',
        roleId: null,
      } as any);

      const result = await authService.register(createUserDto);
      expect(result).toEqual({ message: 'User registered successfully. Please check your email for verification.' });
    });
  });
});
