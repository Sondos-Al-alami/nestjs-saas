/**
 * Black-box E2E stack: auth-org, course, analytics (TCP) + gateway (HTTP).
 * CLI: node scripts/integration-stack.cjs up|down|health
 * Requires: npm run build
 */
const { spawn } = require('node:child_process');
const http = require('node:http');
const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const {
  ROOT,
  loadIntegrationEnv,
  toInt,
  gatewayPort,
  gatewayBaseUrl,
} = require('./lib/integration-env.cjs');
const {
  writeStackState,
  clearStackState,
  stopRecordedStack,
} = require('./lib/integration-process.cjs');

const SERVICES = [
  {
    name: 'auth-org-service',
    dist: 'dist/apps/auth-org-service/main.js',
    role: 'downstream',
  },
  {
    name: 'course-service',
    dist: 'dist/apps/course-service/main.js',
    role: 'downstream',
  },
  {
    name: 'analytics-webhook-service',
    dist: 'dist/apps/analytics-webhook-service/main.js',
    role: 'downstream',
  },
  { name: 'api-gateway', dist: 'dist/apps/api-gateway/main.js', role: 'gateway' },
];

function buildServiceEnvs(env) {
  const gwPort = gatewayPort(env);
  const authTcp = toInt(env.AUTH_ORG_TCP_PORT, 3001);
  const courseTcp = toInt(env.COURSE_TCP_PORT, 3002);
  const analyticsTcp = toInt(env.ANALYTICS_TCP_PORT, 3003);
  const tcpBindHost = env.TCP_HOST || '0.0.0.0';
  const jwt =
    env.JWT_SECRET || 'integration-jwt-secret-min-32-chars-do-not-use-in-prod';
  const internal =
    env.INTERNAL_SERVICE_SECRET ||
    'integration-internal-service-secret-not-for-prod';

  const base = { ...process.env, NODE_ENV: env.NODE_ENV || 'test' };

  return {
    'auth-org-service': {
      ...base,
      DATABASE_URL: env.INTEGRATION_DATABASE_URL_AUTH_ORG,
      JWT_SECRET: jwt,
      INTERNAL_SERVICE_SECRET: internal,
      TCP_HOST: tcpBindHost,
      AUTH_ORG_TCP_PORT: String(authTcp),
      AUTH_ORG_HTTP_PORT: String(toInt(env.AUTH_ORG_HTTP_PORT, 3011)),
      JWT_ACCESS_TTL_SEC: env.JWT_ACCESS_TTL_SEC || '900',
      JWT_REFRESH_TTL_DAYS: env.JWT_REFRESH_TTL_DAYS || '30',
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY || '',
      STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET || '',
      STRIPE_PRICE_PRO: env.STRIPE_PRICE_PRO || '',
      STRIPE_PRICE_ENTERPRISE: env.STRIPE_PRICE_ENTERPRISE || '',
      BILLING_CHECKOUT_RETURN_BASE_URL:
        env.BILLING_CHECKOUT_RETURN_BASE_URL || '',
    },
    'course-service': {
      ...base,
      DATABASE_URL: env.INTEGRATION_DATABASE_URL_COURSE,
      TCP_HOST: tcpBindHost,
      COURSE_TCP_PORT: String(courseTcp),
    },
    'analytics-webhook-service': {
      ...base,
      DATABASE_URL: env.INTEGRATION_DATABASE_URL_ANALYTICS,
      TCP_HOST: tcpBindHost,
      ANALYTICS_TCP_PORT: String(analyticsTcp),
    },
    'api-gateway': {
      ...base,
      PORT: String(gwPort),
      JWT_SECRET: jwt,
      INTERNAL_SERVICE_SECRET: internal,
      AUTH_ORG_TCP_HOST: env.AUTH_ORG_TCP_HOST || '127.0.0.1',
      COURSE_TCP_HOST: env.COURSE_TCP_HOST || '127.0.0.1',
      ANALYTICS_TCP_HOST: env.ANALYTICS_TCP_HOST || '127.0.0.1',
      AUTH_ORG_TCP_PORT: String(authTcp),
      COURSE_TCP_PORT: String(courseTcp),
      ANALYTICS_TCP_PORT: String(analyticsTcp),
      GATEWAY_READINESS_TIMEOUT_MS: env.GATEWAY_READINESS_TIMEOUT_MS || '5000',
    },
  };
}

function assertBuilt() {
  const missing = SERVICES.filter((s) => !existsSync(resolve(ROOT, s.dist)));
  if (missing.length > 0) {
    throw new Error(
      `Missing build output for: ${missing
        .map((s) => s.name)
        .join(', ')}. Run: npm run build`,
    );
  }
}

function prefixStream(stream, label, sink) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      sink(`[${label}] ${line}`);
    }
  });
}

function spawnService(service, serviceEnv) {
  const child = spawn(process.execPath, [resolve(ROOT, service.dist)], {
    cwd: ROOT,
    env: serviceEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  prefixStream(child.stdout, service.name, (l) => console.log(l));
  prefixStream(child.stderr, service.name, (l) => console.error(l));
  return child;
}

function killChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } catch {
      child.kill('SIGKILL');
    }
  } else {
    child.kill('SIGTERM');
  }
}

function fetchHealth(url, timeoutMs) {
  return new Promise((resolvePromise) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () =>
        resolvePromise({ status: res.statusCode ?? 0, body }),
      );
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolvePromise({ status: 0, body: '' });
    });
    req.on('error', () => resolvePromise({ status: 0, body: '' }));
  });
}

async function waitForHealth(baseUrl, options = {}) {
  const url = `${baseUrl.replace(/\/+$/, '')}/internal/downstream-health`;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { status, body } = await fetchHealth(url, 4_000);
    if (status === 200) {
      let ok = true;
      try {
        const parsed = JSON.parse(body);
        ok = [parsed.authOrg, parsed.course, parsed.analytics].every(
          (s) => s && s.ok !== false,
        );
      } catch {
        ok = true;
      }
      if (ok) {
        return true;
      }
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Gateway not healthy at ${url} after ${timeoutMs}ms. ` +
      'Check service logs above and integration DB (npm run docker:integration:db:prepare).',
  );
}

async function startStack(options = {}) {
  assertBuilt();

  const env = options.env ?? loadIntegrationEnv();
  const envs = buildServiceEnvs(env);
  const baseUrl = gatewayBaseUrl(env);
  const children = new Map();

  const stop = async () => {
    for (const child of children.values()) {
      killChild(child);
    }
  };

  const onExit = (name) => (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(`[${name}] exited early (code=${code} signal=${signal})`);
    }
  };

  const downstream = SERVICES.filter((s) => s.role === 'downstream');
  for (const service of downstream) {
    const child = spawnService(service, envs[service.name]);
    child.on('exit', onExit(service.name));
    children.set(service.name, child);
  }

  await new Promise((r) => setTimeout(r, 1_500));

  const gateway = SERVICES.find((s) => s.role === 'gateway');
  const gatewayChild = spawnService(gateway, envs[gateway.name]);
  gatewayChild.on('exit', onExit(gateway.name));
  children.set(gateway.name, gatewayChild);

  try {
    await waitForHealth(baseUrl, options.health);
  } catch (err) {
    await stop();
    throw err;
  }

  return { baseUrl, children, stop };
}

async function cli() {
  const cmd = process.argv[2] ?? 'up';
  const env = loadIntegrationEnv();
  const baseUrl = gatewayBaseUrl(env);

  if (cmd === 'down') {
    const result = stopRecordedStack();
    if (result.stopped) {
      console.log(`Stopped integration stack (${result.reason}).`);
    } else {
      console.log(
        'No recorded stack PID (.tmp/integration-stack-state.json). ' +
          'If services are still running, stop the terminal that ran integration:stack:up (Ctrl+C).',
      );
    }
    process.exit(0);
  }

  if (cmd === 'health') {
    const { status, body } = await fetchHealth(
      `${baseUrl}/internal/downstream-health`,
      4_000,
    );
    console.log(`status=${status} body=${body}`);
    process.exit(status === 200 ? 0 : 1);
  }

  if (cmd !== 'up') {
    console.error(`Unknown command: ${cmd}. Use "up", "down", or "health".`);
    process.exit(1);
  }

  console.log('Starting integration stack...');
  const stack = await startStack({ env });
  writeStackState({
    baseUrl: stack.baseUrl,
    startedByUs: true,
    pid: process.pid,
    source: 'cli',
  });
  console.log(`\nStack healthy. Gateway: ${stack.baseUrl}`);
  console.log('Press Ctrl+C to stop (or: npm run integration:stack:down).\n');

  const shutdown = async () => {
    console.log('\nStopping integration stack...');
    clearStackState();
    await stack.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  cli().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

module.exports = {
  SERVICES,
  buildServiceEnvs,
  startStack,
  waitForHealth,
  gatewayBaseUrl,
};
