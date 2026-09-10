// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  supersededFamilyLabels,
  classifyIssueDimension,
  classifyIssueArea,
  classifyIssuePriority,
  classifyIssueMilestone,
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

describe('classifyIssueArea', () => {
  it('picks the area whose keywords appear most in the text', () => {
    expect(classifyIssueArea('The dashboard panel chip is misaligned')).toBe('area: dashboard');
    expect(classifyIssueArea('A firing died mid-flight and the gate never ran')).toBe(
      'area: flight-engine',
    );
    expect(classifyIssueArea('The Hebrew translation is missing on this locale string')).toBe(
      'area: i18n',
    );
  });

  it('falls back to area: dashboard when no keyword matches', () => {
    expect(classifyIssueArea('The sky is blue today')).toBe('area: dashboard');
  });
});

describe('classifyIssuePriority', () => {
  it('picks the priority whose keywords appear most in the text', () => {
    expect(classifyIssuePriority('This causes data loss and is a critical safety issue')).toBe(
      'priority: critical',
    );
    expect(classifyIssuePriority('Urgent: this is blocking the release')).toBe('priority: high');
    expect(classifyIssuePriority('Minor cosmetic issue, nice to have someday')).toBe(
      'priority: low',
    );
  });

  it('falls back to priority: medium when no keyword matches', () => {
    expect(classifyIssuePriority('The sky is blue today')).toBe('priority: medium');
  });
});

describe('classifyIssueMilestone', () => {
  it('picks the milestone whose keywords appear most in the text', () => {
    expect(classifyIssueMilestone('Bootstrap the initial architecture scaffold')).toBe(
      'Foundations',
    );
    expect(classifyIssueMilestone('Screen reader accessib gap and a security vulnerab')).toBe(
      'Hardening',
    );
  });

  it('falls back to V1 when no keyword matches', () => {
    expect(classifyIssueMilestone('The sky is blue today')).toBe('V1');
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

    expect(decision).toMatchObject({
      decision: 'accept',
      dimension: 'accessibility',
      // Title contains "fleet" (area: flight-engine) and "broken" (priority: high).
      area: 'area: flight-engine',
      priority: 'priority: high',
      // Neither the title nor body carries a Foundations/Hardening keyword.
      milestone: 'V1',
    });
    expect(decision.reasoning).toContain('#9');
    expect(decision.reasoning).toContain('pool: accessibility');
    expect(decision.reasoning).toContain('milestone "V1"');
  });

  it('classifies an accepted issue into the Hardening milestone by its security/a11y/perf signal', () => {
    const decision = planIssueTriage(
      { number: 60, title: 'Auth bypass security vulnerab found in login flow', body: '' },
      [],
      [],
    );

    expect(decision).toMatchObject({ decision: 'accept', milestone: 'Hardening' });
  });

  it('classifies an accepted issue into the Foundations milestone by its scaffolding signal', () => {
    const decision = planIssueTriage(
      {
        number: 61,
        title: 'Bootstrap the initial architecture scaffold for a fresh repo',
        body: '',
      },
      [],
      [],
    );

    expect(decision).toMatchObject({ decision: 'accept', milestone: 'Foundations' });
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

  it('skips a "good first issue" instead of accepting it, so the fleet does not eat the community opportunity', () => {
    const decision = planIssueTriage(
      {
        number: 21,
        title: 'Add a --dry-run flag to the CLI',
        body: 'Small, well-scoped, great for a first PR',
        labels: ['good first issue'],
      },
      [],
      [],
    );

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('good first issue');
    expect(decision.reasoning).toContain('#21');
  });

  it('recognizes the hyphenated "good-first-issue" label spelling too', () => {
    const decision = planIssueTriage(
      { number: 22, title: 'Fix a typo in the README', body: '', labels: ['good-first-issue'] },
      [],
      [],
    );

    expect(decision.decision).toBe('skip');
  });

  it('skips an issue already assigned to a human instead of picking it for the fleet', () => {
    const decision = planIssueTriage(
      {
        number: 30,
        title: 'Keyboard nav is broken in the fleet table',
        body: 'aria issue',
        assignees: ['octocat'],
      },
      [],
      [],
    );

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('#30');
    expect(decision.reasoning).toContain('octocat');
  });

  it('does not skip an unassigned issue on the assignee check', () => {
    const decision = planIssueTriage(
      { number: 31, title: 'Add a --dry-run flag to the CLI', body: '', assignees: [] },
      [],
      [],
    );

    expect(decision.decision).toBe('accept');
  });

  it('routes a partner-application issue to a dossier decision, never auto-verdicting it', () => {
    const decision = planIssueTriage(
      {
        number: 50,
        title: 'partner application: @gabibi555',
        body: 'Applying for Active-partner standing.',
        labels: ['partner-application'],
      },
      [],
      [],
    );

    expect(decision.decision).toBe('dossier');
    expect(decision.reasoning).toContain('#50');
    expect(decision.reasoning).toContain('never auto-verdict');
  });

  it('routes a partner-application issue to a dossier decision even when assigned', () => {
    // A partner-application issue is checked BEFORE the assignee/good-first-issue
    // checks below — a standing application always gets a dossier, regardless of
    // what else is true about the issue.
    const decision = planIssueTriage(
      {
        number: 51,
        title: 'partner application: @gabibi555',
        body: '',
        labels: ['partner-application'],
        assignees: ['gabibi555'],
      },
      [],
      [],
    );

    expect(decision.decision).toBe('dossier');
  });

  it('skips a partner-application issue whose dossier a previous pass already posted', () => {
    const decision = planIssueTriage(
      {
        number: 52,
        title: 'partner application: @gabibi555',
        body: '',
        labels: ['partner-application', 'dossier-posted'],
      },
      [],
      [],
    );

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('dossier-posted');
  });
});

describe('planIssueTriageCommands', () => {
  const issue = { number: 9, title: 'Keyboard nav is broken in the fleet table', body: '' };

  it('plans an add-label edit (pool + area + priority) followed by a reasoning comment for an accepted issue', () => {
    const decision = planIssueTriage(issue, [], []);

    expect(planIssueTriageCommands(issue, decision)).toEqual([
      {
        command: 'gh',
        args: [
          'issue',
          'edit',
          '9',
          '--add-label',
          'pool: accessibility',
          '--add-label',
          'area: flight-engine',
          '--add-label',
          'priority: high',
          '--milestone',
          'V1',
        ],
        details:
          'labeling #9 "pool: accessibility", "area: flight-engine", "priority: high" and ' +
          'setting milestone "V1" per its classified dimension/area/priority/milestone',
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

  it('plans no commands at all for a dossier — its real commands need async gh facts', () => {
    const applicationIssue = {
      ...issue,
      title: 'partner application: @gabibi555',
      labels: ['partner-application'],
    };
    const decision = planIssueTriage(applicationIssue, [], []);

    expect(decision.decision).toBe('dossier');
    expect(planIssueTriageCommands(applicationIssue, decision)).toEqual([]);
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
      'number,title,body,url,labels,assignees,author',
    ]);
  });

  it('parses the url off each issue, dropping a malformed url', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 9, title: 'Has url', url: 'https://github.com/example/repo/issues/9' },
        { number: 10, title: 'No url' },
        { number: 11, title: 'Malformed url', url: 42 },
      ]),
    });

    const issues = await fetchOpenIssues(exec);

    expect(issues.map((i) => i.url)).toEqual([
      'https://github.com/example/repo/issues/9',
      undefined,
      undefined,
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

  it('parses assignee logins off each issue, dropping malformed assignee entries', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 9, title: 'Assigned', assignees: [{ login: 'octocat' }, { id: 3 }, 'nope'] },
        { number: 10, title: 'Unassigned' },
      ]),
    });

    const issues = await fetchOpenIssues(exec);

    expect(issues.map((i) => i.assignees)).toEqual([['octocat'], []]);
  });

  it('parses the author login off each issue, dropping a malformed author', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        { number: 9, title: 'Has author', author: { login: 'gabibi555', is_bot: false } },
        { number: 10, title: 'No author' },
        { number: 11, title: 'Malformed author', author: 'nope' },
      ]),
    });

    const issues = await fetchOpenIssues(exec);

    expect(issues.map((i) => i.author)).toEqual(['gabibi555', undefined, undefined]);
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
        assignees: [],
      },
      { number: 10, title: 'Docs typo', body: '', labels: [], assignees: [] },
    ]);
  });

  it('defaults a missing body to an empty string', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([{ number: 1, title: 'No body field' }]),
    });

    const issues = await fetchOpenIssues(exec);

    expect(issues).toEqual([
      { number: 1, title: 'No body field', body: '', labels: [], assignees: [] },
    ]);
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

    expect(issues).toEqual([{ number: 1, title: 'Valid', body: '', labels: [], assignees: [] }]);
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
      '--add-label',
      'area: flight-engine',
      '--add-label',
      'priority: high',
      '--milestone',
      'V1',
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

  it('posts a KEEPER evidence dossier for a partner-application issue instead of auto-triaging it', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-ritual-dossier-db-'));
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
                number: 50,
                title: 'partner application: @gabibi555',
                body: '',
                labels: [{ name: 'partner-application' }],
                author: { login: 'gabibi555' },
              },
            ]),
          };
        }
        if (args[0] === 'api') {
          return {
            code: 0,
            stdout: JSON.stringify({
              created_at: '2024-01-01T00:00:00Z',
              public_repos: 3,
              followers: 1,
            }),
          };
        }
        if (args[0] === 'pr' && args[1] === 'list') {
          return { code: 0, stdout: '[]' };
        }
        // issue edit / issue comment writes
        return { code: 0, stdout: '' };
      });

      const result = await runIssueTriageRitual(exec, s, 'p1', [], [], undefined, () => 100);

      expect(result.plans).toHaveLength(1);
      expect(result.plans[0]?.decision.decision).toBe('dossier');
      // dossier-posted label edit + the dossier comment itself
      expect(result.commandResults).toHaveLength(2);
      expect(result.commandResults[0]?.command.args).toEqual([
        'issue',
        'edit',
        '50',
        '--add-label',
        'dossier-posted',
      ]);
      expect(result.commandResults[1]?.command.args[1]).toBe('comment');
      expect(result.commandResults[1]?.command.args[4]).toContain('@gabibi555');
      // A dossier decision never becomes a board task — it routes to the maintainer.
      expect(result.tasksCreated).toBe(0);
      expect(tasks(s, 'p1')).toEqual([]);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });
});

/**
 * MUTUALLY EXCLUSIVE LABEL FAMILIES (operator sweep, 2026-09-09): issues
 * #21, #27 and #28 each carried BOTH `priority: high` and
 * `priority: medium`. The triage only ever ran `--add-label`, so a
 * classification that disagreed with a hand-set label left the board
 * showing a contradiction it could not resolve.
 */
describe('supersededFamilyLabels', () => {
  it('names the sibling priority a new classification replaces', () => {
    expect(
      supersededFamilyLabels(
        ['priority: high', 'area: i18n', 'epic'],
        ['area: i18n', 'priority: medium'],
      ),
    ).toEqual(['priority: high']);
  });

  it('replaces a stale area too, and leaves unrelated labels alone', () => {
    expect(
      supersededFamilyLabels(
        ['area: dashboard', 'help wanted', 'epic', 'pool: information'],
        ['area: i18n', 'priority: high'],
      ),
    ).toEqual(['area: dashboard']);
  });

  it('returns nothing when the issue already carries exactly the chosen labels', () => {
    expect(
      supersededFamilyLabels(['area: i18n', 'priority: high'], ['area: i18n', 'priority: high']),
    ).toEqual([]);
  });

  it('never proposes removing a label the issue does not have — gh would fail the whole edit', () => {
    expect(supersededFamilyLabels([], ['area: i18n', 'priority: high'])).toEqual([]);
  });

  it('leaves the pool marker alone — it is the ritual’s own idempotency flag', () => {
    expect(
      supersededFamilyLabels(['pool: accessibility'], ['area: i18n', 'priority: high']),
    ).toEqual([]);
  });
});
