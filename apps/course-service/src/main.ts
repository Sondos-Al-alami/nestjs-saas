import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RpcException, Transport } from '@nestjs/microservices';
import { CourseServiceModule } from './course-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice(CourseServiceModule, {
    transport: Transport.TCP,
    options: {
      host: process.env.TCP_HOST ?? '0.0.0.0',
      port: parseInt(process.env.COURSE_TCP_PORT ?? '3002', 10),
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const message = errors
          .flatMap((e) => (e.constraints ? Object.values(e.constraints) : []))
          .join('; ');
        return new RpcException({
          statusCode: 400,
          message: message || 'Validation failed',
        });
      },
    }),
  );
  await app.listen();
}
void bootstrap();
