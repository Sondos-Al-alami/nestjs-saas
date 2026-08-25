import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Enable unless explicitly disabled (e.g. SWAGGER_ENABLED=0 in production). */
export function isSwaggerEnabled(): boolean {
  const raw = process.env.SWAGGER_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') {
    return false;
  }
  if (raw === '1' || raw === 'true' || raw === 'on') {
    return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export function setupSwagger(app: INestApplication): void {
  if (!isSwaggerEnabled()) {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('NestJS SaaS LMS API')
    .setDescription(
      'HTTP API exposed by api-gateway. Authenticated routes require ' +
        '`Authorization: Bearer <accessToken>` and usually `x-tenant-id`.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'x-tenant-id' },
      'tenant-id',
    )
    .addTag('ops', 'Health, readiness, metrics, alerts')
    .addTag('auth', 'Registration, login, sessions, invites')
    .addTag('courses', 'Courses, lessons, enrollments')
    .addTag('analytics', 'Events, reports, DLQ, webhook endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
