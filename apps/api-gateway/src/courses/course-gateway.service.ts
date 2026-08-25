import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  MSG_COURSE_CREATE,
  MSG_COURSE_DELETE,
  MSG_COURSE_ENROLLMENT_CREATE,
  MSG_COURSE_ENROLLMENT_DELETE,
  MSG_COURSE_ENROLLMENT_GET,
  MSG_COURSE_ENROLLMENT_LIST_BY_COURSE,
  MSG_COURSE_ENROLLMENT_LIST_BY_USER,
  MSG_COURSE_ENROLLMENT_UPDATE,
  MSG_COURSE_GET,
  MSG_COURSE_HEALTH,
  MSG_COURSE_LESSON_CREATE,
  MSG_COURSE_LESSON_DELETE,
  MSG_COURSE_LESSON_GET,
  MSG_COURSE_LESSONS_LIST,
  MSG_COURSE_LESSON_UPDATE,
  MSG_COURSE_LIST,
  MSG_COURSE_UPDATE,
  Role,
  SubscriptionTier,
} from '@saas/common';
import { firstValueFrom } from 'rxjs';
import { AnalyticsGatewayService } from '../analytics/analytics-gateway.service';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { type HealthResponse, tcpCall } from '../core/tcp-rpc';

type EnrollmentRow = {
  id: string;
  tenantId: string;
  userId: string;
  courseId: string;
  progressPercent: number;
  lessonsCompleted: number;
  completedAt: string | Date | null;
};

@Injectable()
export class CourseGatewayService {
  private readonly logger = new Logger(CourseGatewayService.name);

  constructor(
    @Inject('COURSE_SERVICE') private readonly course: ClientProxy,
    private readonly authGateway: AuthGatewayService,
    private readonly analyticsGateway: AnalyticsGatewayService,
  ) {}

  private call<T>(pattern: string, payload: unknown): Promise<T> {
    return tcpCall<T>(this.course, pattern, payload);
  }

  health(): Promise<HealthResponse> {
    return firstValueFrom(
      this.course.send<HealthResponse>(MSG_COURSE_HEALTH, {}),
    );
  }

  listCourses(payload: { tenantId: string }) {
    return this.call(MSG_COURSE_LIST, payload);
  }

  getCourse(payload: { tenantId: string; courseId: string }) {
    return this.call(MSG_COURSE_GET, payload);
  }

  createCourse(payload: {
    tenantId: string;
    title: string;
    subscriptionTier: SubscriptionTier;
  }) {
    return this.call(MSG_COURSE_CREATE, payload);
  }

  updateCourse(payload: { tenantId: string; courseId: string; title: string }) {
    return this.call(MSG_COURSE_UPDATE, payload);
  }

  deleteCourse(payload: { tenantId: string; courseId: string }) {
    return this.call(MSG_COURSE_DELETE, payload);
  }

  listLessons(payload: { tenantId: string; courseId: string }) {
    return this.call(MSG_COURSE_LESSONS_LIST, payload);
  }

  getLesson(payload: { tenantId: string; courseId: string; lessonId: string }) {
    return this.call(MSG_COURSE_LESSON_GET, payload);
  }

  createLesson(payload: {
    tenantId: string;
    courseId: string;
    title: string;
    body?: string;
    sortOrder?: number;
  }) {
    return this.call(MSG_COURSE_LESSON_CREATE, payload);
  }

  updateLesson(payload: {
    tenantId: string;
    courseId: string;
    lessonId: string;
    title?: string;
    body?: string;
    sortOrder?: number;
  }) {
    return this.call(MSG_COURSE_LESSON_UPDATE, payload);
  }

  deleteLesson(payload: {
    tenantId: string;
    courseId: string;
    lessonId: string;
  }) {
    return this.call(MSG_COURSE_LESSON_DELETE, payload);
  }

  createEnrollment(payload: {
    tenantId: string;
    courseId: string;
    userId: string;
  }) {
    return this.authGateway
      .assertSeatAvailable(payload.tenantId)
      .then(() => this.call(MSG_COURSE_ENROLLMENT_CREATE, payload));
  }

  listEnrollmentsByCourse(payload: { tenantId: string; courseId: string }) {
    return this.call(MSG_COURSE_ENROLLMENT_LIST_BY_COURSE, payload);
  }

  listEnrollmentsByUser(payload: { tenantId: string; userId: string }) {
    return this.call(MSG_COURSE_ENROLLMENT_LIST_BY_USER, payload);
  }

  getEnrollment(payload: {
    tenantId: string;
    enrollmentId: string;
    actingUserId: string;
    actingRole: Role;
  }) {
    return this.call(MSG_COURSE_ENROLLMENT_GET, payload);
  }

  updateEnrollment(payload: {
    tenantId: string;
    enrollmentId: string;
    actingUserId: string;
    actingRole: Role;
    progressPercent?: number;
    lessonsCompleted?: number;
    completed?: boolean;
    touchAccess?: boolean;
  }) {
    return this.call<EnrollmentRow>(MSG_COURSE_ENROLLMENT_GET, {
      tenantId: payload.tenantId,
      enrollmentId: payload.enrollmentId,
      actingUserId: payload.actingUserId,
      actingRole: payload.actingRole,
    }).then(async (before) => {
      const updated = await this.call<EnrollmentRow>(
        MSG_COURSE_ENROLLMENT_UPDATE,
        payload,
      );
      try {
        await this.analyticsGateway.emitLearningEventsFromEnrollmentUpdate({
          before,
          after: updated,
          touchAccess: payload.touchAccess,
          actingUserId: payload.actingUserId,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to emit learning events for enrollment update: ${msg}`,
        );
      }
      return updated;
    });
  }

  deleteEnrollment(payload: { tenantId: string; enrollmentId: string }) {
    return this.call(MSG_COURSE_ENROLLMENT_DELETE, payload);
  }
}
