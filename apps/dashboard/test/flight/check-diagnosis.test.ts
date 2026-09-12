// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  diagnoseFailedCheck,
  extractFailingTestPaths,
  type QuarantineEntry,
} from '../../src/flight/check-diagnosis.js';

const QUARANTINE: readonly QuarantineEntry[] = [
  {
    testPath: 'apps/dashboard/test/web/a11y.test.ts',
    owner: 'mastermind',
    reason: 'Windows-only axe-core teardown race',
    addedDate: '2026-09-10',
  },
];

describe('extractFailingTestPaths', () => {
  it('reads the test file off a vitest FAIL line', () => {
    const log = ' FAIL  apps/dashboard/test/web/a11y.test.ts > renders the panel\n';
    expect(extractFailingTestPaths(log)).toEqual(['apps/dashboard/test/web/a11y.test.ts']);
  });

  it('reads the test file off a dot-reporter × line', () => {
    const log = '  × apps/dashboard/test/flight/pool-client.test.ts (1 failed)\n';
    expect(extractFailingTestPaths(log)).toEqual([
      'apps/dashboard/test/flight/pool-client.test.ts',
    ]);
  });

  it('normalizes Windows backslash paths to forward slashes', () => {
    const log = 'FAIL apps\\dashboard\\test\\web\\a11y.test.ts\n';
    expect(extractFailingTestPaths(log)).toEqual(['apps/dashboard/test/web/a11y.test.ts']);
  });

  it('deduplicates the same path across multiple failure lines', () => {
    const log = [
      'FAIL apps/dashboard/test/web/a11y.test.ts > test one',
      'FAIL apps/dashboard/test/web/a11y.test.ts > test two',
    ].join('\n');
    expect(extractFailingTestPaths(log)).toEqual(['apps/dashboard/test/web/a11y.test.ts']);
  });

  it('ignores a passing line that merely mentions a test file', () => {
    const log = ' PASS  apps/dashboard/test/web/a11y.test.ts\n';
    expect(extractFailingTestPaths(log)).toEqual([]);
  });

  it('returns an empty list when no failure line names a test file', () => {
    expect(extractFailingTestPaths('Error: connection refused\n')).toEqual([]);
  });
});

describe('diagnoseFailedCheck', () => {
  it('classifies as unknown when the log names no failing test file', () => {
    const result = diagnoseFailedCheck({
      jobLog: 'Error: connection refused',
      touchedPaths: ['apps/dashboard/src/web/shell.ts'],
    });
    expect(result.verdict).toBe('unknown');
    expect(result.failingTestPaths).toEqual([]);
    expect(result.reasoning[0]).toMatch(/could not identify/i);
  });

  it('classifies as unknown when the failing test is untouched and unquarantined', () => {
    const result = diagnoseFailedCheck({
      jobLog: 'FAIL apps/dashboard/test/web/pool-client-link.test.ts',
      touchedPaths: ['packages/mcp/src/control.ts'],
    });
    expect(result.verdict).toBe('unknown');
    expect(result.touchedFailingPaths).toEqual([]);
    expect(result.matchedQuarantineEntries).toEqual([]);
  });

  it('classifies as flake when the failing test is quarantined and the PR does not touch it', () => {
    const result = diagnoseFailedCheck({
      jobLog: 'FAIL apps/dashboard/test/web/a11y.test.ts > expected null not to be null',
      touchedPaths: ['packages/mcp/src/control.ts'],
      quarantine: QUARANTINE,
    });
    expect(result.verdict).toBe('flake');
    expect(result.matchedQuarantineEntries).toEqual(QUARANTINE);
    expect(result.reasoning[0]).toContain('a11y.test.ts');
  });

  it('classifies as defect when the PR directly touches the failing test file', () => {
    const result = diagnoseFailedCheck({
      jobLog: 'FAIL apps/dashboard/test/web/pool-client-link.test.ts',
      touchedPaths: ['apps/dashboard/test/web/pool-client-link.test.ts'],
    });
    expect(result.verdict).toBe('defect');
    expect(result.touchedFailingPaths).toEqual([
      'apps/dashboard/test/web/pool-client-link.test.ts',
    ]);
  });

  it('prefers defect over a quarantine match when the PR touches the failing file itself', () => {
    const result = diagnoseFailedCheck({
      jobLog: 'FAIL apps/dashboard/test/web/a11y.test.ts',
      touchedPaths: ['apps/dashboard/test/web/a11y.test.ts'],
      quarantine: QUARANTINE,
    });
    expect(result.verdict).toBe('defect');
  });

  it('defaults to an empty quarantine list when none is given', () => {
    const result = diagnoseFailedCheck({
      jobLog: 'FAIL apps/dashboard/test/web/a11y.test.ts',
      touchedPaths: [],
    });
    expect(result.verdict).toBe('unknown');
    expect(result.matchedQuarantineEntries).toEqual([]);
  });
});
