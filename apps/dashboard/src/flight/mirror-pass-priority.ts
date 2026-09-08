// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MIRROR PASS, priority-follows-label leg (epic 0019 "GitHub Steward" slice
 * 3, board web-mtrh1hlh-62l41b): "issue labeled/milestoned by the
 * maintainer ⇒ board priority follows" — law 2's other direction. The
 * board-done-closes-issue half of S3 already exists (`mirror-pass.ts`'s
 * {@link planMirrorPassReconcile}); this is the GitHub-to-board half that
 * had nothing built yet — a maintainer who labels an issue `priority:
 * <level>` on the page is steering, and the board must actually follow,
 * never just note it and keep triage's own ranking.
 *
 * Same pure-planner-plus-injectable-executor seam every other mirror-pass
 * derivation uses: {@link planMirrorPassPriorityFollow} is deterministic and
 * I/O-free, {@link fetchIssueLabels} is the only thing that shells out
 * (reusing `issue-triage.ts`'s {@link parseIssueLabels} rather than a second
 * label-array reduction), and {@link planMirrorPassPriorityFollowCommand}
 * plans the store write a caller applies via `@autopilot/store`'s
 * `reorderTasks`/pin machinery — never invoked from here. {@link
 * PRIORITY_LABEL_BAND} reuses `taxonomy-seed.ts`'s own `priority: <level>`
 * label names verbatim rather than inventing a second scheme for the same
 * four bands.
 *
 * `priorityPinned` in the finding check mirrors `@autopilot/store`'s own
 * M16 operator-pin semantics: once the label has already pushed a task to
 * its band AND pinned it, re-planning is a no-op (idempotent, no duplicate
 * command) — but a task whose priority merely happens to equal the band
 * value without being pinned still gets a finding, since only a *pinned*
 * priority is safe from triage folding it back into its own ranking on the
 * next takeoff.
 *
 * Deliberately out of scope for this slice (S3 is bigger than one firing):
 * milestone-follows-the-same-way, wiring this planner into an actual HTTP
 * endpoint/dashboard surface (UX-EXPRESSION — this ships as a slice, not
 * complete), and the "generalize... per project" half of S3 (this and every
 * other mirror-pass derivation still assumes the single `{owner}/{repo}`
 * `gh` CLI context, not a per-project repo selector).
 */

import type { CliExec } from '../connection/cli-probe.js';
import { parseIssueLabels } from './issue-triage.js';
import {
  issueNumberFromTaskId,
  type MirrorPassTaskCandidate,
  type MirrorPassIssueState,
} from './mirror-pass.js';

/** GitHub's `priority: <level>` label (`taxonomy-seed.ts`'s
 *  `HOUSE_TAXONOMY_LABELS`) → the board's own numeric priority band (lower =
 *  sooner, `packages/store`'s `TaskRow.priority`). Bands leave gaps of 100
 *  so a task manually reordered within a band never forces renumbering the
 *  whole scheme. */
export const PRIORITY_LABEL_BAND: Readonly<Record<string, number>> = {
  'priority: critical': 0,
  'priority: high': 100,
  'priority: medium': 200,
  'priority: low': 300,
};

/** The subset of a board task this planner needs beyond {@link
 *  MirrorPassTaskCandidate}'s `id`/`status` — its current priority band and
 *  whether that value is already an operator-grade pin. */
export interface MirrorPassPriorityCandidate extends MirrorPassTaskCandidate {
  readonly priority: number | null;
  readonly priorityPinned: boolean;
}

/** The finding: the maintainer's live label disagrees with (or merely
 *  outranks the pin-state of) the board's current priority. */
export interface MirrorPassPriorityFollowFinding {
  readonly action: 'set-priority-from-label';
  readonly taskId: string;
  readonly issueNumber: number;
  readonly label: string;
  readonly priority: number;
}

/**
 * Decides whether `task`'s board priority needs to follow `issue`'s live
 * `priority: <level>` label — the GitHub-to-board direction of law 2 ("what
 * the maintainer marks priority: high outranks triage"). `null` when the
 * task isn't github-sourced, the issue fetch failed, the task already
 * landed (`'done'` — nothing left to steer), `labels` carries none of
 * {@link PRIORITY_LABEL_BAND}'s four names, or the board already matches
 * (same band AND already pinned). When two priority labels are somehow both
 * present, the first one found in `labels`' own order wins — never guessed
 * at by trying to combine them.
 */
export function planMirrorPassPriorityFollow(
  task: MirrorPassPriorityCandidate,
  issue: MirrorPassIssueState | undefined,
  labels: readonly string[],
): MirrorPassPriorityFollowFinding | null {
  const issueNumber = issueNumberFromTaskId(task.id);
  if (issueNumber === null || !issue) return null;
  if (task.status === 'done') return null;

  const priorityLabel = labels.find((label) => label in PRIORITY_LABEL_BAND);
  if (priorityLabel === undefined) return null;

  const priority = PRIORITY_LABEL_BAND[priorityLabel]!;
  if (task.priority === priority && task.priorityPinned) return null;

  return {
    action: 'set-priority-from-label',
    taskId: task.id,
    issueNumber,
    label: priorityLabel,
    priority,
  };
}

/** One planned board write to apply a {@link MirrorPassPriorityFollowFinding}
 *  — a store mutation, never a `gh` call (this steers the board FROM
 *  GitHub, the opposite direction of every other mirror-pass command),
 *  which a caller applies via `@autopilot/store`'s pin-aware priority
 *  setter. Pure: plans the intent, never touches the store itself. */
export interface MirrorPassPriorityFollowCommand {
  readonly kind: 'set-task-priority';
  readonly taskId: string;
  readonly priority: number;
  readonly details: string;
}

export function planMirrorPassPriorityFollowCommand(
  finding: MirrorPassPriorityFollowFinding,
): MirrorPassPriorityFollowCommand {
  return {
    kind: 'set-task-priority',
    taskId: finding.taskId,
    priority: finding.priority,
    details:
      `pinning ${finding.taskId} to priority ${finding.priority} — issue #${finding.issueNumber} ` +
      `carries "${finding.label}" (law 2: the maintainer's label outranks triage)`,
  };
}

/** One reconciled task's full outcome for this derivation — same shape
 *  {@link import('./mirror-pass.js').MirrorPassPlan} uses for the
 *  board-done-closes-issue direction. */
export interface MirrorPassPriorityFollowPlan {
  readonly task: MirrorPassPriorityCandidate;
  readonly finding: MirrorPassPriorityFollowFinding | null;
  readonly command: MirrorPassPriorityFollowCommand | null;
}

/**
 * Runs {@link planMirrorPassPriorityFollow} for every candidate in `tasks`,
 * looking each up in `issuesByNumber`/`labelsByIssueNumber` the same
 * lookup-or-treat-as-missing way `mirror-pass.ts`'s `planMirrorPassBatch`
 * does. Pure: composes already-pure functions, no I/O of its own.
 */
export function planMirrorPassPriorityFollowBatch(
  tasks: readonly MirrorPassPriorityCandidate[],
  issuesByNumber: ReadonlyMap<number, MirrorPassIssueState>,
  labelsByIssueNumber: ReadonlyMap<number, readonly string[]>,
): readonly MirrorPassPriorityFollowPlan[] {
  return tasks.map((task) => {
    const issueNumber = issueNumberFromTaskId(task.id);
    const issue = issueNumber === null ? undefined : issuesByNumber.get(issueNumber);
    const labels = issueNumber === null ? [] : (labelsByIssueNumber.get(issueNumber) ?? []);
    const finding = planMirrorPassPriorityFollow(task, issue, labels);
    const command = finding ? planMirrorPassPriorityFollowCommand(finding) : null;
    return { task, finding, command };
  });
}

/** One github-issue-labels entry as `gh issue view --json labels` emits it —
 *  untrusted process output, reduced through `issue-triage.ts`'s {@link
 *  parseIssueLabels} rather than a second defensive reduction. */
interface RawGithubIssueLabels {
  readonly labels?: unknown;
}

/**
 * Fetches one issue's live label names via `gh issue view <n> --json
 * labels`, run through the injectable `exec` — same `CliExec` shape and
 * never-throw-on-bad-data stance `mirror-pass.ts`'s {@link
 * import('./mirror-pass.js').fetchIssueState} uses. Returns `[]` on a
 * non-zero exit or unparseable/malformed JSON — the same "nothing to steer
 * with" outcome an issue that genuinely carries no labels produces, never a
 * guess.
 */
export async function fetchIssueLabels(
  exec: CliExec,
  issueNumber: number,
): Promise<readonly string[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'view',
    String(issueNumber),
    '--json',
    'labels',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (typeof parsed !== 'object' || parsed === null) return [];
  return parseIssueLabels((parsed as RawGithubIssueLabels).labels);
}

/**
 * Fetches labels only for tasks that could actually need this derivation —
 * github-sourced, not yet `'done'`, and whose issue state was resolved —
 * the same scoped-fetch discipline `mirror-pass.ts`'s {@link
 * import('./mirror-pass.js').fetchMirrorPassIssueComments} uses to avoid a
 * `gh` call nothing downstream will use. The read wiring a caller composes
 * with {@link planMirrorPassPriorityFollowBatch}.
 */
export async function fetchMirrorPassIssueLabels(
  exec: CliExec,
  tasks: readonly MirrorPassPriorityCandidate[],
  issuesByNumber: ReadonlyMap<number, MirrorPassIssueState>,
): Promise<ReadonlyMap<number, readonly string[]>> {
  const numbers = new Set<number>();
  for (const task of tasks) {
    if (task.status === 'done') continue;
    const issueNumber = issueNumberFromTaskId(task.id);
    if (issueNumber === null) continue;
    if (issuesByNumber.has(issueNumber)) numbers.add(issueNumber);
  }
  const labels = new Map<number, readonly string[]>();
  for (const number of numbers) {
    labels.set(number, await fetchIssueLabels(exec, number));
  }
  return labels;
}
