/**
 * Truncate application tables in the three integration databases.
 * Keeps Prisma migration history (_prisma_migrations).
 *
 * Isolation default for tests is unique tenant/email (see test-identity.ts).
 * Use this when you want a clean slate without recreating the Docker volume:
 *   npm run integration:db:reset
 *
 * Requires Postgres up (npm run docker:integration:db:up).
 */
const { spawnSync } = require('node:child_process');
const { ROOT, loadIntegrationEnv } = require('./lib/integration-env.cjs');

const DATABASES = [
  {
    label: 'auth-org',
    schema: 'apps/auth-org-service/prisma/schema.prisma',
    urlKey: 'INTEGRATION_DATABASE_URL_AUTH_ORG',
    defaultUrl:
      'postgresql://lms_it:lms_it@127.0.0.1:5434/auth_db?schema=public',
    // CASCADE clears dependent rows; order is not critical.
    sql: `TRUNCATE TABLE
      "StripeWebhookEvent",
      "Invite",
      "RefreshToken",
      "Membership",
      "User",
      "Tenant"
      RESTART IDENTITY CASCADE;`,
  },
  {
    label: 'course',
    schema: 'apps/course-service/prisma/schema.prisma',
    urlKey: 'INTEGRATION_DATABASE_URL_COURSE',
    defaultUrl:
      'postgresql://lms_it:lms_it@127.0.0.1:5434/course_db?schema=public',
    sql: `TRUNCATE TABLE
      "Enrollment",
      "Lesson",
      "Course"
      RESTART IDENTITY CASCADE;`,
  },
  {
    label: 'analytics',
    schema: 'apps/analytics-webhook-service/prisma/schema.prisma',
    urlKey: 'INTEGRATION_DATABASE_URL_ANALYTICS',
    defaultUrl:
      'postgresql://lms_it:lms_it@127.0.0.1:5434/analytics_db?schema=public',
    sql: `TRUNCATE TABLE
      "DeadLetterEvent",
      "EventBuffer",
      "WebhookEndpoint"
      RESTART IDENTITY CASCADE;`,
  },
];

function truncateDb(db, databaseUrl) {
  console.log(`\n→ truncate ${db.label}`);
  const result = spawnSync(
    'npx',
    ['prisma', 'db', 'execute', '--stdin', '--schema', db.schema],
    {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      input: db.sql,
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const env = loadIntegrationEnv();
  for (const db of DATABASES) {
    const databaseUrl = env[db.urlKey] ?? db.defaultUrl;
    if (!databaseUrl) {
      console.error(`Missing ${db.urlKey}`);
      process.exit(1);
    }
    if (!/5434|lms_it|integration/i.test(databaseUrl)) {
      console.error(
        `Refusing to truncate ${db.label}: URL does not look like the integration DB.\n` +
          `Got: ${databaseUrl.replace(/:[^:@]+@/, ':***@')}`,
      );
      process.exit(1);
    }
    truncateDb(db, databaseUrl);
  }
  console.log('\nIntegration application tables truncated (migrations kept).');
}

main();
