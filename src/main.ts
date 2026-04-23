import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { VersionHeaderInterceptor } from './versioning/version-header.interceptor';
import { DeprecationWarningInterceptor } from './versioning/deprecation-warning.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Enable validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Global prefix
  app.setGlobalPrefix('api');

  // Apply version header interceptor globally
  app.useGlobalInterceptors(new VersionHeaderInterceptor());
  
  // Apply deprecation warning interceptor
  app.useGlobalInterceptors(new DeprecationWarningInterceptor(app.get('Reflector')));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`PropChain API running on http://localhost:${port}`);
  logger.log(`API Versioning enabled. Supported versions: v1, v2`);
}
bootstrap();
