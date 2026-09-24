// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pool client (BOARD web-mss50iaf-fckmbj, "PLATFORM 6/7"): "browse/claim
 * canonical pool issues from any co-pilot dashboard, fly locally on own
 * tokens, deliver PR referencing the issue" (epic 0007). The pool IS the
 * canonical repo's issue tracker — an issue is "in the pool" once KEEPER
 * triage (`flight/issue-triage.ts`, PLATFORM 3/7, already shipped) has
 * labeled it `pool: <dimension>`; there is no separate
 * `pool:open`/`pool:claimed` label pair to maintain, so this reuses {@link
 * POOL_LABEL_PREFIX} rather than inventing a second labeling scheme. A pool
 * issue is "claimed" the same way any GitHub issue is: it carries an
 * assignee (`gh issue list --json assignees`) — the epic's own "claims
 * (assign/comment)" wording names assignment as the claim mechanism, not a
 * label. This ships {@link PoolIssue}, the pure classifiers {@link
 * poolDimension}/{@link isPoolIssue}/{@link isClaimedPoolIssue}, and the
 * read wiring {@link fetchPoolIssues} — the same injectable `CliExec`
 * `issue-triage.ts`'s `fetchOpenIssues` and `pr-review.ts`'s
 * `fetchOpenPrCandidates` use, so this stays deterministically testable
 * without a real `gh` on PATH.
 *
 * The claim action itself: {@link planClaimPoolIssue} decides whether an
 * issue can be claimed for a given login (pure — it never re-derives
 * pool/claimed status any way other than the classifiers above), {@link
 * planClaimPoolIssueCommands} turns an accept into the exact `gh issue edit
 * --add-assignee` + `gh issue comment` argv (same plan-then-apply shape as
 * `issue-triage.ts`'s `planIssueTriageCommands`), {@link
 * executeClaimPoolIssueCommands} runs a plan's commands through the
 * injectable `exec` in order, and {@link claimPoolIssue} composes the whole
 * pass — fetch the open pool, resolve the caller's own gh identity via
 * `pr-review.ts`'s {@link fetchViewerLogin} (a co-pilot claims for
 * themselves, never on another login's behalf), decide, apply. {@link
 * planPoolBrowseBatch} is the browse-side counterpart `pr-review.ts`'s
 * `planPrReviewBatch` is for KEEPER review — pairs every open pool issue
 * with its claim-or-skip decision for a given (possibly unresolved) viewer
 * login, the connective tissue `flight/pool-client-execute.ts`'s HTTP
 * preview wires into `GET /api/pool-client`.
 *
 * The "fly locally" leg's first half: {@link planPoolIssueTask} turns a
 * `'claim'` decision into the `source: 'github'` `CreateTaskInput` a caller
 * hands to `@autopilot/store`'s `createTask` — same shape `issue-triage.ts`'s
 * `planIssueTriageTask` produces, deliberately reusing its `issueTaskId` id
 * scheme rather than a second one, since a pool-claimed task and a
 * KEEPER-triaged task for the same issue number ARE the same unit of work;
 * `createTask`'s duplicate-PK guard makes either landing first harmless.
 * {@link claimAndQueuePoolIssueTask} composes that with {@link
 * claimPoolIssue} against a chosen local project — the connective tissue an
 * HTTP layer will call once a co-pilot picks which of their own registered
 * projects to fly the claimed issue on (the existing generic `POST /api/fly`
 * already starts a flight against a project's queued board once the task
 * lands there). See `docs/epics/0007-platform-maintainer-and-pool.md` slice
 * 6 for what stays open beyond that (the HTTP/UI wiring to pick a target
 * project and trigger the fly, and the PR-delivery leg referencing the
 * issue).
 */

import type { ClaimRoute } from './project-repo.js';
import {
  createTask,
  setTaskFocus,
  DIMENSIONS,
  type CreateTaskInput,
  type Store,
} from '@autopilot/store';
import type { CliExec } from '../connection/cli-probe.js';
import {
  POOL_LABEL_PREFIX,
  parseIssueLabels,
  parseAssignees,
  issueTaskId,
} from './issue-triage.js';
import { fetchViewerLogin } from './pr-review.js';
import { claimContractBody } from './claim-contract.js';
import {
  claimLedger,
  claimStandings,
  CLAIM_WINDOW_DAYS,
  type ClaimStanding,
  type IssueCommentLike,
  type PoolClaim,
} from './claim-ledger.js';

/** One open, pool-labeled GitHub issue — the subset `gh issue list` reports
 *  that a co-pilot's dashboard needs to browse and claim it. */
export interface PoolIssue {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly labels: readonly string[];
  readonly assignees: readonly string[];
  /** THE CLAIMS LEDGER (claim-ledger.ts): every live claim, read from the
   *  claim comments AND the assignees. Optional so a bare fixture still
   *  types; {@link issueClaims} derives assignee-only claims when absent. */
  readonly claims?: readonly PoolClaim[];
}

/**
 * The `pool: <dimension>` label's dimension suffix (e.g. `'ux'` from `'pool:
 * ux'`), or `undefined` when `labels` carries no pool label at all. Pure
 * string derivation off {@link POOL_LABEL_PREFIX} — the same convention
 * `issue-triage.ts`'s `planIssueTriageCommands` writes onto an accepted
 * issue, read back here rather than re-derived from title/body text.
 */
export function poolDimension(labels: readonly string[]): string | undefined {
  const label = labels.find((entry) => entry.startsWith(POOL_LABEL_PREFIX));
  return label?.slice(POOL_LABEL_PREFIX.length);
}

/** True when `labels` carries a `pool: <dimension>` label — the issue has
 *  been through KEEPER triage and accepted into the pool. */
export function isPoolIssue(labels: readonly string[]): boolean {
  return poolDimension(labels) !== undefined;
}

/** The issue's live claims — the ledger when the fetch carried comments,
 *  else the assignees as undated claims (the pre-ledger reading). */
export function issueClaims(issue: PoolIssue): readonly PoolClaim[] {
  return issue.claims ?? claimLedger(issue.assignees, []);
}

/** True when a pool issue is held by anyone — an assignee OR a claim
 *  comment (claim-ledger.ts). Before the ledger this read `assignees`
 *  alone, which is exactly how #27 got claimed twice: an outside
 *  contributor's assign fails silently, only their comment lands. */
export function isClaimedPoolIssue(issue: PoolIssue): boolean {
  return issueClaims(issue).length > 0;
}

/** One issue entry as `gh issue list --json number,title,url,labels,
 *  assignees` emits it — untrusted process output, parsed defensively
 *  rather than trusted as already shaped like {@link PoolIssue}. */
interface RawPoolIssue {
  readonly number?: unknown;
  readonly title?: unknown;
  readonly url?: unknown;
  readonly labels?: unknown;
  readonly assignees?: unknown;
  readonly comments?: unknown;
}

/** `gh issue list --json comments` entries -> ledger comments. Untrusted:
 *  anything without a string author login, a parseable date and a string
 *  body is dropped rather than guessed at. */
export function parsePoolComments(raw: unknown): readonly IssueCommentLike[] {
  if (!Array.isArray(raw)) return [];
  const out: IssueCommentLike[] = [];
  for (const entry of raw as ReadonlyArray<{
    author?: { login?: unknown };
    createdAt?: unknown;
    body?: unknown;
  }>) {
    const author = entry?.author?.login;
    const createdAt = typeof entry?.createdAt === 'string' ? Date.parse(entry.createdAt) : NaN;
    if (typeof author !== 'string' || Number.isNaN(createdAt) || typeof entry.body !== 'string') {
      continue;
    }
    out.push({ author, createdAt, body: entry.body });
  }
  return out;
}

/**
 * Lists every open issue carrying a `pool: <dimension>` label via `gh issue
 * list --state open --json number,title,url,labels,assignees`, run through
 * the injectable `exec` — the same `CliExec` shape `issue-triage.ts`'s
 * `fetchOpenIssues` and `pr-review.ts`'s `fetchOpenPrCandidates` use. `gh
 * issue list --label` ANDs multiple `--label` flags together rather than
 * ORing them, so passing all eight `pool: *` labels would match nothing
 * (an issue carries exactly one) — every open issue is fetched instead and
 * {@link isPoolIssue} filters client-side, the same fetch-then-classify
 * shape `fetchOpenIssues` already uses. Read-only: never assigns, labels,
 * or comments, only lists. Returns `[]` on a non-zero exit or
 * unparseable/non-array stdout rather than throwing — an empty pool is a
 * valid outcome, and a flaky `gh` call shouldn't crash the browse. Entries
 * missing a numeric `number`, string `title`, or string `url` are dropped
 * rather than passed through malformed.
 */
export async function fetchPoolIssues(exec: CliExec): Promise<PoolIssue[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,url,labels,assignees,comments',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as RawPoolIssue[])
    .filter(
      (raw) =>
        typeof raw.number === 'number' &&
        typeof raw.title === 'string' &&
        typeof raw.url === 'string',
    )
    .map((raw) => {
      const assignees = parseAssignees(raw.assignees);
      return {
        number: raw.number as number,
        title: raw.title as string,
        url: raw.url as string,
        labels: parseIssueLabels(raw.labels),
        assignees,
        claims: claimLedger(assignees, parsePoolComments(raw.comments)),
      };
    })
    .filter((issue) => isPoolIssue(issue.labels));
}

/** A stale claim the new claim releases inline — its holder went quiet past
 *  {@link CLAIM_WINDOW_DAYS}; `assigned` says whether an unassign is needed
 *  on top of the release note. */
export interface PoolClaimRelease {
  readonly login: string;
  readonly assigned: boolean;
  readonly quietDays: number;
}

/** A live claim the contesting claimant is told about — who, since when
 *  (`null` when undated), and when it releases on its own. */
export interface PoolClaimHolder {
  readonly login: string;
  readonly since: number | null;
  readonly releasesAt: number | null;
}

/** A pool issue can be claimed for `claimant` — it is in the pool and
 *  nobody holds a live claim on it (stale ones release with this claim). */
export interface PoolClaimAccept {
  readonly decision: 'claim';
  readonly reasoning: string;
  readonly claimant: string;
  readonly releases: readonly PoolClaimRelease[];
}

/** Someone else holds a live claim. The claimant may still claim — a
 *  deliberate "claim anyway" — and both solutions get compared when they
 *  land; the UI warns before it lets them. */
export interface PoolClaimContest {
  readonly decision: 'contest';
  readonly reasoning: string;
  readonly claimant: string;
  readonly holders: readonly PoolClaimHolder[];
}

/** The issue cannot be claimed as-is — the claimant already holds it, or
 *  it was never accepted into the pool in the first place. */
export interface PoolClaimSkip {
  readonly decision: 'skip';
  readonly reasoning: string;
}

export type PoolClaimDecision = PoolClaimAccept | PoolClaimContest | PoolClaimSkip;

function isoDay(ms: number | null): string {
  return ms === null ? 'an unknown date' : new Date(ms).toISOString().slice(0, 10);
}

/**
 * Decides whether `issue` can be claimed for `claimant`: skip when it
 * carries no `pool: <dimension>` label ({@link isPoolIssue}) — it was never
 * accepted into the pool — or when it is already assigned ({@link
 * isClaimedPoolIssue}), otherwise claim. Pure: reuses the same classifiers
 * `fetchPoolIssues` already filters by rather than re-deriving pool/claimed
 * status a second way.
 */
export function planClaimPoolIssue(
  issue: PoolIssue,
  claimant: string,
  nowMs: number = Date.now(),
): PoolClaimDecision {
  if (!isPoolIssue(issue.labels)) {
    return {
      decision: 'skip',
      reasoning: `#${issue.number} carries no pool: label — it was never accepted into the pool`,
    };
  }
  const standings = claimStandings(issueClaims(issue), nowMs);
  const own = standings.find((s) => s.claim.login === claimant && !s.stale);
  if (own) {
    return {
      decision: 'skip',
      reasoning: `#${issue.number} is already yours — you claimed it on ${isoDay(own.claim.claimedAt)}`,
    };
  }
  const others = standings.filter((s) => s.claim.login !== claimant);
  const live = others.filter((s) => !s.stale);
  if (live.length > 0) {
    const holders = live.map((s) => ({
      login: s.claim.login,
      since: s.claim.claimedAt,
      releasesAt: s.releasesAt,
    }));
    const named = holders
      .map(
        (h) =>
          `@${h.login} since ${isoDay(h.since)}` +
          (h.releasesAt === null
            ? ''
            : ` (releases on its own ${isoDay(h.releasesAt)} if they stay quiet)`),
      )
      .join('; ');
    return {
      decision: 'contest',
      claimant,
      holders,
      reasoning:
        `#${issue.number} is held by ${named}. You can still claim it — both solutions are welcome, ` +
        'and when two land the review compares them and the stronger one merges.',
    };
  }
  const releases = others
    .filter((s) => s.stale)
    .map((s) => ({
      login: s.claim.login,
      assigned: s.claim.assigned,
      quietDays: s.quietDays ?? 0,
    }));
  const releaseNote =
    releases.length === 0
      ? ''
      : ` — releasing ${releases.map((r) => `@${r.login}'s claim (quiet ${r.quietDays}d)`).join(', ')} first`;
  return {
    decision: 'claim',
    claimant,
    releases,
    reasoning: `claiming #${issue.number} for ${claimant}: posting the claim as a comment, then assigning${releaseNote}`,
  };
}

/** One `gh` command a {@link planClaimPoolIssueCommands} plan needs run —
 *  same shape as `issue-triage.ts`'s `IssueTriageCommand` and `pr-review.ts`'s
 *  `PrReviewCommand`. */
export interface PoolClaimCommand {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/**
 * Turns a {@link planClaimPoolIssue} decision into the `gh` command(s)
 * needed to apply it: a `'claim'` gets `gh issue edit --add-assignee
 * <claimant>` followed by a comment announcing the claim; a `'skip'` plans
 * nothing, keeping a re-run against an already-claimed or non-pool issue a
 * no-op. Pure: plans argv, never invokes `gh` itself — {@link
 * executeClaimPoolIssueCommands} is the write-side counterpart.
 */
export function planClaimPoolIssueCommands(
  issue: PoolIssue,
  claimant: string,
  decision: PoolClaimDecision,
): readonly PoolClaimCommand[] {
  if (decision.decision === 'skip') return [];

  const issueRef = String(issue.number);
  const commands: PoolClaimCommand[] = [];
  if (decision.decision === 'claim') {
    for (const release of decision.releases) {
      commands.push({
        command: 'gh',
        args: [
          'issue',
          'comment',
          issueRef,
          '--body',
          `Releasing @${release.login}'s claim — quiet for ${release.quietDays} days, past the ` +
            `${CLAIM_WINDOW_DAYS}-day window. The issue is back in the pool; re-claim any time.`,
        ],
        details: `releasing @${release.login}'s stale claim on #${issue.number} (quiet ${release.quietDays}d)`,
      });
      if (release.assigned) {
        commands.push({
          command: 'gh',
          args: ['issue', 'edit', issueRef, '--remove-assignee', release.login],
          details: `unassigning @${release.login} from #${issue.number}`,
        });
      }
    }
  }
  const body =
    decision.decision === 'contest'
      ? `Also claimed by ${claimant} via the pool client (contested).\n\n` +
        `${decision.holders.map((h) => `@${h.login}`).join(', ')} holds the first claim (since ` +
        `${decision.holders.map((h) => isoDay(h.since)).join(', ')}); it releases on its own after ` +
        `${CLAIM_WINDOW_DAYS} quiet days. Both solutions are welcome: when two land, the review ` +
        'compares them and the stronger one merges, or the two are combined.'
      : `Claimed by ${claimant} via the pool client.\n\n` +
        `The claim holds while it moves: a progress note or a PR within every ${CLAIM_WINDOW_DAYS} ` +
        `days keeps it; ${CLAIM_WINDOW_DAYS} quiet days release it back to the pool.`;
  // COMMENT FIRST, THEN ASSIGN: GitHub only lets a repo assign someone who
  // already has a footprint on the issue, so for an outside contributor the
  // assign only succeeds once their comment is up. The old order (assign,
  // then comment) is how gabibi555's claim on #27 lost its assignee.
  commands.push({
    command: 'gh',
    args: ['issue', 'comment', issueRef, '--body', body],
    details: `posting the claim as a comment on #${issue.number}`,
  });
  commands.push({
    command: 'gh',
    args: ['issue', 'edit', issueRef, '--add-assignee', claimant],
    details: `assigning #${issue.number} to ${claimant}`,
  });
  return commands;
}

/** One {@link PoolClaimCommand} run to completion — paired back with the
 *  command it came from, same shape as `issue-triage.ts`'s
 *  `IssueTriageCommandResult`. */
export interface PoolClaimCommandResult {
  readonly command: PoolClaimCommand;
  readonly code: number;
  readonly stdout: string;
}

/**
 * Runs a claim plan's {@link PoolClaimCommand}s in order through the
 * injectable `exec`. Always runs every command and reports every result,
 * even after an earlier one fails — the same "never abort partway through"
 * convention `issue-triage.ts`'s `executeIssueTriageCommands` uses, so a
 * failed assign doesn't hide whether the trailing comment also failed.
 */
export async function executeClaimPoolIssueCommands(
  commands: readonly PoolClaimCommand[],
  exec: CliExec,
): Promise<readonly PoolClaimCommandResult[]> {
  const results: PoolClaimCommandResult[] = [];
  for (const command of commands) {
    const { code, stdout } = await exec(command.command, command.args);
    results.push({ command, code, stdout });
  }
  return results;
}

/** One {@link claimPoolIssue} pass's full outcome: the decision reached,
 *  every `gh` command's result (empty for a skip), and the resolved {@link
 *  PoolIssue} itself — `undefined` only when `issueNumber` was not in the
 *  open pool at all, so {@link claimAndQueuePoolIssueTask} has what it needs
 *  to also plan a board task without re-fetching the pool a second time. */
export interface ClaimPoolIssueResult {
  readonly decision: PoolClaimDecision;
  readonly commandResults: readonly PoolClaimCommandResult[];
  readonly issue: PoolIssue | undefined;
}

/**
 * The claim action as one composed pass: {@link fetchPoolIssues} the open
 * pool and {@link fetchViewerLogin} the caller's own gh identity in
 * parallel — a co-pilot claims a pool issue for themselves, never on
 * another login's behalf — then {@link planClaimPoolIssue}/{@link
 * planClaimPoolIssueCommands}/{@link executeClaimPoolIssueCommands} decide
 * and apply. `issueNumber` not found in the open pool, or a viewer login
 * that fails to resolve, both plan a `'skip'` with no commands run — the
 * same fail-closed shape `pr-review.ts`'s ownership checks use, since
 * claiming on an unresolved identity would post as `undefined`. This is the
 * single entrypoint a confirm-guarded HTTP handler will call once that
 * wiring lands (see this file's header comment) — everything the claim
 * action needs already composes here.
 */
export async function claimPoolIssue(
  issueNumber: number,
  exec: CliExec,
  now: () => number = Date.now,
): Promise<ClaimPoolIssueResult> {
  const [issues, claimant] = await Promise.all([fetchPoolIssues(exec), fetchViewerLogin(exec)]);
  const issue = issues.find((entry) => entry.number === issueNumber);

  if (issue === undefined || claimant === undefined) {
    const decision: PoolClaimDecision = {
      decision: 'skip',
      reasoning:
        issue === undefined
          ? `#${issueNumber} is not an open pool issue`
          : `could not resolve the authenticated gh identity to claim #${issueNumber} for`,
    };
    return { decision, commandResults: [], issue };
  }

  const decision = planClaimPoolIssue(issue, claimant, now());
  const commands = planClaimPoolIssueCommands(issue, claimant, decision);
  const commandResults = await executeClaimPoolIssueCommands(commands, exec);
  return { decision, commandResults, issue };
}

/** One pool issue paired with the claim-or-skip decision {@link
 *  planClaimPoolIssue} reaches for a given viewer — the browse list's per-
 *  row shape `GET /api/pool-client` returns. */
export interface PoolBrowseEntry {
  readonly issue: PoolIssue;
  readonly decision: PoolClaimDecision;
  /** THE CLAIMS LEDGER, measured: who holds the issue, since when, how
   *  quiet, and when each claim releases — what the panel paints under the
   *  title so a second claimant is never surprised. */
  readonly claims: readonly ClaimStanding[];
}

/**
 * Pairs every issue in `issues` with its {@link planClaimPoolIssue} decision
 * for `claimant` — the browse-side counterpart `pr-review.ts`'s
 * `planPrReviewBatch` is for KEEPER review. `claimant` is `undefined` when
 * the caller's own gh identity failed to resolve ({@link fetchViewerLogin}
 * returning `undefined`); every issue then plans a `'skip'` with that
 * reasoning rather than crashing the browse — the same fail-closed shape
 * {@link claimPoolIssue} already uses for an unresolved viewer. Pure:
 * composes an already-pure classifier per issue, no I/O of its own.
 */
export function planPoolBrowseBatch(
  issues: readonly PoolIssue[],
  claimant: string | undefined,
  nowMs: number = Date.now(),
): readonly PoolBrowseEntry[] {
  return issues.map((issue) => ({
    issue,
    decision:
      claimant === undefined
        ? {
            decision: 'skip',
            reasoning: `could not resolve the authenticated gh identity to claim #${issue.number} for`,
          }
        : planClaimPoolIssue(issue, claimant, nowMs),
    claims: claimStandings(issueClaims(issue), nowMs),
  }));
}

/** A task board needs a bounded title; a pool issue title is already short
 *  but capped defensively the same way `issue-triage.ts`'s
 *  `ISSUE_TASK_TITLE_CHARS` bounds its own. */
const POOL_TASK_TITLE_CHARS = 200;

/**
 * {@link poolDimension}'s suffix is untrusted — read straight off a GitHub
 * label, not re-derived from `issue-triage.ts`'s validated {@link
 * Dimension}-typed `classifyIssueDimension`. Only a label matching a real
 * {@link DIMENSIONS} entry is passed through to `createTask`'s
 * CHECK-constrained `dimension` column; anything else (a drifted taxonomy, a
 * hand-edited label) degrades to `null` rather than `createTask` silently
 * rejecting the whole task on the DB constraint — a false `taskQueued:
 * false` a caller could otherwise never tell apart from "already claimed".
 */
function knownPoolDimension(labels: readonly string[]): string | null {
  const dimension = poolDimension(labels);
  return dimension !== undefined && (DIMENSIONS as readonly string[]).includes(dimension)
    ? dimension
    : null;
}

/**
 * Turns a `'claim'` {@link PoolClaimDecision} for `issue` into the
 * `CreateTaskInput` a caller hands to `@autopilot/store`'s `createTask` on
 * `projectId` — same shape `issue-triage.ts`'s `planIssueTriageTask`
 * produces, deliberately content-addressed via its own {@link issueTaskId}
 * rather than a second id scheme, since a pool-claimed task and a
 * KEEPER-triaged task for the same issue number are the same unit of work
 * either way it lands on a board first. Returns `null` for a `'skip'`
 * decision — nothing to queue, matching {@link planIssueTriageTask}'s own
 * `null`-for-non-accept convention. Pure: builds the input object only,
 * {@link claimAndQueuePoolIssueTask} composes it with the actual store
 * write.
 */
export function planPoolIssueTask(
  issue: PoolIssue,
  decision: PoolClaimDecision,
  projectId: string,
  createdAt: number,
): CreateTaskInput | null {
  if (decision.decision === 'skip') return null;
  return {
    id: issueTaskId(issue.number),
    projectId,
    title: issue.title.slice(0, POOL_TASK_TITLE_CHARS),
    dimension: knownPoolDimension(issue.labels),
    // THE CLAIM CONTRACT (claim-contract.ts): the body names the issue, who
    // holds it (and whom they contest), and the rule every reader honours —
    // only the claimant closes it.
    body: claimContractBody(issue.number, issue.url, {
      claimant: decision.claimant,
      contestedWith: decision.decision === 'contest' ? decision.holders.map((h) => h.login) : [],
    }),
    source: 'github',
    createdAt,
  };
}

/** One {@link claimAndQueuePoolIssueTask} pass's full outcome: everything
 *  {@link ClaimPoolIssueResult} already carries, plus whether a board task
 *  actually got queued for it. */
export interface ClaimAndQueuePoolIssueResult extends ClaimPoolIssueResult {
  readonly taskQueued: boolean;
  /** Where the local task was routed, or why it was not queued: the project
   *  must be a local checkout of the issue's own repository (project-repo.ts). */
  readonly route?: ClaimRoute;
  /** True when the queued task was also FOCUSED — the claimant's own
   *  pilot now delivers slices against it first (operator, 2026-09-12:
   *  "אם גביבי בחר להתמקד במשהו הטיס שלו חייב להמשיך לדלבר"). */
  readonly focused: boolean;
}

/**
 * The "fly locally" leg's first half, composed: {@link claimPoolIssue} as
 * before, then — when it resolved a real pool issue — {@link
 * planPoolIssueTask}/`createTask` to also queue a `source: 'github'` board
 * task for `projectId`, the same local project a co-pilot will separately
 * point the existing generic `POST /api/fly` at to actually work it.
 * `taskQueued` is `false` for a `'skip'` decision (nothing to queue) or when
 * `issueNumber` was never in the open pool at all ({@link
 * ClaimPoolIssueResult.issue} `undefined`) — never thrown, mirroring how
 * `createTask` itself never throws on a rejected write.
 */
export async function claimAndQueuePoolIssueTask(
  issueNumber: number,
  projectId: string,
  exec: CliExec,
  store: Store,
  now: () => number = Date.now,
): Promise<ClaimAndQueuePoolIssueResult> {
  const result = await claimPoolIssue(issueNumber, exec);
  return queueClaimedPoolIssueTask(result, projectId, store, now);
}

/** The second half of {@link claimAndQueuePoolIssueTask} on its own, so a
 *  caller can decide WHERE the task goes after the claim has resolved the
 *  issue (and its repository) — the pool execute API routes by repository in
 *  between. */
export function queueClaimedPoolIssueTask(
  result: ClaimPoolIssueResult,
  projectId: string,
  store: Store,
  now: () => number = Date.now,
): ClaimAndQueuePoolIssueResult {
  if (result.issue === undefined) return { ...result, taskQueued: false, focused: false };

  const input = planPoolIssueTask(result.issue, result.decision, projectId, now());
  const taskQueued = input !== null && createTask(store, input);
  // The claim is a FOCUS, not just a row: the next firing claims this task
  // first (focused-first ordering in fly.ts) and keeps slicing it until the
  // mirror pass sees the claimant close the issue.
  const focused = taskQueued && input !== null && setTaskFocus(store, input.id, true, now());
  return { ...result, taskQueued, focused };
}
