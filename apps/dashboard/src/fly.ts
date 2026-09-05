// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `pnpm dashboard:fly <folder> [firings]` — the REAL live flight. Onboards the
 * target folder (backup MYTH/LEGACY/flight → detect gate → index → SOUL) and then
 * flies it with the **real Claude** (`StreamingClaudeCliModel` on your subscription
 * auth, streaming the agent's tool uses live into the activity log), the detected
 * gate via `GateRunner`, and the firing prompt. Every change is gated and additively
 * reverted on red; the backup happens BEFORE any work. This SPENDS subscription quota
 * and does real autonomous work — budget-capped and, by default, a single cautious firing.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join, basename } from 'node:path';
import {
  openStore,
  migrate,
  SqliteSearchStore,
  recentTasks,
  createTask,
  shippedSlicesByTask,
  setTaskStatus,
  reconcileShippedTasks,
  claimTask,
  releaseTaskClaim,
  releaseInstanceClaims,
  releaseStaleClaims,
  DEFAULT_STALE_CLAIM_MS,
  firingStats,
  nearMissDebriefEvents,
  getFleetWisdom,
} from '@autopilot/store';
import {
  runLoop,
  DEFAULT_ENGINE_CONFIG,
  INITIAL_RESILIENCE_STATE,
  GitVcs,
  SqliteFiringStore,
  SystemClock,
  StreamingClaudeCliModel,
  GateRunner,
  DynamicGate,
  RemediatingGate,
  deriveFormatFixCommand,
  buildFiringPrompt,
  buildRepoMapDigest,
  buildInboxDigest,
  tallyRecentFocusDirs,
  FIRING_PROMPT_VERSION,
  GitHeadReader,
  guardedPathsFor,
  snapshotGuardedHeads,
  detectContainmentBreaches,
  classifyBreaches,
  describeBreach,
  buildFlightSettings,
  guardHookScriptPath,
  FileInstanceLock,
  CliDescendantRegistry,
  reapCliDescendants,
  SqlitePacer,
  toOtlpResourceSpans,
  exportOtlpResourceSpans,
  classifyNoop,
  ensureWorktree,
  fastForwardWorktree,
  repoPrefixOf,
  syncWorktreeBranch,
  firingIdOf,
  scanUsagePoolListPriceUsd,
  type LoopDeps,
  type GatePort,
  type EngineConfig,
  type Activity,
  type ContainmentBreach,
} from '@autopilot/engine';
import {
  onboard,
  GitBackup,
  FsFileSource,
  SqliteIndexStore,
  SqliteProjectStore,
  readFsSnapshot,
  summarize,
  rankHotFiles,
  taskIdSource,
  type OnboardDeps,
  type GateSpec,
} from '@autopilot/onboarding';
import { gateCommands } from './gate-commands.js';
import { gateConvergedBranch } from './flight/convergence-gate.js';
import { resolveDbPath } from './read/config.js';
import { readConnectionConfig } from './connection/config.js';
import { taskEconomicsFromRows } from './flight/triage-factors.js';
import { runBoardTriage } from './flight/board-triage.js';
import { triageInboxEntries } from './flight/inbox-triage.js';
import { totalBudgetExhausted, FLY_MAX_TURNS, cliTimeoutMsFromEnv } from './flight/budget.js';
import { subscriptionPriceUsdFromEnv, usagePoolDirsFromEnv } from './flight/usage-pool-config.js';
import { verdictDeferTargetsForFiring } from './flight/completion.js';
import {
  out,
  markTaskDoneIfShipped,
  reconcileMidFlightStragglers,
  harvestProposals,
  readBacklogTitles,
  readInboxEntries,
  activityTrail,
} from './flight/firing-hooks.js';
import {
  isModelSubstitution,
  classifyTaskModelTier,
  resolvePrimaryModelForTier,
  budgetMultiplierForModel,
} from './flight/model-routing.js';
import { otlpConfigFromEnv } from './flight/otlp.js';
import { selfStudyInvocation, commitSelfStudyIfDirty } from './flight/self-study.js';
import { formatFlightDoneLine } from './flight/flight-summary.js';
import {
  deriveFlyProjectId,
  engineLockFileName,
  guardSettingsFileName,
  isAnyFlightLockLive,
} from './flight/lock.js';
import { verifyGuardSettings } from './flight/guard-verify.js';
import { deriveWorktreePlan } from './flight/worktree.js';
import { parseTaskScope, scopeFilterCandidates } from './flight/scope-partition.js';
import { withRitualLock, RITUAL_LOCK_FILE_NAME } from './flight/ritual-lock.js';
import {
  buildFleetDigest,
  claimSurvivesFiring,
  clearDeclaredIntent,
  detectIntentCollisions,
  likelyPrimaryPathFromTitle,
  readSiblingIntentClaims,
  writeDeclaredIntent,
} from './flight/fleet-digest.js';
import { isFocusBoundHere, orderClaimCandidatesFocusFirst } from './flight/focus.js';
import { fullGateSpec, perFiringGateSpec } from './flight/gate-schedule.js';
import { wasAutoformatRescued } from './read/fleet.js';
import {
  nearMissDebriefLine,
  detectRecurringNearMissClass,
  nearMissClassLabel,
  parseNearMissCounts,
  type NearMissCounts,
} from './flight/near-miss.js';
import {
  runReconciliationProposalSweep,
  runVerifyBySweep,
  runFamilyRunawaySweep,
  runDocFreshnessSweep,
  runClosedTaskAuditSweep,
  runSoulMiningSweep,
  runFleetWisdomSweep,
  runStoreBackupSweep,
} from './flight/post-flight-sweeps.js';
import { composeSoulWithFleetWisdom } from './flight/fleet-wisdom-mining.js';

const DEFAULT_FIRINGS = 1;
const FLY_BUDGET_USD = 2;
/** How many recent commits the REPO-MAP digest's "recent focus" tally scans. */
const REPO_MAP_COMMIT_WINDOW = 30;
/** How many hot files the REPO-MAP digest surfaces (largest first). */
const REPO_MAP_HOT_FILES_LIMIT = 8;

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    out('usage: pnpm dashboard:fly <folder> [firings]');
    out('  flies a REAL project with live Claude. Use a throwaway sandbox for the first run.');
    process.exitCode = 1;
    return;
  }
  const target = resolve(arg);
  const firings = Math.max(1, Number(process.argv[3] ?? DEFAULT_FIRINGS) || DEFAULT_FIRINGS);
  // PER-FIRING budget, uncapped above the floor — the founder's explicit call
  // (spend decisions are the operator's): each firing gets the full amount.
  const budgetUsd = Math.max(0.5, Number(process.argv[4] ?? FLY_BUDGET_USD) || FLY_BUDGET_USD);
  // TOTAL-SPEND mode (dashboard's fly-bar budget toggle): argv[5] present means
  // "keep firing until the remaining budget can't fund another firing" instead
  // of stopping at the fixed `firings` count (see FlightRunner.start()).
  const totalBudgetArg = process.argv[5];
  const totalBudgetUsd =
    totalBudgetArg !== undefined
      ? Math.max(budgetUsd, Number(totalBudgetArg) || budgetUsd)
      : undefined;
  if (!existsSync(target)) {
    out(`target folder not found: ${target}`);
    process.exitCode = 1;
    return;
  }

  // PARALLEL UNLOCK C (N-way same-folder spawn): set only by
  // `flight/spawn-flight.ts` when the dashboard registry launched this
  // child as one instance of a same-folder fleet — every other caller
  // (a bare `pnpm dashboard:fly`, the fleet watchdog) leaves it unset, so
  // this flight keeps deriving the exact single-instance lock/worktree/log
  // identity it always has.
  const instanceId = process.env['AUTOPILOT_FLIGHT_INSTANCE_ID']?.trim() || undefined;
  // PARALLEL UNLOCK C (board task-CLAIMING): a stable per-instance identity
  // for `claimTask`/`releaseTaskClaim` — the real instanceId for a same-folder
  // N-way fleet member, or 'solo' for every other caller (a bare
  // `pnpm dashboard:fly`, the fleet watchdog). 'solo' is exactly as safe as a
  // real id here: at most one un-instanced flight can ever hold the project's
  // bare engine lock at a time, so it never collides with itself — it only
  // starts mattering once a NAMED sibling instance is flying the same
  // project concurrently, which is the whole scenario this exists to guard.
  const instanceKey = instanceId ?? 'solo';
  // FLEET SCOPE PARTITIONER: the launcher-computed disjoint board scope for
  // this instance (comma-joined task ids), or null for every solo/
  // unpartitioned flight — see flight/scope-partition.ts.
  const fleetTaskScope = parseTaskScope(process.env['AUTOPILOT_FLEET_TASK_SCOPE']);

  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });

  // Per-project single-instance guard: FlightRunner already refuses a second
  // flight in-memory (apps/dashboard/src/flight/runner.ts), but that only
  // protects one server process. A stray `pnpm dashboard:fly` run from a
  // terminal, or two dashboard servers on the same store, would otherwise
  // race the same SQLite rows and target repo with zero protection. The
  // lockfile closes that gap across OS processes; a lock left by a dead
  // process (crash/kill) is reclaimed automatically
  // (packages/engine/src/adapters/instance-lock.ts). Keyed per PROJECT (not
  // per store) so two flights against two DIFFERENT projects never contend —
  // only a second flight against the SAME project is refused. The id is
  // derived the same deterministic way `onboard()` mints a first-time
  // project id, so it matches before onboarding ever runs.
  const lockProjectId = deriveFlyProjectId(target);
  const lock = new FileInstanceLock(
    join(dirname(dbPath), engineLockFileName(lockProjectId, instanceId)),
  );
  const lockResult = lock.acquire();
  if (!lockResult.acquired) {
    out(
      `⛔ another AUTOPILOT flight is already running (pid ${lockResult.holderPid ?? 'unknown'}) ` +
        `against this project — refusing to start a second one.`,
    );
    process.exitCode = 1;
    return;
  }

  // ORPHAN SWEEP crash-path follow-up (board ap-mt2ukjg5-2): reaps any CLI
  // descendant a flight process left running because IT died (crash,
  // SIGKILL, host reboot) before its own in-process settle callback
  // (packages/engine/src/adapters/claude-cli.ts) could reap it. Run once
  // here, at process startup, before this flight spawns any CLI child of
  // its own. Store-wide (not per-project, unlike the lock above) — a dead
  // flight's orphans belong to whatever project IT was flying, not
  // necessarily this invocation's target, and `sweepStale` already scopes
  // correctly by ownerPid, leaving a still-alive sibling's entries untouched.
  const pidRegistry = new CliDescendantRegistry(join(dirname(dbPath), 'cli-pid-registry'));
  const reapedOrphanCount = pidRegistry.sweepStale((pid) => reapCliDescendants(pid));
  if (reapedOrphanCount > 0) {
    out(`🧹 reaped ${reapedOrphanCount} orphaned CLI descendant pid(s) left by a crashed flight.`);
  }

  const auth = readConnectionConfig(join(dirname(dbPath), 'connection.json'));

  const store = openStore(dbPath);
  migrate(store);
  const now = (): number => Date.now();
  // Set inside the try block when a Pause request is honored (below) — read by
  // the finally block to land the project on 'paused' instead of 'registered'.
  let paused = false;
  // The onboarded project id, hoisted for the finally block's claim sweep —
  // null until onboarding succeeds (a flight that dies earlier never claimed
  // anything, so the sweep correctly skips).
  let claimSweepProjectId: string | null = null;

  try {
    // Onboard the target (idempotent) — backup BEFORE any work, detect the gate, index, SOUL.
    const onboardDeps: OnboardDeps = {
      vcs: new GitBackup(target),
      readSnapshot: (root) => readFsSnapshot(root),
      fileSource: new FsFileSource(target),
      indexStore: new SqliteIndexStore(store),
      contentIndex: new SqliteSearchStore(store), // make the repo searchable (M4 RAG)
      projects: new SqliteProjectStore(store, taskIdSource('task')),
      newId: () => lockProjectId,
    };
    out(`Onboarding ${target} (backup → detect gate → index)…`);
    const result = await onboard(onboardDeps, { root: target });
    const projectId = result.projectId;
    claimSweepProjectId = projectId;
    // Starting a flight always clears any stale pause request — a Pause click
    // whose hold already landed (project sitting on 'paused') must not
    // immediately re-pause the very next flight against the same project.
    store.db
      .prepare(
        "UPDATE projects SET status = 'flying', pause_requested = 0, updated_at = ? WHERE id = ?",
      )
      .run(now(), projectId);
    const soulRow = store.db.prepare('SELECT soul FROM projects WHERE id = ?').get(projectId) as
      { soul: string | null } | undefined;
    const soulOwn = soulRow?.soul ?? `# SOUL — ${basename(target)}`;
    // FLEET WISDOM consumption (board web-msnt26xe-pc4pzp): the firing prompt
    // sees the project's SOUL layered on RATIFIED fleet-wide wisdom — pending
    // proposals never reach a prompt. Read once per flight, same lifetime as
    // the SOUL itself; a mid-flight ratification lands on the next flight.
    const soul = composeSoulWithFleetWisdom(soulOwn, getFleetWisdom(store.db)?.wisdom ?? '');

    // Bash containment slice 3 (docs/epics/0004-bash-containment-worktree.md):
    // the model, gate, and firing-scoped git operations below run inside a
    // linked worktree — physically separate from `target` — instead of
    // target's own live checkout, so a `cd ..`-class Bash escape lands in
    // disposable scratch space. Falls back to flying `target` directly
    // (today's pre-worktree behavior) if worktree setup fails for any
    // reason — this mechanism must never itself be a single point of flight
    // failure. Onboarding/backup/index above stay pointed at `target`; they
    // run before the worktree exists.
    const worktreePlan = deriveWorktreePlan(target, projectId, instanceId);
    let flightRoot = target;
    // The linked worktree's OWN root — always what `git worktree list
    // --porcelain` (in target) reports back, regardless of `target` being a
    // repo root or a subfolder within one. Kept distinct from `flightRoot`
    // (below) for the FLEET INTENT CLAIMS calls, which discover a sibling's
    // claim by matching worktree-list entries — those must keep comparing
    // this exact root, never the nested `flightRoot` a subfolder target now
    // resolves to, or a subfolder-flown instance's own claim would fail to
    // match its own worktree entry and misread as a sibling's.
    let worktreeRoot = target;
    let targetBranch = '';
    try {
      mkdirSync(dirname(worktreePlan.path), { recursive: true });
      targetBranch = await new GitVcs(target).currentBranch();
      const worktree = await ensureWorktree(target, worktreePlan.path, worktreePlan.branch);
      // CRITICAL (board web-mtnxo78d-imajqg): falling back to flying `target`
      // directly is only safe when no OTHER live flight already holds it —
      // otherwise two instances both commit into the SAME primary checkout
      // with zero mutual exclusion (this instance's own engine lock above is
      // namespaced per-instanceId precisely so N-way siblings never block
      // each other, which is exactly what stops it from blocking THIS race
      // too). `excludePid: process.pid` skips the lock this flight itself
      // just acquired, so a genuinely solo flight is never self-refused.
      if (!worktree.ok && isAnyFlightLockLive(dirname(dbPath), target, process.pid)) {
        out(
          `⛔ worktree setup failed (${worktree.details}) and another flight already holds ` +
            `${target} directly — refusing to ALSO fly it there (flight-vs-flight primary-checkout ` +
            'race). Wait for the other flight to finish, or fix worktree isolation.',
        );
        process.exitCode = 1;
        return;
      }
      worktreeRoot = worktree.ok ? worktreePlan.path : target;
      // HARNESS GAP (board web-mtm0shsf-hmv8ud, docs/CASE-STUDIES/calculator.md):
      // when `target` is a SUBFOLDER of a larger repo (no `.git` of its own —
      // e.g. samples/calculator inside this monorepo), `ensureWorktree` above
      // necessarily checks out the WHOLE parent repo (git has no smaller unit
      // to check out), but every downstream consumer of `flightRoot` — the
      // gate's cwd, the CLI's own repo, the containment guard's confined root —
      // used to point at that worktree's own root, not the nested subfolder
      // actually registered. The gate then ran the parent repo's suite instead
      // of the flown project's own `npm test`, reverting a correct
      // implementation twice on launch night. Joining `target`'s repo-relative
      // prefix back on lands `flightRoot` on the identical nested folder inside
      // the worktree that `target` names outside it; a no-op join (prefix '')
      // for the ordinary case where `target` already IS its own repo root.
      const repoPrefix = worktree.ok ? await repoPrefixOf(target) : '';
      flightRoot = worktree.ok ? join(worktreePlan.path, repoPrefix) : target;
      out(
        worktree.ok
          ? `Flight isolation: Bash confined to a linked worktree at ${flightRoot} (${worktree.details}).`
          : `Flight isolation: worktree setup failed (${worktree.details}) — flying ${target} directly.`,
      );
      if (worktree.ok) {
        // Catch up target on any work a PRIOR flight left unsynced in this
        // same worktree branch (e.g. a mid-flight crash before its own
        // sync-back ran) before this flight's containment baseline is
        // snapshotted below — best-effort, never fails the flight.
        const catchUp = await syncWorktreeBranch(target, targetBranch, worktreePlan.branch);
        if (!catchUp.ok) out(`  ⚠ worktree catch-up sync skipped: ${catchUp.details}`);
        // FORWARD-FF (the other half of lane freshness, 2026-09-03): the
        // catch-up above drains lane→target, but nothing ever moved a REUSED
        // lane forward — parked on an older base it rebuilds on dead code
        // and manufactures avoidable conflicts at sync-back. With the drain
        // done the lane is ordinarily a plain ancestor of target again, so a
        // clean fast-forward brings it to the tip; dirty or diverged lanes
        // refuse gracefully (fastForwardWorktree never merges or resets) and
        // the flight proceeds from wherever the lane stands — best-effort,
        // same stance as the catch-up.
        const forward = await fastForwardWorktree(worktreePlan.path, targetBranch);
        out(
          forward.ok
            ? `  ⏩ lane worktree brought to '${targetBranch}' tip (${forward.details})`
            : `  ⏩ lane worktree left as-is: ${forward.details}`,
        );
      }
    } catch (err) {
      // mkdirSync et al. can throw (permissions, disk full, …) where
      // ensureWorktree/syncWorktreeBranch themselves never do (both resolve
      // ok:false rather than rejecting) — this mechanism must never be a
      // single point of flight failure, so any thrown error here falls all
      // the way back to flying `target` directly, exactly like an ok:false result.
      // Same flight-vs-flight guard as the ok:false branch above (board
      // web-mtnxo78d-imajqg) — this thrown-error path falls back to `target`
      // just as readily, so it needs the identical live-lock refusal.
      if (isAnyFlightLockLive(dirname(dbPath), target, process.pid)) {
        out(
          `⛔ worktree setup threw (${err instanceof Error ? err.message : String(err)}) and another ` +
            `flight already holds ${target} directly — refusing to ALSO fly it there ` +
            '(flight-vs-flight primary-checkout race).',
        );
        process.exitCode = 1;
        return;
      }
      flightRoot = target;
      worktreeRoot = target;
      out(
        `Flight isolation: worktree setup threw (${err instanceof Error ? err.message : String(err)}) — flying ${target} directly.`,
      );
    }

    // Self-heal BEFORE this flight's own board read: a prior flight that
    // crashed or exited before reaching its own end-of-flight reconciliation
    // (below) can leave a gate-verified shipped task stuck "queued" — close it
    // now so this flight's firings never waste a pick on already-done work.
    for (const task of reconcileShippedTasks(store, projectId, now())) {
      out(`  ✓ board task done (straggler from a prior flight): ${task.id} — ${task.title}`);
    }

    // FLEET STALE-CLAIM REAPER: a crashed instance (SIGKILL, power loss) skips
    // the flight-end finally that runs releaseInstanceClaims, stranding its
    // claim with no live instanceKey left to hand it back through. Two BRAND
    // tasks sat in_progress, assigned to long-dead instances, for three days
    // (observed 2026-08-20) before this existed. Runs here (flight start,
    // same self-heal spot as reconcileShippedTasks above) rather than at this
    // flight's own end, since a crash is exactly the ending that never reaches
    // its own finally — the NEXT flight to start is what closes the gap.
    for (const task of releaseStaleClaims(store, projectId, DEFAULT_STALE_CLAIM_MS, now())) {
      out(`  ↩ stale claim released (dead instance): ${task.id} — ${task.title}`);
    }

    // Impacted-tests-first scheduling (web-msnt26tn-jvyihy "PARALLEL GATE +
    // test-impact"): most firings run the project's `testImpacted` command
    // (a fast, diff-scoped test run) instead of its full `test` command,
    // with a full run scheduled every FULL_TEST_EVERY_N_FIRINGS firings to
    // catch what the changed-file graph misses. `firingStats` is re-read
    // (not cached) by `buildGateSpec` below — recomputed per FIRING, not
    // once for the whole flight, so a `firings N` multi-firing flight still
    // crosses the every-Nth-firing boundary partway through instead of
    // freezing whichever schedule slot happened to be true when the flight
    // started (web-mtb8i2ol-obncos: the frozen version never re-fires the
    // backstop inside a flight once its first decision picked the fast path).
    const buildGateSpec = (): GateSpec =>
      perFiringGateSpec(result.gate.spec, firingStats(store.db, projectId).firings);
    const commands = gateCommands(buildGateSpec());
    out(`Gate: ${commands.map((c) => c.label).join(' · ') || '(none detected)'}`);

    // CONVERGENCE GATE telemetry (board web-mtbeu5d3-n09acx "CONVERGENCE FULL
    // GATE") — best-effort, same contract as every other events-table insert
    // in this file: never let a telemetry hiccup take the flight down.
    const recordConvergenceRed = (check: string, mergeDetails: string): void => {
      try {
        store.db
          .prepare(
            'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(
            projectId,
            null,
            'convergence-red',
            JSON.stringify({ branch: targetBranch, check, merge: mergeDetails }),
            now(),
          );
      } catch {
        // Telemetry is best-effort — never let it take the flight down.
      }
    };
    // Per-firing sync-back: typecheck only — see convergence-gate.ts's doc
    // comment for why this stays lightweight (cadence) while the flight-end
    // sync-back below runs the FULL detected gate.
    const typecheckConvergedGate: GatePort = {
      run: () => {
        const typecheck = result.gate.spec.typecheck;
        if (!typecheck?.bin) return Promise.resolve({ ok: true, checks: [] });
        return new GateRunner({
          cwd: target,
          commands: [{ bin: typecheck.bin, args: [...typecheck.args], label: typecheck.label }],
        }).run();
      },
    };
    // Flight-end sync-back: the FULL detected gate (typecheck + lint +
    // format + test + build) — see convergence-gate.ts's doc comment. Uses
    // `fullGateSpec`, NOT `buildGateSpec()`: the latter runs `test` through
    // the per-firing impacted-tests schedule, which would silently regress
    // this "FULL" gate back to a diff-scoped test run most flights.
    const fullConvergedGate: GatePort = {
      run: () =>
        new GateRunner({
          cwd: target,
          commands: gateCommands(fullGateSpec(result.gate.spec)),
        }).run(),
    };
    if (fleetTaskScope !== null) {
      out(
        `Fleet scope: ${fleetTaskScope.size} partitioned task(s) assigned to this instance ` +
          `(partition-then-pull — falls back to the open board once exhausted).`,
      );
    }

    // Cautious config: small budget + turn cap. Default to sonnet→opus (fable's
    // free tier is easily exhausted); the resilience chain falls back on quota.
    const config: EngineConfig = {
      ...DEFAULT_ENGINE_CONFIG,
      primaryModel: process.env['AUTOPILOT_MODEL'] ?? 'sonnet',
      fallbackModel: 'opus',
      resilience: {
        ...DEFAULT_ENGINE_CONFIG.resilience,
        primaryModel: 'sonnet',
        fallbackModel: 'opus',
      },
      maxBudgetUsd: budgetUsd,
      maxTurns: FLY_MAX_TURNS,
      subscriptionPriceUsd: subscriptionPriceUsdFromEnv(process.env),
      usagePoolDirs: usagePoolDirsFromEnv(process.env),
    };

    // Record each tool the agent uses (live activity timeline) into the events log,
    // tagged with the firing currently in flight.
    let currentFiring = 0;
    // PARALLEL UNLOCK C (board task-CLAIMING): the board task this instance
    // claimed for the CURRENT firing (buildPrompt below), or null when the
    // board was empty. Read back in onFiringComplete to release it if the
    // firing shipped something else, or nothing at all.
    let claimedTaskId: string | null = null;
    // Run-3 death-loop guard state: per-task consecutive no-ship count this
    // flight; 2 strikes benches the task for the flight's remainder.
    const noShipStreak = new Map<string, number>();
    const benchedTasks = new Set<string>();
    // FLEET-AWARE FOCUS (sticky lease): when THIS instance claims the
    // FOCUSED task, the claim is held across firings until it ships or is
    // benched — the between-firings unclaimed window otherwise lets every
    // sibling converge onto the focused task in relay while their own
    // boards starve (run-3's amplifier). Siblings keep seeing it claimed
    // and work the normal board.
    let claimedTaskFocus = false;
    // Escalation circuit breaker (the 5-agent run's quota lesson): when the
    // subscription's premium-model window runs dry mid-flight, escalated
    // firings die truncated one after another while sonnet firings keep
    // shipping. Two consecutive escalated-model no-ships trip the breaker —
    // routing stays default for this flight's remainder.
    let escalatedFailStreak = 0;
    let escalationTripped = false;
    let lastFiringEscalated = false;
    let lastRequestedModel = '';
    const recordActivity = (activity: Activity): void => {
      store.db
        .prepare(
          'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          projectId,
          firingIdOf(projectId, currentFiring, instanceId),
          'activity',
          JSON.stringify(activity),
          now(),
        );
      out(`    · ${activity.tool} ${activity.target}`);
    };

    // Containment audit: snapshot every repo that must NOT change (the dashboard's
    // own cwd, and now — bash containment slice 3 — `target` itself, since Bash
    // no longer runs there). If any moves between firings, the flight escaped its
    // target — stop immediately and shout (docs/FLIGHT-CONTAINMENT.md). `target`'s
    // HEAD is expected to move via each firing's own controlled sync-back
    // (onFiringComplete, below) — that path re-snapshots `guarded` right after a
    // successful sync so the NEXT check's baseline is the post-sync HEAD, not a
    // stale one; only a movement the flight's own sync-back didn't produce reads
    // as a breach. `guardCandidates` is deduped: when this repo self-hosts its
    // own flight, `process.cwd()` and `target` are the SAME path.
    const headReader = new GitHeadReader();
    const guardCandidates = [...new Set([process.cwd(), target])];
    let guarded = snapshotGuardedHeads(headReader, guardedPathsFor(flightRoot, guardCandidates));
    let breaches: readonly ContainmentBreach[] = [];
    // CONTAINMENT vs OPERATOR (web-msu3x5ub-vqxjhu): worktree isolation active
    // (flightRoot is a linked worktree, not target itself) means Bash is
    // physically walled off from every guarded path — classifyBreaches downgrades
    // a movement there to operator activity instead of a hard breach. Isolation
    // NOT active (the worktree-setup-failed fallback) keeps the full hard stop.
    const isolationActive = flightRoot !== target;
    const checkContainment = (): boolean => {
      const found = detectContainmentBreaches(headReader, guarded);
      if (found.length === 0) return false;
      const { hard, operator } = classifyBreaches(found, isolationActive);
      if (operator.length > 0) {
        for (const b of operator) {
          out(
            `  ⚠ guarded HEAD moved outside this flight's worktree (operator activity, not a breach): ${describeBreach(b)}`,
          );
        }
        guarded = snapshotGuardedHeads(headReader, guardedPathsFor(flightRoot, guardCandidates));
      }
      if (hard.length > 0) {
        breaches = hard;
        for (const b of hard) out(`  ⛔ ${describeBreach(b)}`);
      }
      return hard.length > 0;
    };

    // TOTAL-SPEND mode: tallied from each firing's gate-verified cost as the
    // flight goes (onFiringComplete, below) — the same number the dashboard's
    // firingStats() sums, just scoped to this flight instead of project lifetime.
    let spentSoFar = 0;
    // Graceful PAUSE (web-msnt50au-vcrgrp): the dashboard's Pause control sets
    // pause_requested on THIS project's row from a separate process (the server),
    // so it's re-read from the store — not cached — at every checkpoint. Checked
    // at the exact same before/after-a-firing points as containment/budget below,
    // so a pause NEVER interrupts a firing in flight, only the gap between them.
    // `paused` (declared above, alongside `store`) records that THIS was the
    // reason the loop stopped, so the finally block can land the project on
    // 'paused' instead of 'registered'.
    const pauseRequested = (): boolean => {
      const row = store.db
        .prepare('SELECT pause_requested FROM projects WHERE id = ?')
        .get(projectId) as { pause_requested: number } | undefined;
      return row?.pause_requested === 1;
    };
    const shouldStop = (): boolean => {
      if (checkContainment()) return true;
      if (totalBudgetExhausted(spentSoFar, totalBudgetUsd, budgetUsd)) {
        out(
          `  ⏹ total budget reached: $${spentSoFar.toFixed(2)} spent of $${totalBudgetUsd} — remaining can't fund another $${budgetUsd} firing.`,
        );
        return true;
      }
      if (pauseRequested()) {
        out('  ⏸ pause requested — holding after this firing (Resume to continue).');
        paused = true;
        return true;
      }
      return false;
    };

    // Escape PREVENTION (layer 2, docs/FLIGHT-CONTAINMENT.md): spawn the CLI with
    // a generated --settings whose PreToolUse hook denies any Bash command that
    // references a path outside the target. CLI-arg scoped — the user's own
    // settings files are never touched.
    const guardSettingsPath = join(
      dirname(dbPath),
      guardSettingsFileName(lockProjectId, instanceId),
    );
    const guardScriptPath = guardHookScriptPath();
    const flightSettings = buildFlightSettings(flightRoot, guardScriptPath);
    writeFileSync(guardSettingsPath, `${JSON.stringify(flightSettings, null, 2)}\n`);
    // GUARD SETTINGS VERIFICATION (STPA finding, flight/guard-verify.ts): a
    // silent write/parse failure here — a truncated write, a stale file left
    // by a prior process, an unbuilt guard-hook.js — means the CLI's own
    // PreToolUse plumbing treats the broken hook as "no decision" and the
    // flight flies completely unguarded with zero signal. Read the file back
    // and confirm it, and the script it invokes, are really there before
    // ever spawning the model — fail CLOSED (refuse to fly) rather than
    // silently unguarded.
    const guardVerification = verifyGuardSettings(
      guardSettingsPath,
      flightSettings,
      guardScriptPath,
      (p) => readFileSync(p, 'utf8'),
      existsSync,
    );
    if (!guardVerification.ok) {
      out(
        `⛔ CONTAINMENT GUARD VERIFICATION FAILED — refusing to fly unguarded: ${guardVerification.reason}`,
      );
      out('   See docs/FLIGHT-CONTAINMENT.md.');
      process.exitCode = 1;
      return;
    }
    out(`Containment guard: PreToolUse path guard active (confined to ${flightRoot}).`);

    const sink = new SqliteFiringStore(store, projectId, now, instanceId);
    // Adaptive cadence (v2.4 usage_advisor port, docs/BACKLOG-999.md): paces
    // on REAL gate-verified spend from the same `metrics` rows the dashboard
    // graphs read — comfortably under both soft caps keeps the base cadence;
    // spend trending toward either cap slows the loop down before hibernation
    // (a harder, separate signal on true quota exhaustion) would ever trigger.
    const pacer = new SqlitePacer(store, projectId, config);
    // Mechanical gate remediation: every gate-revert observed in real flights was
    // format-only — correct work destroyed by prettier drift. When the gate fails,
    // run the write-mode formatter, commit additively, re-run the gate; roll the
    // autofix commit back if the gate is still red (see engine/remediating-gate).
    // Scoped to `flightRoot` (the worktree, bash containment slice 3) — a
    // firing's commits land there first and reach `target` via sync-back.
    const vcs = new GitVcs(flightRoot);

    // REPO-MAP digest (web-msnt26vh-uk5dap): a tiny orientation summary — top
    // dirs, hot files, the gate, recent focus areas — computed ONCE per flight
    // (not per firing, to avoid repeated git log/tree-walk cost) and spliced
    // into every firing's prompt so ORIENT reads less. Reuses onboarding's
    // already-built index (no second tree walk) plus the gate this flight
    // already detected; degrades to an empty digest (omitted from the prompt)
    // when the index hasn't been built yet rather than failing the flight.
    const storedIndex = onboardDeps.indexStore.load(projectId);
    const recentCommitsForMap = await vcs.recentCommits(REPO_MAP_COMMIT_WINDOW);
    const repoMapDigest = buildRepoMapDigest({
      topDirs: storedIndex ? summarize(storedIndex.entries).topDirs : [],
      hotFiles: storedIndex
        ? rankHotFiles(storedIndex.entries, REPO_MAP_HOT_FILES_LIMIT).map((f) => f.path)
        : [],
      gateLabels: commands.map((c) => c.label),
      recentFocus: tallyRecentFocusDirs(recentCommitsForMap),
    });

    const innerGate = new DynamicGate({
      cwd: flightRoot,
      commands: () => gateCommands(buildGateSpec()),
    });
    const formatFix = deriveFormatFixCommand(result.gate.spec.format);
    const gate = formatFix
      ? new RemediatingGate({
          inner: innerGate,
          vcs,
          runFixer: async () => {
            out(`  gate red → mechanical remediation: ${formatFix.label ?? formatFix.bin}`);
            return (await new GateRunner({ cwd: flightRoot, commands: [formatFix] }).run()).ok;
          },
        })
      : innerGate;
    if (formatFix)
      out(
        `Remediation: ${formatFix.label ?? formatFix.bin} (auto-fix on format-only gate failures)`,
      );
    // Failure-feedback loop (iterative refinement): remember the last failure —
    // a gate revert OR a turn-cap death (below, onFiringComplete) — so the NEXT
    // firing's prompt shows the agent exactly what to not repeat.
    let lastFailureFeedback: string | undefined;
    const feedbackGate: GatePort = {
      run: async () => {
        const r = await gate.run();
        lastFailureFeedback = r.ok
          ? undefined
          : 'THE GATE FAILED — the commit was reverted. Run every gate command yourself\n' +
            '(including lint and format checks) before committing; correct work dies to\n' +
            `mechanical checks too.\n${r.details ?? ''}`;
        return r;
      },
    };
    // Proposal-harvest state carried across firings (onFiringComplete, below) —
    // seeded once so a title offered twice in one flight is only created once.
    // Also seeded with the target's own detected backlog file's bullet text:
    // the prompt ASKS the model to dedupe every proposal against it too, but
    // that's advisory — this makes a VERBATIM repeat of a backlog line
    // impossible to harvest even when the model doesn't comply (C2).
    const existingTitles = new Set(
      (
        store.db.prepare('SELECT title FROM tasks WHERE project_id = ?').all(projectId) as {
          title: string;
        }[]
      ).map((r) => r.title.trim().toLowerCase()),
    );
    for (const title of readBacklogTitles(target, result.backlogPath)) {
      existingTitles.add(title.toLowerCase());
    }
    let proposedCount = 0;
    // SAFETY-II NEAR-MISS RITUAL (board web-mt1qat5h-nxzgjs): weak-signal
    // counters accumulated across THIS flight's firings, folded into one
    // post-flight debrief after the loop ends — see flight/near-miss.ts.
    let flightGuardDenials = 0;
    let flightCheckpointErrors = 0;
    let flightRescues = 0;
    let flightIntentCollisions = 0;
    let flightSyncBackRefusals = 0;
    // Env-driven OTLP export (BACKLOG-999 ap-msksw1me-0): off unless an
    // OTEL_EXPORTER_OTLP_* endpoint is set (see apps/dashboard/src/flight/otlp.ts).
    // Best-effort — a collector outage must never take down the flight itself.
    const otlpConfig = otlpConfigFromEnv(process.env);
    if (otlpConfig) out(`OTLP export: ${otlpConfig.endpoint}`);
    const cliTimeoutMs = cliTimeoutMsFromEnv(process.env);
    const loop: LoopDeps = {
      firing: {
        model: new StreamingClaudeCliModel({
          repo: flightRoot,
          config,
          auth,
          onActivity: recordActivity,
          settingsPath: guardSettingsPath,
          // ORPHAN SWEEP crash-path follow-up (ap-mt2ukjg5-2): persists this
          // invocation's child pid so a future startup's sweepStale can
          // still reap it if THIS flight process dies first.
          pidRegistry,
          // THIRD CAP (wall clock), launcher-tunable — see budget.ts's
          // cliTimeoutMsFromEnv; omitted key keeps the driver's own default.
          ...(cliTimeoutMs !== undefined ? { timeoutMs: cliTimeoutMs } : {}),
        }),
        vcs,
        gate: feedbackGate,
        store: sink,
        clock: new SystemClock(),
      },
      stopRequested: () => Promise.resolve(shouldStop()),
      loadState: () => Promise.resolve(INITIAL_RESILIENCE_STATE),
      saveState: () => Promise.resolve(),
      nextFiring: () => Promise.resolve(sink.reserveNextFiring()),
      // Cost semantics v3: real fs scan, once for the whole flight (loop.ts
      // calls this exactly once before its firing loop starts). Directories
      // are entirely operator-supplied (AUTOPILOT_USAGE_POOL_DIRS) — an
      // empty/unset list makes this a no-op returning null, never a guess.
      scanUsagePool: () =>
        Promise.resolve(scanUsagePoolListPriceUsd(config.usagePoolDirs, Date.now()).totalUsd),
      buildPrompt: async (firing, retro) => {
        currentFiring = firing;
        // The assign→fly loop: hand the OPEN board to every firing, re-read fresh
        // so a task added from the dashboard mid-flight is seen by the next firing.
        //
        // PARALLEL UNLOCK C (board task-CLAIMING): with N-way same-folder spawn
        // now live (flight/registry.ts), more than one flight INSTANCE can hit
        // this SAME line concurrently against the SAME project. Without a
        // claim, both would read the same topmost 'queued' task and both
        // firings would work it — wasted spend, duplicate/conflicting commits.
        // Claim the topmost task still available to THIS instance before
        // rendering the board, so a sibling instance's very next read excludes
        // it; released in onFiringComplete if this firing didn't actually ship
        // it (freeing it back to the fleet instead of stranding it).
        const openBefore = recentTasks(store.db, projectId).filter(
          (t) => t.status === 'queued' || t.status === 'in_progress',
        );
        // FLEET SCOPE PARTITIONER (spec-scoped decomposition, EVALUATION-
        // 2026-08-20-sota lever 5): when the launcher partitioned the board,
        // this instance picks ONLY from its disjoint scope while any scope
        // task is still open — the cohesion grouping that stops two siblings
        // converging on the same area. Scope exhausted → ordinary pull
        // (partition-then-pull; a fast instance never idles). No scope env →
        // scopedCandidates IS openBefore, byte-for-byte the old behavior.
        const scopedCandidates = scopeFilterCandidates(openBefore, fleetTaskScope);
        // Run-3 death-loop guard: a task that burned 2 consecutive no-ship
        // firings THIS flight goes to the bench — stop re-claiming and
        // re-dying on it; the next flight (or a sibling) can try fresh.
        // FLEET-AWARE FOCUS (web-mswpsozf-oxf17b): focused-first ordering so
        // the first free instance CLAIMS the operator's focus target instead
        // of claiming the topmost task while locked onto another.
        const topAvailable = orderClaimCandidatesFocusFirst(scopedCandidates).find(
          (t) => (t.assignee === null || t.assignee === instanceKey) && !benchedTasks.has(t.id),
        );
        claimedTaskId =
          topAvailable && claimTask(store, topAvailable.id, instanceKey, now())
            ? topAvailable.id
            : null;
        claimedTaskFocus = claimedTaskId !== null && topAvailable?.focus === 1;
        // SLICE-RELAY DUP fix 1 (RESEARCH-LIBRARY): a board claim is a CODE
        // event, not an agent-initiated one, so the prompt's "declare before
        // starting" doctrine never actually fires for it — the incident that
        // named this fix had three siblings relay-race the SAME open task
        // across separate firings with zero intent signal the whole time.
        // Auto-declare here, right at claim time, whenever the claimed
        // task's own title already names its target file.
        if (claimedTaskId !== null && topAvailable) {
          const primaryPath = likelyPrimaryPathFromTitle(topAvailable.title);
          if (primaryPath !== null)
            writeDeclaredIntent(worktreeRoot, primaryPath, topAvailable.title);
        }
        // Re-read (rather than reuse `openBefore`) so a task a SIBLING instance
        // just claimed out from under this snapshot — or the one THIS instance
        // just claimed above — is reflected accurately, not the pre-claim state.
        // The same scope filter applies to the RENDERED board: while this
        // instance's partition is alive, its prompt shows in-scope work only,
        // so a mid-firing deviation can't wander into a sibling's area either.
        // SLICE-RELAY (board web-mt14o4nh-bfpr9c): the prior-shipped-commit
        // ledger for every multi-slice task, read once per firing rather than
        // per board row — one query, grouped by item, same shape prompt.ts's
        // taskLine expects.
        const shippedSlices = shippedSlicesByTask(store.db, projectId);
        const board = scopeFilterCandidates(
          recentTasks(store.db, projectId).filter(
            (t) => t.status === 'queued' || t.status === 'in_progress',
          ),
          fleetTaskScope,
        )
          .filter((t) => t.assignee === null || t.assignee === instanceKey)
          .map((t) => ({
            id: t.id,
            title: t.title,
            severity: t.severity,
            dimension: t.dimension,
            // FLEET-AWARE FOCUS: the WIP-1 lock binds to the claimer — a
            // sibling of the claiming instance sees an ordinary board row,
            // not FOCUS MODE for work it doesn't own (the run-3 starvation).
            focus: isFocusBoundHere(t, claimedTaskId),
            shippedSlices: shippedSlices.get(t.id) ?? [],
          }));
        // Fresh read feeds BOTH this firing's digest and auto-triage (backlog
        // I) — a dropped note is shown once here, turned into a queued task
        // the NEXT firing's board read will see, and archived so it is never
        // triaged twice.
        const inboxEntries = readInboxEntries(target);
        triageInboxEntries(store, projectId, target, inboxEntries);
        // MODEL ROUTING v1 (web-msvz7n8o-nynbbs): classify the task THIS
        // firing actually claimed (not just any board task) into a tier —
        // mechanical/default/architecture-escalated — and resolve it to a
        // model, applied by the loop (packages/engine/src/loop.ts) for just
        // this firing instead of the flight-wide sonnet default. A single-
        // task-scoped metrics query, cheap against the local sqlite store.
        let routedModel: string | undefined;
        if (topAvailable) {
          const taskMetricsRows = store.db
            .prepare(
              'SELECT item, cost_usd AS costUsd, completion FROM metrics WHERE project_id = ? AND item = ? ORDER BY created_at',
            )
            .all(projectId, topAvailable.id) as {
            item: string | null;
            costUsd: number;
            completion: string | null;
          }[];
          const sliceStreak =
            taskEconomicsFromRows(taskMetricsRows).get(topAvailable.id)?.sliceStreak ?? 0;
          const tier = classifyTaskModelTier({ title: topAvailable.title, sliceStreak });
          routedModel = escalationTripped
            ? undefined
            : resolvePrimaryModelForTier(tier, process.env);
          if (routedModel !== undefined && routedModel !== config.primaryModel) {
            out(`  🧭 model routing: ${tier} → ${routedModel} — ${topAvailable.title}`);
          }
        }
        lastFiringEscalated =
          routedModel !== undefined && budgetMultiplierForModel(routedModel) > 1;
        lastRequestedModel = routedModel ?? config.primaryModel;
        const fleet = await buildFleetDigest(store, projectId, instanceKey, target);
        return {
          text: buildFiringPrompt({
            soul,
            firing,
            retro,
            repoPath: flightRoot,
            board,
            backlogPath: result.backlogPath,
            repoMap: repoMapDigest,
            inbox: buildInboxDigest(inboxEntries),
            fleet,
            maxTurns: FLY_MAX_TURNS, // deliver-or-pack: the agent must SEE its ceiling
            ...(lastFailureFeedback !== undefined ? { lastFailure: lastFailureFeedback } : {}),
          }),
          version: FIRING_PROMPT_VERSION,
          ...(routedModel !== undefined ? { primaryModel: routedModel } : {}),
          // Routed-budget lockstep (run-3): an escalated model on a
          // sonnet-sized budget dies mid-firing — scale this firing's cap
          // with the routed model's price.
          ...(routedModel !== undefined && budgetMultiplierForModel(routedModel) !== 1
            ? {
                maxBudgetUsd:
                  Math.round(budgetUsd * budgetMultiplierForModel(routedModel) * 100) / 100,
              }
            : {}),
        };
      },
      sleep: () => Promise.resolve(),
      nextPaceMin: () => pacer.nextPaceMin(),
      log: (message) => out(`  ${message}`),
      onFiringComplete: async (outcome) => {
        spentSoFar += outcome.record.costUsd ?? 0;
        // SAFETY-II NEAR-MISS RITUAL: this firing's own weak signals, folded
        // into the flight-level accumulators declared above.
        flightGuardDenials += outcome.record.guardDenials ?? 0;
        // GUARD-DENIAL telemetry (board web-msr0ug27-hj1w27): persist each
        // structured denial as its own events row (same events-are-the-
        // audit-trail contract as 'intent-collision' below) so the anomalies
        // panel and the activity log have real rows to read instead of the
        // count vanishing with the flight console.
        for (const detail of outcome.record.guardDenialDetails ?? []) {
          try {
            store.db
              .prepare(
                'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
              )
              .run(
                projectId,
                outcome.record.firing,
                'guard-denial',
                JSON.stringify({ kind: detail.kind, target: detail.target }),
                now(),
              );
          } catch {
            /* guard-denial telemetry is best-effort — never fail the flight over it */
          }
        }
        if (outcome.record.checkpointError) flightCheckpointErrors++;
        if (
          outcome.record.gateResult === 'passed' &&
          wasAutoformatRescued(outcome.record.gateChecks)
        ) {
          flightRescues++;
        }
        // Bash containment slice 3: fast-forward (or additively merge) this
        // firing's worktree-branch commits onto target's own live checkout —
        // the operator's checkout sees the shipped work without ever being
        // the directory Bash actually executed in. Re-snapshot the
        // containment guard's baseline right after so the NEXT check treats
        // this SANCTIONED head movement as the new normal, not a breach.
        // Best-effort: a sync hiccup leaves the work safely parked on the
        // worktree branch for the next attempt, never lost, never fatal.
        if (flightRoot !== target) {
          const sync = await syncWorktreeBranch(target, targetBranch, worktreePlan.branch);
          if (sync.ok) {
            guarded = snapshotGuardedHeads(
              headReader,
              guardedPathsFor(flightRoot, guardCandidates),
            );
            await gateConvergedBranch(targetBranch, sync.details, {
              gate: typecheckConvergedGate,
              out,
              recordRed: recordConvergenceRed,
            });
          } else {
            out(`  ⚠ worktree sync-back skipped: ${sync.details}`);
            flightSyncBackRefusals++;
            // CONVERGENCE MADE LOUD (board web-mtb8i2mj-i0n1c7): a refused
            // sync-back used to be nothing but the `⚠` line above — it could
            // recur 10+ firings in a row with nothing durable to show for it
            // (docs/EVALUATION-2026-08-27-silent-gate.md §3.3). Persist it as
            // its own events row, same GUARD-DENIAL-telemetry contract as
            // above, so the anomalies panel surfaces it on the FIRST
            // occurrence instead of waiting on the near-miss ritual's
            // 3-flight recurring streak.
            try {
              store.db
                .prepare(
                  'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
                )
                .run(
                  projectId,
                  outcome.record.firing,
                  'sync-back-refusal',
                  JSON.stringify({ details: sync.details }),
                  now(),
                );
            } catch {
              /* sync-back-refusal telemetry is best-effort — never fail the flight over it */
            }
          }
        }
        const demotion = await markTaskDoneIfShipped(store, projectId, outcome, vcs);
        if (demotion !== undefined) lastFailureFeedback = demotion;
        // MID-FLIGHT STRAGGLER RECONCILE (board ap-mt3d6qvs-2): markTaskDoneIfShipped
        // above only closes THIS firing's own claimed task — a task a SIBLING flight
        // shipped and merged partway through this flight would otherwise sit "queued"
        // until this flight's own end-of-flight reconcileShippedTasks sweep. Catch it
        // the very next firing instead.
        reconcileMidFlightStragglers(store, projectId, now());
        // PARALLEL UNLOCK C (board task-CLAIMING): this firing's pre-work claim
        // (buildPrompt above) was a PREDICTION, not a guarantee — the agent may
        // have deviated (PICK DISCIPLINE allows it, with a reason) or shipped
        // nothing at all. Either way, whatever it claimed but did NOT actually
        // ship goes back to the fleet now instead of sitting invisible to a
        // sibling instance until this instance's own next firing.
        if (
          claimedTaskId &&
          outcome.record.item !== claimedTaskId &&
          // sticky FOCUS lease: hold the focused task across firings (until
          // shipped or benched) instead of releasing it into the sibling pool
          !(claimedTaskFocus && !benchedTasks.has(claimedTaskId))
        ) {
          releaseTaskClaim(store, claimedTaskId, instanceKey, now());
        }
        // Run-3 death-loop guard: 2 consecutive no-ship firings on the SAME
        // claimed task bench it for this flight's remainder — stop paying to
        // re-claim and re-die on it (an escalated-model budget death, a
        // recurring gate revert, whatever the cause).
        // SILENT DOWNGRADE detection (RESEARCH-LIBRARY "silent model
        // downgrade"): the CLI serves a different family than routing asked
        // for once the premium window is drained — escalation then costs the
        // escalated budget for a model we did NOT choose. Trip the breaker on
        // the FIRST substitution; waiting for two no-ships misses it entirely
        // because a substituted firing often still ships.
        if (
          lastFiringEscalated &&
          isModelSubstitution(lastRequestedModel, outcome.record.model ?? '') &&
          !escalationTripped
        ) {
          escalationTripped = true;
          out(
            `  ⚡ escalation breaker TRIPPED — requested ${lastRequestedModel}, served ${outcome.record.model}: the premium window is drained; default model for the rest of this flight`,
          );
        }
        if (lastFiringEscalated) {
          if (outcome.record.shipped) {
            escalatedFailStreak = 0;
          } else {
            escalatedFailStreak += 1;
            if (escalatedFailStreak >= 2 && !escalationTripped) {
              escalationTripped = true;
              out(
                '  ⚡ escalation breaker TRIPPED (2 consecutive escalated no-ships) — default model for the rest of this flight',
              );
            }
          }
        }
        if (claimedTaskId) {
          if (outcome.record.shipped) {
            noShipStreak.delete(claimedTaskId);
          } else {
            const strikes = (noShipStreak.get(claimedTaskId) ?? 0) + 1;
            noShipStreak.set(claimedTaskId, strikes);
            if (strikes >= 2) {
              benchedTasks.add(claimedTaskId);
              // a benched sticky-focus lease is surrendered — the fleet moves on
              releaseTaskClaim(store, claimedTaskId, instanceKey, now());
              out(`  ⛔ benched for this flight (2 no-ship firings): ${claimedTaskId}`);
            }
          }
        }
        claimedTaskId = null;
        // FLEET INTENT CLAIMS lifecycle: a shipped unit fulfills its declared
        // .autopilot-intent claim — retire it so siblings may enter the area.
        // A checkpoint/turn-cap death keeps the claim standing on purpose:
        // the packed-up unit is still owned by the firing that resumes it.
        if (outcome.record.shipped) {
          // FLEET INTENT CLAIMS enforcement (web-mswo4x1u-kl2qsw): the hard
          // rule forbidding a sibling's claimed primary file was prompt-only
          // and got evaded — verify the SHIPPED commit against siblings'
          // standing claims. Additive-git doctrine keeps the green commit;
          // the violation is surfaced loudly and injected as the NEXT
          // firing's failure feedback so the loop corrects instead of
          // compounding into another overnight duplicate-module pile-up.
          const recent = await vcs.recentCommits(2);
          const shippedCommit = recent.find((c) => c.shortSha === outcome.record.sha) ?? recent[0];
          const collisions = detectIntentCollisions(
            shippedCommit?.files ?? [],
            readSiblingIntentClaims(target, worktreeRoot),
          );
          flightIntentCollisions += collisions.length;
          for (const { file, claim } of collisions) {
            out(
              `  🚨 intent collision: ${file} is claimed by sibling ${claim.branch} ("${claim.intent}")`,
            );
            // Persist the breach so it outlives the flight console — the
            // dashboard's intent-collision chip reads these events, same
            // events-are-the-audit-trail contract as 'family-runaway'.
            try {
              store.db
                .prepare(
                  'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
                )
                .run(
                  projectId,
                  outcome.record.firing,
                  'intent-collision',
                  JSON.stringify({ file, sibling: claim.branch, intent: claim.intent }),
                  now(),
                );
            } catch {
              /* collision telemetry is best-effort — never fail the flight over it */
            }
          }
          if (collisions.length > 0) {
            lastFailureFeedback =
              'INTENT-CLAIM VIOLATION — your last shipped commit touched a file a sibling\n' +
              'had declared as its intent (a hard-rule breach; the fleet digest showed the\n' +
              'claim). Do NOT continue in that area this firing — pick different work:\n' +
              collisions
                .map((c) => `- ${c.file} is claimed by ${c.claim.branch}: "${c.claim.intent}"`)
                .join('\n');
          }
          clearDeclaredIntent(worktreeRoot);
        } else if (!claimSurvivesFiring(outcome.record.gateResult)) {
          // A no-ship ending that is NOT a checkpointed death (noop, reverted
          // unit, gate crash, died on a clean tree) ABANDONED its declared
          // unit — retire the claim so it can't shadow ghost work.
          clearDeclaredIntent(worktreeRoot);
        }
        proposedCount = harvestProposals(store, projectId, outcome, existingTitles, proposedCount);
        // NOOP→VERDICT (EVALUATION-2026-08-20-sota.md §3.2/§4 lever 6): make a
        // no-commit firing's contribution visible instead of letting it die in
        // a log line — a silent noop (no PROPOSALS verdict) is waste, one that
        // named split/close/deprioritize/blocked is a real, countable "no".
        const noopClass = classifyNoop(outcome.record.gateResult, outcome.record.proposals);
        if (noopClass === 'silent') {
          out(
            '  ⚠ silent noop — no verdict on the work considered; telemetry counts this as waste (NOOP→VERDICT)',
          );
        } else if (noopClass === 'verdict-carrying') {
          out(
            '  ✓ verdict-carrying noop — the agent named why nothing shipped; counted as contributed (NOOP→VERDICT)',
          );
        }
        // Follow-through (flight/completion.ts verdictDeferTargetsForFiring):
        // a close/blocked verdict proposal hands its named task(s) to the
        // OPERATOR — defer them so no firing (this flight or a sibling's)
        // pays to re-reach the same verdict while the proposal sits in the
        // approval queue. Runs on EVERY firing's proposals, not gated behind
        // noopClass: a firing that ships unrelated work can still file a
        // verdict about a DIFFERENT task, and that verdict must defer its
        // target the same as a pure noop's would — the previous noop-only
        // gate left exactly those verdicts permanently unenforced, the live
        // starvation this fix closes. Rejecting the proposal and re-queueing
        // the task is the operator's one-click undo.
        for (const deferId of verdictDeferTargetsForFiring(
          claimedTaskId,
          outcome.record.proposals,
        )) {
          const row = store.db.prepare('SELECT status FROM tasks WHERE id = ?').get(deferId) as
            { status: string } | undefined;
          if (!row) continue;
          // The CLAIMED task is `in_progress` at this point by definition —
          // the queued-only guard below silently neutered claimDefer's whole
          // purpose (live 2026-08-23: fleet-3's D-1 verdict deferred the two
          // unclaimed BRAND siblings but left its OWN claimed task queued
          // once the finally-sweep released it, and the next round re-paid
          // for the same verdict). Release our own claim first —
          // releaseTaskClaim's `assignee = instanceKey` guard means a
          // sibling's active claim stays untouchable — then defer as usual.
          if (row.status === 'in_progress') {
            if (!releaseTaskClaim(store, deferId, instanceKey, now())) continue;
          } else if (row.status !== 'queued') {
            continue;
          }
          if (setTaskStatus(store, deferId, 'deferred', Date.now())) {
            benchedTasks.add(deferId);
            out(
              `  ⏸ ${deferId} deferred pending your decision on its verdict proposal (no more re-picks).`,
            );
          }
        }
        if (otlpConfig) {
          const result = await exportOtlpResourceSpans(
            toOtlpResourceSpans(outcome.record),
            otlpConfig,
          );
          if (!result.ok) {
            out(`  ⚠ OTLP export failed: ${result.error ?? `HTTP ${result.status}`}`);
          }
        }
        // A turn-cap death never reaches the gate, so the gate wrapper above
        // can't explain it — inject the death AND the dead firing's recorded
        // exploration trail as the next firing's feedback (nothing is lost:
        // file changes were checkpointed by the engine; the trail below
        // recovers the knowledge; firing 48 flew blind after 47 died at 47's cap).
        if (outcome.record.maxTurnsHit && !outcome.record.shipped) {
          const trail = activityTrail(store, projectId, outcome.record.firing, instanceId);
          lastFailureFeedback =
            `THE PREVIOUS FIRING DIED AT THE TURN CAP (${FLY_MAX_TURNS} turns) before committing. ` +
            'Pick a SMALLER unit this firing: commit a verifiable slice EARLY; if it grows, ' +
            'pack a checkpoint commit instead of pushing on.' +
            (trail.length > 0
              ? `\nIts recorded exploration trail (RESUME from here — do not re-read it all):\n${trail}`
              : '');
        }
      },
    };

    out('');
    out(
      totalBudgetUsd !== undefined
        ? `Flying with REAL Claude — auth: ${auth.mode}, $${budgetUsd} PER firing, up to $${totalBudgetUsd} TOTAL.`
        : `Flying with REAL Claude — auth: ${auth.mode}, $${budgetUsd} PER firing, up to ${firings} firing(s).`,
    );
    out('This spends subscription quota and does real autonomous work (gated + revertible).');
    const flightStartTs = now(); // scopes this flight's telemetry (post-flight triage stats)

    // The self-sorting brain (founder directive: "the pilot knows what to
    // focus on at every moment, on every run"): factor-fed board triage runs
    // at TAKEOFF — so this very flight starts on the right work — and again
    // post-flight, so the next run inherits a fresh sort. Judgment (leverage,
    // unblocking, diminishing returns) comes from the cheap model over
    // measured per-task evidence; the runaway guard stays in CODE
    // (flight/triage-factors.ts) and demotes regardless of model opinion.
    // Extracted to flight/board-triage.ts (SHELL DECOMP: pure move, no
    // behavior change) — deps captured once, reused at both call sites below.
    const boardTriageDeps = { store, projectId, target, config, auth, pidRegistry, now };

    // Takeoff sort — the flight's FIRST act, never fatal to it.
    try {
      await runBoardTriage(boardTriageDeps, 'takeoff — fresh sort before the first firing');
    } catch {
      out('  ⇅ takeoff triage skipped (model call failed)');
    }

    const summary = await runLoop(loop, config, { maxIterations: firings });

    // Reconciliation safety net: `onFiringComplete` (markTaskDoneIfShipped) already
    // closes the loop between firings, but this catches anything it couldn't —
    // e.g. a task shipped in an EARLIER flight (before this project ever had the
    // per-firing hook) that's still stranded "queued" on the board.
    for (const task of reconcileShippedTasks(store, projectId, now())) {
      out(`  ✓ board task done (gate-verified ship): ${task.id} — ${task.title}`);
    }

    // End-of-flight ritual sweeps — each one’s full contract is documented in
    // flight/post-flight-sweeps.ts (SHELL DECOMP: pure move, no behavior change).
    await runReconciliationProposalSweep(store, projectId, vcs);

    runVerifyBySweep(store, projectId, now);

    runFamilyRunawaySweep(store, projectId, now);

    // THIS flight's own firing/shipped counts (scoped by flightStartTs, not
    // lifetime) — shared by post-flight TRIAGE below and the SELF-STUDY
    // updater after it, so both agree on what "this flight" shipped.
    const flightFiringStats = store.db
      .prepare(
        'SELECT COUNT(*) AS c, COALESCE(SUM(shipped),0) AS s FROM metrics WHERE project_id = ? AND created_at >= ?',
      )
      .get(projectId, flightStartTs) as { c: number; s: number };

    // Post-flight TRIAGE (the founder's ask): the autopilot reviews its open
    // queue and sorts it best-first for the next run. One cheap tool-less model
    // call; applied via the SAME reorderTasks the operator's ↑/↓ use, so the
    // operator can always override. Proposals awaiting approval are untouched.
    try {
      await runBoardTriage(
        boardTriageDeps,
        `this flight ran ${flightFiringStats.c} firing(s), ${flightFiringStats.s} shipped`,
      );
    } catch {
      out('  ⇅ board triage skipped (model call failed)');
    }

    // SELF-STUDY updater (web-msniol02-ho2w5x): regenerate
    // docs/SELF-STUDY/PAPER.md's DATA:SUMMARY block and append one dated §8
    // Evidence Log entry, but only when this flight actually shipped
    // evidence (selfStudyInvocation's trigger, docs/SELF-STUDY/PAPER.md §8).
    // The paper is THIS engine repo's own living document, not necessarily
    // the flown target's — skip cleanly (no spawn at all) when it or the
    // generator script isn't present in this process's cwd. Best-effort: a
    // spawn failure must never fail the flight.
    //
    // PARALLEL FLIGHTS 6/6: this ritual writes into THIS checkout's working
    // tree no matter which project `target` is, so a sibling flight against
    // a DIFFERENT project ending at the same moment would race the regen +
    // commit below. withRitualLock serializes it across processes (waits for
    // the sibling rather than racing it) using the same lockfile directory
    // as the per-project engine lock.
    try {
      const paperPath = join(process.cwd(), 'docs', 'SELF-STUDY', 'PAPER.md');
      const scriptPath = join(process.cwd(), 'scripts', 'self-study', 'generate-data.mjs');
      const invocation = selfStudyInvocation(
        process.execPath,
        scriptPath,
        process.env,
        flightFiringStats.c,
        flightFiringStats.s,
      );
      if (invocation && existsSync(paperPath) && existsSync(scriptPath)) {
        const ritualLockPath = join(dirname(dbPath), RITUAL_LOCK_FILE_NAME);
        const committed = await withRitualLock(ritualLockPath, async () => {
          execFileSync(invocation.command, invocation.args, {
            cwd: process.cwd(),
            env: invocation.env,
            stdio: 'ignore',
          });
          // PAPER commit ritual (RING-0 SUPERVISOR, web-msq9hfhd-ebmy8k): the doc
          // lives in THIS engine repo's cwd, not necessarily `target` (a flown
          // external project), so it's committed against its own repo — an
          // uncommitted regen used to leave a dirty tree that silently blocked
          // self-landing (GitVcs.land refuses on a dirty tree; see commit 6e33f20).
          return commitSelfStudyIfDirty(new GitVcs(process.cwd()));
        });
        out(
          committed === true
            ? '  📄 self-study data + evidence log refreshed and committed (docs/SELF-STUDY/PAPER.md).'
            : committed === false
              ? '  📄 self-study data + evidence log refreshed (docs/SELF-STUDY/PAPER.md).'
              : '  📄 self-study update skipped (a sibling flight held the ritual lock too long).',
        );
        // CONTAINMENT vs OPERATOR (web-msu3x5ub-vqxjhu): the ritual above just
        // committed into process.cwd() — a guarded path whenever it isn't
        // flightRoot, which is virtually always. Left unaccounted for, the
        // FINAL containment check below reads this SANCTIONED, first-party
        // commit as an escape and aborts an otherwise-healthy flight. Re-
        // baseline it here, the same way onFiringComplete re-baselines
        // target right after a sync-back — only a movement THIS re-snapshot
        // doesn't capture still reads as a breach.
        if (committed === true) {
          guarded = snapshotGuardedHeads(headReader, guardedPathsFor(flightRoot, guardCandidates));
        }
      }
    } catch {
      out('  📄 self-study update skipped (best-effort, non-fatal).');
    }

    // FLIGHT-END SYNC-BACK RETRY (web-msupuosk-gjll3p): onFiringComplete's
    // sync-back refuses (ok:false, logs a warning, moves on) whenever
    // target's checkout is dirty at that exact instant — e.g. the operator
    // mid-edit in their own live checkout. That refusal used to be final:
    // if target stayed dirty for the rest of the flight, every firing's
    // commits sat stranded on the worktree branch, invisible to the
    // dashboard's LANDING card (it only ever reads target's own checked-out
    // branch) — 144 commits over 2 days before this was caught. One more
    // attempt here, placed AFTER the self-study ritual above (the only other
    // write this flight makes into `target`, when self-hosting), gives a
    // flight that was dirty-at-firing-time one last chance to land before it
    // ends, instead of waiting on the next flight's own catch-up sync to
    // happen to catch it. Best-effort, same as every sync-back call site:
    // still-dirty target just leaves the work parked for next time.
    if (flightRoot !== target) {
      const finalSync = await syncWorktreeBranch(target, targetBranch, worktreePlan.branch);
      if (finalSync.ok) {
        guarded = snapshotGuardedHeads(headReader, guardedPathsFor(flightRoot, guardCandidates));
        out(`  🔁 flight-end sync-back: ${finalSync.details}`);
        // Last lane of the flight just landed on `targetBranch` — no more
        // per-firing cadence pressure, so this is the one sync-back that can
        // afford the FULL gate (board web-mtbeu5d3-n09acx). Same alarm-only
        // contract as the per-firing typecheck above.
        await gateConvergedBranch(targetBranch, finalSync.details, {
          gate: fullConvergedGate,
          out,
          recordRed: recordConvergenceRed,
        });
      } else {
        out(`  ⚠ flight-end sync-back still refused: ${finalSync.details}`);
        flightSyncBackRefusals++;
        // CONVERGENCE MADE LOUD (board web-mtb8i2mj-i0n1c7) — see the
        // matching per-firing insert above. `firing_id` is null here, same
        // as the near-miss-debrief event just below: this retry runs once,
        // after the firing loop, not attributable to any single firing.
        try {
          store.db
            .prepare(
              'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run(
              projectId,
              null,
              'sync-back-refusal',
              JSON.stringify({ details: finalSync.details }),
              now(),
            );
        } catch {
          /* sync-back-refusal telemetry is best-effort — never fail the flight over it */
        }
        // STRANDED-WORK ESCALATION (EVALUATION 2026-08-30): a flight whose
        // FINAL sync-back still refuses ends with its whole round parked on
        // the worktree branch, and until now said so only in this log — the
        // 38-commit strand sat behind 21 identical warnings nobody reads
        // mid-flight. A MERGE CONFLICT refusal can never resolve itself (the
        // retry loop above only helps the dirty-checkout case), so it now
        // lands in the operator's approval inbox as a task naming the branch
        // and the refusal. Deduped on the branch name: a second flight over
        // the same stranded branch must not stack a second identical task.
        try {
          const strandTitle = `STRANDED SYNC-BACK: flight ended with its commits parked on ${worktreePlan.branch} — ${finalSync.details}`;
          const open = store.db
            .prepare(
              "SELECT COUNT(*) c FROM tasks WHERE project_id = ? AND status IN ('queued','in_progress','needs_approval') AND title LIKE ?",
            )
            .get(
              projectId,
              `STRANDED SYNC-BACK: flight ended with its commits parked on ${worktreePlan.branch}%`,
            ) as {
            c: number;
          };
          if (open.c === 0) {
            createTask(store, {
              id: `ap-${now().toString(36)}-strand`,
              projectId,
              title: strandTitle.slice(0, 300),
              severity: 'high',
              dimension: 'process',
              source: 'self',
              createdAt: now(),
            });
            out('  📮 stranded-work task filed to the operator inbox.');
          }
        } catch {
          /* escalation is best-effort — never fail the flight over it */
        }
      }
    }

    // SAFETY-II NEAR-MISS RITUAL (board web-mt1qat5h-nxzgjs;
    // docs/DOCTRINE-WEAKPOINT-RESEARCH.md "Lens 4"): fold this flight's
    // weak-signal accumulators (declared before the loop) into one
    // NearMissCounts row, persist it so a class that keeps recurring across
    // FLIGHTS — not just firings — can be caught before it becomes an
    // incident (the sync-back refusal above was a logged near-miss for two
    // days before it stranded 144 commits). Best-effort: a query/insert
    // hiccup must never fail the flight itself.
    try {
      const thisFlightNearMiss: NearMissCounts = {
        guardDenials: flightGuardDenials,
        intentCollisions: flightIntentCollisions,
        rescues: flightRescues,
        syncBackRefusals: flightSyncBackRefusals,
        checkpointErrors: flightCheckpointErrors,
      };
      const debrief = nearMissDebriefLine(thisFlightNearMiss);
      if (debrief) out(`  🩹 ${debrief}`);
      store.db
        .prepare(
          'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .run(projectId, null, 'near-miss-debrief', JSON.stringify(thisFlightNearMiss), now());
      // Newest-first history, THIS flight's just-persisted row included
      // (INSERT above landed before this SELECT) — exactly the order
      // detectRecurringNearMissClass expects.
      const history = nearMissDebriefEvents(store.db, projectId)
        .map((row) => parseNearMissCounts(row.payload))
        .filter((c): c is NearMissCounts => c !== null);
      const recurring = detectRecurringNearMissClass(history);
      if (recurring) {
        store.db
          .prepare(
            'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run(projectId, null, 'near-miss-recurring', JSON.stringify(recurring), now());
        out(
          `  ⚠ recurring near-miss: ${nearMissClassLabel(recurring.nearMissClass)} stayed nonzero ` +
            `across the last ${recurring.streak} flights — SAFETY-II near-miss ritual (web-mt1qat5h-nxzgjs).`,
        );
      }
    } catch {
      /* near-miss ritual sweep is best-effort — never fail the flight over it */
    }

    runDocFreshnessSweep(store, projectId, now);

    await runClosedTaskAuditSweep(store, projectId, vcs, now);

    runSoulMiningSweep(store, projectId, now);

    runFleetWisdomSweep(store, now);

    await runStoreBackupSweep(store, dbPath, now);

    const stats = store.db
      .prepare(
        'SELECT COUNT(*) AS c, COALESCE(SUM(shipped), 0) AS s FROM metrics WHERE project_id = ?',
      )
      .get(projectId) as { c: number; s: number };
    out('');
    out(formatFlightDoneLine(summary, firings, stats.s, stats.c));
    // Final containment verdict — a breach here means the flight touched a repo
    // outside its target; surface it loudly and exit non-zero so it can't pass silently.
    if (checkContainment() || breaches.length > 0) {
      out('');
      out('⛔ CONTAINMENT BREACH DETECTED — the flight modified a repository outside its target.');
      for (const b of breaches) out(`   ${describeBreach(b)}`);
      out('   Review + revert the out-of-bounds commit(s). See docs/FLIGHT-CONTAINMENT.md.');
      process.exitCode = 1;
    }
    out('Open the dashboard to see the flight log + telemetry:  pnpm dashboard:start');
  } finally {
    // The flight is over — never leave the project stuck on 'flying' (the status
    // is a live fact, not a history). Runs even on crash/SIGTERM via finally.
    // A pause honored above lands on 'paused' instead of 'registered' — that's
    // the whole point of Pause (hold until Resume), not just "stopped".
    try {
      store.db
        .prepare(
          `UPDATE projects SET status = ?, pause_requested = 0, updated_at = ? WHERE root_path = ?`,
        )
        .run(paused ? 'paused' : 'registered', now(), target);
    } catch {
      /* closing anyway */
    }
    // Flight-end claim sweep: hand back every board task this instance still
    // holds (slice-lease claims survive per-firing release on purpose — see
    // releaseInstanceClaims). A PAUSED flight keeps its claims: Resume is the
    // same instance continuing the same unit, and releasing here would let a
    // sibling steal the half-done work out from under it.
    try {
      if (!paused && claimSweepProjectId !== null) {
        const released = releaseInstanceClaims(store, claimSweepProjectId, instanceKey, now());
        if (released > 0) {
          out(`  ↩ handed ${released} claimed task(s) back to the fleet (flight-end sweep).`);
        }
      }
    } catch {
      /* closing anyway */
    }
    store.close();
    lock.release();
  }
}

void main();
