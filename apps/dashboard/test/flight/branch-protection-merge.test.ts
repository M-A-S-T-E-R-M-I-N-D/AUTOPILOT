// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER merge × the branch lock (EPIC 0019 additive-only law, board
 * web-mtsylqbd-q2rg8k: the AUTO-MERGE flow).
 *
 * GitHub enforces `.github/branch-protection.json` on the merge, but only
 * after the ritual has already posted its approve. A ritual that disagrees
 * with the lock still approves, then has its `gh pr merge` refused, which
 * leaves the dangling approval `remediateDanglingApproval` dismisses pass
 * after pass. pr-review.ts names the lock's `strict` and
 * `required_conversation_resolution` keys as the reason for two of its
 * guards, and its gate assumes no required check is an "(optional)" job, but
 * no test read the lock. These read it and hold the ritual's merge, and the
 * maintainer's merge button where it applies, to each key it relies on.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  fetchOpenPrCandidates,
  planPrReview,
  planPrReviewCommands,
  type PrReviewCandidate,
  type PrReviewCommand,
} from '../../src/flight/pr-review.js';
import { judgeHumanMerge } from '../../src/flight/human-merge.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

interface BranchLock {
  readonly required_status_checks: { readonly strict: boolean; readonly contexts: string[] };
  readonly required_pull_request_reviews: { readonly required_approving_review_count: number };
  readonly required_linear_history: boolean;
  readonly required_conversation_resolution: boolean;
}

const LOCK = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../.github/branch-protection.json', import.meta.url)),
    'utf8',
  ),
) as BranchLock;
const REQUIRED = LOCK.required_status_checks.contexts;

const HEAD_SHA = '0123456789abcdef0123456789abcdef01234567';

/** A PR that clears every check the ritual makes, so each test moves one
 *  fact and nothing else stands between it and a merge. */
function candidate(overrides: Partial<PrReviewCandidate> = {}): PrReviewCandidate {
  return {
    number: 12,
    title: 'Fix flaky sparkline test',
    gateStatus: 'pass',
    checkRuns: REQUIRED.map((name) => ({ name, state: 'pass' as const })),
    mergeable: true,
    touchedPaths: ['apps/dashboard/src/web/sparkline.ts'],
    headRefOid: HEAD_SHA,
    baseRefName: 'main',
    additions: 12,
    deletions: 3,
    renamedFromPaths: [],
    unresolvedReviewThreads: 0,
    ...overrides,
  };
}

function ritualCommands(pr: PrReviewCandidate): readonly PrReviewCommand[] {
  return planPrReviewCommands(pr, planPrReview(pr, 'green'));
}

const isApprove = (command: PrReviewCommand): boolean => command.args.includes('--approve');
const isMerge = (command: PrReviewCommand): boolean =>
  command.args[0] === 'pr' && command.args[1] === 'merge';

/** A rollup reporting every required check, with `failing` (if any) red and
 *  `running` (if any) still in progress. */
function rollup(failing?: string, running?: string): object[] {
  return REQUIRED.map((name) => {
    if (name === running) return { name, status: 'IN_PROGRESS', conclusion: '' };
    return { name, status: 'COMPLETED', conclusion: name === failing ? 'FAILURE' : 'SUCCESS' };
  });
}

/** The gate verdict and per-check rows the ritual's own fetch derives from a
 *  `gh pr list` that reports `checks` on one PR. */
async function readGate(
  checks: object[],
): Promise<Pick<PrReviewCandidate, 'gateStatus' | 'checkRuns'>> {
  const exec: CliExec = async (_bin, args) =>
    args[0] === 'pr' && args[1] === 'list'
      ? {
          code: 0,
          stdout: JSON.stringify([{ number: 12, title: 'x', statusCheckRollup: checks }]),
        }
      : { code: 1, stdout: '' };
  const [pr] = await fetchOpenPrCandidates(exec);
  if (pr === undefined) throw new Error('the stubbed gh pr list yielded no candidate');
  return { gateStatus: pr.gateStatus, ...(pr.checkRuns ? { checkRuns: pr.checkRuns } : {}) };
}

describe('the KEEPER merge × .github/branch-protection.json (regression, epic 0019 additive-only law)', () => {
  it('reads a lock that requires status checks, so the pins below are not vacuous', () => {
    expect(REQUIRED.length).toBeGreaterThan(0);
    expect(planPrReview(candidate(), 'green').decision).toBe('merge');
    expect(judgeHumanMerge(candidate(), HEAD_SHA).allow).toBe(true);
  });

  it('merges when every required check the lock names has passed', async () => {
    const gate = await readGate(rollup());

    expect(gate.gateStatus).toBe('pass');
    expect(ritualCommands(candidate(gate)).some(isMerge)).toBe(true);
  });

  it.each(REQUIRED)('does not treat the required check "%s" as an optional job', (name) => {
    // Both merges skip a check whose name says "(optional)". GitHub would
    // still hold the merge on a required one, after the approve was posted.
    expect(name.toLowerCase()).not.toContain('(optional)');
  });

  it.each(REQUIRED)(
    'neither approves nor merges while the required check "%s" is red',
    async (name) => {
      const gate = await readGate(rollup(name));

      expect(gate.gateStatus).toBe('fail');
      const commands = ritualCommands(candidate(gate));
      expect(commands.some(isApprove)).toBe(false);
      expect(commands.some(isMerge)).toBe(false);
      expect(judgeHumanMerge(candidate(gate), HEAD_SHA)).toEqual({
        allow: false,
        reason: `Not every check has passed: ${name} (fail).`,
      });
    },
  );

  it.each(REQUIRED)(
    'neither approves nor merges while the required check "%s" is still running',
    async (name) => {
      const gate = await readGate(rollup(undefined, name));

      expect(gate.gateStatus).toBe('pending');
      const commands = ritualCommands(candidate(gate));
      expect(commands.some(isApprove)).toBe(false);
      expect(commands.some(isMerge)).toBe(false);
      expect(judgeHumanMerge(candidate(gate), HEAD_SHA).allow).toBe(false);
    },
  );

  it('requires an up-to-date branch, and neither merge runs on a branch behind its base', () => {
    // pr-review.ts's behindBase guard cites this key by name.
    expect(LOCK.required_status_checks.strict).toBe(true);

    const behind = candidate({ behindBase: true });
    const commands = ritualCommands(behind);
    expect(commands.some(isApprove)).toBe(false);
    expect(commands.some(isMerge)).toBe(false);
    expect(judgeHumanMerge(behind, HEAD_SHA)).toEqual({
      allow: false,
      reason:
        'The branch is behind base and protection requires it up to date — ' +
        'update the branch first.',
    });
  });

  it('requires resolved conversations, and the ritual merges over no open or unread thread', () => {
    // pr-review.ts's unresolvedReviewThreads guard cites this key by name.
    expect(LOCK.required_conversation_resolution).toBe(true);

    const { unresolvedReviewThreads: _unread, ...unassessed } = candidate();
    for (const pr of [candidate({ unresolvedReviewThreads: 1 }), unassessed]) {
      const commands = ritualCommands(pr);
      expect(commands.some(isApprove)).toBe(false);
      expect(commands.some(isMerge)).toBe(false);
    }
  });

  it('asks for no more approvals than the ritual posts, and the ritual approves before it merges', () => {
    const commands = ritualCommands(candidate());
    const approves = commands.filter(isApprove);

    expect(LOCK.required_pull_request_reviews.required_approving_review_count).toBeLessThanOrEqual(
      approves.length,
    );
    expect(commands.findIndex(isApprove)).toBeLessThan(commands.findIndex(isMerge));
  });

  it('merges by a method the linear-history rule accepts — a squash, never a merge commit', () => {
    const methods = ['--squash', '--rebase', '--merge'];
    const accepted = LOCK.required_linear_history ? ['--squash', '--rebase'] : methods;
    const merge = ritualCommands(candidate()).find(isMerge);
    const method = merge?.args.find((arg) => methods.includes(arg));

    expect(method).toBe('--squash');
    expect(accepted).toContain(method);
  });
});
