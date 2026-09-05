// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { serializeState, parseState, classifyStatus, isSafePid } from './state.js';
import type { ControlConfig, StatusResult, DashboardState, DoctorCheck } from './types.js';
import { otlpConfigFromEnv } from '../flight/otlp.js';
import { forceKillProcess, STOP_GRACE_MS } from '../flight/spawn-flight.js';
import { findPortOwnerPid } from './port-owner.js';

const STOPPED: StatusResult = { state: 'stopped', pid: null, port: null, url: null };

// SUICIDE GUARD, primary layer (web-msp5g6nf-owl9jp): a prior flight ran the
// dashboard's own stop command live and killed the host process that was
// running it, taking the flight down too. `spawn-flight.ts` sets
// AUTOPILOT_FLIGHT=1 on every flight's process tree, inherited by any
// subprocess the agent spawns (a `pnpm dashboard:stop` Bash call included) —
// checked HERE, in the tool that actually performs the stop/restart, so no
// invocation shape (npm script, CLI arg, .cmd launcher) can slip past it.
// `guard.ts`'s Bash-text pattern match on the same class of command is now
// the backstop, not the primary defense — text patterns are guessable and
// bypassable; this env check is not.
const FLIGHT_GUARD_MESSAGE =
  'refusing: this process is running inside an AUTOPILOT flight (AUTOPILOT_FLIGHT=1). ' +
  'A flight has no legitimate reason to stop or restart the dashboard hosting it — a prior ' +
  'flight did exactly this and killed the very process that was running it. If the dashboard ' +
  'genuinely needs to stop or restart, do it from a normal terminal outside the flight.';

function assertNotInFlight(): void {
  if (process.env['AUTOPILOT_FLIGHT'] === '1') throw new Error(FLIGHT_GUARD_MESSAGE);
}

/**
 * Safe lifecycle control for the read-only dashboard (start/stop/status/restart/
 * doctor). Security posture: spawns only the LOCAL built server via an argv array
 * (no shell, no remote), signals ONLY the positive-integer pid recorded in our own
 * state file (never a group / arbitrary pid), and reads the record defensively.
 */
export class DashboardControl {
  private readonly statePath: string;
  private readonly logPath: string;

  constructor(
    private readonly config: ControlConfig,
    private readonly now: () => number = () => Date.now(),
    /** STOP ESCALATION seam (mirrors `createSpawnFlight`'s `forceKill` param,
     *  same STPA finding web-mt1qa7go-9zjnc0) — tests inject a spy instead of
     *  depending on a real OS process ignoring SIGTERM, which Windows can't
     *  even produce (`process.kill(pid, 'SIGTERM')` unconditionally
     *  terminates there, same as SIGKILL). */
    private readonly forceKill: (pid: number) => void = forceKillProcess,
    /** PORT-SQUATTER FALLBACK seam (BUG web-mto5bxd1-x00maq) — tests inject a
     *  stub instead of depending on a real `netstat`/`lsof` probe. */
    private readonly findPortOwner: (port: number) => number | null = findPortOwnerPid,
  ) {
    this.statePath = join(config.stateDir, 'dashboard.json');
    this.logPath = join(config.stateDir, 'dashboard.log');
  }

  private read(): DashboardState | null {
    if (!existsSync(this.statePath)) return null;
    try {
      return parseState(readFileSync(this.statePath, 'utf8'));
    } catch {
      return null;
    }
  }

  private pidAlive(pid: number): boolean {
    if (!isSafePid(pid)) return false;
    try {
      process.kill(pid, 0); // signal 0 = existence/permission probe, kills nothing
      return true;
    } catch {
      return false;
    }
  }

  private clear(): void {
    rmSync(this.statePath, { force: true });
  }

  status(): StatusResult {
    const record = this.read();
    const alive = record !== null && this.pidAlive(record.pid);
    const state = classifyStatus(record !== null, alive);
    if (state === 'stale') this.clear();
    if (state === 'running' && record) {
      return { state, pid: record.pid, port: record.port, url: `http://127.0.0.1:${record.port}` };
    }
    return STOPPED;
  }

  /** `replace: true` is for a server replacing ITSELF (post-landing
   *  self-restart): the caller IS the recorded live process, so the plain
   *  reuse check would see the caller's own pid alive, spawn nothing, and
   *  leave the health probe polling a port whose listener just closed — the
   *  exact thrice-observed field failure. It skips the reuse check and
   *  overwrites the run record with the replacement's pid. */
  start(options: { replace?: boolean } = {}): StatusResult {
    if (!options.replace) {
      const current = this.status();
      if (current.state === 'running') return current;
    }

    mkdirSync(this.config.stateDir, { recursive: true });
    const fd = openSync(this.logPath, 'a');
    const child = spawn(this.config.nodeBin, [this.config.serverEntry], {
      detached: true,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
      env: {
        ...process.env,
        AUTOPILOT_DASHBOARD_PORT: String(this.config.port),
        // The detached server must NOT open a browser; the CLI opens it once,
        // after a readiness probe, so we never get a double tab or a race.
        AUTOPILOT_NO_OPEN: '1',
      },
    });
    closeSync(fd);

    const pid = child.pid;
    if (pid === undefined || !isSafePid(pid)) {
      throw new Error('failed to start the dashboard server (no pid)');
    }
    child.unref();

    const state: DashboardState = { pid, port: this.config.port, startedAt: this.now() };
    writeFileSync(this.statePath, serializeState(state));
    return {
      state: 'running',
      pid,
      port: this.config.port,
      url: `http://127.0.0.1:${this.config.port}`,
    };
  }

  /**
   * STOP ESCALATION (STPA finding web-mt1qa7go-9zjnc0, "SOUL/LESSON PRUNE"
   * board web-mt1qajrv-ukabrc — the STPA harvest named this same
   * "children never escalate past SIGTERM" gap that `spawn-flight.ts`'s
   * `kill()` already closed for FLIGHT children; this closes it for the
   * dashboard SERVER's own process, the one caller that never got it).
   * Previously `stop()` sent one SIGTERM, unconditionally cleared the state
   * record, and returned — a server that didn't actually exit (wedged, or
   * the signal lost a race) was left running forever with no record of it,
   * so the NEXT `start()` would spawn a second instance instead of noticing
   * the orphan. `stop()` stays synchronous (unchanged contract, every
   * existing caller) by not awaiting the escalation: it schedules a
   * `forceKill` re-check `STOP_GRACE_MS` out, unref'd so a pending timer
   * never keeps the dashboard alive on its own, and it is a no-op once the
   * pid is confirmed gone.
   */
  stop(): StatusResult {
    assertNotInFlight();
    const record = this.read();
    if (record && this.pidAlive(record.pid)) {
      const pid = record.pid;
      try {
        process.kill(pid, 'SIGTERM'); // only ever our recorded, positive pid
      } catch {
        /* already gone */
      }
      setTimeout(() => {
        if (this.pidAlive(pid)) this.forceKill(pid);
      }, STOP_GRACE_MS).unref();
    }
    this.clear();
    return STOPPED;
  }

  /** Poll interval while `restart()` waits for the OLD pid to actually exit
   *  before spawning the replacement — see `waitForExit`. */
  private static readonly RESTART_EXIT_POLL_MS = 20;

  /** Polls until `pid` is no longer alive or `timeoutMs` elapses. Used only
   *  by `restart()` (BUG ap-mt2sz1zv-2) to confirm the OLD server is
   *  actually gone, not just signaled, before the replacement binds the same
   *  port. Bounded by `timeoutMs` so a pid that never exits (signal lost,
   *  wedged process) can't hang restart() forever — `stop()`'s own
   *  forceKill escalation already guarantees the pid is gone by
   *  STOP_GRACE_MS, so that is the same bound used here. */
  private waitForExit(pid: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const tick = (): void => {
        if (!this.pidAlive(pid) || Date.now() >= deadline) {
          resolve();
          return;
        }
        setTimeout(tick, DashboardControl.RESTART_EXIT_POLL_MS);
      };
      tick();
    });
  }

  /** Bounded wait after `forceKill` before giving up on a pid — `forceKill`
   *  is itself asynchronous (Windows spawns a detached `taskkill`, POSIX
   *  sends SIGKILL to a process group), so even a WORKING kill needs a short
   *  buffer, not an instant confirmation. */
  private static readonly FORCE_KILL_CONFIRM_MS = 2_000;

  /**
   * Confirms `pid` is actually dead, escalating through `forceKill` ITSELF
   * if SIGTERM alone hasn't worked by `sigtermWaitMs` — never a background
   * fire-and-forget timer. Returns whether death is now confirmed; never
   * throws.
   */
  private async confirmDead(pid: number, sigtermWaitMs: number): Promise<boolean> {
    await this.waitForExit(pid, sigtermWaitMs);
    if (!this.pidAlive(pid)) return true;
    this.forceKill(pid);
    await this.waitForExit(pid, DashboardControl.FORCE_KILL_CONFIRM_MS);
    return !this.pidAlive(pid);
  }

  /**
   * restart() = stop() then start(), but chaining them naively raced: stop()
   * returns the instant SIGTERM is sent — before the OS has actually
   * reclaimed the OLD process's listening socket — so the immediate start()
   * that followed could bind onto a port the old pid was still holding and
   * fail with EADDRINUSE (BUG ap-mt2sz1zv-2).
   *
   * A first fix bounded the wait by STOP_GRACE_MS and trusted the bare
   * timeout as proof of death — but that timeout fires whether or not the
   * pid actually died, racing `stop()`'s OWN unref'd forceKill-escalation
   * timer (same delay, no ordering guarantee) and sometimes losing: `start()`
   * would fire while the old server was still very much alive and still
   * holding the port — "two main.js processes, stale one holding the port"
   * (BUG web-mto5bxd1-x00maq, recurred twice in the field). `confirmDead`
   * now escalates through `forceKill` itself, in-line, instead of racing a
   * side timer — `restart()` refuses to guess by spawning a replacement it
   * cannot confirm won't collide.
   *
   * Even a confirmed-dead recorded pid doesn't guarantee the port is free:
   * the RUNBOOK "stale server" gap (docs/RUNBOOK.md #2) — a process this
   * control never tracked (a plain `pnpm dashboard`, a crashed IDE task) can
   * squat the same port invisibly. `findPortOwner` catches that case too,
   * killing whoever is actually LISTENING there before `start()` binds.
   */
  async restart(): Promise<StatusResult> {
    assertNotInFlight();
    const record = this.read();
    const oldPid = record && this.pidAlive(record.pid) ? record.pid : null;
    const port = record?.port ?? this.config.port;
    this.stop();
    if (oldPid !== null) {
      const dead = await this.confirmDead(oldPid, STOP_GRACE_MS);
      if (!dead) {
        throw new Error(
          `restart refused: the previous dashboard server (pid ${oldPid}) is still running ` +
            'after SIGTERM and a forceful kill — see docs/RUNBOOK.md before restarting.',
        );
      }
    }
    const squatter = this.findPortOwner(port);
    if (squatter !== null && squatter !== oldPid) {
      this.forceKill(squatter);
      await this.waitForExit(squatter, DashboardControl.FORCE_KILL_CONFIRM_MS);
    }
    return this.start();
  }

  doctor(): DoctorCheck[] {
    const nodeMajor = Number(process.version.replace(/^v/, '').split('.')[0] ?? '0');
    let writable: boolean;
    try {
      mkdirSync(this.config.stateDir, { recursive: true });
      writable = true;
    } catch {
      writable = false;
    }
    const otlp = otlpConfigFromEnv(process.env);
    return [
      { name: 'node>=22', ok: nodeMajor >= 22, detail: process.version },
      {
        name: 'server-built',
        ok: existsSync(this.config.serverEntry),
        detail: this.config.serverEntry,
      },
      { name: 'state-dir-writable', ok: writable, detail: this.config.stateDir },
      {
        name: 'otlp (optional)',
        ok: true,
        detail: otlp
          ? `exporting flight traces to ${otlp.endpoint}`
          : 'not configured — flights export no spans; set OTEL_EXPORTER_OTLP_ENDPOINT ' +
            '(or _TRACES_ENDPOINT) to enable',
      },
    ];
  }
}
