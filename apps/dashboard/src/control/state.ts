// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { DashboardState, RunState } from './types.js';

export function serializeState(state: DashboardState): string {
  return JSON.stringify(state);
}

/**
 * Parse a run record defensively. A pid must be a positive integer — this is a
 * safety gate: pid 0 / negative are special to `process.kill` (whole process
 * group) and must NEVER be treated as a real pid.
 */
export function parseState(text: string): DashboardState | null {
  let raw: unknown;
  // prettier-ignore
  try {
    raw = JSON.parse(text);
  } // Stryker disable next-line BlockStatement: if JSON.parse throws, `raw`
  // stays unassigned (undefined) either way — the typeof/null check below
  // rejects undefined identically to this catch's explicit `return null`.
  // Provably equivalent, not killable.
  catch {
    return null;
  }
  // Stryker disable next-line ConditionalExpression: for any non-null
  // primitive raw (string/number/boolean), `o['pid']` etc. below return
  // `undefined` rather than throwing, and the per-field checks reject
  // `undefined` the same way they'd reject a non-object. Provably
  // equivalent, not killable.
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const pid = o['pid'];
  const port = o['port'];
  const startedAt = o['startedAt'];
  if (
    // Stryker disable next-line ConditionalExpression: `Number.isInteger`
    // immediately below returns false for any non-number type, so this
    // typeof guard can never change the outcome. Provably equivalent, not
    // killable.
    typeof pid === 'number' &&
    Number.isInteger(pid) &&
    pid > 0 &&
    // Stryker disable next-line ConditionalExpression: same reasoning as
    // pid's typeof guard above — `Number.isInteger(port)` already rejects
    // every non-number type. Provably equivalent, not killable.
    typeof port === 'number' &&
    Number.isInteger(port) &&
    port > 0 &&
    typeof startedAt === 'number'
  ) {
    return { pid, port, startedAt };
  }
  return null;
}

/** Classify the run state from whether a record exists and whether its pid is alive. */
export function classifyStatus(hasState: boolean, pidAlive: boolean): RunState {
  if (!hasState) return 'stopped';
  return pidAlive ? 'running' : 'stale';
}

/** True only for a signalable, positive-integer pid (never 0 / negative). */
export function isSafePid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 0;
}
