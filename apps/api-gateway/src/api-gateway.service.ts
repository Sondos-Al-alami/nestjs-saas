import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  MSG_ANALYTICS_HEALTH,
  MSG_AUTH_ORG_ACCEPT_INVITE,
  MSG_AUTH_ORG_CREATE_INVITE,
  MSG_AUTH_ORG_HEALTH,
  MSG_AUTH_ORG_LOGIN,
  MSG_AUTH_ORG_LOGOUT,
  MSG_AUTH_ORG_LOGOUT_ALL,
  MSG_AUTH_ORG_REFRESH,
  MSG_AUTH_ORG_REGISTER_TENANT,
  MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE,
  MSG_AUTH_ORG_TENANT_ECHO,
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

@Injectable()
export class ApiGatewayService {
  constructor(
    @Inject('AUTH_ORG_SERVICE') private readonly authOrg: ClientProxy,
    @Inject('COURSE_SERVICE') private readonly course: ClientProxy,
    @Inject('ANALYTICS_WEBHOOK_SERVICE') private readonly analytics: ClientProxy,
  ) {}

  getHello(): string {
    return 'API Gateway';
  }

  private normalizeRpcError(error: unknown): never {
    const fallbackMessage = 'Downstream service error';
    const e = error as
      | {
          status?: number;
          statusCode?: number;
          message?: string | string[];
          error?: { status?: number; statusCode?: number; message?: string | string[] };
          response?: { status?: number; statusCode?: number; message?: string | string[] };
        }
      | undefined;

    const status =
      e?.status ??
      e?.statusCode ??
      e?.error?.status ??
      e?.error?.statusCode ??
      e?.response?.status ??
      e?.response?.statusCode;

    const messageValue =
      e?.message ?? e?.error?.message ?? e?.response?.message ?? fallbackMessage;
    const message = Array.isArray(messageValue)
      ? messageValue.join(', ')
      : String(messageValue || fallbackMessage);

    if (/already exists/i.test(message)) {
      throw new HttpException({ message }, HttpStatus.CONFLICT);
    }

    if (typeof status === 'number' && status >= 400 && status <= 599) {
      throw new HttpException({ message }, status);
    }

    throw new HttpException({ message }, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  private async tcpCall<T>(
    client: ClientProxy,
    pattern: string,
    payload: unknown,
  ): Promise<T> {
    try {
      return await firstValueFrom(client.send<T>(pattern, payload));
    } catch (error) {
      this.normalizeRpcError(error);
    }
  }

  private authOrgCall<T>(pattern: string, payload: unknown): Promise<T> {
    return this.tcpCall<T>(this.authOrg, pattern, payload);
  }

  private courseCall<T>(pattern: string, payload: unknown): Promise<T> {
    return this.tcpCall<T>(this.course, pattern, payload);
  }

  async downstreamHealth() {
    const [authOrg, course, analytics] = await Promise.all([
      firstValueFrom(this.authOrg.send(MSG_AUTH_ORG_HEALTH, {})),
      firstValueFrom(this.course.send(MSG_COURSE_HEALTH, {})),
      firstValueFrom(this.analytics.send(MSG_ANALYTICS_HEALTH, {})),
    ]);
    return { authOrg, course, analytics };
  }

  async tenantAuthEcho(payload: { tenantId: string; userId: string; role: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_TENANT_ECHO, payload);
  }

  async registerTenant(payload: {
    tenantName: string;
    adminEmail: string;
    adminDisplayName?: string;
    adminPassword: string;
    allowedDomains?: string[];
  }) {
    return this.authOrgCall(MSG_AUTH_ORG_REGISTER_TENANT, payload);
  }

  async createInvite(payload: {
    tenantId: string;
    invitedByUserId: string;
    email: string;
    role: Role;
    expiresInDays?: number;
  }) {
    return this.authOrgCall(MSG_AUTH_ORG_CREATE_INVITE, payload);
  }

  async acceptInvite(payload: {
    token: string;
    displayName?: string;
    password: string;
  }) {
    return this.authOrgCall(MSG_AUTH_ORG_ACCEPT_INVITE, payload);
  }

  async login(payload: { tenantId: string; email: string; password: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_LOGIN, payload);
  }

  async refreshSession(payload: { refreshToken: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_REFRESH, payload);
  }

  async logoutSession(payload: { refreshToken: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_LOGOUT, payload);
  }

  async logoutAllSessions(payload: { userId: string; tenantId: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_LOGOUT_ALL, payload);
  }

  listCourses(payload: { tenantId: string }) {
    return this.courseCall(MSG_COURSE_LIST, payload);
  }

  getCourse(payload: { tenantId: string; courseId: string }) {
    return this.courseCall(MSG_COURSE_GET, payload);
  }

  createCourse(payload: {
    tenantId: string;
    title: string;
    subscriptionTier: SubscriptionTier;
  }) {
    return this.courseCall(MSG_COURSE_CREATE, payload);
  }

  updateCourse(payload: { tenantId: string; courseId: string; title: string }) {
    return this.courseCall(MSG_COURSE_UPDATE, payload);
  }

  deleteCourse(payload: { tenantId: string; courseId: string }) {
    return this.courseCall(MSG_COURSE_DELETE, payload);
  }

  listLessons(payload: { tenantId: string; courseId: string }) {
    return this.courseCall(MSG_COURSE_LESSONS_LIST, payload);
  }

  getLesson(payload: { tenantId: string; courseId: string; lessonId: string }) {
    return this.courseCall(MSG_COURSE_LESSON_GET, payload);
  }

  createLesson(payload: {
    tenantId: string;
    courseId: string;
    title: string;
    body?: string;
    sortOrder?: number;
  }) {
    return this.courseCall(MSG_COURSE_LESSON_CREATE, payload);
  }

  updateLesson(payload: {
    tenantId: string;
    courseId: string;
    lessonId: string;
    title?: string;
    body?: string;
    sortOrder?: number;
  }) {
    return this.courseCall(MSG_COURSE_LESSON_UPDATE, payload);
  }

  deleteLesson(payload: { tenantId: string; courseId: string; lessonId: string }) {
    return this.courseCall(MSG_COURSE_LESSON_DELETE, payload);
  }

  createEnrollment(payload: { tenantId: string; courseId: string; userId: string }) {
    return this.authOrgCall(MSG_AUTH_ORG_SEAT_ASSERT_AVAILABLE, {
      tenantId: payload.tenantId,
      reason: 'create enrollment',
    }).then(() => this.courseCall(MSG_COURSE_ENROLLMENT_CREATE, payload));
  }

  listEnrollmentsByCourse(payload: { tenantId: string; courseId: string }) {
    return this.courseCall(MSG_COURSE_ENROLLMENT_LIST_BY_COURSE, payload);
  }

  listEnrollmentsByUser(payload: { tenantId: string; userId: string }) {
    return this.courseCall(MSG_COURSE_ENROLLMENT_LIST_BY_USER, payload);
  }

  getEnrollment(payload: {
    tenantId: string;
    enrollmentId: string;
    actingUserId: string;
    actingRole: Role;
  }) {
    return this.courseCall(MSG_COURSE_ENROLLMENT_GET, payload);
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
    return this.courseCall(MSG_COURSE_ENROLLMENT_UPDATE, payload);
  }

  deleteEnrollment(payload: { tenantId: string; enrollmentId: string }) {
    return this.courseCall(MSG_COURSE_ENROLLMENT_DELETE, payload);
  }
}
