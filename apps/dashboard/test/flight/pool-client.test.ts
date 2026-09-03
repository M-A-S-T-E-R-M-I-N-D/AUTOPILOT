// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  poolDimension,
  isPoolIssue,
  isClaimedPoolIssue,
  fetchPoolIssues,
  planClaimPoolIssue,
  planClaimPoolIssueCommands,
  executeClaimPoolIssueCommands,
  claimPoolIssue,
  planPoolBrowseBatch,
  planPoolIssueTask,
  claimAndQueuePoolIssueTask,
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
      'number,title,url,labels,assignees',
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
      },
    ]);
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

  it('skips an issue already claimed by someone else', () => {
    const decision = planClaimPoolIssue({ ...base, assignees: ['someone-else'] }, 'octocat');

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('someone-else');
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

  it('plans an assign command followed by a comment for a claim decision', () => {
    const decision = planClaimPoolIssue(base, 'octocat');
    const commands = planClaimPoolIssueCommands(base, 'octocat', decision);

    expect(commands).toEqual([
      {
        command: 'gh',
        args: ['issue', 'edit', '7', '--add-assignee', 'octocat'],
        details: expect.stringContaining('7'),
      },
      {
        command: 'gh',
        args: ['issue', 'comment', '7', '--body', expect.stringContaining('octocat')],
        details: expect.stringContaining('7'),
      },
    ]);
  });

  it('plans no commands for a skip decision', () => {
    const claimed = { ...base, assignees: ['someone-else'] };
    const decision = planClaimPoolIssue(claimed, 'octocat');

    expect(planClaimPoolIssueCommands(claimed, 'octocat', decision)).toEqual([]);
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
      { issue: claimable, decision: planClaimPoolIssue(claimable, 'octocat') },
      { issue: claimed, decision: planClaimPoolIssue(claimed, 'octocat') },
    ]);
    expect(entries[0]?.decision.decision).toBe('claim');
    expect(entries[1]?.decision.decision).toBe('skip');
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
      source: 'github',
      createdAt: 100,
    });
  });

  it('returns null for a skip decision', () => {
    const claimed = { ...issue, assignees: ['someone-else'] };
    const decision = planClaimPoolIssue(claimed, 'octocat');

    expect(planPoolIssueTask(claimed, decision, 'p1', 100)).toBeNull();
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
});
