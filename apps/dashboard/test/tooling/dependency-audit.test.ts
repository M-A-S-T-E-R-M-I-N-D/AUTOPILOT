// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure retry/backoff engine of scripts/ci/dependency-audit.mjs
 * (board web-mtnbz120-vwzmdz): a real npm registry audit-endpoint outage
 * painted `main` red for 3 CI runs straight on 2026-09-04 while every other
 * gate script passed. `runAuditWithRetry` takes an injected `runOnce`/`sleep`
 * so this exercises the retry ladder without shelling out to `pnpm audit` or
 * waiting on real backoff delays. `main()` itself stays unimported — same
 * stance apps/dashboard/test/tooling/secret-scan.test.ts takes for its
 * sibling script.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  findTransientAuditMarker,
  isTransientAuditFailure,
  runAuditWithRetry,
} from '../../../../scripts/ci/dependency-audit.mjs';

/**
 * A real `pnpm audit` finding in its verbatim shape — box table, count line,
 * `Severity:` summary. The classifier's one job is to tell THIS apart from a
 * registry outage, so the negative corpus below is built from it.
 */
function vulnerabilityReport(severity: string, title: string, pkg: string): string {
  const cell = (text: string) => text.padEnd(54);
  return [
    '┌─────────────────────┬────────────────────────────────────────────────────────┐',
    `│ ${severity.padEnd(19)} │ ${cell(title)} │`,
    '├─────────────────────┼────────────────────────────────────────────────────────┤',
    `│ Package             │ ${cell(pkg)} │`,
    '├─────────────────────┼────────────────────────────────────────────────────────┤',
    `│ Paths               │ ${cell(`. > ${pkg}@1.0.0`)} │`,
    '├─────────────────────┼────────────────────────────────────────────────────────┤',
    `│ More info           │ ${cell('https://github.com/advisories/GHSA-6x33-pw7p-hmpq')} │`,
    '└─────────────────────┴────────────────────────────────────────────────────────┘',
    '1 vulnerabilities found',
    `Severity: 1 ${severity}`,
  ].join('\n');
}

describe('isTransientAuditFailure', () => {
  it('recognizes a connection timeout as transient', () => {
    expect(isTransientAuditFailure('request failed, reason: ETIMEDOUT')).toBe(true);
  });

  it('recognizes a 5xx-flavored registry error as transient', () => {
    expect(isTransientAuditFailure('npm ERR! 500 Internal Server Error')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isTransientAuditFailure('Socket Hang Up while fetching audit endpoint')).toBe(true);
  });

  it('does not flag a real vulnerability report as transient', () => {
    const output = [
      '┌─────────────────────┬──────────────────────────────────────────────┐',
      '│ high                │ Prototype Pollution                           │',
      '│ Package              │ lodash                                        │',
      '└─────────────────────┴──────────────────────────────────────────────┘',
      '1 vulnerabilities found',
    ].join('\n');
    expect(isTransientAuditFailure(output)).toBe(false);
  });
});

/**
 * Guard-precision doctrine (board web-mtqumz0u-j39av4, docs/FAILURE-DOCTRINE.md
 * row 6): a classifier that decides whether CI stays GREEN must ship the
 * look-alike shapes it must NOT match, and every match must carry the text it
 * matched. Here a false positive is not noise — it downgrades a real high+
 * vulnerability to exit 0, so the gate fails OPEN.
 */
describe('findTransientAuditMarker — registry-outage corpus (must flag, with evidence)', () => {
  it('names the marker and the line it matched for a pnpm 503 from the audit endpoint', () => {
    const output =
      ' ERR_PNPM_AUDIT_BAD_RESPONSE  The audit endpoint (at https://registry.npmjs.org/-/npm/v1/security/audits) responded with 503: Service Unavailable\n';

    expect(findTransientAuditMarker(output)).toEqual({
      marker: 'service unavailable',
      evidence: output.trim(),
    });
  });

  it('points at the offending LINE, not the whole blob, when the outage sits below progress noise', () => {
    const offending =
      'WARN  GET https://registry.npmjs.org/-/npm/v1/security/audits error (ETIMEDOUT). Will retry in 10 seconds. 2 retries left.';
    const output = [
      'Progress: resolved 1200, reused 1200, downloaded 0, added 0, done',
      offending,
      'FetchError: request to https://registry.npmjs.org/-/npm/v1/security/audits failed, reason: connect ETIMEDOUT 104.16.3.35:443',
    ].join('\n');

    expect(findTransientAuditMarker(output)).toEqual({ marker: 'etimedout', evidence: offending });
  });

  it('clips a runaway evidence line so the warning stays one readable row', () => {
    const output = `ECONNRESET ${'x'.repeat(400)}`;

    const match = findTransientAuditMarker(output);

    expect(match?.marker).toBe('econnreset');
    expect(match?.evidence).toContain('ECONNRESET');
    expect(match?.evidence.length).toBeLessThanOrEqual(160);
  });
});

describe('findTransientAuditMarker — negative corpus: legit reds it must NOT flag', () => {
  it('a real finding whose advisory title quotes "socket hang up" is a vulnerability, not an outage', () => {
    const output = vulnerabilityReport(
      'high',
      'socket hang up on a malformed Upgrade header crashes the proxy',
      'http-proxy',
    );

    expect(findTransientAuditMarker(output)).toBeNull();
    expect(isTransientAuditFailure(output)).toBe(false);
  });

  it('a real finding whose advisory title reads "Internal Server Error" is a vulnerability, not an outage', () => {
    const output = vulnerabilityReport(
      'critical',
      'Unhandled Internal Server Error leaks the stack trace',
      'fastify-static',
    );

    expect(findTransientAuditMarker(output)).toBeNull();
  });

  it('a real finding about a missing network timeout is a vulnerability, not an outage', () => {
    const output = vulnerabilityReport(
      'high',
      'Missing network timeout enables slowloris',
      'undici',
    );

    expect(findTransientAuditMarker(output)).toBeNull();
  });

  it('a report that was answered with a Severity summary is never transient, whatever its prose says', () => {
    const output = [
      '2 vulnerabilities found',
      'Severity: 1 high | 1 critical',
      'Details: the registry returned 502 Bad Gateway for one advisory lookup — see the table above.',
    ].join('\n');

    expect(findTransientAuditMarker(output)).toBeNull();
  });

  it('an unrecognized crash — no registry marker, no report — is not transient, so the gate fails closed', () => {
    const output = [
      "TypeError: Cannot read properties of undefined (reading 'advisories')",
      '    at audit (/usr/lib/node_modules/pnpm/dist/pnpm.cjs:1:2)',
    ].join('\n');

    expect(findTransientAuditMarker(output)).toBeNull();
  });

  it('a plain clean-exit summary is not transient', () => {
    expect(findTransientAuditMarker('No known vulnerabilities found\n')).toBeNull();
  });
});

describe('runAuditWithRetry', () => {
  it('succeeds immediately without retrying when the first attempt is clean', async () => {
    const runOnce = vi.fn().mockReturnValue({ status: 0, output: 'no known vulnerabilities' });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await runAuditWithRetry({ runOnce, sleep, log: vi.fn(), warn: vi.fn() });

    expect(result).toEqual({ exitCode: 0, attempts: 1 });
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails immediately without retrying when a real vulnerability is reported', async () => {
    const runOnce = vi
      .fn()
      .mockReturnValue({ status: 1, output: '1 high severity vulnerability found' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const error = vi.fn();

    const result = await runAuditWithRetry({ runOnce, sleep, log: vi.fn(), error });

    expect(result).toEqual({ exitCode: 1, attempts: 1 });
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('reported a high+ severity issue'));
  });

  it('a real finding that quotes an outage phrase in its advisory still fails CI on the first attempt', async () => {
    const report = vulnerabilityReport(
      'high',
      'socket hang up on a malformed Upgrade header crashes the proxy',
      'http-proxy',
    );
    const runOnce = vi.fn().mockReturnValue({ status: 1, output: report });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const error = vi.fn();

    const result = await runAuditWithRetry({ runOnce, sleep, log: vi.fn(), warn: vi.fn(), error });

    expect(result).toEqual({ exitCode: 1, attempts: 1 });
    expect(sleep).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('reported a high+ severity issue'));
  });

  it('retries a transient failure with exponential backoff, then succeeds', async () => {
    const runOnce = vi
      .fn()
      .mockReturnValueOnce({ status: 1, output: 'ETIMEDOUT contacting registry' })
      .mockReturnValueOnce({ status: 0, output: 'no known vulnerabilities' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    const result = await runAuditWithRetry({
      runOnce,
      sleep,
      baseDelayMs: 100,
      log: vi.fn(),
      warn,
    });

    expect(result).toEqual({ exitCode: 0, attempts: 2 });
    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('the retry warning carries the matched marker and the line it matched as evidence', async () => {
    const runOnce = vi
      .fn()
      .mockReturnValueOnce({ status: 1, output: 'ETIMEDOUT contacting registry' })
      .mockReturnValueOnce({ status: 0, output: 'no known vulnerabilities' });
    const warn = vi.fn();

    await runAuditWithRetry({
      runOnce,
      sleep: vi.fn().mockResolvedValue(undefined),
      baseDelayMs: 100,
      log: vi.fn(),
      warn,
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('matched "etimedout"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ETIMEDOUT contacting registry'));
  });

  it('downgrades to a warning (exit 0) instead of failing CI when every attempt is transient', async () => {
    const runOnce = vi
      .fn()
      .mockReturnValue({ status: 1, output: '502 Bad Gateway from the audit endpoint' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const warn = vi.fn();

    const result = await runAuditWithRetry({
      runOnce,
      sleep,
      maxAttempts: 3,
      baseDelayMs: 10,
      log: vi.fn(),
      warn,
    });

    expect(result).toEqual({ exitCode: 0, attempts: 3 });
    expect(runOnce).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 20);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('looked unreachable after 3 attempts'),
    );
  });

  it('the final downgrade warning says WHICH text made the run degrade', async () => {
    const offending =
      ' ERR_PNPM_AUDIT_BAD_RESPONSE  The audit endpoint responded with 502: Bad Gateway';
    const runOnce = vi.fn().mockReturnValue({ status: 1, output: `${offending}\n` });
    const warn = vi.fn();

    await runAuditWithRetry({
      runOnce,
      sleep: vi.fn().mockResolvedValue(undefined),
      maxAttempts: 2,
      baseDelayMs: 10,
      log: vi.fn(),
      warn,
    });

    const finalWarning = warn.mock.calls.at(-1)?.[0] as string;
    expect(finalWarning).toContain('looked unreachable after 2 attempts');
    expect(finalWarning).toContain('matched "bad gateway"');
    expect(finalWarning).toContain(offending.trim());
  });
});
