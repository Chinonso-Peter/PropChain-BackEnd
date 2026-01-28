import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyController } from './api-key.controller';
import { PrismaModule } from '../database/prisma/prisma.module';
import { RedisService } from '../common/services/redis.service';

@Module({
  imports: [PrismaModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService, RedisService],
  exports: [ApiKeyService],
})
export class ApiKeysModule {}
