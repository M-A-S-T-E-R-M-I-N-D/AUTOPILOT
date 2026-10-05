// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0019 S4 (board web-mtrh1hn3-8x9f0z), steering from the dashboard's
 * side: routing an issue the console lists under "No priority yet" adds one
 * house priority label to it, maintainer-only, after a fresh read of the
 * issue, on the repository the console was read from.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate } from '@autopilot/store';
import type { CliExec } from '../../src/connection/cli-probe.js';
import {
  createRoutingConsoleRouteApi,
  housePriorityLabel,
  planRouteIssue,
} from '../../src/flight/routing-console-execute.js';
import { ROUTING_PRIORITY_LABELS } from '../../src/flight/routing-console.js';

const OPEN = { number: 7, state: 'open' as const, labels: ['bug'] };

describe('housePriorityLabel', () => {
  it('spells a priority label the way the house taxonomy does, in any casing', () => {
    expect(ROUTING_PRIORITY_LABELS).toContain('priority: high');
    expect(housePriorityLabel('Priority: HIGH')).toBe('priority: high');
  });

  it('knows no status label or stranger as a priority', () => {
    expect(housePriorityLabel('status: blocked')).toBeUndefined();
    expect(housePriorityLabel('priority: urgent-ish')).toBeUndefined();
    expect(housePriorityLabel('')).toBeUndefined();
  });
});

describe('planRouteIssue', () => {
  it('adds the house label to an open issue no priority label routes', () => {
    expect(planRouteIssue(7, 'Priority: High', OPEN)).toEqual({
      route: true,
      argv: ['issue', 'edit', '7', '--add-label', 'priority: high'],
    });
  });

  it("names a project's own repository on the edit with --repo", () => {
    expect(planRouteIssue(7, 'priority: high', OPEN, 'someone-else/their-project')).toEqual({
      route: true,
      argv: [
        'issue',
        'edit',
        '7',
        '--add-label',
        'priority: high',
        '--repo',
        'someone-else/their-project',
      ],
    });
  });

  it('refuses a label outside the priority group, even on a routable issue', () => {
    expect(planRouteIssue(7, 'status: blocked', OPEN)).toEqual({
      route: false,
      refusedReason: 'not-a-priority-label',
    });
  });

  it('never routes an issue it could not read', () => {
    expect(planRouteIssue(7, 'priority: high', null)).toEqual({
      route: false,
      refusedReason: 'issue-unreadable',
    });
  });

  it('refuses a closed issue', () => {
    expect(planRouteIssue(7, 'priority: high', { ...OPEN, state: 'closed' })).toEqual({
      route: false,
      refusedReason: 'issue-closed',
    });
  });

  it('refuses an issue routed since the last poll, in any casing, rather than giving it a second priority', () => {
    expect(planRouteIssue(7, 'priority: high', { ...OPEN, labels: ['Priority: Low'] })).toEqual({
      route: false,
      refusedReason: 'already-prioritized',
    });
  });

  it('routes an issue whose only labels are status marks', () => {
    expect(planRouteIssue(7, 'priority: low', { ...OPEN, labels: ['status: blocked'] }).route).toBe(
      true,
    );
  });
});

interface FakeGh {
  /** Who `gh api user` says is acting; null fails the read. */
  readonly login?: string | null;
  /** The repository `gh repo view` resolves. */
  readonly ghRepo?: string;
  /** The project checkout's origin; null fails `git remote get-url`. */
  readonly origin?: string | null;
  /** The issue as `gh issue view` reads it; null fails the read. */
  readonly issue?: { state: 'OPEN' | 'CLOSED'; labels: string[] } | null;
  /** `gh issue edit`'s exit code and stderr. */
  readonly edit?: { code: number; stderr?: string };
}

function fakeGh(opts: FakeGh = {}) {
  const login = opts.login === undefined ? 'maestro' : opts.login;
  const ghRepo = opts.ghRepo ?? 'maestro/autopilot';
  const issue = opts.issue === undefined ? { state: 'OPEN', labels: ['bug'] } : opts.issue;
  return vi.fn<CliExec>(async (bin: string, args: readonly string[]) => {
    if (bin === 'git') {
      const origin = opts.origin ?? null;
      return origin === null ? { code: 2, stdout: '' } : { code: 0, stdout: `${origin}\n` };
    }
    if (args[0] === 'api' && args[1] === 'user') {
      return login === null
        ? { code: 1, stdout: '' }
        : { code: 0, stdout: JSON.stringify({ login }) };
    }
    if (args[0] === 'repo' && args[1] === 'view') {
      const url = `https://github.com/${ghRepo}`;
      return { code: 0, stdout: JSON.stringify({ nameWithOwner: ghRepo, url, isPrivate: false }) };
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      if (issue === null) return { code: 1, stdout: '' };
      const labels = issue.labels.map((name) => ({ name }));
      const number = Number(args[2]);
      return {
        code: 0,
        stdout: JSON.stringify({ number, state: issue.state, labels, assignees: [] }),
      };
    }
    if (args[0] === 'issue' && args[1] === 'edit') {
      return { code: opts.edit?.code ?? 0, stdout: '', stderr: opts.edit?.stderr ?? '' };
    }
    return { code: 1, stdout: '' };
  });
}

function editCalls(exec: ReturnType<typeof fakeGh>): readonly (readonly string[])[] {
  return exec.mock.calls
    .filter(([bin, args]) => bin === 'gh' && args[0] === 'issue' && args[1] === 'edit')
    .map(([, args]) => args);
}

/** A store holding one project, `p1`, rooted at a fresh temp dir. */
async function withProject(run: (dbPath: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'ap-dash-routing-console-route-'));
  try {
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
    await run(dbPath);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}

describe('createRoutingConsoleRouteApi — the home page acts on the repository gh resolves', () => {
  it("routes an unprioritized issue for the repository's maintainer", async () => {
    const exec = fakeGh();

    const result = await createRoutingConsoleRouteApi('unused.db', exec)(7, 'Priority: High');

    expect(result).toEqual({ issue: 7, label: 'priority: high', routed: true });
    expect(editCalls(exec)).toEqual([['issue', 'edit', '7', '--add-label', 'priority: high']]);
  });

  it('refuses a label outside the priority group before asking gh anything', async () => {
    const exec = fakeGh();

    const result = await createRoutingConsoleRouteApi('unused.db', exec)(7, 'status: blocked');

    expect(result).toEqual({
      issue: 7,
      label: 'status: blocked',
      routed: false,
      refusedReason: 'not-a-priority-label',
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses a guest, and never reads or edits the issue', async () => {
    const exec = fakeGh({ login: 'visitor' });

    const result = await createRoutingConsoleRouteApi('unused.db', exec)(7, 'priority: high');

    expect(result.routed).toBe(false);
    expect(result.refusedReason).toBe('guest');
    expect(exec.mock.calls.some(([, args]) => args[0] === 'issue')).toBe(false);
  });

  it('refuses when gh cannot say who is acting', async () => {
    const exec = fakeGh({ login: null });

    const result = await createRoutingConsoleRouteApi('unused.db', exec)(7, 'priority: high');

    expect(result.refusedReason).toBe('identity-unresolved');
    expect(editCalls(exec)).toEqual([]);
  });

  it('re-reads the issue and refuses one routed since the panel last polled', async () => {
    const exec = fakeGh({ issue: { state: 'OPEN', labels: ['priority: low'] } });

    const result = await createRoutingConsoleRouteApi('unused.db', exec)(7, 'priority: high');

    expect(result.refusedReason).toBe('already-prioritized');
    expect(editCalls(exec)).toEqual([]);
  });

  it('refuses an issue it cannot read, and one that closed', async () => {
    const unread = await createRoutingConsoleRouteApi('unused.db', fakeGh({ issue: null }))(
      7,
      'priority: high',
    );
    const closed = await createRoutingConsoleRouteApi(
      'unused.db',
      fakeGh({ issue: { state: 'CLOSED', labels: [] } }),
    )(7, 'priority: high');

    expect(unread.refusedReason).toBe('issue-unreadable');
    expect(closed.refusedReason).toBe('issue-closed');
  });

  it("reports gh's own words when the label edit fails", async () => {
    const exec = fakeGh({
      edit: { code: 1, stderr: "could not add label: 'priority: high' not found\n" },
    });

    const result = await createRoutingConsoleRouteApi('unused.db', exec)(7, 'priority: high');

    expect(result).toEqual({
      issue: 7,
      label: 'priority: high',
      routed: false,
      error: "could not add label: 'priority: high' not found",
    });
  });
});

describe("createRoutingConsoleRouteApi — a project page acts on its own checkout's repository", () => {
  it('pins the read and the edit to the origin, names it, and judges the role against its owner', async () => {
    await withProject(async (dbPath) => {
      const exec = fakeGh({
        login: 'someone-else',
        ghRepo: 'maestro/autopilot',
        origin: 'git@github.com:someone-else/their-project.git',
      });

      const result = await createRoutingConsoleRouteApi(dbPath, exec)(7, 'priority: high', 'p1');

      expect(result).toEqual({
        issue: 7,
        label: 'priority: high',
        repo: 'someone-else/their-project',
        routed: true,
      });
      const issueCalls = exec.mock.calls.filter(([, args]) => args[0] === 'issue');
      expect(issueCalls).toHaveLength(2);
      for (const [, args] of issueCalls) {
        expect(args.slice(-2)).toEqual(['--repo', 'someone-else/their-project']);
      }
      expect(exec.mock.calls.some(([, args]) => args[0] === 'repo')).toBe(false);
    });
  });

  it("refuses the maintainer of gh's own repository on a project another login owns", async () => {
    await withProject(async (dbPath) => {
      const exec = fakeGh({ origin: 'https://github.com/someone-else/their-project.git' });

      const result = await createRoutingConsoleRouteApi(dbPath, exec)(7, 'priority: high', 'p1');

      expect(result.repo).toBe('someone-else/their-project');
      expect(result.refusedReason).toBe('guest');
      expect(editCalls(exec)).toEqual([]);
    });
  });

  it('acts on the repository gh resolves for a project with no GitHub origin or an unknown id', async () => {
    await withProject(async (dbPath) => {
      const unbound = fakeGh({ origin: null });
      const unknown = fakeGh({ origin: 'https://github.com/someone-else/their-project.git' });

      const fromUnbound = await createRoutingConsoleRouteApi(dbPath, unbound)(
        7,
        'priority: high',
        'p1',
      );
      const fromUnknown = await createRoutingConsoleRouteApi(dbPath, unknown)(
        7,
        'priority: high',
        'no-such-project',
      );

      for (const result of [fromUnbound, fromUnknown]) {
        expect(result).toEqual({ issue: 7, label: 'priority: high', routed: true });
      }
      expect(editCalls(unbound)).toEqual([['issue', 'edit', '7', '--add-label', 'priority: high']]);
    });
  });
});
