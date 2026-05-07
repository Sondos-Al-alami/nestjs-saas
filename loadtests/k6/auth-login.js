import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || '2m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:3000';
const tenantId = __ENV.TENANT_ID || '';
const email = __ENV.LOGIN_EMAIL || '';
const password = __ENV.LOGIN_PASSWORD || '';

export default function () {
  const res = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ tenantId, email, password }),
    {
      headers: { 'Content-Type': 'application/json' },
    },
  );

  check(res, {
    'login status 201': (r) => r.status === 201,
    'login has accessToken': (r) => {
      try {
        return !!JSON.parse(r.body)?.accessToken;
      } catch {
        return false;
      }
    },
  });
  sleep(1);
}

