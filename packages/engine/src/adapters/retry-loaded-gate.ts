// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A GATE THAT CRASHED FROM LOAD GETS ONE MORE RUN (2026-09-25).
 *
 * `environmentCrashReason` (adapters/gate.ts) stopped the gate from reverting
 * good work when the machine was too loaded to judge it — test workers that
 * never started, tests that only timed out. But a crash is no verdict, and an
 * unverified head is never published, so that work sat parked on its lane
 * instead of reaching main: one base-lane commit in the round right after.
 * Load passes. The gate runs once more; if the second run judges the work,
 * that verdict stands, and only a second load crash leaves it unverified.
 * A red, a green, or any other crash is returned as it is, never retried.
 */

import type { GatePort, GateResult } from '../ports.js';
import { environmentCrashReason } from './gate.js';

/** The crash reasons `environmentCrashReason` produces — found in a gate
 *  result's details, which lead with the failing command's verdict line. */
export function isLoadCrash(result: GateResult): boolean {
  if (result.ok || result.crashed !== true) return false;
  const details = result.details ?? '';
  return (
    details.includes('the machine was too loaded to judge') ||
    environmentCrashReason(details) !== null
  );
}

export interface RetryLoadedGateOptions {
  readonly inner: GatePort;
  /** Extra runs after a load crash — one by default. */
  readonly retries?: number;
  /** Told before each retry, for the flight log. */
  readonly onRetry?: (attempt: number) => void;
}

export class RetryLoadedGate implements GatePort {
  constructor(private readonly opts: RetryLoadedGateOptions) {}

  async run(): Promise<GateResult> {
    const retries = this.opts.retries ?? 1;
    let result = await this.opts.inner.run();
    for (let attempt = 1; attempt <= retries && isLoadCrash(result); attempt += 1) {
      this.opts.onRetry?.(attempt);
      result = await this.opts.inner.run();
    }
    return result;
  }
}
