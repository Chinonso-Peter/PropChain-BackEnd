import { NestFactory } from '@nestjs/core';
import { AppCiModule } from './app.ci.module';

async function bootstrap() {
  const app = await NestFactory.create(AppCiModule);
  await app.listen(3000);
}

bootstrap();
