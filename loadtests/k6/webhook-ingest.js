import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 5),
  duration: __ENV.DURATION || '1m',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<700'],
  },
};

const url = __ENV.WEBHOOK_URL || 'http://localhost:3011/webhooks/stripe';
const signature = __ENV.STRIPE_SIGNATURE || 'test-signature';

const payload = JSON.stringify({
  id: 'evt_loadtest_fake',
  type: 'invoice.payment_succeeded',
  data: { object: { id: 'in_loadtest_fake' } },
});

export default function () {
  const res = http.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
  });

  // In most environments this returns 400 due to signature mismatch; that still stress-tests ingress path.
  check(res, {
    'webhook endpoint responded': (r) => r.status >= 200 && r.status < 500,
  });
  sleep(1);
}

