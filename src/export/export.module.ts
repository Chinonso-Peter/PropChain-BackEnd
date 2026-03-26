import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ExportProcessor } from './export.processor';
import { PrismaModule } from '../database/prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { PropertiesModule } from '../properties/properties.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    PropertiesModule,
    TransactionsModule,
    BullModule.registerQueue({
      name: 'export-queue',
    }),
  ],
  controllers: [ExportController],
  providers: [ExportService, ExportProcessor],
  exports: [ExportService],
})
export class ExportModule {}
