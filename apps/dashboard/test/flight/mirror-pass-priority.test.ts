// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  PRIORITY_LABEL_BAND,
  planMirrorPassPriorityFollow,
  planMirrorPassPriorityFollowCommand,
  planMirrorPassPriorityFollowBatch,
  fetchIssueLabels,
  fetchMirrorPassIssueLabels,
  type MirrorPassPriorityCandidate,
} from '../../src/flight/mirror-pass-priority.js';
import type { MirrorPassIssueState } from '../../src/flight/mirror-pass.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function task(overrides: Partial<MirrorPassPriorityCandidate> = {}): MirrorPassPriorityCandidate {
  return {
    id: 'github-42',
    status: 'queued',
    landedSha: null,
    priority: null,
    priorityPinned: false,
    ...overrides,
  };
}

const OPEN: MirrorPassIssueState = { number: 42, state: 'open' };

describe('PRIORITY_LABEL_BAND', () => {
  it('covers all four taxonomy-seed.ts priority labels', () => {
    expect(Object.keys(PRIORITY_LABEL_BAND).sort()).toEqual([
      'priority: critical',
      'priority: high',
      'priority: low',
      'priority: medium',
    ]);
  });

  it("keys every band by taxonomy-seed.ts's own priority label names, verbatim", () => {
    const seededPriorityNames = HOUSE_TAXONOMY_LABELS.map((label) => label.name)
      .filter((name) => name.startsWith('priority: '))
      .sort();

    expect(Object.keys(PRIORITY_LABEL_BAND).sort()).toEqual(seededPriorityNames);
  });

  it('orders bands so lower is sooner, matching label severity', () => {
    expect(PRIORITY_LABEL_BAND['priority: critical']).toBeLessThan(
      PRIORITY_LABEL_BAND['priority: high']!,
    );
    expect(PRIORITY_LABEL_BAND['priority: high']).toBeLessThan(
      PRIORITY_LABEL_BAND['priority: medium']!,
    );
    expect(PRIORITY_LABEL_BAND['priority: medium']).toBeLessThan(
      PRIORITY_LABEL_BAND['priority: low']!,
    );
  });
});

describe('planMirrorPassPriorityFollow', () => {
  it('plans a set-priority-from-label when the label disagrees with the board', () => {
    const finding = planMirrorPassPriorityFollow(
      task({ priority: null, priorityPinned: false }),
      OPEN,
      ['priority: high'],
    );

    expect(finding).toEqual({
      action: 'set-priority-from-label',
      taskId: 'github-42',
      issueNumber: 42,
      label: 'priority: high',
      priority: 100,
    });
  });

  it('plans a follow when the priority number matches but it was never pinned', () => {
    const finding = planMirrorPassPriorityFollow(
      task({ priority: 100, priorityPinned: false }),
      OPEN,
      ['priority: high'],
    );

    expect(finding).toMatchObject({ action: 'set-priority-from-label', priority: 100 });
  });

  it('returns null when the board already matches the band and is pinned', () => {
    expect(
      planMirrorPassPriorityFollow(task({ priority: 100, priorityPinned: true }), OPEN, [
        'priority: high',
      ]),
    ).toBeNull();
  });

  it('returns null when the issue carries no priority label', () => {
    expect(
      planMirrorPassPriorityFollow(task(), OPEN, ['area: dashboard', 'status: blocked']),
    ).toBeNull();
  });

  it('picks the first matching priority label when more than one is somehow present', () => {
    const finding = planMirrorPassPriorityFollow(task(), OPEN, [
      'priority: low',
      'priority: critical',
    ]);

    expect(finding?.label).toBe('priority: low');
    expect(finding?.priority).toBe(300);
  });

  it('returns null for a task not sourced from a github issue', () => {
    expect(
      planMirrorPassPriorityFollow(task({ id: 'web-abc123' }), OPEN, ['priority: high']),
    ).toBeNull();
  });

  it('returns null rather than guessing when the issue fetch failed', () => {
    expect(planMirrorPassPriorityFollow(task(), undefined, ['priority: high'])).toBeNull();
  });

  it('returns null once the task has already landed (done) — nothing left to steer', () => {
    expect(
      planMirrorPassPriorityFollow(task({ status: 'done' }), OPEN, ['priority: high']),
    ).toBeNull();
  });

  it('re-plans a pinned task when the maintainer re-labels it to another band', () => {
    const finding = planMirrorPassPriorityFollow(
      task({ priority: 100, priorityPinned: true }),
      OPEN,
      ['priority: low'],
    );

    expect(finding).toMatchObject({ label: 'priority: low', priority: 300 });
  });

  it('treats a pinned critical band (priority 0) as already matching, never as unset', () => {
    expect(
      planMirrorPassPriorityFollow(task({ priority: 0, priorityPinned: true }), OPEN, [
        'priority: critical',
      ]),
    ).toBeNull();
  });

  it('matches priority labels exactly — a re-cased or re-spaced label never steers', () => {
    expect(
      planMirrorPassPriorityFollow(task(), OPEN, ['Priority: High', 'priority:high']),
    ).toBeNull();
  });

  it.each(['queued', 'in_progress', 'needs_approval', 'deferred'] as const)(
    'still steers a %s task — only done is exempt',
    (status) => {
      expect(
        planMirrorPassPriorityFollow(task({ status }), OPEN, ['priority: medium']),
      ).toMatchObject({ priority: 200 });
    },
  );
});

describe('planMirrorPassPriorityFollowCommand', () => {
  it('plans a set-task-priority command naming the label and issue', () => {
    const command = planMirrorPassPriorityFollowCommand({
      action: 'set-priority-from-label',
      taskId: 'github-42',
      issueNumber: 42,
      label: 'priority: high',
      priority: 100,
    });

    expect(command).toEqual({
      kind: 'set-task-priority',
      taskId: 'github-42',
      priority: 100,
      details:
        'pinning github-42 to priority 100 — issue #42 carries "priority: high" ' +
        "(law 2: the maintainer's label outranks triage)",
    });
  });
});

describe('planMirrorPassPriorityFollowBatch', () => {
  it('produces a plan with a command only for tasks that actually need to follow', () => {
    const tasks: MirrorPassPriorityCandidate[] = [
      task({ id: 'github-1', priority: null, priorityPinned: false }),
      task({ id: 'github-2', priority: 100, priorityPinned: true }),
      task({ id: 'web-abc', priority: null, priorityPinned: false }),
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [1, { number: 1, state: 'open' }],
      [2, { number: 2, state: 'open' }],
    ]);
    const labelsByIssueNumber = new Map<number, readonly string[]>([
      [1, ['priority: critical']],
      [2, ['priority: high']],
    ]);

    const plans = planMirrorPassPriorityFollowBatch(tasks, issuesByNumber, labelsByIssueNumber);

    expect(plans).toHaveLength(3);
    expect(plans[0]!.finding).toMatchObject({ action: 'set-priority-from-label', priority: 0 });
    expect(plans[0]!.command).not.toBeNull();
    expect(plans[1]!.finding).toBeNull();
    expect(plans[1]!.command).toBeNull();
    expect(plans[2]!.finding).toBeNull();
  });

  it('plans nothing when either lookup misses — no labels fetched, or the issue never resolved', () => {
    const tasks: MirrorPassPriorityCandidate[] = [
      task({ id: 'github-1' }),
      task({ id: 'github-2' }),
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [1, { number: 1, state: 'open' }],
    ]);
    const labelsByIssueNumber = new Map<number, readonly string[]>([[2, ['priority: high']]]);

    const plans = planMirrorPassPriorityFollowBatch(tasks, issuesByNumber, labelsByIssueNumber);

    expect(plans.map((plan) => [plan.finding, plan.command])).toEqual([
      [null, null],
      [null, null],
    ]);
  });
});

function makeExec(
  handler: (bin: string, args: readonly string[]) => { code: number; stdout: string },
): CliExec {
  return vi.fn(async (bin: string, args: readonly string[]) => handler(bin, args));
}

describe('fetchIssueLabels', () => {
  it('parses label names from gh issue view --json labels', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ labels: [{ name: 'priority: high' }, { name: 'area: dashboard' }] }),
    }));

    expect(await fetchIssueLabels(exec, 42)).toEqual(['priority: high', 'area: dashboard']);
    expect(exec).toHaveBeenCalledWith('gh', ['issue', 'view', '42', '--json', 'labels']);
  });

  it('returns an empty array on a non-zero exit', async () => {
    const exec = makeExec(() => ({ code: 1, stdout: '' }));

    expect(await fetchIssueLabels(exec, 42)).toEqual([]);
  });

  it('returns an empty array on unparseable stdout', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: 'not json' }));

    expect(await fetchIssueLabels(exec, 42)).toEqual([]);
  });

  it('returns an empty array when labels is missing or malformed', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: JSON.stringify({ labels: 'nope' }) }));

    expect(await fetchIssueLabels(exec, 42)).toEqual([]);
  });

  it.each(['null', '42', '"priority: high"', '[{"name":"priority: high"}]'])(
    'returns an empty array when stdout parses to a non-issue payload (%s)',
    async (stdout) => {
      const exec = makeExec(() => ({ code: 0, stdout }));

      expect(await fetchIssueLabels(exec, 42)).toEqual([]);
    },
  );

  it('drops label entries that carry no string name instead of failing the whole read', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ labels: [null, { name: 7 }, {}, { name: 'priority: low' }] }),
    }));

    expect(await fetchIssueLabels(exec, 42)).toEqual(['priority: low']);
  });
});

describe('fetchMirrorPassIssueLabels', () => {
  it('fetches labels only for github-sourced, not-done tasks with a resolved issue', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ labels: [{ name: 'priority: medium' }] }),
    }));
    const tasks: MirrorPassPriorityCandidate[] = [
      task({ id: 'github-1', status: 'queued' }),
      task({ id: 'github-2', status: 'done' }),
      task({ id: 'github-3', status: 'in_progress' }),
      task({ id: 'web-abc', status: 'queued' }),
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [1, { number: 1, state: 'open' }],
      [2, { number: 2, state: 'closed' }],
    ]);

    const labels = await fetchMirrorPassIssueLabels(exec, tasks, issuesByNumber);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(labels.get(1)).toEqual(['priority: medium']);
    expect(labels.has(2)).toBe(false);
    expect(labels.has(3)).toBe(false);
  });

  it('fetches a shared issue once even when several tasks point at it', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ labels: [{ name: 'priority: high' }] }),
    }));
    const tasks: MirrorPassPriorityCandidate[] = [
      task({ id: 'github-7', status: 'queued' }),
      task({ id: 'github-7', status: 'in_progress' }),
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [7, { number: 7, state: 'open' }],
    ]);

    const labels = await fetchMirrorPassIssueLabels(exec, tasks, issuesByNumber);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(labels.get(7)).toEqual(['priority: high']);
  });

  it('records an empty label list for an issue whose gh read fails, keeping the others', async () => {
    const exec = makeExec((_bin, args) =>
      args[2] === '1'
        ? { code: 1, stdout: '' }
        : { code: 0, stdout: JSON.stringify({ labels: [{ name: 'priority: critical' }] }) },
    );
    const tasks: MirrorPassPriorityCandidate[] = [
      task({ id: 'github-1' }),
      task({ id: 'github-2' }),
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [1, { number: 1, state: 'open' }],
      [2, { number: 2, state: 'open' }],
    ]);

    const labels = await fetchMirrorPassIssueLabels(exec, tasks, issuesByNumber);

    expect(labels.get(1)).toEqual([]);
    expect(labels.get(2)).toEqual(['priority: critical']);
  });

  it('never shells out when no candidate needs a label read', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: '{}' }));

    const labels = await fetchMirrorPassIssueLabels(
      exec,
      [task({ id: 'web-abc' }), task({ id: 'github-9', status: 'done' })],
      new Map<number, MirrorPassIssueState>([[9, { number: 9, state: 'open' }]]),
    );

    expect(exec).not.toHaveBeenCalled();
    expect(labels.size).toBe(0);
  });
});
