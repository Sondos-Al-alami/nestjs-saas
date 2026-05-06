import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  ClientsModule,
  type ClientProviderOptions,
  Transport,
} from '@nestjs/microservices';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantInterceptor, TenantMiddleware } from '@saas/common';
import { AuthModule, JwtAuthGuard, RolesGuard, TenantScopeGuard } from './auth';
import { AuthGatewayController } from './auth/auth.controller';
import { CoursesGatewayController } from './courses/courses.controller';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import { RequestContextMiddleware } from './core/request-context.middleware';

function tcpClient(
  name: string,
  port: number,
  hostOverrideEnv?: string,
): ClientProviderOptions {
  const host =
    (hostOverrideEnv && process.env[hostOverrideEnv]) ||
    process.env.TCP_HOST ||
    '127.0.0.1';
  return {
    name,
    transport: Transport.TCP,
    options: { host, port },
  };
}

@Module({
  imports: [
    AuthModule,
    ClientsModule.register([
      tcpClient(
        'AUTH_ORG_SERVICE',
        parseInt(process.env.AUTH_ORG_TCP_PORT ?? '3001', 10),
        'AUTH_ORG_TCP_HOST',
      ),
      tcpClient(
        'COURSE_SERVICE',
        parseInt(process.env.COURSE_TCP_PORT ?? '3002', 10),
        'COURSE_TCP_HOST',
      ),
      tcpClient(
        'ANALYTICS_WEBHOOK_SERVICE',
        parseInt(process.env.ANALYTICS_TCP_PORT ?? '3003', 10),
        'ANALYTICS_TCP_HOST',
      ),
    ]),
  ],
  controllers: [
    ApiGatewayController,
    AuthGatewayController,
    CoursesGatewayController,
  ],
  providers: [
    ApiGatewayService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantScopeGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class ApiGatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, TenantMiddleware)
      .forRoutes(
        ApiGatewayController,
        AuthGatewayController,
        CoursesGatewayController,
      );
  }
}
