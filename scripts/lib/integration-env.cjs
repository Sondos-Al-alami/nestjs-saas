/**
 * Shared loader for integration/black-box env.
 *
 * Precedence (later wins): .env.integration.example -> .env.integration -> process.env
 */
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '..', '..');

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }
  const out = {};
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadIntegrationEnv() {
  const fromFiles = {
    ...parseEnvFile(resolve(ROOT, '.env.integration.example')),
    ...parseEnvFile(resolve(ROOT, '.env.integration')),
  };
  // Integration file values override ambient process.env (e.g. dev `.env` Stripe placeholders).
  return { ...process.env, ...fromFiles };
}

function toInt(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Gateway HTTP port. GATEWAY_BASE_URL is the source of truth for the black-box
 * client, so its port wins over PORT to avoid listen/base-url mismatch.
 */
function gatewayPort(env) {
  if (env.GATEWAY_BASE_URL) {
    try {
      const p = new URL(env.GATEWAY_BASE_URL).port;
      if (p) {
        return toInt(p, 3000);
      }
    } catch {
      // ignore malformed URL, fall through
    }
  }
  return toInt(env.PORT, 3000);
}

function gatewayBaseUrl(env) {
  if (env.GATEWAY_BASE_URL) {
    return env.GATEWAY_BASE_URL.replace(/\/+$/, '');
  }
  return `http://127.0.0.1:${gatewayPort(env)}`;
}

const DB_URL_KEYS = {
  authOrg: 'INTEGRATION_DATABASE_URL_AUTH_ORG',
  course: 'INTEGRATION_DATABASE_URL_COURSE',
  analytics: 'INTEGRATION_DATABASE_URL_ANALYTICS',
};

module.exports = {
  ROOT,
  parseEnvFile,
  loadIntegrationEnv,
  toInt,
  gatewayPort,
  gatewayBaseUrl,
  DB_URL_KEYS,
};
