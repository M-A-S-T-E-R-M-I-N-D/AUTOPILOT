// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, createTask } from '@autopilot/store';
import {
  PRIORITY_LABEL_BAND,
  planMirrorPassPriorityFollow,
  planMirrorPassPriorityFollowBatch,
  type MirrorPassPriorityCandidate,
} from '../../src/flight/mirror-pass-priority.js';
import { createMirrorPassPriorityFollowExecuteApi } from '../../src/flight/mirror-pass-execute.js';
import type { MirrorPassIssueState } from '../../src/flight/mirror-pass.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

// Epic 0019 additive-only law, the mirror pass's priority-follow leg × the
// taxonomy seeder. GitHub keeps one label per name in any casing, and the
// seeder's `gh label create --force` keeps an existing label's casing (its
// force path sends no new name). So on a repo whose label reads
// `Priority: High`, the maintainer's mark arrives from `gh issue view --json
// labels` spelled that way, and the board must still follow it (law 2: what
// the maintainer marks outranks triage). The roadmap and help-wanted groups
// and the maintainer's hold marks already read their labels in any casing.
describe('planMirrorPassPriorityFollow × a priority label in any casing (regression, epic 0019 additive-only law)', () => {
  const OPEN: MirrorPassIssueState = { number: 42, state: 'open' };
  const task = (
    overrides: Partial<MirrorPassPriorityCandidate> = {},
  ): MirrorPassPriorityCandidate => ({
    id: 'github-42',
    status: 'queued',
    landedSha: null,
    priority: null,
    priorityPinned: false,
    ...overrides,
  });

  it('reads the labels the seeder stamps', () => {
    const seeded = HOUSE_TAXONOMY_LABELS.map((label) => label.name);
    for (const name of Object.keys(PRIORITY_LABEL_BAND)) expect(seeded).toContain(name);
  });

  it.each(['Priority: High', 'PRIORITY: HIGH', ' priority: high ', 'Priority: high'])(
    'steers the board when the label reads "%s", naming it as gh spelled it',
    (spelling) => {
      expect(planMirrorPassPriorityFollow(task(), OPEN, [spelling])).toEqual({
        action: 'set-priority-from-label',
        taskId: 'github-42',
        issueNumber: 42,
        label: spelling,
        priority: 100,
      });
    },
  );

  it.each([
    ['Priority: Critical', 0],
    ['Priority: High', 100],
    ['Priority: Medium', 200],
    ['Priority: Low', 300],
  ] as const)('maps "%s" to its own band, %i', (spelling, band) => {
    expect(planMirrorPassPriorityFollow(task(), OPEN, [spelling])?.priority).toBe(band);
  });

  it('still plans nothing once the board matches the re-cased label and is pinned', () => {
    expect(
      planMirrorPassPriorityFollow(task({ priority: 100, priorityPinned: true }), OPEN, [
        'Priority: High',
      ]),
    ).toBeNull();
  });

  it('still takes the first priority label in the order gh listed them', () => {
    const finding = planMirrorPassPriorityFollow(task(), OPEN, [
      'Priority: Low',
      'priority: critical',
    ]);

    expect(finding).toMatchObject({ label: 'Priority: Low', priority: 300 });
  });

  it('still never steers on a label that is not one of the four', () => {
    for (const other of [
      'priority:high',
      'priority high',
      'priority-high',
      'priority: higher',
      'priority: urgent',
      'area: dashboard',
    ]) {
      expect(planMirrorPassPriorityFollow(task(), OPEN, [other])).toBeNull();
    }
  });

  it('never reads a label named after an object property as a band', () => {
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      expect(planMirrorPassPriorityFollow(task(), OPEN, [name])).toBeNull();
    }
  });

  it('keeps the batch plan in task order with the re-cased label', () => {
    const plans = planMirrorPassPriorityFollowBatch(
      [task({ id: 'github-1' }), task({ id: 'github-2', priority: 0, priorityPinned: true })],
      new Map<number, MirrorPassIssueState>([
        [1, { number: 1, state: 'open' }],
        [2, { number: 2, state: 'open' }],
      ]),
      new Map<number, readonly string[]>([
        [1, ['Priority: Medium']],
        [2, ['PRIORITY: CRITICAL']],
      ]),
    );

    expect(plans.map((plan) => [plan.task.id, plan.command?.priority ?? null])).toEqual([
      ['github-1', 200],
      ['github-2', null],
    ]);
    expect(plans[0]?.command?.details).toContain('carries "Priority: Medium"');
  });
});

describe('createMirrorPassPriorityFollowExecuteApi × a priority label in any casing (regression, epic 0019 additive-only law)', () => {
  it('pins the board to the band of a maintainer label that reads "Priority: High"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-mirror-pass-priority-casing-'));
    try {
      const dbPath = join(dir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      s.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
        )
        .run('p1', 'p1', 'p1', dir, 100, 100);
      createTask(s, { id: 'github-21', projectId: 'p1', title: 'Not yet steered', createdAt: 100 });
      s.close();

      const calls: Array<readonly string[]> = [];
      const exec: CliExec = vi.fn(async (_bin, args) => {
        calls.push(args);
        if (args[0] === 'api' && args[1] === 'user') {
          return { code: 0, stdout: JSON.stringify({ login: 'octocat' }) };
        }
        if (args[0] === 'repo' && args[1] === 'view') {
          return {
            code: 0,
            stdout: JSON.stringify({
              nameWithOwner: 'octocat/hello-world',
              url: 'https://github.com/octocat/hello-world',
              isPrivate: false,
            }),
          };
        }
        if (args[0] === 'issue' && args[1] === 'view' && args[2] === '21') {
          return {
            code: 0,
            stdout:
              args[4] === 'labels'
                ? JSON.stringify({ labels: [{ name: 'Priority: High' }] })
                : JSON.stringify({ number: 21, state: 'OPEN' }),
          };
        }
        return { code: 1, stdout: '' };
      });

      const report = await createMirrorPassPriorityFollowExecuteApi(dbPath, exec)('p1');

      expect(report?.skippedReason).toBeUndefined();
      expect(report?.outcomes).toHaveLength(1);
      expect(report?.outcomes[0]).toMatchObject({
        applied: true,
        plan: { finding: { taskId: 'github-21', label: 'Priority: High', priority: 100 } },
      });
      // The read is unchanged and the write stays local: no `gh` mutation.
      expect(calls.some((args) => args.includes('edit') || args.includes('comment'))).toBe(false);

      const s2 = openStore(dbPath, { readonly: true });
      const row = s2.db
        .prepare('SELECT priority, priority_pinned FROM tasks WHERE id = ?')
        .get('github-21') as { priority: number | null; priority_pinned: number };
      s2.close();
      expect(row).toEqual({ priority: 100, priority_pinned: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});
