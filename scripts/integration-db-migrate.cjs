/**
 * Apply Prisma migrations to the three integration test databases
 * (auth_db / course_db / analytics_db) used by black-box E2E.
 *
 * Env: INTEGRATION_DATABASE_URL_* from .env.integration (falls back to
 * .env.integration.example defaults). Set INTEGRATION_DB_SKIP_WAIT=1 to skip
 * the readiness wait (useful if you already know Postgres is up).
 */
const { spawnSync } = require('node:child_process');
const net = require('node:net');
const { ROOT, loadIntegrationEnv } = require('./lib/integration-env.cjs');

/**
 * One entry per microservice DB: which Prisma schema to migrate and which
 * integration URL env key / default to use as DATABASE_URL for that run.
 */
const SERVICES = [
  {
    label: 'auth-org-service',
    schema: 'apps/auth-org-service/prisma/schema.prisma',
    urlKey: 'INTEGRATION_DATABASE_URL_AUTH_ORG',
    defaultUrl:
      'postgresql://lms_it:lms_it@127.0.0.1:5434/auth_db?schema=public',
  },
  {
    label: 'course-service',
    schema: 'apps/course-service/prisma/schema.prisma',
    urlKey: 'INTEGRATION_DATABASE_URL_COURSE',
    defaultUrl:
      'postgresql://lms_it:lms_it@127.0.0.1:5434/course_db?schema=public',
  },
  {
    label: 'analytics-webhook-service',
    schema: 'apps/analytics-webhook-service/prisma/schema.prisma',
    urlKey: 'INTEGRATION_DATABASE_URL_ANALYTICS',
    defaultUrl:
      'postgresql://lms_it:lms_it@127.0.0.1:5434/analytics_db?schema=public',
  },
];

/**
 * Pull host + port out of a Postgres connection string.
 * Used so waitForPostgres knows where to TCP-probe (e.g. 127.0.0.1:5434).
 *
 * @param {string} databaseUrl - e.g. postgresql://user:pass@host:5434/db?schema=public
 * @returns {{ host: string, port: number }}
 */
function parseHostPort(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
  };
}

/**
 * Cheap readiness check: open a TCP socket to host:port.
 * Succeeds when something is listening (Docker may still be initializing Postgres).
 * Fails on connection refusal or timeout — callers retry via waitForPostgres.
 *
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs - max time to wait for this single connect attempt
 * @returns {Promise<void>}
 */
function probeTcp(host, port, timeoutMs) {
  return new Promise((resolveProbe, rejectProbe) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolveProbe();
    });
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      rejectProbe(new Error('timeout'));
    });
    socket.on('error', rejectProbe);
  });
}

/**
 * Real Postgres + auth check via Prisma: run `SELECT 1` against DATABASE_URL.
 * Returns true only when Prisma can connect and execute SQL (TCP alone is not enough —
 * a fresh container can accept TCP before it is ready for clients).
 *
 * @param {string} databaseUrl - integration auth (or other) DATABASE_URL
 * @param {string} schema - path to a Prisma schema (any of the three is fine for SELECT 1)
 * @returns {boolean}
 */
function probePrismaConnect(databaseUrl, schema) {
  const result = spawnSync(
    'npx',
    ['prisma', 'db', 'execute', '--stdin', '--schema', schema],
    {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      input: 'SELECT 1',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    },
  );
  return result.status === 0;
}

/**
 * Poll until integration Postgres is usable for migrations.
 *
 * @param {string} databaseUrl - usually INTEGRATION_DATABASE_URL_AUTH_ORG
 * @param {{ schema?: string, timeoutMs?: number, intervalMs?: number }} [options]
 * @returns {Promise<void>}
 */
async function waitForPostgres(databaseUrl, options = {}) {
  const { host, port } = parseHostPort(databaseUrl);
  const schema = options.schema ?? SERVICES[0].schema;
  const timeoutMs = options.timeoutMs ?? 90_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  let tcpReady = false;

  while (Date.now() < deadline) {
    if (!tcpReady) {
      try {
        await probeTcp(host, port, 2_000);
        tcpReady = true;
      } catch {
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }
    }

    if (probePrismaConnect(databaseUrl, schema)) {
      return;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `Integration Postgres not ready at ${host}:${port} after ${timeoutMs}ms. ` +
      'Ensure Docker is running, then: npm run docker:integration:db:up',
  );
}

/**
 * Run `prisma migrate deploy` for one microservice against its integration DB.
 * @param {{ label: string, schema: string }} service - entry from SERVICES
 * @param {string} databaseUrl - that service's INTEGRATION_DATABASE_URL_*
 */
function runMigrateDeploy(service, databaseUrl) {
  console.log(`\n→ prisma migrate deploy (${service.label})`);
  const result = spawnSync(
    'npx',
    ['prisma', 'migrate', 'deploy', '--schema', service.schema],
    {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
      shell: true,
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  const env = loadIntegrationEnv();
  const skipWait = env.INTEGRATION_DB_SKIP_WAIT === '1';

  const authUrl =
    env.INTEGRATION_DATABASE_URL_AUTH_ORG ?? SERVICES[0].defaultUrl;

  if (!skipWait) {
    console.log('Waiting for integration Postgres...');
    await waitForPostgres(authUrl);
    console.log('Postgres is ready for connections.');
  }

  for (const service of SERVICES) {
    const databaseUrl = env[service.urlKey] ?? service.defaultUrl;
    if (!databaseUrl) {
      console.error(`Missing ${service.urlKey} in integration env.`);
      process.exit(1);
    }
    runMigrateDeploy(service, databaseUrl);
  }

  console.log('\nIntegration database migrations applied.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
