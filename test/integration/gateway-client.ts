import request, { type Test } from 'supertest';

/** Must match `TENANT_ID_HEADER` in libs/common (gateway TenantMiddleware). */
export const TENANT_ID_HEADER = 'x-tenant-id';

export function resolveGatewayBaseUrl(): string {
  return (
    process.env.GATEWAY_BASE_URL?.replace(/\/+$/, '') ??
    'http://127.0.0.1:3100'
  );
}

export type GatewayClientOptions = {
  baseUrl?: string;
};

/**
 * Black-box HTTP client for integration tests (Supertest against a running gateway).
 *
 * Defaults JSON Accept/Content-Type on every request. Use setBearer / setTenant
 * so subsequent calls send Authorization and x-tenant-id without repeating headers.
 */
export class GatewayClient {
  readonly baseUrl: string;
  private accessToken?: string;
  private tenantId?: string;

  constructor(options: GatewayClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? resolveGatewayBaseUrl()).replace(
      /\/+$/,
      '',
    );
  }

  setBearer(token: string): this {
    this.accessToken = token.trim();
    return this;
  }

  clearAuth(): this {
    this.accessToken = undefined;
    return this;
  }

  setTenant(tenantId: string): this {
    this.tenantId = tenantId.trim();
    return this;
  }

  clearTenant(): this {
    this.tenantId = undefined;
    return this;
  }

  get(path: string): Test {
    return this.apply(request(this.baseUrl).get(path));
  }

  post(path: string): Test {
    return this.apply(request(this.baseUrl).post(path));
  }

  patch(path: string): Test {
    return this.apply(request(this.baseUrl).patch(path));
  }

  put(path: string): Test {
    return this.apply(request(this.baseUrl).put(path));
  }

  delete(path: string): Test {
    return this.apply(request(this.baseUrl).delete(path));
  }

  private apply(req: Test): Test {
    req.set('Accept', 'application/json');
    req.set('Content-Type', 'application/json');
    if (this.accessToken) {
      req.set('Authorization', `Bearer ${this.accessToken}`);
    }
    if (this.tenantId) {
      req.set(TENANT_ID_HEADER, this.tenantId);
    }
    return req;
  }
}

export function createGatewayClient(
  options?: GatewayClientOptions,
): GatewayClient {
  return new GatewayClient(options);
}
