import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { Web3Strategy } from './strategies/web3.strategy';
import { UsersModule } from '../users/users.module';
import { PrismaService } from '../database/prisma/prisma.service';

@Module({
  imports: [
    // FIX: Use forwardRef to break the circular dependency with UsersModule
    forwardRef(() => UsersModule),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalStrategy,
    Web3Strategy,
    PrismaService,
    // NOTE: Removed UserService here because it's now imported via UsersModule
    // NOTE: Removed RedisService as it's now globally provided by LoggingModule
  ],
  exports: [AuthService],
})
export class AuthModule {}