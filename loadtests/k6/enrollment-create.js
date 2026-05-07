import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1000'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const tenantId = __ENV.TENANT_ID || '';
const courseId = __ENV.COURSE_ID || '';
const userId = __ENV.ENROLL_USER_ID || '';
const token = __ENV.ACCESS_TOKEN || '';

export default function () {
  const res = http.post(
    `${baseUrl}/courses/${courseId}/enrollments`,
    JSON.stringify({ userId }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
      },
    },
  );

  check(res, {
    'enrollment created or conflict': (r) => r.status === 201 || r.status === 409,
  });
  sleep(1);
}

