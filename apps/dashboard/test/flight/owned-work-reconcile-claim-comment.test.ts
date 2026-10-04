// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import { runOwnedWorkSweep } from '../../src/flight/owned-work-reconcile.js';
import { claimAndQueuePoolIssueTask } from '../../src/flight/pool-client.js';
import { HUMAN_CLOSES_MARKER } from '../../src/flight/claim-contract.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

// Epic 0019 additive-only law, the claim flow × the owned-work takeoff sweep.
// The pool client posts a claim as a comment and then assigns the claimant;
// for an outside contributor without triage rights the assign fails and only
// the comment lands (claim-ledger.ts, #27). The claim still queues a focused,
// contract-marked board task (pool-client.ts queueClaimedPoolIssueTask: "the
// claimant's own pilot now delivers slices against it first"). The takeoff
// sweep released every focused contract task that `gh issue list --assignee
// @me` did not list, so the next flight un-focused the claim it had just
// queued, while the pool, the reaper and every list still read it as held.
describe('owned-work sweep × a claim held only by its comment (regression, epic 0019 additive-only law)', () => {
  const ENGINE = '/engine';
  const CLAIMANT = 'gabibi555';
  const ISSUE = 5;
  const TASK = `github-${ISSUE}`;
  const CLAIMED_AT = '2026-10-03T09:00:00Z';

  interface Said {
    readonly login: string;
    readonly at: string;
    readonly body: string;
  }
  const issueRow = (said: readonly Said[], state = 'OPEN') => ({
    number: ISSUE,
    title: 'Fix the thing',
    url: `https://github.com/o/r/issues/${ISSUE}`,
    state,
    updatedAt: CLAIMED_AT,
    labels: [{ name: 'pool: ux' }],
    assignees: [] as { login: string }[],
    comments: said.map(({ login, at, body }) => ({ author: { login }, createdAt: at, body })),
  });

  function withStore(run: (s: Store) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'ap-dash-owned-work-claim-comment-'));
    const s = openStore(join(dir, 'a.db'));
    migrate(s);
    s.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', NULL, 100, 100)`,
      )
      .run();
    return run(s).finally(() => {
      s.close();
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    });
  }

  function focusOf(s: Store): number | undefined {
    const row = s.db.prepare('SELECT focus FROM tasks WHERE id = ?').get(TASK) as
      { focus: number } | undefined;
    return row?.focus;
  }

  /** The claim as the pool client makes it for CLAIMANT, against a GitHub
   *  that refuses the assign: returns the claim comment that landed. */
  async function claimWithFailedAssign(s: Store): Promise<Said> {
    const landed: Said[] = [];
    const gh = vi.fn<CliExec>(async (_cmd, args) => {
      if (args[0] === 'api' && args[1] === 'user') {
        return { code: 0, stdout: JSON.stringify({ login: CLAIMANT }) };
      }
      if (args[0] === 'issue' && args[1] === 'list') {
        return { code: 0, stdout: JSON.stringify([issueRow([])]) };
      }
      if (args[0] === 'issue' && args[1] === 'comment') {
        const body = args[args.indexOf('--body') + 1] ?? '';
        landed.push({ login: CLAIMANT, at: CLAIMED_AT, body });
        return { code: 0, stdout: '' };
      }
      // `issue edit --add-assignee`: no triage rights on the repo.
      return { code: 1, stdout: '' };
    });
    const result = await claimAndQueuePoolIssueTask(ISSUE, 'p1', gh, s, () => 100);
    expect(result.decision.decision).toBe('claim');
    expect(result.focused).toBe(true);
    expect(landed).toHaveLength(1);
    return landed[0] as Said;
  }

  /** GitHub after the claim: the viewer is assigned nothing, and the issue
   *  itself carries `said` (and is in `state`). */
  const githubAfter = (viewer: string, said: readonly Said[], state = 'OPEN') =>
    vi.fn<CliExec>(async (_cmd, args) => {
      if (args[0] === 'api' && args[1] === 'user') {
        return { code: 0, stdout: JSON.stringify({ login: viewer }) };
      }
      if (args[0] === 'issue' && args[1] === 'list') return { code: 0, stdout: '[]' };
      if (args[0] === 'issue' && args[1] === 'view' && args[2] === String(ISSUE)) {
        return { code: 0, stdout: JSON.stringify(issueRow(said, state)) };
      }
      return { code: 0, stdout: '' };
    });

  it('keeps the claimant’s task focused at the next takeoff', async () => {
    await withStore(async (s) => {
      const claim = await claimWithFailedAssign(s);

      const result = await runOwnedWorkSweep(
        s,
        'p1',
        () => 200,
        githubAfter(CLAIMANT, [claim]),
        ENGINE,
        ENGINE,
      );

      expect(result?.released).toBe(0);
      expect(result?.plan.release).toEqual([]);
      expect(focusOf(s)).toBe(1);
    });
  });

  it('reads the claimant’s login in any casing, as GitHub does', async () => {
    await withStore(async (s) => {
      const claim = await claimWithFailedAssign(s);

      const result = await runOwnedWorkSweep(
        s,
        'p1',
        () => 200,
        githubAfter('Gabibi555', [claim]),
        ENGINE,
        ENGINE,
      );

      expect(result?.released).toBe(0);
      expect(focusOf(s)).toBe(1);
    });
  });

  it('still releases the task once its claimant hands the claim back', async () => {
    await withStore(async (s) => {
      const claim = await claimWithFailedAssign(s);
      const handBack: Said = { login: CLAIMANT, at: '2026-10-03T10:00:00Z', body: '/unclaim' };

      const result = await runOwnedWorkSweep(
        s,
        'p1',
        () => 200,
        githubAfter(CLAIMANT, [claim, handBack]),
        ENGINE,
        ENGINE,
      );

      expect(result?.plan.release).toEqual([TASK]);
      expect(focusOf(s)).toBe(0);
      const body = s.db.prepare('SELECT body FROM tasks WHERE id = ?').get(TASK) as {
        body: string;
      };
      expect(body.body).toContain(HUMAN_CLOSES_MARKER);
    });
  });

  it('still releases the task when the comment-only claim is someone else’s', async () => {
    await withStore(async (s) => {
      const claim = await claimWithFailedAssign(s);

      const result = await runOwnedWorkSweep(
        s,
        'p1',
        () => 200,
        githubAfter('octocat', [claim]),
        ENGINE,
        ENGINE,
      );

      expect(result?.plan.release).toEqual([TASK]);
      expect(focusOf(s)).toBe(0);
    });
  });

  it('still releases the task once the issue is closed', async () => {
    await withStore(async (s) => {
      const claim = await claimWithFailedAssign(s);

      const result = await runOwnedWorkSweep(
        s,
        'p1',
        () => 200,
        githubAfter(CLAIMANT, [claim], 'CLOSED'),
        ENGINE,
        ENGINE,
      );

      expect(result?.plan.release).toEqual([TASK]);
      expect(focusOf(s)).toBe(0);
    });
  });

  it('reads no issue when nothing is up for release, as before', async () => {
    await withStore(async (s) => {
      const gh = githubAfter(CLAIMANT, []);

      const result = await runOwnedWorkSweep(s, 'p1', () => 200, gh, ENGINE, ENGINE);

      expect(result?.plan).toEqual({ upserts: [], refocus: [], release: [] });
      expect(gh.mock.calls.some(([, args]) => args[1] === 'view')).toBe(false);
    });
  });
});
