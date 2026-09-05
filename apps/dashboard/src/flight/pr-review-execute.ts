// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER REVIEW ritual's EXECUTE action (BOARD web-mss50ia0-s6vtbd,
 * "PLATFORM 4/7" — the HTTP half; the pure decision core shipped first, in
 * `pr-review.ts`). Given an open PR's number, re-fetches every open PR fresh
 * via `gh` and re-derives its decision — never trusting a client-supplied
 * decision, same "byte-review the diff, never trust the description" stance
 * `pr-review.ts` itself documents; the verify-necessity reverse-apply check
 * is re-assessed fresh here too, so a stale preview verdict can't leak into
 * an execute — then runs the resulting `gh` command(s)
 * through the same injectable `CliExec` `connection/cli-probe.ts` uses.
 * Mirrors `release/execute.ts`'s plan-then-execute shape, minus a project
 * lookup: the KEEPER rituals act on the one canonical repo the dashboard
 * process itself runs in (epic 0007's maintainer autopilot), not a stored
 * project's `root_path`.
 */

import { realCliExec, type CliExec } from '../connection/cli-probe.js';
import {
  fetchOpenPrCandidates,
  annotateAlreadyApplied,
  annotateReviewThreads,
  planPrReview,
  planPrReviewCommands,
  executePrReviewCommands,
  remediateDanglingApproval,
  remediateStalePolicyGreenApprovals,
  resolvePrReviewAutoMergePolicy,
  type PrReviewCommand,
  type PrReviewDecision,
  type PrReviewCommandResult,
} from './pr-review.js';

/** The three decision kinds `planPrReview` can reach — the wire value a
 *  caller may pin an execute to via `expectedDecision`. */
export type PrReviewDecisionKind = PrReviewDecision['decision'];

/** Boundary validation for a client-supplied `expectedDecision` — `server.ts`
 *  400s anything else rather than passing garbage through. Narrowing-only
 *  input: an expectation can only STOP an execute (see the stale-decision
 *  guard below), never choose what runs, so validating it strictly costs a
 *  legitimate caller nothing. */
export function isPrReviewDecisionKind(value: unknown): value is PrReviewDecisionKind {
  return value === 'merge' || value === 'request-changes' || value === 'queue-for-human';
}

/** One KEEPER REVIEW execute attempt's outcome: the decision re-derived at
 *  execute time plus every planned command's result, in order.
 *  `staleDecision` is present (always `true`) only when the caller pinned the
 *  execute to an `expectedDecision` kind and the fresh re-derive reached a
 *  DIFFERENT one — nothing was executed (`results` is empty); the caller
 *  re-previews the returned fresh decision and confirms again. */
export interface PrReviewExecuteResult {
  readonly decision: PrReviewDecision;
  readonly results: readonly PrReviewCommandResult[];
  readonly staleDecision?: true;
}

/** `null` means the PR is CONFIRMED no longer open — the miss path probes
 *  `gh pr view --json state` and only a verified `MERGED`/`CLOSED` earns the
 *  server's 404 "PR is no longer open" (see {@link confirmPrNotOpen}); an
 *  unverifiable miss THROWS an honest error instead, which `server.ts`'s
 *  catch surfaces as a 500 with the message. Same "unknown id" 404
 *  convention `release/execute.ts`'s `ReleaseExecuteApi` uses for a project.
 *  `expectedDecision` is the decision kind the operator actually confirmed
 *  (the previewed plan's) — see the stale-decision guard below; absent means
 *  "not asserted", which executes whatever the fresh re-derive says, the
 *  pre-guard behavior. `expectedHeadRefOid` is the previewed PR's head SHA —
 *  see the re-triage-before-Apply guard below; same not-asserted convention. */
export type PrReviewExecuteApi = (
  number: number,
  expectedDecision?: PrReviewDecisionKind,
  expectedHeadRefOid?: string,
) => Promise<PrReviewExecuteResult | null>;

/**
 * Build the KEEPER REVIEW execute API against the real `gh` CLI — the
 * production wiring `main.ts` injects into the server.
 *
 * The re-triage-before-Apply guard (the incident this closed: 2026-09-05,
 * gabibi555 #12/#13 — a verdict computed against a superseded head posted a
 * formal request-changes that blocked two PRs that had already gone green):
 * a head that moved between preview and Apply means every fact the preview
 * showed — gate status, mergeability, the diff-derived verdicts — was judged
 * against a PR that no longer exists in that shape, and the decision-kind
 * guard below is blind to it whenever the fresh kind happens to coincide with
 * the stale one (e.g. still "request-changes", now for a different reason).
 * So this checks the head FIRST, before spending the diff fetch and
 * reviewThreads read the fuller assessment needs — a superseded head makes
 * that assessment worthless, not just its conclusion. Narrowing-only, same
 * doctrine as the decision-kind guard: an absent expectation, or a fetch that
 * cannot confirm the fresh head, behaves as not-asserted and runs the fuller
 * assessment as before.
 *
 * The stale-decision guard: re-deriving fresh at execute time protects
 * against a FORGED client decision, but it opened a confirm-guard TOCTOU of
 * its own — the operator's `window.confirm` covered the PREVIEWED decision
 * (up to a 30s-poll stale, or older in an idle tab), and the execute then ran
 * whatever the FRESH derive said. Preview "queue-for-human" (a comment),
 * confirm, CI turns green in between → the fresh derive says merge, and an
 * irreversible approve-and-squash-merge ran on a confirm that promised a
 * comment. So the panel now sends the decision KIND it showed the operator,
 * and a fresh derive reaching any other kind executes NOTHING — the result
 * carries the fresh decision plus `staleDecision: true` so the caller
 * re-previews and re-confirms. Narrowing-only, same doctrine as every
 * `pr-review.ts` guard: the client value is never trusted to CHOOSE the
 * action (the fresh derive still decides what would run), only to STOP it —
 * a mismatch can only withhold `gh` writes, never cause one. An absent
 * expectation behaves as not-asserted (executes the fresh decision), keeping
 * the same fail-toward-existing-behavior stance
 * `resolvePrReviewAutoMergePolicy` takes on an unset env var.
 */
export function createPrReviewExecuteApi(exec: CliExec = realCliExec): PrReviewExecuteApi {
  return async (number, expectedDecision, expectedHeadRefOid) => {
    const candidates = await fetchOpenPrCandidates(exec);
    const pr = candidates.find((candidate) => candidate.number === number);
    if (!pr) return confirmPrNotOpen(number, exec);

    if (
      expectedHeadRefOid !== undefined &&
      pr.headRefOid !== undefined &&
      pr.headRefOid !== expectedHeadRefOid
    ) {
      return {
        decision: planPrReview(pr, resolvePrReviewAutoMergePolicy()),
        results: [],
        staleDecision: true,
      };
    }

    // Both on-demand reads re-run fresh here, in the preview's order: the
    // diff verdicts first, then the review-thread sweep a merge must assert
    // (branch protection requires conversation resolution) — spent only when
    // the candidate would otherwise merge.
    const [assessed = pr] = await annotateReviewThreads(
      await annotateAlreadyApplied([pr], exec),
      exec,
    );
    const decision = planPrReview(assessed, resolvePrReviewAutoMergePolicy());
    if (expectedDecision !== undefined && decision.decision !== expectedDecision) {
      return { decision, results: [], staleDecision: true };
    }
    // Every non-merge execute sweeps first: a stale policy-green approval a
    // crashed earlier run left standing (see remediateStalePolicyGreenApprovals)
    // must not keep satisfying branch protection while this pass posts only a
    // comment — or dedupes away the review that would supersede it.
    const staleApprovals = await remediateStalePolicyGreenApprovals(assessed, decision, exec);
    if (decision.decision === 'queue-for-human') {
      const standing = await findStandingQueueComment(number, decision.reasoning, exec);
      if (standing) return { decision, results: [...staleApprovals, standing] };
    }
    if (decision.decision === 'request-changes') {
      const standing = await findStandingRequestChangesReview(number, decision.reasoning, exec);
      if (standing) return { decision, results: [...staleApprovals, standing] };
    }
    const commands = planPrReviewCommands(assessed, decision);
    const results = await executePrReviewCommands(commands, exec);
    const remediation = await remediateDanglingApproval(assessed, decision, results, exec);
    return { decision, results: [...staleApprovals, ...results, ...remediation] };
  };
}

/**
 * The miss path's honesty probe: a PR number absent from the fetched
 * candidates is NOT proof the PR is gone — `fetchOpenPrCandidates` returns
 * `[]` on a `gh pr list` outage or parse failure too, a draft is open but
 * deliberately excluded, and a PR beyond the fetch's 100-newest window is
 * open but unlisted. The old miss path answered every one of those with the
 * server's 404 "PR is no longer open" — a settled-fact claim nobody had
 * checked, the same unverified-assertion class the dangling-approval
 * remediation's merged-state probe closed (`gh pr merge`'s exit code does
 * not prove the merge was refused; a list miss does not prove the PR is
 * gone). So the miss now spends one `gh pr view --json state,isDraft` probe:
 * only a CONFIRMED `MERGED`/`CLOSED` returns `null` (the 404), and every
 * other shape throws with reasoning naming exactly what is known — still
 * open (retry; the fetch failed or the PR sits past the window), an open
 * draft (no verdict may be posted, per the fetch's draft exclusion), or
 * unverifiable (gh down, or the PR never existed). Every path executes
 * nothing, so the probe only changes what the operator is TOLD, never what
 * runs — narrowing-only, like every guard in this ritual.
 */
async function confirmPrNotOpen(number: number, exec: CliExec): Promise<null> {
  const probed = await exec('gh', ['pr', 'view', String(number), '--json', 'state,isDraft']);
  if (probed.code === 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(probed.stdout);
    } catch {
      parsed = undefined;
    }
    const report = parsed as { state?: unknown; isDraft?: unknown } | null | undefined;
    if (report?.state === 'MERGED' || report?.state === 'CLOSED') return null;
    if (report?.state === 'OPEN') {
      if (report.isDraft === true) {
        throw new Error(
          `PR #${number} is an open draft — its author's explicit not-ready signal, ` +
            'so the ritual posts no verdict on it; nothing was executed.',
        );
      }
      throw new Error(
        `PR #${number} is still open, but the open-PR list fetch did not include it — ` +
          'a transient gh failure, or the PR sits beyond the 100-newest fetch window; ' +
          'nothing was executed, try again.',
      );
    }
  }
  throw new Error(
    `could not verify whether PR #${number} is still open — gh did not report its state ` +
      '(the PR may not exist, or gh may be unavailable); nothing was executed.',
  );
}

/** One comment entry as `gh api repos/{owner}/{repo}/issues/N/comments`
 *  emits it — untrusted process output; only `body` matters to the
 *  duplicate probe. */
interface RawIssueComment {
  readonly body?: unknown;
}

/** One review entry as `gh api repos/{owner}/{repo}/pulls/N/reviews` emits
 *  it — untrusted process output; only `state` and `body` matter to the
 *  duplicate probe (`remediateDanglingApproval` keeps its own shape since it
 *  also needs `id`). */
interface RawStandingReview {
  readonly state?: unknown;
  readonly body?: unknown;
}

/**
 * The shared engine behind both idempotency probes below: runs the probe
 * `command`, and when any entry of its JSON-array output `matches`, returns a
 * result carrying the probe run so the execute reports an honest no-op
 * instead of re-posting. Everything else returns `undefined` and the write
 * runs as before: a probe outage, unparseable output, or a missing match must
 * fail TOWARD posting — the probes are spam-avoidance, and withholding the
 * verdict itself would be the worse failure.
 */
async function findStandingDuplicate(
  command: PrReviewCommand,
  matches: (entry: unknown) => boolean,
  exec: CliExec,
): Promise<PrReviewCommandResult | undefined> {
  const { code, stdout } = await exec(command.command, command.args);
  if (code !== 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  return parsed.some(matches) ? { command, code, stdout } : undefined;
}

/**
 * The idempotency probe for a queue-for-human execute (epic 0007's re-runs-
 * are-idempotent doctrine — `issue-triage.ts` plans a `'skip'` for an
 * already-labeled issue). A PR that stays queued across passes —
 * security-touching, hold-labeled, oversized — would otherwise collect an
 * identical `gh pr comment` on every confirmed execute. The probe lists the
 * PR's issue comments (`gh pr comment` posts issue comments) and matches any
 * comment whose body is EXACTLY the fresh decision's reasoning — the same
 * body-exact match {@link remediateDanglingApproval} uses to recognize the
 * ritual's own reviews. `per_page=100` reads one page only (no `--paginate`
 * concatenation to mis-parse); a duplicate hiding beyond the first 100
 * comments merely re-posts — today's behavior, the safe direction.
 */
async function findStandingQueueComment(
  number: number,
  reasoning: string,
  exec: CliExec,
): Promise<PrReviewCommandResult | undefined> {
  return findStandingDuplicate(
    {
      command: 'gh',
      args: ['api', `repos/{owner}/{repo}/issues/${number}/comments?per_page=100`],
      details:
        `#${number} already carries this exact queue-for-human comment — ` +
        'nothing re-posted (re-runs are idempotent)',
    },
    (entry) =>
      typeof entry === 'object' && entry !== null && (entry as RawIssueComment).body === reasoning,
    exec,
  );
}

/**
 * The same idempotency probe for the ritual's OTHER repeatable write: a PR
 * held at request-changes across passes — a red gate nobody has fixed, a
 * standing conflict — would otherwise collect an identical `gh pr review
 * --request-changes` on every confirmed execute, each one re-pinging the
 * author. Matches only a STANDING `CHANGES_REQUESTED` review whose body is
 * EXACTLY the fresh decision's reasoning: a `DISMISSED` review no longer
 * stands (re-posting restores the verdict honestly), a different body means
 * the verdict's substance changed (new conflict paths, a different gate
 * state — the fresh reasoning must post), and any other state is not this
 * verdict at all. Same fail-toward-posting stance and one-page read as the
 * comment probe above.
 */
async function findStandingRequestChangesReview(
  number: number,
  reasoning: string,
  exec: CliExec,
): Promise<PrReviewCommandResult | undefined> {
  return findStandingDuplicate(
    {
      command: 'gh',
      args: ['api', `repos/{owner}/{repo}/pulls/${number}/reviews?per_page=100`],
      details:
        `#${number} already carries this exact changes-requested review — ` +
        'nothing re-posted (re-runs are idempotent)',
    },
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as RawStandingReview).state === 'CHANGES_REQUESTED' &&
      (entry as RawStandingReview).body === reasoning,
    exec,
  );
}
