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

  it('does not read a live PR that reports no head SHA as "moved" — absence is not movement', () => {
    const { headRefOid: _head, ...noHead } = GREEN;

    const verdict = judgeHumanMerge(noHead, 'abc123');

    expect(verdict.allow).toBe(true);
    expect(verdict.reason).not.toContain('head moved');
  });

  it('excludes an optional job whatever its case — "(Optional)" does not gate either', () => {
    const shouting = {
      ...GREEN,
      checkRuns: [
        { name: 'verify (ubuntu-latest)', state: 'pass' as const },
        { name: 'reuse lint (Optional)', state: 'fail' as const },
      ],
    };

    expect(judgeHumanMerge(shouting, 'abc123').allow).toBe(true);
  });

  it('names the red check before it mentions mergeability — the reason the operator can act on first', () => {
    const redAndConflicting = {
      ...GREEN,
      mergeable: false,
      checkRuns: [{ name: 'verify (windows-latest)', state: 'fail' as const }],
    };

    const verdict = judgeHumanMerge(redAndConflicting, 'abc123');

    expect(verdict.reason).toContain('verify (windows-latest) (fail)');
    expect(verdict.reason).not.toContain('conflicting');
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

  it('echoes the live PR on a refusal so the panel re-renders from facts, not from the stale card', async () => {
    const calls: string[][] = [];
    const merge = createHumanMergeApi(execReturning([GREEN], calls));

    const result = await merge(33, 'a-different-sha');

    expect(result.merged).toBe(false);
    expect(result.pr?.number).toBe(33);
    expect(result.pr?.headRefOid).toBe('abc123');
    expect(result.code).toBeUndefined();
  });

  it('carries no PR at all when the number is not in the open list — nothing to re-render', async () => {
    const calls: string[][] = [];
    const merge = createHumanMergeApi(execReturning([GREEN], calls));

    const result = await merge(999, undefined);

    expect(result.pr).toBeUndefined();
    expect('pr' in result).toBe(false);
  });

  it('reports the gh exit code and the live PR alongside a successful merge', async () => {
    const calls: string[][] = [];
    const merge = createHumanMergeApi(execReturning([GREEN], calls));

    const result = await merge(33, 'abc123');

    expect(result).toMatchObject({
      merged: true,
      code: 0,
      reason: '#33 squash-merged and its branch deleted.',
    });
    expect(result.pr?.number).toBe(33);
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

  it('reports honestly — and pushes nothing — when the initial gh view call itself fails', async () => {
    const calls: string[][] = [];
    const unreachable: CliExec = async (bin, args) => {
      calls.push([bin, ...args]);
      return { code: 1, stdout: '' };
    };

    const result = await createUpdateBranchApi(unreachable)(34);

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('Could not read #34 from gh (exit 1).');
    expect(calls.some((c) => c[2] === 'update-branch')).toBe(false);
  });

  it('proceeds when gh omits maintainerCanModify — only an explicit false is a refusal', async () => {
    const calls: string[][] = [];
    const update = createUpdateBranchApi(viewExec({ state: 'OPEN' }, calls));

    const result = await update(34);

    expect(result.updated).toBe(true);
    expect(calls.some((c) => c[2] === 'update-branch')).toBe(true);
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

  it('reads a run url with no job suffix, and rejects a non-numeric run segment', () => {
    expect(runIdFromCheckUrl('https://github.com/o/r/actions/runs/777')).toBe('777');
    expect(runIdFromCheckUrl('https://github.com/o/r/actions/runs/latest/job/1')).toBeNull();
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

  it('refuses — and re-runs nothing — for a PR that is not in the open list', async () => {
    const calls: string[][] = [];
    const rerun = createRerunChecksApi(execReturningRaw(GREEN, calls));

    const result = await rerun(999);

    expect(result.rerun).toBe(false);
    expect(result.reason).toContain('no longer open');
    // calls rows are [bin, ...args], so c[0] is always 'gh' — the
    // subcommand sits at c[1].
    expect(calls.some((c) => c[1] === 'run')).toBe(false);
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

  it('reports a partial success when gh restarts some runs but refuses others', async () => {
    const MIXED: PrReviewCandidate = {
      ...GREEN,
      checkRuns: [
        { name: 'verify (ubuntu-latest)', state: 'pass' },
        {
          name: 'verify (macos-latest)',
          state: 'fail',
          url: 'https://github.com/o/r/actions/runs/900/job/1',
        },
        {
          name: 'verify (windows-latest)',
          state: 'fail',
          url: 'https://github.com/o/r/actions/runs/901/job/2',
        },
        {
          name: 'e2e',
          state: 'fail',
          url: 'https://github.com/o/r/actions/runs/902/job/3',
        },
      ],
    };
    const calls: string[][] = [];
    const base = execReturningRaw(MIXED, calls);
    const partial: CliExec = async (bin, args) =>
      args[0] === 'run' && args[2] === '902' ? { code: 1, stdout: '' } : base(bin, args);

    const result = await createRerunChecksApi(partial)(33);

    expect(result.rerun).toBe(true);
    expect(result.runs).toBe(2);
    expect(result.reason).toContain('Re-running the failed jobs in 2 runs');
    expect(result.reason).toContain('(1 refused)');
  });

  it('leaves an (optional) red alone even when it links a real Actions run — the exclusion the panel shares', async () => {
    // humanMergeReadiness hides the re-run button for an optional-only red;
    // this endpoint must refuse the same red, or the two disagree and the
    // button appears for a red the server then declines to act on.
    const optionalOnly: PrReviewCandidate = {
      ...GREEN,
      checkRuns: [
        { name: 'verify (ubuntu-latest)', state: 'pass' },
        {
          name: 'reuse lint (optional)',
          state: 'fail',
          url: 'https://github.com/o/r/actions/runs/900/job/9',
        },
      ],
    };
    const calls: string[][] = [];

    const result = await createRerunChecksApi(execReturningRaw(optionalOnly, calls))(33);

    expect(result.rerun).toBe(false);
    expect(result.reason).toContain('nothing to re-run');
    expect(calls.some((c) => c[2] === 'rerun')).toBe(false);
  });

  it('re-runs only the Actions run when the other red is an external status', async () => {
    const mixedSources: PrReviewCandidate = {
      ...GREEN,
      checkRuns: [
        {
          name: 'verify (macos-latest)',
          state: 'fail',
          url: 'https://github.com/o/r/actions/runs/900/job/1',
        },
        { name: 'vercel', state: 'fail', url: 'https://vercel.com/x/deployments/abc' },
      ],
    };
    const calls: string[][] = [];

    const result = await createRerunChecksApi(execReturningRaw(mixedSources, calls))(33);

    expect(result.rerun).toBe(true);
    expect(result.runs).toBe(1);
    expect(result.reason).not.toContain('refused');
    const reruns = calls.filter((c) => c[1] === 'run' && c[2] === 'rerun');
    expect(reruns).toEqual([['gh', 'run', 'rerun', '900', '--failed']]);
  });
});

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k): the maintainer's
// merge, update-branch and re-run verbs are the neighboring flow every new
// steward slice sits beside. These pin the edges the tests above leave open:
// which refusal wins when several apply, what counts as "reported", and the
// exact wording and argv the panel and gh see.
describe('human merge verbs — refusal order, reported checks and exact argv (regression, epic 0019 additive-only law)', () => {
  it('reports a moved head before a red check — the stale card is the first thing to fix', () => {
    const movedAndRed = {
      ...GREEN,
      checkRuns: [{ name: 'verify (windows-latest)', state: 'fail' as const }],
    };

    const verdict = judgeHumanMerge(movedAndRed, 'stale-sha');

    expect(verdict.allow).toBe(false);
    expect(verdict.reason).toContain('head moved');
    expect(verdict.reason).not.toContain('Not every check has passed');
  });

  it('refuses when only optional checks reported — an optional pass is not a green to merge on', () => {
    const optionalOnly = {
      ...GREEN,
      checkRuns: [{ name: 'reuse lint (optional)', state: 'pass' as const }],
    };

    expect(judgeHumanMerge(optionalOnly, 'abc123')).toEqual({
      allow: false,
      reason: 'No gating check has reported on this head — there is no green to merge on.',
    });
  });

  it('refuses a PR whose check list is absent, the same as an empty one', () => {
    const { checkRuns: _checks, ...noChecks } = GREEN;

    expect(judgeHumanMerge(noChecks, 'abc123').reason).toContain('no green');
  });

  it('names every gating check that has not passed, in order with its state, and leaves out passes and optional jobs', () => {
    const mixed = {
      ...GREEN,
      checkRuns: [
        { name: 'verify (ubuntu-latest)', state: 'pass' as const },
        { name: 'verify (windows-latest)', state: 'fail' as const },
        { name: 'e2e', state: 'queued' as const },
        { name: 'reuse lint (optional)', state: 'fail' as const },
        { name: 'docs', state: 'skipped' as const },
      ],
    };

    expect(judgeHumanMerge(mixed, 'abc123').reason).toBe(
      'Not every check has passed: verify (windows-latest) (fail), e2e (queued), docs (skipped).',
    );
  });

  it('reports a conflict before a stale base — updating the branch cannot clear a conflict', () => {
    const conflictingAndBehind = { ...GREEN, mergeable: false, behindBase: true as const };

    const reason = judgeHumanMerge(conflictingAndBehind, 'abc123').reason;

    expect(reason).toContain('conflicting');
    expect(reason).not.toContain('behind base');
  });

  it('re-reads the open PRs from gh on every click instead of reusing an earlier read', async () => {
    const calls: string[][] = [];
    const merge = createHumanMergeApi(execReturning([GREEN], calls));

    await merge(999, undefined);
    await merge(999, undefined);

    expect(calls.filter((c) => c[1] === 'pr' && c[2] === 'list')).toHaveLength(2);
  });

  it('carries the gh exit code and the live PR when gh refuses the merge', async () => {
    const calls: string[][] = [];
    const base = execReturning([GREEN], calls);
    const refusing: CliExec = async (bin, args) =>
      args[1] === 'merge' ? { code: 2, stdout: '' } : base(bin, args);

    const result = await createHumanMergeApi(refusing)(33, 'abc123');

    expect(result).toMatchObject({
      merged: false,
      code: 2,
      reason: 'gh refused the merge (exit 2) — check the PR on GitHub for why.',
    });
    expect(result.pr?.number).toBe(33);
  });

  it('reads the PR with exactly the two fields it judges, then updates that PR number', async () => {
    const calls: string[][] = [];
    const exec: CliExec = async (bin, args) => {
      calls.push([bin, ...args]);
      return args[1] === 'view'
        ? { code: 0, stdout: JSON.stringify({ state: 'OPEN', maintainerCanModify: true }) }
        : { code: 0, stdout: '' };
    };

    const result = await createUpdateBranchApi(exec)(34);

    expect(calls).toEqual([
      ['gh', 'pr', 'view', '34', '--json', 'state,maintainerCanModify'],
      ['gh', 'pr', 'update-branch', '34'],
    ]);
    expect(result).toEqual({
      updated: true,
      reason: "#34's branch updated from base — every check is re-running on the new head.",
      code: 0,
    });
  });

  it('names the PR in a not-open refusal and carries the exit code of a refused update', async () => {
    const closed: CliExec = async (_bin, args) =>
      args[1] === 'view'
        ? { code: 0, stdout: JSON.stringify({ state: 'CLOSED' }) }
        : { code: 0, stdout: '' };
    const refused: CliExec = async (_bin, args) =>
      args[1] === 'view'
        ? { code: 0, stdout: JSON.stringify({ state: 'OPEN', maintainerCanModify: true }) }
        : { code: 1, stdout: '' };

    expect(await createUpdateBranchApi(closed)(34)).toEqual({
      updated: false,
      reason: '#34 is not open — nothing to update.',
    });
    expect(await createUpdateBranchApi(refused)(34)).toMatchObject({ updated: false, code: 1 });
  });

  it('does not re-run a check that is still running or queued — only a finished failure is re-runnable', async () => {
    const pending: PrReviewCandidate = {
      ...GREEN,
      checkRuns: [
        {
          name: 'verify (ubuntu-latest)',
          state: 'running',
          url: 'https://github.com/o/r/actions/runs/900/job/1',
        },
        {
          name: 'e2e',
          state: 'queued',
          url: 'https://github.com/o/r/actions/runs/901/job/2',
        },
      ],
    };
    const calls: string[][] = [];

    const result = await createRerunChecksApi(execReturningRaw(pending, calls))(33);

    expect(result).toEqual({
      rerun: false,
      reason: 'No gating check is failing — there is nothing to re-run.',
    });
    expect(calls.some((c) => c[1] === 'run')).toBe(false);
  });

  it('treats a failing check with no log link at all as not re-runnable from here', async () => {
    const unlinked = {
      ...GREEN,
      checkRuns: [{ name: 'verify (ubuntu-latest)', state: 'fail' as const }],
    };
    const calls: string[][] = [];

    const result = await createRerunChecksApi(execReturningRaw(unlinked, calls))(33);

    expect(result.rerun).toBe(false);
    expect(result.reason).toContain('cannot be re-run from here');
    expect(calls.some((c) => c[1] === 'run')).toBe(false);
  });

  it('words one run in the singular, whether gh restarts it or refuses it', async () => {
    const oneRun: PrReviewCandidate = {
      ...GREEN,
      checkRuns: [
        {
          name: 'verify (macos-latest)',
          state: 'fail',
          url: 'https://github.com/o/r/actions/runs/900/job/1',
        },
      ],
    };
    const base = execReturningRaw(oneRun, []);
    const refusing: CliExec = async (bin, args) =>
      args[0] === 'run' ? { code: 1, stdout: '' } : base(bin, args);

    expect(await createRerunChecksApi(base)(33)).toEqual({
      rerun: true,
      runs: 1,
      reason: 'Re-running the failed jobs in 1 run — the checks strip updates as they report.',
    });
    expect(await createRerunChecksApi(refusing)(33)).toEqual({
      rerun: false,
      reason: 'gh refused to re-run the run — it may still be in progress.',
    });
  });

  it('words several refused runs as every run', async () => {
    const twoRuns: PrReviewCandidate = {
      ...GREEN,
      checkRuns: [
        {
          name: 'verify (macos-latest)',
          state: 'fail',
          url: 'https://github.com/o/r/actions/runs/900/job/1',
        },
        {
          name: 'verify (windows-latest)',
          state: 'fail',
          url: 'https://github.com/o/r/actions/runs/901/job/2',
        },
      ],
    };
    const base = execReturningRaw(twoRuns, []);
    const refusing: CliExec = async (bin, args) =>
      args[0] === 'run' ? { code: 1, stdout: '' } : base(bin, args);

    expect((await createRerunChecksApi(refusing)(33)).reason).toBe(
      'gh refused to re-run every run — it may still be in progress.',
    );
  });
});
