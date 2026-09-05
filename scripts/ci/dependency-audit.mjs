// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * dependency-audit — resilient wrapper around `pnpm audit --prod --audit-level=high`
 * (board web-mtnbz120-vwzmdz): the npm registry's audit endpoint outaged
 * (timeout/500) and painted `main` red for 3 CI runs straight on 2026-09-04
 * while every other gate script passed. A registry OUTAGE and a reported
 * VULNERABILITY are different signals, but a bare `pnpm audit` call fails CI
 * identically either way. This retries a transient-looking failure with
 * backoff; only a REAL vulnerability finding is a hard failure. An outage
 * that survives every retry degrades to a warning (exit 0) instead of
 * blocking merges the way an actual high+ severity vulnerability should.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 2000;

/** Substrings from pnpm/npm's own error text for a REGISTRY-SIDE failure
 *  (timeout, connection reset, 5xx) rather than a parsed vulnerability
 *  report — lowercase, matched case-insensitively. */
const TRANSIENT_MARKERS = [
  'etimedout',
  'econnreset',
  'econnrefused',
  'enotfound',
  'eai_again',
  'socket hang up',
  'network timeout',
  'internal server error',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
  'audit endpoint',
];

/** @param {string} output @returns {boolean} */
export function isTransientAuditFailure(output) {
  const lower = output.toLowerCase();
  return TRANSIENT_MARKERS.some((marker) => lower.includes(marker));
}

/** On Windows, `pnpm` is a `.cmd` shim that `execFileSync` cannot launch
 *  directly (ENOENT) — route it through `cmd.exe /c`, same fix
 *  `scripts/ci/detect-flaky.mjs`'s `pnpmInvocation` already applies.
 *  @returns {{ bin: string, args: string[] }} */
function pnpmInvocation(args) {
  return process.platform === 'win32'
    ? { bin: 'cmd.exe', args: ['/c', 'pnpm', ...args] }
    : { bin: 'pnpm', args: [...args] };
}

/** @returns {{ status: number, output: string }} */
function runAuditOnce() {
  const inv = pnpmInvocation(['audit', '--prod', '--audit-level=high']);
  try {
    const output = execFileSync(inv.bin, inv.args, { encoding: 'utf8', windowsHide: true });
    return { status: 0, output };
  } catch (error) {
    const failure = /** @type {{ stdout?: string, stderr?: string, status?: number | null }} */ (
      error
    );
    return {
      status: typeof failure.status === 'number' ? failure.status : 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

/**
 * @param {{
 *   runOnce: () => { status: number, output: string },
 *   sleep: (ms: number) => Promise<void>,
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 *   log?: (line: string) => void,
 *   warn?: (line: string) => void,
 *   error?: (line: string) => void,
 * }} deps
 * @returns {Promise<{ exitCode: number, attempts: number }>}
 */
export async function runAuditWithRetry({
  runOnce,
  sleep,
  maxAttempts = MAX_ATTEMPTS,
  baseDelayMs = BASE_DELAY_MS,
  log = console.log,
  warn = console.warn,
  error = console.error,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { status, output } = runOnce();
    if (status === 0) {
      log(output.trim());
      log('dependency-audit OK: no high+ severity production vulnerabilities');
      return { exitCode: 0, attempts: attempt };
    }

    if (!isTransientAuditFailure(output)) {
      error(output.trim());
      error('dependency-audit FAILED: pnpm audit reported a high+ severity issue');
      return { exitCode: 1, attempts: attempt };
    }

    if (attempt === maxAttempts) {
      warn(output.trim());
      warn(
        `dependency-audit WARN: the npm registry audit endpoint looked unreachable after ` +
          `${maxAttempts} attempts (transient network error, not a reported vulnerability) — ` +
          'not failing CI on a registry outage; rerun once the registry recovers.',
      );
      return { exitCode: 0, attempts: attempt };
    }

    const delay = baseDelayMs * 2 ** (attempt - 1);
    warn(
      `dependency-audit: attempt ${attempt}/${maxAttempts} looked like a transient registry ` +
        `error, retrying in ${delay}ms...`,
    );
    await sleep(delay);
  }
  /* c8 ignore next -- loop always returns before falling through */
  return { exitCode: 1, attempts: maxAttempts };
}

async function main() {
  const { exitCode } = await runAuditWithRetry({
    runOnce: runAuditOnce,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  process.exit(exitCode);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
