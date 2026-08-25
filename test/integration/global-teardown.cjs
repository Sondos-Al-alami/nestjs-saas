/**
 * Jest globalTeardown for black-box integration tests.
 *
 * Stops the Nest stack only if globalSetup started it (startedByUs: true).
 * If you had `integration:stack:up` running already, it is left alone.
 */
const {
  readStackState,
  clearStackState,
  killPidTree,
} = require('../../scripts/lib/integration-process.cjs');

module.exports = async function globalTeardown() {
  const state = readStackState();
  clearStackState();
  if (!state) {
    return;
  }

  if (!state.startedByUs) {
    console.log(
      '[integration] Leaving externally managed stack running (startedByUs=false).',
    );
    return;
  }

  console.log(`[integration] Stopping stack started by Jest (pid=${state.pid})`);
  killPidTree(state.pid);
};
