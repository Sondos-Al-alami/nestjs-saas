import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import { AllExceptionsFilter } from './core/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
}
bootstrap();
