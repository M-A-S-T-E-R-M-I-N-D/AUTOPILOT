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
 * get a duplicate one every reconcile pass.
 *
 * Derivation 3/4 ({@link planMirrorPassVersionDrift}) covers the first of
 * "README/docs public claims ↔ tree reality (versions, counts, links)" —
 * the version claim specifically: README.md's own "Current version **X**"
 * prose against `package.json`'s real `version` field, the same two sources
 * `readReleaseInfo` (apps/dashboard/src/read/project-detail.ts) already
 * reads for the release preview. A mismatch files a finding as a `gh issue
 * create` command, same deferred-execution stance as the rest of this file
 * — nothing here calls `gh`.
 *
 * The "counts" half of derivation 3/4 ({@link planMirrorPassCountsDrift})
 * covers the same doc-vs-tree shape for a different claim: README.md's and
 * THANKS.md's "487 open-source projects" / "487 packages" prose against the
 * real row count in `docs/THIRD-PARTY-LICENSES.md` — the same file
 * `pnpm licenses list --json` regenerates whenever the dependency set
 * changes, so a stale headline count is exactly the kind of drift this
 * doc's own docstring promises to catch mechanically.
 *
 * The "links" half of derivation 3/4 ({@link planMirrorPassLinkDrift}) covers
 * the last of "README/docs public claims ↔ tree reality": every relative
 * markdown link a doc makes (`[text](path)` or `![alt](path)`, excluding
 * pure in-page anchors and anything with a URL scheme) against whether that
 * path still exists in the tree — the same "doc references a file that moved
 * or was deleted" drift a broken-link checker would catch, done the same
 * pure-planner way as the version/counts halves above.
 *
 * Derivation 4/4 ({@link planMirrorPassStaleClaimReaper}) is the stale-claim
 * reaper, "epic-shared with the collab protocol slices": it reuses
 * `web/task-queue.ts`'s {@link STALE_TASK_DAYS} — the exact 14-day threshold
 * already driving the dashboard's own board-task STALE chip
 * (`web-mssnofje-bboigi`) — rather than a second, independently-tunable
 * magic number for the same "quiet too long" concept applied to a GitHub
 * issue's assignee instead of a board task. An issue assigned to someone who
 * has gone quiet for that many days gets unassigned (never closed — the work
 * may still be valid) with an honest comment, freeing it for anyone to pick
 * back up, same anti-stale-claim spirit as the board chip itself.
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { CliExec } from '../connection/cli-probe.js';
import { STALE_TASK_DAYS } from '../web/task-queue.js';

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

/** Extracts a `"Current version **X.Y.Z**"` claim from README-style prose
 *  (the exact phrasing this repo's own README.md uses) — `null` when the
 *  text carries no such claim, which {@link planMirrorPassVersionDrift}
 *  treats as nothing to check rather than a drift. */
export function extractReadmeVersionClaim(readmeContent: string): string | null {
  const match = /current version\s+\*\*(\d+\.\d+\.\d+)\*\*/i.exec(readmeContent);
  return match ? (match[1] ?? null) : null;
}

/** Derivation 3/4's version-drift finding: a doc claims a version that
 *  disagrees with the tree's real `package.json`. */
export interface MirrorPassVersionDriftFinding {
  readonly action: 'file-version-drift-issue';
  readonly source: string;
  readonly claimedVersion: string;
  readonly actualVersion: string;
}

/**
 * Decides whether `readmeContent`'s version claim disagrees with
 * `actualVersion` — derivation 3/4, the "versions" half of "README/docs
 * public claims ↔ tree reality". `null` when the doc makes no version claim
 * to check ({@link extractReadmeVersionClaim} found nothing) or when the
 * claim already matches the tree; a mismatch is always a
 * {@link MirrorPassVersionDriftFinding}, never guessed at from partial data.
 */
export function planMirrorPassVersionDrift(
  readmeContent: string,
  actualVersion: string,
  source = 'README.md',
): MirrorPassVersionDriftFinding | null {
  const claimedVersion = extractReadmeVersionClaim(readmeContent);
  if (claimedVersion === null || claimedVersion === actualVersion) return null;
  return { action: 'file-version-drift-issue', source, claimedVersion, actualVersion };
}

/**
 * Turns a {@link MirrorPassVersionDriftFinding} into the `gh issue create`
 * call needed to file it — deferred execution, same as
 * {@link planMirrorPassCommands}: this plans the argv, a caller invokes it.
 * De-duplicating against an already-open drift issue is the Social
 * Protocol's "search before you speak" law (epic 0016 slice 1), not this
 * pure planner's concern — a caller wires that check before invoking this
 * command, the same layering {@link planMirrorPassCommands} already assumes
 * for its own comment/close/reopen calls.
 */
export function planMirrorPassVersionDriftCommand(
  finding: MirrorPassVersionDriftFinding,
): MirrorPassCommand {
  const title = `${finding.source} claims version ${finding.claimedVersion}, tree is at ${finding.actualVersion}`;
  const body =
    `Mirror pass found a version drift: **${finding.source}** states the current version is ` +
    `\`${finding.claimedVersion}\`, but \`package.json\` in the tree is at \`${finding.actualVersion}\`. ` +
    'Either the doc is stale or the version bump was missed.';
  return {
    command: 'gh',
    args: ['issue', 'create', '--title', title, '--body', body],
    details: `filing a version-drift finding: ${finding.source} says ${finding.claimedVersion}, tree is ${finding.actualVersion}`,
  };
}

/**
 * Reads `readmePath` and `packageJsonPath` from disk and runs
 * {@link planMirrorPassVersionDrift} against their contents — the read
 * wiring a caller composes with {@link planMirrorPassVersionDriftCommand},
 * same division of labor {@link fetchIssueState} has with
 * {@link planMirrorPassReconcile}. A missing/unreadable file, unparseable
 * `package.json`, or a non-string `version` field all mean the actual
 * version is unknowable — `null`, never a guess.
 */
export function readMirrorPassVersionDrift(
  readmePath: string,
  packageJsonPath: string,
): MirrorPassVersionDriftFinding | null {
  let readmeContent: string;
  let actualVersion: string;
  try {
    readmeContent = readFileSync(readmePath, 'utf8');
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
    if (typeof pkg.version !== 'string' || !pkg.version) return null;
    actualVersion = pkg.version;
  } catch {
    return null;
  }
  return planMirrorPassVersionDrift(readmeContent, actualVersion, basename(readmePath));
}

/** Extracts a `"<N> open-source projects"` or `"<N> packages"` count claim
 *  from prose — the two phrasings this repo's own README.md and THANKS.md
 *  use for the same third-party-dependency count — `null` when the text
 *  carries no such claim, which {@link planMirrorPassCountsDrift} treats as
 *  nothing to check rather than a drift. Thousands separators (`1,234`) are
 *  stripped before parsing. */
export function extractPackageCountClaim(content: string): number | null {
  const match = /(\d[\d,]*)\s+(?:open-source projects|packages)\b/i.exec(content);
  if (!match) return null;
  return Number(match[1]!.replace(/,/g, ''));
}

/** Counts the data rows in `docs/THIRD-PARTY-LICENSES.md`'s package table —
 *  every `| package | version(s) | license |` line except the header row and
 *  its `| --- | --- | --- |` separator, the same table `pnpm licenses list
 *  --json` regenerates whenever the dependency set changes. */
export function countThirdPartyLicenseRows(content: string): number {
  const pipeLines = content.split('\n').filter((line) => line.trim().startsWith('|'));
  const isSeparator = (line: string) => /^\|[\s:-]+\|[\s:|-]*$/.test(line.trim());
  return pipeLines.filter((line, index) => index > 0 && !isSeparator(line)).length;
}

/** Derivation 3/4's counts-drift finding: a doc claims a third-party-package
 *  count that disagrees with the tree's real license inventory. */
export interface MirrorPassCountsDriftFinding {
  readonly action: 'file-counts-drift-issue';
  readonly source: string;
  readonly claimedCount: number;
  readonly actualCount: number;
}

/**
 * Decides whether `docContent`'s package-count claim disagrees with
 * `actualCount` — the "counts" half of derivation 3/4, "README/docs public
 * claims ↔ tree reality". `null` when the doc makes no count claim to check
 * ({@link extractPackageCountClaim} found nothing) or when the claim already
 * matches the tree; a mismatch is always a {@link MirrorPassCountsDriftFinding},
 * never guessed at from partial data. Same shape as
 * {@link planMirrorPassVersionDrift}.
 */
export function planMirrorPassCountsDrift(
  docContent: string,
  actualCount: number,
  source = 'README.md',
): MirrorPassCountsDriftFinding | null {
  const claimedCount = extractPackageCountClaim(docContent);
  if (claimedCount === null || claimedCount === actualCount) return null;
  return { action: 'file-counts-drift-issue', source, claimedCount, actualCount };
}

/**
 * Turns a {@link MirrorPassCountsDriftFinding} into the `gh issue create`
 * call needed to file it — deferred execution, same as
 * {@link planMirrorPassVersionDriftCommand}: this plans the argv, a caller
 * invokes it. De-duplicating against an already-open drift issue is the
 * Social Protocol's "search before you speak" law (epic 0016 slice 1), not
 * this pure planner's concern, same layering the version-drift command
 * already assumes.
 */
export function planMirrorPassCountsDriftCommand(
  finding: MirrorPassCountsDriftFinding,
): MirrorPassCommand {
  const title = `${finding.source} claims ${finding.claimedCount} packages, tree has ${finding.actualCount}`;
  const body =
    `Mirror pass found a package-count drift: **${finding.source}** states \`${finding.claimedCount}\` ` +
    `third-party packages, but \`docs/THIRD-PARTY-LICENSES.md\` lists \`${finding.actualCount}\`. ` +
    'Either the doc is stale or the license inventory needs regenerating (`pnpm licenses list --json`).';
  return {
    command: 'gh',
    args: ['issue', 'create', '--title', title, '--body', body],
    details: `filing a package-count drift finding: ${finding.source} says ${finding.claimedCount}, tree has ${finding.actualCount}`,
  };
}

/**
 * Reads `docPath` and `thirdPartyLicensesPath` from disk and runs
 * {@link planMirrorPassCountsDrift} against their contents — the read wiring
 * a caller composes with {@link planMirrorPassCountsDriftCommand}, same
 * division of labor {@link readMirrorPassVersionDrift} has with
 * {@link planMirrorPassVersionDrift}. A missing/unreadable file means the
 * actual count is unknowable — `null`, never a guess.
 */
export function readMirrorPassCountsDrift(
  docPath: string,
  thirdPartyLicensesPath: string,
): MirrorPassCountsDriftFinding | null {
  let docContent: string;
  let licensesContent: string;
  try {
    docContent = readFileSync(docPath, 'utf8');
    licensesContent = readFileSync(thirdPartyLicensesPath, 'utf8');
  } catch {
    return null;
  }
  const actualCount = countThirdPartyLicenseRows(licensesContent);
  return planMirrorPassCountsDrift(docContent, actualCount, basename(docPath));
}

/**
 * Extracts every relative internal link target from markdown `content` —
 * both `[text](path)` links and `![alt](path)` images share the same
 * `](...)` shape, so both are caught. Excludes a pure in-page anchor
 * (`#section`, nothing to check on disk) and any target carrying a URL
 * scheme (`https://`, `mailto:`, etc. — not this repo's tree to verify). A
 * trailing `#fragment` on an otherwise-relative link (e.g.
 * `docs/PAPER.md#6-threats-to-validity`) is stripped before returning, since
 * only the file's existence is checked — not the fragment's own validity.
 * Deduplicated and sorted for a deterministic result.
 */
export function extractInternalDocLinks(content: string): readonly string[] {
  const linkPattern = /\]\(([^)]+)\)/g;
  const targets = new Set<string>();
  for (const match of content.matchAll(linkPattern)) {
    const raw = match[1]?.trim();
    if (!raw || raw.startsWith('#')) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) continue;
    const withoutFragment = raw.split('#')[0]!.trim();
    if (withoutFragment) targets.add(withoutFragment);
  }
  return [...targets].sort();
}

/** Derivation 3/4's link-drift finding: one or more internal links in a doc
 *  point at a path that no longer exists in the tree. Bundled into a single
 *  finding (rather than one per link) so a pass with several dead links
 *  files one issue, not a spray of them — the Social Protocol's "budgeted
 *  voice" law (epic 0016 slice 1). */
export interface MirrorPassBrokenLinkFinding {
  readonly action: 'file-broken-link-issue';
  readonly source: string;
  readonly brokenLinks: readonly string[];
}

/**
 * Decides whether any of `links` fails to resolve via the injectable
 * `exists` check — the "links" half of derivation 3/4, "README/docs public
 * claims ↔ tree reality". `null` when every link resolves (or `links` is
 * empty); otherwise a single {@link MirrorPassBrokenLinkFinding} naming every
 * link that failed, never one finding per link.
 */
export function planMirrorPassLinkDrift(
  links: readonly string[],
  exists: (path: string) => boolean,
  source = 'README.md',
): MirrorPassBrokenLinkFinding | null {
  const brokenLinks = links.filter((link) => !exists(link));
  if (brokenLinks.length === 0) return null;
  return { action: 'file-broken-link-issue', source, brokenLinks };
}

/**
 * Turns a {@link MirrorPassBrokenLinkFinding} into the `gh issue create` call
 * needed to file it — deferred execution, same as
 * {@link planMirrorPassCountsDriftCommand}: this plans the argv, a caller
 * invokes it. De-duplicating against an already-open drift issue is the
 * Social Protocol's "search before you speak" law, not this pure planner's
 * concern, same layering the version/counts-drift commands already assume.
 */
export function planMirrorPassLinkDriftCommand(
  finding: MirrorPassBrokenLinkFinding,
): MirrorPassCommand {
  const count = finding.brokenLinks.length;
  const title = `${finding.source} has ${count} broken internal link${count === 1 ? '' : 's'}`;
  const body =
    `Mirror pass found ${count} internal link${count === 1 ? '' : 's'} in **${finding.source}** ` +
    `pointing to a path that no longer exists in the tree:\n\n` +
    finding.brokenLinks.map((link) => `- \`${link}\``).join('\n');
  return {
    command: 'gh',
    args: ['issue', 'create', '--title', title, '--body', body],
    details: `filing a broken-link finding: ${count} dead link(s) in ${finding.source}`,
  };
}

/**
 * Reads `docPath` and runs {@link planMirrorPassLinkDrift} against its
 * internal links, resolving each one relative to `repoRoot` (the same root a
 * rendered markdown link on GitHub resolves against, since these docs live
 * at or under the repo root) — the read wiring a caller composes with
 * {@link planMirrorPassLinkDriftCommand}, same division of labor
 * {@link readMirrorPassCountsDrift} has with {@link planMirrorPassCountsDrift}.
 * A missing/unreadable doc means nothing to check — `null`, never a guess.
 */
export function readMirrorPassLinkDrift(
  docPath: string,
  repoRoot: string,
): MirrorPassBrokenLinkFinding | null {
  let content: string;
  try {
    content = readFileSync(docPath, 'utf8');
  } catch {
    return null;
  }
  const links = extractInternalDocLinks(content);
  return planMirrorPassLinkDrift(
    links,
    (link) => existsSync(join(repoRoot, link)),
    basename(docPath),
  );
}

/** The subset of a GitHub issue's live state derivation 4/4 needs: its
 *  assignee (`null` when unassigned — nothing to reap) and the best
 *  available "last activity" timestamp for that assignee specifically, not
 *  the issue in general — see {@link fetchClaimedIssueActivity}'s docstring
 *  for why a non-assignee's comment never counts as activity here. */
export interface MirrorPassClaimedIssue {
  readonly number: number;
  readonly state: 'open' | 'closed';
  readonly assignee: string | null;
  readonly lastActivityAt: number;
}

/** Derivation 4/4's finding: an open issue's assignee has been quiet long
 *  enough to reap the claim. */
export interface MirrorPassStaleClaimFinding {
  readonly action: 'reap-stale-claim';
  readonly issueNumber: number;
  readonly assignee: string;
  readonly quietDays: number;
  readonly comment: string;
}

/**
 * Decides whether `issue`'s claim should be reaped — derivation 4/4, "stale
 * claims (assignee quiet 14d) → the reaper path". `null` for a closed issue
 * (nothing to reap), an unassigned one (nothing to reclaim), or one whose
 * assignee has been active within `thresholdDays` (defaults to the shared
 * {@link STALE_TASK_DAYS}, the same 14-day convention the board's own STALE
 * chip uses). Never guesses at partial data, same stance as
 * {@link planMirrorPassReconcile}.
 */
export function planMirrorPassStaleClaimReaper(
  issue: MirrorPassClaimedIssue,
  nowMs: number,
  thresholdDays: number = STALE_TASK_DAYS,
): MirrorPassStaleClaimFinding | null {
  if (issue.state !== 'open' || !issue.assignee) return null;
  const quietDays = Math.max(0, Math.floor((nowMs - issue.lastActivityAt) / (24 * 60 * 60 * 1000)));
  if (quietDays < thresholdDays) return null;

  return {
    action: 'reap-stale-claim',
    issueNumber: issue.number,
    assignee: issue.assignee,
    quietDays,
    comment:
      `Unassigning @${issue.assignee} — quiet for ${quietDays} days on this claim. ` +
      "Freeing it up so anyone can pick it back up. Comment here if you're still working on " +
      'it and this was a mistake.',
  };
}

/**
 * Turns a {@link MirrorPassStaleClaimFinding} into the `gh` command(s) needed
 * to apply it: the reopen-explaining comment first (so the note lands even
 * if the unassign call itself fails), then the unassign — same
 * comment-before-state-change ordering {@link planMirrorPassCommands} uses.
 * Pure: plans argv, never invokes `gh`.
 */
export function planMirrorPassStaleClaimCommands(
  finding: MirrorPassStaleClaimFinding,
): readonly MirrorPassCommand[] {
  const issueRef = String(finding.issueNumber);
  return [
    {
      command: 'gh',
      args: ['issue', 'comment', issueRef, '--body', finding.comment],
      details: `posting the stale-claim reaper note on #${finding.issueNumber}`,
    },
    {
      command: 'gh',
      args: ['issue', 'edit', issueRef, '--remove-assignee', finding.assignee],
      details: `unassigning @${finding.assignee} from #${finding.issueNumber} — quiet ${finding.quietDays}d`,
    },
  ];
}

/** One github-issue-activity entry as `gh issue view --json
 *  number,state,assignees,comments,updatedAt` emits it — untrusted process
 *  output, parsed defensively same as {@link RawGithubIssueState}. */
interface RawGithubIssueActivity {
  readonly number?: unknown;
  readonly state?: unknown;
  readonly assignees?: unknown;
  readonly comments?: unknown;
  readonly updatedAt?: unknown;
}

/**
 * Fetches `issueNumber`'s live claim-activity via `gh issue view <n> --json
 * number,state,assignees,comments,updatedAt`, run through the injectable
 * `exec` — same `CliExec` shape and never-throw-on-bad-data stance as
 * {@link fetchIssueState}. The assignee is the first entry in `assignees`
 * (`null` when empty). `lastActivityAt` is the assignee's own most recent
 * comment timestamp when they have commented at all; a comment from anyone
 * ELSE never counts, since derivation 4/4 is about the ASSIGNEE going quiet,
 * not the issue itself — an active thread with a silent assignee is exactly
 * the case this is meant to catch. When the assignee has never commented,
 * this falls back to the issue's own `updatedAt`, which is a conservative
 * (never-too-eager) proxy: any activity on the issue at all — including
 * someone else's comment — delays the reap clock rather than accelerating
 * it. Returns `null` on a non-zero exit, unparseable JSON, or a missing/
 * malformed `number`/`state`/`updatedAt` field.
 */
export async function fetchClaimedIssueActivity(
  exec: CliExec,
  issueNumber: number,
): Promise<MirrorPassClaimedIssue | null> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'view',
    String(issueNumber),
    '--json',
    'number,state,assignees,comments,updatedAt',
  ]);
  if (code !== 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const raw = parsed as RawGithubIssueActivity;
  if (typeof raw.number !== 'number' || typeof raw.state !== 'string') return null;
  const state = raw.state.toUpperCase();
  if (state !== 'OPEN' && state !== 'CLOSED') return null;

  const updatedAtMs = typeof raw.updatedAt === 'string' ? Date.parse(raw.updatedAt) : NaN;
  if (Number.isNaN(updatedAtMs)) return null;

  const assignees = Array.isArray(raw.assignees) ? raw.assignees : [];
  const firstAssignee = assignees[0] as { login?: unknown } | undefined;
  const assignee =
    firstAssignee && typeof firstAssignee.login === 'string' ? firstAssignee.login : null;

  const comments = Array.isArray(raw.comments) ? raw.comments : [];
  let lastActivityAt = updatedAtMs;
  if (assignee) {
    for (const entry of comments as ReadonlyArray<{
      author?: { login?: unknown };
      createdAt?: unknown;
    }>) {
      if (entry?.author?.login !== assignee || typeof entry.createdAt !== 'string') continue;
      const commentMs = Date.parse(entry.createdAt);
      if (!Number.isNaN(commentMs)) lastActivityAt = commentMs;
    }
  }

  return {
    number: raw.number,
    state: state === 'OPEN' ? 'open' : 'closed',
    assignee,
    lastActivityAt,
  };
}
