import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AuthModule } from '../auth/auth.module';
import { PasswordValidator } from '../common/validators/password.validator';
import { PasswordRotationService } from '../common/services/password-rotation.service';
import { PrismaModule } from '../database/prisma/prisma.module';
import { CacheModule } from '../common/cache/cache.module';
import { BoundaryValidationModule } from '../common/validation';

@Module({
  imports: [
    // FIX: Using forwardRef to allow AuthModule and UsersModule to depend on each other
    forwardRef(() => AuthModule),
    PrismaModule,
    CacheModule,
    BoundaryValidationModule,
  ],
  controllers: [UserController],
  providers: [UserService, PasswordValidator, PasswordRotationService],
  exports: [UserService, PasswordRotationService], // Export for use in other modules
})
export class UsersModule {}
