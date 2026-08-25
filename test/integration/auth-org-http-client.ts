import { request as httpRequest } from 'node:http';
import { readIntegrationEnv } from './integration-env';

export type HttpResponse = {
  status: number;
  body: unknown;
};

/** Auth-org HTTP server (Stripe webhooks, billing checkout) — not the API gateway. */
export function resolveAuthOrgHttpBaseUrl(): string {
  const env = readIntegrationEnv();
  const port = env.AUTH_ORG_HTTP_PORT?.trim() || '3011';
  return `http://127.0.0.1:${port}`;
}

function parseBody(raw: string): unknown {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function postStripeWebhook(args: {
  rawBody: string;
  signature?: string;
}): Promise<HttpResponse> {
  const url = new URL(`${resolveAuthOrgHttpBaseUrl()}/webhooks/stripe`);
  const bodyBytes = Buffer.from(args.rawBody, 'utf8');

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBytes.length,
          ...(args.signature !== undefined
            ? { 'stripe-signature': args.signature }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: parseBody(Buffer.concat(chunks).toString('utf8')),
          });
        });
      },
    );
    req.on('error', reject);
    req.write(bodyBytes);
    req.end();
  });
}
