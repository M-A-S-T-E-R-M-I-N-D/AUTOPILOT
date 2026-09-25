// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  planBoardIssueExport,
  planBoardIssueExportCommands,
  planBoardIssueExportBatch,
  type ShareableBoardTask,
  type OpenGithubIssue,
} from '../../src/flight/board-issue-export.js';

function task(overrides: Partial<ShareableBoardTask> = {}): ShareableBoardTask {
  return {
    id: 'web-abc123',
    title: 'Dashboard fly bar overshoots its own lane plan',
    body: 'The fly bar shows 6/2 firings for a 2-firing lane.',
    ...overrides,
  };
}

describe('planBoardIssueExport', () => {
  it('plans create when the task matches no open issue', () => {
    const t = task();
    const openIssues: readonly OpenGithubIssue[] = [
      { number: 1, title: 'Unrelated: dark mode contrast on the project page' },
    ];

    const decision = planBoardIssueExport(t, openIssues);

    expect(decision.decision).toBe('create');
  });

  it('plans create when there are no open issues at all', () => {
    const decision = planBoardIssueExport(task(), []);

    expect(decision.decision).toBe('create');
  });

  it('plans update when the task title overlaps an open issue past the threshold', () => {
    const t = task({ title: 'Fly bar overshoots its own lane plan' });
    const openIssues: readonly OpenGithubIssue[] = [
      { number: 42, title: 'Fly bar overshoots its own lane plan' },
    ];

    const decision = planBoardIssueExport(t, openIssues);

    expect(decision.decision).toBe('update');
    if (decision.decision === 'update') {
      expect(decision.issueNumber).toBe(42);
      expect(decision.score).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('links to the strongest match when multiple open issues clear the threshold', () => {
    const t = task({ title: 'Fly bar overshoots its own lane plan' });
    const openIssues: readonly OpenGithubIssue[] = [
      { number: 1, title: 'Fly bar overshoots' },
      { number: 2, title: 'Fly bar overshoots its own lane plan' },
    ];

    const decision = planBoardIssueExport(t, openIssues);

    expect(decision.decision).toBe('update');
    if (decision.decision === 'update') {
      expect(decision.issueNumber).toBe(2);
    }
  });

  it('plans skip when the task was already exported, even if a matching issue is open', () => {
    const t = task({ exportedIssueNumber: 7 });
    const openIssues: readonly OpenGithubIssue[] = [
      { number: 7, title: 'Dashboard fly bar overshoots its own lane plan' },
    ];

    const decision = planBoardIssueExport(t, openIssues);

    expect(decision).toEqual({
      decision: 'skip',
      reasoning: expect.stringContaining('#7') as unknown as string,
    });
  });

  it('respects a custom threshold', () => {
    const t = task({ title: 'Fly bar overshoots lane plan' });
    const openIssues: readonly OpenGithubIssue[] = [{ number: 5, title: 'Fly bar overshoots' }];

    const strict = planBoardIssueExport(t, openIssues, 0.9);
    const loose = planBoardIssueExport(t, openIssues, 0.1);

    expect(strict.decision).toBe('create');
    expect(loose.decision).toBe('update');
  });
});

describe('planBoardIssueExportCommands', () => {
  it('plans a gh issue create with the task title and body', () => {
    const t = task();

    const commands = planBoardIssueExportCommands(t, { decision: 'create', reasoning: 'x' });

    expect(commands).toEqual([
      {
        command: 'gh',
        args: ['issue', 'create', '--title', t.title, '--body', t.body],
        details: expect.stringContaining(t.title) as unknown as string,
      },
    ]);
  });

  it('falls back to an empty body when the task has none', () => {
    const t: ShareableBoardTask = { id: 'web-no-body', title: 'A task with no body at all' };

    const commands = planBoardIssueExportCommands(t, { decision: 'create', reasoning: 'x' });

    expect(commands[0]?.args).toEqual(['issue', 'create', '--title', t.title, '--body', '']);
  });

  it('plans a linking comment, never an edit, for an update decision', () => {
    const t = task();

    const commands = planBoardIssueExportCommands(t, {
      decision: 'update',
      issueNumber: 9,
      score: 0.8,
      reasoning: 'x',
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.command).toBe('gh');
    expect(commands[0]?.args.slice(0, 3)).toEqual(['issue', 'comment', '9']);
    expect(commands[0]?.args).toContain('--body');
    expect(commands[0]?.args.join(' ')).toContain(t.id);
  });

  it('plans nothing for a skip decision', () => {
    const commands = planBoardIssueExportCommands(task(), {
      decision: 'skip',
      reasoning: 'x',
    });

    expect(commands).toEqual([]);
  });
});

describe('planBoardIssueExportBatch', () => {
  it('plans every task independently against the same open-issue set', () => {
    const tasks: readonly ShareableBoardTask[] = [
      task({ id: 'a', title: 'Alpha task nobody has filed yet' }),
      task({ id: 'b', title: 'Matches an existing issue title' }),
    ];
    const openIssues: readonly OpenGithubIssue[] = [
      { number: 3, title: 'Matches an existing issue title' },
    ];

    const plans = planBoardIssueExportBatch(tasks, openIssues);

    expect(plans).toHaveLength(2);
    expect(plans[0]?.decision.decision).toBe('create');
    expect(plans[1]?.decision.decision).toBe('update');
    expect(plans[0]?.commands).toHaveLength(1);
    expect(plans[1]?.commands).toHaveLength(1);
  });

  it('returns an empty plan list for an empty task batch', () => {
    expect(planBoardIssueExportBatch([], [{ number: 1, title: 'anything' }])).toEqual([]);
  });
});
