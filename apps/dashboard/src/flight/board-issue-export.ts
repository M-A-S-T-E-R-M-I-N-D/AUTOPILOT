// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * BOARD→ISSUES EXPORT ritual, slice 2/3 (board ap-mu7ktjpc-1; parent
 * web-mtpzqrw8-dsy6a9, split confirmed by VERDICT ap-mu6lf6ve-4 —
 * docs/debriefs/2026-09-19-verdict-ap-mu6lf6ve-4-board-issues-export-split-confirmed.md):
 * the pure decision core. Given the board tasks the operator marked
 * shareable and the repo's current issues, {@link planBoardIssueExport}
 * decides which task gets a NEW `help wanted` issue, which already-exported
 * issue needs its title/body refreshed, and which must be left alone; {@link
 * planBoardIssueExportCommands} turns one decision into the exact `gh` argv.
 *
 * Same plan/apply/UI split as `issue-triage.ts` and `mirror-pass.ts`: nothing
 * in this file calls `gh`. The confirm-guarded endpoint that runs the planned
 * commands and the dashboard panel that shows the plan first are slice 3/3;
 * the store's `shareable` flag itself is slice 1/3 — this planner reads it
 * structurally ({@link BoardExportTask.shareable}), so it lands independently.
 *
 * Two different "is this already on GitHub?" answers, on purpose:
 *
 *   - OURS: an issue this ritual filed carries {@link exportMarker} (the task
 *     id in a hidden HTML comment), so a later pass finds it exactly and
 *     edits it in place — or, if a human closed it, never files it again.
 *   - SOMEONE ELSE'S: an open issue whose title overlaps the task's by
 *     `reconcile.ts`'s word-Jaccard {@link titleMatchScore} — the measure
 *     `issue-triage.ts` already dedups incoming issues with — is reported as
 *     a duplicate and gets NO command. A fuzzy match is evidence for the
 *     operator, never licence to overwrite a human's issue.
 */

import type { TaskStatus } from '@autopilot/store';
import { titleMatchScore } from '../read/reconcile.js';
import { HELP_WANTED_LABEL } from './help-wanted-items.js';
import { issueNumberFromTaskId } from './mirror-pass.js';

/** Title overlap at or above which a task counts as already tracked by an
 *  open issue — the same 0.5 bar `issue-triage.ts`'s `DUPLICATE_THRESHOLD`
 *  and `reconcile.ts`'s `DEFAULT_MATCH_THRESHOLD` use, so "same work" means
 *  one thing in both directions between the board and GitHub. */
export const EXPORT_DUPLICATE_THRESHOLD = 0.5;

/** Only queued work is open for outside help: in-progress work would invite
 *  a collision with a flight, and done/deferred/needs-approval work is not
 *  something anyone should pick up. */
const EXPORTABLE_STATUS: TaskStatus = 'queued';

/** A task id this ritual will embed in its HTML-comment marker. Board ids are
 *  generated (`ap-…`, `web-…`), but the marker is parsed back from text
 *  anyone can edit — an id carrying `>` or whitespace could close the comment
 *  early or fail to round-trip, so it is refused rather than escaped. */
const SAFE_TASK_ID = /^[A-Za-z0-9._-]+$/;

/** Anchored to the END of the body: {@link renderExportIssueBody} always
 *  writes the marker last, after the task's free-text detail. An unanchored
 *  match would read the FIRST marker — so a task body quoting another task's
 *  marker would misattribute this issue to that task, and a later pass would
 *  overwrite it with the other task's content. */
const MARKER_PATTERN = /<!-- autopilot-board-task: ([A-Za-z0-9._-]+) -->\s*$/;

/** The subset of a board task this planner needs. `shareable` is the
 *  operator's explicit opt-in (slice 1/3's flag); everything else is the
 *  store's own `TaskRow` shape. */
export interface BoardExportTask {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly status: TaskStatus;
  readonly shareable: boolean;
}

/** The subset of a GitHub issue this planner needs. Closed issues belong in
 *  the list too: they are how an exported-then-closed task is recognized and
 *  never re-filed. */
export interface BoardExportIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly state: 'open' | 'closed';
}

export interface BoardIssueExportCreate {
  readonly action: 'create';
  readonly taskId: string;
  readonly title: string;
  readonly body: string;
  readonly reasoning: string;
}

export interface BoardIssueExportUpdate {
  readonly action: 'update';
  readonly taskId: string;
  readonly issueNumber: number;
  readonly title: string;
  readonly body: string;
  readonly reasoning: string;
}

/** What a duplicate overlaps: an open issue on GitHub, or an earlier task in
 *  the same batch that this pass already plans to file. */
export type BoardIssueExportMatch =
  | { readonly kind: 'issue'; readonly issueNumber: number }
  | { readonly kind: 'task'; readonly taskId: string };

export interface BoardIssueExportDuplicate {
  readonly action: 'duplicate';
  readonly taskId: string;
  readonly match: BoardIssueExportMatch;
  readonly score: number;
  readonly reasoning: string;
}

export interface BoardIssueExportSkip {
  readonly action: 'skip';
  readonly taskId: string;
  readonly reasoning: string;
}

export type BoardIssueExportDecision =
  | BoardIssueExportCreate
  | BoardIssueExportUpdate
  | BoardIssueExportDuplicate
  | BoardIssueExportSkip;

/** One planned `gh` call — argv for `execFile`, never a shell string, same
 *  convention as `issue-triage.ts`'s `IssueTriageCommand`. */
export interface BoardIssueExportCommand {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/** The hidden line that ties an exported issue back to its board task. */
export function exportMarker(taskId: string): string {
  return `<!-- autopilot-board-task: ${taskId} -->`;
}

/** The board task id an issue body's final-line {@link exportMarker} names,
 *  or `null` for an issue this ritual did not file. */
export function parseExportMarker(body: string): string | null {
  return MARKER_PATTERN.exec(body)?.[1] ?? null;
}

/** The issue body an exported task gets: the board's own detail, then a
 *  footer naming the task, then the marker. */
export function renderExportIssueBody(task: Pick<BoardExportTask, 'id' | 'body'>): string {
  const detail = task.body?.trim() ?? '';
  return [
    detail === '' ? '_No further detail was recorded on the board for this task._' : detail,
    '',
    '---',
    `Exported from the AUTOPILOT board (task \`${task.id}\`) — help wanted: anyone may pick this up.`,
    exportMarker(task.id),
  ].join('\n');
}

/** GitHub hands bodies back with CRLF and a trailing newline it may have
 *  added itself; neither is drift. */
function sameBody(a: string, b: string): boolean {
  const normalize = (text: string): string => text.replace(/\r\n/g, '\n').trimEnd();
  return normalize(a) === normalize(b);
}

/** Reasons a shareable task is never filed, checked before any GitHub state
 *  is consulted. `null` means the task is a candidate. */
function ineligibility(task: BoardExportTask, title: string): string | null {
  if (!SAFE_TASK_ID.test(task.id)) {
    return `task id "${task.id}" cannot be carried in the export marker safely — not exporting it.`;
  }
  const originIssue = issueNumberFromTaskId(task.id);
  if (originIssue !== null) {
    return `${task.id} came from GitHub — it already is issue #${originIssue}, so exporting it would file it twice.`;
  }
  if (title === '') return `${task.id} has no title — there is nothing to file.`;
  if (task.status !== EXPORTABLE_STATUS) {
    return `${task.id} is "${task.status}", not "${EXPORTABLE_STATUS}" — only queued work is offered for outside help.`;
  }
  return null;
}

/** Decides what an issue this ritual already filed for `task` needs. */
function planExported(
  task: BoardExportTask,
  title: string,
  body: string,
  exported: BoardExportIssue,
): BoardIssueExportDecision {
  if (exported.state === 'closed') {
    return {
      action: 'skip',
      taskId: task.id,
      reasoning: `${task.id} was exported as #${exported.number}, which was closed on GitHub — never re-filing a closed export.`,
    };
  }
  if (exported.title.trim() === title && sameBody(exported.body, body)) {
    return {
      action: 'skip',
      taskId: task.id,
      reasoning: `${task.id}'s exported issue #${exported.number} already matches the board.`,
    };
  }
  return {
    action: 'update',
    taskId: task.id,
    issueNumber: exported.number,
    title,
    body,
    reasoning: `${task.id} changed on the board since it was exported as #${exported.number} — refreshing its title and body.`,
  };
}

/** The strongest title overlap in `candidates` at or above `threshold`;
 *  the first wins a tie, so input order decides deterministically. */
function strongestMatch<T>(
  title: string,
  candidates: readonly T[],
  titleOf: (candidate: T) => string,
  threshold: number,
): { readonly candidate: T; readonly score: number } | null {
  let best: { candidate: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = titleMatchScore(title, titleOf(candidate));
    if (score >= threshold && (best === null || score > best.score)) best = { candidate, score };
  }
  return best;
}

/**
 * Plans the export for every shareable task in `tasks`, in input order.
 * Tasks not marked shareable produce no decision at all. For the rest, in
 * order: an ineligible task (unsafe id, a `github-<n>` task, a blank title,
 * any status but queued) is skipped; a task with an issue carrying its
 * {@link exportMarker} is refreshed, left alone when in sync, or left alone
 * for good when that issue was closed; a task whose title overlaps an OPEN
 * issue — or a task this same pass already plans to file — by at least
 * `threshold` is a duplicate with no command; anything left is created.
 * Pure: no I/O, no clock, no randomness.
 */
export function planBoardIssueExport(
  tasks: readonly BoardExportTask[],
  issues: readonly BoardExportIssue[],
  threshold: number = EXPORT_DUPLICATE_THRESHOLD,
): readonly BoardIssueExportDecision[] {
  // One export per task; if a marker was ever copied onto a second issue,
  // the open one is the live export — a closed copy must not hide it.
  const exportedByTask = new Map<string, BoardExportIssue>();
  for (const existing of issues) {
    const taskId = parseExportMarker(existing.body);
    if (taskId === null) continue;
    const known = exportedByTask.get(taskId);
    if (known === undefined || (known.state === 'closed' && existing.state === 'open')) {
      exportedByTask.set(taskId, existing);
    }
  }
  const openIssues = issues.filter((existing) => existing.state === 'open');
  const plannedCreates: BoardIssueExportCreate[] = [];
  const decisions: BoardIssueExportDecision[] = [];

  for (const task of tasks) {
    if (!task.shareable) continue;
    const title = task.title.trim();
    const blocked = ineligibility(task, title);
    if (blocked !== null) {
      decisions.push({ action: 'skip', taskId: task.id, reasoning: blocked });
      continue;
    }
    const body = renderExportIssueBody(task);
    const exported = exportedByTask.get(task.id);
    if (exported !== undefined) {
      decisions.push(planExported(task, title, body, exported));
      continue;
    }
    const onGithub = strongestMatch(title, openIssues, (open) => open.title, threshold);
    if (onGithub !== null) {
      decisions.push({
        action: 'duplicate',
        taskId: task.id,
        match: { kind: 'issue', issueNumber: onGithub.candidate.number },
        score: onGithub.score,
        reasoning: `${task.id} overlaps open issue #${onGithub.candidate.number} "${onGithub.candidate.title}" — already tracked there, not filing a second one.`,
      });
      continue;
    }
    const inBatch = strongestMatch(title, plannedCreates, (planned) => planned.title, threshold);
    if (inBatch !== null) {
      decisions.push({
        action: 'duplicate',
        taskId: task.id,
        match: { kind: 'task', taskId: inBatch.candidate.taskId },
        score: inBatch.score,
        reasoning: `${task.id} overlaps ${inBatch.candidate.taskId}, which this pass already files — not filing it twice.`,
      });
      continue;
    }
    const create: BoardIssueExportCreate = {
      action: 'create',
      taskId: task.id,
      title,
      body,
      reasoning: `${task.id} is shareable, queued, and not yet on GitHub — filing it as a help-wanted issue.`,
    };
    plannedCreates.push(create);
    decisions.push(create);
  }
  return decisions;
}

/**
 * The `gh` argv that applies one decision: a create files a new issue under
 * GitHub's default {@link HELP_WANTED_LABEL} (so the COLLABORATION panel's
 * `help-wanted-items.ts` read lists it — `gh` fails the create outright if
 * the repo deleted that default label, which the executor reports); an update
 * edits the exported issue's title and body in place. A duplicate or skip
 * plans nothing. Pure: plans argv, never invokes `gh`.
 */
export function planBoardIssueExportCommands(
  decision: BoardIssueExportDecision,
): readonly BoardIssueExportCommand[] {
  if (decision.action === 'create') {
    return [
      {
        command: 'gh',
        args: [
          'issue',
          'create',
          '--title',
          decision.title,
          '--body',
          decision.body,
          '--label',
          HELP_WANTED_LABEL,
        ],
        details: `filing board task ${decision.taskId} as a help-wanted issue`,
      },
    ];
  }
  if (decision.action === 'update') {
    return [
      {
        command: 'gh',
        args: [
          'issue',
          'edit',
          String(decision.issueNumber),
          '--title',
          decision.title,
          '--body',
          decision.body,
        ],
        details: `refreshing #${decision.issueNumber} from board task ${decision.taskId}`,
      },
    ];
  }
  return [];
}
