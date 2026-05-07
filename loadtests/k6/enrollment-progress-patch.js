import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<900'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const tenantId = __ENV.TENANT_ID || '';
const enrollmentId = __ENV.ENROLLMENT_ID || '';
const token = __ENV.ACCESS_TOKEN || '';

export default function () {
  const progress = Math.floor(Math.random() * 100);
  const res = http.patch(
    `${baseUrl}/enrollments/${enrollmentId}`,
    JSON.stringify({
      progressPercent: progress,
      touchAccess: true,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-tenant-id': tenantId,
      },
    },
  );

  check(res, {
    'progress patch status 200': (r) => r.status === 200,
  });
  sleep(1);
}

