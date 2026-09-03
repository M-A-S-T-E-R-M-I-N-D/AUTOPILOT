// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * gh run babysitting (epic 0010 slice 2, board web-mstdokr6-qgxqz8): read-only
 * latest-run-per-workflow report, injectable runner + clock so no real `gh`
 * process or wall-clock dependency ever touches the suite.
 */

import { describe, it, expect } from 'vitest';
import {
  ciWorkflowStatus,
  ciRunReport,
  formatRunAge,
  listWorkflowFiles,
} from '../../src/control/ci-status.js';

const NOW = Date.parse('2026-08-20T12:00:00Z');

describe('formatRunAge', () => {
  it('reports just now for sub-minute ages', () => {
    expect(formatRunAge('2026-08-20T11:59:45Z', NOW)).toBe('just now');
  });

  it('reports minutes for sub-hour ages', () => {
    expect(formatRunAge('2026-08-20T11:45:00Z', NOW)).toBe('15m ago');
  });

  it('reports hours for sub-day ages', () => {
    expect(formatRunAge('2026-08-20T04:00:00Z', NOW)).toBe('8h ago');
  });

  it('reports days for older ages', () => {
    expect(formatRunAge('2026-08-17T12:00:00Z', NOW)).toBe('3d ago');
  });

  it('reports unknown age for an unparsable timestamp', () => {
    expect(formatRunAge('not-a-date', NOW)).toBe('unknown age');
  });

  it('rolls over from minutes to hours exactly at 60 minutes', () => {
    expect(formatRunAge('2026-08-20T11:00:00Z', NOW)).toBe('1h ago');
  });

  it('rolls over from hours to days exactly at 24 hours', () => {
    expect(formatRunAge('2026-08-19T12:00:00Z', NOW)).toBe('1d ago');
  });

  it('clamps a future timestamp to "just now" instead of a negative age', () => {
    expect(formatRunAge('2026-08-20T12:05:00Z', NOW)).toBe('just now');
  });
});

describe('ciWorkflowStatus', () => {
  it('reports a successful run with its age', () => {
    const status = ciWorkflowStatus(
      'ci.yml',
      () =>
        JSON.stringify([
          { status: 'completed', conclusion: 'success', createdAt: '2026-08-20T11:00:00Z' },
        ]),
      NOW,
    );
    expect(status).toEqual({
      workflow: 'ci.yml',
      conclusion: 'success',
      ageLabel: '1h ago',
      createdAtMs: Date.parse('2026-08-20T11:00:00Z'),
      ok: true,
      detail: 'success (1h ago)',
    });
  });

  it('flags a failing conclusion as needing a look', () => {
    const status = ciWorkflowStatus(
      'mutation.yml',
      () =>
        JSON.stringify([
          { status: 'completed', conclusion: 'failure', createdAt: '2026-08-20T11:00:00Z' },
        ]),
      NOW,
    );
    expect(status.ok).toBe(false);
    expect(status.detail).toContain('failure');
  });

  it.each(['cancelled', 'timed_out', 'action_required', 'startup_failure'])(
    'flags a %s conclusion as needing a look',
    (conclusion) => {
      const status = ciWorkflowStatus(
        'mutation.yml',
        () =>
          JSON.stringify([{ status: 'completed', conclusion, createdAt: '2026-08-20T11:00:00Z' }]),
        NOW,
      );
      expect(status.ok).toBe(false);
      expect(status.detail).toContain(conclusion);
    },
  );

  it.each(['skipped', 'neutral'])('does not flag a %s conclusion', (conclusion) => {
    const status = ciWorkflowStatus(
      'mutation.yml',
      () =>
        JSON.stringify([{ status: 'completed', conclusion, createdAt: '2026-08-20T11:00:00Z' }]),
      NOW,
    );
    expect(status.ok).toBe(true);
    expect(status.detail).toContain(conclusion);
  });

  it('does not flag a run still in progress (conclusion is null)', () => {
    const status = ciWorkflowStatus(
      'labels.yml',
      () =>
        JSON.stringify([
          { status: 'in_progress', conclusion: null, createdAt: '2026-08-20T11:59:00Z' },
        ]),
      NOW,
    );
    expect(status.ok).toBe(true);
    expect(status.detail).toBe('in_progress (1m ago)');
  });

  it('degrades to an unknown line when gh is unavailable — never throws', () => {
    const status = ciWorkflowStatus(
      'ci.yml',
      () => {
        throw new Error('spawn gh ENOENT');
      },
      NOW,
    );
    expect(status.ok).toBe(true);
    expect(status.detail).toContain('gh unavailable');
  });

  it('degrades to "no runs yet" for a workflow with an empty run list', () => {
    const status = ciWorkflowStatus('ci.yml', () => '[]', NOW);
    expect(status.ok).toBe(true);
    expect(status.detail).toBe('no runs yet');
  });

  it('degrades gracefully on malformed JSON output', () => {
    const status = ciWorkflowStatus('ci.yml', () => 'not json', NOW);
    expect(status.ok).toBe(true);
    expect(status.detail).toContain('could not parse');
  });

  it('runs the exact read-only gh run list command, never a mutating one', () => {
    const calls: string[][] = [];
    ciWorkflowStatus(
      'ci.yml',
      (args) => {
        calls.push([...args]);
        return '[]';
      },
      NOW,
    );
    expect(calls).toEqual([
      [
        'run',
        'list',
        '--workflow',
        'ci.yml',
        '--limit',
        '1',
        '--json',
        'status,conclusion,createdAt',
      ],
    ]);
  });

  it('adds a --branch filter only when a branch is given', () => {
    const calls: string[][] = [];
    ciWorkflowStatus(
      'ci.yml',
      (args) => {
        calls.push([...args]);
        return '[]';
      },
      NOW,
      'main',
    );
    expect(calls[0]).toEqual([
      'run',
      'list',
      '--workflow',
      'ci.yml',
      '--limit',
      '1',
      '--json',
      'status,conclusion,createdAt',
      '--branch',
      'main',
    ]);
  });
});

describe('ciRunReport', () => {
  it('reports one line per workflow, in the given order', () => {
    const report = ciRunReport(
      ['ci.yml', 'labels.yml'],
      (args) =>
        JSON.stringify([
          {
            status: 'completed',
            conclusion: args.includes('ci.yml') ? 'success' : 'failure',
            createdAt: '2026-08-20T11:00:00Z',
          },
        ]),
      NOW,
    );
    expect(report.map((r) => r.workflow)).toEqual(['ci.yml', 'labels.yml']);
    expect(report[0]?.ok).toBe(true);
    expect(report[1]?.ok).toBe(false);
  });

  it('defaults to the real .github/workflows directory listing', () => {
    const report = ciRunReport(undefined, () => {
      throw new Error('spawn gh ENOENT');
    });
    expect(report.map((r) => r.workflow)).toEqual(
      expect.arrayContaining(['ci.yml', 'labels.yml', 'mutation.yml']),
    );
  });
});

describe('listWorkflowFiles', () => {
  it('returns an empty list for a directory that does not exist', () => {
    expect(listWorkflowFiles('does/not/exist')).toEqual([]);
  });

  it("finds this repo's real workflow files", () => {
    const files = listWorkflowFiles('.github/workflows');
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'labels.yml', 'mutation.yml']));
  });
});
