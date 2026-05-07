import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RpcException } from '@nestjs/microservices';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  canAssignRole,
  normalizeSeatEnforcementReason,
  Role as AppRole,
  type SeatEnforcementReason,
} from '@saas/common';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { Role } from './generated/prisma';
import { PrismaService } from './prisma/prisma.service';

function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function newOpaqueRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}

function conflictRpc(message: string): RpcException {
  return new RpcException({ statusCode: 409, message });
}

function freeTierSeatLimit(): number {
  const raw = process.env.STRIPE_FREE_INCLUDED_LEARNER_SEATS?.trim();
  if (!raw) {
    return 3;
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return 3;
  }
  return Math.max(1, parsed);
}

@Injectable()
export class AuthOrgServiceService {
  private readonly logger = new Logger(AuthOrgServiceService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private accessTtlSec(): number {
    return Math.max(60, parseInt(process.env.JWT_ACCESS_TTL_SEC ?? '900', 10));
  }

  private refreshTtlMs(): number {
    const days = parseFloat(process.env.JWT_REFRESH_TTL_DAYS ?? '30');
    return Math.max(86400000, Math.round(days * 86400000));
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private seatGraceDays(): number {
    const raw = process.env.BILLING_SEAT_GRACE_DAYS?.trim();
    if (!raw) {
      return 0;
    }
    const parsed = parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, parsed);
  }

  private async assertSeatCapacityForNewActiveLearner(args: {
    tenantId: string;
    reason: SeatEnforcementReason;
  }): Promise<{
    activeLearnerSeats: number;
    includedLearnerSeats: number | null;
    graceApplied: boolean;
    graceUntil: string | null;
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: args.tenantId },
      select: {
        id: true,
        includedLearnerSeats: true,
        seatBillingPeriodDays: true,
        updatedAt: true,
        stripeSubscriptionId: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const includedLearnerSeats =
      tenant.includedLearnerSeats ?? freeTierSeatLimit();

    const now = new Date();
    const threshold = new Date(
      now.getTime() - tenant.seatBillingPeriodDays * 24 * 60 * 60 * 1000,
    );

    const activeLearnerSeats = await this.prisma.membership.count({
      where: {
        tenantId: tenant.id,
        isActive: true,
        countsTowardLearnerSeats: true,
        lastSeatQualifyingActivityAt: { gte: threshold },
        user: { role: Role.LEARNER },
      },
    });

    if (activeLearnerSeats < includedLearnerSeats) {
      return {
        activeLearnerSeats,
        includedLearnerSeats,
        graceApplied: false,
        graceUntil: null,
      };
    }

    const graceDays = this.seatGraceDays();
    if (graceDays > 0 && tenant.stripeSubscriptionId) {
      const graceUntil = new Date(
        tenant.updatedAt.getTime() + graceDays * 24 * 60 * 60 * 1000,
      );
      if (now <= graceUntil) {
        this.logger.warn(
          `Seat limit exceeded but grace period active for tenant ${tenant.id} until ${graceUntil.toISOString()} (${args.reason})`,
        );
        return {
          activeLearnerSeats,
          includedLearnerSeats,
          graceApplied: true,
          graceUntil: graceUntil.toISOString(),
        };
      }
    }

    throw new ForbiddenException(
      `Seat limit reached: ${activeLearnerSeats}/${includedLearnerSeats} active learner seats in use. Cannot ${args.reason}.`,
    );
  }

  private domainFromEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[1]) {
      throw new BadRequestException('Invalid email');
    }
    return parts[1].toLowerCase();
  }

  private ensureDomainAllowed(allowedDomains: string[], email: string): void {
    if (allowedDomains.length === 0) {
      return;
    }
    const domain = this.domainFromEmail(email);
    if (!allowedDomains.includes(domain)) {
      throw new ConflictException(
        `Email domain ${domain} is not allowed for this tenant`,
      );
    }
  }

  private async dispatchInviteEmail(args: {
    to: string;
    tenantName: string;
    token: string;
    expiresAt: Date;
  }): Promise<void> {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.trim();
    const from = process.env.INVITE_EMAIL_FROM?.trim() || 'no-reply@lms.local';
    const inviteBaseUrl =
      process.env.INVITE_BASE_URL?.trim() || 'http://localhost:3000';
    const inviteUrl = `${inviteBaseUrl}/accept-invite?token=${args.token}`;

    // Development fallback so invite flow works before SMTP is configured.
    if (!host || !user || !pass) {
      this.logger.warn(
        `SMTP not configured; invite link for ${args.to}: ${inviteUrl} (expires ${args.expiresAt.toISOString()})`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true',
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to: args.to,
      subject: `You're invited to ${args.tenantName}`,
      text: `You were invited to join ${args.tenantName}. Accept invite: ${inviteUrl}`,
    });
  }

  health() {
    return { service: 'auth-org-service', ok: true as const };
  }

  tenantEcho(payload: { tenantId: string; userId: string; role: string }) {
    // Returns received identity fields so the gateway can assert forwarding correctness.
    return {
      service: 'auth-org-service',
      ok: true as const,
      tenantId: payload.tenantId,
      userId: payload.userId,
      role: payload.role,
      verifiedAt: new Date().toISOString(),
    };
  }

  async registerTenant(payload: {
    tenantName: string;
    adminEmail: string;
    adminDisplayName?: string;
    adminPassword: string;
    allowedDomains?: string[];
  }) {
    const tenantName = payload.tenantName.trim().replace(/\s+/g, ' ');
    const adminEmail = this.normalizeEmail(payload.adminEmail);
    const adminPassword = payload.adminPassword?.trim();
    if (!tenantName || !adminEmail || !adminPassword) {
      throw new BadRequestException(
        'tenantName, adminEmail, and adminPassword are required',
      );
    }
    if (adminPassword.length < 8) {
      throw new BadRequestException(
        'adminPassword must be at least 8 characters',
      );
    }
    const allowedDomains = (payload.allowedDomains ?? [])
      .map((d) => d.trim().toLowerCase())
      .filter((d) => d.length > 0);
    this.ensureDomainAllowed(allowedDomains, adminEmail);

    const nameTaken = await this.prisma.tenant.findUnique({
      where: { name: tenantName },
      select: { id: true },
    });
    if (nameTaken) {
      throw conflictRpc('An organization with this name already exists');
    }

    let tenant;
    try {
      tenant = await this.prisma.tenant.create({
        data: {
          name: tenantName,
          allowedDomains,
        },
      });
    } catch (e: unknown) {
      if (isPrismaUniqueViolation(e)) {
        throw conflictRpc('An organization with this name already exists');
      }
      throw e;
    }

    const adminUser = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: adminEmail,
        displayName: payload.adminDisplayName?.trim() || null,
        passwordHash: await hash(adminPassword, 12),
        role: Role.ORG_ADMIN,
      },
    });

    await this.prisma.membership.create({
      data: {
        tenantId: tenant.id,
        userId: adminUser.id,
        isActive: true,
        activatedAt: new Date(),
        countsTowardLearnerSeats: false,
      },
    });

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      adminUserId: adminUser.id,
      adminEmail: adminUser.email,
      adminRole: adminUser.role,
      allowedDomains: tenant.allowedDomains,
    };
  }

  async createInvite(payload: {
    tenantId: string;
    invitedByUserId: string;
    email: string;
    role: Role;
    expiresInDays?: number;
  }) {
    const email = this.normalizeEmail(payload.email);
    const expiresInDays = payload.expiresInDays ?? 7;
    if (!payload.invitedByUserId || !email) {
      throw new BadRequestException('invitedByUserId and email are required');
    }
    if (expiresInDays < 1 || expiresInDays > 30) {
      throw new BadRequestException('expiresInDays must be between 1 and 30');
    }
    const token = randomUUID().replace(/-/g, '');
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const existingUser = await this.prisma.user.findFirst({
      where: { tenantId: payload.tenantId, email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('User already exists in this tenant');
    }

    const inviter = await this.prisma.user.findFirst({
      where: { id: payload.invitedByUserId, tenantId: payload.tenantId },
      select: { role: true },
    });
    if (!inviter) {
      throw new NotFoundException('Inviter not found');
    }
    if (!canAssignRole(inviter.role as AppRole, payload.role as AppRole)) {
      throw new ForbiddenException('You cannot assign this role');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: payload.tenantId },
      select: { id: true, name: true, allowedDomains: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    this.ensureDomainAllowed(tenant.allowedDomains, email);

    const invite = await this.prisma.invite.create({
      data: {
        tenantId: payload.tenantId,
        invitedByUserId: payload.invitedByUserId,
        email,
        role: payload.role,
        token,
        expiresAt,
      },
    });

    await this.dispatchInviteEmail({
      to: invite.email,
      tenantName: tenant.name,
      token: invite.token,
      expiresAt: invite.expiresAt,
    });

    return {
      inviteId: invite.id,
      tenantId: invite.tenantId,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(payload: {
    token: string;
    displayName?: string;
    password: string;
  }) {
    if (!payload.password || payload.password.trim().length < 8) {
      throw new BadRequestException('password must be at least 8 characters');
    }
    const invite = await this.prisma.invite.findUnique({
      where: { token: payload.token },
    });
    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.usedAt) {
      throw new ConflictException('Invite already used');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      throw new ConflictException('Invite expired');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: invite.tenantId },
      select: { allowedDomains: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    this.ensureDomainAllowed(tenant.allowedDomains, invite.email);

    const normalizedEmail = this.normalizeEmail(invite.email);
    if (invite.role === Role.LEARNER) {
      await this.assertSeatCapacityForNewActiveLearner({
        tenantId: invite.tenantId,
        reason: 'activate learner invite',
      });
    }
    const user = await this.prisma.user.create({
      data: {
        tenantId: invite.tenantId,
        email: normalizedEmail,
        displayName: payload.displayName?.trim() || null,
        passwordHash: await hash(payload.password.trim(), 12),
        role: invite.role,
      },
    });

    const isLearner = invite.role === Role.LEARNER;
    await this.prisma.membership.create({
      data: {
        tenantId: invite.tenantId,
        userId: user.id,
        isActive: true,
        activatedAt: new Date(),
        countsTowardLearnerSeats: isLearner,
        lastSeatQualifyingActivityAt: isLearner ? new Date() : null,
      },
    });

    await this.prisma.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    return {
      tenantId: invite.tenantId,
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }

  async login(payload: { tenantId: string; email: string; password: string }) {
    const tenantId = payload.tenantId?.trim();
    const email = this.normalizeEmail(payload.email);
    const password = payload.password ?? '';
    if (!tenantId || !email || !password) {
      throw new BadRequestException(
        'tenantId, email, and password are required',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { tenantId, email },
      select: {
        id: true,
        tenantId: true,
        role: true,
        passwordHash: true,
        tenant: { select: { subscriptionTier: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.membership.updateMany({
      where: { tenantId: user.tenantId, userId: user.id },
      data: { lastSeatQualifyingActivityAt: new Date() },
    });

    const rawRefresh = newOpaqueRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tenantId: user.tenantId,
        tokenHash: hashRefreshToken(rawRefresh),
        expiresAt: refreshExpiresAt,
      },
    });

    const tokenPayload = {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      subscriptionTier: user.tenant.subscriptionTier,
      tokenUse: 'access' as const,
    };
    const accessExpiresIn = this.accessTtlSec();
    return {
      accessToken: await this.jwt.signAsync(tokenPayload, {
        expiresIn: accessExpiresIn,
      }),
      refreshToken: rawRefresh,
      accessExpiresIn,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      tokenType: 'Bearer' as const,
      user: {
        userId: tokenPayload.userId,
        tenantId: tokenPayload.tenantId,
        role: tokenPayload.role,
        subscriptionTier: tokenPayload.subscriptionTier,
      },
    };
  }

  async refreshSession(payload: { refreshToken: string }) {
    const raw = payload.refreshToken?.trim();
    if (!raw) {
      throw new BadRequestException('refreshToken is required');
    }
    const tokenHash = hashRefreshToken(raw);
    const session = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
      include: {
        user: {
          select: {
            id: true,
            tenantId: true,
            role: true,
            tenant: { select: { subscriptionTier: true } },
          },
        },
      },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const newRaw = newOpaqueRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        userId: session.userId,
        tenantId: session.tenantId,
        tokenHash: hashRefreshToken(newRaw),
        expiresAt: refreshExpiresAt,
      },
    });

    const tokenPayload = {
      userId: session.user.id,
      tenantId: session.user.tenantId,
      role: session.user.role,
      subscriptionTier: session.user.tenant.subscriptionTier,
      tokenUse: 'access' as const,
    };
    const accessExpiresIn = this.accessTtlSec();
    return {
      accessToken: await this.jwt.signAsync(tokenPayload, {
        expiresIn: accessExpiresIn,
      }),
      refreshToken: newRaw,
      accessExpiresIn,
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      tokenType: 'Bearer' as const,
      user: {
        userId: tokenPayload.userId,
        tenantId: tokenPayload.tenantId,
        role: tokenPayload.role,
        subscriptionTier: tokenPayload.subscriptionTier,
      },
    };
  }

  async logoutSession(payload: { refreshToken: string }) {
    const raw = payload.refreshToken?.trim();
    if (!raw) {
      throw new BadRequestException('refreshToken is required');
    }
    const tokenHash = hashRefreshToken(raw);
    const session = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (session) {
      await this.prisma.refreshToken.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true as const };
  }

  async logoutAllSessions(payload: { userId: string; tenantId: string }) {
    const userId = payload.userId?.trim();
    const tenantId = payload.tenantId?.trim();
    if (!userId || !tenantId) {
      throw new BadRequestException('userId and tenantId are required');
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId, tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const };
  }

  async assertSeatAvailable(payload: { tenantId: string; reason?: string }) {
    const tenantId = payload.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId is required');
    }
    const reason = normalizeSeatEnforcementReason(payload.reason);
    const result = await this.assertSeatCapacityForNewActiveLearner({
      tenantId,
      reason,
    });
    return { ok: true as const, ...result };
  }

  async billingOpsSummary(payload: { hours?: number }) {
    const hours = Math.min(168, Math.max(1, payload.hours ?? 24));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [totals, processed, failed, pending, recentFailures, byType] =
      await Promise.all([
        this.prisma.stripeWebhookEvent.count({
          where: { createdAt: { gte: since } },
        }),
        this.prisma.stripeWebhookEvent.count({
          where: { createdAt: { gte: since }, processedAt: { not: null } },
        }),
        this.prisma.stripeWebhookEvent.count({
          where: { createdAt: { gte: since }, handlingError: { not: null } },
        }),
        this.prisma.stripeWebhookEvent.count({
          where: {
            createdAt: { gte: since },
            processedAt: null,
            handlingError: null,
          },
        }),
        this.prisma.stripeWebhookEvent.findMany({
          where: { createdAt: { gte: since }, handlingError: { not: null } },
          orderBy: { updatedAt: 'desc' },
          take: 20,
          select: {
            stripeEventId: true,
            eventType: true,
            updatedAt: true,
            handlingError: true,
          },
        }),
        this.prisma.stripeWebhookEvent.groupBy({
          by: ['eventType'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          orderBy: { _count: { eventType: 'desc' } },
        }),
      ]);

    const failureRate = totals === 0 ? 0 : Number((failed / totals).toFixed(4));
    return {
      windowHours: hours,
      totals,
      processed,
      failed,
      pending,
      failureRate,
      byEventType: byType.map((row) => ({
        eventType: row.eventType,
        count: row._count._all,
      })),
      recentFailures: recentFailures.map((row) => ({
        stripeEventId: row.stripeEventId,
        eventType: row.eventType,
        updatedAt: row.updatedAt.toISOString(),
        handlingError: row.handlingError,
      })),
    };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredInvites(): Promise<void> {
    const result = await this.prisma.invite.deleteMany({
      where: { usedAt: null, expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Deleted ${result.count} expired invites`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupStaleRefreshTokens(): Promise<void> {
    const cutoff = new Date(Date.now() - 14 * 86400000);
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: cutoff } }],
      },
    });
    if (result.count > 0) {
      this.logger.log(`Deleted ${result.count} stale refresh token rows`);
    }
  }
}
