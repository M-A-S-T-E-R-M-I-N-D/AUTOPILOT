// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Builds the "fly this folder" real spawn (FLIGHT PROCESS DECOUPLING,
 * web-msp5g6lw-cvmr8n): a flight is a long-lived, quota-spending child process
 * that must outlive the dashboard server that launched it. `detached: true`
 * puts the child in its own process group; on Windows specifically this ALSO
 * keeps it out of the server process's job object, so the server dying —
 * crash, operator stop, or `landing/self-restart.ts`'s own `process.exit()`
 * after a self-landed rebuild — no longer tears the flight down with it. That
 * was a real "suicide class": EXECUTE landing itself, mid-flight, killed the
 * very flight that might have triggered it. `unref()` (kept, unchanged) only
 * keeps the event loop from waiting on the child; it does nothing for this
 * class of bug — `detached` is the actual fix.
 *
 * PARALLEL UNLOCK C (N-way same-folder spawn): `instanceId`, when given,
 * rides as the `AUTOPILOT_FLIGHT_INSTANCE_ID` env var (not argv — keeps the
 * positional argv shape byte-for-byte for every existing caller, and avoids
 * a gap when `totalBudgetUsd` is omitted but `instanceId` isn't) and
 * derives its OWN log file via `flightLogPathFor`. `fly.ts` reads that env
 * var to fold the same instance into its lock filename and worktree plan —
 * without every one of those three, a second same-folder instance would
 * collide with the first (same lock, same worktree, same log) instead of
 * flying alongside it.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FlightRunnerDeps, SpawnedFlight } from './runner.js';

/**
 * MACHINE BUDGET as code (fleet calibration, 2026-08-17): three fleet
 * instances once launched all-core test runs simultaneously and starved the
 * box until the dashboard process died — taking all five flights with it.
 * The FLEET prompt's machine-budget rule is awareness only; this is the
 * enforcement. Every FLEET member (instanceId set) spawns with a small
 * vitest worker ceiling in its env, inherited by every gate `vitest run`
 * AND any `pnpm test` the agent's own Bash launches inside the worktree —
 * so N concurrent gates can never multiply into N × all-cores. Solo flights
 * are never capped: they have the machine to themselves, and full default
 * parallelism is strictly faster there. Both VITEST_MAX_FORKS (today's
 * default `forks` pool) and VITEST_MAX_THREADS (a future `threads` config)
 * are set so a pool change can't silently reopen the hole.
 */
const FLEET_GATE_WORKERS_DEFAULT = 2;

/** The per-instance vitest worker cap — operator-tunable via
 *  AUTOPILOT_FLEET_GATE_WORKERS; anything but a positive integer falls back
 *  to the default rather than uncapping (fail-closed: the whole point is
 *  that a typo must not resurrect the starvation class). */
function fleetGateWorkers(): string {
  const raw = Number(process.env['AUTOPILOT_FLEET_GATE_WORKERS']);
  return String(Number.isInteger(raw) && raw > 0 ? raw : FLEET_GATE_WORKERS_DEFAULT);
}

/** STOP ESCALATION grace window (STPA finding web-mt1qa7go-9zjnc0): how long
 *  `kill()` waits for the SIGTERM it just sent to actually land before
 *  escalating to a forceful, whole-tree kill. */
export const STOP_GRACE_MS = 10_000;

/** Real escalation strategy for a child that outlived the grace window
 *  (STPA finding web-mt1qa7go-9zjnc0): past incidents needed a manual
 *  taskkill to clear a flight whose CLI child ignored SIGTERM forever.
 *  `platform` defaults to the real `process.platform` — an explicit
 *  override (same DI seam as `needsShell` in landing/self-restart.ts) makes
 *  both branches directly unit-testable regardless of which OS the test
 *  actually runs on. */
export function forceKillProcess(pid: number, platform: NodeJS.Platform = process.platform): void {
  if (platform === 'win32') {
    // `/t` recurses the WHOLE process tree — the SIGTERM `kill()` already
    // sent only ever reached the immediate child, never grandchildren the
    // CLI spawns itself.
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' }).on('error', () => {
      // A missing/already-exited pid lost the escalation race to a
      // legitimate exit — never crash the dashboard server over that.
    });
    return;
  }
  try {
    // Negative pid targets the whole detached process group (`detached:
    // true` below put the child in its own group at spawn time), not just
    // the immediate child.
    process.kill(-pid, 'SIGKILL');
  } catch {
    // Already gone — same race as the Windows branch above.
  }
}

/** Real `FlightRunnerDeps['spawnFlight']`: spawns the compiled `fly` entry
 *  (`flyEntry`) detached + unref'd, capturing stdout+stderr to the path
 *  `flightLogPathFor(folder)` resolves to — a silent `stdio: 'ignore'`
 *  previously made a stalled flight look like "nothing happened" — kept as-is
 *  here, only the detachment (and, later, the per-folder path) changed. Each
 *  folder gets its OWN log file (PARALLEL FLIGHTS 4/6): two concurrent
 *  flights against different folders must not interleave their output into
 *  one shared file with no way to attribute a line to either project. */
export function createSpawnFlight(
  flyEntry: string,
  flightLogPathFor: (folder: string, instanceId?: string) => string,
  /** STOP ESCALATION seam (STPA finding web-mt1qa7go-9zjnc0) — defaults to
   *  the real cross-platform escalation; tests inject a spy instead of
   *  depending on fake timers racing a real taskkill/SIGKILL. */
  forceKill: (pid: number) => void = forceKillProcess,
): FlightRunnerDeps['spawnFlight'] {
  return (
    folder,
    firings,
    budgetUsd,
    totalBudgetUsd,
    instanceId,
    taskScope,
    siblingsFlying,
  ): SpawnedFlight => {
    const flightLogPath = instanceId
      ? flightLogPathFor(folder, instanceId)
      : flightLogPathFor(folder);
    mkdirSync(dirname(flightLogPath), { recursive: true });
    const logFd = openSync(flightLogPath, 'a');
    const argv = [flyEntry, folder, String(firings), String(budgetUsd)];
    // TOTAL-SPEND mode rides as a 5th argv only when the operator set it —
    // fixed-firings flights keep the exact argv shape they always had.
    if (totalBudgetUsd !== undefined) argv.push(String(totalBudgetUsd));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // AUTOPILOT_FLIGHT=1 marks every process tree spawned from here as
      // "inside a flight" — inherited by any Bash-tool subprocess the agent
      // spawns too (env is inherited by default), so DashboardControl's own
      // stop()/restart() guard (control.ts) sees it no matter how the CLI
      // gets invoked (`pnpm dashboard:stop`, the .cmd launcher, direct node).
      AUTOPILOT_FLIGHT: '1',
      // PARALLEL UNLOCK C: only set when this spawn is one instance of a
      // same-folder N-way fleet — every existing single-instance caller
      // omits instanceId, so this key never rides on their child at all.
      ...(instanceId ? { AUTOPILOT_FLIGHT_INSTANCE_ID: instanceId } : {}),
      // MACHINE BUDGET as code — the vitest-worker cap (fleetGateWorkers
      // above) applies to ANY spawn that's actually concurrent with another
      // flight, not just one carrying an instanceId (STPA finding
      // web-mt1qa7ij-c6wqgi: the "base"/no-instanceId flight starting while
      // siblings already fly was escaping the cap entirely — the registry
      // forwards its live running count as `siblingsFlying` so this stays
      // capped regardless of identity). Solo (nothing else running, no
      // instanceId) is still never capped — it has the machine to itself.
      ...(instanceId || siblingsFlying
        ? { VITEST_MAX_FORKS: fleetGateWorkers(), VITEST_MAX_THREADS: fleetGateWorkers() }
        : {}),
    };
    // FLEET SCOPE PARTITIONER: the disjoint board scope this instance works
    // first (spec-scoped decomposition — see flight/scope-partition.ts).
    // Comma-joined ids; explicitly DELETED (not just omitted) when no scope
    // was given, because `...process.env` above already copied over this
    // OWN process's AUTOPILOT_FLEET_TASK_SCOPE when it is itself a scoped
    // fleet member — an unscoped child spawn must never inherit its
    // parent's partition, or it silently sees a narrowed board instead of
    // the whole one.
    if (taskScope && taskScope.length > 0) {
      env['AUTOPILOT_FLEET_TASK_SCOPE'] = taskScope.join(',');
    } else {
      delete env['AUTOPILOT_FLEET_TASK_SCOPE'];
    }
    const child = spawn(process.execPath, argv, {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', logFd, logFd],
      detached: true,
    });
    child.unref(); // the listening socket keeps the server alive, not the child
    return {
      pid: child.pid ?? null,
      onExit: (cb) => {
        child.once('exit', (code) => cb(code));
        child.once('error', () => cb(null));
      },
      kill: () => {
        child.kill(); // SIGTERM — the flight's finally-block closes its store cleanly
        // STOP ESCALATION (STPA finding web-mt1qa7go-9zjnc0): a hung CLI
        // child has, in past incidents, ignored SIGTERM forever — only a
        // manual taskkill cleared it. Escalate to a forceful kill if the
        // child hasn't actually exited within the grace window; unref'd so
        // a pending escalation never keeps the dashboard server alive on
        // its own.
        const pid = child.pid;
        if (pid === undefined) return;
        const escalate = setTimeout(() => forceKill(pid), STOP_GRACE_MS).unref();
        child.once('exit', () => clearTimeout(escalate));
      },
    };
  };
}
