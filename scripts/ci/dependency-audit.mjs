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

/** Shapes only a PARSED vulnerability report prints — the box table's
 *  severity cell, the count line, the `Severity:` summary. Any of these means
 *  the registry answered; whatever outage-flavored prose the advisory titles
 *  happen to quote ("socket hang up …", "Internal Server Error …") is then
 *  the finding's text, not ours. Guard-precision doctrine (board
 *  web-mtqumz0u-j39av4, docs/FAILURE-DOCTRINE.md row 6): here a false
 *  positive fails CI OPEN — a real high+ finding downgraded to exit 0 — so a
 *  report outranks every marker below. */
const VULNERABILITY_REPORT_SIGNATURES = [
  /\b\d+ vulnerabilit(?:y|ies) found\b/i,
  /^\s*Severity:\s/im,
  /│\s*(?:low|moderate|high|critical)\s*│/i,
];

/** Longest evidence line the warning quotes — one readable row, not a dump. */
const EVIDENCE_MAX_CHARS = 160;

/** @param {string} line @returns {string} */
function clipEvidence(line) {
  const trimmed = line.trim();
  return trimmed.length > EVIDENCE_MAX_CHARS
    ? `${trimmed.slice(0, EVIDENCE_MAX_CHARS - 1)}…`
    : trimmed;
}

/**
 * Classify a failed `pnpm audit` run. Returns the marker that made the output
 * look like a registry outage AND the line it matched on — the evidence a
 * degraded run must print so an operator can judge whether the scanner was
 * right — or `null` when the output is a vulnerability report, or something
 * unrecognized (an unknown failure stays a hard red: the gate fails closed).
 * @param {string} output
 * @returns {{ marker: string, evidence: string } | null}
 */
export function findTransientAuditMarker(output) {
  if (VULNERABILITY_REPORT_SIGNATURES.some((signature) => signature.test(output))) {
    return null;
  }
  for (const line of output.split(/\r?\n/)) {
    const lower = line.toLowerCase();
    const marker = TRANSIENT_MARKERS.find((candidate) => lower.includes(candidate));
    if (marker) return { marker, evidence: clipEvidence(line) };
  }
  return null;
}

/** @param {string} output @returns {boolean} */
export function isTransientAuditFailure(output) {
  return findTransientAuditMarker(output) !== null;
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

    const transient = findTransientAuditMarker(output);
    if (transient === null) {
      error(output.trim());
      error('dependency-audit FAILED: pnpm audit reported a high+ severity issue');
      return { exitCode: 1, attempts: attempt };
    }

    const evidence = `matched "${transient.marker}" in: ${transient.evidence}`;
    if (attempt === maxAttempts) {
      warn(output.trim());
      warn(
        `dependency-audit WARN: the npm registry audit endpoint looked unreachable after ` +
          `${maxAttempts} attempts (transient network error, not a reported vulnerability; ` +
          `${evidence}) — not failing CI on a registry outage; rerun once the registry recovers.`,
      );
      return { exitCode: 0, attempts: attempt };
    }

    const delay = baseDelayMs * 2 ** (attempt - 1);
    warn(
      `dependency-audit: attempt ${attempt}/${maxAttempts} looked like a transient registry ` +
        `error (${evidence}), retrying in ${delay}ms...`,
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
