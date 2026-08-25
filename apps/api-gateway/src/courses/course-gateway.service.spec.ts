import { of } from 'rxjs';
import {
  MSG_COURSE_CREATE,
  MSG_COURSE_ENROLLMENT_CREATE,
  MSG_COURSE_ENROLLMENT_GET,
  MSG_COURSE_ENROLLMENT_UPDATE,
  Role,
  SubscriptionTier,
} from '@saas/common';
import { AnalyticsGatewayService } from '../analytics/analytics-gateway.service';
import { AuthGatewayService } from '../auth/auth-gateway.service';
import { CourseGatewayService } from './course-gateway.service';

describe('CourseGatewayService', () => {
  const course = {
    send: jest.fn(),
  };
  const authGateway = {
    assertSeatAvailable: jest.fn(),
  };
  const analyticsGateway = {
    emitLearningEventsFromEnrollmentUpdate: jest.fn(),
  };
  let service: CourseGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CourseGatewayService(
      course as never,
      authGateway as unknown as AuthGatewayService,
      analyticsGateway as unknown as AnalyticsGatewayService,
    );
  });

  it('createCourse sends MSG_COURSE_CREATE', async () => {
    const payload = {
      tenantId: 't1',
      title: 'Intro',
      subscriptionTier: SubscriptionTier.FREE,
    };
    course.send.mockReturnValue(of({ id: 'c1' }));

    await expect(service.createCourse(payload)).resolves.toEqual({ id: 'c1' });
    expect(course.send).toHaveBeenCalledWith(MSG_COURSE_CREATE, payload);
  });

  it('createEnrollment asserts seat then creates enrollment', async () => {
    authGateway.assertSeatAvailable.mockResolvedValue({ ok: true });
    course.send.mockReturnValue(of({ id: 'en1' }));
    const payload = { tenantId: 't1', courseId: 'c1', userId: 'u1' };

    await expect(service.createEnrollment(payload)).resolves.toEqual({
      id: 'en1',
    });
    expect(authGateway.assertSeatAvailable).toHaveBeenCalledWith('t1');
    expect(course.send).toHaveBeenCalledWith(
      MSG_COURSE_ENROLLMENT_CREATE,
      payload,
    );
  });

  it('updateEnrollment loads before/after and emits learning events', async () => {
    const before = {
      id: 'e1',
      tenantId: 't1',
      userId: 'u1',
      courseId: 'c1',
      progressPercent: 0,
      lessonsCompleted: 0,
      completedAt: null,
    };
    const after = { ...before, progressPercent: 50, lessonsCompleted: 1 };
    course.send
      .mockReturnValueOnce(of(before))
      .mockReturnValueOnce(of(after));
    analyticsGateway.emitLearningEventsFromEnrollmentUpdate.mockResolvedValue(
      undefined,
    );

    const payload = {
      tenantId: 't1',
      enrollmentId: 'e1',
      actingUserId: 'u1',
      actingRole: Role.LEARNER,
      progressPercent: 50,
      lessonsCompleted: 1,
    };

    await expect(service.updateEnrollment(payload)).resolves.toEqual(after);
    expect(course.send).toHaveBeenNthCalledWith(
      1,
      MSG_COURSE_ENROLLMENT_GET,
      expect.objectContaining({ enrollmentId: 'e1' }),
    );
    expect(course.send).toHaveBeenNthCalledWith(
      2,
      MSG_COURSE_ENROLLMENT_UPDATE,
      payload,
    );
    expect(
      analyticsGateway.emitLearningEventsFromEnrollmentUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        before,
        after,
        actingUserId: 'u1',
      }),
    );
  });
});
