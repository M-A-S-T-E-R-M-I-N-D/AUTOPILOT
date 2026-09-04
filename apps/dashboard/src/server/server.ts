// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'node:path';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'node:http';
import { handleRoute, type RouteDeps } from './routes.js';
import { securityHeaders, isAllowedHost } from './security.js';
import { createRateLimiter, type RateLimiter } from './rate-limit.js';
import type { ConnectInput, ConnectionStatus } from '../connection/service.js';
import type { AuthProbe } from '../connection/verify.js';
import {
  MIN_BUDGET_USD,
  DEFAULT_BUDGET_USD,
  type FlightStatus,
  type StartFlightInput,
  type StartFlightResult,
  type StopFlightResult,
  type PauseFlightResult,
} from '../flight/runner.js';
import { parseFleetCliArgs } from '../flight/fleet-launch.js';
import type { FleetLaunchApi } from '../flight/fleet-launch-api.js';
import type { LuckyPlan, LuckyProbe } from '../flight/lucky-plan.js';
import { FLY_MAX_TURNS } from '../flight/budget.js';
import type { SearchHit } from '@autopilot/store';
import { MILESTONE_TAG_PATTERN } from '@autopilot/engine';
import type { SpanGraphLens, SpanGraphMode } from '../read/pipeline-graph.js';
import type { GraphLayoutMode } from '../read/pipeline-layout.js';
import { clientKey, sendJson, readBody, MAX_BODY_BYTES } from './http-util.js';
import {
  handleAsk,
  handleAskStream,
  ASK_RATE_LIMIT,
  ASK_RATE_WINDOW_MS,
  type AskApi,
  type AskStreamApi,
} from './ask.js';

// Moved to `./ask.js` (epic 0002 shell decomposition) — re-exported so existing
// importers of the ask contract keep working unchanged.
export type { AskApiResult, AskApi, AskStreamApi, AskPersona } from './ask.js';
import {
  handleGithubSyncExecute,
  handleGithubIssueExecute,
  handleGithubPrExecute,
  GITHUB_SYNC_RATE_LIMIT,
  GITHUB_SYNC_RATE_WINDOW_MS,
  GITHUB_ISSUE_RATE_LIMIT,
  GITHUB_ISSUE_RATE_WINDOW_MS,
  GITHUB_PR_RATE_LIMIT,
  GITHUB_PR_RATE_WINDOW_MS,
  type GithubSyncExecuteApi,
  type GithubIssueExecuteApi,
  type GithubPrExecuteApi,
} from './github-execute.js';

// Moved to `./github-execute.js` (epic 0002 shell decomposition) — re-exported
// so existing importers of the github execute contracts keep working unchanged.
export type { GithubSyncExecuteApi, GithubIssueExecuteApi, GithubPrExecuteApi };
import {
  handleGhStatus,
  handleGhLts,
  GH_LTS_RATE_LIMIT,
  GH_LTS_RATE_WINDOW_MS,
  type GhApi,
  type GhLtsApi,
} from './gh-connection.js';

// Moved to `./gh-connection.js` (epic 0002 shell decomposition) — re-exported
// so existing importers of the gh connection contracts keep working unchanged.
export type { GhApi, GhLtsApi };
import {
  handlePoolClient,
  handlePublicity,
  handlePoolClientExecute,
  POOL_CLIENT_RATE_LIMIT,
  POOL_CLIENT_RATE_WINDOW_MS,
  type PoolClientApi,
  type PublicityApi,
  type PoolClientExecuteApi,
} from './pool-client.js';

// Moved to `./pool-client.js` (epic 0002 shell decomposition) — re-exported
// so existing importers of the pool client/publicity contracts keep working
// unchanged.
export type { PoolClientApi, PublicityApi, PoolClientExecuteApi };
import type {
  LandingInfo,
  FiringsPage,
  FiringActivityPage,
  FiringDiffInfo,
  RoundInfo,
  ReleaseInfo,
} from '../read/project-detail.js';
import type { ReconciliationCandidate } from '../read/reconcile.js';
import type { LandingExecuteApiResult } from '../landing/execute.js';
import type { LandingJobState } from '../landing/job.js';
import type { ReleaseExecuteResult } from '../release/execute.js';
import { isMaturityChoice, type MaturityChoice } from '../release/maturity.js';
import type { InboxAddResult } from '../inbox/add.js';
import type { PrReviewPlan } from '../flight/pr-review.js';
import {
  isPrReviewDecisionKind,
  type PrReviewDecisionKind,
  type PrReviewExecuteResult,
} from '../flight/pr-review-execute.js';
import type { IssueTriagePlan, IssueTriageRitualResult } from '../flight/issue-triage.js';
import {
  isControlTool,
  type ControlExecuteApi,
  type ControlExecuteOutcome,
} from '../flight/control-execute.js';
import {
  isReportAction,
  type ReportAction,
  type ReportFromHereResult,
  type ReportPlan,
  type ReportRegionCapture,
} from '../flight/report-from-here.js';
import type { BrowseFolderResult } from './browse-folder.js';

export const DEFAULT_PORT = 4317;
export const LOOPBACK_HOST = '127.0.0.1';
const STREAM_INTERVAL_MS = 1500;
// Input caps for endpoints whose body is otherwise only bounded by MAX_BODY_BYTES
// (64KB) — that ceiling is generous enough to let an oversized single field (an
// unbounded reorder array driving one DB write per id) through as a
// work-amplification vector.
const MAX_TASK_TITLE_CHARS = 300;
const MAX_REORDER_IDS = 500;
// An INBOX drop is a free-form note, not a title — generous, but still bounded
// (it lands in a real firing prompt, same amplification concern as MAX_TASK_TITLE_CHARS).
const MAX_INBOX_MESSAGE_CHARS = 4000;
// A SOUL prompt is a whole document (rules, gate commands, operating notes),
// not a short message — generous, but still bounded against the same
// unbounded-prompt-amplification concern as MAX_INBOX_MESSAGE_CHARS.
const MAX_SOUL_TEXT_CHARS = 20000;
// Guards POST /api/fly, /api/fly/stop, and /api/fly/pause (ap-msjbcx9w-3
// sibling — the runner already refuses a second concurrent flight, but a
// start/stop/pause hammer loop still burns CPU on every rejected attempt).
// GET status polls (every 3s from the fly bar) are excluded — they cost
// nothing and aren't a spend vector.
const FLY_RATE_LIMIT = 10;
const FLY_RATE_WINDOW_MS = 60_000;
// Guards POST /api/landing/execute — a real gate run (typecheck/test/build)
// plus a real git merge, not just a quota spend. A hammer loop here would
// burn CPU on gate re-runs and spam the repo's git history with abandoned
// merge attempts, so this is capped tighter than the ask/fly limiters.
const LANDING_RATE_LIMIT = 5;
const LANDING_RATE_WINDOW_MS = 60_000;
// Guards POST /api/release/execute — same heavier-than-a-quota-spend
// reasoning as LANDING's limiter: a real file write + git commit + tag per
// request, not just a read.
const RELEASE_RATE_LIMIT = 5;
const RELEASE_RATE_WINDOW_MS = 60_000;
// Guards POST /api/pr-review/execute — same heavier-than-a-quota-spend
// reasoning as RELEASE's limiter: a real `gh` review/merge call per request,
// not just a read.
const PR_REVIEW_RATE_LIMIT = 5;
const PR_REVIEW_RATE_WINDOW_MS = 60_000;
// Guards POST /api/issue-triage/execute — same heavier-than-a-quota-spend
// reasoning as PR_REVIEW's limiter: real `gh` label/comment calls plus board
// task creation per request, not just a read.
const ISSUE_TRIAGE_RATE_LIMIT = 5;
const ISSUE_TRIAGE_RATE_WINDOW_MS = 60_000;
// Guards POST /api/report-from-here/execute — same heavier-than-a-quota-spend
// reasoning as ISSUE_TRIAGE's limiter: a real `gh issue create` call or board
// task creation per request, not just a read. The preview endpoint stays
// unlimited, same as ISSUE_TRIAGE's own preview: it is a pure function over
// caller-supplied data, no shell-out and no store write.
const REPORT_FROM_HERE_RATE_LIMIT = 5;
const REPORT_FROM_HERE_RATE_WINDOW_MS = 60_000;
// Guards POST /api/control/execute (ARCHITECT chat v2 slice 1, docs/epics/
// 0011-architect-chat-v2.md) — same heavier-than-a-quota-spend reasoning as
// RELEASE/PR_REVIEW's limiters: a real store write per request for the
// write/destructive tools, not just a read.
const CONTROL_RATE_LIMIT = 20;
const CONTROL_RATE_WINDOW_MS = 60_000;

/**
 * Server-Sent Events live stream (`/api/stream`): pushes the fleet view on a fast
 * cadence so a flight in progress updates the dashboard — phase rail, activity,
 * flight log — in near-real-time. Same-origin (CSP `connect-src 'self'`), loopback
 * only. The client keeps its slow poll as a fallback when SSE is unavailable.
 */
function handleStream(
  req: IncomingMessage,
  res: ServerResponse,
  readState: () => unknown,
  headers: Record<string, string>,
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    ...headers,
  });
  // Dedupe at the source: only push when the fleet actually changed. Excluding
  // the ever-changing timestamp from the comparison means an idle dashboard gets
  // ONE payload then silence — so nothing repaints (and no "flash"), even for a
  // client running older code without its own skip guard.
  let lastSig: string | null = null;
  const send = (): void => {
    if (res.writableEnded) return;
    const state = readState();
    const sig = JSON.stringify(state, (k, v) => (k === 'generatedAt' ? undefined : v));
    if (sig === lastSig) return; // unchanged — send nothing
    lastSig = sig;
    try {
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    } catch {
      /* client went away between the check and the write */
    }
  };
  send();
  const timer = setInterval(send, STREAM_INTERVAL_MS);
  timer.unref?.();
  const stop = (): void => {
    clearInterval(timer);
    if (!res.writableEnded) res.end();
  };
  req.on('close', stop);
  req.on('error', stop);
}

export interface LoginResult {
  readonly launched: boolean;
  readonly message: string;
}

/** The connect screen's backing API (injected; keeps the server testable). */
export interface ConnectionApi {
  getStatus(): Promise<ConnectionStatus>;
  connect(input: ConnectInput): Promise<ConnectionStatus>;
  /** Launch the official Claude login (opens a terminal + browser). */
  login(): Promise<LoginResult>;
  /** Definitively verify auth via a real minimal `claude -p`. */
  test(): Promise<AuthProbe>;
}

type ConnectionAction = 'status' | 'login' | 'test';

/** The "fly this folder" backing API (injected; a FlightRunnerRegistry in
 *  production — PARALLEL FLIGHTS 3/6, docs/epics/0001-parallel-flights.md). */
export interface FlightApi {
  status(): FlightStatus;
  start(input: StartFlightInput): StartFlightResult;
  /** Request a flight to stop (SIGTERM). `folder` targets one folder in a
   *  multi-flight registry; omitted, the implementation picks a sensible
   *  default (single-flight callers never need to pass it). */
  stop(folder?: string, instanceId?: string): StopFlightResult;
  /** Request a flight to hold after its current firing (graceful). `folder`
   *  targets one folder in a multi-flight registry; same default-picking as
   *  `stop` when omitted. */
  pause(folder?: string, instanceId?: string): PauseFlightResult;
  /** The folder to prefill the flight bar with (the dashboard's own cwd). */
  defaultFolder?(): string;
  /** Every folder with something live to report right now (running, or idle
   *  but paused) — optional so a single-flight implementation keeps working
   *  unchanged; a multi-flight registry wires it for the GET response. */
  statusAll?(): readonly FlightStatus[];
}

type FlightAction = 'root' | 'stop' | 'pause';

/** Full-text retrieval over one project's index (injected; reads only). */
export type SearchApi = (projectId: string, query: string, limit: number) => readonly SearchHit[];

/** What `GET /api/lucky` returns: the probe as measured plus the plan rolled
 *  from it (`flight/lucky-plan.ts`). `folder` is the Fly bar's typed target,
 *  or null for the dashboard's default project. */
export interface LuckyResponse {
  readonly probe: LuckyProbe;
  readonly plan: LuckyPlan;
}
export type LuckyApi = (folder: string | null) => Promise<LuckyResponse>;

/** Remove a project from the store (injected; reads/mutates the store). */
export type DeleteProjectApi = (projectId: string) => boolean;

/** Record a hand-written SOUL proposal from the dashboard's SOUL editor
 *  entry (injected; mutates the store) — board web-mswqemor-ab3jsu. False
 *  for an unknown project id or blank text. */
export type SoulProposeApi = (projectId: string, text: string) => boolean;

/** Resolve the fleet-wide pending wisdom proposal (injected; mutates the
 *  store) — the fleet-scoped counterpart to `DeleteProjectApi`'s SOUL
 *  ratify/dismiss actions, minus the project id: there is exactly one
 *  pending slot for the whole fleet (schema v20, board web-msnt26xe-pc4pzp).
 *  False when there is no pending proposal to resolve. */
export type FleetWisdomActionApi = () => boolean;

/** The tail of ONE project's captured flight stdout+stderr log, keyed by
 *  project id (injected; reads only). */
export type FlightLogApi = (projectId: string) => readonly string[];

/** Doc-ish indexed paths for one project (the Docs reader panel; reads only). */
export type DocsListApi = (projectId: string) => readonly string[];
/** One indexed document's content, or null when it is not in the index. */
export type DocReadApi = (projectId: string, path: string) => string | null;

/** Lists a filesystem path's subdirectories for the FLY-BAR "browse a
 *  brand-new folder" modal (board web-msrhr2d9-xxwa3a; injected, reads
 *  only — see `browse-folder.ts`'s `listBrowsableFolder`). */
export type BrowseFolderApi = (path: string | null) => BrowseFolderResult | null;

/** One project's LANDING preview (injected; reads only, shells to git on demand). */
export type LandingApi = (projectId: string) => Promise<LandingInfo | null>;

/** One project's CURRENT ROUND totals (injected; reads only, shells to git on demand). */
export type RoundApi = (projectId: string) => Promise<RoundInfo | null>;

/** One project's DETECTED BACKLOG candidates — open board tasks a recent commit
 *  may have already shipped (injected; reads only, shells to git on demand). */
export type BacklogApi = (projectId: string) => Promise<readonly ReconciliationCandidate[]>;

/** One project's FLEET COORDINATION state — every held task claim (lease)
 *  and sibling worktree's declared `.autopilot-intent`/uncommitted/unlanded
 *  files, the same lines a sibling's own firing prompt renders (injected;
 *  reads only, shells to git on demand — see `read/project-detail.ts`'s
 *  `readCoordinationState`). Each entry is one pre-formatted digest line. */
export type CoordinationApi = (projectId: string) => Promise<readonly string[]>;

/** One project's RELEASE preview (injected; reads only, shells to git and
 *  reads package.json/CHANGELOG.md on demand). */
export type ReleaseApi = (projectId: string) => Promise<ReleaseInfo | null>;

/** The RELEASE card's EXECUTE action (injected; writes package.json +
 *  CHANGELOG.md and creates a real git commit + tag on a release-worthy
 *  commit set — see `release/execute.ts`). `null` means an unknown project
 *  id. `milestoneTag` is optional (`docs/RELEASING.md`'s `m<N>`) — this
 *  handler validates its shape before it ever reaches the injected API.
 *  `ghRelease: true` opts into the push-tag + `gh release create`
 *  publish-upstream leg (epic 0006 slice 3, board web-mss4lpwl-z0w495).
 *  `maturity` is the operator's phase choice (`'auto'` default) — the
 *  publish leg turns it into GitHub's `--prerelease` flag via
 *  `release/maturity.ts`'s SemVer-grounded detection. */
export type ReleaseExecuteApi = (
  projectId: string,
  milestoneTag?: string,
  ghRelease?: boolean,
  maturity?: MaturityChoice,
) => Promise<ReleaseExecuteResult | null>;

/** The LANDING card's EXECUTE action (injected; runs a real gate, then a real
 *  git merge on green — see `landing/execute.ts`). `null` means an unknown
 *  project id. */
export type LandingExecuteApi = (projectId: string) => Promise<LandingExecuteApiResult | null>;

/** Live LANDING job state (injected; in-memory read, no git/store). `null`
 *  when no landing is running or recently finished for this project. */
export type LandingJobApi = (projectId: string) => LandingJobState | null;

/** One older page of a project's flight log (injected; reads only) — the
 *  flight log's "Load more" (web-msnf2heh-2znbbu). */
export type FiringsPageApi = (projectId: string, offset: number) => FiringsPage | null;

/** The validated query of `GET /api/pipeline` — every field pre-narrowed to the
 *  pure pipeline chain's own unions, so the injected API never sees a raw
 *  querystring value. */
export interface PipelinePanelQuery {
  readonly lens: SpanGraphLens;
  readonly mode: SpanGraphMode;
  readonly layout: GraphLayoutMode;
  readonly selected: string | null;
}

/** The D4 pipeline panel, server-rendered (injected; reads only) — the root
 *  composes `readPipelineSpans` → `spansToGraph` → `renderPipelinePanel` (see
 *  `main.ts`), the wiring path `web/pipeline-panel.ts`'s header sanctions.
 *  `null` means an unknown project (epic 0015 D4, web-mtdc6wq3-5wuc6i). */
export type PipelinePanelApi = (projectId: string, query: PipelinePanelQuery) => string | null;

/** One firing's complete activity trace (injected; reads only) — the Firing
 *  Replay viewer's on-demand fetch, called when the per-firing drill-down
 *  opens a row whose trace may extend past `/api/state`'s recency cap. */
export type FiringActivityApi = (projectId: string, firingId: string) => FiringActivityPage | null;

/** One firing's commit diff (injected; reads only, shells to git on demand) —
 *  the Firing Replay viewer's diff-capture slice, fetched when the drill-down's
 *  "View diff" toggle opens. `null` means an unknown project or firing id. */
export type FiringDiffApi = (projectId: string, firingId: string) => Promise<FiringDiffInfo | null>;

/** The KEEPER REVIEW preview's outcome: every open PR's planned decision,
 *  plus `fetchFailed` (always `true`) when the `gh pr list` read itself
 *  failed — without it, an outage collapsed to the same empty `plans` a
 *  CONFIRMED empty queue returns and the panel hid as if nothing were open
 *  to review (see `flight/pr-review.ts`'s `PrReviewCandidateReport`, the
 *  same failure-honest shape one layer down). Reporting-only: no decision
 *  consults it. */
export interface PrReviewPreviewReport {
  readonly plans: readonly PrReviewPlan[];
  readonly fetchFailed?: true;
}

/** The KEEPER REVIEW preview (injected; reads only, shells to `gh pr list`
 *  on demand) — every open PR's planned decision, judged fresh each call
 *  against gate status/mergeability/touched paths, never the PR's own
 *  description (see `flight/pr-review.ts`). */
export type PrReviewApi = () => Promise<PrReviewPreviewReport>;

/** The KEEPER REVIEW card's EXECUTE action for one PR (injected; posts a
 *  review/comment via `gh` and, for a policy-green PR, merges it — see
 *  `flight/pr-review-execute.ts`). `null` means the PR is no longer open.
 *  `expectedDecision` is the decision kind the operator confirmed — the
 *  stale-decision guard refuses to run anything when the fresh re-derive
 *  disagrees with it (narrowing-only; absent executes the fresh decision). */
export type PrReviewExecuteApi = (
  number: number,
  expectedDecision?: PrReviewDecisionKind,
) => Promise<PrReviewExecuteResult | null>;

/** The KEEPER TRIAGE preview (injected; reads only, shells to `gh issue
 *  list` on demand) — every open issue's planned decision against the
 *  project's open board tasks + backlog file, judged fresh each call (see
 *  `flight/issue-triage-execute.ts`). `null` means an unknown project id. */
export type IssueTriagePreviewApi = (
  projectId: string,
) => Promise<readonly IssueTriagePlan[] | null>;

/** The KEEPER TRIAGE card's EXECUTE action (injected; labels/comments via
 *  `gh` and creates board tasks for accepted issues — see
 *  `flight/issue-triage-execute.ts`). `null` means an unknown project id. */
export type IssueTriageExecuteApi = (projectId: string) => Promise<IssueTriageRitualResult | null>;

/** The report-from-here preview (injected; pure — a region capture arrives
 *  fully formed from the request body, so this never reads the store or
 *  shells out — see `flight/report-from-here-execute.ts`). Turns a capture +
 *  chosen action into the exact plan it would apply. */
export type ReportFromHerePreviewApi = (
  capture: ReportRegionCapture,
  action: ReportAction,
  projectId: string,
) => ReportPlan;

/** The report-from-here EXECUTE action (injected; runs a plan's `gh` argv or
 *  creates the board task it carries — see
 *  `flight/report-from-here-execute.ts`). */
export type ReportFromHereExecuteApi = (
  capture: ReportRegionCapture,
  action: ReportAction,
  projectId: string,
) => Promise<ReportFromHereResult>;

/** Drop the operator's own note into a project's INBOX/ (injected; writes a
 *  file, no store mutation — see `inbox/add.ts`). `null` means an unknown
 *  project id. */
export type InboxAddApi = (projectId: string, message: string) => Promise<InboxAddResult | null>;

/** Task-board management from the project page (injected; store mutations). */
export interface TasksApi {
  create(input: {
    project: string;
    title: string;
    severity?: string | null;
    dimension?: string | null;
  }): boolean;
  setStatus(id: string, status: string): boolean;
  /** Delete a task outright (reject a proposal / remove an obsolete task). */
  remove(id: string): boolean;
  /** Lock/release the operator's FOCUS on a task (WIP-limit-1). */
  setFocus(id: string, focus: boolean): boolean;
  /** Apply the operator's explicit ordering (priority = position). */
  reorder(project: string, ids: readonly string[]): boolean;
  /** Release operator pins on the given tasks (reorder's inverse — pins were
   *  one-way since v16; priority itself stays until the next triage). */
  unpin(project: string, ids: readonly string[]): boolean;
}

export interface ServerDeps extends RouteDeps {
  readonly connection?: ConnectionApi;
  /** The connect screen's GitHub detection half (read-only, no credential). */
  readonly gh?: GhApi;
  readonly ghLts?: GhLtsApi;
  readonly flight?: FlightApi;
  /** The Fly bar's Lanes field (board web-mtdcfel4-0bxf4h) behind `POST
   *  /api/fleet` — the hub-aware partitioner `dashboard fleet` already gives
   *  the CLI, reachable from the dashboard itself. */
  readonly fleetLaunch?: FleetLaunchApi;
  /** The Fly bar's 🍀 "I'm feeling lucky" button behind `GET /api/lucky`:
   *  probes the machine (CPU/RAM/cores), the flight registry, and the
   *  target folder's board, and rolls `flight/lucky-plan.ts`'s calibrated
   *  launch plan. Read-only — the plan only ever FILLS the Fly bar; the
   *  launch click (and its quota spend) stays the operator's. */
  readonly lucky?: LuckyApi;
  readonly search?: SearchApi;
  readonly deleteProject?: DeleteProjectApi;
  /** "Start over": clear a project's telemetry, keep everything else. */
  readonly resetProject?: DeleteProjectApi;
  /** Ratify a project's current SOUL text (SOUL evolution loop, B5 closure). */
  readonly markSoulReviewed?: DeleteProjectApi;
  /** Record a hand-written SOUL proposal from the dashboard's SOUL editor
   *  entry (board web-mswqemor-ab3jsu) — the operator's way to view the
   *  live text and propose an edit directly instead of waiting for an
   *  automated post-flight proposal. Goes through the same ratify/dismiss
   *  flow as any other pending proposal. */
  readonly proposeSoulAmendment?: SoulProposeApi;
  /** Apply a project's pending SOUL proposal as its live SOUL text (SOUL evolution loop, B5 closure). */
  readonly ratifySoulAmendment?: DeleteProjectApi;
  /** Dismiss a project's pending SOUL proposal without applying it (SOUL evolution loop, B5 closure). */
  readonly dismissSoulProposal?: DeleteProjectApi;
  /** Undo a project's last SOUL ratification (SOUL evolution loop, un-ratify affordance, board web-mswqemor-ab3jsu). */
  readonly unratifySoulAmendment?: DeleteProjectApi;
  /** Apply the fleet-wide pending wisdom proposal as the live `wisdom` text (board web-msnt26xe-pc4pzp). */
  readonly ratifyFleetWisdom?: FleetWisdomActionApi;
  /** Dismiss the fleet-wide pending wisdom proposal without applying it (board web-msnt26xe-pc4pzp). */
  readonly dismissFleetWisdom?: FleetWisdomActionApi;
  readonly ask?: AskApi;
  readonly askStream?: AskStreamApi;
  readonly tasks?: TasksApi;
  readonly flightLog?: FlightLogApi;
  readonly docsList?: DocsListApi;
  readonly docRead?: DocReadApi;
  readonly browseFolder?: BrowseFolderApi;
  readonly landing?: LandingApi;
  readonly landingExecute?: LandingExecuteApi;
  /** Live state of this project's landing job — what the LAND button is
   *  actually doing right now, readable by any renderer at any time (see
   *  {@link handleLandingJob}). */
  readonly landingJob?: LandingJobApi;
  readonly round?: RoundApi;
  readonly backlog?: BacklogApi;
  /** Fleet coordination visibility (BOARD web-mtbp0t8z-aftrnm, "NO VISIBLE
   *  INTER-LANE COORDINATION"): held task claims + sibling intent/touching/
   *  unlanded lines for one project's fleet, surfaced for an operator. */
  readonly coordination?: CoordinationApi;
  readonly release?: ReleaseApi;
  readonly releaseExecute?: ReleaseExecuteApi;
  readonly githubSyncExecute?: GithubSyncExecuteApi;
  readonly githubIssueExecute?: GithubIssueExecuteApi;
  readonly githubPrExecute?: GithubPrExecuteApi;
  /** ARCHITECT chat v2 slice 1 (`docs/epics/0011-architect-chat-v2.md`) —
   *  the in-process control-tool dispatcher (`flight/control-execute.ts`)
   *  behind `POST /api/control/execute`. Its UI consumer (slices 2-3, both
   *  shipped) is the Ask panel's ARCHITECT persona action cards. */
  readonly controlExecute?: ControlExecuteApi;
  readonly firingsPage?: FiringsPageApi;
  /** D4 pipeline view (epic 0015, web-mtdc6wq3-5wuc6i) — the server-rendered
   *  panel behind `GET /api/pipeline`. */
  readonly pipelinePanel?: PipelinePanelApi;
  readonly firingActivity?: FiringActivityApi;
  readonly firingDiff?: FiringDiffApi;
  readonly inboxAdd?: InboxAddApi;
  readonly prReview?: PrReviewApi;
  readonly prReviewExecute?: PrReviewExecuteApi;
  readonly issueTriage?: IssueTriagePreviewApi;
  readonly issueTriageExecute?: IssueTriageExecuteApi;
  /** Pool client (epic 0007, "PLATFORM 6/7"): browse the canonical pool's
   *  open issues and claim one for the caller's own gh identity. */
  readonly poolClient?: PoolClientApi;
  readonly poolClientExecute?: PoolClientExecuteApi;
  readonly reportFromHere?: ReportFromHerePreviewApi;
  readonly reportFromHereExecute?: ReportFromHereExecuteApi;
  /** Publicity affordances (epic 0007, "PLATFORM 7/7"): repo/watch/star/
   *  discussions links, dormant while the repo stays private. */
  readonly publicity?: PublicityApi;
}

const SEARCH_LIMIT = 12;

/** Read an optional `{ folder: string }` body (POST /api/fly/stop|pause) —
 *  a missing body, empty body, malformed JSON, or a non-string/blank `folder`
 *  field all resolve to `undefined` rather than reject the request, since the
 *  fly bar today sends no body at all and that must keep working unchanged. */
async function readOptionalStopTarget(
  req: IncomingMessage,
): Promise<{ folder?: string; instanceId?: string }> {
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    return {};
  }
  if (raw.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const body = parsed as { folder?: unknown; instanceId?: unknown };
    const folder =
      typeof body.folder === 'string' && body.folder.trim().length > 0 ? body.folder : undefined;
    const instanceId =
      typeof body.instanceId === 'string' && body.instanceId.trim().length > 0
        ? body.instanceId.trim()
        : undefined;
    return {
      ...(folder !== undefined ? { folder } : {}),
      ...(instanceId !== undefined ? { instanceId } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * The connection endpoint (`/api/connection`). GET reports status (no secret);
 * POST applies a choice. POST requires `application/json` — a cross-site form
 * cannot send that Content-Type without a CORS preflight this server never
 * approves, which blocks CSRF writes to the loopback port.
 */
async function handleConnection(
  req: IncomingMessage,
  res: ServerResponse,
  api: ConnectionApi | undefined,
  headers: Record<string, string>,
  action: ConnectionAction,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);

  if (!api) {
    send(404, { error: 'connection API unavailable' });
    return;
  }

  const method = req.method ?? 'GET';
  if (method === 'GET') {
    send(200, await api.getStatus());
    return;
  }
  if (method !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }

  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }

  // POST /api/connection/login and /test — no body; run the action.
  if (action === 'login') {
    send(200, await api.login());
    return;
  }
  if (action === 'test') {
    send(200, await api.test());
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }

  try {
    send(200, await api.connect(input as ConnectInput));
  } catch (error) {
    send(400, { error: error instanceof Error ? error.message : 'bad request' });
  }
}

/**
 * The connect screen's GitHub status endpoint (`/api/connection/gh`, GET-only,
 * read-only — no credential ever crosses this route). Mirrors `handleConnection`'s
 * GET path.
 */
/**
 * The flight endpoint (`/api/fly`). GET reports the current flight status; POST
 * launches a real flight against a folder. Like `/api/connection`, POST requires
 * `application/json` so a cross-site form cannot trigger a quota-spending run
 * (CSRF guard), and is rate-limited (both start and stop) against a runaway
 * client loop. The runner refuses a second concurrent flight (→ 409). The flight
 * itself is safe-by-construction: it backs up before any work, gates every change,
 * additively reverts on red, and is budget-capped (MASTER-PLAN §17).
 */
async function handleFly(
  req: IncomingMessage,
  res: ServerResponse,
  api: FlightApi | undefined,
  headers: Record<string, string>,
  action: FlightAction,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);

  if (!api) {
    send(404, { error: 'flight API unavailable' });
    return;
  }

  const method = req.method ?? 'GET';
  if (method === 'GET' && action === 'root') {
    // Enrich status with the default (current) folder so the UI can prefill it,
    // and with the per-firing caps so the fly bar can SHOW them — an invisible
    // turn cap reads as a mystery death (firing 47) instead of a knob. `flights`
    // lists every folder with something live to report (multi-flight registry);
    // a single-flight FlightApi that doesn't implement statusAll() omits it
    // rather than fake an array, so an older FlightApi shape stays honest.
    const extra = {
      ...(api.defaultFolder ? { defaultFolder: api.defaultFolder() } : {}),
      ...(api.statusAll ? { flights: api.statusAll() } : {}),
      maxTurnsPerFiring: FLY_MAX_TURNS,
      minBudgetUsd: MIN_BUDGET_USD,
    };
    send(200, { ...api.status(), ...extra });
    return;
  }
  if (method !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many flight requests — slow down and try again shortly.' });
    return;
  }

  // POST /api/fly/stop and /api/fly/pause — an optional `{ folder }` body picks
  // which flight in a multi-flight registry to target; the fly bar today sends
  // no body at all (single-flight UI, epic slice 4/6 lands the folder-aware
  // one), so a missing/empty/malformed body is read as "no folder" rather than
  // rejected — the implementation then falls back to its own single-flight
  // default, exactly like today's no-body request.
  if (action === 'stop' || action === 'pause') {
    // PARALLEL UNLOCK C follow-up: a same-folder fleet member is addressable
    // only by its instanceId — without it, stopping one instance was
    // impossible through the API (2026-08-17: a runaway instance had to be
    // killed with taskkill).
    const { folder, instanceId } = await readOptionalStopTarget(req);
    send(200, action === 'stop' ? api.stop(folder, instanceId) : api.pause(folder, instanceId));
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }

  const result = api.start(input as StartFlightInput);
  // A queued start (the operator's concurrency cap is full — PARALLEL
  // FLIGHTS 5/6) is accepted, not refused: 202 says "not started yet, but
  // will be" rather than 409's "won't happen".
  send(result.started ? 200 : result.queued ? 202 : 409, result);
}

/**
 * The Fly bar's Lanes field (`POST /api/fleet`, board web-mtdcfel4-0bxf4h):
 * launches the SAME hub-aware partitioned multi-lane plan `dashboard fleet`
 * already gives the CLI (`flight/fleet-launch.ts`'s `runFleetLaunch`),
 * reachable from the dashboard itself instead of a terminal. Same CSRF/
 * rate-limit posture as `/api/fly` — POST-only, `application/json` required,
 * and shares its limiter so a lane multiplier can't dodge the single-flight
 * spend cap by hitting a different route. Body validation reuses
 * `parseFleetCliArgs` (the exact same checks `dashboard fleet`'s argv
 * parsing already has), fed with each field's string form.
 */
async function handleFleetLaunch(
  req: IncomingMessage,
  res: ServerResponse,
  api: FleetLaunchApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);

  if (!api) {
    send(404, { error: 'fleet launch unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many flight requests — slow down and try again shortly.' });
    return;
  }

  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const asArg = (v: unknown): string | undefined =>
    v === undefined || v === null ? undefined : String(v);
  const parsed = parseFleetCliArgs(
    [
      asArg(body['folder']),
      asArg(body['laneCount']),
      asArg(body['firings']),
      asArg(body['budgetUsd']),
    ],
    DEFAULT_BUDGET_USD,
  );
  if (!parsed.ok) {
    send(400, { error: parsed.usage });
    return;
  }

  const result = await api({ ...parsed.args, folder: resolve(parsed.args.folder) });
  send(result.ok ? 200 : 502, result);
}

/**
 * The Docs reader endpoints (`GET /api/docs?project=` list; `GET /api/file?
 * project=&path=` content). Reads only — no CSRF concern. Content is served
 * from the SEARCH INDEX, never the filesystem, so the reader is root-jailed by
 * construction: a path that was never indexed simply does not exist here.
 */
function handleDocs(
  req: IncomingMessage,
  res: ServerResponse,
  api: { list?: DocsListApi | undefined; read?: DocReadApi | undefined },
  headers: Record<string, string>,
  mode: 'list' | 'read',
): void {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    if (mode === 'list') {
      if (!api.list) {
        send(404, { error: 'docs unavailable' });
        return;
      }
      send(200, { files: api.list(project) });
      return;
    }
    if (!api.read) {
      send(404, { error: 'docs unavailable' });
      return;
    }
    const path = url.searchParams.get('path') ?? '';
    if (path.length === 0) {
      send(400, { error: 'a file path is required' });
      return;
    }
    const content = api.read(project, path);
    if (content === null) {
      send(404, { error: 'not an indexed file' });
      return;
    }
    send(200, { path, content });
  } catch {
    send(mode === 'list' ? 200 : 404, mode === 'list' ? { files: [] } : { error: 'read failed' });
  }
}

/**
 * The FLY-BAR "browse a brand-new folder" modal's data source
 * (`GET /api/browse-folder?path=<absolute path>`, `path` optional — defaults
 * to the operator's home directory). A read — no CSRF concern, no rate limit
 * (loopback-only, same trust boundary as `/api/docs`/`/api/file`).
 */
function handleBrowseFolder(
  req: IncomingMessage,
  res: ServerResponse,
  browseFolder: BrowseFolderApi | undefined,
  headers: Record<string, string>,
): void {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!browseFolder) {
    send(404, { error: 'browse unavailable' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const result = browseFolder(url.searchParams.get('path'));
  if (result === null) {
    send(400, { error: 'not a readable directory' });
    return;
  }
  send(200, result);
}

/**
 * The retrieval endpoint (`GET /api/search?project=<id>&q=<text>`). A read — no
 * CSRF concern — returning bm25-ranked hits for the project's indexed content.
 * A blank project/query yields an empty result, not an error; the search itself
 * degrades to no hits on any store failure (never crashes the dashboard).
 */
/** GET /api/lucky — the Fly bar's 🍀 button. Read-only: probes and plans,
 *  never launches. A probe failure still answers 200 with a refusal-shaped
 *  plan rather than a 5xx — the button paints "not now, because X" either
 *  way, and a broken `wmic`/registry read is an X, not an outage. */
async function handleLucky(
  req: IncomingMessage,
  res: ServerResponse,
  lucky: LuckyApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!lucky) {
    send(404, { error: 'lucky unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const folder = url.searchParams.get('folder');
  try {
    send(200, await lucky(folder && folder.trim().length > 0 ? folder : null));
  } catch (err) {
    send(200, {
      probe: null,
      plan: {
        ok: false,
        lanes: 0,
        firings: 0,
        budgetUsd: 0,
        reasoning: [],
        refusal: `probe failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    });
  }
}

function handleSearch(
  req: IncomingMessage,
  res: ServerResponse,
  search: SearchApi | undefined,
  headers: Record<string, string>,
): void {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!search) {
    send(404, { error: 'search unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  const query = url.searchParams.get('q') ?? '';
  if (project.length === 0 || query.trim().length === 0) {
    send(200, { hits: [] });
    return;
  }
  try {
    send(200, { hits: search(project, query, SEARCH_LIMIT) });
  } catch {
    send(200, { hits: [] });
  }
}

/**
 * The flight log's "Load more" page (`GET /api/firings?project=&offset=`). A
 * read — no CSRF concern — returning the next older window of one project's
 * firing history (web-msnf2heh-2znbbu: the `/api/state` snapshot only ever
 * carries the newest window, so a slice-heavy day pushed older firings out of
 * reach entirely; this is the round-trip that gets them back).
 */
function handleFiringsPage(
  req: IncomingMessage,
  res: ServerResponse,
  api: FiringsPageApi | undefined,
  headers: Record<string, string>,
): void {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'flight log unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  const offsetParam = Number(url.searchParams.get('offset') ?? '0');
  const offset = Number.isInteger(offsetParam) && offsetParam >= 0 ? offsetParam : 0;
  try {
    const page = api(project, offset);
    if (!page) {
      send(404, { error: 'not found' });
      return;
    }
    send(200, page);
  } catch {
    send(500, { error: 'read failed' });
  }
}

const PIPELINE_LENSES: readonly SpanGraphLens[] = ['fleet', 'file'];
const PIPELINE_MODES: readonly SpanGraphMode[] = ['flat', 'grouped'];
const PIPELINE_LAYOUTS: readonly GraphLayoutMode[] = ['layered', 'compact'];

/** One query param narrowed to its union: absent → `fallback`, unknown → `null` (a 400). */
function pipelineChoice<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T | null {
  if (raw === null) return fallback;
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/**
 * The D4 pipeline panel, on demand (`GET /api/pipeline?project=&lens=&mode=
 * &layout=&selected=`). A read — no CSRF concern — returning the panel's
 * server-rendered markup (see {@link PipelinePanelApi}); the same lazy-load
 * shape as {@link handleFiringsPage}, with every enum param validated HERE so
 * the injected API only ever sees the pure chain's own union values. Defaults
 * (`fleet`/`grouped`/`layered`) are the richest honest view of today's
 * one-span-per-firing traces: grouped mode is where the exporter's
 * `autopilot.item` continuation edges appear (epic 0015 D4, web-mtdc6wq3-5wuc6i).
 */
function handlePipelinePanel(
  req: IncomingMessage,
  res: ServerResponse,
  api: PipelinePanelApi | undefined,
  headers: Record<string, string>,
): void {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'pipeline view unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  const lens = pipelineChoice(url.searchParams.get('lens'), PIPELINE_LENSES, 'fleet');
  const mode = pipelineChoice(url.searchParams.get('mode'), PIPELINE_MODES, 'grouped');
  const layout = pipelineChoice(url.searchParams.get('layout'), PIPELINE_LAYOUTS, 'layered');
  if (lens === null || mode === null || layout === null) {
    send(400, { error: 'unknown lens, mode, or layout' });
    return;
  }
  try {
    const html = api(project, { lens, mode, layout, selected: url.searchParams.get('selected') });
    if (html === null) {
      send(404, { error: 'not found' });
      return;
    }
    send(200, { html });
  } catch {
    send(500, { error: 'read failed' });
  }
}

/**
 * One firing's complete activity trace, on demand (`GET /api/firing-activity
 * ?project=&firing=`). A read — no CSRF concern — returning every recorded
 * step for that firing, not just whatever fits in `/api/state`'s recency cap
 * (see {@link FiringActivityApi}). Fetched by the per-firing drill-down when
 * a row opens, the same lazy-load shape as {@link handleFiringsPage}.
 */
function handleFiringActivity(
  req: IncomingMessage,
  res: ServerResponse,
  api: FiringActivityApi | undefined,
  headers: Record<string, string>,
): void {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'firing activity unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  const firing = url.searchParams.get('firing') ?? '';
  if (project.length === 0 || firing.length === 0) {
    send(400, { error: 'a project id and firing id are required' });
    return;
  }
  try {
    const page = api(project, firing);
    if (!page) {
      send(404, { error: 'not found' });
      return;
    }
    send(200, page);
  } catch {
    send(500, { error: 'read failed' });
  }
}

/**
 * One firing's commit diff, on demand (`GET /api/firing-diff?project=&firing=`).
 * A read — no CSRF concern — but shells out to git (via `GitVcs.showPatch`),
 * so like {@link handleLanding} it stays on-demand rather than folded into
 * the polled `/api/state`. Fetched by the per-firing drill-down's "View diff"
 * toggle, the same lazy-load shape as {@link handleFiringActivity}.
 */
async function handleFiringDiff(
  req: IncomingMessage,
  res: ServerResponse,
  api: FiringDiffApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'firing diff unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  const firing = url.searchParams.get('firing') ?? '';
  if (project.length === 0 || firing.length === 0) {
    send(400, { error: 'a project id and firing id are required' });
    return;
  }
  try {
    const page = await api(project, firing);
    if (!page) {
      send(404, { error: 'not found' });
      return;
    }
    send(200, page);
  } catch {
    send(500, { error: 'read failed' });
  }
}

/**
 * The flight console feed (`GET /api/flightlog?project=<id>`). Read-only tail
 * of that project's captured flight stdout+stderr — no CSRF concern. Returns
 * an empty list when no flight has ever run for it (the file may not exist
 * yet) or the read itself fails; never crashes the dashboard.
 */
function handleFlightLog(
  req: IncomingMessage,
  res: ServerResponse,
  api: FlightLogApi | undefined,
  headers: Record<string, string>,
): void {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'flight log unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { lines: api(project) });
  } catch {
    send(200, { lines: [] });
  }
}

/**
 * The LANDING preview endpoint (`GET /api/landing?project=<id>`). Read-only —
 * no CSRF concern — but unlike the polled fleet state, this shells out to git
 * on demand (see `readLandingInfo`), so it is deliberately NOT folded into
 * `/api/state`/`/api/stream`. Responds `{ landing: null }` when there is
 * nothing to preview (unknown project, no repo, no discoverable base branch)
 * or the read itself fails; never crashes the dashboard.
 */
async function handleLanding(
  req: IncomingMessage,
  res: ServerResponse,
  api: LandingApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'landing unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { landing: await api(project) });
  } catch {
    send(200, { landing: null });
  }
}

/**
 * The LANDING JOB status endpoint (`GET /api/landing/job?project=<id>`).
 * Read-only and deliberately cheap — it reads in-memory job state only (no
 * git, no store), because the LANDING panel polls it every couple of seconds
 * while a gate runs.
 *
 * This is what makes the LAND button honest: the execute POST it accompanies
 * takes minutes, and the panel re-renders many times meanwhile, so the click's
 * own promise can never be the source of truth for what happened (it used to
 * be, and a re-render silently detached the node its verdict was written into
 * — a land could succeed with the operator seeing nothing). Any renderer, at
 * any time, including a fresh page after a reload or a self-restart, can ask
 * here instead. `{ job: null }` means "nothing in flight, nothing recent".
 */
function handleLandingJob(
  req: IncomingMessage,
  res: ServerResponse,
  api: LandingJobApi | undefined,
  headers: Record<string, string>,
): void {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'landing job unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { job: api(project) });
  } catch {
    send(200, { job: null });
  }
}

/**
 * The CURRENT ROUND endpoint (`GET /api/round?project=<id>`). Read-only, same
 * on-demand-not-polled rationale as {@link handleLanding} — a project's round
 * totals shell out to git for its last tag. Responds `{ round: null }` when
 * there is nothing to show (unknown project) or the read itself fails; never
 * crashes the dashboard.
 */
async function handleRound(
  req: IncomingMessage,
  res: ServerResponse,
  api: RoundApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'round unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { round: await api(project) });
  } catch {
    send(200, { round: null });
  }
}

/**
 * The DETECTED BACKLOG endpoint (`GET /api/backlog?project=<id>`). Read-only,
 * same on-demand-not-polled rationale as {@link handleLanding}/{@link handleRound}
 * — scoring open tasks against recent commits shells out to git. Responds
 * `{ candidates: [] }` when there is nothing detected (unknown project, no open
 * tasks, no match) or the read itself fails; never crashes the dashboard.
 */
async function handleBacklog(
  req: IncomingMessage,
  res: ServerResponse,
  api: BacklogApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'backlog unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { candidates: await api(project) });
  } catch {
    send(200, { candidates: [] });
  }
}

/**
 * The FLEET COORDINATION endpoint (`GET /api/coordination?project=<id>`).
 * Read-only, same on-demand-not-polled rationale as {@link handleBacklog} —
 * shells to git on demand rather than riding the polled `/api/state` gather.
 * Surfaces the same held-claim/sibling-intent lines a firing's own prompt
 * already carries, for an operator instead of an agent.
 */
async function handleCoordination(
  req: IncomingMessage,
  res: ServerResponse,
  api: CoordinationApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'coordination unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { lines: await api(project) });
  } catch {
    send(200, { lines: [] });
  }
}

/**
 * The RELEASE preview endpoint (`GET /api/release?project=<id>`). Read-only,
 * same on-demand-not-polled rationale as {@link handleLanding}/
 * {@link handleRound} — a project's release preview shells out to git for
 * its last tag and re-reads package.json/CHANGELOG.md. Responds
 * `{ release: null }` when there is nothing to preview (unknown project, no
 * version, unreadable changelog) or the read itself fails; never crashes
 * the dashboard.
 */
async function handleRelease(
  req: IncomingMessage,
  res: ServerResponse,
  api: ReleaseApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'release unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { release: await api(project) });
  } catch {
    send(200, { release: null });
  }
}

/**
 * The LANDING EXECUTE endpoint (`POST /api/landing/execute`, body
 * `{project}`). State-changing — runs the project's real verification gate
 * and, only on green, a real `git merge --no-ff --signoff` into its base
 * branch — so it is a CSRF-guarded JSON POST like every other write, and
 * separately rate-limited (a real gate run + a real merge is heavier than a
 * quota spend). A red gate or a failed merge is not a server error: it is a
 * refusal the response body reports via `ok`/`reason`/`details` (409, so the
 * client can tell "refused" apart from "landed" without parsing the body).
 * 404 only for an unknown project or an unwired API.
 */
async function handleLandingExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: LandingExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'landing execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many landing requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let project: string;
  try {
    project = String((JSON.parse(raw) as { project?: unknown }).project ?? '');
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    const result = await api(project);
    if (!result) {
      send(404, { error: 'unknown project' });
      return;
    }
    send(result.ok ? 200 : 409, result);
  } catch (error) {
    send(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'landing execute failed',
    });
  }
}

/**
 * The RELEASE EXECUTE endpoint (`POST /api/release/execute`, body
 * `{project}`). State-changing — writes `package.json` + `CHANGELOG.md` and
 * creates a real `git commit --signoff` + annotated tag, only on a
 * release-worthy commit set — so it is a CSRF-guarded JSON POST like every
 * other write, and separately rate-limited (same heavier-than-a-quota-spend
 * reasoning as `handleLandingExecute`). A `'no-op'`/`'tag-failed'` refusal is
 * not a server error: it is reported via `ok`/`reason`/`details` (409, same
 * "refused vs succeeded" convention as landing execute). 404 only for an
 * unknown project or an unwired API.
 *
 * An optional body `milestoneTag` (`docs/RELEASING.md`'s `m<N>`) is validated
 * against `MILESTONE_TAG_PATTERN` here — a 400 on a malformed shape — before
 * ever reaching `executeRelease`, which trusts its shape and would otherwise
 * throw. *Whether* to name one is a human call (only a human knows if this
 * release actually completes a milestone's DoD); this endpoint only enforces
 * that whatever is named looks like a real milestone tag.
 *
 * An optional body `ghRelease: true` opts into the push-tag + `gh release
 * create` publish-upstream leg (epic 0006 slice 3) — passed straight through
 * since it is a plain boolean, nothing to validate.
 */
async function handleReleaseExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: ReleaseExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'release execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many release requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let project: string;
  let milestoneTag: string | undefined;
  let ghRelease: boolean | undefined;
  let maturity: MaturityChoice | undefined;
  try {
    const parsed = JSON.parse(raw) as {
      project?: unknown;
      milestoneTag?: unknown;
      ghRelease?: unknown;
      maturity?: unknown;
    };
    project = String(parsed.project ?? '');
    if (typeof parsed.milestoneTag === 'string' && parsed.milestoneTag.length > 0) {
      milestoneTag = parsed.milestoneTag;
    }
    if (typeof parsed.ghRelease === 'boolean') {
      ghRelease = parsed.ghRelease;
    }
    if (parsed.maturity !== undefined) {
      if (!isMaturityChoice(parsed.maturity)) {
        send(400, { error: 'maturity must be one of "auto", "alpha", "beta", "rc", "stable"' });
        return;
      }
      maturity = parsed.maturity;
    }
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  if (milestoneTag !== undefined && !MILESTONE_TAG_PATTERN.test(milestoneTag)) {
    send(400, { error: 'milestoneTag must match "m<N>" (e.g. "m4")' });
    return;
  }
  try {
    const result = await api(project, milestoneTag, ghRelease, maturity);
    if (!result) {
      send(404, { error: 'unknown project' });
      return;
    }
    send(result.ok ? 200 : 409, result);
  } catch (error) {
    send(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'release execute failed',
    });
  }
}

/**
 * The KEEPER REVIEW preview endpoint (`GET /api/pr-review`). Read-only, same
 * on-demand-not-polled rationale as {@link handleRelease} — shells to
 * `gh pr list` fresh on every call, judging every open PR against the gate
 * and its touched paths. Responds `{ plans: [] }` when there is nothing to
 * preview; a failed read additionally carries `fetchFailed: true` (both the
 * injected report's own flag and this handler's catch — a thrown read is a
 * failed read, not a confirmed-empty queue) so the panel can say "the list
 * could not be read" instead of hiding. Never crashes the dashboard.
 */
async function handlePrReview(
  req: IncomingMessage,
  res: ServerResponse,
  api: PrReviewApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'pr review unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  try {
    const report = await api();
    send(200, { plans: report.plans, ...(report.fetchFailed ? { fetchFailed: true } : {}) });
  } catch {
    send(200, { plans: [], fetchFailed: true });
  }
}

/**
 * The KEEPER REVIEW EXECUTE endpoint (`POST /api/pr-review/execute`, body
 * `{number, expectedDecision?}`). State-changing — posts a review/comment via
 * `gh` and, for a policy-green PR, merges it — so it is a CSRF-guarded JSON
 * POST like every other write, and separately rate-limited (same
 * heavier-than-a-quota-spend reasoning as `handleReleaseExecute`). The
 * decision is re-derived fresh from `gh` at execute time rather than trusting
 * anything the client sent — see `flight/pr-review-execute.ts`;
 * `expectedDecision` (the kind the operator's confirm dialog showed) is the
 * one client value honored, and only to NARROW: a fresh derive reaching a
 * different kind executes nothing and returns `staleDecision: true` for a
 * re-preview. 404 only for a PR no longer open or an
 * unwired API; every other completed run (merge, request-changes, or
 * queue-for-human) is a 200 — the caller inspects `results[].code` for
 * whether the underlying `gh` calls actually succeeded.
 */
async function handlePrReviewExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: PrReviewExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'pr review execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many PR review requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let number: number;
  let expectedDecision: PrReviewDecisionKind | undefined;
  try {
    const parsed = JSON.parse(raw) as { number?: unknown; expectedDecision?: unknown };
    number = typeof parsed.number === 'number' ? parsed.number : NaN;
    // Optional: the decision kind the operator's confirm dialog showed — the
    // stale-decision guard input. Absent means not-asserted (executes the
    // fresh decision); a present-but-garbage value 400s rather than being
    // silently dropped, so a caller that MEANT to pin its confirm never
    // executes unpinned by typo.
    if (parsed.expectedDecision !== undefined) {
      if (!isPrReviewDecisionKind(parsed.expectedDecision)) {
        send(400, {
          error: 'expectedDecision must be merge, request-changes, or queue-for-human',
        });
        return;
      }
      expectedDecision = parsed.expectedDecision;
    }
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (!Number.isInteger(number) || number <= 0) {
    send(400, { error: 'a positive integer PR number is required' });
    return;
  }
  try {
    const result = await api(number, expectedDecision);
    if (!result) {
      send(404, { error: 'PR is no longer open' });
      return;
    }
    send(200, result);
  } catch (error) {
    send(500, {
      error: error instanceof Error ? error.message : 'pr review execute failed',
    });
  }
}

// handlePoolClient/handlePublicity/handlePoolClientExecute moved to
// `./pool-client.js` (epic 0002 shell decomposition) — imported above.

/**
 * The ARCHITECT chat v2 control-tool execute endpoint (`POST /api/control/
 * execute`, body `{tool, args}`; `docs/epics/0011-architect-chat-v2.md`
 * slice 1, board web-msnqmgge-oijj8x). Wires `flight/control-execute.ts`'s
 * in-process dispatcher — CSRF-guarded JSON POST + rate-limited like every
 * other write endpoint here, the shape `/api/pr-review/execute`'s docstring
 * describes. `tool` membership is checked here (400 for an unknown tool);
 * every other argument is validated inside the injected API, same split as
 * `pr-review-execute.ts` owning its own domain checks. The Ask panel persona
 * toggle and action cards (slices 2-3, both shipped) are this endpoint's UI
 * caller.
 */
async function handleControlExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: ControlExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'control execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many control requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let parsed: { tool?: unknown; args?: unknown };
  try {
    parsed = JSON.parse(raw) as { tool?: unknown; args?: unknown };
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  const tool = typeof parsed.tool === 'string' ? parsed.tool : '';
  if (!isControlTool(tool)) {
    send(400, { error: 'an unknown control tool was requested' });
    return;
  }
  const args =
    typeof parsed.args === 'object' && parsed.args !== null
      ? (parsed.args as Record<string, unknown>)
      : {};
  try {
    const outcome: ControlExecuteOutcome = api(tool, args);
    send(200, { tool, ...outcome });
  } catch (error) {
    send(500, { error: error instanceof Error ? error.message : 'control execute failed' });
  }
}

/**
 * The KEEPER TRIAGE preview endpoint (`GET /api/issue-triage?project=`).
 * Read-only, same on-demand-not-polled rationale as {@link handleRelease} —
 * shells to `gh issue list` fresh on every call, judging every open issue
 * against the project's open board tasks and backlog file. Degrades to
 * `{ triage: null }` instead of crashing when the read throws (a flaky `gh`
 * call shouldn't take the dashboard down).
 */
async function handleIssueTriage(
  req: IncomingMessage,
  res: ServerResponse,
  api: IssueTriagePreviewApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'issue triage unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'GET') {
    send(405, { error: 'method not allowed' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const project = url.searchParams.get('project') ?? '';
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    send(200, { triage: await api(project) });
  } catch {
    send(200, { triage: null });
  }
}

/**
 * The KEEPER TRIAGE EXECUTE endpoint (`POST /api/issue-triage/execute`, body
 * `{project}`). State-changing — labels/comments open issues via `gh` and
 * creates board tasks for accepted ones — so it is a CSRF-guarded JSON POST
 * like every other write, and separately rate-limited (same
 * heavier-than-a-quota-spend reasoning as `handlePrReviewExecute`). 404 only
 * for an unknown project or an unwired API.
 */
async function handleIssueTriageExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: IssueTriageExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'issue triage execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many issue triage requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let project: string;
  try {
    project = String((JSON.parse(raw) as { project?: unknown }).project ?? '');
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (project.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  try {
    const result = await api(project);
    if (!result) {
      send(404, { error: 'unknown project' });
      return;
    }
    send(200, result);
  } catch (error) {
    send(500, {
      error: error instanceof Error ? error.message : 'issue triage execute failed',
    });
  }
}

/** Shared body parser for both report-from-here endpoints — `{regionId,
 *  regionLabel, description, moduleSources, hasScreenshot, action,
 *  projectId}`. `null` (→ 400) means malformed JSON/body or an unrecognized
 *  `action`. A blank `regionId`/`description`/`projectId` is deliberately
 *  NOT rejected here: `planReportFromHere` is total over those and already
 *  turns a blank field into a reasoned `ReportRejected` plan rather than a
 *  bare error — "always previewed" holds even for a bad report. */
function parseReportFromHereBody(
  raw: string,
): { capture: ReportRegionCapture; action: ReportAction; projectId: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const body = parsed as {
    regionId?: unknown;
    regionLabel?: unknown;
    description?: unknown;
    moduleSources?: unknown;
    hasScreenshot?: unknown;
    action?: unknown;
    projectId?: unknown;
  };
  const action = typeof body.action === 'string' ? body.action : '';
  if (!isReportAction(action)) return null;
  const moduleSources = Array.isArray(body.moduleSources)
    ? body.moduleSources.filter((source): source is string => typeof source === 'string')
    : [];
  return {
    capture: {
      regionId: typeof body.regionId === 'string' ? body.regionId : '',
      regionLabel: typeof body.regionLabel === 'string' ? body.regionLabel : '',
      description: typeof body.description === 'string' ? body.description : '',
      moduleSources,
      hasScreenshot: body.hasScreenshot === true,
    },
    action,
    projectId: typeof body.projectId === 'string' ? body.projectId : '',
  };
}

/**
 * Report-from-here's preview endpoint (`POST /api/report-from-here`, body
 * `{regionId, regionLabel, description, moduleSources, hasScreenshot,
 * action, projectId}`). Pure — never touches the store or `gh`:
 * `planReportFromHere` is total over its inputs, so a blank/invalid capture
 * still returns 200 with a `ReportRejected` plan and reasoning rather than a
 * bare error. A POST (not GET) because the capture body — free-form
 * description, module source list — does not fit a query string;
 * CSRF-guarded (`application/json` only) for the same reason every other
 * body-bearing endpoint here is, even though this one never mutates.
 */
async function handleReportFromHere(
  req: IncomingMessage,
  res: ServerResponse,
  api: ReportFromHerePreviewApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'report-from-here unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  const parsed = parseReportFromHereBody(raw);
  if (!parsed) {
    send(400, { error: 'invalid report-from-here request' });
    return;
  }
  send(200, { plan: api(parsed.capture, parsed.action, parsed.projectId) });
}

/**
 * Report-from-here's EXECUTE endpoint (`POST /api/report-from-here/execute`,
 * same body as {@link handleReportFromHere}). State-changing when the judged
 * plan resolves — files a `gh issue create` upstream or creates a board
 * task — so it is CSRF-guarded like the preview and separately rate-limited,
 * same heavier-than-a-quota-spend reasoning as `handleIssueTriageExecute`. A
 * rejected plan still returns 200 (nothing applied — `taskCreated: false`,
 * empty `commandResults`); the caller distinguishes "nothing happened
 * because the capture was invalid" from a hard error via the returned plan's
 * `ok` field, not the HTTP status.
 */
async function handleReportFromHereExecute(
  req: IncomingMessage,
  res: ServerResponse,
  api: ReportFromHereExecuteApi | undefined,
  headers: Record<string, string>,
  limiter: RateLimiter,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'report-from-here execute unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  if (!limiter.allow(clientKey(req), Date.now())) {
    send(429, { error: 'Too many report-from-here requests — slow down and try again shortly.' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  const parsed = parseReportFromHereBody(raw);
  if (!parsed) {
    send(400, { error: 'invalid report-from-here request' });
    return;
  }
  try {
    send(200, await api(parsed.capture, parsed.action, parsed.projectId));
  } catch (error) {
    send(500, {
      error: error instanceof Error ? error.message : 'report-from-here execute failed',
    });
  }
}

/**
 * Shared handler for project-scoped write actions taking `{id}` — remove
 * (`POST /api/project/delete`), start-over telemetry reset
 * (`POST /api/project/reset`), and the SOUL evolution loop's B5-closure
 * actions: ratify the current text (`POST /api/project/soul-reviewed`),
 * apply a pending proposal (`POST /api/project/soul-ratify`), dismiss a
 * pending proposal (`POST /api/project/soul-dismiss`), and undo the last
 * ratification (`POST /api/project/soul-unratify`, the un-ratify affordance,
 * board web-mswqemor-ab3jsu). State-changing writes, so they require
 * `application/json` (CSRF guard). None of these ever touch the project's
 * folder or git backup; reset also keeps the project row, board, and search
 * index.
 */
async function handleProjectAction(
  req: IncomingMessage,
  res: ServerResponse,
  api: DeleteProjectApi | undefined,
  headers: Record<string, string>,
  resultKey: 'removed' | 'reset' | 'reviewed' | 'ratified' | 'dismissed' | 'unratified',
  unavailable: string,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: unavailable });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let id: string;
  try {
    id = String((JSON.parse(raw) as { id?: unknown }).id ?? '');
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (id.length === 0) {
    send(400, { error: 'a project id is required' });
    return;
  }
  const ok = api(id);
  send(ok ? 200 : 404, { [resultKey]: ok, id });
}

/**
 * The fleet-wide wisdom proposal's ratify/dismiss actions (`POST
 * /api/fleet/wisdom-ratify`, `POST /api/fleet/wisdom-dismiss`, board
 * web-msnt26xe-pc4pzp) — the fleet-scoped counterpart to
 * `handleProjectAction`'s SOUL ratify/dismiss, minus the `{id}` body: there
 * is exactly one pending wisdom proposal for the whole fleet, not one per
 * project, so there is nothing to select. Still a CSRF-guarded JSON POST
 * like every other state-changing write here.
 */
async function handleFleetWisdomAction(
  req: IncomingMessage,
  res: ServerResponse,
  api: FleetWisdomActionApi | undefined,
  headers: Record<string, string>,
  resultKey: 'ratified' | 'dismissed',
  unavailable: string,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: unavailable });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  const ok = api();
  send(ok ? 200 : 404, { [resultKey]: ok });
}

/**
 * The SOUL editor entry's submit action (`POST /api/project/soul-propose`
 * `{id,text}`) — board web-mswqemor-ab3jsu. Records a hand-written SOUL
 * proposal the operator typed directly, landing in the exact same pending
 * slot (and ratify/dismiss flow) an automated post-flight proposal uses.
 * State-changing write, so it is a CSRF-guarded JSON POST like every other
 * write action here.
 */
async function handleSoulPropose(
  req: IncomingMessage,
  res: ServerResponse,
  api: SoulProposeApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
    res.end(JSON.stringify(body));
  };
  if (!api) {
    send(404, { error: 'soul-propose unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let id: string;
  let text: string;
  try {
    const body = JSON.parse(raw) as { id?: unknown; text?: unknown };
    id = String(body.id ?? '');
    text = String(body.text ?? '').trim();
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (id.length === 0 || text.length === 0) {
    send(400, { error: 'a project id and SOUL text are required' });
    return;
  }
  if (text.length > MAX_SOUL_TEXT_CHARS) {
    send(400, { error: `SOUL text must be ${MAX_SOUL_TEXT_CHARS} characters or fewer` });
    return;
  }
  const ok = api(id, text);
  send(ok ? 200 : 404, { proposed: ok, id });
}

/**
 * The INBOX message box (`POST /api/inbox/add` `{project,message}`) — drops a
 * timestamped note into the project's `INBOX/` folder, the same folder every
 * firing already reads fresh (packages/engine/src/inbox.ts). State-changing
 * write (a real file on disk), so it is a CSRF-guarded JSON POST like every
 * other write action here.
 */
async function handleInboxAdd(
  req: IncomingMessage,
  res: ServerResponse,
  api: InboxAddApi | undefined,
  headers: Record<string, string>,
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'inbox unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let project: string;
  let message: string;
  try {
    const body = JSON.parse(raw) as { project?: unknown; message?: unknown };
    project = String(body.project ?? '');
    message = String(body.message ?? '').trim();
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }
  if (project.length === 0 || message.length === 0) {
    send(400, { error: 'a project id and a message are required' });
    return;
  }
  if (message.length > MAX_INBOX_MESSAGE_CHARS) {
    send(400, { error: `message must be ${MAX_INBOX_MESSAGE_CHARS} characters or fewer` });
    return;
  }
  try {
    const result = await api(project, message);
    if (!result) {
      send(404, { error: 'unknown project' });
      return;
    }
    send(200, result);
  } catch (error) {
    send(500, { ok: false, error: error instanceof Error ? error.message : 'inbox add failed' });
  }
}

/**
 * Task-board endpoints (`POST /api/task/create` `{project,title,severity?,dimension?}`,
 * `POST /api/task/status` `{id,status}`). State-changing writes → CSRF-guarded
 * JSON POSTs; invalid values are refused by the store's CHECK constraints and
 * surface as `{ok:false}` + 400, never a crash.
 */
async function handleTasks(
  req: IncomingMessage,
  res: ServerResponse,
  api: TasksApi | undefined,
  headers: Record<string, string>,
  action: 'create' | 'status' | 'focus' | 'reorder' | 'unpin' | 'delete',
): Promise<void> {
  const send = (status: number, body: unknown): void => sendJson(res, headers, status, body);
  if (!api) {
    send(404, { error: 'tasks unavailable' });
    return;
  }
  if ((req.method ?? 'GET') !== 'POST') {
    send(405, { error: 'method not allowed' });
    return;
  }
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) {
    send(415, { error: 'Content-Type must be application/json' });
    return;
  }
  let raw: string;
  try {
    raw = await readBody(req, MAX_BODY_BYTES);
  } catch {
    send(413, { error: 'request body too large' });
    return;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    send(400, { error: 'invalid JSON' });
    return;
  }

  if (action === 'create') {
    const project = String(body['project'] ?? '');
    const title = String(body['title'] ?? '').trim();
    if (project.length === 0 || title.length === 0) {
      send(400, { error: 'a project id and a task title are required' });
      return;
    }
    if (title.length > MAX_TASK_TITLE_CHARS) {
      send(400, { error: `title must be ${MAX_TASK_TITLE_CHARS} characters or fewer` });
      return;
    }
    const ok = api.create({
      project,
      title,
      severity: typeof body['severity'] === 'string' ? body['severity'] : null,
      dimension: typeof body['dimension'] === 'string' ? body['dimension'] : null,
    });
    send(ok ? 200 : 400, { ok });
    return;
  }

  if (action === 'focus') {
    const id = String(body['id'] ?? '');
    if (id.length === 0 || typeof body['focus'] !== 'boolean') {
      send(400, { error: 'a task id and a boolean focus are required' });
      return;
    }
    const ok = api.setFocus(id, body['focus']);
    send(ok ? 200 : 400, { ok });
    return;
  }

  if (action === 'delete') {
    const id = String(body['id'] ?? '');
    if (id.length === 0) {
      send(400, { error: 'a task id is required' });
      return;
    }
    const ok = api.remove(id);
    send(ok ? 200 : 404, { ok });
    return;
  }

  if (action === 'reorder' || action === 'unpin') {
    const project = String(body['project'] ?? '');
    const ids = Array.isArray(body['ids'])
      ? (body['ids'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    if (project.length === 0 || ids.length === 0) {
      send(400, { error: 'a project id and an ordered ids array are required' });
      return;
    }
    if (ids.length > MAX_REORDER_IDS) {
      send(400, { error: `at most ${MAX_REORDER_IDS} ids may be reordered at once` });
      return;
    }
    // `unpin` is reorder's inverse (pins were one-way since v16): same body
    // shape and caps, but it only clears the operator-pin flag — priority
    // itself is untouched, so the next takeoff triage re-ranks naturally.
    const ok = action === 'unpin' ? api.unpin(project, ids) : api.reorder(project, ids);
    send(ok ? 200 : 400, { ok });
    return;
  }

  const id = String(body['id'] ?? '');
  const status = String(body['status'] ?? '');
  if (id.length === 0 || status.length === 0) {
    send(400, { error: 'a task id and a status are required' });
    return;
  }
  const ok = api.setStatus(id, status);
  send(ok ? 200 : 400, { ok });
}

/**
 * The dashboard HTTP server: security headers on every response, a DNS-rebind
 * Host guard, the pure router for reads, and the connection endpoint for the
 * connect screen. Bound to loopback by the entry point — never exposed off-machine
 * (confidentiality; MASTER-PLAN §9). Injected deps keep it trivially testable.
 */
export function createServer(deps: ServerDeps = {}): Server {
  // Shared by both ask endpoints (below) so a client can't dodge the cap by
  // alternating between them — one budget per client, not one per route.
  const askLimiter = createRateLimiter(ASK_RATE_LIMIT, ASK_RATE_WINDOW_MS);
  // Shared by /api/fly, /api/fly/stop, and /api/fly/pause so a client can't
  // dodge the cap by alternating between them.
  const flyLimiter = createRateLimiter(FLY_RATE_LIMIT, FLY_RATE_WINDOW_MS);
  const landingLimiter = createRateLimiter(LANDING_RATE_LIMIT, LANDING_RATE_WINDOW_MS);
  const releaseLimiter = createRateLimiter(RELEASE_RATE_LIMIT, RELEASE_RATE_WINDOW_MS);
  const prReviewLimiter = createRateLimiter(PR_REVIEW_RATE_LIMIT, PR_REVIEW_RATE_WINDOW_MS);
  const poolClientLimiter = createRateLimiter(POOL_CLIENT_RATE_LIMIT, POOL_CLIENT_RATE_WINDOW_MS);
  const issueTriageLimiter = createRateLimiter(
    ISSUE_TRIAGE_RATE_LIMIT,
    ISSUE_TRIAGE_RATE_WINDOW_MS,
  );
  const reportFromHereLimiter = createRateLimiter(
    REPORT_FROM_HERE_RATE_LIMIT,
    REPORT_FROM_HERE_RATE_WINDOW_MS,
  );
  const githubSyncLimiter = createRateLimiter(GITHUB_SYNC_RATE_LIMIT, GITHUB_SYNC_RATE_WINDOW_MS);
  const githubIssueLimiter = createRateLimiter(
    GITHUB_ISSUE_RATE_LIMIT,
    GITHUB_ISSUE_RATE_WINDOW_MS,
  );
  const githubPrLimiter = createRateLimiter(GITHUB_PR_RATE_LIMIT, GITHUB_PR_RATE_WINDOW_MS);
  const ghLtsLimiter = createRateLimiter(GH_LTS_RATE_LIMIT, GH_LTS_RATE_WINDOW_MS);
  const controlLimiter = createRateLimiter(CONTROL_RATE_LIMIT, CONTROL_RATE_WINDOW_MS);
  return createHttpServer((req, res) => {
    const headers = securityHeaders();

    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
      res.end('forbidden host');
      return;
    }

    const path = (req.url ?? '/').split('?')[0] ?? '/';

    if (path === '/api/stream' && deps.readState) {
      handleStream(req, res, deps.readState, headers);
      return;
    }

    if (path === '/api/fly' || path === '/api/fly/stop' || path === '/api/fly/pause') {
      const action: FlightAction = path.endsWith('/stop')
        ? 'stop'
        : path.endsWith('/pause')
          ? 'pause'
          : 'root';
      void handleFly(req, res, deps.flight, headers, action, flyLimiter);
      return;
    }

    if (path === '/api/fleet') {
      void handleFleetLaunch(req, res, deps.fleetLaunch, headers, flyLimiter);
      return;
    }

    if (path === '/api/lucky') {
      void handleLucky(req, res, deps.lucky, headers);
      return;
    }

    if (path === '/api/search') {
      handleSearch(req, res, deps.search, headers);
      return;
    }

    if (path === '/api/firings') {
      handleFiringsPage(req, res, deps.firingsPage, headers);
      return;
    }

    if (path === '/api/pipeline') {
      handlePipelinePanel(req, res, deps.pipelinePanel, headers);
      return;
    }

    if (path === '/api/firing-activity') {
      handleFiringActivity(req, res, deps.firingActivity, headers);
      return;
    }

    if (path === '/api/firing-diff') {
      void handleFiringDiff(req, res, deps.firingDiff, headers);
      return;
    }

    if (path === '/api/flightlog') {
      handleFlightLog(req, res, deps.flightLog, headers);
      return;
    }

    if (path === '/api/landing') {
      void handleLanding(req, res, deps.landing, headers);
      return;
    }

    if (path === '/api/landing/execute') {
      void handleLandingExecute(req, res, deps.landingExecute, headers, landingLimiter);
      return;
    }

    if (path === '/api/landing/job') {
      handleLandingJob(req, res, deps.landingJob, headers);
      return;
    }

    if (path === '/api/round') {
      void handleRound(req, res, deps.round, headers);
      return;
    }

    if (path === '/api/backlog') {
      void handleBacklog(req, res, deps.backlog, headers);
      return;
    }

    if (path === '/api/coordination') {
      void handleCoordination(req, res, deps.coordination, headers);
      return;
    }

    if (path === '/api/release') {
      void handleRelease(req, res, deps.release, headers);
      return;
    }

    if (path === '/api/release/execute') {
      void handleReleaseExecute(req, res, deps.releaseExecute, headers, releaseLimiter);
      return;
    }

    if (path === '/api/github-sync/execute') {
      void handleGithubSyncExecute(req, res, deps.githubSyncExecute, headers, githubSyncLimiter);
      return;
    }

    if (path === '/api/github-issue/execute') {
      void handleGithubIssueExecute(req, res, deps.githubIssueExecute, headers, githubIssueLimiter);
      return;
    }

    if (path === '/api/github-pr/execute') {
      void handleGithubPrExecute(req, res, deps.githubPrExecute, headers, githubPrLimiter);
      return;
    }

    if (path === '/api/pr-review') {
      void handlePrReview(req, res, deps.prReview, headers);
      return;
    }

    if (path === '/api/pr-review/execute') {
      void handlePrReviewExecute(req, res, deps.prReviewExecute, headers, prReviewLimiter);
      return;
    }

    if (path === '/api/issue-triage') {
      void handleIssueTriage(req, res, deps.issueTriage, headers);
      return;
    }

    if (path === '/api/issue-triage/execute') {
      void handleIssueTriageExecute(req, res, deps.issueTriageExecute, headers, issueTriageLimiter);
      return;
    }

    if (path === '/api/pool-client') {
      void handlePoolClient(req, res, deps.poolClient, headers);
      return;
    }

    if (path === '/api/pool-client/execute') {
      void handlePoolClientExecute(req, res, deps.poolClientExecute, headers, poolClientLimiter);
      return;
    }

    if (path === '/api/publicity') {
      void handlePublicity(req, res, deps.publicity, headers);
      return;
    }

    if (path === '/api/report-from-here') {
      void handleReportFromHere(req, res, deps.reportFromHere, headers);
      return;
    }

    if (path === '/api/report-from-here/execute') {
      void handleReportFromHereExecute(
        req,
        res,
        deps.reportFromHereExecute,
        headers,
        reportFromHereLimiter,
      );
      return;
    }

    if (path === '/api/control/execute') {
      void handleControlExecute(req, res, deps.controlExecute, headers, controlLimiter);
      return;
    }

    if (path === '/api/docs') {
      handleDocs(req, res, { list: deps.docsList, read: deps.docRead }, headers, 'list');
      return;
    }

    if (path === '/api/file') {
      handleDocs(req, res, { list: deps.docsList, read: deps.docRead }, headers, 'read');
      return;
    }

    if (path === '/api/browse-folder') {
      handleBrowseFolder(req, res, deps.browseFolder, headers);
      return;
    }

    if (path === '/api/project/delete') {
      void handleProjectAction(
        req,
        res,
        deps.deleteProject,
        headers,
        'removed',
        'delete unavailable',
      );
      return;
    }

    if (path === '/api/project/reset') {
      void handleProjectAction(req, res, deps.resetProject, headers, 'reset', 'reset unavailable');
      return;
    }

    if (path === '/api/project/soul-reviewed') {
      void handleProjectAction(
        req,
        res,
        deps.markSoulReviewed,
        headers,
        'reviewed',
        'soul-reviewed unavailable',
      );
      return;
    }

    if (path === '/api/project/soul-propose') {
      void handleSoulPropose(req, res, deps.proposeSoulAmendment, headers);
      return;
    }

    if (path === '/api/project/soul-ratify') {
      void handleProjectAction(
        req,
        res,
        deps.ratifySoulAmendment,
        headers,
        'ratified',
        'soul-ratify unavailable',
      );
      return;
    }

    if (path === '/api/project/soul-dismiss') {
      void handleProjectAction(
        req,
        res,
        deps.dismissSoulProposal,
        headers,
        'dismissed',
        'soul-dismiss unavailable',
      );
      return;
    }

    if (path === '/api/project/soul-unratify') {
      void handleProjectAction(
        req,
        res,
        deps.unratifySoulAmendment,
        headers,
        'unratified',
        'soul-unratify unavailable',
      );
      return;
    }

    if (path === '/api/fleet/wisdom-ratify') {
      void handleFleetWisdomAction(
        req,
        res,
        deps.ratifyFleetWisdom,
        headers,
        'ratified',
        'fleet wisdom-ratify unavailable',
      );
      return;
    }

    if (path === '/api/fleet/wisdom-dismiss') {
      void handleFleetWisdomAction(
        req,
        res,
        deps.dismissFleetWisdom,
        headers,
        'dismissed',
        'fleet wisdom-dismiss unavailable',
      );
      return;
    }

    if (path === '/api/inbox/add') {
      void handleInboxAdd(req, res, deps.inboxAdd, headers);
      return;
    }

    if (path === '/api/ask/stream') {
      void handleAskStream(req, res, deps.askStream, headers, askLimiter);
      return;
    }

    if (path === '/api/ask') {
      void handleAsk(req, res, deps.ask, headers, askLimiter);
      return;
    }

    if (path.startsWith('/api/task/')) {
      const action = path.slice('/api/task/'.length);
      if (
        action === 'create' ||
        action === 'status' ||
        action === 'focus' ||
        action === 'reorder' ||
        action === 'unpin' ||
        action === 'delete'
      ) {
        void handleTasks(req, res, deps.tasks, headers, action);
        return;
      }
    }

    if (
      path === '/api/connection' ||
      path === '/api/connection/login' ||
      path === '/api/connection/test'
    ) {
      const action: ConnectionAction = path.endsWith('/login')
        ? 'login'
        : path.endsWith('/test')
          ? 'test'
          : 'status';
      void handleConnection(req, res, deps.connection, headers, action);
      return;
    }

    if (path === '/api/connection/gh') {
      void handleGhStatus(req, res, deps.gh, headers);
      return;
    }

    if (path === '/api/connection/gh-lts') {
      void handleGhLts(req, res, deps.ghLts, headers, ghLtsLimiter);
      return;
    }

    const response = handleRoute(path, deps);
    res.writeHead(response.status, { 'Content-Type': response.contentType, ...headers });
    res.end(response.body);
  });
}
