// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE HUMAN MERGE BUTTON (operator, 2026-09-09: "איך אני עושה את זה דרך
 * הדשבורד עצמו?").
 *
 * The KEEPER security-hard rule queues every gate-path PR for a human and
 * refuses to merge it. That half was right; the other half — where the
 * human's answer LIVES — did not exist, so the panel queued a PR and then
 * sent the maintainer to a browser.
 *
 * This is the merge that only a click can cause, and these lock the four
 * things it re-verifies fresh from gh before any `gh pr merge` is planned.
 * Every refusal path asserts that NO merge command ran — a guard that
 * merges anyway while reporting a refusal would be the worst failure this
 * file could have.
 */

import { describe, it, expect } from 'vitest';
import {
  createHumanMergeApi,
  createUpdateBranchApi,
  createRerunChecksApi,
  runIdFromCheckUrl,
  judgeHumanMerge,
} from '../../src/flight/human-merge.js';
import type { PrReviewCandidate } from '../../src/flight/pr-review.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const GREEN: PrReviewCandidate = {
  number: 33,
  title: 'feat(engine): deterministic diff-size gate',
  gateStatus: 'pass',
  mergeable: true,
  touchedPaths: ['packages/engine/src/diff-size-gate.ts'],
  headRefOid: 'abc123',
  checkRuns: [
    { name: 'verify (ubuntu-latest)', state: 'pass' },
    { name: 'verify (windows-latest)', state: 'pass' },
    { name: 'reuse lint (optional)', state: 'fail', optional: true },
  ],
};

describe('judgeHumanMerge — the four things re-verified before a merge', () => {
  it('allows a PR that is open, unmoved, all-green and mergeable', () => {
    expect(judgeHumanMerge(GREEN, 'abc123')).toEqual({
      allow: true,
      reason: 'Every gating check passed and GitHub reports it mergeable.',
    });
  });

  it('refuses when the PR is no longer open', () => {
    expect(judgeHumanMerge(undefined, 'abc123').allow).toBe(false);
    expect(judgeHumanMerge(undefined, 'abc123').reason).toContain('no longer open');
  });

  it('refuses when the head moved since the card was drawn', () => {
    const verdict = judgeHumanMerge(GREEN, 'stale-sha');
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('head moved');
  });

  it('does not assert the head when the operator sent none', () => {
    expect(judgeHumanMerge(GREEN, undefined).allow).toBe(true);
  });

  it('refuses on a red check and names it', () => {
    const red = {
      ...GREEN,
      checkRuns: [
        { name: 'verify (ubuntu-latest)', state: 'pass' as const },
        { name: 'verify (windows-latest)', state: 'fail' as const },
      ],
    };
    const verdict = judgeHumanMerge(red, 'abc123');
    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('verify (windows-latest) (fail)');
  });

  it('refuses while a check is still running', () => {
    const moving = {
      ...GREEN,
      checkRuns: [{ name: 'verify (windows-latest)', state: 'running' as const }],
    };
    expect(judgeHumanMerge(moving, 'abc123').allow).toBe(false);
  });

  it('ignores an (optional) job that failed — it does not gate the merge', () => {
    expect(judgeHumanMerge(GREEN, 'abc123').allow).toBe(true);
  });

  it('refuses when nothing gating has reported at all — no green to merge on', () => {
    const bare = { ...GREEN, checkRuns: [] };
    expect(judgeHumanMerge(bare, 'abc123').reason).toContain('no green');
  });

  it('refuses a conflicting PR, and says so differently from an uncomputed one', () => {
    const conflicting = { ...GREEN, mergeable: false };
    const uncomputed = { ...GREEN, mergeable: false, mergeStateUnknown: true as const };
    expect(judgeHumanMerge(conflicting, 'abc123').reason).toContain('conflicting');
    expect(judgeHumanMerge(uncomputed, 'abc123').reason).toContain('not computed');
  });

  it('refuses a branch behind base, which protection would reject anyway', () => {
    const behind = { ...GREEN, behindBase: true as const };
    expect(judgeHumanMerge(behind, 'abc123').reason).toContain('behind base');
  });
});

function execReturning(candidates: readonly PrReviewCandidate[], calls: string[][]): CliExec {
  return async (bin, args) => {
    calls.push([bin, ...args]);
    if (args[0] === 'pr' && args[1] === 'list') {
      return {
        code: 0,
        stdout: JSON.stringify(
          candidates.map((c) => ({
            number: c.number,
            title: c.title,
            mergeable: c.mergeable ? 'MERGEABLE' : 'CONFLICTING',
            headRefOid: c.headRefOid,
            statusCheckRollup: (c.checkRuns ?? []).map((r) => ({
              name: r.name,
              conclusion: r.state === 'pass' ? 'SUCCESS' : r.state === 'fail' ? 'FAILURE' : null,
              status: r.state === 'running' ? 'IN_PROGRESS' : 'COMPLETED',
              detailsUrl: r.url,
            })),
            files: c.touchedPaths.map((path) => ({ path })),
            labels: [],
            latestReviews: [],
          })),
        ),
      };
    }
    return { code: 0, stdout: '' };
  };
}

function execReturningRaw(pr: PrReviewCandidate, calls: string[][]): CliExec {
  const base = execReturning([pr], calls);
  return async (bin, args) => {
    if (args[0] === 'run') {
      calls.push([bin, ...args]);
      return { code: 0, stdout: '' };
    }
    return base(bin, args);
  };
}

describe('createHumanMergeApi — only a click can cause a merge', () => {
  it('squash-merges and deletes the branch when everything re-verifies', async () => {
    const calls: string[][] = [];
    const merge = createHumanMergeApi(execReturning([GREEN], calls));

    const result = await merge(33, 'abc123');

    expect(result.merged).toBe(true);
    const mergeCall = calls.find((c) => c[1] === 'pr' && c[2] === 'merge');
    expect(mergeCall).toEqual(['gh', 'pr', 'merge', '33', '--squash', '--delete-branch']);
  });

  it('runs NO merge command when the head moved', async () => {
    const calls: string[][] = [];
    const merge = createHumanMergeApi(execReturning([GREEN], calls));

    const result = await merge(33, 'a-different-sha');

    expect(result.merged).toBe(false);
    expect(calls.some((c) => c[2] === 'merge')).toBe(false);
  });

  it('runs NO merge command when a check is red', async () => {
    const red = {
      ...GREEN,
      checkRuns: [{ name: 'verify (windows-latest)', state: 'fail' as const }],
    };
    const calls: string[][] = [];
    const merge = createHumanMergeApi(execReturning([red], calls));

    const result = await merge(33, 'abc123');

    expect(result.merged).toBe(false);
    expect(result.reason).toContain('Not every check has passed');
    expect(calls.some((c) => c[2] === 'merge')).toBe(false);
  });

  it('runs NO merge command for a PR that is not in the open list', async () => {
    const calls: string[][] = [];
    const merge = createHumanMergeApi(execReturning([GREEN], calls));

    const result = await merge(999, undefined);

    expect(result.merged).toBe(false);
    expect(calls.some((c) => c[2] === 'merge')).toBe(false);
  });

  it('reports honestly when gh itself refused the merge', async () => {
    const calls: string[][] = [];
    const base = execReturning([GREEN], calls);
    const refusing: CliExec = async (bin, args) =>
      args[1] === 'merge' ? { code: 1, stdout: '' } : base(bin, args);
    const merge = createHumanMergeApi(refusing);

    const result = await merge(33, 'abc123');

    expect(result.merged).toBe(false);
    expect(result.reason).toContain('exit 1');
  });
});

/**
 * THE UPDATE-BRANCH COMPANION (operator, 2026-09-09): the human-merge
 * refusal read "the branch is behind base and protection requires it up
 * to date — update the branch first", and nothing in the app could carry
 * that instruction out. A refusal that names an action must offer it.
 */
describe('createUpdateBranchApi — the way out of the one blocked state that has one', () => {
  function viewExec(view: Record<string, unknown>, calls: string[][], updateCode = 0): CliExec {
    return async (bin, args) => {
      calls.push([bin, ...args]);
      if (args[1] === 'view') return { code: 0, stdout: JSON.stringify(view) };
      if (args[1] === 'update-branch') return { code: updateCode, stdout: '' };
      return { code: 0, stdout: '' };
    };
  }

  it('updates an open PR whose author allowed maintainer edits', async () => {
    const calls: string[][] = [];
    const update = createUpdateBranchApi(
      viewExec({ state: 'OPEN', maintainerCanModify: true }, calls),
    );

    const result = await update(34);

    expect(result.updated).toBe(true);
    expect(result.reason).toContain('re-running on the new head');
    expect(calls.some((c) => c[2] === 'update-branch')).toBe(true);
  });

  it('refuses — and pushes nothing — when the author did not allow maintainer edits', async () => {
    const calls: string[][] = [];
    const update = createUpdateBranchApi(
      viewExec({ state: 'OPEN', maintainerCanModify: false }, calls),
    );

    const result = await update(34);

    expect(result.updated).toBe(false);
    expect(result.reason).toContain('has not allowed maintainer edits');
    expect(calls.some((c) => c[2] === 'update-branch')).toBe(false);
  });

  it('refuses on a PR that is not open', async () => {
    const calls: string[][] = [];
    const update = createUpdateBranchApi(
      viewExec({ state: 'MERGED', maintainerCanModify: true }, calls),
    );

    expect((await update(34)).updated).toBe(false);
    expect(calls.some((c) => c[2] === 'update-branch')).toBe(false);
  });

  it('reports honestly when gh refuses the update', async () => {
    const calls: string[][] = [];
    const update = createUpdateBranchApi(
      viewExec({ state: 'OPEN', maintainerCanModify: true }, calls, 1),
    );

    const result = await update(34);

    expect(result.updated).toBe(false);
    expect(result.reason).toContain('already be up to date');
  });

  it('survives an unreadable gh response instead of throwing at the route', async () => {
    const broken: CliExec = async (_bin, args) =>
      args[1] === 'view' ? { code: 0, stdout: 'not json' } : { code: 0, stdout: '' };

    expect((await createUpdateBranchApi(broken)(34)).updated).toBe(false);
  });
});

/**
 * THE RE-RUN VERB — the last dead end (operator, 2026-09-09: "אחרי שהיה
 * ERROR אז הכפתור עוצר ואי אפשר לנסות להגיש שוב, איך פותרים?").
 *
 * A red check disabled the merge button with an honest reason and no way
 * to act on it. One of the two reds that day was our own jsdom teardown
 * race, in a run where all 9,865 tests passed — a flake that could only
 * be cleared by a rerun the app could not perform.
 */
describe('runIdFromCheckUrl', () => {
  it('reads the workflow run id out of a check’s own log url', () => {
    expect(
      runIdFromCheckUrl('https://github.com/o/r/actions/runs/34289745510/job/102273433807'),
    ).toBe('34289745510');
  });

  it('returns null for an external status link or no url at all', () => {
    expect(runIdFromCheckUrl('https://vercel.com/x/deployments/abc')).toBeNull();
    expect(runIdFromCheckUrl(undefined)).toBeNull();
  });
});

describe('createRerunChecksApi — restarts only what failed', () => {
  const RED: PrReviewCandidate = {
    ...GREEN,
    checkRuns: [
      { name: 'verify (ubuntu-latest)', state: 'pass' },
      {
        name: 'verify (macos-latest)',
        state: 'fail',
        url: 'https://github.com/o/r/actions/runs/900/job/1',
      },
      {
        name: 'e2e',
        state: 'fail',
        url: 'https://github.com/o/r/actions/runs/900/job/2',
      },
    ],
  };

  it('re-runs each distinct run once with --failed, not the whole matrix', async () => {
    const calls: string[][] = [];
    const rerun = createRerunChecksApi(execReturningRaw(RED, calls));

    const result = await rerun(33);

    expect(result.rerun).toBe(true);
    expect(result.runs).toBe(1);
    const reruns = calls.filter((c) => c[1] === 'run' && c[2] === 'rerun');
    expect(reruns).toHaveLength(1);
    expect(reruns[0]).toEqual(['gh', 'run', 'rerun', '900', '--failed']);
  });

  it('refuses when nothing is failing', async () => {
    const calls: string[][] = [];
    const rerun = createRerunChecksApi(execReturningRaw(GREEN, calls));

    const result = await rerun(33);

    expect(result.rerun).toBe(false);
    expect(result.reason).toContain('nothing to re-run');
    expect(calls.some((c) => c[2] === 'rerun')).toBe(false);
  });

  it('refuses when the red check is not an Actions run we can restart', async () => {
    const external = {
      ...GREEN,
      checkRuns: [{ name: 'vercel', state: 'fail' as const, url: 'https://vercel.com/x' }],
    };
    const calls: string[][] = [];

    const result = await createRerunChecksApi(execReturningRaw(external, calls))(33);

    expect(result.rerun).toBe(false);
    expect(calls.some((c) => c[2] === 'rerun')).toBe(false);
  });

  it('reports honestly when gh refuses every run', async () => {
    const calls: string[][] = [];
    const base = execReturningRaw(RED, calls);
    const refusing: CliExec = async (bin, args) =>
      args[0] === 'run' ? { code: 1, stdout: '' } : base(bin, args);

    expect((await createRerunChecksApi(refusing)(33)).rerun).toBe(false);
  });
});
