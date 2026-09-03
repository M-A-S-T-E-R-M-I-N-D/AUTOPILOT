// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { StatusResult } from './types.js';

/** The slice of DashboardControl the watchdog actually needs — never stop/restart. */
export interface WatchdogControl {
  status(): StatusResult;
  start(): StatusResult;
}

export interface WatchdogTickResult {
  readonly status: StatusResult;
  readonly revived: boolean;
}

/**
 * One supervisory tick: RING-0 SUPERVISOR, server-lifecycle slice
 * (web-msq9hfhd-ebmy8k) — the pilot observes, the daemon owns start/revive/
 * replace. `status()` already self-heals a stale record (dead pid) before
 * returning, and `start()` is idempotent when already running — so a single
 * "not running → start" branch covers revive (crashed) and replace (stale
 * record) alike; nothing extra to special-case.
 */
export function watchdogTick(control: WatchdogControl): WatchdogTickResult {
  const status = control.status();
  if (status.state === 'running') return { status, revived: false };
  return { status: control.start(), revived: true };
}

export interface WatchdogOptions {
  readonly intervalMs: number;
  readonly onTick?: (result: WatchdogTickResult) => void;
}

/**
 * Runs `watchdogTick` immediately, then on a fixed interval, until `signal`
 * aborts. Dependency-free (node timers only) — the "tiny daemon" the operator
 * runs in a window instead of manually re-running `dashboard:start` after a crash.
 */
export function runWatchdog(
  control: WatchdogControl,
  options: WatchdogOptions,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolveRun) => {
    const tick = (): void => {
      options.onTick?.(watchdogTick(control));
    };
    if (signal.aborted) {
      resolveRun();
      return;
    }
    tick();
    const timer = setInterval(tick, options.intervalMs);
    signal.addEventListener(
      'abort',
      () => {
        clearInterval(timer);
        resolveRun();
      },
      { once: true },
    );
  });
}
