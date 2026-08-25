/**
 * Jest globalSetup for black-box integration tests.
 *
 * 1. Resolve GATEWAY_BASE_URL from integration env.
 * 2. If the gateway is already healthy (e.g. you ran `integration:stack:up`),
 *    reuse it and do not stop it on teardown.
 * 3. Otherwise start a detached `integration-stack.cjs up` process, wait for
 *    health, and record its PID so globalTeardown can stop it.
 *
 * Skip auto-start with INTEGRATION_SKIP_STACK_START=1 (fail if not healthy).
 */
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const {
  ROOT,
  loadIntegrationEnv,
  gatewayBaseUrl,
} = require('../../scripts/lib/integration-env.cjs');
const { waitForHealth } = require('../../scripts/integration-stack.cjs');
const {
  writeStackState,
  killPidTree,
} = require('../../scripts/lib/integration-process.cjs');

async function isHealthy(baseUrl, timeoutMs) {
  try {
    await waitForHealth(baseUrl, { timeoutMs, intervalMs: 500 });
    return true;
  } catch {
    return false;
  }
}

function startDetachedStack() {
  const child = spawn(
    process.execPath,
    [resolve(ROOT, 'scripts/integration-stack.cjs'), 'up'],
    {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: process.env,
    },
  );
  child.unref();
  return child.pid;
}

module.exports = async function globalSetup() {
  const env = loadIntegrationEnv();
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && process.env[key] === undefined) {
      process.env[key] = String(value);
    }
  }

  const baseUrl = gatewayBaseUrl(env);
  process.env.GATEWAY_BASE_URL = baseUrl;

  // Fast path: stack already running (manual `integration:stack:up`).
  if (await isHealthy(baseUrl, 8_000)) {
    writeStackState({ baseUrl, startedByUs: false, source: 'external' });
    console.log(`[integration] Reusing healthy gateway at ${baseUrl}`);
    return;
  }

  if (process.env.INTEGRATION_SKIP_STACK_START === '1') {
    throw new Error(
      `Gateway not healthy at ${baseUrl}. Start it with:\n` +
        `  npm run docker:integration:db:prepare\n` +
        `  npm run build\n` +
        `  npm run integration:stack:up\n` +
        `Or omit INTEGRATION_SKIP_STACK_START to let Jest start the stack.`,
    );
  }

  console.log(`[integration] Starting stack for gateway ${baseUrl}...`);
  const pid = startDetachedStack();
  try {
    await waitForHealth(baseUrl, { timeoutMs: 120_000, intervalMs: 1_500 });
  } catch (err) {
    killPidTree(pid);
    throw err;
  }

  writeStackState({
    baseUrl,
    startedByUs: true,
    pid,
    source: 'jest',
  });
  console.log(`[integration] Stack healthy at ${baseUrl} (pid=${pid})`);
};
