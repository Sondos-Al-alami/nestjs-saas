/**
 * Shared helpers for starting/stopping the integration Nest stack process tree.
 */
const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } =
  require('node:fs');
const { resolve } = require('node:path');
const { ROOT } = require('./integration-env.cjs');

const STATE_PATH = resolve(ROOT, '.tmp', 'integration-stack-state.json');

function ensureTmpDir() {
  mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
}

/**
 * Kill a process and its children.
 * Windows: taskkill /T /F. Unix: SIGTERM to process group, then pid.
 */
function killPidTree(pid) {
  if (!pid) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }
}

function writeStackState(state) {
  ensureTmpDir();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function readStackState() {
  if (!existsSync(STATE_PATH)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function clearStackState() {
  try {
    unlinkSync(STATE_PATH);
  } catch {
    // ignore
  }
}

/**
 * Stop the stack recorded in .tmp/integration-stack-state.json (CLI or Jest).
 * @returns {{ stopped: boolean, reason: string }}
 */
function stopRecordedStack() {
  const state = readStackState();
  clearStackState();
  if (!state?.pid) {
    return { stopped: false, reason: 'no-state' };
  }
  killPidTree(state.pid);
  return { stopped: true, reason: `pid=${state.pid}` };
}

module.exports = {
  STATE_PATH,
  killPidTree,
  writeStackState,
  readStackState,
  clearStackState,
  stopRecordedStack,
};
