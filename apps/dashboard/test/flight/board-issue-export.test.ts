// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  EXPORT_DUPLICATE_THRESHOLD,
  exportMarker,
  parseExportMarker,
  planBoardIssueExport,
  planBoardIssueExportCommands,
  renderExportIssueBody,
  type BoardExportIssue,
  type BoardExportTask,
  type BoardIssueExportDecision,
} from '../../src/flight/board-issue-export.js';
import { HELP_WANTED_LABEL } from '../../src/flight/help-wanted-items.js';

function task(overrides: Partial<BoardExportTask> = {}): BoardExportTask {
  return {
    id: 'ap-abc123-1',
    title: 'Add keyboard shortcuts to the pipeline section',
    body: 'Arrow keys should move between stages.',
    status: 'queued',
    shareable: true,
    ...overrides,
  };
}

function issue(overrides: Partial<BoardExportIssue> = {}): BoardExportIssue {
  return {
    number: 7,
    title: 'Unrelated crash on startup when the store is empty',
    body: 'Stack trace attached.',
    state: 'open',
    ...overrides,
  };
}

function onlyDecision(decisions: readonly BoardIssueExportDecision[]): BoardIssueExportDecision {
  expect(decisions).toHaveLength(1);
  return decisions[0] as BoardIssueExportDecision;
}

describe('exportMarker / parseExportMarker', () => {
  it('round-trips a board task id through the hidden body marker', () => {
    expect(parseExportMarker(`intro\n${exportMarker('web-mtq0rtub-jxpptv')}\n`)).toBe(
      'web-mtq0rtub-jxpptv',
    );
  });

  it('returns null for a body with no marker', () => {
    expect(parseExportMarker('A human-filed issue with no marker at all.')).toBeNull();
  });

  it('keeps the marker an HTML comment so GitHub never renders it', () => {
    expect(exportMarker('ap-abc123-1')).toMatch(/^<!-- .* -->$/);
  });

  it('reads only a marker on the final line — marker-shaped text quoted mid-body names nothing', () => {
    expect(parseExportMarker(`see ${exportMarker('ap-y')} above\n\nmore prose`)).toBeNull();
    expect(parseExportMarker(`quoted ${exportMarker('ap-y')}\n${exportMarker('ap-x')}\r\n`)).toBe(
      'ap-x',
    );
  });
});

describe('renderExportIssueBody', () => {
  it('carries the task detail, the task id, and the marker', () => {
    const body = renderExportIssueBody(task());
    expect(body).toContain('Arrow keys should move between stages.');
    expect(body).toContain('`ap-abc123-1`');
    expect(parseExportMarker(body)).toBe('ap-abc123-1');
  });

  it('says so plainly when the board recorded no detail, instead of posting an empty body', () => {
    const body = renderExportIssueBody(task({ body: '   ' }));
    expect(body).toMatch(/no further detail/i);
    expect(parseExportMarker(body)).toBe('ap-abc123-1');
  });
});

describe('planBoardIssueExport', () => {
  it('plans nothing at all for a task the operator never marked shareable', () => {
    expect(planBoardIssueExport([task({ shareable: false })], [])).toEqual([]);
  });

  it('plans a create for a shareable queued task with no overlapping open issue', () => {
    const decision = onlyDecision(planBoardIssueExport([task()], [issue()]));
    expect(decision).toMatchObject({
      action: 'create',
      taskId: 'ap-abc123-1',
      title: 'Add keyboard shortcuts to the pipeline section',
    });
    if (decision.action !== 'create') throw new Error('expected create');
    expect(parseExportMarker(decision.body)).toBe('ap-abc123-1');
  });

  it('trims the task title it files', () => {
    const decision = onlyDecision(
      planBoardIssueExport([task({ title: '  Add keyboard shortcuts  ' })], []),
    );
    expect(decision).toMatchObject({ action: 'create', title: 'Add keyboard shortcuts' });
  });

  it.each(['in_progress', 'done', 'needs_approval', 'deferred'] as const)(
    'skips a shareable task whose status is %s — only queued work is open for outside help',
    (status) => {
      const decision = onlyDecision(planBoardIssueExport([task({ status })], []));
      expect(decision.action).toBe('skip');
      expect(decision.reasoning).toContain(status);
    },
  );

  it('skips a task that came FROM GitHub (github-<n>) — it already is issue #n', () => {
    const decision = onlyDecision(planBoardIssueExport([task({ id: 'github-42' })], []));
    expect(decision.action).toBe('skip');
    expect(decision.reasoning).toContain('#42');
  });

  it('skips a task whose title is blank — there is nothing to file', () => {
    const decision = onlyDecision(planBoardIssueExport([task({ title: '   ' })], []));
    expect(decision.action).toBe('skip');
  });

  it('skips a task whose id could break out of the HTML-comment marker', () => {
    const decision = onlyDecision(planBoardIssueExport([task({ id: 'x --> <script>' })], []));
    expect(decision.action).toBe('skip');
  });

  it('plans an update when the exported issue (found by marker) drifted from the board', () => {
    const exported = issue({
      number: 12,
      title: 'Add keyboard shortcuts',
      body: renderExportIssueBody(task({ body: 'old detail' })),
    });
    const decision = onlyDecision(planBoardIssueExport([task()], [exported]));
    expect(decision).toMatchObject({
      action: 'update',
      issueNumber: 12,
      title: 'Add keyboard shortcuts to the pipeline section',
    });
    if (decision.action !== 'update') throw new Error('expected update');
    expect(decision.body).toBe(renderExportIssueBody(task()));
  });

  it('skips an exported issue already in sync, even through CRLF line endings — re-runs are idempotent', () => {
    const current = task();
    const exported = issue({
      number: 12,
      title: current.title,
      body: renderExportIssueBody(current).replace(/\n/g, '\r\n') + '\r\n',
    });
    const decision = onlyDecision(planBoardIssueExport([current], [exported]));
    expect(decision.action).toBe('skip');
    expect(decision.reasoning).toContain('#12');
  });

  it('never re-files a task whose exported issue was closed on GitHub', () => {
    const exported = issue({ number: 12, state: 'closed', body: renderExportIssueBody(task()) });
    const decision = onlyDecision(planBoardIssueExport([task()], [exported]));
    expect(decision.action).toBe('skip');
    expect(decision.reasoning).toContain('#12');
    expect(decision.reasoning).toMatch(/closed/);
  });

  it("never edits another task's issue when a task body quotes that task's marker", () => {
    const quoting = task({ id: 'ap-x', body: `Follow-up to ${exportMarker('ap-y')} work.` });
    const other = task({ id: 'ap-y', title: 'Document the release ritual end to end' });
    const quotingIssue = issue({
      number: 50,
      title: quoting.title,
      body: renderExportIssueBody(quoting),
    });
    const decisions = planBoardIssueExport([quoting, other], [quotingIssue]);
    expect(decisions).toEqual([
      expect.objectContaining({ taskId: 'ap-x', action: 'skip' }),
      expect.objectContaining({ taskId: 'ap-y', action: 'create' }),
    ]);
  });

  it('prefers an open export over a closed one carrying the same marker', () => {
    const current = task();
    const closedCopy = issue({ number: 11, state: 'closed', body: renderExportIssueBody(current) });
    const openExport = issue({
      number: 12,
      title: 'Stale title',
      body: renderExportIssueBody(current),
    });
    const decision = onlyDecision(planBoardIssueExport([current], [closedCopy, openExport]));
    expect(decision).toMatchObject({ action: 'update', issueNumber: 12 });
  });

  it('marks a duplicate — never a create or an edit — when an open issue title overlaps by word-Jaccard', () => {
    const human = issue({
      number: 30,
      title: 'Keyboard shortcuts for the pipeline section',
      body: 'Filed by a human, no marker.',
    });
    const decision = onlyDecision(planBoardIssueExport([task()], [human]));
    expect(decision).toMatchObject({
      action: 'duplicate',
      match: { kind: 'issue', issueNumber: 30 },
    });
    if (decision.action !== 'duplicate') throw new Error('expected duplicate');
    expect(decision.score).toBeGreaterThanOrEqual(EXPORT_DUPLICATE_THRESHOLD);
    expect(planBoardIssueExportCommands(decision)).toEqual([]);
  });

  it('does not dedup against a CLOSED issue — only open ones say "already tracked"', () => {
    const closed = issue({
      number: 30,
      state: 'closed',
      title: 'Keyboard shortcuts for the pipeline section',
    });
    expect(onlyDecision(planBoardIssueExport([task()], [closed])).action).toBe('create');
  });

  it('points a duplicate at the strongest-overlapping open issue', () => {
    const weaker = issue({ number: 30, title: 'Keyboard shortcuts for the pipeline' });
    const stronger = issue({ number: 31, title: 'Add keyboard shortcuts to the pipeline section' });
    const decision = onlyDecision(planBoardIssueExport([task()], [weaker, stronger]));
    expect(decision).toMatchObject({ action: 'duplicate', match: { issueNumber: 31 } });
  });

  it('honors a caller-supplied threshold', () => {
    const near = issue({ number: 30, title: 'Keyboard shortcuts for the pipeline section' });
    expect(onlyDecision(planBoardIssueExport([task()], [near], 1)).action).toBe('create');
  });

  it('dedups within one batch: a later near-identical task duplicates the earlier planned create', () => {
    const first = task({ id: 'ap-abc123-1' });
    const second = task({ id: 'ap-abc123-2', title: 'Add keyboard shortcuts to pipeline section' });
    const decisions = planBoardIssueExport([first, second], []);
    expect(decisions.map((d) => d.action)).toEqual(['create', 'duplicate']);
    expect(decisions[1]).toMatchObject({ match: { kind: 'task', taskId: 'ap-abc123-1' } });
  });

  it('keeps input order across a mixed batch, filtering only non-shareable tasks', () => {
    const decisions = planBoardIssueExport(
      [
        task({ id: 'a-1', title: 'Document the release ritual end to end' }),
        task({ id: 'a-2', shareable: false }),
        task({ id: 'a-3', status: 'done', title: 'Something finished' }),
      ],
      [],
    );
    expect(decisions.map((d) => [d.taskId, d.action])).toEqual([
      ['a-1', 'create'],
      ['a-3', 'skip'],
    ]);
  });
});

describe('planBoardIssueExportCommands', () => {
  it('files a create as one gh issue create carrying the help wanted label', () => {
    const decision = onlyDecision(planBoardIssueExport([task()], []));
    if (decision.action !== 'create') throw new Error('expected create');
    const commands = planBoardIssueExportCommands(decision);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      command: 'gh',
      args: [
        'issue',
        'create',
        '--title',
        decision.title,
        '--body',
        decision.body,
        '--label',
        HELP_WANTED_LABEL,
      ],
    });
    expect(commands[0]?.details).toContain('ap-abc123-1');
  });

  it('applies an update as one gh issue edit on the exported issue number', () => {
    const exported = issue({ number: 12, body: renderExportIssueBody(task({ body: 'old' })) });
    const decision = onlyDecision(planBoardIssueExport([task()], [exported]));
    if (decision.action !== 'update') throw new Error('expected update');
    expect(planBoardIssueExportCommands(decision)).toEqual([
      {
        command: 'gh',
        args: ['issue', 'edit', '12', '--title', decision.title, '--body', decision.body],
        details: expect.stringContaining('#12'),
      },
    ]);
  });

  it('plans no command for a skip', () => {
    const decision = onlyDecision(planBoardIssueExport([task({ status: 'done' })], []));
    expect(planBoardIssueExportCommands(decision)).toEqual([]);
  });
});
