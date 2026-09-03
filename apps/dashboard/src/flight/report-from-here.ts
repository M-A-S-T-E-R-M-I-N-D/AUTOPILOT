// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Report-from-here ritual (BOARD web-mss50ia8-nthtf3, "PLATFORM 5/7"): any
 * dashboard region can be reported — the operator picks a region, types a
 * description, and one click turns that capture into a bug issue, a
 * quick-fix-PR task, a local board task, or a pool offer, ALWAYS as a
 * previewed plan first. This ships the pure decision core only —
 * {@link planReportFromHere} turns a {@link ReportRegionCapture} plus a
 * chosen {@link ReportAction} into either the exact `gh` argv to file an
 * issue/pool offer or the exact `CreateTaskInput` to put on the board,
 * never invoking either itself — the same pure-policy-before-wiring shape
 * `issue-triage.ts`'s `planIssueTriage`/`planIssueTriageCommands` and
 * `pr-review.ts`'s `planPrReview` established for the KEEPER rituals.
 * Also ships the apply layer that turns a plan into a real effect —
 * {@link executeReportCommands} (run a plan's `gh` argv through the
 * injectable `CliExec`), {@link applyReportTask} (create the board task a
 * local/quick-fix-pr plan carries), and {@link runReportFromHereRitual}
 * (compose planning + the right one of those two, end to end) — the same
 * plan-then-apply shape `issue-triage.ts`'s `executeIssueTriageCommands` /
 * `applyIssueTriageTasks` / `runIssueTriageRitual` established. Nothing here
 * is called yet; it is a building block for the CSRF-guarded HTTP
 * preview/execute pair a later slice wires in, the same way
 * `executeIssueTriageCommands` shipped a full slice ahead of
 * `issue-triage-execute.ts`. Deferred to later slices: the
 * screenshot/module-source capture wiring in the web shell, that HTTP pair,
 * and the operator panel — a capture reaches this planner as
 * caller-supplied data, so the core stays judgeable in isolation.
 */

import { createTask, type CreateTaskInput, type Store } from '@autopilot/store';
import type { CliExec } from '../connection/cli-probe.js';
import { classifyIssueDimension } from './issue-triage.js';

/** The four one-click destinations the board task names for a report. */
export const REPORT_ACTIONS = ['issue', 'quick-fix-pr', 'local-task', 'pool-offer'] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];

/** Boundary guard for the HTTP slice: an action arrives as a raw string. */
export function isReportAction(value: string): value is ReportAction {
  return (REPORT_ACTIONS as readonly string[]).includes(value);
}

/** What a region hands the planner when the operator reports from it. The
 *  UI slice populates `moduleSources` from the modules that render the
 *  region and `hasScreenshot` from whether a capture succeeded — the core
 *  never trusts either as more than data to compose into the report. */
export interface ReportRegionCapture {
  readonly regionId: string;
  readonly regionLabel: string;
  readonly description: string;
  readonly moduleSources: readonly string[];
  readonly hasScreenshot: boolean;
}

/** One planned `gh` call — exact argv for `execFile`, never a shell string,
 *  the same convention as `issue-triage.ts`'s `IssueTriageCommand`. */
export interface ReportCommand {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/** A report that files upstream: a plain bug issue or a pool offer. */
export interface ReportIssuePlan {
  readonly ok: true;
  readonly action: 'issue' | 'pool-offer';
  readonly title: string;
  readonly body: string;
  readonly commands: readonly ReportCommand[];
  readonly summary: string;
}

/** A report that stays local: a board task, plain or quick-fix-PR flavored. */
export interface ReportTaskPlan {
  readonly ok: true;
  readonly action: 'local-task' | 'quick-fix-pr';
  readonly taskInput: CreateTaskInput;
  readonly summary: string;
}

/** An invalid capture plans nothing — the reasoning says why. */
export interface ReportRejected {
  readonly ok: false;
  readonly reasoning: string;
}

export type ReportPlan = ReportIssuePlan | ReportTaskPlan | ReportRejected;

/** Task/issue titles are bounded the same defensive way
 *  `issue-triage.ts`'s `ISSUE_TASK_TITLE_CHARS` bounds its titles. */
const REPORT_TITLE_CHARS = 200;

/** GitHub's stock label for a filed bug — present on every repo by default,
 *  the same way the triage ritual leans on the stock `duplicate` label. */
const BUG_LABEL = 'bug';

/** Deterministic non-crypto hash so a report's task id is content-addressed:
 *  retrying the same capture can never mint a second task — `createTask`'s
 *  duplicate-PK path returns false and the retry is harmless, the same
 *  convention `issue-triage.ts`'s `issueTaskId` follows. */
function djb2(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

/** Content-addressed by region + action + description — see {@link djb2}. */
export function reportTaskId(capture: ReportRegionCapture, action: ReportAction): string {
  return `report-${capture.regionId}-${djb2(`${action}\n${capture.description}`)}`;
}

/** First line of the description, bounded — a title is a headline, not the
 *  whole report; the full description always travels in the body/task. */
function reportHeadline(capture: ReportRegionCapture): string {
  const firstLine = capture.description.trim().split('\n', 1)[0]!.trim();
  return firstLine.slice(0, REPORT_TITLE_CHARS);
}

/** The shared body every upstream report carries: the description, where it
 *  was reported from, which modules render that region, and an honest note
 *  about the screenshot — `gh issue create` cannot attach an image, so the
 *  body says the capture exists locally instead of pretending it uploaded. */
function reportBody(capture: ReportRegionCapture): string {
  const lines: string[] = [capture.description.trim(), ''];
  lines.push(
    `Reported from the dashboard's "${capture.regionLabel}" region (\`${capture.regionId}\`).`,
  );
  if (capture.moduleSources.length > 0) {
    lines.push('', 'Module sources rendering this region:');
    for (const source of capture.moduleSources) lines.push(`- \`${source}\``);
  } else {
    lines.push('', 'Module sources rendering this region: (none captured)');
  }
  if (capture.hasScreenshot) {
    lines.push(
      '',
      'A screenshot was captured with this report; `gh issue create` cannot ' +
        'attach images, so it stays in the local report bundle — attach it ' +
        'manually if the issue needs it.',
    );
  }
  return lines.join('\n');
}

function planUpstream(
  capture: ReportRegionCapture,
  action: 'issue' | 'pool-offer',
): ReportIssuePlan {
  const headline = reportHeadline(capture);
  const isPool = action === 'pool-offer';
  const title = isPool ? `[pool] ${headline}`.slice(0, REPORT_TITLE_CHARS) : headline;
  const label = isPool
    ? `pool: ${classifyIssueDimension(`${capture.regionLabel} ${capture.description}`)}`
    : BUG_LABEL;
  const body = isPool
    ? `${reportBody(capture)}\n\nOffered to the pool — any co-pilot may claim it and deliver a PR referencing this issue.`
    : reportBody(capture);
  return {
    ok: true,
    action,
    title,
    body,
    commands: [
      {
        command: 'gh',
        args: ['issue', 'create', '--title', title, '--body', body, '--label', label],
        details: isPool
          ? `offering "${title}" to the pool under the "${label}" label`
          : `filing "${title}" as a "${BUG_LABEL}" issue upstream`,
      },
    ],
    summary: isPool
      ? `gh issue create — pool offer "${title}" (label "${label}")`
      : `gh issue create — bug issue "${title}" (label "${BUG_LABEL}")`,
  };
}

function planLocal(
  capture: ReportRegionCapture,
  action: 'local-task' | 'quick-fix-pr',
  projectId: string,
  createdAt: number,
): ReportTaskPlan {
  const headline = reportHeadline(capture);
  const prefix = action === 'quick-fix-pr' ? 'QUICK-FIX (deliver as PR): ' : 'Report: ';
  const title = `${prefix}${headline} [from ${capture.regionLabel}]`.slice(0, REPORT_TITLE_CHARS);
  return {
    ok: true,
    action,
    taskInput: {
      id: reportTaskId(capture, action),
      projectId,
      title,
      dimension: classifyIssueDimension(`${capture.regionLabel} ${capture.description}`),
      // Operator-authored through the dashboard, so it is queued directly the
      // same way any 'dashboard' task is — no needs_approval detour.
      source: 'dashboard',
      status: 'queued',
      createdAt,
    },
    summary:
      action === 'quick-fix-pr'
        ? `board task "${title}" (queued; its flight delivers the fix as a PR)`
        : `board task "${title}" (queued)`,
  };
}

/**
 * The one decision the ritual makes: a valid capture plus a chosen action
 * becomes the exact plan to apply it — and NOTHING is applied here. A blank
 * description or region plans a rejection with reasoning instead of a
 * degenerate report; a local action with no project to attach to is equally
 * invalid. `projectId`/`createdAt` feed only the task-shaped actions —
 * upstream issue plans ignore them.
 */
export function planReportFromHere(
  capture: ReportRegionCapture,
  action: ReportAction,
  projectId: string,
  createdAt: number,
): ReportPlan {
  if (capture.regionId.trim() === '') {
    return {
      ok: false,
      reasoning: 'a report needs the region it was made from — regionId is blank.',
    };
  }
  if (capture.description.trim() === '') {
    return {
      ok: false,
      reasoning: `a report from "${capture.regionId}" needs a non-empty description — there is nothing to file, task, or offer yet.`,
    };
  }
  if (action === 'issue' || action === 'pool-offer') {
    return planUpstream(capture, action);
  }
  if (projectId.trim() === '') {
    return {
      ok: false,
      reasoning: `a "${action}" report becomes a board task, and a task needs a project — projectId is blank.`,
    };
  }
  return planLocal(capture, action, projectId, createdAt);
}

/** One {@link ReportCommand} run to completion — mirrors {@link
 *  IssueTriageCommandResult}'s `{code, stdout}` shape, paired back with the
 *  command it came from. */
export interface ReportCommandResult {
  readonly command: ReportCommand;
  readonly code: number;
  readonly stdout: string;
}

/**
 * Runs a {@link ReportIssuePlan}'s `gh` commands in order through the
 * injectable `exec` — the write-side counterpart to {@link planUpstream},
 * same `CliExec` shape and same "run every command, report every result"
 * stance `issue-triage.ts`'s `executeIssueTriageCommands` takes: a filed
 * issue that fails to attach its pool label is still worth knowing about,
 * so this never aborts partway through.
 */
export async function executeReportCommands(
  commands: readonly ReportCommand[],
  exec: CliExec,
): Promise<readonly ReportCommandResult[]> {
  const results: ReportCommandResult[] = [];
  for (const command of commands) {
    const { code, stdout } = await exec(command.command, command.args);
    results.push({ command, code, stdout });
  }
  return results;
}

/** Creates the board task a {@link ReportTaskPlan} carries — a thin wrapper
 *  over `@autopilot/store`'s `createTask`, same convention `issue-triage.ts`'s
 *  `applyIssueTriageTasks` follows. {@link reportTaskId}'s content-addressed
 *  id means a retried capture's second call is a harmless no-op: `createTask`
 *  returns `false` on the duplicate primary key instead of minting a second
 *  task. */
export function applyReportTask(store: Store, plan: ReportTaskPlan): boolean {
  return createTask(store, plan.taskInput);
}

/** One {@link runReportFromHereRitual} pass's full outcome — the plan that
 *  was judged, every `gh` command's result (empty for a task-shaped plan or
 *  a rejection), and whether a board task actually got created (`false` for
 *  an upstream plan or a rejection). */
export interface ReportFromHereResult {
  readonly plan: ReportPlan;
  readonly commandResults: readonly ReportCommandResult[];
  readonly taskCreated: boolean;
}

/**
 * The whole report-from-here ritual as one composed pass: {@link
 * planReportFromHere} judges the capture, then either {@link
 * executeReportCommands} (an `issue`/`pool-offer` plan) or {@link
 * applyReportTask} (a `local-task`/`quick-fix-pr` plan) applies it — a
 * rejected plan applies nothing. Mirrors `issue-triage.ts`'s
 * `runIssueTriageRitual` composition; this is the entrypoint a later slice's
 * confirm-guarded HTTP execute handler calls.
 */
export async function runReportFromHereRitual(
  exec: CliExec,
  store: Store,
  capture: ReportRegionCapture,
  action: ReportAction,
  projectId: string,
  createdAt: number,
): Promise<ReportFromHereResult> {
  const plan = planReportFromHere(capture, action, projectId, createdAt);
  if (!plan.ok) {
    return { plan, commandResults: [], taskCreated: false };
  }
  if (isReportTaskPlan(plan)) {
    const taskCreated = applyReportTask(store, plan);
    return { plan, commandResults: [], taskCreated };
  }
  const commandResults = await executeReportCommands(plan.commands, exec);
  return { plan, commandResults, taskCreated: false };
}

/** Narrows a resolved (non-rejected) plan to its task-shaped variant — an
 *  explicit type guard rather than an inline `action === ... || action ===
 *  ...` check, which this file's own union does not narrow through control
 *  flow analysis alone. */
function isReportTaskPlan(plan: ReportIssuePlan | ReportTaskPlan): plan is ReportTaskPlan {
  return plan.action === 'local-task' || plan.action === 'quick-fix-pr';
}
