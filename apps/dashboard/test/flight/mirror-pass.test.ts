// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  issueNumberFromTaskId,
  planMirrorPassReconcile,
  planMirrorPassCommands,
  planMirrorPassBatch,
  fetchIssueState,
  fetchMirrorPassIssueStates,
  planMirrorPassLandingNote,
  planMirrorPassLandingNoteCommand,
  planMirrorPassLandingNoteBatch,
  fetchIssueComments,
  fetchMirrorPassIssueComments,
  type MirrorPassTaskCandidate,
  type MirrorPassIssueState,
} from '../../src/flight/mirror-pass.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

describe('issueNumberFromTaskId', () => {
  it('parses the github-<n> task id convention', () => {
    expect(issueNumberFromTaskId('github-42')).toBe(42);
  });

  it('returns null for a non-github task id', () => {
    expect(issueNumberFromTaskId('web-abc123')).toBeNull();
    expect(issueNumberFromTaskId('backlog:3')).toBeNull();
  });
});

function task(overrides: Partial<MirrorPassTaskCandidate> = {}): MirrorPassTaskCandidate {
  return { id: 'github-42', status: 'done', landedSha: null, ...overrides };
}

describe('planMirrorPassReconcile', () => {
  it('plans a close-with-landing-note when the board is done but the issue is still open', () => {
    const finding = planMirrorPassReconcile(task({ status: 'done', landedSha: 'abc1234' }), {
      number: 42,
      state: 'open',
    });

    expect(finding).toMatchObject({
      action: 'close-with-landing-note',
      taskId: 'github-42',
      issueNumber: 42,
      sha: 'abc1234',
    });
    expect(finding?.comment).toContain('abc1234');
  });

  it('closes without a SHA reference when no landing commit was recorded', () => {
    const finding = planMirrorPassReconcile(task({ status: 'done', landedSha: null }), {
      number: 42,
      state: 'open',
    });

    expect(finding).toMatchObject({ action: 'close-with-landing-note', sha: null });
    expect(finding?.comment).not.toContain('Landed in');
  });

  it('plans a reopen-honestly when the issue is closed but the board task is not done', () => {
    const finding = planMirrorPassReconcile(task({ status: 'in_progress' }), {
      number: 42,
      state: 'closed',
    });

    expect(finding).toMatchObject({
      action: 'reopen-honestly',
      taskId: 'github-42',
      issueNumber: 42,
    });
    expect(finding?.comment).toContain('in_progress');
  });

  it('returns null when the board and issue already agree (done + closed)', () => {
    expect(
      planMirrorPassReconcile(task({ status: 'done' }), { number: 42, state: 'closed' }),
    ).toBeNull();
  });

  it('returns null when the board and issue already agree (not done + open)', () => {
    expect(
      planMirrorPassReconcile(task({ status: 'queued' }), { number: 42, state: 'open' }),
    ).toBeNull();
  });

  it('returns null for a task not sourced from a github issue', () => {
    expect(
      planMirrorPassReconcile(task({ id: 'web-abc123', status: 'done' }), {
        number: 42,
        state: 'open',
      }),
    ).toBeNull();
  });

  it('returns null rather than guessing when the issue fetch failed', () => {
    expect(planMirrorPassReconcile(task({ status: 'done' }), undefined)).toBeNull();
  });
});

describe('planMirrorPassCommands', () => {
  it('plans the comment before the close for a close-with-landing-note finding', () => {
    const commands = planMirrorPassCommands({
      action: 'close-with-landing-note',
      taskId: 'github-42',
      issueNumber: 42,
      sha: 'abc1234',
      comment: 'Landed in abc1234 — closing.',
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]).toMatchObject({
      command: 'gh',
      args: ['issue', 'comment', '42', '--body', 'Landed in abc1234 — closing.'],
    });
    expect(commands[1]).toMatchObject({ command: 'gh', args: ['issue', 'close', '42'] });
  });

  it('plans the comment before the reopen for a reopen-honestly finding', () => {
    const commands = planMirrorPassCommands({
      action: 'reopen-honestly',
      taskId: 'github-42',
      issueNumber: 42,
      comment: 'Reopening — not done.',
    });

    expect(commands).toHaveLength(2);
    expect(commands[0]!.args).toEqual([
      'issue',
      'comment',
      '42',
      '--body',
      'Reopening — not done.',
    ]);
    expect(commands[1]).toMatchObject({ command: 'gh', args: ['issue', 'reopen', '42'] });
  });
});

describe('planMirrorPassBatch', () => {
  it('produces a plan with commands only for tasks that actually need reconciling', () => {
    const tasks: MirrorPassTaskCandidate[] = [
      { id: 'github-1', status: 'done', landedSha: 'sha1' },
      { id: 'github-2', status: 'done', landedSha: null },
      { id: 'web-abc', status: 'done', landedSha: null },
    ];
    const issuesByNumber = new Map([
      [1, { number: 1, state: 'open' as const }],
      [2, { number: 2, state: 'closed' as const }],
    ]);

    const plans = planMirrorPassBatch(tasks, issuesByNumber);

    expect(plans).toHaveLength(3);
    expect(plans[0]!.finding).toMatchObject({ action: 'close-with-landing-note' });
    expect(plans[0]!.commands).toHaveLength(2);
    expect(plans[1]!.finding).toBeNull();
    expect(plans[1]!.commands).toHaveLength(0);
    expect(plans[2]!.finding).toBeNull();
  });
});

function makeExec(
  handler: (bin: string, args: readonly string[]) => { code: number; stdout: string },
): CliExec {
  return vi.fn(async (bin: string, args: readonly string[]) => handler(bin, args));
}

describe('fetchIssueState', () => {
  it('parses an open issue', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ number: 42, state: 'OPEN' }),
    }));

    expect(await fetchIssueState(exec, 42)).toEqual({ number: 42, state: 'open' });
    expect(exec).toHaveBeenCalledWith('gh', ['issue', 'view', '42', '--json', 'number,state']);
  });

  it('parses a closed issue', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ number: 7, state: 'CLOSED' }),
    }));

    expect(await fetchIssueState(exec, 7)).toEqual({ number: 7, state: 'closed' });
  });

  it('returns null on a non-zero exit', async () => {
    const exec = makeExec(() => ({ code: 1, stdout: '' }));

    expect(await fetchIssueState(exec, 42)).toBeNull();
  });

  it('returns null on unparseable stdout', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: 'not json' }));

    expect(await fetchIssueState(exec, 42)).toBeNull();
  });

  it('returns null on a malformed state value', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ number: 42, state: 'WAT' }),
    }));

    expect(await fetchIssueState(exec, 42)).toBeNull();
  });
});

describe('fetchMirrorPassIssueStates', () => {
  it('fetches only the distinct github-sourced issue numbers, skipping other sources', async () => {
    const exec = makeExec((_bin, args) => {
      const n = Number(args[2]);
      return { code: 0, stdout: JSON.stringify({ number: n, state: n === 1 ? 'OPEN' : 'CLOSED' }) };
    });
    const tasks: MirrorPassTaskCandidate[] = [
      { id: 'github-1', status: 'done', landedSha: null },
      { id: 'github-1', status: 'done', landedSha: null },
      { id: 'github-2', status: 'queued', landedSha: null },
      { id: 'web-abc', status: 'done', landedSha: null },
    ];

    const states = await fetchMirrorPassIssueStates(exec, tasks);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(states.get(1)).toEqual({ number: 1, state: 'open' });
    expect(states.get(2)).toEqual({ number: 2, state: 'closed' });
  });

  it('omits an issue whose fetch failed rather than inserting a placeholder', async () => {
    const exec = makeExec(() => ({ code: 1, stdout: '' }));
    const tasks: MirrorPassTaskCandidate[] = [{ id: 'github-9', status: 'done', landedSha: null }];

    const states = await fetchMirrorPassIssueStates(exec, tasks);

    expect(states.has(9)).toBe(false);
  });
});

describe('planMirrorPassLandingNote', () => {
  const closed: MirrorPassIssueState = { number: 42, state: 'closed' };

  it('plans a note when the issue is closed, the task landed, and no comment mentions the sha', () => {
    const finding = planMirrorPassLandingNote(
      task({ status: 'done', landedSha: 'abc1234' }),
      closed,
      ['unrelated comment', 'another one'],
    );

    expect(finding).toMatchObject({
      action: 'note-landing-sha',
      taskId: 'github-42',
      issueNumber: 42,
      sha: 'abc1234',
    });
    expect(finding?.comment).toContain('abc1234');
  });

  it('returns null when a comment already mentions the landing sha', () => {
    const finding = planMirrorPassLandingNote(
      task({ status: 'done', landedSha: 'abc1234' }),
      closed,
      ['Landed in abc1234 — closing.'],
    );

    expect(finding).toBeNull();
  });

  it('returns null when the issue is still open (bundled into the close note instead)', () => {
    const finding = planMirrorPassLandingNote(
      task({ status: 'done', landedSha: 'abc1234' }),
      { number: 42, state: 'open' },
      [],
    );

    expect(finding).toBeNull();
  });

  it('returns null when the task has no landing sha', () => {
    expect(
      planMirrorPassLandingNote(task({ status: 'done', landedSha: null }), closed, []),
    ).toBeNull();
  });

  it('returns null when the task is not done', () => {
    expect(
      planMirrorPassLandingNote(task({ status: 'in_progress', landedSha: 'abc1234' }), closed, []),
    ).toBeNull();
  });

  it('returns null for a task not sourced from a github issue', () => {
    expect(
      planMirrorPassLandingNote(
        task({ id: 'web-abc123', status: 'done', landedSha: 'abc1234' }),
        closed,
        [],
      ),
    ).toBeNull();
  });

  it('returns null rather than guessing when the issue fetch failed', () => {
    expect(
      planMirrorPassLandingNote(task({ status: 'done', landedSha: 'abc1234' }), undefined, []),
    ).toBeNull();
  });
});

describe('planMirrorPassLandingNoteCommand', () => {
  it('plans a single comment call with no state change', () => {
    const command = planMirrorPassLandingNoteCommand({
      action: 'note-landing-sha',
      taskId: 'github-42',
      issueNumber: 42,
      sha: 'abc1234',
      comment: 'Landed in abc1234 — noting for the record.',
    });

    expect(command).toMatchObject({
      command: 'gh',
      args: ['issue', 'comment', '42', '--body', 'Landed in abc1234 — noting for the record.'],
    });
  });
});

describe('planMirrorPassLandingNoteBatch', () => {
  it('produces a plan with a command only for tasks that need a note', () => {
    const tasks: MirrorPassTaskCandidate[] = [
      { id: 'github-1', status: 'done', landedSha: 'sha1' },
      { id: 'github-2', status: 'done', landedSha: 'sha2' },
      { id: 'github-3', status: 'done', landedSha: null },
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [1, { number: 1, state: 'closed' }],
      [2, { number: 2, state: 'closed' }],
      [3, { number: 3, state: 'closed' }],
    ]);
    const commentsByIssueNumber = new Map<number, readonly string[]>([
      [1, []],
      [2, ['Landed in sha2 — closing.']],
    ]);

    const plans = planMirrorPassLandingNoteBatch(tasks, issuesByNumber, commentsByIssueNumber);

    expect(plans).toHaveLength(3);
    expect(plans[0]!.finding).toMatchObject({ action: 'note-landing-sha', sha: 'sha1' });
    expect(plans[0]!.command).not.toBeNull();
    expect(plans[1]!.finding).toBeNull();
    expect(plans[1]!.command).toBeNull();
    expect(plans[2]!.finding).toBeNull();
  });
});

describe('fetchIssueComments', () => {
  it('parses comment bodies from gh issue view --json comments', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ comments: [{ body: 'first' }, { body: 'second' }] }),
    }));

    expect(await fetchIssueComments(exec, 42)).toEqual(['first', 'second']);
    expect(exec).toHaveBeenCalledWith('gh', ['issue', 'view', '42', '--json', 'comments']);
  });

  it('returns an empty array on a non-zero exit', async () => {
    const exec = makeExec(() => ({ code: 1, stdout: '' }));

    expect(await fetchIssueComments(exec, 42)).toEqual([]);
  });

  it('returns an empty array on unparseable stdout', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: 'not json' }));

    expect(await fetchIssueComments(exec, 42)).toEqual([]);
  });

  it('returns an empty array when comments is missing or malformed', async () => {
    const exec = makeExec(() => ({ code: 0, stdout: JSON.stringify({ comments: 'nope' }) }));

    expect(await fetchIssueComments(exec, 42)).toEqual([]);
  });

  it('skips entries with a non-string or missing body', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ comments: [{ body: 'kept' }, { body: 7 }, {}] }),
    }));

    expect(await fetchIssueComments(exec, 42)).toEqual(['kept']);
  });
});

describe('fetchMirrorPassIssueComments', () => {
  it('fetches comments only for closed issues whose task landed', async () => {
    const exec = makeExec(() => ({
      code: 0,
      stdout: JSON.stringify({ comments: [{ body: 'noted' }] }),
    }));
    const tasks: MirrorPassTaskCandidate[] = [
      { id: 'github-1', status: 'done', landedSha: 'sha1' },
      { id: 'github-2', status: 'done', landedSha: null },
      { id: 'github-3', status: 'in_progress', landedSha: 'sha3' },
      { id: 'web-abc', status: 'done', landedSha: 'sha4' },
    ];
    const issuesByNumber = new Map<number, MirrorPassIssueState>([
      [1, { number: 1, state: 'closed' }],
      [2, { number: 2, state: 'closed' }],
      [3, { number: 3, state: 'closed' }],
    ]);

    const comments = await fetchMirrorPassIssueComments(exec, tasks, issuesByNumber);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(comments.get(1)).toEqual(['noted']);
    expect(comments.has(2)).toBe(false);
    expect(comments.has(3)).toBe(false);
  });
});
