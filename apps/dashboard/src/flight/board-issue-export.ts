// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Board→issues export ritual, slice 2/3 (board `ap-mu7ktjpc-1`, per confirmed
 * VERDICT `ap-mu6lf6ve-4`, `docs/debriefs/2026-09-19-verdict-ap-mu6lf6ve-4-
 * board-issues-export-split-confirmed.md`): the pure decision core deciding
 * which shareable board tasks map to which new-or-existing GitHub issue,
 * deduped against the repo's open issues the same word-Jaccard way
 * `issue-triage.ts`'s `planIssueTriage` and `social-pass.ts`'s
 * `planSocialProtocol` already dedup (via `reconcile.ts`'s `titleMatchScore`).
 * Same "pure planner first" shape every comparable ritual in this codebase
 * uses — {@link planBoardIssueExport} and {@link planBoardIssueExportCommands}
 * take no `gh`/store dependency at all, so this file needs no `CliExec` and
 * no `@autopilot/store` import.
 *
 * {@link ShareableBoardTask} is a locally-scoped subset type, not the real
 * store row — the same decoupling `mirror-pass.ts`'s `MirrorPassTaskCandidate`
 * already uses ahead of its own store-backed caller. Slice 1/3 (the
 * `shareable` flag's actual data-model column) is a separate, independently
 * landable slice per the VERDICT's own split; this planner's contract is
 * just "given a task already known to be shareable", so it does not need
 * that column to exist yet, and slice 3/3's HTTP+UI wiring is the piece that
 * will eventually read the real flag and call this planner per task.
 *
 * A task already linked to a previously-exported issue ({@link
 * ShareableBoardTask.exportedIssueNumber}) plans `'skip'` — re-syncing an
 * existing export's title/body against later task edits, or deciding whether
 * a closed export should reopen, is real scope of its own the VERDICT's
 * slice boundary does not ask this slice to cover, and guessing either way
 * risks overwriting or reopening something a maintainer closed on purpose.
 * Nothing here calls `gh`; a caller (slice 3/3) wires the actual `execFile`
 * calls once these plans are reviewed, the same deferred-execution stance
 * `issue-triage.ts`'s header comment describes for its own commands.
 */

import { titleMatchScore } from '../read/reconcile.js';

/** The subset of a board task this ritual needs — the same locally-scoped
 *  "just enough" shape `mirror-pass.ts`'s `MirrorPassTaskCandidate` uses
 *  ahead of the real store row. Assumed already filtered to shareable tasks
 *  by the caller (slice 1/3's flag lives on the real row this type does not
 *  carry); this planner's own contract starts one step later. */
export interface ShareableBoardTask {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  /** The GitHub issue number a previous export pass already opened for this
   *  task, when one exists — read from wherever slice 3/3 persists that
   *  link. Absent means this task has never been exported. */
  readonly exportedIssueNumber?: number;
}

/** One existing open GitHub issue to dedup a shareable task's title against
 *  — the same `{ id/number, title }` shape `issue-triage.ts`'s
 *  `ExistingTitle` and `social-pass.ts`'s submission inventories already
 *  use for this exact purpose. */
export interface OpenGithubIssue {
  readonly number: number;
  readonly title: string;
}

export interface BoardIssueExportCreate {
  readonly decision: 'create';
  readonly reasoning: string;
}

export interface BoardIssueExportUpdate {
  readonly decision: 'update';
  readonly issueNumber: number;
  readonly score: number;
  readonly reasoning: string;
}

/** A task already exported, or one whose title matches no open issue closely
 *  enough to act on either way — nothing to plan this pass. */
export interface BoardIssueExportSkip {
  readonly decision: 'skip';
  readonly reasoning: string;
}

export type BoardIssueExportDecision =
  BoardIssueExportCreate | BoardIssueExportUpdate | BoardIssueExportSkip;

/** Below this token-overlap score (same convention and value as
 *  `reconcile.ts`'s own `DEFAULT_MATCH_THRESHOLD` and `issue-triage.ts`'s
 *  `DUPLICATE_THRESHOLD`), an open issue is treated as unrelated to the task
 *  rather than a match worth linking instead of creating a new issue. */
const MATCH_THRESHOLD = 0.5;

/**
 * Decides what a board→issues export pass should do with one shareable task,
 * given the repo's currently open issues. A task already linked to a
 * previous export ({@link ShareableBoardTask.exportedIssueNumber} set) plans
 * `'skip'` — see this file's header comment for why re-syncing or reopening
 * is out of this slice's scope. Otherwise the task's title is scored against
 * every open issue's title with `reconcile.ts`'s `titleMatchScore` (the same
 * word-Jaccard measure `issue-triage.ts`/`social-pass.ts` already dedup
 * with); the strongest match clearing `threshold` plans `'update'` — link
 * this task to the existing issue rather than opening a duplicate — and no
 * match at all plans `'create'`, a brand new issue. Pure: never fetches or
 * calls `gh`, and ties are broken by `openIssues`' own order (first
 * strongest match wins), matching {@link planIssueTriage}'s "first best
 * match" convention.
 */
export function planBoardIssueExport(
  task: ShareableBoardTask,
  openIssues: readonly OpenGithubIssue[],
  threshold: number = MATCH_THRESHOLD,
): BoardIssueExportDecision {
  if (task.exportedIssueNumber !== undefined) {
    return {
      decision: 'skip',
      reasoning:
        `task "${task.title}" was already exported as issue #${task.exportedIssueNumber} — ` +
        'skipping so this pass never re-syncs or reopens an export a maintainer may have ' +
        'closed on purpose.',
    };
  }

  let best: { number: number; title: string; score: number } | null = null;
  for (const issue of openIssues) {
    const score = titleMatchScore(task.title, issue.title);
    if (score < threshold) continue;
    if (!best || score > best.score) best = { number: issue.number, title: issue.title, score };
  }

  if (best) {
    return {
      decision: 'update',
      issueNumber: best.number,
      score: best.score,
      reasoning:
        `task "${task.title}" overlaps ${Math.round(best.score * 100)}% with already-open issue ` +
        `#${best.number} "${best.title}" — linking to it instead of opening a duplicate.`,
    };
  }

  return {
    decision: 'create',
    reasoning: `task "${task.title}" matches no open issue — opening a new one.`,
  };
}

/** One planned `gh` call to apply a {@link planBoardIssueExport} decision —
 *  the exact argv a caller should hand to `execFile`, never a shell string,
 *  the same `{command: 'gh', args, details}` shape `issue-triage.ts`'s
 *  `IssueTriageCommand` and `social-pass.ts`'s `SocialCommand` already use. */
export interface BoardIssueExportCommand {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/**
 * Turns a {@link planBoardIssueExport} decision into the `gh` command needed
 * to apply it: `'create'` opens a new issue with the task's title/body;
 * `'update'` never edits the matched issue's own title/body — it is someone
 * else's issue this task merely overlaps with — instead it posts a comment
 * linking the board task to it, the same "never overwrite, only comment"
 * restraint `issue-triage.ts`'s duplicate handling already shows toward a
 * matched existing title. `'skip'` plans nothing at all. Pure: plans argv,
 * never invokes `gh` itself.
 */
export function planBoardIssueExportCommands(
  task: ShareableBoardTask,
  decision: BoardIssueExportDecision,
): readonly BoardIssueExportCommand[] {
  if (decision.decision === 'skip') return [];

  if (decision.decision === 'create') {
    return [
      {
        command: 'gh',
        args: ['issue', 'create', '--title', task.title, '--body', task.body ?? ''],
        details: `gh issue create — "${task.title}"`,
      },
    ];
  }

  return [
    {
      command: 'gh',
      args: [
        'issue',
        'comment',
        String(decision.issueNumber),
        '--body',
        `Tracked on the AUTOPILOT board as task \`${task.id}\` ("${task.title}").`,
      ],
      details: `gh issue comment — linking board task "${task.id}" to already-open issue #${decision.issueNumber}`,
    },
  ];
}

/** One shareable task's full export outcome — the decision {@link
 *  planBoardIssueExport} reached plus the `gh` commands {@link
 *  planBoardIssueExportCommands} derived from it, paired back with the task
 *  they're about — the same `{task, decision, commands}` shape
 *  `issue-triage.ts`'s `IssueTriagePlan` already uses. */
export interface BoardIssueExportPlan {
  readonly task: ShareableBoardTask;
  readonly decision: BoardIssueExportDecision;
  readonly commands: readonly BoardIssueExportCommand[];
}

/**
 * Runs {@link planBoardIssueExport} then {@link planBoardIssueExportCommands}
 * for every task in `tasks`, all against the same `openIssues` candidate set
 * — the connective tissue a future confirm-guarded HTTP endpoint (slice 3/3)
 * will call once it fetches the real shareable tasks and open issues. Pure:
 * composes two already-pure functions, no I/O of its own. Each task is
 * judged independently against the fixed `openIssues` it's given, not
 * against sibling tasks in this batch — matching `planIssueTriageBatch`'s own
 * independence guarantee.
 */
export function planBoardIssueExportBatch(
  tasks: readonly ShareableBoardTask[],
  openIssues: readonly OpenGithubIssue[],
  threshold: number = MATCH_THRESHOLD,
): readonly BoardIssueExportPlan[] {
  return tasks.map((task) => {
    const decision = planBoardIssueExport(task, openIssues, threshold);
    const commands = planBoardIssueExportCommands(task, decision);
    return { task, decision, commands };
  });
}
