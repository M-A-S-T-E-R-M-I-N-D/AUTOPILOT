// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MIRROR PASS reconcile ritual's HTTP-layer wiring (EPIC 0019 S3, board
 * `web-mtrh1hlh-62l41b` — VERDICT `ap-mtsg3nc0-3` slice (a): "the smallest
 * slice that turns 'pure planner' into 'something a firing can actually run
 * and see output from'"). `mirror-pass.ts` holds four independent
 * pure-planner derivations but composed none of them into a runnable pass;
 * this file composes derivations 1/4 and 2/4 — {@link planMirrorPassBatch}'s
 * reconcile ("board task done ⇒ close linked issue with the landing SHA")
 * and {@link planMirrorPassLandingNoteBatch}'s landing-note dedup ("landed
 * commits get landed-in comments" for a task whose issue was already closed
 * some other way) and derivation 3/4 — {@link readMirrorPassVersionDrift}/
 * {@link readMirrorPassCountsDrift}/{@link readMirrorPassLinkDrift}'s
 * "README/docs public claims ↔ tree reality" trio — each named directly by
 * `docs/epics/0019-github-steward.md`. Also composes derivation 4/4 —
 * {@link planMirrorPassStaleClaimBatch}'s stale-claim reaper ("assignee
 * quiet 14d on a claimed pool issue → free it up"), the last of the four
 * pure planners this file wires into a runnable preview.
 *
 * Same shape as `issue-triage-execute.ts`'s `createIssueTriagePreviewApi`:
 * gather real inputs for a project (its `github-<n>` board tasks, each
 * paired with the most recent landing SHA `@autopilot/store`'s `metrics`
 * table recorded for it) and run them through the injectable `CliExec`
 * `connection/cli-probe.ts` uses. The four preview APIs above are read-only
 * — never call `gh` to change anything, never write to the store.
 *
 * {@link createMirrorPassExecuteApi} is VERDICT slice (b)'s first
 * installment — the mutating counterpart to {@link createMirrorPassPreviewApi},
 * scoped to derivation 1/4 only (the other three derivations' mutating
 * paths remain their own follow-up slices, same per-derivation split slice
 * (a) already used above). Same "resolve identity, refuse to write for a
 * non-maintainer" role gate `taxonomy-seed.ts`'s `runTaxonomySeed` uses for
 * epic law 1 ("role honesty first"). {@link createMirrorPassLandingNoteExecuteApi}
 * is slice (b)'s second installment — derivation 2/4's mutating counterpart
 * to {@link createMirrorPassLandingNotePreviewApi}, same role gate, same
 * per-derivation split. {@link createMirrorPassStaleClaimExecuteApi} is slice
 * (b)'s third installment — derivation 4/4's mutating counterpart to
 * {@link createMirrorPassStaleClaimPreviewApi}, same role gate.
 * {@link createMirrorPassDriftExecuteApi} is slice (b)'s fourth and final
 * installment — derivation 3/4's own execute path, which files a NEW issue
 * (via `social-pass.ts`'s shared duplicate-detection protocol) rather than
 * mutating an existing one. All four wired execute APIs above are reachable
 * over HTTP — `server.ts`'s `POST /api/mirror-pass/execute`,
 * `/mirror-pass/landing-note/execute`, `/mirror-pass/drift/execute`, and
 * `/mirror-pass/stale-claims/execute` — but the dashboard panel that would
 * call the last one is not wired here; that remains its own follow-up
 * slice (`web/features/mirror-pass.ts` now wires the reconcile, drift, and
 * landing-note execute buttons; the stale-claim execute button does not
 * exist yet).
 */

import { join } from 'node:path';
import { openStore, listProjects, setTaskStatus, setTaskFocus, type Store } from '@autopilot/store';
import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { fetchPoolIssues, isClaimedPoolIssue } from './pool-client.js';
import { isHumanClosedTask } from './claim-contract.js';
import {
  resolveSocialIdentity,
  fetchOwnSubmissions,
  fetchOpenThreads,
  planSocialProtocol,
  type SocialIdentity,
  type SocialCandidateAction,
  type SocialProtocolCaps,
} from './social-pass.js';
import {
  planMirrorPassBatch,
  fetchMirrorPassIssueStates,
  planMirrorPassLandingNoteBatch,
  fetchMirrorPassIssueComments,
  readMirrorPassVersionDrift,
  readMirrorPassCountsDrift,
  readMirrorPassLinkDrift,
  planMirrorPassVersionDriftCommand,
  planMirrorPassCountsDriftCommand,
  planMirrorPassLinkDriftCommand,
  fetchClaimedIssueActivity,
  planMirrorPassStaleClaimBatch,
  applyMirrorPassCommands,
  type MirrorPassTaskCandidate,
  type MirrorPassPlan,
  type MirrorPassLandingNotePlan,
  type MirrorPassVersionDriftFinding,
  type MirrorPassCountsDriftFinding,
  type MirrorPassBrokenLinkFinding,
  type MirrorPassClaimedIssue,
  type MirrorPassStaleClaimPlan,
  type MirrorPassCommand,
  type MirrorPassCommandOutcome,
} from './mirror-pass.js';

/** One `github-<n>` task row as the `tasks` table stores it — just enough
 *  to build a {@link MirrorPassTaskCandidate}; validated defensively same as
 *  every other raw-SQL row cast in this codebase. */
interface RawGithubTaskRow {
  readonly id: string;
  readonly status: string;
  readonly body: string | null;
}

const TASK_STATUSES = new Set<MirrorPassTaskCandidate['status']>([
  'queued',
  'in_progress',
  'done',
  'needs_approval',
  'deferred',
]);

/** Read-only: every `github-<n>` task on `projectId`'s board, each paired
 *  with the most recent shipped landing SHA `metrics.item` recorded for it
 *  (see `mirror-pass.ts`'s {@link MirrorPassTaskCandidate} docstring) — the
 *  candidate pool {@link planMirrorPassBatch} reconciles against real issue
 *  state. A task whose status isn't one of {@link TASK_STATUSES} (schema
 *  drift, never expected on a migrated store) is dropped rather than passed
 *  through with a guessed status.
 */
function mirrorPassTaskCandidates(
  store: Store,
  projectId: string,
): readonly MirrorPassTaskCandidate[] {
  const rows = store.db
    .prepare("SELECT id, status, body FROM tasks WHERE project_id = ? AND id LIKE 'github-%'")
    .all(projectId) as RawGithubTaskRow[];
  const landedShaStmt = store.db.prepare(
    `SELECT sha FROM metrics
      WHERE project_id = ? AND item = ? AND shipped = 1 AND sha IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
  );
  return rows
    .filter((row): row is RawGithubTaskRow & { status: MirrorPassTaskCandidate['status'] } =>
      TASK_STATUSES.has(row.status as MirrorPassTaskCandidate['status']),
    )
    .map((row) => ({
      id: row.id,
      status: row.status,
      landedSha: (landedShaStmt.get(projectId, row.id) as { sha: string } | undefined)?.sha ?? null,
      humanCloses: isHumanClosedTask(row),
    }));
}

/** THE CLAIM CONTRACT's settlement (claim-contract.ts): the claimant closed
 *  the issue, so the board task that was delivering slices against it is
 *  done and no longer the focus. A separate read-write connection — the
 *  execute path's own store is opened read-only, like every other mirror
 *  ritual's, and stays that way. */
function settleClaimedTasks(dbPath: string, taskIds: readonly string[], now: number): void {
  if (taskIds.length === 0) return;
  const store = openStore(dbPath);
  try {
    for (const id of taskIds) {
      setTaskStatus(store, id, 'done', now);
      setTaskFocus(store, id, false, now);
    }
  } finally {
    store.close();
  }
}

/** `null` means the project id is unknown — same convention as
 *  `issue-triage-execute.ts`'s `IssueTriagePreviewApi`. */
export type MirrorPassPreviewApi = (projectId: string) => Promise<readonly MirrorPassPlan[] | null>;

/**
 * Build the MIRROR PASS reconcile preview API against the real store + real
 * `gh` — the production wiring a caller (`main.ts`) injects into the
 * server. Read-only: fetches every `github-<n>` task's real issue state and
 * plans a reconcile finding for each, never posts a comment or changes an
 * issue's open/closed state.
 */
export function createMirrorPassPreviewApi(
  dbPath: string,
  exec: CliExec = ghExec,
): MirrorPassPreviewApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const tasks = mirrorPassTaskCandidates(store, projectId);
      const issuesByNumber = await fetchMirrorPassIssueStates(exec, tasks);
      return planMirrorPassBatch(tasks, issuesByNumber);
    } finally {
      store.close();
    }
  };
}

/** One reconciled task's real outcome after {@link createMirrorPassExecuteApi}
 *  ran it — the {@link MirrorPassPlan} {@link planMirrorPassBatch} reached,
 *  paired with what `gh` actually reported for each of its commands (empty
 *  when the plan carried no finding — nothing was sent). */
export interface MirrorPassExecuteOutcome {
  readonly plan: MirrorPassPlan;
  readonly commandOutcomes: readonly MirrorPassCommandOutcome[];
}

/** Why {@link createMirrorPassExecuteApi} sent zero `gh` mutations this
 *  call — epic 0019 law 1, role honesty: `'identity-unresolved'` when `gh`
 *  itself could not resolve who is acting, `'guest'` when it resolved to
 *  someone other than this repo's own maintainer. Same two reasons, same
 *  names, as `taxonomy-seed.ts`'s `TaxonomySeedSkipReason`. */
export type MirrorPassExecuteSkipReason = 'identity-unresolved' | 'guest';

/** The reconcile EXECUTE ritual's full report: the identity it resolved
 *  (`undefined` when resolution itself failed), every task whose plan
 *  carried a finding paired with its real command outcomes, or a
 *  `skippedReason` (with `outcomes` always `[]`) when role honesty forbade
 *  sending a single mutation. */
export interface MirrorPassExecuteReport {
  readonly identity: SocialIdentity | undefined;
  readonly outcomes: readonly MirrorPassExecuteOutcome[];
  readonly skippedReason?: MirrorPassExecuteSkipReason;
}

/** `null` means the project id is unknown — same convention as
 *  {@link MirrorPassPreviewApi}. */
export type MirrorPassExecuteApi = (projectId: string) => Promise<MirrorPassExecuteReport | null>;

/**
 * Build the MIRROR PASS reconcile EXECUTE api against the real store + real
 * `gh` — derivation 1/4's mutating counterpart to
 * {@link createMirrorPassPreviewApi} (EPIC 0019 S3, board
 * `web-mtrh1hlh-62l41b`, VERDICT `ap-mtsg3nc0-3` slice (b), scoped to
 * derivation 1/4 only — the other three derivations' execute paths remain
 * their own follow-up slices, same per-derivation split slice (a) already
 * used for the preview APIs above). Role-gated the same way
 * `taxonomy-seed.ts`'s `runTaxonomySeed` gates its own writes: resolves the
 * acting identity first (epic law 1, "role honesty first") and returns a
 * zero-mutation report the moment that identity is unresolved or not this
 * repo's own maintainer — a guest identity never reaches a single `gh issue
 * close`/`reopen`/`comment` call. Only a task {@link planMirrorPassBatch}
 * actually finds a finding for gets its commands sent; an already-in-sync
 * task costs nothing beyond the read already spent planning it.
 */
export function createMirrorPassExecuteApi(
  dbPath: string,
  exec: CliExec = ghExec,
): MirrorPassExecuteApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const identity = await resolveSocialIdentity(exec);
      if (identity === undefined || identity.role !== 'maintainer') {
        return {
          identity,
          outcomes: [],
          skippedReason: identity === undefined ? 'identity-unresolved' : 'guest',
        };
      }
      const tasks = mirrorPassTaskCandidates(store, projectId);
      const issuesByNumber = await fetchMirrorPassIssueStates(exec, tasks);
      const plans = planMirrorPassBatch(tasks, issuesByNumber);
      const outcomes: MirrorPassExecuteOutcome[] = [];
      for (const plan of plans) {
        if (plan.commands.length === 0) continue;
        outcomes.push({
          plan,
          commandOutcomes: await applyMirrorPassCommands(exec, plan.commands),
        });
      }
      settleClaimedTasks(
        dbPath,
        outcomes
          .filter((o) => o.plan.finding?.action === 'settle-claimed')
          .map((o) => o.plan.task.id),
        Date.now(),
      );
      return { identity, outcomes };
    } finally {
      store.close();
    }
  };
}

/** `null` means the project id is unknown — same convention as
 *  {@link MirrorPassPreviewApi}. */
export type MirrorPassLandingNotePreviewApi = (
  projectId: string,
) => Promise<readonly MirrorPassLandingNotePlan[] | null>;

/**
 * Build the MIRROR PASS landing-note preview API (derivation 2/4) against
 * the real store + real `gh` — same production wiring as
 * {@link createMirrorPassPreviewApi}, composing
 * {@link planMirrorPassLandingNoteBatch} instead of {@link
 * planMirrorPassBatch}. Read-only: fetches every task's issue state, then —
 * only for the issues that actually need the check — their existing
 * comments, and never posts one itself.
 */
export function createMirrorPassLandingNotePreviewApi(
  dbPath: string,
  exec: CliExec = ghExec,
): MirrorPassLandingNotePreviewApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const tasks = mirrorPassTaskCandidates(store, projectId);
      const issuesByNumber = await fetchMirrorPassIssueStates(exec, tasks);
      const commentsByIssueNumber = await fetchMirrorPassIssueComments(exec, tasks, issuesByNumber);
      return planMirrorPassLandingNoteBatch(tasks, issuesByNumber, commentsByIssueNumber);
    } finally {
      store.close();
    }
  };
}

/** One landing-note task's real outcome after
 *  {@link createMirrorPassLandingNoteExecuteApi} ran it — the {@link
 *  MirrorPassLandingNotePlan} {@link planMirrorPassLandingNoteBatch} reached,
 *  paired with what `gh` actually reported for its single comment command. */
export interface MirrorPassLandingNoteExecuteOutcome {
  readonly plan: MirrorPassLandingNotePlan;
  readonly commandOutcome: MirrorPassCommandOutcome;
}

/** The landing-note EXECUTE ritual's full report — same shape as {@link
 *  MirrorPassExecuteReport}, one derivation over. */
export interface MirrorPassLandingNoteExecuteReport {
  readonly identity: SocialIdentity | undefined;
  readonly outcomes: readonly MirrorPassLandingNoteExecuteOutcome[];
  readonly skippedReason?: MirrorPassExecuteSkipReason;
}

/** `null` means the project id is unknown — same convention as
 *  {@link MirrorPassPreviewApi}. */
export type MirrorPassLandingNoteExecuteApi = (
  projectId: string,
) => Promise<MirrorPassLandingNoteExecuteReport | null>;

/**
 * Build the MIRROR PASS landing-note EXECUTE api against the real store +
 * real `gh` — derivation 2/4's mutating counterpart to
 * {@link createMirrorPassLandingNotePreviewApi} (EPIC 0019 S3, board
 * `web-mtrh1hlh-62l41b`, VERDICT `ap-mtsg3nc0-3` slice (b), second
 * installment — the other two derivations' execute paths remain their own
 * follow-up slices). Same role gate as {@link createMirrorPassExecuteApi}:
 * resolves the acting identity first and returns a zero-mutation report the
 * moment it is unresolved or not this repo's own maintainer — a guest
 * identity never reaches a single `gh issue comment` call. Only a task
 * {@link planMirrorPassLandingNoteBatch} actually finds a finding for (its
 * issue already closed, landed, and not yet noted) gets its comment sent.
 */
export function createMirrorPassLandingNoteExecuteApi(
  dbPath: string,
  exec: CliExec = ghExec,
): MirrorPassLandingNoteExecuteApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const identity = await resolveSocialIdentity(exec);
      if (identity === undefined || identity.role !== 'maintainer') {
        return {
          identity,
          outcomes: [],
          skippedReason: identity === undefined ? 'identity-unresolved' : 'guest',
        };
      }
      const tasks = mirrorPassTaskCandidates(store, projectId);
      const issuesByNumber = await fetchMirrorPassIssueStates(exec, tasks);
      const commentsByIssueNumber = await fetchMirrorPassIssueComments(exec, tasks, issuesByNumber);
      const plans = planMirrorPassLandingNoteBatch(tasks, issuesByNumber, commentsByIssueNumber);
      const outcomes: MirrorPassLandingNoteExecuteOutcome[] = [];
      for (const plan of plans) {
        if (!plan.command) continue;
        const [commandOutcome] = await applyMirrorPassCommands(exec, [plan.command]);
        if (commandOutcome) outcomes.push({ plan, commandOutcome });
      }
      return { identity, outcomes };
    } finally {
      store.close();
    }
  };
}

/** Derivation 3/4's combined outcome — each of the three "doc claims ↔ tree
 *  reality" checks the epic doc names together, `null` on whichever one(s)
 *  found nothing to flag (a project missing the doc it checks degrades the
 *  same way, per {@link readMirrorPassVersionDrift}'s own null convention —
 *  never a reason to fail the whole preview). */
export interface MirrorPassDriftPlan {
  readonly versionDrift: MirrorPassVersionDriftFinding | null;
  readonly countsDrift: MirrorPassCountsDriftFinding | null;
  readonly linkDrift: MirrorPassBrokenLinkFinding | null;
}

/** `null` means the project id is unknown — same convention as
 *  {@link MirrorPassPreviewApi}. */
export type MirrorPassDriftPreviewApi = (projectId: string) => Promise<MirrorPassDriftPlan | null>;

/**
 * Build the MIRROR PASS drift preview API (derivation 3/4) for a project's
 * own tree — unlike {@link createMirrorPassPreviewApi} and
 * {@link createMirrorPassLandingNotePreviewApi}, this checks the project's
 * `README.md` against its `package.json` version, its
 * `docs/THIRD-PARTY-LICENSES.md` package-count table, and its own internal
 * links; no `gh` call at all, since nothing here depends on issue state. The
 * store lookup exists only to resolve `projectId` to the project's
 * `root_path` the same way every other preview API resolves it — read-only,
 * closed before returning.
 */
export function createMirrorPassDriftPreviewApi(dbPath: string): MirrorPassDriftPreviewApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const root = project.root_path;
      const readmePath = join(root, 'README.md');
      return {
        versionDrift: readMirrorPassVersionDrift(readmePath, join(root, 'package.json')),
        countsDrift: readMirrorPassCountsDrift(
          readmePath,
          join(root, 'docs', 'THIRD-PARTY-LICENSES.md'),
        ),
        linkDrift: readMirrorPassLinkDrift(readmePath, root),
      };
    } finally {
      store.close();
    }
  };
}

/** One drift finding {@link createMirrorPassDriftExecuteApi} actually filed a
 *  new issue for — the finding itself paired with what `gh` reported for the
 *  `gh issue create` command it sent. */
export interface MirrorPassDriftExecuteOutcome {
  readonly finding:
    MirrorPassVersionDriftFinding | MirrorPassCountsDriftFinding | MirrorPassBrokenLinkFinding;
  readonly commandOutcome: MirrorPassCommandOutcome;
}

/** The drift EXECUTE ritual's full report — same `identity`/`skippedReason`
 *  shape as {@link MirrorPassExecuteReport}, plus `duplicates`: the titles
 *  {@link planSocialProtocol}'s "search before you speak" check (epic 0016
 *  law 1) refused to re-file because an issue with a near-identical title —
 *  this identity's own, or anyone else's still open — already exists. A
 *  duplicate is reported, never silently dropped: the pass found real drift,
 *  it just isn't news. */
export interface MirrorPassDriftExecuteReport {
  readonly identity: SocialIdentity | undefined;
  readonly outcomes: readonly MirrorPassDriftExecuteOutcome[];
  readonly duplicates: readonly string[];
  readonly skippedReason?: MirrorPassExecuteSkipReason;
}

/** `null` means the project id is unknown — same convention as
 *  {@link MirrorPassPreviewApi}. */
export type MirrorPassDriftExecuteApi = (
  projectId: string,
) => Promise<MirrorPassDriftExecuteReport | null>;

/** Derivation 3/4's own natural ceiling: the drift preview can never surface
 *  more than one finding per check (version, counts, links), so a cap of 3
 *  new issues never actually binds — it exists only so the shared protocol
 *  engine has a real number to enforce rather than an unlimited escape
 *  hatch. Zero comments: this derivation only ever files, never comments. */
const MIRROR_PASS_DRIFT_CAPS: SocialProtocolCaps = { maxNewIssues: 3, maxComments: 0 };

/** Reads the `--title` argument out of a planned {@link MirrorPassCommand} —
 *  every drift command is a `gh issue create --title <t> --body <b>` call,
 *  so this recovers the exact title `gh` would receive without re-deriving
 *  it from the finding a second time, which could drift from the real
 *  command if the two ever diverged. */
function commandTitle(command: MirrorPassCommand): string | undefined {
  const i = command.args.indexOf('--title');
  return i >= 0 ? command.args[i + 1] : undefined;
}

/**
 * Build the MIRROR PASS drift EXECUTE api against the real store + real
 * `gh` — derivation 3/4's mutating counterpart to
 * {@link createMirrorPassDriftPreviewApi} (EPIC 0019 S3, board
 * `web-mtrh1hlh-62l41b`, VERDICT `ap-mtsg3nc0-3` slice (b), fourth and final
 * installment — the other three derivations' execute paths (1/4, 2/4, 4/4)
 * already shipped above). Same role gate as every other EXECUTE api in this
 * file: resolves the acting identity first (epic law 1, "role honesty
 * first") and returns a zero-mutation report the moment it is unresolved or
 * not this repo's own maintainer.
 *
 * Unlike the other three derivations, this one FILES A NEW issue rather than
 * mutating an existing one — {@link planMirrorPassVersionDriftCommand}/
 * {@link planMirrorPassCountsDriftCommand}/{@link planMirrorPassLinkDriftCommand}
 * each say plainly that de-duplicating against an already-open issue is a
 * caller's job, not theirs (epic 0016 law 1, "search before you speak"; law
 * 2, "know what is already ours"). This is that caller: every non-null
 * finding becomes a `'new-issue'` {@link SocialCandidateAction}, and
 * `social-pass.ts`'s {@link planSocialProtocol} — the engine epic 0016 built
 * for exactly this — decides which are real news (`allowed`) versus a
 * near-identical title this identity already opened or that is still open
 * from anyone else (`duplicate`) before a single `gh issue create` runs.
 */
export function createMirrorPassDriftExecuteApi(
  dbPath: string,
  exec: CliExec = ghExec,
): MirrorPassDriftExecuteApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const identity = await resolveSocialIdentity(exec);
      if (identity === undefined || identity.role !== 'maintainer') {
        return {
          identity,
          outcomes: [],
          duplicates: [],
          skippedReason: identity === undefined ? 'identity-unresolved' : 'guest',
        };
      }
      const root = project.root_path;
      const readmePath = join(root, 'README.md');
      const findings: Array<{
        finding:
          | MirrorPassVersionDriftFinding
          | MirrorPassCountsDriftFinding
          | MirrorPassBrokenLinkFinding;
        command: MirrorPassCommand;
      }> = [];
      const versionDrift = readMirrorPassVersionDrift(readmePath, join(root, 'package.json'));
      if (versionDrift) {
        findings.push({
          finding: versionDrift,
          command: planMirrorPassVersionDriftCommand(versionDrift),
        });
      }
      const countsDrift = readMirrorPassCountsDrift(
        readmePath,
        join(root, 'docs', 'THIRD-PARTY-LICENSES.md'),
      );
      if (countsDrift) {
        findings.push({
          finding: countsDrift,
          command: planMirrorPassCountsDriftCommand(countsDrift),
        });
      }
      const linkDrift = readMirrorPassLinkDrift(readmePath, root);
      if (linkDrift) {
        findings.push({ finding: linkDrift, command: planMirrorPassLinkDriftCommand(linkDrift) });
      }
      if (findings.length === 0) return { identity, outcomes: [], duplicates: [] };

      const candidatesByAction = new Map<SocialCandidateAction, (typeof findings)[number]>();
      for (const entry of findings) {
        const title = commandTitle(entry.command);
        candidatesByAction.set(
          {
            kind: 'new-issue',
            reasoning: entry.command.details,
            ...(title !== undefined ? { title } : {}),
            requiresMaintainer: true,
          },
          entry,
        );
      }
      const candidates = [...candidatesByAction.keys()];
      const [ownSubmissions, openThreads] = await Promise.all([
        fetchOwnSubmissions(exec, identity.login),
        fetchOpenThreads(exec),
      ]);
      const verdict = planSocialProtocol(
        candidates,
        MIRROR_PASS_DRIFT_CAPS,
        ownSubmissions,
        identity.role,
        openThreads,
      );

      const outcomes: MirrorPassDriftExecuteOutcome[] = [];
      for (const candidate of verdict.allowed) {
        const entry = candidatesByAction.get(candidate);
        if (!entry) continue;
        const [commandOutcome] = await applyMirrorPassCommands(exec, [entry.command]);
        if (commandOutcome) outcomes.push({ finding: entry.finding, commandOutcome });
      }
      const duplicates = verdict.duplicate
        .map((candidate) => candidate.title)
        .filter((title): title is string => title !== undefined);
      return { identity, outcomes, duplicates };
    } finally {
      store.close();
    }
  };
}

/** `null` means the project id is unknown — same convention as
 *  {@link MirrorPassPreviewApi}. */
export type MirrorPassStaleClaimPreviewApi = (
  projectId: string,
) => Promise<readonly MirrorPassStaleClaimPlan[] | null>;

/**
 * Build the MIRROR PASS stale-claim preview API (derivation 4/4) against the
 * real store + real `gh` — same production wiring as
 * {@link createMirrorPassPreviewApi}, composing {@link
 * planMirrorPassStaleClaimBatch} instead of {@link planMirrorPassBatch}. The
 * candidate pool is repo-wide (same "canonical repo, not project-scoped"
 * shape `pool-client.ts`'s `fetchPoolIssues` already uses for browse/claim),
 * not the project's own `github-<n>` board tasks — a claim is "in the pool"
 * the moment KEEPER triage labels it, independent of whether any project's
 * board ever mirrored it — so the store lookup here exists only to validate
 * `projectId`, the same "unknown project ⇒ null" convention every other
 * preview API in this file uses, never to scope the `gh` reads. Read-only:
 * fetches every currently-claimed pool issue's live activity and plans a
 * reap finding for each, never unassigns or comments.
 */
export function createMirrorPassStaleClaimPreviewApi(
  dbPath: string,
  exec: CliExec = ghExec,
  now: () => number = Date.now,
): MirrorPassStaleClaimPreviewApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const claimedPoolIssues = (await fetchPoolIssues(exec)).filter(isClaimedPoolIssue);
      const activity: MirrorPassClaimedIssue[] = [];
      for (const issue of claimedPoolIssues) {
        const entry = await fetchClaimedIssueActivity(exec, issue.number);
        if (entry) activity.push(entry);
      }
      return planMirrorPassStaleClaimBatch(activity, now());
    } finally {
      store.close();
    }
  };
}

/** One reaped issue's real outcome after
 *  {@link createMirrorPassStaleClaimExecuteApi} ran it — the {@link
 *  MirrorPassStaleClaimPlan} {@link planMirrorPassStaleClaimBatch} reached,
 *  paired with what `gh` actually reported for each of its commands. */
export interface MirrorPassStaleClaimExecuteOutcome {
  readonly plan: MirrorPassStaleClaimPlan;
  readonly commandOutcomes: readonly MirrorPassCommandOutcome[];
}

/** The stale-claim EXECUTE ritual's full report — same shape as {@link
 *  MirrorPassExecuteReport}, one derivation over. */
export interface MirrorPassStaleClaimExecuteReport {
  readonly identity: SocialIdentity | undefined;
  readonly outcomes: readonly MirrorPassStaleClaimExecuteOutcome[];
  readonly skippedReason?: MirrorPassExecuteSkipReason;
}

/** `null` means the project id is unknown — same convention as
 *  {@link MirrorPassPreviewApi}. */
export type MirrorPassStaleClaimExecuteApi = (
  projectId: string,
) => Promise<MirrorPassStaleClaimExecuteReport | null>;

/**
 * Build the MIRROR PASS stale-claim EXECUTE api against the real store +
 * real `gh` — derivation 4/4's mutating counterpart to
 * {@link createMirrorPassStaleClaimPreviewApi} (EPIC 0019 S3, board
 * `web-mtrh1hlh-62l41b`, VERDICT `ap-mtsg3nc0-3` slice (b), third
 * installment — derivation 3/4's own execute path, which files a NEW issue
 * rather than mutating an existing one, is {@link createMirrorPassDriftExecuteApi}
 * below). Same role gate as {@link createMirrorPassExecuteApi} and
 * {@link createMirrorPassLandingNoteExecuteApi}: resolves the acting
 * identity first (epic law 1, "role honesty first") and returns a
 * zero-mutation report the moment it is unresolved or not this repo's own
 * maintainer — a guest identity never reaches a single `gh issue
 * comment`/`issue edit --remove-assignee` call, and the pool list/activity
 * reads never even run. Only a claimed pool issue {@link
 * planMirrorPassStaleClaimBatch} actually finds a reap finding for (its
 * assignee quiet past the threshold) gets its commands sent.
 */
export function createMirrorPassStaleClaimExecuteApi(
  dbPath: string,
  exec: CliExec = ghExec,
  now: () => number = Date.now,
): MirrorPassStaleClaimExecuteApi {
  return async (projectId) => {
    const store = openStore(dbPath, { readonly: true });
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;
      const identity = await resolveSocialIdentity(exec);
      if (identity === undefined || identity.role !== 'maintainer') {
        return {
          identity,
          outcomes: [],
          skippedReason: identity === undefined ? 'identity-unresolved' : 'guest',
        };
      }
      const claimedPoolIssues = (await fetchPoolIssues(exec)).filter(isClaimedPoolIssue);
      const activity: MirrorPassClaimedIssue[] = [];
      for (const issue of claimedPoolIssues) {
        const entry = await fetchClaimedIssueActivity(exec, issue.number);
        if (entry) activity.push(entry);
      }
      const plans = planMirrorPassStaleClaimBatch(activity, now());
      const outcomes: MirrorPassStaleClaimExecuteOutcome[] = [];
      for (const plan of plans) {
        if (plan.commands.length === 0) continue;
        outcomes.push({
          plan,
          commandOutcomes: await applyMirrorPassCommands(exec, plan.commands),
        });
      }
      return { identity, outcomes };
    } finally {
      store.close();
    }
  };
}
