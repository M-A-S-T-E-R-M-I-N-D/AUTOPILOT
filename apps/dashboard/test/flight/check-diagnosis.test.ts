// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  diagnoseFailedCheck,
  extractFailingTestPaths,
  createCheckDiagnosisApi,
  type QuarantineEntry,
} from '../../src/flight/check-diagnosis.js';
import type { PrReviewCandidate } from '../../src/flight/pr-review.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

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

/**
 * THE DIAGNOSE ROUTE'S API — the follow-up derivation named in the epic's
 * own "Shape" section as "the server route": re-reads the PR fresh from
 * `gh`, reads whichever gating check's job log is red, and classifies it.
 */
describe('createCheckDiagnosisApi', () => {
  const RED: PrReviewCandidate = {
    number: 37,
    title: 'chore(deps): bump zod',
    gateStatus: 'fail',
    mergeable: true,
    touchedPaths: ['packages/mcp/src/control.ts'],
    checkRuns: [
      { name: 'verify (ubuntu-latest)', state: 'pass' },
      {
        name: 'verify (windows-latest)',
        state: 'fail',
        url: 'https://github.com/o/r/actions/runs/900/job/1',
      },
    ],
  };

  function execReturning(pr: PrReviewCandidate, log: string, calls: string[][]): CliExec {
    return async (bin, args) => {
      calls.push([bin, ...args]);
      if (args[0] === 'pr' && args[1] === 'list') {
        return {
          code: 0,
          stdout: JSON.stringify([
            {
              number: pr.number,
              title: pr.title,
              mergeable: pr.mergeable ? 'MERGEABLE' : 'CONFLICTING',
              statusCheckRollup: (pr.checkRuns ?? []).map((r) => ({
                name: r.name,
                conclusion: r.state === 'pass' ? 'SUCCESS' : r.state === 'fail' ? 'FAILURE' : null,
                status: r.state === 'running' ? 'IN_PROGRESS' : 'COMPLETED',
                detailsUrl: r.url,
              })),
              files: pr.touchedPaths.map((path) => ({ path })),
              labels: [],
              latestReviews: [],
            },
          ]),
        };
      }
      if (args[0] === 'run' && args[1] === 'view') {
        return { code: 0, stdout: log };
      }
      return { code: 0, stdout: '' };
    };
  }

  function withTempQuarantine(entries: readonly QuarantineEntry[]): {
    repoRoot: string;
    cleanup: () => void;
  } {
    const repoRoot = mkdtempSync(join(tmpdir(), 'check-diagnosis-'));
    mkdirSync(join(repoRoot, 'config', 'quarantine'), { recursive: true });
    writeFileSync(
      join(repoRoot, 'config', 'quarantine', 'flaky-tests.json'),
      JSON.stringify(entries),
    );
    return { repoRoot, cleanup: () => rmSync(repoRoot, { recursive: true, force: true }) };
  }

  it('classifies defect when the PR directly touches the failing test file', async () => {
    const touching = { ...RED, touchedPaths: ['apps/dashboard/test/web/a11y.test.ts'] };
    const calls: string[][] = [];
    const diagnose = createCheckDiagnosisApi(
      execReturning(touching, 'FAIL apps/dashboard/test/web/a11y.test.ts', calls),
      mkdtempSync(join(tmpdir(), 'check-diagnosis-empty-')),
    );

    const outcome = await diagnose(37);

    expect(outcome.diagnosis?.verdict).toBe('defect');
    expect(calls.some((c) => c[0] === 'gh' && c[1] === 'run' && c[2] === 'view')).toBe(true);
  });

  it('classifies flake against a quarantine entry read off disk', async () => {
    const quarantine: readonly QuarantineEntry[] = [
      {
        testPath: 'apps/dashboard/test/web/a11y.test.ts',
        owner: 'mastermind',
        reason: 'Windows-only axe-core teardown race',
        addedDate: '2026-09-10',
      },
    ];
    const { repoRoot, cleanup } = withTempQuarantine(quarantine);
    try {
      const calls: string[][] = [];
      const diagnose = createCheckDiagnosisApi(
        execReturning(RED, 'FAIL apps/dashboard/test/web/a11y.test.ts', calls),
        repoRoot,
      );

      const outcome = await diagnose(37);

      expect(outcome.diagnosis?.verdict).toBe('flake');
      expect(outcome.diagnosis?.matchedQuarantineEntries).toEqual(quarantine);
    } finally {
      cleanup();
    }
  });

  it('refuses a PR that is no longer open', async () => {
    const outcome = await createCheckDiagnosisApi(
      execReturning(RED, '', []),
      mkdtempSync(join(tmpdir(), 'check-diagnosis-empty-')),
    )(999);

    expect(outcome.diagnosis).toBeUndefined();
    expect(outcome.reason).toContain('no longer open');
  });

  it('refuses when nothing is failing — nothing to diagnose', async () => {
    const green = {
      ...RED,
      checkRuns: [{ name: 'verify (ubuntu-latest)', state: 'pass' as const }],
    };
    const outcome = await createCheckDiagnosisApi(
      execReturning(green, '', []),
      mkdtempSync(join(tmpdir(), 'check-diagnosis-empty-')),
    )(37);

    expect(outcome.diagnosis).toBeUndefined();
    expect(outcome.reason).toContain('nothing to diagnose');
  });

  it('refuses when the red check is not an Actions run we can read a log from', async () => {
    const external = {
      ...RED,
      checkRuns: [{ name: 'vercel', state: 'fail' as const, url: 'https://vercel.com/x' }],
    };
    const outcome = await createCheckDiagnosisApi(
      execReturning(external, '', []),
      mkdtempSync(join(tmpdir(), 'check-diagnosis-empty-')),
    )(37);

    expect(outcome.diagnosis).toBeUndefined();
    expect(outcome.reason).toContain('no log to read');
  });

  it('reports honestly when gh refuses to read every run’s log', async () => {
    const calls: string[][] = [];
    const base = execReturning(RED, 'FAIL a.test.ts', calls);
    const refusing: CliExec = async (bin, args) =>
      args[0] === 'run' ? { code: 1, stdout: '' } : base(bin, args);

    const outcome = await createCheckDiagnosisApi(
      refusing,
      mkdtempSync(join(tmpdir(), 'check-diagnosis-empty-')),
    )(37);

    expect(outcome.diagnosis).toBeUndefined();
    expect(outcome.reason).toContain('could not read');
  });

  it('degrades to an empty quarantine list instead of throwing when the file is missing', async () => {
    const outcome = await createCheckDiagnosisApi(
      execReturning(RED, 'FAIL apps/dashboard/test/web/a11y.test.ts', []),
      join(tmpdir(), 'check-diagnosis-does-not-exist'),
    )(37);

    expect(outcome.diagnosis?.matchedQuarantineEntries).toEqual([]);
  });
});
