/** Normalize Express path (no query string, leading slash). */
export function normalizeRequestPath(path: string | undefined): string {
  if (path == null || path === '') {
    return '/';
  }
  const withoutQuery = path.split('?')[0] ?? '/';
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

/**
 * Routes that do not require `x-tenant-id` (health, login, public root).
 * Extend this list as you add public endpoints.
 */
export function isTenantOptionalRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const p = normalizeRequestPath(path);

  if (p === '/' && m === 'GET') {
    return true;
  }

  if (/^\/health(\/|$)/i.test(p)) {
    return true;
  }

  if (/^\/internal\//i.test(p) && /health/i.test(p)) {
    return true;
  }

  if (/^\/internal\/ops\/metrics$/i.test(p) && m === 'GET') {
    return true;
  }

  if (/^\/internal\/ops\/health$/i.test(p) && m === 'GET') {
    return true;
  }

  if (/^\/internal\/ops\/readiness$/i.test(p) && m === 'GET') {
    return true;
  }

  if (/^\/internal\/ops\/alerts$/i.test(p) && m === 'GET') {
    return true;
  }

  if (/^\/auth\/login$/i.test(p) && (m === 'POST' || m === 'GET')) {
    return true;
  }

  if (/^\/auth\/register$/i.test(p) && m === 'POST') {
    return true;
  }

  if (/^\/auth\/invites\/accept$/i.test(p) && m === 'POST') {
    return true;
  }

  if (/^\/auth\/refresh$/i.test(p) && m === 'POST') {
    return true;
  }

  if (/^\/auth\/logout$/i.test(p) && m === 'POST') {
    return true;
  }

  if (/^\/login$/i.test(p) && m === 'POST') {
    return true;
  }

  return false;
}
