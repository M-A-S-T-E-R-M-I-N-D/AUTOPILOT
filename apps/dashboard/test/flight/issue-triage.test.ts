// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  classifyIssueDimension,
  planIssueTriage,
  planIssueTriageCommands,
  planIssueTriageBatch,
  planIssueTriageTask,
  applyIssueTriageTasks,
  issueTaskId,
  fetchOpenIssues,
  executeIssueTriageCommands,
  runIssueTriageRitual,
} from '../../src/flight/issue-triage.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function project(s: Store, id: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, '/tmp/' + id, 100, 100);
}

function tasks(
  s: Store,
  projectId: string,
): { id: string; title: string; status: string; source: string; dimension: string | null }[] {
  return s.db
    .prepare(
      'SELECT id, title, status, source, dimension FROM tasks WHERE project_id = ? ORDER BY id',
    )
    .all(projectId) as {
    id: string;
    title: string;
    status: string;
    source: string;
    dimension: string | null;
  }[];
}

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

describe('classifyIssueDimension', () => {
  it('picks the dimension whose keywords appear most in the text', () => {
    expect(classifyIssueDimension('Screen reader users cannot reach the aria-labeled button')).toBe(
      'accessibility',
    );
    expect(classifyIssueDimension('Auth bypass lets an attacker inject a forged token')).toBe(
      'cybersecurity',
    );
  });

  it('falls back to information when no keyword matches', () => {
    expect(classifyIssueDimension('The sky is blue today')).toBe('information');
  });

  it('breaks ties by DIMENSIONS declared order', () => {
    // 'ux' (index 2) and 'data' (index 6) each score exactly one keyword hit;
    // 'ux' must win since it is declared first.
    expect(classifyIssueDimension('ux issue touching the schema')).toBe('ux');
  });
});

describe('planIssueTriage', () => {
  it('flags a duplicate when the issue title strongly overlaps an open board task', () => {
    const decision = planIssueTriage(
      { number: 42, title: 'Dashboard crashes when opening the project page', body: '' },
      [{ id: 'web-abc123', title: 'Dashboard crashes when opening the project page' }],
      [],
    );

    expect(decision).toMatchObject({
      decision: 'duplicate',
      matchedId: 'web-abc123',
      score: 1,
    });
    expect(decision.reasoning).toContain('#42');
  });

  it('flags a duplicate against a backlog title, not only board tasks', () => {
    const decision = planIssueTriage(
      { number: 7, title: 'Add reuse lint as an optional CI job alongside SPDX gate', body: '' },
      [],
      ['Add reuse lint as an optional CI job alongside SPDX gate'],
    );

    expect(decision.decision).toBe('duplicate');
    if (decision.decision === 'duplicate') {
      expect(decision.matchedId).toBe('backlog:0');
    }
  });

  it('accepts and labels a genuinely new issue by its strongest dimension signal', () => {
    const decision = planIssueTriage(
      {
        number: 9,
        title: 'Keyboard nav is broken in the fleet table',
        body: 'Screen reader users are stuck',
      },
      [{ id: 'web-other', title: 'Unrelated task about release tagging' }],
      ['Unrelated backlog line about billing'],
    );

    expect(decision).toMatchObject({ decision: 'accept', dimension: 'accessibility' });
    expect(decision.reasoning).toContain('#9');
    expect(decision.reasoning).toContain('pool: accessibility');
  });

  it('respects a custom threshold', () => {
    const weaklyRelated = planIssueTriage(
      { number: 1, title: 'Dashboard project page sometimes crashes', body: '' },
      [{ id: 'web-x', title: 'Dashboard crashes when opening the project page' }],
      [],
      0.95,
    );

    expect(weaklyRelated.decision).toBe('accept');
  });

  it('skips an issue already carrying a pool label from a previous pass', () => {
    const decision = planIssueTriage(
      {
        number: 9,
        title: 'Keyboard nav is broken in the fleet table',
        body: '',
        labels: ['pool: accessibility'],
      },
      [],
      [],
    );

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('pool: accessibility');
  });

  it('skips an issue already labeled duplicate by a previous pass', () => {
    const decision = planIssueTriage(
      { number: 3, title: 'nav broken', body: '', labels: ['duplicate'] },
      [],
      [],
    );

    expect(decision.decision).toBe('skip');
  });

  it('skips an issue whose own board task already exists instead of calling it a duplicate of itself', () => {
    // Regression: after a first pass accepts #9 (creating task github-9 with
    // the same title), a second pass used to score the still-open issue
    // against its own task and answer "duplicate" — every re-run posted
    // another bogus comment on the issue's own thread.
    const decision = planIssueTriage(
      { number: 9, title: 'Keyboard nav is broken in the fleet table', body: '' },
      [{ id: 'github-9', title: 'Keyboard nav is broken in the fleet table' }],
      [],
    );

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('github-9');
  });
});

describe('planIssueTriageCommands', () => {
  const issue = { number: 9, title: 'Keyboard nav is broken in the fleet table', body: '' };

  it('plans an add-label edit followed by a reasoning comment for an accepted issue', () => {
    const decision = planIssueTriage(issue, [], []);

    expect(planIssueTriageCommands(issue, decision)).toEqual([
      {
        command: 'gh',
        args: ['issue', 'edit', '9', '--add-label', 'pool: accessibility'],
        details: 'labeling #9 "pool: accessibility" per its classified dimension',
      },
      {
        command: 'gh',
        args: ['issue', 'comment', '9', '--body', decision.reasoning],
        details: "posting KEEPER's triage reasoning as a comment on #9",
      },
    ]);
  });

  it('plans a duplicate label edit followed by a reasoning comment for a duplicate', () => {
    const decision = planIssueTriage(issue, [{ id: 'web-abc', title: issue.title }], []);

    expect(decision.decision).toBe('duplicate');
    expect(planIssueTriageCommands(issue, decision)).toEqual([
      {
        command: 'gh',
        args: ['issue', 'edit', '9', '--add-label', 'duplicate'],
        details: 'labeling #9 "duplicate" so later KEEPER passes skip it',
      },
      {
        command: 'gh',
        args: ['issue', 'comment', '9', '--body', decision.reasoning],
        details: "posting KEEPER's triage reasoning as a comment on #9",
      },
    ]);
  });

  it('plans no commands at all for a skip — an already-triaged issue is left untouched', () => {
    const skipIssue = { ...issue, labels: ['pool: accessibility'] };
    const decision = planIssueTriage(skipIssue, [], []);

    expect(decision.decision).toBe('skip');
    expect(planIssueTriageCommands(skipIssue, decision)).toEqual([]);
  });
});

describe('planIssueTriageBatch', () => {
  it('plans a decision and its commands for every issue, independently', () => {
    const issues = [
      { number: 1, title: 'Dashboard crashes when opening the project page', body: '' },
      { number: 2, title: 'Keyboard nav is broken in the fleet table', body: 'aria issue' },
    ];
    const boardTasks = [
      { id: 'web-abc', title: 'Dashboard crashes when opening the project page' },
    ];

    const plans = planIssueTriageBatch(issues, boardTasks, []);

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      issue: issues[0],
      decision: { decision: 'duplicate', matchedId: 'web-abc' },
    });
    expect(plans[0]?.commands).toEqual(planIssueTriageCommands(issues[0]!, plans[0]!.decision));
    expect(plans[1]).toMatchObject({
      issue: issues[1],
      decision: { decision: 'accept', dimension: 'accessibility' },
    });
    expect(plans[1]?.commands).toEqual(planIssueTriageCommands(issues[1]!, plans[1]!.decision));
  });

  it('does not let one issue in the batch dedup against another', () => {
    const issues = [
      { number: 1, title: 'Add reuse lint as an optional CI job', body: '' },
      { number: 2, title: 'Add reuse lint as an optional CI job', body: '' },
    ];

    const plans = planIssueTriageBatch(issues, [], []);

    expect(plans[0]?.decision.decision).toBe('accept');
    expect(plans[1]?.decision.decision).toBe('accept');
  });

  it('returns an empty array for an empty issue batch', () => {
    expect(planIssueTriageBatch([], [{ id: 'x', title: 'y' }], ['z'])).toEqual([]);
  });

  it('respects a custom threshold across the whole batch', () => {
    const issues = [{ number: 1, title: 'Dashboard project page sometimes crashes', body: '' }];
    const boardTasks = [{ id: 'web-x', title: 'Dashboard crashes when opening the project page' }];

    const plans = planIssueTriageBatch(issues, boardTasks, [], 0.95);

    expect(plans[0]?.decision.decision).toBe('accept');
  });
});

describe('applyIssueTriageTasks', () => {
  it('creates a queued, github-sourced task for each accepted plan, skipping duplicates', () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      const issues = [
        { number: 9, title: 'Keyboard nav is broken in the fleet table', body: 'aria issue' },
        { number: 10, title: 'Already tracked dashboard crash', body: '' },
      ];
      const boardTasks = [{ id: 'web-abc', title: 'Already tracked dashboard crash' }];
      const plans = planIssueTriageBatch(issues, boardTasks, []);

      const created = applyIssueTriageTasks(s, 'p1', plans, () => 100);

      expect(created).toBe(1);
      const rows = tasks(s, 'p1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'github-9',
        title: 'Keyboard nav is broken in the fleet table',
        status: 'queued',
        source: 'github',
        dimension: 'accessibility',
      });
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('never creates a second task for the same issue on a repeat run', () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-repeat-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      const issues = [{ number: 9, title: 'Keyboard nav is broken in the fleet table', body: '' }];
      const plans = planIssueTriageBatch(issues, [], []);

      applyIssueTriageTasks(s, 'p1', plans, () => 100);
      const createdAgain = applyIssueTriageTasks(s, 'p1', plans, () => 200);

      expect(createdAgain).toBe(0);
      expect(tasks(s, 'p1')).toHaveLength(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('returns 0 for an empty plan list', () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-empty-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      expect(applyIssueTriageTasks(s, 'p1', [], () => 100)).toBe(0);
      expect(tasks(s, 'p1')).toHaveLength(0);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });
});

describe('issueTaskId', () => {
  it('is content-addressed by issue number, not random', () => {
    expect(issueTaskId(42)).toBe('github-42');
    expect(issueTaskId(42)).toBe(issueTaskId(42));
  });
});

describe('planIssueTriageTask', () => {
  const issue = {
    number: 9,
    title: 'Keyboard nav is broken in the fleet table',
    body: 'aria issue',
  };

  it('turns an accepted decision into a source: github CreateTaskInput', () => {
    const decision = planIssueTriage(issue, [], []);

    expect(planIssueTriageTask(issue, decision, 'proj-1', 1000)).toEqual({
      id: 'github-9',
      projectId: 'proj-1',
      title: issue.title,
      dimension: 'accessibility',
      source: 'github',
      createdAt: 1000,
    });
  });

  it('returns null for a duplicate decision — it is not tracked as its own task', () => {
    const decision = planIssueTriage(issue, [{ id: 'web-abc', title: issue.title }], []);

    expect(decision.decision).toBe('duplicate');
    expect(planIssueTriageTask(issue, decision, 'proj-1', 1000)).toBeNull();
  });

  it('returns null for a skip decision — an already-triaged issue mints nothing', () => {
    const skipIssue = { ...issue, labels: ['pool: accessibility'] };
    const decision = planIssueTriage(skipIssue, [], []);

    expect(decision.decision).toBe('skip');
    expect(planIssueTriageTask(skipIssue, decision, 'proj-1', 1000)).toBeNull();
  });

  it('truncates a very long issue title to the task board title cap', () => {
    const longIssue = { number: 1, title: 'x'.repeat(500), body: '' };
    const decision = planIssueTriage(longIssue, [], []);

    const task = planIssueTriageTask(longIssue, decision, 'proj-1', 1000);

    expect(task?.title.length).toBe(200);
  });
});

describe('fetchOpenIssues', () => {
  it('calls gh issue list with the expected argv', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchOpenIssues(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--json',
      'number,title,body,labels',
    ]);
  });

  it('parses label names off each issue, dropping malformed label entries', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 9, title: 'Labeled', labels: [{ name: 'pool: ux' }, { name: 'duplicate' }] },
        { number: 10, title: 'Unlabeled' },
        { number: 11, title: 'Malformed labels', labels: [{ id: 3 }, 'nope'] },
      ]),
    });

    const issues = await fetchOpenIssues(exec);

    expect(issues.map((i) => i.labels)).toEqual([['pool: ux', 'duplicate'], [], []]);
  });

  it('parses well-formed issue JSON into IncomingIssue entries', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 9, title: 'Keyboard nav is broken', body: 'Screen reader users are stuck' },
        { number: 10, title: 'Docs typo', body: '' },
      ]),
    });

    const issues = await fetchOpenIssues(exec);

    expect(issues).toEqual([
      {
        number: 9,
        title: 'Keyboard nav is broken',
        body: 'Screen reader users are stuck',
        labels: [],
      },
      { number: 10, title: 'Docs typo', body: '', labels: [] },
    ]);
  });

  it('defaults a missing body to an empty string', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([{ number: 1, title: 'No body field' }]),
    });

    const issues = await fetchOpenIssues(exec);

    expect(issues).toEqual([{ number: 1, title: 'No body field', body: '', labels: [] }]);
  });

  it('drops entries missing a numeric number or string title', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 1, title: 'Valid' },
        { number: 'not-a-number', title: 'Bad number' },
        { title: 'Missing number' },
        { number: 2 },
      ]),
    });

    const issues = await fetchOpenIssues(exec);

    expect(issues).toEqual([{ number: 1, title: 'Valid', body: '', labels: [] }]);
  });

  it('returns an empty array on a non-zero exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await fetchOpenIssues(exec)).toEqual([]);
  });

  it('returns an empty array on unparseable stdout', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    expect(await fetchOpenIssues(exec)).toEqual([]);
  });

  it('returns an empty array when stdout parses to a non-array', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{"not":"an array"}' });

    expect(await fetchOpenIssues(exec)).toEqual([]);
  });
});

describe('executeIssueTriageCommands', () => {
  const issue = { number: 9, title: 'Keyboard nav is broken in the fleet table', body: '' };

  it('runs every planned command through exec, in order, and pairs each with its result', async () => {
    const decision = planIssueTriage(issue, [], []);
    const commands = planIssueTriageCommands(issue, decision);
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: 'labeled' })
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });

    const results = await executeIssueTriageCommands(commands, exec);

    expect(exec).toHaveBeenNthCalledWith(1, 'gh', [
      'issue',
      'edit',
      '9',
      '--add-label',
      'pool: accessibility',
    ]);
    expect(exec).toHaveBeenNthCalledWith(2, 'gh', [
      'issue',
      'comment',
      '9',
      '--body',
      decision.reasoning,
    ]);
    expect(results).toEqual([
      { command: commands[0], code: 0, stdout: 'labeled' },
      { command: commands[1], code: 0, stdout: 'commented' },
    ]);
  });

  it('keeps running later commands after an earlier one fails, reporting every result', async () => {
    const decision = planIssueTriage(issue, [], []);
    const commands = planIssueTriageCommands(issue, decision);
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 1, stdout: 'label already exists' })
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });

    const results = await executeIssueTriageCommands(commands, exec);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.code)).toEqual([1, 0]);
  });

  it('returns an empty array for an empty plan without calling exec', async () => {
    const exec: CliExec = vi.fn();

    expect(await executeIssueTriageCommands([], exec)).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe('runIssueTriageRitual', () => {
  it('composes fetch, plan, gh commands, and board-task creation into one pass', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-ritual-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      const exec: CliExec = vi.fn(async (_bin, args) => {
        if (args[0] === 'issue' && args[1] === 'list') {
          return {
            code: 0,
            stdout: JSON.stringify([
              {
                number: 9,
                title: 'Keyboard nav is broken in the fleet table',
                body: 'aria issue',
              },
              { number: 10, title: 'Already tracked dashboard crash', body: '' },
            ]),
          };
        }
        return { code: 0, stdout: '' };
      });
      const boardTasks = [{ id: 'web-abc', title: 'Already tracked dashboard crash' }];

      const result = await runIssueTriageRitual(
        exec,
        s,
        'p1',
        boardTasks,
        [],
        undefined,
        () => 100,
      );

      expect(result.plans).toHaveLength(2);
      expect(result.plans[0]?.decision.decision).toBe('accept');
      expect(result.plans[1]?.decision).toMatchObject({
        decision: 'duplicate',
        matchedId: 'web-abc',
      });
      // accept -> pool label + comment (2), duplicate -> duplicate label + comment (2) = 4 total.
      expect(result.commandResults).toHaveLength(4);
      expect(result.tasksCreated).toBe(1);

      const rows = tasks(s, 'p1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: 'github-9', status: 'queued', source: 'github' });
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('is idempotent across passes: already-triaged issues trigger no gh writes or tasks', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-ritual-idem-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      const exec: CliExec = vi.fn(async (_bin, args) => {
        if (args[0] === 'issue' && args[1] === 'list') {
          return {
            code: 0,
            stdout: JSON.stringify([
              {
                number: 9,
                title: 'Keyboard nav is broken',
                labels: [{ name: 'pool: accessibility' }],
              },
              { number: 10, title: 'Old dup', labels: [{ name: 'duplicate' }] },
            ]),
          };
        }
        return { code: 0, stdout: '' };
      });

      const result = await runIssueTriageRitual(exec, s, 'p1', [], [], undefined, () => 100);

      expect(result.plans.map((p) => p.decision.decision)).toEqual(['skip', 'skip']);
      expect(result.commandResults).toEqual([]);
      expect(result.tasksCreated).toBe(0);
      // Only the read-side list call — no gh writes fired at all.
      expect(exec).toHaveBeenCalledTimes(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('creates no tasks and runs no gh write commands when there are no open issues', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-ritual-empty-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

      const result = await runIssueTriageRitual(exec, s, 'p1', [], [], undefined, () => 100);

      expect(result.plans).toEqual([]);
      expect(result.commandResults).toEqual([]);
      expect(result.tasksCreated).toBe(0);
      expect(exec).toHaveBeenCalledTimes(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });
});
