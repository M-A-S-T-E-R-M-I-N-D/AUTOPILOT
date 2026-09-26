// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, setTaskFocus, type Store } from '@autopilot/store';
import {
  poolDimension,
  isPoolIssue,
  isClaimedPoolIssue,
  parsePoolComments,
  fetchPoolIssues,
  planClaimPoolIssue,
  planClaimPoolIssueCommands,
  executeClaimPoolIssueCommands,
  claimPoolIssue,
  planPoolBrowseBatch,
  planPoolIssueTask,
  claimAndQueuePoolIssueTask,
  queueClaimedPoolIssueTask,
  type PoolIssue,
} from '../../src/flight/pool-client.js';
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

/** The task's `focus` flag as the store holds it (1 = focused), or
 *  `undefined` when no such task row exists. */
function taskFocus(s: Store, taskId: string): number | undefined {
  const row = s.db.prepare('SELECT focus FROM tasks WHERE id = ?').get(taskId) as
    { focus: number } | undefined;
  return row?.focus;
}

const DAY = 24 * 60 * 60 * 1000;

function cleanupDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

describe('poolDimension', () => {
  it('reads the dimension suffix off a pool: <dimension> label', () => {
    expect(poolDimension(['pool: ux', 'duplicate'])).toBe('ux');
  });

  it('returns undefined when no label carries the pool: prefix', () => {
    expect(poolDimension(['duplicate', 'bug'])).toBeUndefined();
  });

  it('returns undefined for an empty label list', () => {
    expect(poolDimension([])).toBeUndefined();
  });
});

describe('isPoolIssue', () => {
  it('is true when labels carry a pool: label', () => {
    expect(isPoolIssue(['pool: cybersecurity'])).toBe(true);
  });

  it('is false when labels carry no pool: label', () => {
    expect(isPoolIssue(['duplicate', 'bug'])).toBe(false);
  });
});

describe('isClaimedPoolIssue', () => {
  const base: PoolIssue = {
    number: 1,
    title: 'Fix the thing',
    url: 'https://github.com/example/repo/issues/1',
    labels: ['pool: ux'],
    assignees: [],
  };

  it('is false when the issue has no assignees', () => {
    expect(isClaimedPoolIssue(base)).toBe(false);
  });

  it('is true once the issue carries an assignee', () => {
    expect(isClaimedPoolIssue({ ...base, assignees: ['octocat'] })).toBe(true);
  });
});

describe('parsePoolComments', () => {
  // Regression cover for the claim flow's untrusted-input boundary (epic 0019
  // additive-only law): a comment the ledger cannot date or attribute is
  // DROPPED, never guessed at — a guessed claim would either block a real
  // claimant ("someone holds this") or hand a stale-claim release to the
  // wrong login. Each malformed shape is exercised on its own so a future
  // loosening of any one check trips exactly one assertion.
  const CLAIM_BODY = 'Claimed by gabibi555 via the pool client.\n\n— ✈️ AUTOPILOT agent';

  it('returns an empty list when the comments field is not an array', () => {
    expect(parsePoolComments(undefined)).toEqual([]);
    expect(parsePoolComments(null)).toEqual([]);
    expect(parsePoolComments('Claimed by gabibi555 via the pool client.')).toEqual([]);
    expect(parsePoolComments({ author: { login: 'gabibi555' }, body: CLAIM_BODY })).toEqual([]);
  });

  it('keeps a well-formed comment with its author, parsed timestamp and body', () => {
    const parsed = parsePoolComments([
      { author: { login: 'gabibi555' }, createdAt: '2026-09-11T14:23:10Z', body: CLAIM_BODY },
    ]);

    expect(parsed).toEqual([
      { author: 'gabibi555', createdAt: Date.parse('2026-09-11T14:23:10Z'), body: CLAIM_BODY },
    ]);
  });

  it('drops a comment whose author login is missing or not a string', () => {
    const parsed = parsePoolComments([
      { createdAt: '2026-09-11T14:23:10Z', body: CLAIM_BODY },
      { author: {}, createdAt: '2026-09-11T14:23:10Z', body: CLAIM_BODY },
      { author: { login: 42 }, createdAt: '2026-09-11T14:23:10Z', body: CLAIM_BODY },
      { author: null, createdAt: '2026-09-11T14:23:10Z', body: CLAIM_BODY },
    ]);

    expect(parsed).toEqual([]);
  });

  it('drops a comment whose createdAt is absent, non-string or unparseable', () => {
    const parsed = parsePoolComments([
      { author: { login: 'gabibi555' }, body: CLAIM_BODY },
      { author: { login: 'gabibi555' }, createdAt: 1757600590000, body: CLAIM_BODY },
      { author: { login: 'gabibi555' }, createdAt: 'yesterday', body: CLAIM_BODY },
    ]);

    expect(parsed).toEqual([]);
  });

  it('drops a comment whose body is not a string', () => {
    const parsed = parsePoolComments([
      { author: { login: 'gabibi555' }, createdAt: '2026-09-11T14:23:10Z' },
      { author: { login: 'gabibi555' }, createdAt: '2026-09-11T14:23:10Z', body: null },
      { author: { login: 'gabibi555' }, createdAt: '2026-09-11T14:23:10Z', body: ['x'] },
    ]);

    expect(parsed).toEqual([]);
  });

  it('drops only the malformed entries, keeping the well-formed ones around them in order', () => {
    const parsed = parsePoolComments([
      { author: { login: 'first' }, createdAt: '2026-09-10T08:00:00Z', body: 'one' },
      null,
      { author: { login: 'ghost' }, createdAt: 'not a date', body: 'two' },
      { author: { login: 'second' }, createdAt: '2026-09-11T08:00:00Z', body: 'three' },
    ]);

    expect(parsed.map((c) => c.author)).toEqual(['first', 'second']);
  });
});

describe('fetchPoolIssues', () => {
  it('calls gh issue list with the expected argv', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchPoolIssues(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--json',
      'number,title,url,labels,assignees,comments',
    ]);
  });

  it('keeps only issues carrying a pool: label', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Pooled',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'pool: data' }],
        },
        {
          number: 2,
          title: 'Not pooled',
          url: 'https://github.com/example/repo/issues/2',
          labels: [{ name: 'bug' }],
        },
      ]),
    });

    const issues = await fetchPoolIssues(exec);

    expect(issues).toEqual([
      {
        number: 1,
        title: 'Pooled',
        url: 'https://github.com/example/repo/issues/1',
        labels: ['pool: data'],
        assignees: [],
        claims: [],
      },
    ]);
  });

  it('reads the claims ledger off the comments — a comment-only claim counts (#27)', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 27,
          title: 'Navigation remake',
          url: 'https://github.com/example/repo/issues/27',
          labels: [{ name: 'pool: information' }],
          assignees: [],
          comments: [
            {
              author: { login: 'gabibi555' },
              createdAt: '2026-09-11T14:23:10Z',
              body: 'Claimed by gabibi555 via the pool client.\n\n— ✈️ AUTOPILOT agent',
            },
            {
              author: { login: 'someone' },
              createdAt: '2026-09-12T07:33:01Z',
              body: 'Progress note.',
            },
          ],
        },
      ]),
    });

    const issues = await fetchPoolIssues(exec);

    expect(issues[0]?.claims).toEqual([
      {
        login: 'gabibi555',
        claimedAt: Date.parse('2026-09-11T14:23:10Z'),
        assigned: false,
        lastActivityAt: Date.parse('2026-09-11T14:23:10Z'),
        contested: false,
      },
    ]);
    expect(isClaimedPoolIssue(issues[0] as PoolIssue)).toBe(true);
  });

  it('never counts a claim-shaped comment it cannot attribute — an authorless claim leaves the issue unclaimed', async () => {
    // The #27 fix above made a comment-only claim count. Its untrusted
    // boundary must hold in the other direction too: a comment carrying the
    // exact claim sentence but no author login (a deleted GitHub account
    // returns `author: null`) is dropped, so the issue stays claimable
    // instead of being held by nobody forever.
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 27,
          title: 'Navigation remake',
          url: 'https://github.com/example/repo/issues/27',
          labels: [{ name: 'pool: information' }],
          assignees: [],
          comments: [
            {
              author: null,
              createdAt: '2026-09-11T14:23:10Z',
              body: 'Claimed by gabibi555 via the pool client.\n\n— ✈️ AUTOPILOT agent',
            },
          ],
        },
      ]),
    });

    const issues = await fetchPoolIssues(exec);

    expect(issues[0]?.claims).toEqual([]);
    expect(isClaimedPoolIssue(issues[0] as PoolIssue)).toBe(false);
  });

  it('parses assignee logins, dropping malformed entries', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Claimed',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'pool: ux' }],
          assignees: [{ login: 'octocat' }, { id: 3 }, 'nope'],
        },
      ]),
    });

    const issues = await fetchPoolIssues(exec);

    expect(issues[0]?.assignees).toEqual(['octocat']);
  });

  it('drops entries missing a numeric number, string title, or string url', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Valid',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'pool: ux' }],
        },
        {
          number: 'not-a-number',
          title: 'Bad number',
          url: 'https://github.com/example/repo/issues/2',
          labels: [{ name: 'pool: ux' }],
        },
        { title: 'Missing number', url: 'x', labels: [{ name: 'pool: ux' }] },
        {
          number: 3,
          title: 'Missing url',
          labels: [{ name: 'pool: ux' }],
        },
      ]),
    });

    const issues = await fetchPoolIssues(exec);

    expect(issues).toEqual([
      {
        number: 1,
        title: 'Valid',
        url: 'https://github.com/example/repo/issues/1',
        labels: ['pool: ux'],
        assignees: [],
        claims: [],
      },
    ]);
  });

  it('returns an empty array on a non-zero exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await fetchPoolIssues(exec)).toEqual([]);
  });

  it('returns an empty array on unparseable stdout', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    expect(await fetchPoolIssues(exec)).toEqual([]);
  });

  it('returns an empty array when stdout parses to a non-array', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{"not":"an array"}' });

    expect(await fetchPoolIssues(exec)).toEqual([]);
  });
});

describe('planClaimPoolIssue', () => {
  const base: PoolIssue = {
    number: 7,
    title: 'Fix the thing',
    url: 'https://github.com/example/repo/issues/7',
    labels: ['pool: ux'],
    assignees: [],
  };

  it('claims an unclaimed pool issue', () => {
    const decision = planClaimPoolIssue(base, 'octocat');

    expect(decision.decision).toBe('claim');
    expect(decision.reasoning).toContain('#7');
    expect(decision.reasoning).toContain('octocat');
  });

  it('CONTESTS an issue someone else holds live — never a silent skip, never a silent claim', () => {
    const decision = planClaimPoolIssue({ ...base, assignees: ['someone-else'] }, 'octocat');

    expect(decision.decision).toBe('contest');
    expect(decision.reasoning).toContain('someone-else');
    expect(decision.reasoning).toContain('compares');
    expect(decision).toMatchObject({
      claimant: 'octocat',
      holders: [{ login: 'someone-else', since: null, releasesAt: null }],
    });
  });

  it('names when a live claim releases on its own', () => {
    const at = Date.parse('2026-09-11T14:23:10Z');
    const held = {
      ...base,
      claims: [
        {
          login: 'gabibi555',
          claimedAt: at,
          assigned: false,
          lastActivityAt: at,
          contested: false,
        },
      ],
    };
    const decision = planClaimPoolIssue(held, 'octocat', at + 2 * DAY);

    expect(decision.decision).toBe('contest');
    expect(decision.reasoning).toContain('since 2026-09-11');
    expect(decision.reasoning).toContain('releases on its own 2026-09-25');
  });

  it('skips when the claimant already holds it', () => {
    const decision = planClaimPoolIssue({ ...base, assignees: ['octocat'] }, 'octocat');

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('already yours');
  });

  it('claims over a STALE claim and plans its release — the system that really frees claims', () => {
    const at = Date.parse('2026-08-01T00:00:00Z');
    const stale = {
      ...base,
      claims: [
        { login: 'quiet-one', claimedAt: at, assigned: true, lastActivityAt: at, contested: false },
      ],
    };
    const decision = planClaimPoolIssue(stale, 'octocat', at + 20 * DAY);

    expect(decision.decision).toBe('claim');
    expect(decision).toMatchObject({
      releases: [{ login: 'quiet-one', assigned: true, quietDays: 20 }],
    });
    expect(decision.reasoning).toContain("releasing @quiet-one's claim (quiet 20d)");
  });

  it('skips an issue that carries no pool: label', () => {
    const decision = planClaimPoolIssue({ ...base, labels: ['bug'] }, 'octocat');

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('#7');
  });
});

describe('planClaimPoolIssueCommands', () => {
  const base: PoolIssue = {
    number: 7,
    title: 'Fix the thing',
    url: 'https://github.com/example/repo/issues/7',
    labels: ['pool: ux'],
    assignees: [],
  };

  it('plans the claim COMMENT first, then the assign — GitHub only assigns a commenter', () => {
    const decision = planClaimPoolIssue(base, 'octocat');
    const commands = planClaimPoolIssueCommands(base, 'octocat', decision);

    expect(commands).toEqual([
      {
        command: 'gh',
        args: [
          'issue',
          'comment',
          '7',
          '--body',
          expect.stringContaining('Claimed by octocat via the pool client.'),
        ],
        details: expect.stringContaining('7'),
      },
      {
        command: 'gh',
        args: ['issue', 'edit', '7', '--add-assignee', 'octocat'],
        details: expect.stringContaining('7'),
      },
    ]);
    expect(commands[0]?.args[4]).toContain('14 quiet days release it');
  });

  it('plans a contested claim as an "Also claimed" comment that names the holder, then the assign', () => {
    const held = { ...base, assignees: ['someone-else'] };
    const decision = planClaimPoolIssue(held, 'octocat');
    const commands = planClaimPoolIssueCommands(held, 'octocat', decision);

    expect(commands.map((c) => c.args.slice(0, 2))).toEqual([
      ['issue', 'comment'],
      ['issue', 'edit'],
    ]);
    const body = commands[0]?.args[4] ?? '';
    expect(body).toMatch(/^Also claimed by octocat via the pool client \(contested\)\./);
    expect(body).toContain('@someone-else');
    expect(body).toContain('compares them');
  });

  it('releases a stale claim first — note, unassign when assigned — then claims', () => {
    const at = Date.parse('2026-08-01T00:00:00Z');
    const stale = {
      ...base,
      claims: [
        { login: 'quiet-one', claimedAt: at, assigned: true, lastActivityAt: at, contested: false },
      ],
    };
    const decision = planClaimPoolIssue(stale, 'octocat', at + 20 * DAY);
    const commands = planClaimPoolIssueCommands(stale, 'octocat', decision);

    expect(commands.map((c) => c.args.slice(0, 2).concat(c.args[3] ?? ''))).toEqual([
      ['issue', 'comment', '--body'],
      ['issue', 'edit', '--remove-assignee'],
      ['issue', 'comment', '--body'],
      ['issue', 'edit', '--add-assignee'],
    ]);
    expect(commands[0]?.args[4]).toMatch(/^Releasing @quiet-one's claim — quiet for 20 days/);
    expect(commands[1]?.args[4]).toBe('quiet-one');
  });

  it('skips the unassign for a stale comment-only claim (nothing to unassign)', () => {
    const at = Date.parse('2026-08-01T00:00:00Z');
    const stale = {
      ...base,
      claims: [
        {
          login: 'quiet-one',
          claimedAt: at,
          assigned: false,
          lastActivityAt: at,
          contested: false,
        },
      ],
    };
    const decision = planClaimPoolIssue(stale, 'octocat', at + 20 * DAY);
    const commands = planClaimPoolIssueCommands(stale, 'octocat', decision);

    expect(commands.map((c) => c.args[1])).toEqual(['comment', 'comment', 'edit']);
  });

  it('plans no commands for a skip decision', () => {
    const mine = { ...base, assignees: ['octocat'] };
    const decision = planClaimPoolIssue(mine, 'octocat');

    expect(planClaimPoolIssueCommands(mine, 'octocat', decision)).toEqual([]);
  });
});

describe('executeClaimPoolIssueCommands', () => {
  it('runs every planned command through exec in order, even after a failure', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 1, stdout: 'assign failed' })
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const base: PoolIssue = {
      number: 7,
      title: 'Fix the thing',
      url: 'https://github.com/example/repo/issues/7',
      labels: ['pool: ux'],
      assignees: [],
    };
    const decision = planClaimPoolIssue(base, 'octocat');
    const commands = planClaimPoolIssueCommands(base, 'octocat', decision);

    const results = await executeClaimPoolIssueCommands(commands, exec);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ command: commands[0], code: 1, stdout: 'assign failed' });
    expect(results[1]).toEqual({ command: commands[1], code: 0, stdout: 'commented' });
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe('claimPoolIssue', () => {
  function execFor(issues: unknown[], viewerLogin: string | undefined): CliExec {
    return vi.fn(async (bin, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return { code: 0, stdout: JSON.stringify(issues) };
      }
      if (args[0] === 'api' && args[1] === 'user') {
        return viewerLogin === undefined
          ? { code: 1, stdout: '' }
          : { code: 0, stdout: JSON.stringify({ login: viewerLogin }) };
      }
      return { code: 0, stdout: '' };
    });
  }

  it('claims a pooled, unassigned issue by number', async () => {
    const exec = execFor(
      [
        {
          number: 7,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/7',
          labels: [{ name: 'pool: ux' }],
          assignees: [],
        },
      ],
      'octocat',
    );

    const result = await claimPoolIssue(7, exec);

    expect(result.decision.decision).toBe('claim');
    expect(result.commandResults).toHaveLength(2);
    expect(exec).toHaveBeenCalledWith('gh', ['issue', 'edit', '7', '--add-assignee', 'octocat']);
    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'comment',
      '7',
      '--body',
      expect.stringContaining('octocat'),
    ]);
  });

  it('skips with no commands when the issue number is not in the open pool', async () => {
    const exec = execFor([], 'octocat');

    const result = await claimPoolIssue(404, exec);

    expect(result.decision.decision).toBe('skip');
    expect(result.commandResults).toEqual([]);
  });

  it('skips with no commands when the viewer identity cannot be resolved', async () => {
    const exec = execFor(
      [
        {
          number: 7,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/7',
          labels: [{ name: 'pool: ux' }],
          assignees: [],
        },
      ],
      undefined,
    );

    const result = await claimPoolIssue(7, exec);

    expect(result.decision.decision).toBe('skip');
    expect(result.commandResults).toEqual([]);
  });
});

describe('planPoolBrowseBatch', () => {
  const claimable: PoolIssue = {
    number: 7,
    title: 'Fix the thing',
    url: 'https://github.com/example/repo/issues/7',
    labels: ['pool: ux'],
    assignees: [],
  };
  const claimed: PoolIssue = {
    number: 8,
    title: 'Already taken',
    url: 'https://github.com/example/repo/issues/8',
    labels: ['pool: ux'],
    assignees: ['someone-else'],
  };

  it('pairs every issue with its claim decision for the given claimant', () => {
    const entries = planPoolBrowseBatch([claimable, claimed], 'octocat');

    expect(entries).toEqual([
      { issue: claimable, decision: planClaimPoolIssue(claimable, 'octocat'), claims: [] },
      {
        issue: claimed,
        decision: planClaimPoolIssue(claimed, 'octocat'),
        claims: [
          {
            claim: {
              login: 'someone-else',
              claimedAt: null,
              assigned: true,
              lastActivityAt: null,
              contested: false,
            },
            quietDays: null,
            releasesAt: null,
            stale: false,
          },
        ],
      },
    ]);
    expect(entries[0]?.decision.decision).toBe('claim');
    expect(entries[1]?.decision.decision).toBe('contest');
  });

  it('plans a skip for every issue when the claimant is unresolved', () => {
    const entries = planPoolBrowseBatch([claimable], undefined);

    expect(entries).toEqual([
      {
        issue: claimable,
        decision: {
          decision: 'skip',
          reasoning: expect.stringContaining('#7'),
        },
        claims: [],
      },
    ]);
  });

  it('returns an empty array for an empty pool', () => {
    expect(planPoolBrowseBatch([], 'octocat')).toEqual([]);
  });
});

describe('planPoolIssueTask', () => {
  const issue: PoolIssue = {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    url: 'https://github.com/example/repo/issues/42',
    labels: ['pool: accessibility'],
    assignees: [],
  };

  it('builds a queued, github-sourced task for a claim decision', () => {
    const decision = planClaimPoolIssue(issue, 'octocat');

    const input = planPoolIssueTask(issue, decision, 'p1', 100);

    expect(input).toEqual({
      id: 'github-42',
      projectId: 'p1',
      title: 'Keyboard nav is broken in the fleet table',
      dimension: 'accessibility',
      body: expect.stringContaining('contract: human-closes'),
      source: 'github',
      createdAt: 100,
    });
  });

  it('returns null for a skip decision', () => {
    const mine = { ...issue, assignees: ['octocat'] };
    const decision = planClaimPoolIssue(mine, 'octocat');

    expect(planPoolIssueTask(mine, decision, 'p1', 100)).toBeNull();
  });

  it('builds the task for a CONTESTED claim too, naming the holder it contests', () => {
    const held = { ...issue, assignees: ['someone-else'] };
    const decision = planClaimPoolIssue(held, 'octocat');

    const input = planPoolIssueTask(held, decision, 'p1', 100);

    expect(input?.body).toContain('claimed by @octocat — contested with @someone-else');
    expect(input?.body).toContain('contract: human-closes');
  });

  it('degrades an unrecognized pool label dimension to null rather than a bad CHECK value', () => {
    const drifted = { ...issue, labels: ['pool: not-a-real-dimension'] };
    const decision = planClaimPoolIssue(drifted, 'octocat');

    const input = planPoolIssueTask(drifted, decision, 'p1', 100);

    expect(input?.dimension).toBeNull();
  });

  it('caps an overlong title the same way issue-triage.ts does', () => {
    const longTitled = { ...issue, title: 'x'.repeat(250) };
    const decision = planClaimPoolIssue(longTitled, 'octocat');

    const input = planPoolIssueTask(longTitled, decision, 'p1', 100);

    expect(input?.title).toHaveLength(200);
  });
});

describe('claimAndQueuePoolIssueTask', () => {
  function execFor(issues: unknown[], viewerLogin: string | undefined): CliExec {
    return vi.fn(async (bin, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return { code: 0, stdout: JSON.stringify(issues) };
      }
      if (args[0] === 'api' && args[1] === 'user') {
        return viewerLogin === undefined
          ? { code: 1, stdout: '' }
          : { code: 0, stdout: JSON.stringify({ login: viewerLogin }) };
      }
      return { code: 0, stdout: '' };
    });
  }

  it('claims a pool issue and queues a board task for it', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-pool-client-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      const exec = execFor(
        [
          {
            number: 42,
            title: 'Keyboard nav is broken in the fleet table',
            url: 'https://github.com/example/repo/issues/42',
            labels: [{ name: 'pool: accessibility' }],
            assignees: [],
          },
        ],
        'octocat',
      );

      const result = await claimAndQueuePoolIssueTask(42, 'p1', exec, s, () => 100);

      expect(result.decision.decision).toBe('claim');
      expect(result.taskQueued).toBe(true);
      const rows = tasks(s, 'p1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'github-42',
        status: 'queued',
        source: 'github',
        dimension: 'accessibility',
      });
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('never queues a second task for the same issue on a repeat run', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-pool-client-repeat-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      const exec = execFor(
        [
          {
            number: 42,
            title: 'Keyboard nav is broken in the fleet table',
            url: 'https://github.com/example/repo/issues/42',
            labels: [{ name: 'pool: accessibility' }],
            assignees: [],
          },
        ],
        'octocat',
      );

      await claimAndQueuePoolIssueTask(42, 'p1', exec, s, () => 100);
      const second = await claimAndQueuePoolIssueTask(42, 'p1', exec, s, () => 200);

      expect(second.taskQueued).toBe(false);
      expect(tasks(s, 'p1')).toHaveLength(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('does not queue a task when the issue is not in the open pool', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-pool-client-missing-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');

      const exec = execFor([], 'octocat');

      const result = await claimAndQueuePoolIssueTask(404, 'p1', exec, s, () => 100);

      expect(result.decision.decision).toBe('skip');
      expect(result.taskQueued).toBe(false);
      expect(tasks(s, 'p1')).toHaveLength(0);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  // Regression cover for the claim flow's FOCUS contract (epic 0019
  // additive-only law): a claim is not just a board row — the queued task is
  // focused so the claimant's own pilot works it first (WIP-limit-1). Nothing
  // asserted that before, so dropping the setTaskFocus call would have gone
  // unnoticed by the suite.
  const POOL_ISSUE_42 = {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    url: 'https://github.com/example/repo/issues/42',
    labels: [{ name: 'pool: accessibility' }],
    assignees: [],
  };

  it("focuses the queued task so the claimant's own pilot works it first", async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-pool-client-focus-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      const exec = execFor([POOL_ISSUE_42], 'octocat');

      const result = await claimAndQueuePoolIssueTask(42, 'p1', exec, s, () => 100);

      expect(result.taskQueued).toBe(true);
      expect(result.focused).toBe(true);
      expect(taskFocus(s, 'github-42')).toBe(1);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });

  it('does not re-focus a task the operator un-focused when the same claim repeats', async () => {
    // A repeat claim dedupes to no new row — and must not quietly override the
    // operator's steering either: focus is theirs to set, so an un-focused
    // task stays un-focused across the repeat.
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-pool-client-refocus-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      const exec = execFor([POOL_ISSUE_42], 'octocat');
      await claimAndQueuePoolIssueTask(42, 'p1', exec, s, () => 100);
      expect(setTaskFocus(s, 'github-42', false, 150)).toBe(true);

      const second = await claimAndQueuePoolIssueTask(42, 'p1', exec, s, () => 200);

      expect(second.taskQueued).toBe(false);
      expect(second.focused).toBe(false);
      expect(taskFocus(s, 'github-42')).toBe(0);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });
});

describe('queueClaimedPoolIssueTask', () => {
  it('passes the claim result through with taskQueued and focused both false when no issue resolved', () => {
    // The execute API routes by repository between the claim and the queue,
    // so this half must stand alone: a claim that resolved no pool issue has
    // nothing to queue and nothing to focus, and its own fields (decision,
    // command results) ride through unchanged for the caller's report.
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-pool-client-queue-db-'));
    try {
      const dbPath = join(dbDir, 'a.db');
      const s = openStore(dbPath);
      migrate(s);
      project(s, 'p1');
      const claim = {
        decision: { decision: 'skip' as const, reasoning: '#404 is not in the open pool.' },
        commandResults: [],
        issue: undefined,
      };

      const result = queueClaimedPoolIssueTask(claim, 'p1', s, () => 100);

      expect(result).toEqual({ ...claim, taskQueued: false, focused: false });
      expect(tasks(s, 'p1')).toHaveLength(0);
      s.close();
    } finally {
      cleanupDir(dbDir);
    }
  });
});
