/** Read merged integration env from disk (same source as integration-stack.cjs). */
const { loadIntegrationEnv } = require('../../scripts/lib/integration-env.cjs') as {
  loadIntegrationEnv: () => Record<string, string | undefined>;
};

export function readIntegrationEnv(): Record<string, string | undefined> {
  return loadIntegrationEnv();
}
