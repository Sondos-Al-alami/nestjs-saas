import { Role } from '@saas/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class RegisterTenantDto {
  @IsString()
  @Length(2, 120)
  tenantName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  adminDisplayName?: string;

  @IsString()
  @Length(8, 128)
  adminPassword!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedDomains?: string[];
}

export class LoginDto {
  @IsUUID()
  tenantId!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

export class AcceptInviteDto {
  @IsString()
  @Length(12, 128)
  token!: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  displayName?: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}

export class CreateInviteDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}

export class RefreshTokenDto {
  @IsString()
  @Length(32, 512)
  refreshToken!: string;
}
