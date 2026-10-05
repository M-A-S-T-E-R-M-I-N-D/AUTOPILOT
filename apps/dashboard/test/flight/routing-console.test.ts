// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0019 slice 4 (board web-mtrh1hn3-8x9f0z): the routing console's model
 * — what the GitHub page says about milestones, the steering label queues
 * and claims, derived purely from `gh` reads so the dashboard can show it
 * beside the board.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate } from '@autopilot/store';
import {
  ROUTING_QUEUE_LABELS,
  UNREADABLE_ROUTING_CONSOLE,
  createRoutingConsoleApi,
  fetchOpenMilestones,
  fetchRoutingConsole,
  parseMilestoneRows,
  planRoutingConsole,
  readProjectRoutingConsole,
  type RoutingIssue,
  type RoutingMilestone,
} from '../../src/flight/routing-console.js';
import { MAX_MILESTONE_PAGES, MILESTONE_PAGE_SIZE } from '../../src/flight/taxonomy-seed.js';
import {
  planClaimPoolIssue,
  planClaimPoolIssueCommands,
  type PoolIssue,
} from '../../src/flight/pool-client.js';
import { claimLedger } from '../../src/flight/claim-ledger.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function milestone(overrides: Partial<RoutingMilestone> & { title: string }): RoutingMilestone {
  return { openIssues: 0, closedIssues: 0, dueOn: null, url: null, ...overrides };
}

function issue(number: number, labels: readonly string[] = [], assignees?: readonly string[]) {
  const row: RoutingIssue = { number, labels, ...(assignees ? { assignees } : {}) };
  return row;
}

describe('parseMilestoneRows', () => {
  it('reads the REST fields a milestone row carries, its page link included', () => {
    const rows = parseMilestoneRows([
      {
        title: 'V1',
        open_issues: 3,
        closed_issues: 9,
        due_on: '2026-11-01T07:00:00Z',
        html_url: 'https://github.com/o/r/milestone/2',
      },
    ]);
    expect(rows).toEqual([
      {
        title: 'V1',
        openIssues: 3,
        closedIssues: 9,
        dueOn: '2026-11-01T07:00:00Z',
        url: 'https://github.com/o/r/milestone/2',
      },
    ]);
  });

  it('keeps an undated milestone with a null due date', () => {
    const rows = parseMilestoneRows([
      {
        title: 'Hardening',
        open_issues: 0,
        closed_issues: 0,
        due_on: null,
      },
    ]);
    expect(rows).toEqual([
      { title: 'Hardening', openIssues: 0, closedIssues: 0, dueOn: null, url: null },
    ]);
  });

  it('keeps a milestone whose link is missing or not https, unlinked rather than dropped', () => {
    const rows = parseMilestoneRows([
      { title: 'none', open_issues: 1, closed_issues: 1 },
      { title: 'number', open_issues: 1, closed_issues: 1, html_url: 7 },
      { title: 'script', open_issues: 1, closed_issues: 1, html_url: 'javascript:alert(1)' },
      {
        title: 'plain',
        open_issues: 1,
        closed_issues: 1,
        html_url: 'http://github.com/o/r/milestone/1',
      },
    ]);
    expect(rows.map((row) => [row.title, row.url])).toEqual([
      ['none', null],
      ['number', null],
      ['script', null],
      ['plain', null],
    ]);
  });

  it('drops rows it cannot read whole rather than guessing at counts', () => {
    const rows = parseMilestoneRows([
      null,
      'V1',
      { open_issues: 1, closed_issues: 1 },
      { title: 'neg', open_issues: -1, closed_issues: 0 },
      { title: 'frac', open_issues: 1.5, closed_issues: 0 },
      { title: 'str', open_issues: '2', closed_issues: 0 },
      { title: 'kept', open_issues: 2, closed_issues: 0 },
    ]);
    expect(rows.map((row) => row.title)).toEqual(['kept']);
  });

  it('reads a non-array payload as no milestones', () => {
    expect(parseMilestoneRows({ message: 'Not Found' })).toEqual([]);
  });
});

describe('planRoutingConsole — milestone progress', () => {
  it('orders milestones soonest-due first, undated last, ties by title', () => {
    const plan = planRoutingConsole(
      [
        milestone({ title: 'Undated B' }),
        milestone({ title: 'Later', dueOn: '2026-12-01T00:00:00Z' }),
        milestone({ title: 'Undated A' }),
        milestone({ title: 'Sooner', dueOn: '2026-10-15T00:00:00Z' }),
      ],
      [],
    );
    expect(plan.milestones.map((row) => row.title)).toEqual([
      'Sooner',
      'Later',
      'Undated A',
      'Undated B',
    ]);
  });

  it('reports percent done rounded down, so an open issue never reads as 100%', () => {
    const plan = planRoutingConsole(
      [
        milestone({ title: 'almost', openIssues: 1, closedIssues: 199 }),
        milestone({ title: 'third', openIssues: 2, closedIssues: 1 }),
        milestone({ title: 'done', openIssues: 0, closedIssues: 4 }),
      ],
      [],
    );
    const percent = Object.fromEntries(plan.milestones.map((row) => [row.title, row.percentDone]));
    expect(percent).toEqual({ almost: 99, third: 33, done: 100 });
  });

  it('gives an empty milestone no percent at all rather than 0% or 100%', () => {
    const plan = planRoutingConsole([milestone({ title: 'empty' })], []);
    expect(plan.milestones[0]?.percentDone).toBeNull();
  });
});

describe('planRoutingConsole — label queues', () => {
  it('lists every house priority and status label, priority first, in taxonomy order', () => {
    expect(ROUTING_QUEUE_LABELS).toEqual([
      'priority: critical',
      'priority: high',
      'priority: medium',
      'priority: low',
      'status: awaiting-human',
      'status: blocked',
      'status: needs-format',
    ]);
    const plan = planRoutingConsole([], []);
    expect(plan.labelQueues.map((queue) => queue.label)).toEqual(ROUTING_QUEUE_LABELS);
    expect(plan.labelQueues.every((queue) => queue.issues.length === 0)).toBe(true);
  });

  it('queues issues under a label in any casing or hyphenation, numbers ascending', () => {
    const plan = planRoutingConsole(
      [],
      [
        issue(12, ['Priority: High']),
        issue(3, ['priority: high', 'status: blocked']),
        issue(7, ['status: needs format']),
        issue(9, ['area: ci', 'bug']),
      ],
    );
    const queues = Object.fromEntries(plan.labelQueues.map((queue) => [queue.label, queue.issues]));
    expect(queues['priority: high']).toEqual([3, 12]);
    expect(queues['status: blocked']).toEqual([3]);
    expect(queues['status: needs-format']).toEqual([7]);
    expect(queues['priority: low']).toEqual([]);
  });

  it('names the open issues no priority label has routed yet', () => {
    const plan = planRoutingConsole(
      [],
      [issue(5, ['priority: low']), issue(8, ['status: blocked']), issue(2), issue(4, ['bug'])],
    );
    expect(plan.unprioritized).toEqual([2, 4, 8]);
  });
});

describe('planRoutingConsole — claims', () => {
  it('groups claimed issues by assignee, busiest first, then by login', () => {
    const plan = planRoutingConsole(
      [],
      [
        issue(4, [], ['zed']),
        issue(1, [], ['amy', 'zed']),
        issue(9, [], ['bob']),
        issue(2, [], ['amy']),
      ],
    );
    expect(plan.claims).toEqual([
      { login: 'amy', issues: [1, 2] },
      { login: 'zed', issues: [1, 4] },
      { login: 'bob', issues: [9] },
    ]);
  });

  it('counts an issue with no assignee — or no assignee field — as unclaimed', () => {
    const plan = planRoutingConsole([], [issue(6, [], []), issue(3), issue(1, [], ['amy'])]);
    expect(plan.unclaimed).toEqual([3, 6]);
  });

  it('lists an assignee named twice on one issue only once', () => {
    const plan = planRoutingConsole([], [issue(1, [], ['amy', 'amy'])]);
    expect(plan.claims).toEqual([{ login: 'amy', issues: [1] }]);
  });
});

describe('fetchOpenMilestones', () => {
  function rowsOf(count: number, prefix: string): unknown[] {
    return Array.from({ length: count }, (_, index) => ({
      title: `${prefix}${index}`,
      open_issues: 1,
      closed_issues: 1,
      due_on: null,
    }));
  }

  it('asks for open milestones only and stops at the first short page', async () => {
    const calls: string[] = [];
    const exec: CliExec = vi.fn(async (_bin: string, args: readonly string[]) => {
      calls.push(args.join(' '));
      const page = calls.length;
      const rows = page === 1 ? rowsOf(MILESTONE_PAGE_SIZE, 'a') : rowsOf(2, 'b');
      return { code: 0, stdout: JSON.stringify(rows) };
    });
    const result = await fetchOpenMilestones(exec);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.includes('milestones?state=open&'))).toBe(true);
    expect(calls[1]).toContain('page=2');
    expect(result).toHaveLength(MILESTONE_PAGE_SIZE + 2);
  });

  it('never walks past the page ceiling', async () => {
    const exec: CliExec = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify(rowsOf(MILESTONE_PAGE_SIZE, 'm')),
    }));
    await fetchOpenMilestones(exec);
    expect(exec).toHaveBeenCalledTimes(MAX_MILESTONE_PAGES);
  });

  it('reads a failed page as unknown, never as a repo with no milestones', async () => {
    let call = 0;
    const exec: CliExec = vi.fn(async () => {
      call += 1;
      return call === 1
        ? { code: 0, stdout: JSON.stringify(rowsOf(MILESTONE_PAGE_SIZE, 'm')) }
        : { code: 1, stdout: '' };
    });
    expect(await fetchOpenMilestones(exec)).toBeUndefined();
  });

  it('reads unparseable output as unknown too', async () => {
    const exec: CliExec = vi.fn(async () => ({ code: 0, stdout: 'not json' }));
    expect(await fetchOpenMilestones(exec)).toBeUndefined();
  });
});

/** A `gh` double answering the two reads the console makes: the open
 *  milestones (`gh api .../milestones`) and the open issues (`gh issue
 *  list`), each from its own canned stdout. */
function consoleExec(milestones: { code: number; stdout: string }, issues: unknown[]) {
  return vi.fn<CliExec>(async (_bin: string, args: readonly string[]) =>
    args[0] === 'api' ? milestones : { code: 0, stdout: JSON.stringify(issues) },
  );
}

const ghIssue = (number: number, labels: readonly string[], assignees: readonly string[]) => ({
  number,
  title: `issue ${number}`,
  body: '',
  url: `https://github.com/o/r/issues/${number}`,
  labels: labels.map((name) => ({ name })),
  assignees: assignees.map((login) => ({ login })),
});

describe('fetchRoutingConsole', () => {
  it('derives the console from one milestone read and one issue read', async () => {
    const exec = consoleExec(
      {
        code: 0,
        stdout: JSON.stringify([
          {
            title: 'V1',
            open_issues: 1,
            closed_issues: 3,
            due_on: null,
            html_url: 'https://github.com/o/r/milestone/1',
          },
        ]),
      },
      [ghIssue(4, ['priority: high'], ['amy']), ghIssue(2, ['bug'], [])],
    );
    const snapshot = await fetchRoutingConsole(exec);
    expect(snapshot.milestones).toEqual([
      {
        title: 'V1',
        openIssues: 1,
        closedIssues: 3,
        dueOn: null,
        url: 'https://github.com/o/r/milestone/1',
        percentDone: 75,
      },
    ]);
    const queues = Object.fromEntries(
      snapshot.labelQueues.map((queue) => [queue.label, queue.issues]),
    );
    expect(queues['priority: high']).toEqual([4]);
    expect(snapshot.unprioritized).toEqual([2]);
    expect(snapshot.claims).toEqual([{ login: 'amy', issues: [4] }]);
    expect(snapshot.unclaimed).toEqual([2]);
  });

  it('says the milestones are unknown when their read fails, and still routes the issues', async () => {
    const exec = consoleExec({ code: 1, stdout: '' }, [ghIssue(7, ['status: blocked'], ['zed'])]);
    const snapshot = await fetchRoutingConsole(exec);
    expect(snapshot.milestones).toBeNull();
    expect(snapshot.claims).toEqual([{ login: 'zed', issues: [7] }]);
  });

  it('tells a repo with no open milestones apart from an unreadable one', async () => {
    const exec = consoleExec({ code: 0, stdout: '[]' }, []);
    expect((await fetchRoutingConsole(exec)).milestones).toEqual([]);
  });

  it('only reads — a milestone GET and an issue list, nothing that writes', async () => {
    const exec = consoleExec({ code: 0, stdout: '[]' }, []);
    await fetchRoutingConsole(exec);
    const verbs = exec.mock.calls.map(([bin, args]) => [bin, args[0], args[1]?.split('?')[0]]);
    expect(verbs).toEqual(
      expect.arrayContaining([
        ['gh', 'api', 'repos/{owner}/{repo}/milestones'],
        ['gh', 'issue', 'list'],
      ]),
    );
    expect(exec).toHaveBeenCalledTimes(2);
    for (const [, args] of exec.mock.calls) {
      expect(args).not.toContain('--method');
      expect(args).not.toContain('-X');
    }
  });
});

// Epic 0019 additive-only law, the routing console × the claims ledger. The
// pool client posts a claim as a comment and then assigns the claimant; for an
// outside contributor without triage rights the assign fails and only the
// comment lands (claim-ledger.ts, #27). The pool reads that comment as a claim
// and warns the next claimant, but the console grouped claims by assignee
// alone, so it showed the claimed issue under Unclaimed.
describe('routing console × a claim held only by its comment (regression, epic 0019 additive-only law)', () => {
  const NOW = Date.parse('2026-10-04T12:00:00Z');
  const CLAIMANT = 'gabibi555';
  const LABELS = ['pool: ux', 'priority: medium'];

  interface Said {
    readonly login: string;
    readonly at: string;
    readonly body: string;
  }
  const row = (number: number, said: readonly Said[] = [], assignees: readonly string[] = []) => ({
    number,
    title: `issue ${number}`,
    body: '',
    url: `https://github.com/o/r/issues/${number}`,
    labels: LABELS.map((name) => ({ name })),
    assignees: assignees.map((login) => ({ login })),
    comments: said.map(({ login, at, body }) => ({ author: { login }, createdAt: at, body })),
  });
  type Row = ReturnType<typeof row>;

  /** A gh that answers the milestone read with none and `gh issue list` with
   *  only the fields `--json` asked for, as gh does. */
  const projectingGh = (rows: readonly Row[]) =>
    vi.fn<CliExec>(async (_cmd, args) => {
      if (args[0] === 'api') return { code: 0, stdout: '[]' };
      const fields = (args[args.indexOf('--json') + 1] ?? '').split(',');
      const projected = rows.map((r) =>
        Object.fromEntries(Object.entries(r).filter(([key]) => fields.includes(key))),
      );
      return { code: 0, stdout: JSON.stringify(projected) };
    });

  /** The claim comment the pool client posts for CLAIMANT, from its own plan. */
  const claimComment = (number: number): string => {
    const free: PoolIssue = {
      number,
      title: `issue ${number}`,
      url: `https://github.com/o/r/issues/${number}`,
      labels: LABELS,
      assignees: [],
    };
    const decision = planClaimPoolIssue(free, CLAIMANT, NOW);
    const comment = planClaimPoolIssueCommands(free, CLAIMANT, decision).find(
      (command) => command.args[1] === 'comment',
    );
    return comment?.args[comment.args.indexOf('--body') + 1] ?? '';
  };
  const claimed = (number: number, more: readonly Said[] = []): Row =>
    row(number, [
      { login: CLAIMANT, at: '2026-10-03T09:00:00Z', body: claimComment(number) },
      ...more,
    ]);

  it('lists the comment-only claimant under Claims, not the issue under Unclaimed', async () => {
    const snapshot = await fetchRoutingConsole(projectingGh([claimed(5), row(8)]));

    expect(snapshot.claims).toEqual([{ login: CLAIMANT, issues: [5] }]);
    expect(snapshot.unclaimed).toEqual([8]);
  });

  it('reads the issue as unclaimed again once its claimant hands it back', async () => {
    const page = [claimed(5, [{ login: CLAIMANT, at: '2026-10-03T10:00:00Z', body: '/unclaim' }])];
    const snapshot = await fetchRoutingConsole(projectingGh(page));

    expect(snapshot.claims).toEqual([]);
    expect(snapshot.unclaimed).toEqual([5]);
  });

  it('keeps an issue whose comments carry no claim unclaimed', async () => {
    const page = [
      row(3, [{ login: 'octocat', at: '2026-10-03T09:00:00Z', body: 'Is anyone on this?' }]),
    ];
    const snapshot = await fetchRoutingConsole(projectingGh(page));

    expect(snapshot.claims).toEqual([]);
    expect(snapshot.unclaimed).toEqual([3]);
  });

  it('counts a ledger claim nobody is assigned to', () => {
    const claims = claimLedger([], [{ author: CLAIMANT, createdAt: NOW, body: claimComment(5) }]);

    expect(planRoutingConsole([], [issue(5, LABELS)]).unclaimed).toEqual([5]);
    const plan = planRoutingConsole([], [{ ...issue(5, LABELS), claims }]);
    expect(plan.claims).toEqual([{ login: CLAIMANT, issues: [5] }]);
    expect(plan.unclaimed).toEqual([]);
  });

  it('keeps every assignee, even one the ledger reads as released, and names a login once', () => {
    const released = claimLedger(
      ['amy'],
      [
        { author: CLAIMANT, createdAt: NOW, body: claimComment(5) },
        { author: 'maintainer', createdAt: NOW + 1, body: 'Releasing @amy: quiet for 14 days.' },
      ],
    );
    const both = claimLedger(
      [CLAIMANT],
      [{ author: CLAIMANT, createdAt: NOW, body: claimComment(7) }],
    );
    expect(released.map((claim) => claim.login)).toEqual([CLAIMANT]);

    const plan = planRoutingConsole(
      [],
      [
        { ...issue(5, LABELS, ['amy']), claims: released },
        { ...issue(6, LABELS, ['zed']), claims: [] },
        { ...issue(7, LABELS, [CLAIMANT]), claims: both },
      ],
    );

    expect(plan.claims).toEqual([
      { login: CLAIMANT, issues: [5, 7] },
      { login: 'amy', issues: [5] },
      { login: 'zed', issues: [6] },
    ]);
    expect(plan.unclaimed).toEqual([]);
  });
});

describe('createRoutingConsoleApi', () => {
  it('resolves the derived console', async () => {
    const api = createRoutingConsoleApi(consoleExec({ code: 0, stdout: '[]' }, []));
    const snapshot = await api();
    expect(snapshot.milestones).toEqual([]);
    expect(snapshot.labelQueues.map((queue) => queue.label)).toEqual(ROUTING_QUEUE_LABELS);
  });

  it('answers the unreadable console rather than rejecting when exec throws', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('gh unavailable'));
    await expect(createRoutingConsoleApi(exec)()).resolves.toEqual(UNREADABLE_ROUTING_CONSOLE);
  });

  it('marks the unreadable console unknown, never an empty milestone list', () => {
    expect(UNREADABLE_ROUTING_CONSOLE.milestones).toBeNull();
    expect(UNREADABLE_ROUTING_CONSOLE.labelQueues.map((queue) => queue.label)).toEqual(
      ROUTING_QUEUE_LABELS,
    );
  });
});

/** A store holding one project, `p1`, rooted at `dir`. */
function seedProject(dir: string): string {
  const dbPath = join(dir, 'a.db');
  const s = openStore(dbPath);
  migrate(s);
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES ('p1', 'p1', 'p1', ?, 'flying', NULL, 100, 100)`,
    )
    .run(dir);
  s.close();
  return dbPath;
}

/** git answers `originUrl` for the project's origin, or fails when it is
 *  null; gh answers one milestone and one issue whichever repository it is
 *  asked about. */
function projectGh(originUrl: string | null) {
  return vi.fn<CliExec>(async (bin: string, args: readonly string[]) => {
    if (bin === 'git') {
      return originUrl === null ? { code: 2, stdout: '' } : { code: 0, stdout: `${originUrl}\n` };
    }
    if (args[0] === 'api') {
      return {
        code: 0,
        stdout: JSON.stringify([{ title: 'V1', open_issues: 1, closed_issues: 1, due_on: null }]),
      };
    }
    return { code: 0, stdout: JSON.stringify([ghIssue(9, ['priority: high'], ['amy'])]) };
  });
}

/** The repository each read named: the milestone path's `owner/repo`, and
 *  the issue list's `--repo` (`undefined` when it named none). */
function reposRead(exec: ReturnType<typeof projectGh>): readonly (string | undefined)[] {
  const gh = exec.mock.calls.filter(([bin]) => bin === 'gh').map(([, args]) => args);
  const milestones = gh.find((args) => args[0] === 'api')?.[1] ?? '';
  const list = gh.find((args) => args[0] === 'issue') ?? [];
  const at = list.indexOf('--repo');
  return [/^repos\/(.+)\/milestones\?/.exec(milestones)?.[1], at === -1 ? undefined : list[at + 1]];
}

describe("readProjectRoutingConsole — a project page reads its own repository's page", () => {
  async function withProject(run: (dbPath: string) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-routing-console-repo-'));
    try {
      await run(seedProject(dir));
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  }

  it("reads a checkout of another repository from that repository, never gh's own", async () => {
    await withProject(async (dbPath) => {
      const exec = projectGh('https://github.com/someone-else/their-project.git');

      const snapshot = await readProjectRoutingConsole(dbPath, exec)('p1');

      expect(reposRead(exec)).toEqual(['someone-else/their-project', 'someone-else/their-project']);
      expect(snapshot.milestones?.map((m) => m.title)).toEqual(['V1']);
      expect(snapshot.claims).toEqual([{ login: 'amy', issues: [9] }]);
    });
  });

  it('names the repository even when it is the one gh acts on', async () => {
    await withProject(async (dbPath) => {
      const exec = projectGh('git@github.com:octocat/hello-world.git');

      await readProjectRoutingConsole(dbPath, exec)('p1');

      expect(reposRead(exec)).toEqual(['octocat/hello-world', 'octocat/hello-world']);
    });
  });

  it('reads the repository gh acts on for a project with no GitHub origin, or an unknown one', async () => {
    await withProject(async (dbPath) => {
      const unbound = projectGh(null);
      const unknown = projectGh('https://github.com/someone-else/their-project.git');

      await readProjectRoutingConsole(dbPath, unbound)('p1');
      await readProjectRoutingConsole(dbPath, unknown)('nope');

      expect(reposRead(unbound)).toEqual(['{owner}/{repo}', undefined]);
      expect(reposRead(unknown)).toEqual(['{owner}/{repo}', undefined]);
      expect(unknown.mock.calls.map(([bin]) => bin)).toEqual(['gh', 'gh']);
    });
  });

  it('reads the home page without asking git which repository a project is', async () => {
    await withProject(async (dbPath) => {
      const exec = projectGh('https://github.com/someone-else/their-project.git');

      await readProjectRoutingConsole(dbPath, exec)();

      expect(exec.mock.calls.map(([bin]) => bin)).toEqual(['gh', 'gh']);
      expect(reposRead(exec)).toEqual(['{owner}/{repo}', undefined]);
    });
  });

  it('answers the unreadable console rather than rejecting when the store cannot be opened', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-routing-console-nostore-'));
    try {
      const exec = projectGh(null);
      const missing = join(dir, 'no-such-dir', 'a.db');

      await expect(readProjectRoutingConsole(missing, exec)('p1')).resolves.toEqual(
        UNREADABLE_ROUTING_CONSOLE,
      );
      expect(exec).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});
