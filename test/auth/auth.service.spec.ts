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
  let redisMock: any;
  let configMock: any;

  beforeEach(async () => {
    redisMock = {
      set: jest.fn(),
      setex: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
    };

    configMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'MAX_LOGIN_ATTEMPTS') return 5;
        if (key === 'LOGIN_ATTEMPT_WINDOW') return 600;
        return null;
      }),
    };

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
          useValue: configMock,
        },
        {
          provide: RedisService,
          useValue: redisMock,
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

  describe('login brute force protection', () => {
    const creds = { email: 'foo@bar.com', password: 'bad' };

    it('should increment login attempts on invalid credentials', async () => {
      jest.spyOn(authService, 'validateUserByEmail').mockResolvedValue(null);
      redisMock.get.mockResolvedValue('0');

      await expect(authService.login(creds)).rejects.toThrow('The provided credentials are invalid');
      expect(redisMock.setex).toHaveBeenCalledWith('login_attempts:foo@bar.com', 600, '1');
    });

    it('should block when max attempts reached', async () => {
      redisMock.get.mockResolvedValue('5');
      await expect(authService.login(creds)).rejects.toThrow('Too many login attempts');
    });

    it('should clear attempts after successful login', async () => {
      const fakeUser = { id: 'u1', email: 'foo@bar.com' };
      jest.spyOn(authService, 'validateUserByEmail').mockResolvedValue(fakeUser as any);
      redisMock.get.mockResolvedValue('2');
      // jwtService.sign is already a jest.fn(), so generateTokens will run without errors

      await authService.login(creds);
      expect(redisMock.del).toHaveBeenCalledWith('login_attempts:foo@bar.com');
    });
  });
});
