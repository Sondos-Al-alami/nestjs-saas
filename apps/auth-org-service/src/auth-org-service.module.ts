import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { BillingCheckoutController } from './billing/billing-checkout.controller';
import { StripeWebhookController } from './billing/stripe-webhook.controller';
import { StripeBillingService } from './billing/stripe-billing.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthOrgServiceController } from './auth-org-service.controller';
import { AuthOrgServiceService } from './auth-org-service.service';

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'unsafe-dev-only-jwt-secret';
}

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: resolveJwtSecret(),
      // Access TTL is set per `signAsync` in AuthOrgServiceService (refresh tokens are opaque DB rows).
      signOptions: {},
    }),
  ],
  controllers: [
    AuthOrgServiceController,
    StripeWebhookController,
    BillingCheckoutController,
  ],
  providers: [AuthOrgServiceService, StripeBillingService],
})
export class AuthOrgServiceModule {}
