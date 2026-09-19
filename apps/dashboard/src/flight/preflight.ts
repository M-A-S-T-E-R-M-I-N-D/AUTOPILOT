// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * PREFLIGHT — the go/no-go a flight gets BEFORE it spends a dollar.
 *
 * Every class of failure the 2026-09-19 lane ladder hit had a precondition
 * a check could have named before takeoff: a dirty live checkout (every
 * sync-back into it refuses), a missing git identity (every commit fails),
 * no `claude` on the path, a full disk, a lane worktree left with
 * uncommitted leftovers (it can neither be moved aside nor fast-forwarded),
 * a stale build (the flight runs yesterday's engine), a fleet wider than the
 * disk can feed. The fixes for each are in their own modules; this one is
 * the gate that keeps a simple user from finding them the expensive way.
 *
 * Pure: it judges FACTS someone else gathered (`preflight-facts.ts`), so
 * every verdict is a unit test. Three levels — `block` refuses the flight
 * and says what to do, `warn` lets it fly and says what to expect, `info`
 * states the caps in force — and `go` is simply "no block".
 */

import type { DoctorCheck } from '../control/types.js';

export type PreflightLevel = 'block' | 'warn' | 'info';

export interface PreflightCheck extends DoctorCheck {
  readonly level: PreflightLevel;
}

export interface PreflightFacts {
  /** Changed or untracked paths in the live checkout; null when it is not a
   *  git repository (a flight over plain files still flies). */
  readonly targetDirty: number | null;
  readonly gitIdentity: { readonly name: string | null; readonly email: string | null };
  /** Free bytes on the target's volume; null when the platform cannot say. */
  readonly freeBytes: number | null;
  /** The built flight is older than the engine sources it was built from;
   *  null when either side is missing (a packaged install has no sources). */
  readonly distOlderThanSource: boolean | null;
  /** Engine lock files whose owning process is dead. */
  readonly staleLocks: readonly string[];
  /** Registered lane worktrees carrying uncommitted changes. */
  readonly dirtyLanes: readonly string[];
  /** Heads kept aside under `refs/autopilot/parked` — unfinished units
   *  waiting for the operator. */
  readonly parkedHeads: number;
  readonly cli: { readonly found: boolean; readonly version: string | null };
  readonly authDescription: string;
  readonly caps: { readonly wallClockMin: number; readonly idleMin: number };
  /** Lanes this launch will run (1 for a plain flight). */
  readonly laneCount: number;
}

export interface PreflightReport {
  readonly go: boolean;
  readonly checks: readonly PreflightCheck[];
}

/** Below this the gate, the store snapshot and a lane worktree cannot all fit. */
export const MIN_FREE_BYTES_BLOCK = 1 * 1024 * 1024 * 1024;
/** Below this a long round is likely to run out mid-flight. */
export const MIN_FREE_BYTES_WARN = 5 * 1024 * 1024 * 1024;
/** Above this many lanes on one disk, gates queue and most firings need the
 *  long wall clock — the measured shape of the eight-lane rung. */
export const WIDE_FLEET_LANES = 4;

function gib(bytes: number): string {
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}

export function evaluatePreflight(facts: PreflightFacts): PreflightReport {
  const checks: PreflightCheck[] = [];

  if (facts.targetDirty === null) {
    checks.push({
      level: 'info',
      name: 'target-clean',
      ok: true,
      detail: 'not a git repository — the flight edits files in place, nothing to sync',
    });
  } else if (facts.targetDirty > 0) {
    checks.push({
      level: 'block',
      name: 'target-clean',
      ok: false,
      detail: `${facts.targetDirty} changed or untracked path(s) in the live checkout — every sync-back into it would refuse; commit or stash them first`,
    });
  } else {
    checks.push({
      level: 'info',
      name: 'target-clean',
      ok: true,
      detail: 'live checkout is clean',
    });
  }

  const identity = facts.gitIdentity;
  if (facts.targetDirty !== null && (identity.name === null || identity.email === null)) {
    checks.push({
      level: 'block',
      name: 'git-identity',
      ok: false,
      detail:
        'git user.name / user.email are not set in this checkout — every commit the flight makes would fail; run `git config user.name … && git config user.email …`',
    });
  } else if (facts.targetDirty !== null) {
    checks.push({
      level: 'info',
      name: 'git-identity',
      ok: true,
      detail: `${identity.name} <${identity.email}>`,
    });
  }

  if (!facts.cli.found) {
    checks.push({
      level: 'block',
      name: 'claude-cli',
      ok: false,
      detail: '`claude` is not on the PATH — install Claude Code and sign in once before flying',
    });
  } else {
    checks.push({
      level: 'info',
      name: 'claude-cli',
      ok: true,
      detail: `claude ${facts.cli.version ?? '(version unknown)'} — ${facts.authDescription}`,
    });
  }

  if (facts.freeBytes !== null && facts.freeBytes < MIN_FREE_BYTES_BLOCK) {
    checks.push({
      level: 'block',
      name: 'disk-space',
      ok: false,
      detail: `${gib(facts.freeBytes)} free — under ${gib(MIN_FREE_BYTES_BLOCK)}; the gate, the store snapshot and a lane worktree cannot all fit`,
    });
  } else if (facts.freeBytes !== null && facts.freeBytes < MIN_FREE_BYTES_WARN) {
    checks.push({
      level: 'warn',
      name: 'disk-space',
      ok: true,
      detail: `${gib(facts.freeBytes)} free — under ${gib(MIN_FREE_BYTES_WARN)}; a long round may run out mid-flight`,
    });
  } else if (facts.freeBytes !== null) {
    checks.push({
      level: 'info',
      name: 'disk-space',
      ok: true,
      detail: `${gib(facts.freeBytes)} free`,
    });
  }

  if (facts.distOlderThanSource === true) {
    checks.push({
      level: 'warn',
      name: 'build-fresh',
      ok: true,
      detail:
        "the built flight is older than the engine sources — run `pnpm run build` (or `pnpm dashboard:restart`) or this flight runs yesterday's engine",
    });
  } else if (facts.distOlderThanSource === false) {
    checks.push({
      level: 'info',
      name: 'build-fresh',
      ok: true,
      detail: 'built flight matches its sources',
    });
  }

  if (facts.staleLocks.length > 0) {
    checks.push({
      level: 'warn',
      name: 'stale-locks',
      ok: true,
      detail: `${facts.staleLocks.length} engine lock(s) left by dead processes (${facts.staleLocks.join(', ')}) — reclaimed automatically at launch`,
    });
  }

  if (facts.dirtyLanes.length > 0) {
    checks.push({
      level: 'warn',
      name: 'lanes-clean',
      ok: true,
      detail: `${facts.dirtyLanes.length} lane worktree(s) carry uncommitted leftovers (${facts.dirtyLanes.join(', ')}) — such a lane can neither be moved aside nor fast-forwarded and launches stale; \`git -C <lane> stash\` to clear`,
    });
  }

  if (facts.parkedHeads > 0) {
    checks.push({
      level: 'info',
      name: 'parked-heads',
      ok: true,
      detail: `${facts.parkedHeads} unfinished unit(s) kept under refs/autopilot/parked — \`git for-each-ref refs/autopilot/parked\` lists them; their inbox tasks name the branch`,
    });
  }

  if (facts.laneCount > WIDE_FLEET_LANES) {
    checks.push({
      level: 'warn',
      name: 'fleet-width',
      ok: true,
      detail: `${facts.laneCount} lanes on one disk — gates queue behind ${WIDE_FLEET_LANES} lanes and most firings need the long wall clock; expect fewer ships per lane`,
    });
  }

  checks.push({
    level: 'info',
    name: 'per-firing-caps',
    ok: true,
    detail: `wall clock ${facts.caps.wallClockMin} min, idle ${facts.caps.idleMin} min without output`,
  });

  return { go: checks.every((c) => c.level !== 'block'), checks };
}

/** The one-line refusal a blocked flight answers with: every blocking
 *  check's advice, joined — what the Fly button and the fleet launcher show. */
export function preflightRefusal(report: PreflightReport): string {
  const blocking = report.checks.filter((c) => c.level === 'block');
  return `preflight refused: ${blocking.map((c) => `${c.name}: ${c.detail}`).join(' | ')}`;
}

/** `[ok]`/`[!!]`/`[--]` lines for the doctor command. */
export function formatPreflight(report: PreflightReport): readonly string[] {
  const tag = (c: PreflightCheck): string =>
    c.level === 'block' ? '!!' : c.level === 'warn' ? '--' : 'ok';
  return [
    ...report.checks.map((c) => `[${tag(c)}] ${c.name}: ${c.detail}`),
    report.go ? 'preflight: GO' : 'preflight: NO-GO — fix the [!!] lines above',
  ];
}
