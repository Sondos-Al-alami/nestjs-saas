/**
 * Unique tenant/email per run — primary isolation strategy for shared integration DBs
 * (avoids truncate between tests). Optional full wipe: `npm run integration:db:reset`.
 */
export function uniqueTestIdentity(prefix = 'it'): {
  tenantName: string;
  adminEmail: string;
  adminPassword: string;
} {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    tenantName: `${prefix}-org-${stamp}`,
    adminEmail: `${prefix}-${stamp}@integration.test`,
    adminPassword: 'IntegrationTest1!',
  };
}
