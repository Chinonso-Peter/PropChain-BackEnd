import { Module, Global } from '@nestjs/common';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StructuredLoggerService } from './logger.service';
import { RedisService } from '../services/redis.service';

@Global() // This means you don't have to import it in every other file
@Module({
  imports: [
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        config: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB', 0),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [StructuredLoggerService, RedisService],
  exports: [StructuredLoggerService, RedisService],
})
export class LoggingModule {}