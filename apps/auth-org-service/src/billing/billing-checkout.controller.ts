import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import {
  INTERNAL_SERVICE_AUTH_HEADER,
  Role,
  SubscriptionTier,
} from '@saas/common';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { StripeBillingService } from './stripe-billing.service';

class CreateCheckoutBodyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsUUID()
  tenantId!: string;

  @IsEnum(SubscriptionTier)
  tier!: SubscriptionTier;

  @IsEnum(Role)
  actorRole!: Role;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  actorUserId?: string;
}

@Controller('billing')
export class BillingCheckoutController {
  constructor(
    private readonly stripeBilling: StripeBillingService,
    private readonly prisma: PrismaService,
  ) {}

  private assertInternalAuth(headerValue: string | undefined): void {
    const expected = process.env.INTERNAL_SERVICE_SECRET?.trim();
    if (!expected) {
      throw new UnauthorizedException(
        'INTERNAL_SERVICE_SECRET is not configured',
      );
    }
    if (!headerValue || headerValue.trim() !== expected) {
      throw new UnauthorizedException('Invalid internal auth header');
    }
  }

  @Post('checkout')
  async createCheckout(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: CreateCheckoutBodyDto,
    @Headers(INTERNAL_SERVICE_AUTH_HEADER) internalAuth: string | undefined,
  ): Promise<{ url: string; sessionId: string }> {
    this.assertInternalAuth(internalAuth);
    if (
      body.actorRole !== Role.SUPER_ADMIN &&
      body.actorRole !== Role.ORG_ADMIN
    ) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN or ORG_ADMIN can create checkout',
      );
    }
    const actorUserId = body.actorUserId?.trim();
    if (!actorUserId) {
      throw new BadRequestException('actorUserId is required');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, tenantId: true, role: true },
    });
    if (!actor) {
      throw new UnauthorizedException('Actor user not found');
    }
    if (actor.role !== body.actorRole) {
      throw new ForbiddenException('Actor role mismatch');
    }
    if (actor.role === Role.ORG_ADMIN && actor.tenantId !== body.tenantId) {
      throw new ForbiddenException(
        'ORG_ADMIN can only create checkout for their own tenant',
      );
    }

    return this.stripeBilling.createCheckoutSession({
      tenantId: body.tenantId,
      tier: body.tier,
      actorUserId,
    });
  }
}
