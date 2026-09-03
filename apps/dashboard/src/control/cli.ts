#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { DashboardControl } from './control.js';
import { ghDoctorCheck } from './gh-doctor.js';
import { ciRunReport } from './ci-status.js';
import { maintenanceSweepReport } from './maintenance-sweep.js';
import { DEFAULT_PORT } from '../server/server.js';
import { waitForHealth } from '../ready.js';
import { openBrowser } from '../browser.js';
import { runWatchdog } from './watchdog.js';
import {
  flightWatchdogTick,
  createFlightWatchdogControl,
  canSpawnFlight,
} from './flight-watchdog.js';
import { fleetFlightWatchdogTick, type FleetFlightWatchdogControl } from './fleet-watchdog.js';
import { landWatchdogTick, createLandWatchdogControl } from './land-watchdog.js';
import { createSpawnFlight } from '../flight/spawn-flight.js';
import { DEFAULT_BUDGET_USD } from '../flight/runner.js';
import { deriveFlyProjectId, flightLogFileName } from '../flight/lock.js';
import { resolveDbPath } from '../read/config.js';
import { runFleetLaunch, parseFleetCliArgs } from '../flight/fleet-launch.js';
import {
  openStore,
  listProjects,
  recentTasks,
  vacuumStore,
  type ProjectRow,
} from '@autopilot/store';
import type { ControlConfig, StatusResult } from './types.js';
import type { LandingExecuteApiResult } from '../landing/execute.js';

/** `watch`'s default check cadence — how often the daemon probes the server. */
const DEFAULT_WATCHDOG_INTERVAL_MS = 15_000;
/** `watch <folder>`'s default firing count per spawned flight — cautious,
 *  matches `dashboard:fly`'s own DEFAULT_FIRINGS single-firing default. */
const DEFAULT_WATCH_FLY_FIRINGS = 1;

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** DashboardControl.stop()/restart() throw when AUTOPILOT_FLIGHT=1 (control.ts's
 *  suicide guard) — surfaced here as a message + non-zero exit instead of a
 *  raw stack trace, since a flight reading this output is the actual audience. */
function reportRefusal(err: unknown): void {
  out(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}

/**
 * After a detached start, wait until the server actually answers, then open the
 * browser at its URL. Avoids the connection-refused flash of opening the page
 * before the freshly spawned server is listening.
 */
async function openWhenReady(r: StatusResult): Promise<void> {
  if (!r.url) return;
  const ready = await waitForHealth(`${r.url}/api/health`);
  if (process.env['AUTOPILOT_NO_OPEN'] !== '1') openBrowser(r.url);
  const hint = ready ? '' : '  (still starting — refresh in a moment)';
  out(`dashboard ${r.state} → ${r.url}${hint}`);
  out(
    '  window can be closed; it keeps running. Stop it with STOP-DASHBOARD.cmd or "pnpm dashboard:stop".',
  );
}

/** The landing-ritual half of RING-0 SUPERVISOR (web-msq9hfhd-ebmy8k): POSTs
 *  to the LIVE dashboard server's own `/api/landing/execute` — the exact
 *  same gate-then-merge policy the dashboard's LANDING card EXECUTE button
 *  drives, including its already-wired rebuild+restart for a self-hosted
 *  target (server/main.ts's `selfRestart`). Reusing that endpoint (instead
 *  of a second in-process implementation here) means the watchdog never
 *  needs its own rebuild/restart logic at all. A network hiccup degrades to
 *  "landed nothing this tick" — the next tick simply retries. */
function createHttpLand(
  port: number,
): (projectId: string) => Promise<LandingExecuteApiResult | null> {
  return async (projectId) => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/landing/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project: projectId }),
      });
      return (await res.json()) as LandingExecuteApiResult;
    } catch {
      return null;
    }
  };
}

/** Fleet mode's flight-spawn seam (RING-0 FLEET WATCHDOG,
 *  docs/epics/0003-ring-0-fleet-watchdog.md, web-msqhh7kh-ptjodv): POSTs to
 *  the LIVE dashboard server's own `/api/fly` — the exact same
 *  FlightRunnerRegistry `start()` path the manual multi-fly UI already
 *  drives, including its `already flying — one flight at a time` per-folder
 *  refusal and its `maxConcurrent` FIFO queue. Routing fleet spawns through
 *  this HTTP seam (instead of a raw child spawn, like the single-folder path
 *  below uses) is what makes the operator's concurrency cap hold fleet-wide
 *  with no second cap implemented here. A network hiccup or a same-folder
 *  refusal degrades to "nothing spawned this tick" — harmless, the next tick
 *  simply retries. `initiatedBy: 'fleet-watchdog'` (StartFlightInput,
 *  flight/runner.ts) is the epic's last acceptance criterion: it rides the
 *  request into the registry's FlightStatus so the dashboard's per-project
 *  flight card can tell an operator this project started flying on its own,
 *  not because they clicked Fly. */
function createHttpSpawnFlight(port: number): (folder: string) => void {
  return (folder) => {
    void fetch(`http://127.0.0.1:${port}/api/fly`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        folder,
        firings: DEFAULT_WATCH_FLY_FIRINGS,
        budgetUsd: DEFAULT_BUDGET_USD,
        initiatedBy: 'fleet-watchdog',
      }),
    }).catch(() => {});
  };
}

const here = dirname(fileURLToPath(import.meta.url)); // dist/control
const config: ControlConfig = {
  stateDir: join(process.cwd(), '.autopilot-run'),
  serverEntry: join(here, '..', 'server', 'main.js'),
  port: Number(process.env['AUTOPILOT_DASHBOARD_PORT'] ?? DEFAULT_PORT),
  nodeBin: process.execPath,
};

const control = new DashboardControl(config);
const command = process.argv[2] ?? 'status';

async function main(): Promise<void> {
  switch (command) {
    case 'start': {
      await openWhenReady(control.start());
      break;
    }
    case 'stop': {
      try {
        control.stop();
        out('dashboard stopped');
      } catch (err) {
        reportRefusal(err);
      }
      break;
    }
    case 'status': {
      const r = control.status();
      out(r.state === 'running' ? `running (pid ${r.pid}) → ${r.url}` : r.state);
      break;
    }
    case 'restart': {
      try {
        await openWhenReady(await control.restart());
      } catch (err) {
        reportRefusal(err);
      }
      break;
    }
    case 'doctor': {
      // The optional gh probe runs HERE, not in DashboardControl.doctor():
      // `gh auth status` may touch the network, and the in-process doctor
      // callers must not pay that latency (epic 0006 slice 1).
      for (const c of [...control.doctor(), ghDoctorCheck()]) {
        out(`[${c.ok ? 'ok' : '!!'}] ${c.name}: ${c.detail}`);
      }
      break;
    }
    case 'ci-status': {
      // gh run babysitting (epic 0010 slice 2, board web-mstdokr6-qgxqz8):
      // read-only, latest run per workflow file — never retries or cancels.
      for (const r of ciRunReport()) {
        out(`[${r.ok ? 'ok' : '!!'}] ${r.workflow}: ${r.detail}`);
      }
      break;
    }
    case 'maintenance-sweep': {
      // Unifying triage surface (epic 0010 slice 3, board web-mstdokr6-qgxqz8):
      // dependabot backlog + doc-freshness drift + release plan + CI runs,
      // one read instead of six. Read-only throughout.
      const r = await maintenanceSweepReport();
      out(`[${r.dependabot.ok ? 'ok' : '!!'}] dependabot: ${r.dependabot.detail}`);
      out(`[${r.docFreshness.ok ? 'ok' : '!!'}] doc-freshness: ${r.docFreshness.detail}`);
      for (const f of r.docFreshness.findings) {
        out(`      - ${f.doc}: ${f.newestStaleSubject} changed more recently`);
      }
      out(`[${r.release.ok ? 'ok' : '!!'}] release: ${r.release.detail}`);
      for (const c of r.ciRuns) {
        out(`[${c.ok ? 'ok' : '!!'}] ci: ${c.workflow}: ${c.detail}`);
      }
      break;
    }
    case 'vacuum': {
      // Operator-invoked housekeeping (packages/store/src/maintenance.ts):
      // reclaims the FTS5 `project_search` freelist. Deliberately not run by
      // `watch` or any other automatic ritual — VACUUM briefly needs as much
      // free disk as the store file itself, and rewrites the whole file, so
      // it must never fire while a sibling lane could be mid-transaction on
      // the same store.
      const store = openStore(resolveDbPath());
      try {
        const r = vacuumStore(store);
        const beforeMb = (r.sizeBeforeBytes / (1024 * 1024)).toFixed(1);
        const afterMb = (r.sizeAfterBytes / (1024 * 1024)).toFixed(1);
        const reclaimedMb = ((r.sizeBeforeBytes - r.sizeAfterBytes) / (1024 * 1024)).toFixed(1);
        out(`vacuum: ${beforeMb} MB → ${afterMb} MB (reclaimed ${reclaimedMb} MB)`);
      } finally {
        store.close();
      }
      break;
    }
    case 'watch': {
      const intervalMs = Number(
        process.env['AUTOPILOT_WATCHDOG_INTERVAL_MS'] ?? DEFAULT_WATCHDOG_INTERVAL_MS,
      );
      // Flight spawning (RING-0 SUPERVISOR, web-msq9hfhd-ebmy8k): naming a
      // folder opts THIS watch session into also keeping that one project
      // flying — every tick, spawn a flight whenever it's idle (never
      // onboarded or sitting `registered`). Omitting the folder keeps the
      // exact server-lifecycle-only behavior this command always had.
      const flyFolder = process.argv[3];
      // Guards the race between "spawned a flight" and "the flight finished
      // onboarding and wrote status='flying' to the store" (fly.ts) — without
      // it, a tick landing inside that window would see the project still
      // idle and spawn a second child. The second child is harmless either
      // way (fly.ts's own FileInstanceLock refuses a concurrent flight
      // against the same store), but tracking the exact child we launched
      // avoids the wasted spawn entirely instead of relying on that backstop.
      let spawnedFlightRunning = false;
      // Keyed the same per-folder way as the dashboard server (server/main.ts)
      // so a flight this watchdog spawns lands its log where the dashboard's
      // own /api/flightlog?project=<id> would look for it too.
      const rawSpawnFlight = createSpawnFlight(
        fileURLToPath(new URL('../fly.js', import.meta.url)),
        (folder) =>
          join(process.cwd(), '.autopilot', flightLogFileName(deriveFlyProjectId(folder))),
      );
      const watchFirings = Math.max(1, Number(process.argv[4] ?? DEFAULT_WATCH_FLY_FIRINGS) || 1);
      const watchBudgetUsd = Math.max(
        0.5,
        Number(process.argv[5] ?? DEFAULT_BUDGET_USD) || DEFAULT_BUDGET_USD,
      );
      // TOTAL-SPEND mode (mirrors fly.ts's own argv[5]): argv[6] present means
      // "keep firing until the remaining budget can't fund another firing"
      // instead of stopping at the fixed `firings` count — otherwise the
      // watchdog's flight spawning had no way to reach the mode the dashboard
      // UI and `pnpm dashboard:fly` already expose.
      const watchTotalBudgetArg = process.argv[6];
      const watchTotalBudgetUsd =
        watchTotalBudgetArg !== undefined
          ? Math.max(watchBudgetUsd, Number(watchTotalBudgetArg) || watchBudgetUsd)
          : undefined;
      const flightControl = flyFolder
        ? createFlightWatchdogControl({
            dbPath: resolveDbPath(),
            targetFolder: resolve(flyFolder),
            spawnFlight: (...args) => {
              const child = rawSpawnFlight(...args);
              spawnedFlightRunning = true;
              child.onExit(() => {
                spawnedFlightRunning = false;
              });
              return child;
            },
            firings: watchFirings,
            budgetUsd: watchBudgetUsd,
            ...(watchTotalBudgetUsd !== undefined ? { totalBudgetUsd: watchTotalBudgetUsd } : {}),
          })
        : null;
      // Landing (RING-0 SUPERVISOR, web-msq9hfhd-ebmy8k): the same opt-in
      // folder also keeps that project's completed work landed — hands-free,
      // no operator click on the LANDING card required. Re-entrancy guarded
      // the same way as flight spawning (`landInProgress`, below).
      let landInProgress = false;
      const landControl = flyFolder
        ? createLandWatchdogControl({
            dbPath: resolveDbPath(),
            targetFolder: resolve(flyFolder),
            land: createHttpLand(config.port),
          })
        : null;
      // Fleet mode (RING-0 FLEET WATCHDOG, docs/epics/0003-ring-0-fleet-
      // watchdog.md, web-msqhh7kh-ptjodv): omitting the folder ticks EVERY
      // registered project instead of pinning one — opt-in exactly like the
      // single-folder path above (fleet mode never runs unless an operator
      // starts `watch` with no folder). Reuses flightWatchdogTick's
      // FLYABLE_STATUSES boundary (via fleetFlightWatchdogTick) and
      // landWatchdogTick unchanged, looped over listProjects() fresh every
      // tick; no new spawn, idle-boundary, or concurrency logic invented here.
      const httpSpawnFlight = createHttpSpawnFlight(config.port);
      // Per-project counterpart to the single-folder path's `landInProgress`
      // boolean — also read by the fleet flight control below so a project
      // whose land is mid checkout/merge is never handed a fresh flight spawn
      // (the same race `canSpawnFlight`'s `landInProgress` guards for one
      // folder, applied per row instead of once).
      const fleetLandInProgress = new Set<string>();
      const fleetFlightControl: FleetFlightWatchdogControl | null = flyFolder
        ? null
        : {
            listProjects: () => {
              const store = openStore(resolveDbPath());
              try {
                return listProjects(store.db).filter((p) => !fleetLandInProgress.has(p.id));
              } finally {
                store.close();
              }
            },
            spawnFlight: (project) => httpSpawnFlight(project.root_path),
          };
      out(
        `watchdog: checking every ${intervalMs}ms — owns start/revive/replace` +
          (flightControl ? ` + flight spawning + landing (${resolve(flyFolder!)})` : '') +
          (fleetFlightControl
            ? ' + fleet flight spawning + landing (all registered projects)'
            : '') +
          '. Ctrl+C to stop.',
      );
      const ac = new AbortController();
      const stop = (): void => ac.abort();
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      await runWatchdog(
        control,
        {
          intervalMs,
          onTick: (r) => {
            if (r.revived) out(`  ↻ revived dashboard server → ${r.status.url}`);
            // Only attempt a flight once the server itself is confirmed up —
            // the dashboard is what actually records the flight's progress —
            // never while a flight this daemon already launched is still
            // running, and never while a landing tick has the target repo
            // mid checkout/merge (see canSpawnFlight).
            if (
              flightControl &&
              canSpawnFlight({
                serverRunning: r.status.state === 'running',
                spawnedFlightRunning,
                landInProgress,
              })
            ) {
              const fr = flightWatchdogTick(flightControl);
              if (fr.spawned) {
                out(`  🛫 spawned a flight (was ${fr.status ?? 'never onboarded'}) → ${flyFolder}`);
              }
            }
            // Only ever land a target confirmed idle right now — `land()`
            // checks out the base branch, which would race a live flight's
            // own commits — and never overlap two land attempts
            // (`landInProgress` mirrors `spawnedFlightRunning`'s own
            // re-entrancy guard above). `flightControl.projectStatus()` is a
            // fresh store read, so this catches a flight in progress
            // regardless of who started it, not just ones this daemon spawned.
            if (
              landControl &&
              flightControl &&
              r.status.state === 'running' &&
              !spawnedFlightRunning &&
              !landInProgress &&
              flightControl.projectStatus() !== 'flying'
            ) {
              landInProgress = true;
              void landWatchdogTick(landControl)
                .then((lr) => {
                  if (lr.overlaps?.length) {
                    const who = lr.overlaps
                      .map((w) => `${w.branch} (${w.files.join(', ')})`)
                      .join('; ');
                    out(
                      `  🛬 landing deferred — sibling unlanded work overlaps the same lines: ${who} — flagged for lead consolidation`,
                    );
                    return;
                  }
                  if (!lr.attempted || !lr.result) return;
                  out(
                    lr.result.ok
                      ? `  🛬 landed ${flyFolder} → main (${lr.result.details})`
                      : `  🛬 landing refused (${lr.result.reason}): ${lr.result.details}`,
                  );
                  if (lr.stragglers?.length) {
                    const who = lr.stragglers
                      .map((s) => `${s.branch} (+${s.commitCount})`)
                      .join('; ');
                    out(
                      `  🚧 straggler warning — sibling branches still unlanded (no overlap): ${who}`,
                    );
                  }
                })
                .finally(() => {
                  landInProgress = false;
                });
            }
            // Fleet flight spawning: fans flightWatchdogTick's exact per-
            // project decision across every registered project (via
            // fleetFlightWatchdogTick) — same server-running gate as the
            // single-folder path, since the dashboard is what actually
            // records each spawned flight's progress.
            if (fleetFlightControl && r.status.state === 'running') {
              const fr = fleetFlightWatchdogTick(fleetFlightControl);
              for (const project of fr.spawned) {
                out(
                  `  🛫 fleet-watchdog spawned a flight (was ${project.status}) → ${project.root_path}`,
                );
              }
            }
            // Fleet landing: the same per-project loop, landing whichever
            // idle projects have commits ahead of base. Skips a project
            // currently `flying` (its branch is live work in progress) and
            // one already mid-land this tick (`fleetLandInProgress` — also
            // consulted by fleetFlightControl.listProjects() above so a
            // flight is never spawned into the same race window).
            if (fleetFlightControl && r.status.state === 'running') {
              const store = openStore(resolveDbPath());
              let projects: readonly ProjectRow[];
              try {
                projects = listProjects(store.db);
              } finally {
                store.close();
              }
              for (const project of projects) {
                if (project.status === 'flying') continue;
                if (fleetLandInProgress.has(project.id)) continue;
                fleetLandInProgress.add(project.id);
                const fleetLandControl = createLandWatchdogControl({
                  dbPath: resolveDbPath(),
                  targetFolder: project.root_path,
                  land: createHttpLand(config.port),
                });
                void landWatchdogTick(fleetLandControl)
                  .then((lr) => {
                    if (lr.overlaps?.length) {
                      const who = lr.overlaps.map((w) => w.branch).join('; ');
                      out(
                        `  🛬 fleet-watchdog landing deferred for ${project.root_path} — sibling unlanded overlap: ${who} — flagged for lead consolidation`,
                      );
                      return;
                    }
                    if (!lr.attempted || !lr.result) return;
                    out(
                      lr.result.ok
                        ? `  🛬 fleet-watchdog landed ${project.root_path} → main (${lr.result.details})`
                        : `  🛬 fleet-watchdog landing refused (${lr.result.reason}): ${lr.result.details}`,
                    );
                    if (lr.stragglers?.length) {
                      const who = lr.stragglers
                        .map((s) => `${s.branch} (+${s.commitCount})`)
                        .join('; ');
                      out(
                        `  🚧 fleet-watchdog straggler warning for ${project.root_path} — sibling branches still unlanded (no overlap): ${who}`,
                      );
                    }
                  })
                  .finally(() => {
                    fleetLandInProgress.delete(project.id);
                  });
              }
            }
          },
        },
        ac.signal,
      );
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      out('watchdog stopped.');
      break;
    }
    case 'fleet': {
      // SHARDING HAS NO CALLER (EVAL 08-27, board web-mtb8i2lo-j7qcg9): this
      // is the launcher `scope-partition.ts` documents itself as being
      // computed by, and which never existed — lanes were started by hand and
      // every one pulled from the whole board. The 3-lane ramp measured the
      // cost: two lanes claimed different tasks that touched the same file,
      // the sibling scan refused the second commit, and a paid round shipped
      // nothing. Partitioning BEFORE launch makes that case unreachable.
      const parsedArgs = parseFleetCliArgs(process.argv.slice(3, 7), DEFAULT_BUDGET_USD);
      if (!parsedArgs.ok) {
        out(parsedArgs.usage);
        process.exitCode = 1;
        break;
      }
      const { folder, laneCount, firings, budgetUsd } = parsedArgs.args;
      const target = resolve(folder);
      const projectId = deriveFlyProjectId(target);
      const staggerMs = Number(process.env['AUTOPILOT_FLEET_STAGGER_MS'] ?? 20_000);

      const result = await runFleetLaunch(
        { folder: target, laneCount, firings, budgetUsd },
        staggerMs,
        {
          loadOpenTasks: () => {
            const store = openStore(resolveDbPath());
            try {
              // The picker's own order, so the partition sees exactly the
              // board the lanes will pull from. `needs_approval` is excluded
              // here for the same reason fly.ts skips it — it is not
              // workable until ruled on.
              return recentTasks(store.db, projectId, 200)
                .filter((t) => t.status === 'queued')
                .map((t) => ({ id: t.id, title: t.title }));
            } finally {
              store.close();
            }
          },
          postFly: async (body) => {
            const res = await fetch(`http://127.0.0.1:${config.port}/api/fly`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            });
            const json = (await res.json().catch(() => ({}))) as { started?: boolean };
            return {
              status: res.status,
              ...(json.started !== undefined ? { started: json.started } : {}),
            };
          },
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        },
      );
      for (const line of result.lines) out(line);
      if (!result.ok) process.exitCode = 1;
      break;
    }
    default: {
      out(
        'usage: dashboard start | stop | status | restart | doctor | ci-status | maintenance-sweep | vacuum | watch | fleet',
      );
      process.exitCode = 1;
    }
  }
}

void main();
