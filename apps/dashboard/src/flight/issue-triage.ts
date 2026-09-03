// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * KEEPER triage ritual (BOARD web-mss50i9u-ldv513, "PLATFORM 3/7"): incoming
 * GitHub issues get analyzed, deduped against the open board and backlog,
 * labeled by pool, and answered with reasoning. This ships the pure decision
 * core — {@link planIssueTriage} — the pure command planner that turns a
 * decision into the exact `gh` argv to apply it — {@link
 * planIssueTriageCommands} — {@link planIssueTriageBatch}, which composes
 * both across a whole batch of issues against one shared set of dedup
 * candidates — the read wiring, {@link fetchOpenIssues}, and the write
 * wiring, {@link executeIssueTriageCommands}, both through the same
 * injectable `CliExec` `connection/cli-probe.ts` uses — {@link
 * planIssueTriageTask}, which turns an accepted decision into the
 * `source: 'github'` `CreateTaskInput` a caller hands to `@autopilot/store`'s
 * `createTask` (schema v12 widened the `tasks.source` CHECK to allow it) —
 * {@link applyIssueTriageTasks}, which composes that with `createTask` for a
 * whole batch, the same way `inbox-triage.ts`'s `triageInboxEntries` composes
 * its own plan-to-task step with the store — and {@link
 * runIssueTriageRitual}, which composes ALL of the above (fetch, plan, apply
 * gh, apply store) into the one end-to-end pass a caller actually runs.
 * Mirrors how `github-sync.ts`'s `planGithubSync` and `release.ts`'s
 * `planRelease` are pure policy steps ahead of their own I/O wiring.
 * Labeling/commenting is visible to others, so `runIssueTriageRitual` runs
 * for real only behind the same confirm-guarded HTTP endpoint + UI button
 * release automation's `release/execute.ts` and `release-panel.ts` use —
 * `applyIssueTriageTasks`'s own store write stays local (no `gh` I/O), so it
 * alone would carry none of that risk, but `runIssueTriageRitual` also
 * drives the gh label/comment side, so the whole ritual waits behind that
 * same confirm gate. That wiring has since shipped: `issue-triage-execute.ts`'s
 * `GET /api/issue-triage` (preview) / `POST /api/issue-triage/execute`
 * (the confirm-guarded real run) gather `runIssueTriageRitual`'s
 * `boardTasks`/`backlogTitles` inputs from the real store/repo, and
 * `web/issue-triage-panel.ts` + `web/shell.ts`'s `issueTriageSection` give it
 * the operator-facing button — nothing in this ritual is deferred any longer.
 */

import {
  DIMENSIONS,
  createTask,
  type Dimension,
  type CreateTaskInput,
  type Store,
} from '@autopilot/store';
import { titleMatchScore } from '../read/reconcile.js';
import type { CliExec } from '../connection/cli-probe.js';

/** The subset of a GitHub issue this policy needs — title/body/labels, never
 *  trusted as anything but data to score and classify. `labels` is optional
 *  so pure-planning callers need not fabricate it; {@link fetchOpenIssues}
 *  always populates it, and {@link planIssueTriage} reads it to keep re-runs
 *  idempotent (an already-labeled issue plans a `'skip'`). */
export interface IncomingIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[];
}

/** One existing title to dedup an incoming issue against — a board task's
 *  `id`/`title`, or a backlog markdown entry (`id` synthesized by the
 *  caller, e.g. its line number) since a backlog line has no task id yet. */
export interface ExistingTitle {
  readonly id: string;
  readonly title: string;
}

export interface IssueTriageDuplicate {
  readonly decision: 'duplicate';
  readonly matchedId: string;
  readonly matchedTitle: string;
  readonly score: number;
  readonly reasoning: string;
}

export interface IssueTriageAccept {
  readonly decision: 'accept';
  readonly dimension: Dimension;
  readonly reasoning: string;
}

/** An issue a previous KEEPER pass already handled — re-runs leave it
 *  untouched (no label, no comment, no task) so the ritual stays idempotent
 *  instead of re-answering the same issue on every pass. */
export interface IssueTriageSkip {
  readonly decision: 'skip';
  readonly reasoning: string;
}

export type IssueTriageDecision = IssueTriageDuplicate | IssueTriageAccept | IssueTriageSkip;

/** Below this token-overlap score (same convention as `reconcile.ts`'s
 *  `DEFAULT_MATCH_THRESHOLD`), an issue is treated as genuinely new rather
 *  than a duplicate of an existing title. */
const DUPLICATE_THRESHOLD = 0.5;

/** Every accepted issue gets exactly one `pool: <dimension>` label
 *  (`.github/labels.json`'s convention) — its presence on a later pass means
 *  the issue was already triaged. Exported so `pool-client.ts` (epic 0007
 *  slice 6) can recognize a pool-labeled issue without re-deriving the same
 *  prefix convention. */
export const POOL_LABEL_PREFIX = 'pool: ';

/** GitHub's stock `duplicate` label marks an issue a previous pass already
 *  answered as a duplicate, so later passes skip it instead of posting the
 *  same reasoning comment again. */
const DUPLICATE_LABEL = 'duplicate';

/** Keyword signals for each pool dimension (`.github/labels.json`'s "pool: *"
 *  labels map 1:1 onto `DIMENSIONS`) — deliberately simple substring matching,
 *  not a model call: this is a cheap, deterministic first pass an operator
 *  can read and override, not a final verdict. */
const DIMENSION_KEYWORDS: Record<Dimension, readonly string[]> = {
  accessibility: ['a11y', 'accessib', 'screen reader', 'aria', 'contrast', 'keyboard nav'],
  cybersecurity: [
    'security',
    'vulnerab',
    'exploit',
    'inject',
    'auth',
    'secret',
    'cve',
    'xss',
    'csrf',
  ],
  ux: ['ux', 'usability', 'confusing', 'workflow', 'hard to use', 'design'],
  human_interaction: ['operator', 'communicat', 'collaborat', 'notification', 'chat'],
  learnings: ['retro', 'postmortem', 'lesson', 'insight', 'soul-evolution'],
  information: ['doc', 'readme', 'typo', 'unclear', 'convention', 'discoverab'],
  data: ['schema', 'database', 'migration', 'store', 'persist'],
  priorities: ['priorit', 'ranking', 'triage order', 'backlog order'],
};

/**
 * Deterministic dimension classifier: the pool whose keywords appear most in
 * `text` (case-insensitive substring counts), ties broken by `DIMENSIONS`'
 * declared order. Falls back to `'information'` — the closest thing to a
 * neutral pool — when nothing matches, so every issue gets exactly one label
 * rather than none.
 */
export function classifyIssueDimension(text: string): Dimension {
  const lower = text.toLowerCase();
  let best: Dimension = 'information';
  let bestScore = 0;
  for (const dimension of DIMENSIONS) {
    const keywords = DIMENSION_KEYWORDS[dimension];
    const score = keywords.filter((keyword) => lower.includes(keyword)).length;
    if (score > bestScore) {
      bestScore = score;
      best = dimension;
    }
  }
  return best;
}

/**
 * Decides what a KEEPER triage pass should do with one incoming issue, given
 * the current open board and backlog titles. Scores `issue.title` against
 * every candidate with `reconcile.ts`'s `titleMatchScore` (same token-overlap
 * Jaccard measure the board/git reconciliation sweep already trusts) and
 * treats the strongest match clearing `threshold` as a duplicate — an issue
 * re-reporting work already tracked gets a "not opening a second task"
 * answer instead of a new one. A non-duplicate is classified into a pool
 * dimension via {@link classifyIssueDimension} over its title and body.
 * Before any scoring, an issue a previous pass already handled — one
 * carrying a `pool: *` or `duplicate` label, or whose own {@link
 * issueTaskId} task is already on the board (the labeling half may have
 * failed) — plans a `'skip'`: without that, an accepted issue's own board
 * task (same title) would score as a duplicate OF ITSELF on the next pass
 * and every re-run would post another bogus comment. Pure: never fetches,
 * labels, or comments — a caller wires those once this decision is made.
 */
export function planIssueTriage(
  issue: IncomingIssue,
  boardTasks: readonly ExistingTitle[],
  backlogTitles: readonly string[],
  threshold: number = DUPLICATE_THRESHOLD,
): IssueTriageDecision {
  const labels = issue.labels ?? [];
  const poolLabel = labels.find((label) => label.startsWith(POOL_LABEL_PREFIX));
  if (poolLabel) {
    return {
      decision: 'skip',
      reasoning:
        `#${issue.number} "${issue.title}" already carries "${poolLabel}" from a previous ` +
        'KEEPER pass — skipping so re-runs stay idempotent.',
    };
  }
  if (labels.includes(DUPLICATE_LABEL)) {
    return {
      decision: 'skip',
      reasoning:
        `#${issue.number} "${issue.title}" was already answered as a duplicate ` +
        `("${DUPLICATE_LABEL}" label) by a previous KEEPER pass — skipping.`,
    };
  }
  const ownTaskId = issueTaskId(issue.number);
  if (boardTasks.some((task) => task.id === ownTaskId)) {
    return {
      decision: 'skip',
      reasoning:
        `#${issue.number} "${issue.title}" was already accepted onto the board as task ` +
        `${ownTaskId} — skipping instead of scoring it as a duplicate of its own task.`,
    };
  }

  const candidates: readonly ExistingTitle[] = [
    ...boardTasks,
    ...backlogTitles.map((title, index) => ({ id: `backlog:${index}`, title })),
  ];

  let best: { id: string; title: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = titleMatchScore(issue.title, candidate.title);
    if (score < threshold) continue;
    if (!best || score > best.score) best = { id: candidate.id, title: candidate.title, score };
  }

  if (best) {
    return {
      decision: 'duplicate',
      matchedId: best.id,
      matchedTitle: best.title,
      score: best.score,
      reasoning:
        `#${issue.number} "${issue.title}" overlaps ${Math.round(best.score * 100)}% with ` +
        `existing "${best.title}" — treating as a duplicate rather than opening a second task ` +
        'for the same work.',
    };
  }

  const dimension = classifyIssueDimension(`${issue.title} ${issue.body}`);
  return {
    decision: 'accept',
    dimension,
    reasoning:
      `#${issue.number} "${issue.title}" doesn't match any open board task or backlog entry — ` +
      `accepting it and labeling "pool: ${dimension}".`,
  };
}

/** One planned `gh` call to apply a triage decision — the exact argv a
 *  caller should hand to `execFile`, never a shell string, same convention
 *  as `github-sync.ts`'s `GithubSyncPlan`. */
export interface IssueTriageCommand {
  readonly command: 'gh';
  readonly args: readonly string[];
  readonly details: string;
}

/**
 * Turns a {@link planIssueTriage} decision into the `gh` command(s) needed
 * to apply it: an accepted issue gets its pool label added
 * (`gh issue edit --add-label "pool: <dimension>"`) followed by a comment
 * posting the decision's reasoning; a duplicate gets GitHub's stock
 * `duplicate` label — so later passes {@link planIssueTriage} skip it — plus
 * the reasoning comment; a `'skip'` plans nothing at all, keeping re-runs
 * idempotent. Pure: plans argv, never invokes `gh` itself — a caller wires
 * the actual `execFile` calls once these plans are reviewed.
 */
export function planIssueTriageCommands(
  issue: IncomingIssue,
  decision: IssueTriageDecision,
): readonly IssueTriageCommand[] {
  if (decision.decision === 'skip') return [];

  const issueRef = String(issue.number);
  const comment: IssueTriageCommand = {
    command: 'gh',
    args: ['issue', 'comment', issueRef, '--body', decision.reasoning],
    details: `posting KEEPER's triage reasoning as a comment on #${issue.number}`,
  };

  if (decision.decision === 'duplicate') {
    return [
      {
        command: 'gh',
        args: ['issue', 'edit', issueRef, '--add-label', DUPLICATE_LABEL],
        details: `labeling #${issue.number} "${DUPLICATE_LABEL}" so later KEEPER passes skip it`,
      },
      comment,
    ];
  }

  const label = `pool: ${decision.dimension}`;
  return [
    {
      command: 'gh',
      args: ['issue', 'edit', issueRef, '--add-label', label],
      details: `labeling #${issue.number} "${label}" per its classified dimension`,
    },
    comment,
  ];
}

/** A task board needs a bounded title; an issue title is already short but
 *  capped defensively the same way `inbox-triage.ts`'s `inboxTaskTitle` is. */
const ISSUE_TASK_TITLE_CHARS = 200;

/** Content-addressed by issue number (not random) so re-triaging the same
 *  issue after a partial failure can never mint a second task — createTask's
 *  duplicate-PK path just returns false and the retry is harmless, the same
 *  convention `inbox-triage.ts`'s `inboxTaskId` uses. */
export function issueTaskId(issueNumber: number): string {
  return `github-${issueNumber}`;
}

/**
 * Turns a {@link planIssueTriage} decision accepted for `issue` into the
 * `CreateTaskInput` a caller hands to `@autopilot/store`'s `createTask` —
 * `source: 'github'`, already human-authored upstream so it goes straight to
 * 'queued' the same way `inbox-triage.ts`'s `'inbox'` tasks do, labeled with
 * the decision's classified {@link Dimension}. Returns `null` for a
 * `'duplicate'` or `'skip'` decision — neither is tracked as its own task,
 * matching {@link planIssueTriageCommands}'s choice to skip the pool label
 * for both. Pure: builds the input object only, never calls
 * `createTask` itself — see this file's header comment for why that wiring
 * is deferred.
 */
export function planIssueTriageTask(
  issue: IncomingIssue,
  decision: IssueTriageDecision,
  projectId: string,
  createdAt: number,
): CreateTaskInput | null {
  if (decision.decision !== 'accept') return null;
  return {
    id: issueTaskId(issue.number),
    projectId,
    title: issue.title.slice(0, ISSUE_TASK_TITLE_CHARS),
    dimension: decision.dimension,
    source: 'github',
    createdAt,
  };
}

/** One issue's full triage outcome — the decision {@link planIssueTriage}
 *  reached plus the `gh` commands {@link planIssueTriageCommands} derived
 *  from it, paired back with the issue they're about. */
export interface IssueTriagePlan {
  readonly issue: IncomingIssue;
  readonly decision: IssueTriageDecision;
  readonly commands: readonly IssueTriageCommand[];
}

/**
 * Runs {@link planIssueTriage} then {@link planIssueTriageCommands} for every
 * issue in `issues`, all against the same `boardTasks`/`backlogTitles`
 * candidate set — the connective tissue between a batch fetch (e.g. {@link
 * fetchOpenIssues}) and a batch execute (e.g. {@link
 * executeIssueTriageCommands} run per plan's `commands`). Pure: composes two
 * already-pure functions, no I/O of its own. Each issue is judged
 * independently — an earlier issue's `accept` never influences a later one's
 * dedup, matching how `planIssueTriage` already only looks at the fixed
 * `boardTasks`/`backlogTitles` it's given, not sibling issues in this batch.
 */
export function planIssueTriageBatch(
  issues: readonly IncomingIssue[],
  boardTasks: readonly ExistingTitle[],
  backlogTitles: readonly string[],
  threshold: number = DUPLICATE_THRESHOLD,
): readonly IssueTriagePlan[] {
  return issues.map((issue) => {
    const decision = planIssueTriage(issue, boardTasks, backlogTitles, threshold);
    const commands = planIssueTriageCommands(issue, decision);
    return { issue, decision, commands };
  });
}

/**
 * Composes {@link planIssueTriageTask} with `@autopilot/store`'s `createTask`
 * for every `'accept'`ed plan in `plans` — the follow-up slice this file's
 * header comment flagged as deferred. Mirrors `inbox-triage.ts`'s
 * `triageInboxEntries`: local, no `gh` I/O, safe to run unconditionally,
 * since it never touches anything visible to others (that's still
 * {@link executeIssueTriageCommands}'s job, behind its own confirm-guarded
 * caller). A `'duplicate'` plan is skipped — {@link planIssueTriageTask}
 * already returns `null` for one. `createTask`'s own duplicate-PK guard makes
 * re-running this over the same plans harmless, the same convention
 * `inboxTaskId`'s content-addressing relies on. Returns the count of tasks
 * actually created (a plan whose task id already exists on the board
 * contributes 0, not an error).
 */
export function applyIssueTriageTasks(
  store: Store,
  projectId: string,
  plans: readonly IssueTriagePlan[],
  now: () => number = Date.now,
): number {
  let created = 0;
  for (const plan of plans) {
    const input = planIssueTriageTask(plan.issue, plan.decision, projectId, now());
    if (input && createTask(store, input)) created += 1;
  }
  return created;
}

/** One issue entry as `gh issue list --json number,title,body` emits it —
 *  untrusted process output, parsed defensively rather than trusted as
 *  already shaped like {@link IncomingIssue}. */
interface RawGithubIssue {
  readonly number?: unknown;
  readonly title?: unknown;
  readonly body?: unknown;
  readonly labels?: unknown;
}

/** `gh`'s `labels` field is an array of `{ name, ... }` objects — reduced
 *  defensively to just the string names, dropping malformed entries.
 *  Exported so `pool-client.ts` can parse the same `gh issue list --json
 *  labels` shape without duplicating this defensive reduction. */
export function parseIssueLabels(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((label: unknown) =>
      typeof label === 'object' && label !== null ? (label as { name?: unknown }).name : undefined,
    )
    .filter((name): name is string => typeof name === 'string');
}

/**
 * Lists every open issue via `gh issue list --state open --json
 * number,title,body`, run through the injectable `exec` — the same
 * `CliExec` shape `connection/cli-probe.ts` uses, so this stays
 * deterministically testable without a real `gh` on PATH. Read-only: never
 * labels, comments, or closes anything, only lists. Returns `[]` on a
 * non-zero exit or unparseable/non-array stdout rather than throwing — a
 * triage sweep finding nothing to review is a valid outcome, and a flaky
 * `gh` call shouldn't crash the ritual. Entries missing a numeric `number`
 * or string `title` are dropped rather than passed through malformed.
 */
export async function fetchOpenIssues(exec: CliExec): Promise<IncomingIssue[]> {
  const { code, stdout } = await exec('gh', [
    'issue',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,body,labels',
  ]);
  if (code !== 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as RawGithubIssue[])
    .filter((raw) => typeof raw.number === 'number' && typeof raw.title === 'string')
    .map((raw) => ({
      number: raw.number as number,
      title: raw.title as string,
      body: typeof raw.body === 'string' ? raw.body : '',
      labels: parseIssueLabels(raw.labels),
    }));
}

/** One {@link IssueTriageCommand} run to completion — the same `{code,
 *  stdout}` shape `CliExec` returns, paired back with the command it came
 *  from so a caller can tell which planned step (the label edit vs. the
 *  reasoning comment) any given result belongs to. */
export interface IssueTriageCommandResult {
  readonly command: IssueTriageCommand;
  readonly code: number;
  readonly stdout: string;
}

/**
 * Runs a KEEPER triage plan's {@link IssueTriageCommand}s in order through
 * the injectable `exec` — the write-side counterpart to {@link
 * fetchOpenIssues}'s read wiring, same `CliExec` shape. Always runs every
 * command and reports every result, even after an earlier one fails: a
 * failed label edit doesn't make the trailing reasoning comment meaningless,
 * so this never aborts the plan partway through — the caller inspects each
 * result's `code` to judge overall success. Nothing in this codebase calls
 * this yet; it is a building block for the confirm-guarded execute path
 * described in this file's header comment, not an autonomous trigger.
 */
export async function executeIssueTriageCommands(
  commands: readonly IssueTriageCommand[],
  exec: CliExec,
): Promise<readonly IssueTriageCommandResult[]> {
  const results: IssueTriageCommandResult[] = [];
  for (const command of commands) {
    const { code, stdout } = await exec(command.command, command.args);
    results.push({ command, code, stdout });
  }
  return results;
}

/** One {@link runIssueTriageRitual} pass's full outcome — every issue's plan,
 *  every gh command's result, and how many board tasks actually got created. */
export interface IssueTriageRitualResult {
  readonly plans: readonly IssueTriagePlan[];
  readonly commandResults: readonly IssueTriageCommandResult[];
  readonly tasksCreated: number;
}

/**
 * The whole KEEPER triage ritual as one composed pass: {@link
 * fetchOpenIssues} the open issues, {@link planIssueTriageBatch} a decision +
 * gh commands for each against `boardTasks`/`backlogTitles`, run every plan's
 * commands through {@link executeIssueTriageCommands}, then {@link
 * applyIssueTriageTasks} to create board tasks for whatever got accepted.
 * This is the single entrypoint a confirm-guarded HTTP handler will call once
 * that wiring lands (see this file's header comment) — everything the ritual
 * needs to run end to end already composes here; injectable `exec`/`store`
 * keep it deterministically testable without a real `gh` or database. Runs
 * every plan's gh commands even when the batch is empty for others — no
 * early return short-circuits the loop, so a caller always gets a result
 * paired 1:1 with `plans`.
 */
export async function runIssueTriageRitual(
  exec: CliExec,
  store: Store,
  projectId: string,
  boardTasks: readonly ExistingTitle[],
  backlogTitles: readonly string[],
  threshold: number = DUPLICATE_THRESHOLD,
  now: () => number = Date.now,
): Promise<IssueTriageRitualResult> {
  const issues = await fetchOpenIssues(exec);
  const plans = planIssueTriageBatch(issues, boardTasks, backlogTitles, threshold);

  const commandResults: IssueTriageCommandResult[] = [];
  for (const plan of plans) {
    commandResults.push(...(await executeIssueTriageCommands(plan.commands, exec)));
  }

  const tasksCreated = applyIssueTriageTasks(store, projectId, plans, now);

  return { plans, commandResults, tasksCreated };
}
