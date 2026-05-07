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
import { INTERNAL_SERVICE_AUTH_HEADER, SubscriptionTier } from '@saas/common';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma';
import { StripeBillingService } from './stripe-billing.service';

class CreateCheckoutBodyDto {
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsUUID()
  tenantId!: string;

  @IsEnum(SubscriptionTier)
  tier!: SubscriptionTier;

  @IsIn([Role.SUPER_ADMIN, Role.ORG_ADMIN])
  actorRole!: typeof Role.SUPER_ADMIN | typeof Role.ORG_ADMIN;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
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
