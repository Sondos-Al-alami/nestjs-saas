import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  maxCoursesForSubscriptionTier,
  Role,
  subscriptionTierCourseLimitMessage,
} from '@saas/common';
import type {
  CreateCoursePayloadDto,
  CreateEnrollmentPayloadDto,
  CreateLessonPayloadDto,
  DeleteCoursePayloadDto,
  DeleteEnrollmentPayloadDto,
  DeleteLessonPayloadDto,
  GetCoursePayloadDto,
  GetEnrollmentPayloadDto,
  GetLessonPayloadDto,
  ListCoursesPayloadDto,
  ListEnrollmentsByCoursePayloadDto,
  ListEnrollmentsByUserPayloadDto,
  ListLessonsPayloadDto,
  UpdateCoursePayloadDto,
  UpdateEnrollmentPayloadDto,
  UpdateLessonPayloadDto,
} from './dto/tcp-payloads.dto';
import { PrismaService } from './prisma/prisma.service';

function badRequest(message: string): never {
  throw new RpcException({ statusCode: 400, message });
}

function notFound(message = 'Resource not found'): never {
  throw new RpcException({ statusCode: 404, message });
}

function forbidden(message: string): never {
  throw new RpcException({ statusCode: 403, message });
}

function conflict(message: string): never {
  throw new RpcException({ statusCode: 409, message });
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}

function assertLearnerOwnsEnrollment(
  enrollment: { userId: string },
  actingRole: Role,
  actingUserId: string,
): void {
  if (actingRole === Role.LEARNER && enrollment.userId !== actingUserId) {
    forbidden('You can only access your own enrollment');
  }
}

@Injectable()
export class CourseServiceService {
  constructor(private readonly prisma: PrismaService) {}

  health() {
    return { service: 'course-service', ok: true as const };
  }

  async listCourses(payload: ListCoursesPayloadDto) {
    const { tenantId } = payload;
    return this.prisma.course.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { lessons: true, enrollments: true } },
      },
    });
  }

  async getCourse(payload: GetCoursePayloadDto) {
    const { tenantId, courseId } = payload;
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
      include: {
        lessons: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            tenantId: true,
            courseId: true,
            title: true,
            body: true,
            sortOrder: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!course) {
      notFound('Course not found');
    }
    return course;
  }

  async createCourse(payload: CreateCoursePayloadDto) {
    const { tenantId, title, subscriptionTier } = payload;
    const maxCourses = maxCoursesForSubscriptionTier(subscriptionTier);
    if (maxCourses != null) {
      const count = await this.prisma.course.count({ where: { tenantId } });
      if (count >= maxCourses) {
        throw new RpcException({
          statusCode: 403,
          message: subscriptionTierCourseLimitMessage(subscriptionTier, maxCourses),
        });
      }
    }
    return this.prisma.course.create({
      data: { tenantId, title },
    });
  }

  async updateCourse(payload: UpdateCoursePayloadDto) {
    const { tenantId, courseId, title } = payload;
    const result = await this.prisma.course.updateMany({
      where: { id: courseId, tenantId },
      data: { title },
    });
    if (result.count === 0) {
      notFound('Course not found');
    }
    return this.prisma.course.findFirstOrThrow({
      where: { id: courseId, tenantId },
    });
  }

  async deleteCourse(payload: DeleteCoursePayloadDto) {
    const { tenantId, courseId } = payload;
    const result = await this.prisma.course.deleteMany({
      where: { id: courseId, tenantId },
    });
    if (result.count === 0) {
      notFound('Course not found');
    }
    return { ok: true as const, deletedId: courseId };
  }

  async listLessons(payload: ListLessonsPayloadDto) {
    const { tenantId, courseId } = payload;
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
      select: { id: true },
    });
    if (!course) {
      notFound('Course not found');
    }
    return this.prisma.lesson.findMany({
      where: { tenantId, courseId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getLesson(payload: GetLessonPayloadDto) {
    const { tenantId, courseId, lessonId } = payload;
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId, tenantId },
    });
    if (!lesson) {
      notFound('Lesson not found');
    }
    return lesson;
  }

  async createLesson(payload: CreateLessonPayloadDto) {
    const { tenantId, courseId, title, sortOrder = 0 } = payload;
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
      select: { id: true },
    });
    if (!course) {
      notFound('Course not found');
    }
    const body =
      payload.body === undefined ? null : payload.body;
    return this.prisma.lesson.create({
      data: {
        tenantId,
        courseId,
        title,
        body,
        sortOrder,
      },
    });
  }

  async updateLesson(payload: UpdateLessonPayloadDto) {
    const { tenantId, courseId, lessonId } = payload;
    const existing = await this.prisma.lesson.findFirst({
      where: { id: lessonId, courseId, tenantId },
    });
    if (!existing) {
      notFound('Lesson not found');
    }
    const data: { title?: string; body?: string | null; sortOrder?: number } = {};
    if (payload.title !== undefined) {
      data.title = payload.title;
    }
    if (payload.body !== undefined) {
      data.body = payload.body;
    }
    if (payload.sortOrder !== undefined) {
      data.sortOrder = payload.sortOrder;
    }
    if (Object.keys(data).length === 0) {
      badRequest('No fields to update');
    }
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data,
    });
  }

  async deleteLesson(payload: DeleteLessonPayloadDto) {
    const { tenantId, courseId, lessonId } = payload;
    const result = await this.prisma.lesson.deleteMany({
      where: { id: lessonId, courseId, tenantId },
    });
    if (result.count === 0) {
      notFound('Lesson not found');
    }
    return { ok: true as const, deletedId: lessonId };
  }

  async createEnrollment(payload: CreateEnrollmentPayloadDto) {
    const { tenantId, courseId, userId } = payload;
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
      select: { id: true },
    });
    if (!course) {
      notFound('Course not found');
    }
    try {
      return await this.prisma.enrollment.create({
        data: { tenantId, courseId, userId },
        include: {
          course: { select: { id: true, title: true } },
        },
      });
    } catch (e) {
      if (isPrismaUniqueViolation(e)) {
        conflict('User is already enrolled in this course');
      }
      throw e;
    }
  }

  async listEnrollmentsByCourse(payload: ListEnrollmentsByCoursePayloadDto) {
    const { tenantId, courseId } = payload;
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, tenantId },
      select: { id: true },
    });
    if (!course) {
      notFound('Course not found');
    }
    return this.prisma.enrollment.findMany({
      where: { tenantId, courseId },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: { select: { id: true, title: true } },
      },
    });
  }

  async listEnrollmentsByUser(payload: ListEnrollmentsByUserPayloadDto) {
    const { tenantId, userId } = payload;
    return this.prisma.enrollment.findMany({
      where: { tenantId, userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        course: { select: { id: true, title: true } },
      },
    });
  }

  async getEnrollment(payload: GetEnrollmentPayloadDto) {
    const { tenantId, enrollmentId, actingRole, actingUserId } = payload;
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId },
      include: {
        course: { select: { id: true, title: true } },
      },
    });
    if (!enrollment) {
      notFound('Enrollment not found');
    }
    assertLearnerOwnsEnrollment(enrollment, actingRole, actingUserId);
    return enrollment;
  }

  async updateEnrollment(payload: UpdateEnrollmentPayloadDto) {
    const {
      tenantId,
      enrollmentId,
      actingRole,
      actingUserId,
      progressPercent,
      lessonsCompleted,
      completed,
      touchAccess,
    } = payload;

    const hasProgress = progressPercent !== undefined;
    const hasLessons = lessonsCompleted !== undefined;
    const hasCompleted = completed !== undefined;
    const touch = touchAccess === true;

    if (!hasProgress && !hasLessons && !hasCompleted && !touch) {
      badRequest('No fields to update');
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId },
    });
    if (!enrollment) {
      notFound('Enrollment not found');
    }
    assertLearnerOwnsEnrollment(enrollment, actingRole, actingUserId);

    const now = new Date();
    const data: {
      progressPercent?: number;
      lessonsCompleted?: number;
      completedAt?: Date | null;
      lastAccessedAt?: Date;
    } = {};

    if (hasProgress) {
      data.progressPercent = progressPercent;
    }
    if (hasLessons) {
      data.lessonsCompleted = lessonsCompleted;
    }
    if (hasCompleted) {
      data.completedAt = completed ? now : null;
    }
    if (touch || hasProgress || hasLessons || hasCompleted) {
      data.lastAccessedAt = now;
    }

    return this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data,
      include: {
        course: { select: { id: true, title: true } },
      },
    });
  }

  async deleteEnrollment(payload: DeleteEnrollmentPayloadDto) {
    const { tenantId, enrollmentId } = payload;
    const result = await this.prisma.enrollment.deleteMany({
      where: { id: enrollmentId, tenantId },
    });
    if (result.count === 0) {
      notFound('Enrollment not found');
    }
    return { ok: true as const, deletedId: enrollmentId };
  }
}
