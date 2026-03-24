import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { PasswordValidator } from '../common/validators/password.validator';
import { PasswordRotationService } from '../common/services/password-rotation.service';

@Module({
  imports: [
    // FIX: Using forwardRef to allow AuthModule and UsersModule to depend on each other
    forwardRef(() => AuthModule),
  ],
  controllers: [UserController],
  providers: [UserService, PrismaService, PasswordValidator, PasswordRotationService],
  exports: [UserService, PasswordRotationService], // Export for use in other modules
})
export class UsersModule {}
