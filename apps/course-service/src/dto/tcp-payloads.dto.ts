import { Role, SubscriptionTier } from '@saas/common';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class ListCoursesPayloadDto {
  @IsUUID()
  tenantId!: string;
}

export class GetCoursePayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;
}

export class CreateCoursePayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsEnum(SubscriptionTier)
  subscriptionTier!: SubscriptionTier;

  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @Length(1, 200)
  title!: string;
}

export class UpdateCoursePayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;

  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @Length(1, 200)
  title!: string;
}

export class DeleteCoursePayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;
}

export class ListLessonsPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;
}

export class GetLessonPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;

  @IsUUID()
  lessonId!: string;
}

export class CreateLessonPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;

  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 50000)
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;
}

export class UpdateLessonPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;

  @IsUUID()
  lessonId!: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50000)
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  sortOrder?: number;
}

export class DeleteLessonPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;

  @IsUUID()
  lessonId!: string;
}

export class CreateEnrollmentPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;

  @IsUUID()
  userId!: string;
}

export class ListEnrollmentsByCoursePayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  courseId!: string;
}

export class ListEnrollmentsByUserPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;
}

export class GetEnrollmentPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  enrollmentId!: string;

  @IsUUID()
  actingUserId!: string;

  @IsEnum(Role)
  actingRole!: Role;
}

export class UpdateEnrollmentPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  enrollmentId!: string;

  @IsUUID()
  actingUserId!: string;

  @IsEnum(Role)
  actingRole!: Role;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  lessonsCompleted?: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  /// When true, only updates `lastAccessedAt` (and still runs learner/staff rules).
  @IsOptional()
  @IsBoolean()
  touchAccess?: boolean;
}

export class DeleteEnrollmentPayloadDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  enrollmentId!: string;
}
