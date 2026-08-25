import { of } from 'rxjs';
import {
  MSG_ANALYTICS_COURSE_COMPLETED,
  MSG_ANALYTICS_LESSON_COMPLETED,
  MSG_ANALYTICS_LESSON_STARTED,
  MSG_ANALYTICS_EVENTS_LIST,
} from '@saas/common';
import { AnalyticsGatewayService } from './analytics-gateway.service';

describe('AnalyticsGatewayService', () => {
  const analytics = {
    send: jest.fn(),
  };
  let service: AnalyticsGatewayService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnalyticsGatewayService(analytics as never);
  });

  it('listEvents sends MSG_ANALYTICS_EVENTS_LIST', async () => {
    analytics.send.mockReturnValue(of({ items: [] }));
    const payload = { tenantId: 't1', limit: 10 };

    await expect(service.listEvents(payload)).resolves.toEqual({ items: [] });
    expect(analytics.send).toHaveBeenCalledWith(
      MSG_ANALYTICS_EVENTS_LIST,
      payload,
    );
  });

  it('emitLearningEventsFromEnrollmentUpdate emits started + completed + course events', async () => {
    analytics.send.mockReturnValue(of({ ok: true }));

    await service.emitLearningEventsFromEnrollmentUpdate({
      before: {
        id: 'e1',
        tenantId: 't1',
        userId: 'u1',
        courseId: 'c1',
        progressPercent: 10,
        lessonsCompleted: 0,
        completedAt: null,
      },
      after: {
        id: 'e1',
        tenantId: 't1',
        userId: 'u1',
        courseId: 'c1',
        progressPercent: 100,
        lessonsCompleted: 2,
        completedAt: '2026-01-01T00:00:00.000Z',
      },
      actingUserId: 'u1',
    });

    const patterns = analytics.send.mock.calls.map(
      (call: [string, unknown]) => call[0],
    );
    expect(patterns).toEqual(
      expect.arrayContaining([
        MSG_ANALYTICS_LESSON_STARTED,
        MSG_ANALYTICS_LESSON_COMPLETED,
        MSG_ANALYTICS_COURSE_COMPLETED,
      ]),
    );
  });

  it('emitLearningEventsFromEnrollmentUpdate is a no-op when nothing changed', async () => {
    const snapshot = {
      id: 'e1',
      tenantId: 't1',
      userId: 'u1',
      courseId: 'c1',
      progressPercent: 50,
      lessonsCompleted: 1,
      completedAt: null,
    };

    await service.emitLearningEventsFromEnrollmentUpdate({
      before: snapshot,
      after: snapshot,
      actingUserId: 'u1',
    });

    expect(analytics.send).not.toHaveBeenCalled();
  });
});
