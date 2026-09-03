// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * detect-flaky — repeat-run sampler for a suspected flaky test file (board
 * web-msnsqjc7-tg8lqv, groundwork before browser E2E lands its inherent flake
 * risk). Runs `vitest run <file>` N times in a row and tallies pass/fail: a
 * genuinely stable test passes (or fails) every run; a flaky one flips. This is
 * a diagnostic tool an operator runs on demand against a SPECIFIC file they
 * already suspect — it is deliberately NOT wired into `verify` or CI (repeating
 * the whole suite N times there would multiply CI cost/time for every run, not
 * just the rare flaky one). A confirmed-flaky test's next step is a manual
 * entry in `config/quarantine/flaky-tests.json` (owner + reason), reported by
 * `scripts/ci/quarantine-report.mjs`.
 *
 * Retry-to-green (accepting the first pass) would HIDE flakiness instead of
 * detecting it, so every run's real exit code counts toward the tally.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_RUNS = 5;

/**
 * @param {readonly boolean[]} results true = that run passed
 * @returns {{ runs: number, passCount: number, failCount: number, flaky: boolean }}
 */
export function summarizeRuns(results) {
  const passCount = results.filter(Boolean).length;
  const failCount = results.length - passCount;
  return { runs: results.length, passCount, failCount, flaky: passCount > 0 && failCount > 0 };
}

/** @param {ReturnType<typeof summarizeRuns>} summary @param {string} testPath */
export function formatVerdict(summary, testPath) {
  const tally = `${summary.passCount} passed / ${summary.failCount} failed of ${summary.runs} run(s)`;
  return summary.flaky
    ? `detect-flaky: FLAKY — ${testPath} (${tally})`
    : `detect-flaky: stable — ${testPath} (${tally})`;
}

/**
 * On Windows, `pnpm` is a `.cmd` shim that `execFileSync` cannot launch
 * directly (ENOENT) — route it through `cmd.exe /c` so PATHEXT resolves the
 * shim, same fix `packages/engine/src/adapters/gate.ts`'s `buildInvocation`
 * already applies for the live gate runner.
 * @returns {{ bin: string, args: string[] }}
 */
function pnpmInvocation(args) {
  return process.platform === 'win32'
    ? { bin: 'cmd.exe', args: ['/c', 'pnpm', ...args] }
    : { bin: 'pnpm', args: [...args] };
}

/** @param {string} testPath @returns {boolean} true when that single run passed */
function runOnce(testPath) {
  const inv = pnpmInvocation(['exec', 'vitest', 'run', testPath]);
  try {
    execFileSync(inv.bin, inv.args, { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const [testPath, runsArg] = process.argv.slice(2);
  if (!testPath) {
    console.error('usage: node scripts/ci/detect-flaky.mjs <test-file-path> [runs=5]');
    process.exit(1);
    return;
  }
  if (!existsSync(testPath)) {
    console.error(`detect-flaky FAILED: no such file: ${testPath}`);
    process.exit(1);
    return;
  }
  const runs = runsArg ? Number(runsArg) : DEFAULT_RUNS;
  if (!Number.isInteger(runs) || runs < 2) {
    console.error(`detect-flaky FAILED: runs must be an integer >= 2 (got "${runsArg}")`);
    process.exit(1);
    return;
  }

  const results = Array.from({ length: runs }, () => runOnce(testPath));
  const summary = summarizeRuns(results);
  console.log(formatVerdict(summary, testPath));
  if (summary.flaky) process.exit(1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
