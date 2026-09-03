// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { existsSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { cpus, freemem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, DEFAULT_PORT, LOOPBACK_HOST } from './server.js';
import { openBrowser } from '../browser.js';
import { resolveDbPath } from '../read/config.js';
import { readFleetFromStore } from '../read/source.js';
import { readPipelineSpans } from '../read/pipeline-spans.js';
import { spansToGraph } from '../read/pipeline-graph.js';
import { renderPipelinePanel } from '../web/pipeline-panel.js';
import {
  readSearchFromStore,
  gatherAskSources,
  gatherProjectMap,
  gatherProjectRoot,
  gatherLiveState,
  listProjectDocs,
  readProjectDoc,
  readLandingInfo,
  readRoundInfo,
  readBacklogCandidates,
  readReleaseInfo,
  readCoordinationState,
  readFiringsPage,
  readFiringActivity,
  readFiringDiff,
  readFlightLogForProject,
} from '../read/project-detail.js';
import {
  deleteProjectFromStore,
  resetProjectTelemetryInStore,
  markSoulReviewedInStore,
  proposeSoulAmendmentInStore,
  ratifySoulAmendmentInStore,
  dismissSoulProposalInStore,
  unratifySoulAmendmentInStore,
  ratifyFleetWisdomAmendmentInStore,
  dismissFleetWisdomProposalInStore,
  createTaskInStore,
  setTaskStatusInStore,
  deleteTaskInStore,
  setTaskFocusInStore,
  reorderTasksInStore,
  unpinTasksInStore,
  ensureStoreMigrated,
  requestFlightPauseInStore,
  isProjectPausedInStore,
} from '../read/mutate.js';
import {
  createLandingExecuteApi,
  createOutOfBandLandGateCheck,
  createRealE2eLandGuard,
  type SelfRestart,
} from '../landing/execute.js';
import { createLandingJobRegistry } from '../landing/job.js';
import { readRecentLandingOutcome } from '../landing/history.js';
import { createBuildRunner, createSelfRestartTrigger } from '../landing/self-restart.js';
import { waitForHealth } from '../ready.js';
import { createReleaseExecuteApi } from '../release/execute.js';
import { createGithubSyncExecuteApi } from '../github/execute.js';
import { createGithubIssueExecuteApi } from '../github/issue-execute.js';
import { createGithubPrExecuteApi } from '../github/pr-execute.js';
import { createInboxAddApi } from '../inbox/add.js';
import {
  fetchOpenPrCandidateReport,
  annotateAlreadyApplied,
  annotateReviewThreads,
  planPrReviewBatch,
} from '../flight/pr-review.js';
import { createPrReviewExecuteApi } from '../flight/pr-review-execute.js';
import {
  createIssueTriagePreviewApi,
  createIssueTriageExecuteApi,
} from '../flight/issue-triage-execute.js';
import {
  createPoolClientPreviewApi,
  createPoolClientExecuteApi,
} from '../flight/pool-client-execute.js';
import {
  createReportFromHerePreviewApi,
  createReportFromHereExecuteApi,
} from '../flight/report-from-here-execute.js';
import { createPublicityPreviewApi } from '../flight/publicity.js';
import { createControlExecuteApi } from '../flight/control-execute.js';
import { ensureSelfOnboarded } from './self-onboard.js';
import { listBrowsableFolder } from './browse-folder.js';
import { DashboardControl } from '../control/control.js';
import { reconcileOrphanedFlights, createBootReconcileControl } from '../control/boot-reconcile.js';
import { FlightRunnerRegistry } from '../flight/registry.js';
import { createFlightApi } from '../flight/flight-api.js';
import { createFleetLaunchApi } from '../flight/fleet-launch-api.js';
import { createSpawnFlight } from '../flight/spawn-flight.js';
import {
  deriveFlyProjectId,
  flightLogFileName,
  askEscalationGuardSettingsFileName,
  readFlightOwnerPid,
} from '../flight/lock.js';
import { luckyPlan, type LuckyProbe } from '../flight/lucky-plan.js';
import { adoptFlight, realAdoptFlightDeps } from '../flight/adopt.js';
import { otlpConfigFromEnv } from '../flight/otlp.js';
import { askProject, askProjectStream, type AskEscalationDeps } from '../ask/service.js';
import { readConnectionConfig } from '../connection/config.js';
import {
  resolveClaudeEnv,
  ClaudeCliModel,
  StreamingClaudeCliModel,
  DEFAULT_ENGINE_CONFIG,
  modelForTier,
  tierForSubstepKind,
  buildAskEscalationConfig,
  buildFlightSettings,
  guardHookScriptPath,
} from '@autopilot/engine';
import { realCliExec, makeCliExec } from '../connection/cli-probe.js';
import { launchClaudeLogin } from '../connection/login.js';
import { claudeAuthProbe } from '../connection/verify.js';
import { getGhStatus } from '../connection/gh-probe.js';
import { createLtsStatusApi } from '../connection/gh-lts.js';
import { PRODUCT_VERSION, UPSTREAM_REPO } from '../info.js';
import {
  getConnectionStatus,
  applyConnection,
  testConnection,
  type ConnectionDeps,
} from '../connection/service.js';

const PROBE_TIMEOUT_MS = 120_000;

/** Entry point: bind the read-only dashboard to loopback and print its URL. */
const port = Number(process.env['AUTOPILOT_DASHBOARD_PORT'] ?? DEFAULT_PORT);
// Operator-set concurrency cap (PARALLEL FLIGHTS 5/6, "shared-quota
// fairness" — docs/epics/0001-parallel-flights.md): the shared subscription
// quota is a real, finite budget, so an unbounded fleet of simultaneous
// flights would silently multiply spend pressure. Unset (or not a positive
// integer) keeps today's unbounded behavior — the operator opts IN to a cap.
const maxConcurrentFlightsEnv = Number(process.env['AUTOPILOT_MAX_CONCURRENT_FLIGHTS']);
const maxConcurrentFlights =
  Number.isInteger(maxConcurrentFlightsEnv) && maxConcurrentFlightsEnv > 0
    ? maxConcurrentFlightsEnv
    : Infinity;
const dbPath = resolveDbPath();
ensureStoreMigrated(dbPath); // older DBs gain this build's columns before any read
// Self-host: the folder the dashboard is running in becomes a project the
// first time it boots there, so a fresh clone always has itself available to
// continue development on — no manual `dashboard:fly` first. `readState`
// below reads the store fresh per request, so this can safely finish in the
// background instead of delaying the first paint.
void ensureSelfOnboarded(dbPath, process.cwd()).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[self-onboard] skipped: ${message}\n`);
});
const connectionDeps: ConnectionDeps = {
  configPath: join(dirname(dbPath), 'connection.json'),
  exec: realCliExec,
  // The definitive probe runs `claude -p` under the chosen auth (env resolved so
  // a stray API key can't hijack a subscription test).
  probe: (config) =>
    claudeAuthProbe(makeCliExec(resolveClaudeEnv(config, process.env), PROBE_TIMEOUT_MS)),
};
// The "fly this folder" registry — one FlightRunner PER folder (PARALLEL
// FLIGHTS 3/6, docs/epics/0001-parallel-flights.md): two DIFFERENT folders
// each spawn and fly concurrently; a second flight against the SAME folder is
// still refused, delegated to that folder's own runner. Each spawns the
// compiled `fly` entry (one dir up from server/) as an isolated child sharing
// this process's cwd — so every flight writes to the SAME store the dashboard
// reads, and the SSE stream surfaces it live.
const flyEntry = fileURLToPath(new URL('../fly.js', import.meta.url));
// One log file PER folder (PARALLEL FLIGHTS 4/6) — keyed the same
// deterministic way as the per-project engine lock (flight/lock.ts) so two
// concurrent flights against different folders never interleave their
// output into a shared file with no way to attribute a line to either one.
// PARALLEL UNLOCK C: an `instanceId` folds into the SAME key `fly.ts` itself
// derives for its lock/worktree, so two instances of the SAME folder each
// get their own log file too.
const flightLogPathFor = (folder: string, instanceId?: string): string =>
  join(dirname(dbPath), flightLogFileName(deriveFlyProjectId(folder), instanceId));
const flightRegistry = new FlightRunnerRegistry(
  {
    // Detached + unref'd (flight/spawn-flight.ts, FLIGHT PROCESS DECOUPLING,
    // web-msp5g6lw-cvmr8n): a flight is a long-lived, quota-spending child that
    // must outlive this server — a crash, an operator stop, or
    // landing/self-restart.ts's own process.exit() after a self-landed rebuild
    // must never take it down too.
    spawnFlight: createSpawnFlight(flyEntry, flightLogPathFor),
    folderExists: existsSync,
    // A relative name (e.g. "AUTOPILOT") resolves against the dashboard's folder,
    // and an absolute path passes through — so the "folder not found" message is
    // honest and points at a real path.
    resolveFolder: (folder) => resolve(process.cwd(), folder),
    now: Date.now,
    // Graceful PAUSE: the running flight is a separate process, so the request
    // (and its eventual honoring) round-trips through the shared store rather
    // than any in-memory channel — same store the flight itself already writes
    // its own status transitions to (apps/dashboard/src/fly.ts).
    requestPause: (folder) => requestFlightPauseInStore(dbPath, folder),
    isPaused: (folder) => isProjectPausedInStore(dbPath, folder),
  },
  maxConcurrentFlights,
);

// BOOT-TIME ORPHAN RECONCILIATION (docs/RUNBOOK.md §4, "Recovery: a flight
// died without releasing 'flying'"): every dashboard boot gets a brand-new,
// empty `flightRegistry` above, so a project left 'flying' by a flight that
// died before this restart — or by the dashboard's OWN previous process
// dying/restarting mid-flight — has no in-memory record backing it. A dead
// lock owner is reconciled back to 'registered' immediately. A still-alive
// one is genuinely running (`flight/spawn-flight.ts` spawns `detached: true`
// for exactly this reason) and must never be disturbed — but it's now
// ADOPTED into `flightRegistry` (`flight/adopt.ts`) so Stop/Pause against it
// actually work instead of reporting "no flight is running" for a project
// the store still (correctly) shows 'flying'.
{
  const { reconciled, stillAlive } = reconcileOrphanedFlights(createBootReconcileControl(dbPath));
  for (const project of reconciled) {
    process.stdout.write(
      `[boot-reconcile] ${project.name} (${project.id}) was stuck 'flying' with no live owner — reset to 'registered'.\n`,
    );
  }
  for (const project of stillAlive) {
    const pid = readFlightOwnerPid(dirname(dbPath), project.root_path);
    if (pid !== null) {
      flightRegistry.adopt(project.root_path, adoptFlight(pid, realAdoptFlightDeps));
      process.stdout.write(
        `[boot-reconcile] ${project.name} (${project.id}) is 'flying' with a live owner pid ${pid} — adopted so Stop/Pause work against it. See docs/RUNBOOK.md §4.\n`,
      );
    } else {
      process.stdout.write(
        `[boot-reconcile] ${project.name} (${project.id}) is 'flying' with a live owner pid — left untouched. See docs/RUNBOOK.md §4 to confirm/kill it by hand if this is unexpected.\n`,
      );
    }
  }
}

// Ask-your-project's model config: ONE tool-less call on the user's own auth,
// small turn/budget caps. Shared by the buffered (`ask`) and streaming
// (`askStream`) endpoints — same grounding, only the transport differs.
// Routed through the cost-aware tier table (M6, ENGINE-RESEARCH I2) like the
// board-TRIAGE substep, not a raw hardcoded string — 'ask' is a 'cheap'-tier
// SubstepKind, so this resolves to the same haiku as before by default while
// letting the routing config stay the one tuning point.
const askModel = modelForTier(tierForSubstepKind('ask'), DEFAULT_ENGINE_CONFIG.routing);
const askEngineConfig = {
  ...DEFAULT_ENGINE_CONFIG,
  primaryModel: askModel,
  fallbackModel: 'sonnet',
  maxTurns: 2,
  maxBudgetUsd: 0.5,
  allowedTools: [],
  disallowedTools: ['*'],
};
const askAuth = () => readConnectionConfig(join(dirname(dbPath), 'connection.json'));

// Ask escalation tier (epic 0012 slice 2, `docs/epics/0012-agentic-ask-
// escalation.md`): overlays the read-only Read/Grep/Glob posture
// (`packages/engine/src/ask-escalation.ts`) onto tier 1's own model/auth
// choice — everything but tool grant/turns/budget passes through unchanged.
const askEscalationEngineConfig = buildAskEscalationConfig(askEngineConfig);

/**
 * Builds the escalation dep for one question's project, deferring ALL real
 * work (root lookup, guard-settings write, CLI spawn) into `invoke` itself —
 * this is constructed on EVERY `ask`/`askStream` call, but `invoke` only
 * actually runs when `askProject`/`askProjectStream` hit the empty-sources
 * automatic trigger or the manual Deep-toggle trigger (epic 0012 slice 3), so
 * a sourced non-Deep question (the common case) never pays for an unused
 * write. Resolves the project's `root_path` fresh per call so the escalation
 * session's CLI `cwd` and containment `targetRoot` (belt-and-suspenders
 * alongside the Read/Grep/Glob-only tool grant, same guard mechanism a
 * flight's own containment uses) both target the actual project being asked
 * about — never the dashboard's own folder. Degrades to `null` (matching
 * `invoke`'s existing quota/error contract) when the project's root can't be
 * resolved, rather than escalating blind. Always spawns via
 * `StreamingClaudeCliModel` (not the plain `ClaudeCliModel` tier 1 uses) so
 * an `onActivity` callback CAN relay the session's live Read/Grep/Glob tool
 * use — `askProject`'s non-streaming call site simply omits it, so the
 * spawn behaves identically to before (no `--include-partial-messages`,
 * one resolved envelope) whenever nothing is listening.
 */
function askEscalationDepsFor(projectId: string): AskEscalationDeps {
  return {
    invoke: async (prompt, onActivity) => {
      const root = gatherProjectRoot(dbPath, projectId);
      if (!root) return null;
      const guardSettingsPath = join(
        dirname(dbPath),
        askEscalationGuardSettingsFileName(projectId),
      );
      writeFileSync(
        guardSettingsPath,
        `${JSON.stringify(buildFlightSettings(root, guardHookScriptPath()), null, 2)}\n`,
      );
      const model = new StreamingClaudeCliModel({
        repo: root,
        config: askEscalationEngineConfig,
        auth: askAuth(),
        settingsPath: guardSettingsPath,
        // exactOptionalPropertyTypes: onActivity may be omitted, but the key
        // itself must never be present holding `undefined` — the non-Deep,
        // non-streaming `ask` call site passes no onActivity at all.
        ...(onActivity ? { onActivity } : {}),
      });
      const res = await model.invoke(askModel, prompt);
      return res.envelope?.isError === false ? res.envelope.result : null;
    },
  };
}

// Landing EXECUTE's rebuild+restart half (web-msnqeegt-ki7dm0): only fires
// when the LANDED project is this very folder (self-hosting/dogfooding — see
// landing/self-restart.ts). `.autopilot-run` + this file's own path mirror
// exactly what `dashboard:restart`'s CLI (control/cli.ts) uses, so the
// respawned process finds/writes the same run record the CLI would.
const dashboardControl = new DashboardControl({
  stateDir: join(process.cwd(), '.autopilot-run'),
  serverEntry: fileURLToPath(import.meta.url),
  port,
  nodeBin: process.execPath,
});
// `.current` is populated once `server` binds below — `stopSelf` is only
// ever invoked well after boot (fire-and-forget, post-build), so the forward
// reference is always populated by the time it runs. A holder object (not a
// reassigned `let`) so the binding itself stays a `const`.
const liveServer: { current: Server | undefined } = { current: undefined };
const selfRestart: SelfRestart = {
  root: process.cwd(),
  trigger: createSelfRestartTrigger(
    createBuildRunner(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['run', 'build'],
      process.cwd(),
    ),
    {
      // In-process socket close — NOT a signal. Self-signalling here would
      // race: `start()` would spawn the replacement before our own SIGTERM
      // handler ever got a chance to run, so it would always hit
      // EADDRINUSE on the still-bound port (web-msorbwfl-zzcw87).
      stopSelf: () =>
        new Promise<void>((resolve) => {
          const srv = liveServer.current;
          if (!srv) {
            resolve();
            return;
          }
          srv.close(() => resolve());
          // `close()` alone waits for every ACTIVE connection to end — and the
          // dashboard's SSE streams are immortal while an operator tab is
          // open, so the swap would hang on the very person watching it.
          // Destroy them: the client's EventSource reconnects to the
          // replacement on its own.
          srv.closeAllConnections();
        }),
      // replace: the caller IS the recorded live server — the plain start()
      // would see its own pid alive, reuse, and spawn nothing (the
      // thrice-observed "respawned server never answered" field failure).
      start: () => dashboardControl.start({ replace: true }),
    },
    {
      // A fresh boot runs migrations + self-onboard before it can answer —
      // the 5s default window was the last remaining way this swap could
      // report failure on a healthy replacement.
      verifyHealth: (url) => waitForHealth(`${url}/api/health`, { timeoutMs: 30_000 }),
    },
  ),
};

// Env-driven OTLP export status (see flight/otlp.ts, used per-flight by fly.ts)
// surfaced fleet-wide so the operator can see it's on without digging through
// firing logs. Computed once — env vars don't change over the process's life.
const otlpConfigured = otlpConfigFromEnv(process.env) !== null;

// Read the store fresh per request so a project onboarded AFTER the dashboard
// started shows up live (the file may not even exist yet at boot).
const flightApi = createFlightApi(flightRegistry);

// DURABLE LANDING JOBS (operator directive 2026-08-30, see landing/job.ts):
// the LAND button's whole story — live gate step, the self-healing wait for a
// running flight, and the final verdict — lives in this registry rather than
// in one browser's pending fetch, which a panel re-render routinely outlived.
//
// `landingJobs` and the execute API each need the other (execute reports gate
// progress INTO the registry; the registry calls execute to do the work), so
// the progress hook closes over the binding and reads it at call time — by
// then both are constructed, and a stray early call would simply find
// `undefined` and report nothing rather than throw.
const landingExecuteApi = createLandingExecuteApi(
  dbPath,
  selfRestart,
  (folder) => flightRegistry.status(folder).running,
  createOutOfBandLandGateCheck(dbPath),
  // Pre-land e2e guard (operator decision 09-02, option A of ADR-0008,
  // fleet-7's slice): a red converged-branch e2e verdict refuses the land
  // before the gate even runs — wired here so every path through the job
  // registry gets it, manual press and watchdog alike.
  createRealE2eLandGuard(),
  (projectId, event) => landingJobs.onGateProgress(projectId, event),
);
const landingJobs = createLandingJobRegistry({
  execute: landingExecuteApi,
  // The registry speaks project ids; the flight registry and the pause
  // channel both speak folders — resolve fresh per call, same
  // read-the-store-per-request stance as every other project-scoped dep here.
  isFlightRunning: (projectId) => {
    const root = gatherProjectRoot(dbPath, projectId);
    return root === null ? false : flightRegistry.status(root).running;
  },
  requestPause: (projectId) => {
    const root = gatherProjectRoot(dbPath, projectId);
    if (root !== null) requestFlightPauseInStore(dbPath, root);
  },
  // Survives this process: a green self-hosted land restarts the dashboard,
  // so the successor answers from the `landed` events row the land itself
  // wrote rather than from the memory it never inherited.
  recentOutcome: (projectId) => readRecentLandingOutcome(dbPath, projectId, Date.now()),
});
/** One os.cpus() snapshot folded to (busy, total) tick sums across cores. */
function cpuTicks(): { busy: number; total: number } {
  let busy = 0;
  let total = 0;
  for (const cpu of cpus()) {
    const t = cpu.times;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
    busy += t.user + t.nice + t.sys + t.irq;
  }
  return { busy, total };
}

/** Whole-machine CPU load (0-100) from a two-sample os.cpus() delta —
 *  cross-platform (Windows has no loadavg), no child process to spawn. */
async function measureCpuLoadPct(sampleMs = 150): Promise<number> {
  const before = cpuTicks();
  await new Promise((r) => setTimeout(r, sampleMs));
  const after = cpuTicks();
  const total = after.total - before.total;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (100 * (after.busy - before.busy)) / total));
}

const server = createServer({
  readState: () => ({ ...readFleetFromStore(dbPath, Date.now()), otlpConfigured }),
  // The Fly bar's 🍀 "I'm feeling lucky" button (GET /api/lucky): assemble
  // the live probe — CPU/RAM/cores from the OS, running flights from the
  // registry, queued tasks from the target folder's board via the same
  // readFleetFromStore read /api/state serves — and roll
  // flight/lucky-plan.ts's calibrated launch plan from it. Read-only; the
  // plan fills the Fly bar and the launch click stays the operator's.
  lucky: async (folder) => {
    const target = resolve(folder ?? flightApi.defaultFolder?.() ?? process.cwd());
    const projectId = deriveFlyProjectId(target);
    const fleet = readFleetFromStore(dbPath, Date.now());
    const project = fleet.projects.find((p) => p.id === projectId);
    const queuedTasks = project ? project.tasks.filter((t) => t.status === 'queued').length : 0;
    const flights = flightApi.statusAll?.() ?? [];
    const runningFlights = flights.filter((f) => f.running || f.queued).length;
    const probe: LuckyProbe = {
      cpuLoadPct: await measureCpuLoadPct(),
      logicalCores: cpus().length,
      freeRamGb: freemem() / 1024 ** 3,
      queuedTasks,
      runningFlights,
    };
    return { probe, plan: luckyPlan(probe) };
  },
  flight: flightApi,
  // The Fly bar's Lanes field (board web-mtdcfel4-0bxf4h): the same
  // hub-aware partitioned launch `dashboard fleet` gives the CLI
  // (control/cli.ts's `case 'fleet'`), wired for `POST /api/fleet` instead —
  // `postFly` calls `flightApi.start` directly since this IS the live
  // server process, unlike the CLI's loopback HTTP call to a separate one.
  fleetLaunch: createFleetLaunchApi(
    dbPath,
    (body) => flightApi.start(body),
    Number(process.env['AUTOPILOT_FLEET_STAGGER_MS'] ?? 20_000),
  ),
  search: (projectId, query, limit) => readSearchFromStore(dbPath, projectId, query, limit),
  deleteProject: (projectId) => deleteProjectFromStore(dbPath, projectId),
  resetProject: (projectId) => resetProjectTelemetryInStore(dbPath, projectId),
  markSoulReviewed: (projectId) => markSoulReviewedInStore(dbPath, projectId, Date.now()),
  proposeSoulAmendment: (projectId, text) =>
    proposeSoulAmendmentInStore(dbPath, projectId, text, Date.now()),
  ratifySoulAmendment: (projectId) => ratifySoulAmendmentInStore(dbPath, projectId, Date.now()),
  dismissSoulProposal: (projectId) => dismissSoulProposalInStore(dbPath, projectId, Date.now()),
  unratifySoulAmendment: (projectId) => unratifySoulAmendmentInStore(dbPath, projectId, Date.now()),
  ratifyFleetWisdom: () => ratifyFleetWisdomAmendmentInStore(dbPath),
  dismissFleetWisdom: () => dismissFleetWisdomProposalInStore(dbPath),
  flightLog: (projectId) => readFlightLogForProject(dbPath, projectId),
  docsList: (projectId) => listProjectDocs(dbPath, projectId),
  docRead: (projectId, path) => readProjectDoc(dbPath, projectId, path),
  browseFolder: (path) => listBrowsableFolder(path),
  landing: (projectId) => readLandingInfo(dbPath, projectId),
  // Every LAND press goes through the job registry, never straight at the
  // execute API: it dedupes a double-press onto the one running gate (two
  // concurrent merges into the same base is the exact git race the
  // flight-running refusal exists to prevent) and keeps the operator's intent
  // alive across a self-healing wait. The response shape is unchanged.
  landingExecute: (projectId) => landingJobs.start(projectId),
  landingJob: (projectId) => landingJobs.stateOf(projectId),
  round: (projectId) => readRoundInfo(dbPath, projectId),
  backlog: (projectId) => readBacklogCandidates(dbPath, projectId),
  coordination: (projectId) => readCoordinationState(dbPath, projectId),
  release: (projectId) => readReleaseInfo(dbPath, projectId),
  releaseExecute: createReleaseExecuteApi(dbPath),
  githubSyncExecute: createGithubSyncExecuteApi(dbPath),
  githubIssueExecute: createGithubIssueExecuteApi(),
  githubPrExecute: createGithubPrExecuteApi(dbPath),
  firingsPage: (projectId, offset) => readFiringsPage(dbPath, projectId, offset),
  // D4 pipeline view (epic 0015, web-mtdc6wq3-5wuc6i): the pure chain composed
  // at the root — span source → graph model → panel markup. The handler has
  // already narrowed every query field to the chain's own unions.
  pipelinePanel: (projectId, query) => {
    const spans = readPipelineSpans(dbPath, projectId);
    if (spans === null) return null;
    return renderPipelinePanel(spansToGraph(spans, { lens: query.lens, mode: query.mode }), {
      layout: query.layout,
      selectedId: query.selected,
      lens: query.lens,
    });
  },
  firingActivity: (projectId, firingId) => readFiringActivity(dbPath, projectId, firingId),
  firingDiff: (projectId, firingId) => readFiringDiff(dbPath, projectId, firingId),
  inboxAdd: createInboxAddApi(dbPath),
  // KEEPER REVIEW ritual (epic 0007, "PLATFORM 4/7"): reads/acts on the ONE
  // canonical repo this dashboard process itself runs in — no project id, gh
  // resolves the repo from the process's own cwd/remote, same as `gh pr list`
  // run by hand here would.
  prReview: async () => {
    // Failure-honest read: a gh outage reports fetchFailed instead of
    // masquerading as a confirmed-empty queue (see PrReviewCandidateReport).
    const report = await fetchOpenPrCandidateReport(realCliExec);
    // Diff verdicts first, then the review-thread sweep (one `gh api graphql`
    // read, spent only when some candidate would otherwise merge) — the same
    // order the execute re-derive runs them in.
    const assessed = await annotateReviewThreads(
      await annotateAlreadyApplied(report.candidates, realCliExec),
      realCliExec,
    );
    return {
      plans: planPrReviewBatch(assessed),
      ...(report.fetchFailed ? { fetchFailed: true as const } : {}),
    };
  },
  prReviewExecute: createPrReviewExecuteApi(),
  // KEEPER TRIAGE ritual (epic 0007, "PLATFORM 3/7"): project-scoped — dedups
  // an incoming issue against that project's own open board tasks + backlog
  // file, unlike KEEPER REVIEW's single canonical repo above.
  issueTriage: createIssueTriagePreviewApi(dbPath),
  issueTriageExecute: createIssueTriageExecuteApi(dbPath),
  // Pool client (epic 0007, "PLATFORM 6/7"): browse stays project-agnostic,
  // own-gh-identity shape as KEEPER REVIEW above — a co-pilot browses pool
  // issues for themselves, not on behalf of a stored project. Claiming can
  // now also queue a local board task on an operator-chosen project (the
  // "fly locally" leg's HTTP half), so execute is handed `dbPath`.
  poolClient: createPoolClientPreviewApi(),
  poolClientExecute: createPoolClientExecuteApi(dbPath),
  // Report-from-here ritual (epic 0007, "PLATFORM 5/7") — the CSRF-guarded
  // HTTP pair behind `flight/report-from-here.ts`'s pure decision core; no
  // shell-side capture wiring or operator panel calls these yet (deferred to
  // a later slice), same "building block ahead of its UI" stance the apply
  // layer shipped with.
  reportFromHere: createReportFromHerePreviewApi(),
  reportFromHereExecute: createReportFromHereExecuteApi(dbPath),
  // Publicity affordances (epic 0007, "PLATFORM 7/7") — repo/watch/star/
  // discussions links, dormant while the repo stays private; read-only, no
  // execute pair (each affordance is an outbound link, never a `gh` write).
  publicity: createPublicityPreviewApi(),
  // ARCHITECT chat v2 slice 1 (docs/epics/0011-architect-chat-v2.md) — the
  // in-process control-tool dispatcher; no UI consumer yet (slices 2-3).
  controlExecute: createControlExecuteApi(dbPath),
  tasks: {
    create: (input) =>
      createTaskInStore(dbPath, {
        id: `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        projectId: input.project,
        title: input.title,
        severity: input.severity ?? null,
        dimension: input.dimension ?? null,
        createdAt: Date.now(),
      }),
    setStatus: (id, status) => setTaskStatusInStore(dbPath, id, status, Date.now()),
    remove: (id) => deleteTaskInStore(dbPath, id),
    setFocus: (id, focus) => setTaskFocusInStore(dbPath, id, focus, Date.now()),
    reorder: (project, ids) => reorderTasksInStore(dbPath, project, ids, Date.now()),
    unpin: (project, ids) => unpinTasksInStore(dbPath, project, ids, Date.now()),
  },
  // Ask-your-project: retrieve → injection-defended prompt → ONE tool-less model
  // call on the user's own auth. Small turn/budget caps; no tools at all.
  ask: (projectId, question, history, view, deep, persona) =>
    askProject(
      {
        sources: (pid, q) => gatherAskSources(dbPath, pid, q),
        projectMap: (pid) => gatherProjectMap(dbPath, pid),
        liveState: (pid) => gatherLiveState(dbPath, pid),
        invoke: async (prompt) => {
          const model = new ClaudeCliModel({
            repo: process.cwd(),
            config: askEngineConfig,
            auth: askAuth(),
          });
          const res = await model.invoke(askModel, prompt);
          return res.envelope?.isError === false ? res.envelope.result : null;
        },
        escalation: askEscalationDepsFor(projectId),
      },
      projectId,
      question,
      history,
      view,
      deep,
      persona,
    ),
  // Same grounding as `ask`, but relays the answer live as it streams (feeds
  // the `/api/ask/stream` SSE endpoint) instead of resolving all at once.
  // `onActivity` (epic 0012 slice 3) relays the escalation session's live
  // Read/Grep/Glob tool use — passed straight through to `askEscalationDepsFor`'s
  // `invoke`, which is the only dep that actually reads it. `persona`
  // (ARCHITECT chat v2 slice 3) threads the operator's persona choice into
  // the service layer, which appends the control-proposal addendum and lifts
  // a proposed action out of the answer when it's `'architect'`.
  askStream: (projectId, question, onChunk, history, view, deep, onActivity, persona) =>
    askProjectStream(
      {
        sources: (pid, q) => gatherAskSources(dbPath, pid, q),
        projectMap: (pid) => gatherProjectMap(dbPath, pid),
        liveState: (pid) => gatherLiveState(dbPath, pid),
        invokeStream: async (prompt, onText) => {
          const model = new StreamingClaudeCliModel({
            repo: process.cwd(),
            config: askEngineConfig,
            auth: askAuth(),
            onText,
          });
          const res = await model.invoke(askModel, prompt);
          return res.envelope?.isError === false ? res.envelope.result : null;
        },
        escalation: askEscalationDepsFor(projectId),
      },
      projectId,
      question,
      onChunk,
      history,
      view,
      deep,
      onActivity,
      persona,
    ),
  connection: {
    getStatus: () => getConnectionStatus(connectionDeps),
    connect: (input) => applyConnection(connectionDeps, input),
    login: () => {
      // `setup-token` mints a FRESH 1-year token via browser OAuth — reliable even
      // when the stored login has expired. The user pastes it into token mode.
      launchClaudeLogin('setup-token');
      return Promise.resolve({
        launched: true,
        message:
          'A terminal opened running "claude setup-token" — authorize in the browser, then COPY the token it prints and paste it below.',
      });
    },
    test: () => testConnection(connectionDeps),
  },
  gh: {
    getStatus: () => getGhStatus(realCliExec),
  },
  ghLts: createLtsStatusApi(realCliExec, UPSTREAM_REPO, PRODUCT_VERSION),
});
liveServer.current = server;

server.listen(port, LOOPBACK_HOST, () => {
  const url = `http://${LOOPBACK_HOST}:${port}`;
  process.stdout.write(`AUTOPILOT dashboard → ${url}  (Ctrl+C to stop)\n`);
  // Foreground runs (`pnpm dashboard`) open the page; the detached service run by
  // the control CLI sets AUTOPILOT_NO_OPEN=1 so only the CLI opens it (once, after
  // a readiness check), never twice.
  if (process.env['AUTOPILOT_NO_OPEN'] !== '1') openBrowser(url);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
