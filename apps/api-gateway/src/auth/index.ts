import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Module,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { AuthGuard } from '@nestjs/passport';
import { Role, SubscriptionTier, TENANT_ID_HEADER } from '@saas/common';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';

export {};

declare global {
  namespace Express {
    interface User {
      userId: string;
      tenantId: string;
      role: Role;
      subscriptionTier: SubscriptionTier;
    }
  }
}

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export interface JwtAccessPayload {
  userId: string;
  tenantId: string;
  role: Role;
  subscriptionTier?: SubscriptionTier;
  tokenUse?: 'access';
}

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

// Verifies JWT and enforces tenant/header consistency before request handlers run.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtAccessPayload): Express.User {
    if (
      payload.userId == null ||
      payload.tenantId == null ||
      payload.role == null
    ) {
      throw new UnauthorizedException('Token missing userId, tenantId, or role');
    }

    if (!Object.values(Role).includes(payload.role)) {
      throw new UnauthorizedException('Invalid role in token');
    }

    if (payload.tokenUse != null && payload.tokenUse !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const subscriptionTierRaw = payload.subscriptionTier ?? SubscriptionTier.FREE;
    if (!Object.values(SubscriptionTier).includes(subscriptionTierRaw)) {
      throw new UnauthorizedException('Invalid subscription tier in token');
    }
    const subscriptionTier = subscriptionTierRaw;

    const rawHeader = req.headers[TENANT_ID_HEADER] ?? req.headers['x-tenant-id'];
    const headerTenant = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim();

    if (headerTenant != null && headerTenant !== '' && payload.tenantId !== headerTenant) {
      throw new UnauthorizedException(
        'Tenant in token does not match x-tenant-id header',
      );
    }

    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      subscriptionTier,
    };
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required == null || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{ user?: Express.User }>();
    const role = req.user?.role;
    if (role == null) {
      throw new ForbiddenException('Missing user role');
    }
    if (!required.includes(role)) {
      throw new ForbiddenException('Insufficient permissions for this action');
    }
    return true;
  }
}

// Defense-in-depth guard that blocks cross-tenant payload tampering.
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      user?: Express.User;
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();
    const expectedTenantId = req.user?.tenantId;
    if (!expectedTenantId) {
      return true;
    }

    const candidates: Array<unknown> = [
      req.params?.tenantId,
      req.body?.tenantId,
      req.query?.tenantId,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim() !== '' && value !== expectedTenantId) {
        throw new ForbiddenException('Cross-tenant access denied');
      }
    }
    return true;
  }
}

// Auth wiring for passport-jwt and JwtService usage.
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: {},
    }),
  ],
  providers: [JwtStrategy],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
