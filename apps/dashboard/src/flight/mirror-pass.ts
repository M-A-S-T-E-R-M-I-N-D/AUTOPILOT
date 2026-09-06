// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MIRROR PASS ritual, derivations 1-2/4 (epic 0016 slice 2, board web-mtpzzx50-obq42b):
 * "Board tasks marked done ↔ referenced issues actually closed? Close with a
 * landing note (commit SHA) or reopen honestly." — docs/epics/0016-github-social-flight.md.
 *
 * A board task accepted from a GitHub issue carries `issue-triage.ts`'s
 * content-addressed id, `github-<n>` (see `issueTaskId`). This repo lands
 * work via direct commits on `autopilot/flight` (ADDITIVE GIT ONLY — no PR,
 * so no `Closes #<n>` trailer ever runs, unlike the "contribute upstream"
 * flow `github-execute.ts`'s `handleGithubPrExecute` drives against a
 * *different*, forked repo), so nothing ever tells GitHub when that task's
 * own issue is actually done: the reconcile this file plans is the only
 * thing that does. Same shape as `issue-triage.ts`: a pure decision planner
 * ({@link planMirrorPassReconcile}), a pure command planner ({@link
 * planMirrorPassCommands}) that turns a decision into `gh` argv, and an
 * injectable-`CliExec` read ({@link fetchIssueState}). Write execution is
 * deferred the same way `issue-triage.ts`'s `executeIssueTriageCommands` was
 * before its own confirm-guarded endpoint landed — nothing in this file
 * calls `gh` to change anything.
 *
 * Derivation 2/4 ({@link planMirrorPassLandingNote}) covers the gap
 * derivation 1/4 leaves: a task that landed and whose issue is ALREADY
 * closed — in sync, so {@link planMirrorPassReconcile} returns `null` — but
 * closed some other way (a manual close, a PR merge) that never posted the
 * landing SHA anywhere. "landed commits get landed-in comments" checks the
 * issue's own comment history ({@link fetchIssueComments}) rather than
 * guessing from state alone, so a task that already got its note doesn't
 * get a duplicate one every reconcile pass. The remaining two mirror-pass
 * derivations (README-claims↔tree, stale-claim reaper) are follow-up
 * slices of the same board task.
 */

import type { CliExec } from '../connection/cli-probe.js';

/** Parses `issue-triage.ts`'s `issueTaskId` convention (`github-<n>`) back
 *  into the issue number it names — `null` for a task id from any other
 *  source (self, inbox, backlog, chat, dashboard), which this reconcile has
 *  nothing to check against. */
export function issueNumberFromTaskId(taskId: string): number | null {
  const match = /^github-(\d+)$/.exec(taskId);
  if (!match) return null;
  return Number(match[1]);
}

/** The subset of a board task this reconcile needs — status (has it
 *  actually landed?) and the landing commit sha, if `@autopilot/store`'s
 *  `metrics.sha` recorded one for its most recent shipped firing. */
export interface MirrorPassTaskCandidate {
  readonly id: string;
  readonly status: 'queued' | 'in_progress' | 'done' | 'needs_approval' | 'deferred';
  readonly landedSha: string | null;
}

/** The subset of a GitHub issue's live state this reconcile needs — just
 *  enough to tell open from closed. */
export interface MirrorPassIssueState {
  readonly number: number;
  readonly state: 'open' | 'closed';
}

export interface MirrorPassCloseFinding {
  readonly action: 'close-with-landing-note';
  readonly taskId: string;
  readonly issueNumber: number;
  readonly sha: string | null;
  readonly comment: string;
}

export interface MirrorPassReopenFinding {
  readonly action: 'reopen-honestly';
  readonly taskId: string;
  readonly issueNumber: number;
  readonly comment: string;
}

export type MirrorPassFinding = MirrorPassCloseFinding | MirrorPassReopenFinding;

/**
 * Decides whether `task`'s issue needs to be closed or reopened to match the
 * board's own truth. `undefined` `issue` means the fetch failed or the issue
 * no longer exists — never guessed at, so no finding is returned (the same
 * "don't guess" stance `fetchOpenIssues` takes on a bad `gh` call). A task id
 * from a non-`github-<n>` source has nothing to reconcile against — also
 * `null`. Everything else is either already in sync (`null`) or one of two
 * honest corrections: {@link MirrorPassCloseFinding} when the board says done
 * but GitHub still shows the issue open (closes it, with the landing SHA if
 * one was recorded), or {@link MirrorPassReopenFinding} when the board no
 * longer says done (reopened, deferred, whatever) but GitHub already closed
 * it — reopened rather than left standing as a stale false-close.
 */
export function planMirrorPassReconcile(
  task: MirrorPassTaskCandidate,
  issue: MirrorPassIssueState | undefined,
): MirrorPassFinding | null {
  const issueNumber = issueNumberFromTaskId(task.id);
  if (issueNumber === null || !issue) return null;

  if (task.status === 'done' && issue.state === 'open') {
    return {
      action: 'close-with-landing-note',
      taskId: task.id,
      issueNumber,
      sha: task.landedSha,
      comment: task.landedSha
        ? `Landed in ${task.landedSha} — closing.`
        : 'This is done on the board, but no landing commit was recorded — closing without a SHA reference.',
    };
  }

  if (task.status !== 'done' && issue.state === 'closed') {
    return {
      action: 'reopen-honestly',
      taskId: task.id,
      issueNumber,
      comment:
        `Reopening — the board task backing this issue is "${task.status}", not done. ` +
        'Closing it earlier was a false-close.',
    };
  }

  return null;
}

/** One planned `gh` call to apply a {@link MirrorPassFinding} — the exact
 *  argv a caller hands to `execFile`, never a shell string, same convention
 *  as `issue-triage.ts`'s `IssueTriageCommand`. */
export interface MirrorPassCommand {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/**
 * Turns a {@link MirrorPassFinding} into the `gh` command(s) needed to apply
 * it: the reconcile comment first (so the note lands even if the
 * close/reopen call itself fails), then the state change. Pure: plans argv,
 * never invokes `gh` — a caller wires the actual `execFile` calls, same
 * deferred-execution stance `issue-triage.ts` takes.
 */
export function planMirrorPassCommands(finding: MirrorPassFinding): readonly MirrorPassCommand[] {
  const issueRef = String(finding.issueNumber);
  const comment: MirrorPassCommand = {
    command: 'gh',
    args: ['issue', 'comment', issueRef, '--body', finding.comment],
    details: `posting the mirror-pass reconcile note on #${finding.issueNumber}`,
  };
  const stateChange: MirrorPassCommand =
    finding.action === 'close-with-landing-note'
      ? {
          command: 'gh',
          args: ['issue', 'close', issueRef],
          details: `closing #${finding.issueNumber} — board task ${finding.taskId} landed`,
        }
      : {
          command: 'gh',
          args: ['issue', 'reopen', issueRef],
          details: `reopening #${finding.issueNumber} — board task ${finding.taskId} is not done`,
        };
  return [comment, stateChange];
}

/** One reconciled task's full outcome — the finding {@link
 *  planMirrorPassReconcile} reached (or `null` when already in sync) paired
 *  with the `gh` commands {@link planMirrorPassCommands} derived from it. */
export interface MirrorPassPlan {
  readonly task: MirrorPassTaskCandidate;
  readonly finding: MirrorPassFinding | null;
  readonly commands: readonly MirrorPassCommand[];
}

/**
 * Runs {@link planMirrorPassReconcile} then {@link planMirrorPassCommands}
 * for every candidate in `tasks`, looking each up in `issuesByNumber` (keyed
 * by {@link issueNumberFromTaskId}'s parse of `task.id`) — a task with no
 * matching entry is treated the same as a failed fetch (`undefined`), so a
 * caller only needs to populate whichever issues it managed to fetch. Pure:
 * composes two already-pure functions, no I/O of its own.
 */
export function planMirrorPassBatch(
  tasks: readonly MirrorPassTaskCandidate[],
  issuesByNumber: ReadonlyMap<number, MirrorPassIssueState>,
): readonly MirrorPassPlan[] {
  return tasks.map((task) => {
    const issueNumber = issueNumberFromTaskId(task.id);
    const issue = issueNumber === null ? undefined : issuesByNumber.get(issueNumber);
    const finding = planMirrorPassReconcile(task, issue);
    const commands = finding ? planMirrorPassCommands(finding) : [];
    return { task, finding, commands };
  });
}

/** One github-issue-view entry as `gh issue view --json number,state` emits
 *  it — untrusted process output, parsed defensively rather than trusted as
 *  already shaped like {@link MirrorPassIssueState}. */
interface RawGithubIssueState {
  readonly number?: unknown;
  readonly state?: unknown;
}

/**
 * Fetches one issue's live open/closed state via `gh issue view <n> --json
 * number,state`, run through the injectable `exec` — the same `CliExec`
 * shape `issue-triage.ts`'s `fetchOpenIssues` uses, so this stays
 * deterministically testable without a real `gh` on PATH. Returns `null` on
 * a non-zero exit (issue not found, `gh` not authenticated, etc.) or
 * unparseable/malformed JSON rather than throwing — {@link
 * planMirrorPassReconcile} already treats a missing issue as "don't guess",
 * never as a signal to act on.
 */
export async function fetchIssueState(
  exec: CliExec,
  issueNumber: number,
): Promise<MirrorPassIssueState | null> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'view',
    String(issueNumber),
    '--json',
    'number,state',
  ]);
  if (code !== 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const raw = parsed as RawGithubIssueState;
  if (typeof raw.number !== 'number' || typeof raw.state !== 'string') return null;
  const state = raw.state.toUpperCase();
  if (state !== 'OPEN' && state !== 'CLOSED') return null;
  return { number: raw.number, state: state === 'OPEN' ? 'open' : 'closed' };
}

/**
 * Fetches every distinct issue referenced by `tasks` (via {@link
 * issueNumberFromTaskId}) through {@link fetchIssueState}, keyed by issue
 * number — the read wiring a caller composes with {@link
 * planMirrorPassBatch}. A task from a non-github source, or whose issue
 * fetch fails, simply has no entry — {@link planMirrorPassBatch} already
 * treats that as unreconcilable rather than an error.
 */
export async function fetchMirrorPassIssueStates(
  exec: CliExec,
  tasks: readonly MirrorPassTaskCandidate[],
): Promise<ReadonlyMap<number, MirrorPassIssueState>> {
  const numbers = new Set<number>();
  for (const task of tasks) {
    const issueNumber = issueNumberFromTaskId(task.id);
    if (issueNumber !== null) numbers.add(issueNumber);
  }
  const states = new Map<number, MirrorPassIssueState>();
  for (const number of numbers) {
    const state = await fetchIssueState(exec, number);
    if (state) states.set(number, state);
  }
  return states;
}

/** Derivation 2/4's finding: the issue already agrees with the board (it's
 *  closed, and the task is done), but no comment on it ever recorded the
 *  landing SHA — so one is posted now, without touching the issue's state. */
export interface MirrorPassLandingNoteFinding {
  readonly action: 'note-landing-sha';
  readonly taskId: string;
  readonly issueNumber: number;
  readonly sha: string;
  readonly comment: string;
}

/**
 * Decides whether a landed task's issue needs its landing SHA noted after
 * the fact — derivation 2/4, "landed commits get landed-in comments". Only
 * fires once the issue is ALREADY closed: a still-open issue is handled by
 * {@link planMirrorPassReconcile}'s close-with-landing-note, which bundles
 * the same note into its own close comment, so noting it again here would
 * duplicate that one. Requires a recorded `landedSha` (nothing to note
 * otherwise) and skips a task whose issue can't be resolved
 * ({@link issueNumberFromTaskId} returning `null`, or a missing `issue`).
 * `existingComments` is every comment already on the issue — a body already
 * containing the SHA means the note was posted before, so `null` is
 * returned rather than posting a duplicate.
 */
export function planMirrorPassLandingNote(
  task: MirrorPassTaskCandidate,
  issue: MirrorPassIssueState | undefined,
  existingComments: readonly string[],
): MirrorPassLandingNoteFinding | null {
  const issueNumber = issueNumberFromTaskId(task.id);
  if (issueNumber === null || !issue || issue.state !== 'closed') return null;
  if (task.status !== 'done' || !task.landedSha) return null;
  const sha = task.landedSha;
  if (existingComments.some((body) => body.includes(sha))) return null;

  return {
    action: 'note-landing-sha',
    taskId: task.id,
    issueNumber,
    sha,
    comment: `Landed in ${sha} — noting for the record.`,
  };
}

/** Turns a {@link MirrorPassLandingNoteFinding} into the single `gh` call
 *  needed to apply it — no state change, unlike {@link
 *  planMirrorPassCommands}, since the issue is already closed. */
export function planMirrorPassLandingNoteCommand(
  finding: MirrorPassLandingNoteFinding,
): MirrorPassCommand {
  return {
    command: 'gh',
    args: ['issue', 'comment', String(finding.issueNumber), '--body', finding.comment],
    details: `posting the landing note on #${finding.issueNumber} (${finding.taskId})`,
  };
}

/** One task's derivation-2/4 outcome — the finding (or `null` when already
 *  noted or not applicable) paired with the single `gh` command it needs. */
export interface MirrorPassLandingNotePlan {
  readonly task: MirrorPassTaskCandidate;
  readonly finding: MirrorPassLandingNoteFinding | null;
  readonly command: MirrorPassCommand | null;
}

/**
 * Runs {@link planMirrorPassLandingNote} for every candidate in `tasks`,
 * looking each up in `issuesByNumber` and `commentsByIssueNumber` the same
 * lookup-or-treat-as-missing way {@link planMirrorPassBatch} does. Pure:
 * composes already-pure functions, no I/O of its own.
 */
export function planMirrorPassLandingNoteBatch(
  tasks: readonly MirrorPassTaskCandidate[],
  issuesByNumber: ReadonlyMap<number, MirrorPassIssueState>,
  commentsByIssueNumber: ReadonlyMap<number, readonly string[]>,
): readonly MirrorPassLandingNotePlan[] {
  return tasks.map((task) => {
    const issueNumber = issueNumberFromTaskId(task.id);
    const issue = issueNumber === null ? undefined : issuesByNumber.get(issueNumber);
    const comments = issueNumber === null ? [] : (commentsByIssueNumber.get(issueNumber) ?? []);
    const finding = planMirrorPassLandingNote(task, issue, comments);
    const command = finding ? planMirrorPassLandingNoteCommand(finding) : null;
    return { task, finding, command };
  });
}

/** One github-issue-comments entry as `gh issue view --json comments` emits
 *  it — untrusted process output, parsed defensively same as {@link
 *  RawGithubIssueState}. */
interface RawGithubIssueComment {
  readonly body?: unknown;
}

/**
 * Fetches every comment body already posted on an issue via `gh issue view
 * <n> --json comments`, run through the injectable `exec` — same
 * defensive-parse, never-throw stance {@link fetchIssueState} takes. Returns
 * an empty array on a non-zero exit, unparseable JSON, or a missing/malformed
 * `comments` field, which {@link planMirrorPassLandingNote} treats as "no
 * note posted yet" rather than a reason to skip the check.
 */
export async function fetchIssueComments(
  exec: CliExec,
  issueNumber: number,
): Promise<readonly string[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'view',
    String(issueNumber),
    '--json',
    'comments',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const raw = parsed as { comments?: unknown };
  if (!Array.isArray(raw.comments)) return [];
  return raw.comments
    .filter((entry): entry is RawGithubIssueComment => typeof entry === 'object' && entry !== null)
    .map((entry) => (typeof entry.body === 'string' ? entry.body : ''))
    .filter((body) => body.length > 0);
}

/**
 * Fetches comments only for issues that actually need the derivation-2/4
 * check — closed, with a task that's done and carries a `landedSha` — so a
 * still-open issue (handled by the close-with-landing-note path instead)
 * never costs an extra `gh` call. The read wiring a caller composes with
 * {@link planMirrorPassLandingNoteBatch}, same division of labor {@link
 * fetchMirrorPassIssueStates} has with {@link planMirrorPassBatch}.
 */
export async function fetchMirrorPassIssueComments(
  exec: CliExec,
  tasks: readonly MirrorPassTaskCandidate[],
  issuesByNumber: ReadonlyMap<number, MirrorPassIssueState>,
): Promise<ReadonlyMap<number, readonly string[]>> {
  const numbers = new Set<number>();
  for (const task of tasks) {
    if (task.status !== 'done' || !task.landedSha) continue;
    const issueNumber = issueNumberFromTaskId(task.id);
    if (issueNumber === null) continue;
    if (issuesByNumber.get(issueNumber)?.state === 'closed') numbers.add(issueNumber);
  }
  const comments = new Map<number, readonly string[]>();
  for (const number of numbers) {
    comments.set(number, await fetchIssueComments(exec, number));
  }
  return comments;
}
