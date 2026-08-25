import { createGatewayClient } from './gateway-client';
import { uniqueTestIdentity } from './test-identity';

/**
 * Black-box happy path: register → login → create course → enroll →
 * progress update (analytics) → verify event in analytics list.
 */
describe('critical flow (integration)', () => {
  const api = createGatewayClient();

  it('register → login → create course → enroll → track analytics event', async () => {
    const identity = uniqueTestIdentity('critical');

    // 1. Register tenant + org admin
    const registerRes = await api.post('/auth/register').send({
      tenantName: identity.tenantName,
      adminEmail: identity.adminEmail,
      adminPassword: identity.adminPassword,
      adminDisplayName: 'Integration Admin',
    });
    expect(registerRes.status).toBeGreaterThanOrEqual(200);
    expect(registerRes.status).toBeLessThan(300);
    expect(registerRes.body).toEqual(
      expect.objectContaining({
        tenantId: expect.any(String),
        adminUserId: expect.any(String),
        adminEmail: identity.adminEmail,
      }),
    );

    const { tenantId, adminUserId } = registerRes.body as {
      tenantId: string;
      adminUserId: string;
    };

    // 2. Login
    const loginRes = await api.post('/auth/login').send({
      tenantId,
      email: identity.adminEmail,
      password: identity.adminPassword,
    });
    expect(loginRes.status).toBeGreaterThanOrEqual(200);
    expect(loginRes.status).toBeLessThan(300);
    expect(loginRes.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        user: expect.objectContaining({
          userId: adminUserId,
          tenantId,
        }),
      }),
    );

    const { accessToken } = loginRes.body as { accessToken: string };
    api.setBearer(accessToken).setTenant(tenantId);

    // 3. Create course
    const courseTitle = `Integration Course ${Date.now()}`;
    const createCourseRes = await api.post('/courses').send({
      title: courseTitle,
    });
    expect(createCourseRes.status).toBeGreaterThanOrEqual(200);
    expect(createCourseRes.status).toBeLessThan(300);
    expect(createCourseRes.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        tenantId,
        title: courseTitle,
      }),
    );

    const { id: courseId } = createCourseRes.body as { id: string };

    // 4. Enroll admin user in the course
    const enrollRes = await api
      .post(`/courses/${courseId}/enrollments`)
      .send({ userId: adminUserId });
    expect(enrollRes.status).toBeGreaterThanOrEqual(200);
    expect(enrollRes.status).toBeLessThan(300);
    expect(enrollRes.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        tenantId,
        courseId,
        userId: adminUserId,
      }),
    );

    const { id: enrollmentId } = enrollRes.body as { id: string };

    // 5. PATCH enrollment — triggers lesson.started (+ lesson.completed) via gateway
    const patchRes = await api.patch(`/enrollments/${enrollmentId}`).send({
      progressPercent: 25,
      lessonsCompleted: 1,
    });
    expect(patchRes.status).toBeGreaterThanOrEqual(200);
    expect(patchRes.status).toBeLessThan(300);
    expect(patchRes.body).toEqual(
      expect.objectContaining({
        id: enrollmentId,
        progressPercent: 25,
        lessonsCompleted: 1,
      }),
    );

    // 6. Verify analytics recorded the learning event for this tenant/course
    const eventsRes = await api
      .get('/analytics/events')
      .query({ limit: 50, eventType: 'lesson.started' });
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body).toEqual(
      expect.objectContaining({
        items: expect.any(Array),
      }),
    );

    const items = eventsRes.body.items as Array<{
      eventType: string;
      tenantId: string;
      payload: { courseId?: string; enrollmentId?: string; userId?: string };
    }>;

    const matching = items.find(
      (evt) =>
        evt.tenantId === tenantId &&
        evt.payload?.courseId === courseId &&
        evt.payload?.enrollmentId === enrollmentId &&
        evt.payload?.userId === adminUserId,
    );
    expect(matching).toBeDefined();
    expect(matching?.eventType).toBe('lesson.started');
  });
});
