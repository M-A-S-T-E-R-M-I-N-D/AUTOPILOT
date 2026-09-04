// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { createPrReviewExecuteApi } from '../../src/flight/pr-review-execute.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function openPrListStdout(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify([
    {
      number: 12,
      title: 'Fix flaky sparkline test',
      mergeable: 'MERGEABLE',
      baseRefName: 'main',
      headRefOid: '0123456789abcdef0123456789abcdef01234567',
      // The green rollup carries the FULL-verify matrix's own check run — a
      // merge claims the FULL verify passed, so a green gate made only of
      // other checks queues for a human instead (fullVerifyMissing).
      statusCheckRollup: [{ name: 'verify (ubuntu-latest)', conclusion: 'SUCCESS' }],
      files: [{ path: 'apps/dashboard/src/web/sparkline.ts' }],
      // A merge needs the gh-reported size confirmed — an unassessed size
      // queues for a human, so the shared fixture carries a small in-cap one.
      additions: 12,
      deletions: 3,
      // A merge also needs the hold-label and latest-reviews sweeps CONFIRMED
      // — an unreadable report queues for a human, so the shared fixture
      // carries confirmed-empty ones.
      labels: [],
      latestReviews: [],
      ...overrides,
    },
  ]);
}

/** The `gh api graphql` reviewThreads reply for the fixture PR — the read the
 *  execute path spends only for a candidate that would otherwise merge, so a
 *  merge may assert every reviewer conversation is resolved (branch
 *  protection requires conversation resolution). */
function reviewThreadsStdout(unresolved = 0): string {
  return JSON.stringify({
    data: {
      repository: {
        pullRequests: {
          nodes: [
            {
              number: 12,
              reviewThreads: {
                totalCount: unresolved,
                nodes: Array.from({ length: unresolved }, () => ({ isResolved: false })),
              },
            },
          ],
        },
      },
    },
  });
}

describe('createPrReviewExecuteApi', () => {
  // A missing candidate is NOT proof the PR is gone: fetchOpenPrCandidates
  // returns [] on a gh outage too, and a draft or a PR beyond the 100-newest
  // fetch window is still open. So the miss path probes `gh pr view` first —
  // null (the server's 404 "PR is no longer open") only after the probe
  // CONFIRMS it; every unverifiable shape throws an honest error instead of
  // asserting a state nobody checked. Nothing executes on any miss path.
  it('returns null only after the probe confirms the PR merged', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: '[]' })
      .mockResolvedValueOnce({ code: 0, stdout: '{"state":"MERGED","isDraft":false}' });
    const api = createPrReviewExecuteApi(exec);

    expect(await api(12)).toBeNull();
    expect(exec).toHaveBeenNthCalledWith(1, 'gh', [
      'pr',
      'list',
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      'number,title,author,mergeable,mergeStateStatus,baseRefName,headRefOid,statusCheckRollup,files,labels,changedFiles,additions,deletions,latestReviews,isDraft,autoMergeRequest,comments,reviews',
    ]);
    expect(exec).toHaveBeenNthCalledWith(2, 'gh', ['pr', 'view', '12', '--json', 'state,isDraft']);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('returns null after the probe confirms the PR closed', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: '[]' })
      .mockResolvedValueOnce({ code: 0, stdout: '{"state":"CLOSED","isDraft":false}' });
    const api = createPrReviewExecuteApi(exec);

    expect(await api(12)).toBeNull();
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('throws instead of claiming "no longer open" when the probe says the PR is still open', async () => {
    // The motivating outage: `gh pr list` fails, fetchOpenPrCandidates
    // returns [], and the old miss path told the operator — as settled fact —
    // that their previewed PR was gone. The probe now catches the lie.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 1, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: '{"state":"OPEN","isDraft":false}' });
    const api = createPrReviewExecuteApi(exec);

    await expect(api(12)).rejects.toThrow(/still open/);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('throws the draft explanation when the probe reports an open draft', async () => {
    // A draft IS open — fetchOpenPrCandidates excludes it on purpose (its
    // author's explicit not-ready signal), so "PR is no longer open" was a
    // false claim for it too.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: '[]' })
      .mockResolvedValueOnce({ code: 0, stdout: '{"state":"OPEN","isDraft":true}' });
    const api = createPrReviewExecuteApi(exec);

    await expect(api(12)).rejects.toThrow(/draft/);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('throws "could not verify" when the probe itself fails', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: '[]' })
      .mockResolvedValueOnce({ code: 1, stdout: '' });
    const api = createPrReviewExecuteApi(exec);

    await expect(api(12)).rejects.toThrow(/could not verify/);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('throws "could not verify" on unparseable or unrecognized probe output', async () => {
    for (const stdout of ['not json', '[]', '{"state":"UNKNOWN"}', 'null']) {
      const exec: CliExec = vi
        .fn()
        .mockResolvedValueOnce({ code: 0, stdout: '[]' })
        .mockResolvedValueOnce({ code: 0, stdout });
      const api = createPrReviewExecuteApi(exec);

      await expect(api(12)).rejects.toThrow(/could not verify/);
      expect(exec).toHaveBeenCalledTimes(2);
    }
  });

  it('re-derives a policy-green decision and runs approve + merge', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: openPrListStdout() })
      .mockResolvedValueOnce({ code: 0, stdout: 'diff --git a/x b/x\n' }) // gh pr diff succeeds ⇒ rename sweep confirmed empty
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // git apply --reverse --check fails ⇒ not already applied
      .mockResolvedValueOnce({ code: 0, stdout: reviewThreadsStdout() }) // reviewThreads read ⇒ conversations confirmed resolved
      .mockResolvedValueOnce({ code: 0, stdout: 'approved' })
      .mockResolvedValueOnce({ code: 0, stdout: 'merged' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision).toMatchObject({ decision: 'merge' });
    expect(result?.results).toHaveLength(2);
    expect(exec).toHaveBeenNthCalledWith(2, 'gh', ['pr', 'diff', '12']);
    expect(exec).toHaveBeenNthCalledWith(5, 'gh', [
      'pr',
      'review',
      '12',
      '--approve',
      '--body',
      result?.decision.reasoning,
    ]);
    expect(exec).toHaveBeenNthCalledWith(6, 'gh', [
      'pr',
      'merge',
      '12',
      '--squash',
      '--match-head-commit',
      '0123456789abcdef0123456789abcdef01234567',
    ]);
  });

  it('never merges a security-sensitive PR — only posts the queue-for-human comment', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // comment probe finds no standing duplicate
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision).toMatchObject({ decision: 'queue-for-human' });
    expect(result?.results).toHaveLength(1);
    expect(exec).toHaveBeenNthCalledWith(4, 'gh', [
      'pr',
      'comment',
      '12',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('skips re-posting a queue-for-human comment that already stands verbatim', async () => {
    // Epic 0007's idempotency doctrine (issue-triage re-runs plan a 'skip'):
    // a still-queued PR re-executed on a later pass must not collect a second
    // identical comment — the probe finds the exact reasoning already posted
    // and the execute reports an honest no-op instead of spamming the PR.
    const reasoning =
      '#12 "Fix flaky sparkline test" touches a guard/containment/auth/CSP path — ' +
      'security-hard rule: this never auto-merges and always queues for ' +
      "MASTERMIND's human eyes, regardless of gate result.";
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify([{ body: reasoning }]) });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision).toMatchObject({ decision: 'queue-for-human' });
    expect(result?.results).toHaveLength(1);
    expect(result?.results[0]?.command.args).toEqual([
      'api',
      'repos/{owner}/{repo}/issues/12/comments?per_page=100',
    ]);
    expect(result?.results[0]?.command.details).toContain('nothing re-posted');
    expect(exec).toHaveBeenCalledTimes(3); // list + sweep + probe — no gh write ran
  });

  it('still posts the comment when existing comments differ from the reasoning', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([{ body: 'an unrelated human comment' }]),
      })
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toHaveLength(1);
    expect(exec).toHaveBeenNthCalledWith(4, 'gh', [
      'pr',
      'comment',
      '12',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('still posts the comment when the duplicate probe itself fails', async () => {
    // Fail toward posting: the probe is spam-avoidance, and a probe outage
    // must never withhold the honest queue-for-human verdict itself.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({ code: 1, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toHaveLength(1);
    expect(exec).toHaveBeenNthCalledWith(4, 'gh', [
      'pr',
      'comment',
      '12',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('skips re-posting a request-changes review that already stands verbatim', async () => {
    // The other repeatable write, same idempotency doctrine as the
    // queue-for-human comment probe above: a PR held at a red gate across
    // passes must not collect a second identical CHANGES_REQUESTED review
    // (each one re-pings the author) — the probe finds the exact reasoning
    // already standing and the execute reports an honest no-op instead.
    const reasoning =
      '#12 "Fix flaky sparkline test" — the gate failed; ' +
      "an agent's judgment never substitutes for it.";
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
      })
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // gh pr diff fails ⇒ necessity not assessed
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([{ state: 'CHANGES_REQUESTED', body: reasoning }]),
      });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision).toMatchObject({ decision: 'request-changes' });
    expect(result?.results).toHaveLength(1);
    expect(result?.results[0]?.command.args).toEqual([
      'api',
      'repos/{owner}/{repo}/pulls/12/reviews?per_page=100',
    ]);
    expect(result?.results[0]?.command.details).toContain('nothing re-posted');
    expect(exec).toHaveBeenCalledTimes(4); // list + diff + sweep + probe — no gh write ran
  });

  it('still posts the review when standing reviews are dismissed, differ, or are not change-requests', async () => {
    // A DISMISSED review no longer stands, a different body means the
    // verdict's substance changed, and an APPROVED review is not this
    // verdict at all — none of them may withhold the fresh request-changes.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
      })
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // gh pr diff fails ⇒ necessity not assessed
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([
          {
            state: 'DISMISSED',
            body:
              '#12 "Fix flaky sparkline test" — the gate failed; ' +
              "an agent's judgment never substitutes for it.",
          },
          { state: 'CHANGES_REQUESTED', body: 'an earlier, different reasoning' },
          {
            state: 'APPROVED',
            body:
              '#12 "Fix flaky sparkline test" — the gate failed; ' +
              "an agent's judgment never substitutes for it.",
          },
        ]),
      })
      .mockResolvedValueOnce({ code: 0, stdout: 'requested changes' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toHaveLength(1);
    expect(exec).toHaveBeenNthCalledWith(5, 'gh', [
      'pr',
      'review',
      '12',
      '--request-changes',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('still posts the review when the review probe itself fails', async () => {
    // Fail toward posting, same as the comment probe: withholding the honest
    // request-changes verdict would be worse than a duplicate review.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
      })
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // gh pr diff fails ⇒ necessity not assessed
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({ code: 1, stdout: '' })
      .mockResolvedValueOnce({ code: 0, stdout: 'requested changes' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toHaveLength(1);
    expect(exec).toHaveBeenNthCalledWith(5, 'gh', [
      'pr',
      'review',
      '12',
      '--request-changes',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('re-derives the decision fresh rather than trusting anything client-supplied — a red gate never merges', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
      })
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // gh pr diff fails ⇒ necessity not assessed
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // review probe finds no standing duplicate
      .mockResolvedValueOnce({ code: 0, stdout: 'requested changes' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision).toMatchObject({ decision: 'request-changes' });
    expect(exec).toHaveBeenNthCalledWith(5, 'gh', [
      'pr',
      'review',
      '12',
      '--request-changes',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('stops after a failing command and still reports the partial results', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: openPrListStdout() })
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // gh pr diff fails ⇒ rename sweep unassessed ⇒ queue-for-human
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // comment probe finds no standing duplicate
      .mockResolvedValueOnce({ code: 1, stdout: 'comment failed' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toEqual([
      expect.objectContaining({ code: 1, stdout: 'comment failed' }),
    ]);
    expect(exec).toHaveBeenCalledTimes(5);
  });

  it('requests changes when the PR diff is already present in the tree', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: openPrListStdout() })
      .mockResolvedValueOnce({ code: 0, stdout: 'diff --git a/x b/x\n' })
      .mockResolvedValueOnce({ code: 0, stdout: '' }) // git apply --reverse --check passes
      .mockResolvedValueOnce({ code: 0, stdout: '' }) // git status: clean tree
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // git merge-base --is-ancestor: history excludes the PR head
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // review probe finds no standing duplicate
      .mockResolvedValueOnce({ code: 0, stdout: 'requested changes' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision).toMatchObject({ decision: 'request-changes' });
    expect(result?.decision.reasoning).toContain('already present');
    expect(exec).toHaveBeenNthCalledWith(3, 'git', [
      'apply',
      '--reverse',
      '--check',
      expect.stringContaining('.patch'),
    ]);
    expect(exec).toHaveBeenNthCalledWith(5, 'git', [
      'merge-base',
      '--is-ancestor',
      '0123456789abcdef0123456789abcdef01234567',
      'HEAD',
    ]);
  });

  it('withholds the already-applied verdict when the reviewing checkout IS the PR (its history contains the head) — a locally checked-out PR must not be told it was fixed elsewhere', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: openPrListStdout() })
      .mockResolvedValueOnce({ code: 0, stdout: 'diff --git a/x b/x\n' })
      .mockResolvedValueOnce({ code: 0, stdout: '' }) // git apply --reverse --check passes (the tree is the PR)
      .mockResolvedValueOnce({ code: 0, stdout: '' }) // git status: clean tree
      .mockResolvedValueOnce({ code: 0, stdout: '' }) // git merge-base --is-ancestor: HEAD contains the PR head
      .mockResolvedValueOnce({ code: 0, stdout: reviewThreadsStdout() }); // reviewThreads read ⇒ conversations confirmed resolved
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12, 'queue-for-human');

    expect(result?.decision.decision).not.toBe('request-changes');
    expect(result?.decision.reasoning).not.toContain('already present');
  });

  it('dismisses its own dangling approval when the approve lands but the pinned merge is refused', async () => {
    const reasoning =
      '#12 "Fix flaky sparkline test" is policy-green — gate passed, no conflicts, no security-sensitive paths touched.';
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: openPrListStdout() })
      .mockResolvedValueOnce({ code: 0, stdout: 'diff --git a/x b/x\n' }) // gh pr diff succeeds ⇒ rename sweep confirmed empty
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // git apply --reverse --check fails ⇒ not already applied
      .mockResolvedValueOnce({ code: 0, stdout: reviewThreadsStdout() }) // reviewThreads read ⇒ conversations confirmed resolved
      .mockResolvedValueOnce({ code: 0, stdout: 'approved' })
      .mockResolvedValueOnce({ code: 1, stdout: 'head mismatch' }) // pinned merge refused
      .mockResolvedValueOnce({ code: 0, stdout: JSON.stringify({ state: 'OPEN' }) }) // merged-state probe: still open, so the refusal is real
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([{ id: 7, state: 'APPROVED', body: reasoning }]),
      })
      .mockResolvedValueOnce({ code: 0, stdout: '{}' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision.reasoning).toBe(reasoning);
    expect(exec).toHaveBeenNthCalledWith(7, 'gh', ['pr', 'view', '12', '--json', 'state']);
    expect(exec).toHaveBeenNthCalledWith(8, 'gh', [
      'api',
      'repos/{owner}/{repo}/pulls/12/reviews?per_page=100',
    ]);
    expect(exec).toHaveBeenNthCalledWith(9, 'gh', [
      'api',
      '--method',
      'PUT',
      'repos/{owner}/{repo}/pulls/12/reviews/7/dismissals',
      '-f',
      expect.stringMatching(/^message=/),
    ]);
    expect(result?.results).toHaveLength(5); // approve, failed merge, probe, list, dismissal
  });

  it("dismisses the ritual's own stale policy-green approval left standing on a queue-for-human PR", async () => {
    // A crashed earlier run (approve landed, the pinned merge never ran, and
    // the same-run remediation died with the process) leaves an APPROVED
    // "policy-green" review standing. A queue-for-human execute posts only a
    // COMMENT — comments never supersede a review — so branch protection
    // would keep counting that stale approval toward a merge nobody
    // re-reviewed. The execute now sweeps the ritual's own policy-green
    // approvals first and dismisses them; matched by shape (#N "…" plus the
    // policy-green suffix), so a title edited since the approve still
    // matches.
    const staleBody =
      '#12 "An older title from approve time" is policy-green — gate passed, no conflicts, no security-sensitive paths touched.';
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([{ id: 9, state: 'APPROVED', body: staleBody }]),
      }) // approval sweep finds the ritual's stale policy-green approval
      .mockResolvedValueOnce({ code: 0, stdout: '{}' }) // dismissal PUT
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // comment probe finds no standing duplicate
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision).toMatchObject({ decision: 'queue-for-human' });
    expect(exec).toHaveBeenNthCalledWith(2, 'gh', [
      'api',
      'repos/{owner}/{repo}/pulls/12/reviews?per_page=100',
    ]);
    expect(exec).toHaveBeenNthCalledWith(3, 'gh', [
      'api',
      '--method',
      'PUT',
      'repos/{owner}/{repo}/pulls/12/reviews/9/dismissals',
      '-f',
      expect.stringMatching(/^message=/),
    ]);
    expect(result?.results).toHaveLength(3); // sweep fetch, dismissal, comment
  });

  it("leaves every review standing that is not the ritual's own policy-green approval", async () => {
    // A human's APPROVED review (any other body) and a CHANGES_REQUESTED
    // review that merely quotes the policy-green shape are both someone
    // else's verdict — the sweep dismisses nothing and stays silent.
    const policyGreenShaped =
      '#12 "Fix flaky sparkline test" is policy-green — gate passed, no conflicts, no security-sensitive paths touched.';
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([
          { id: 4, state: 'APPROVED', body: 'LGTM' },
          { id: 5, state: 'CHANGES_REQUESTED', body: policyGreenShaped },
        ]),
      }) // approval sweep finds nothing of the ritual's own
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // comment probe finds no standing duplicate
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toHaveLength(1); // the comment only — no dismissal, silent sweep
    expect(exec).toHaveBeenCalledTimes(4); // list + sweep + probe + comment
  });

  it('still posts the queue-for-human comment when the approval sweep itself fails', async () => {
    // Fail soft and silent, same stance as the duplicate probes: the sweep is
    // speculative remediation, and an outage must never withhold the honest
    // queue-for-human verdict itself.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // approval sweep fetch fails
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // comment probe finds no standing duplicate
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toHaveLength(1);
    expect(exec).toHaveBeenNthCalledWith(4, 'gh', [
      'pr',
      'comment',
      '12',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('still posts the queue-for-human comment when the approval sweep returns unparseable JSON', async () => {
    // Same fail-soft stance as a failed fetch above, but here the fetch
    // itself succeeds (code 0) and only the JSON.parse of its stdout throws —
    // the sweep must still swallow that and let the honest verdict post.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({ code: 0, stdout: 'not json' }) // approval sweep: unparseable
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // comment probe finds no standing duplicate
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toHaveLength(1);
    expect(exec).toHaveBeenNthCalledWith(4, 'gh', [
      'pr',
      'comment',
      '12',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('posts a fresh queue-for-human comment when the standing-duplicate probe itself returns unparseable JSON — a probe outage must never be mistaken for a match', async () => {
    // findStandingDuplicate's own JSON.parse can throw independently of the
    // stale-approval sweep above; a parse failure here must fail toward
    // POSTING the verdict, never toward silently treating it as a duplicate.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ files: [{ path: 'apps/dashboard/src/server/security.ts' }] }),
      })
      .mockResolvedValueOnce({ code: 0, stdout: '[]' }) // approval sweep finds nothing to dismiss
      .mockResolvedValueOnce({ code: 0, stdout: 'not json' }) // comment probe: unparseable
      .mockResolvedValueOnce({ code: 0, stdout: 'commented' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.results).toHaveLength(1);
    expect(exec).toHaveBeenNthCalledWith(4, 'gh', [
      'pr',
      'comment',
      '12',
      '--body',
      result?.decision.reasoning,
    ]);
  });

  it('dismisses a stale policy-green approval even when the request-changes review is deduped', async () => {
    // The deduped request-changes path returns early without posting — but a
    // dangling approval posted AFTER that standing review is the identity's
    // LATEST review, so it would keep vouching policy-green while the execute
    // reports an honest no-op. The sweep runs on every non-merge decision,
    // so the stale approval is dismissed here too.
    const reasoning =
      '#12 "Fix flaky sparkline test" — the gate failed; ' +
      "an agent's judgment never substitutes for it.";
    const staleBody =
      '#12 "Fix flaky sparkline test" is policy-green — gate passed, no conflicts, no security-sensitive paths touched.';
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        stdout: openPrListStdout({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
      })
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // gh pr diff fails ⇒ necessity not assessed
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([
          { state: 'CHANGES_REQUESTED', body: reasoning },
          { id: 7, state: 'APPROVED', body: staleBody },
        ]),
      }) // approval sweep finds the later dangling approval
      .mockResolvedValueOnce({ code: 0, stdout: '{}' }) // dismissal PUT
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([{ state: 'CHANGES_REQUESTED', body: reasoning }]),
      }); // request-changes probe finds the standing verbatim review
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12);

    expect(result?.decision).toMatchObject({ decision: 'request-changes' });
    expect(exec).toHaveBeenNthCalledWith(4, 'gh', [
      'api',
      '--method',
      'PUT',
      'repos/{owner}/{repo}/pulls/12/reviews/7/dismissals',
      '-f',
      expect.stringMatching(/^message=/),
    ]);
    expect(result?.results).toHaveLength(3); // sweep fetch, dismissal, standing-review no-op
  });

  it('refuses to run anything when the fresh decision kind differs from the operator-confirmed one', async () => {
    // Preview showed queue-for-human (a comment) and that is what the
    // operator confirmed — but the PR turned policy-green in the meantime,
    // so the fresh re-derive says merge. Executing the merge would apply an
    // irreversible action the operator never confirmed; the guard runs
    // NOTHING and reports the fresh decision for a re-preview instead.
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: openPrListStdout() })
      .mockResolvedValueOnce({ code: 0, stdout: 'diff --git a/x b/x\n' }) // gh pr diff succeeds ⇒ rename sweep confirmed empty
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // git apply --reverse --check fails ⇒ not already applied
      .mockResolvedValueOnce({ code: 0, stdout: reviewThreadsStdout() }); // reviewThreads read ⇒ conversations confirmed resolved
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12, 'queue-for-human');

    expect(result?.decision).toMatchObject({ decision: 'merge' });
    expect(result?.staleDecision).toBe(true);
    expect(result?.results).toEqual([]);
    expect(exec).toHaveBeenCalledTimes(4); // list + diff + reverse check + threads read only — no gh write ran
  });

  it('runs normally when the operator-confirmed kind matches the fresh derive', async () => {
    const exec: CliExec = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: openPrListStdout() })
      .mockResolvedValueOnce({ code: 0, stdout: 'diff --git a/x b/x\n' }) // gh pr diff succeeds ⇒ rename sweep confirmed empty
      .mockResolvedValueOnce({ code: 1, stdout: '' }) // git apply --reverse --check fails ⇒ not already applied
      .mockResolvedValueOnce({ code: 0, stdout: reviewThreadsStdout() }) // reviewThreads read ⇒ conversations confirmed resolved
      .mockResolvedValueOnce({ code: 0, stdout: 'approved' })
      .mockResolvedValueOnce({ code: 0, stdout: 'merged' });
    const api = createPrReviewExecuteApi(exec);

    const result = await api(12, 'merge');

    expect(result?.decision).toMatchObject({ decision: 'merge' });
    expect(result?.staleDecision).toBeUndefined();
    expect(result?.results).toHaveLength(2);
  });

  it('defaults to the real CLI exec when none is injected', () => {
    expect(() => createPrReviewExecuteApi()).not.toThrow();
  });
});
