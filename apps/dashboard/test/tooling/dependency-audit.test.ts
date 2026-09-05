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
  isTransientAuditFailure,
  runAuditWithRetry,
} from '../../../../scripts/ci/dependency-audit.mjs';

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

  it('retries a transient failure with exponential backoff, then succeeds', async () => {
    const runOnce = vi
      .fn()
      .mockReturnValueOnce({ status: 1, output: 'ETIMEDOUT contacting registry' })
      .mockReturnValueOnce({ status: 0, output: 'no known vulnerabilities' });
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await runAuditWithRetry({
      runOnce,
      sleep,
      baseDelayMs: 100,
      log: vi.fn(),
      warn: vi.fn(),
    });

    expect(result).toEqual({ exitCode: 0, attempts: 2 });
    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
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
});
