import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @Length(1, 200)
  title!: string;
}

export class UpdateCourseDto {
  @IsString()
  @Length(1, 200)
  title!: string;
}

export class CreateLessonDto {
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

export class UpdateLessonDto {
  @IsOptional()
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

export class CreateEnrollmentDto {
  @IsUUID()
  userId!: string;
}

export class UpdateEnrollmentDto {
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

  @IsOptional()
  @IsBoolean()
  touchAccess?: boolean;
}
