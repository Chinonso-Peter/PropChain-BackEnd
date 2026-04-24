import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../database/prisma.module';
import { FraudModule } from '../fraud/fraud.module';

@Module({
  imports: [PrismaModule, FraudModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
