// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { slugify } from '@autopilot/onboarding';
import { parseLockInfo, isProcessAlive } from '@autopilot/engine';

/**
 * PARALLEL FLIGHTS 1/6: the engine's single-instance guard (instance-lock.ts)
 * used to key on one store-wide `engine.lock`, so a flight against project A
 * refused a concurrent flight against unrelated project B. Keying per project
 * lets independent projects fly concurrently while still refusing a second
 * flight against the SAME project.
 *
 * PARALLEL UNLOCK C (N-way same-folder spawn): `instanceId`, when given,
 * folds into the key the same way `flight/worktree.ts`'s `deriveWorktreePlan`
 * already does — without this, a second same-project flight instance would
 * derive the SAME lock filename as the first, `lock.acquire()` would fail,
 * and the spawned child would immediately self-refuse ("another flight is
 * already running") before ever reaching the registry's N-way logic.
 * Slugified — not yet trusted input, and this segment feeds a filesystem
 * path. Omitted (the default), byte-for-byte the single-instance name.
 */
export function engineLockFileName(projectId: string, instanceId?: string): string {
  const key = instanceId ? `${projectId}--${slugify(instanceId)}` : projectId;
  return `engine-${key}.lock`;
}

/**
 * PARALLEL FLIGHTS 4/6: the flight console used to tail one shared
 * `flight.log` regardless of which folder was flying — harmless when only
 * one flight could ever run, but with 3/6's per-folder registry two
 * concurrent flights now interleave their stdout+stderr into that same file
 * with no way to attribute a line to either project. Keying the log file the
 * same way {@link engineLockFileName} keys the lock gives each project its
 * own captured output again.
 *
 * PARALLEL UNLOCK C: `instanceId` folds in the same way `engineLockFileName`
 * does, so two concurrent instances of the SAME project each get their own
 * log file instead of interleaving into one.
 */
export function flightLogFileName(projectId: string, instanceId?: string): string {
  const key = instanceId ? `${projectId}--${slugify(instanceId)}` : projectId;
  return `flight-${key}.log`;
}

/**
 * PARALLEL UNLOCK C (N-way same-folder spawn) — bugfix: the PreToolUse
 * containment-guard settings file (fly.ts writes it, then spawns Claude Code
 * with `--settings` pointing at it) used to be one bare
 * `flight-guard.settings.json` regardless of which instance wrote it. Two
 * concurrent flights against the SAME project — the exact scenario
 * {@link engineLockFileName} and {@link flightLogFileName} already key per
 * instance for — shared that one path, so whichever instance's fly.ts last
 * reached the write silently overwrote the OTHER instance's live
 * containment target: a running flight's Bash/Read/Edit guard would start
 * reporting a sibling instance's worktree as "the target repo". Keyed the
 * same way as its siblings, each instance now gets its own guard-settings
 * file and never redirects another instance's containment boundary.
 */
export function guardSettingsFileName(projectId: string, instanceId?: string): string {
  const key = instanceId ? `${projectId}--${slugify(instanceId)}` : projectId;
  return `flight-guard-${key}.settings.json`;
}

/**
 * The Ask escalation tier's OWN containment-guard settings file (epic 0012
 * slice 2, `docs/epics/0012-agentic-ask-escalation.md`) — a distinct
 * `ask-escalation-guard-` prefix, never `flight-guard-`, so a concurrent ask
 * escalation and an actual flight against the SAME project never race to
 * write the same path (an ask session's `targetRoot` and a flight's
 * `flightRoot` can differ — a flight runs from an isolated worktree — so
 * sharing {@link guardSettingsFileName}'s path could otherwise redirect one
 * session's containment boundary onto the other's).
 */
export function askEscalationGuardSettingsFileName(projectId: string): string {
  return `ask-escalation-guard-${slugify(projectId)}.settings.json`;
}

/**
 * Deterministically derives the project id `fly.ts` will onboard `target`
 * under — mirrors `onboard()`'s own first-time `newId()` minting (a slug of
 * the folder's basename), so the lock can be acquired BEFORE onboarding runs
 * and still key on the exact id the project ends up with. A project already
 * registered at that root keeps its original id on resume, which — because
 * every root maps to the same basename slug — is this same value.
 */
export function deriveFlyProjectId(targetPath: string): string {
  return `fly-${slugify(basename(targetPath))}`;
}

/**
 * The pid of the live process that holds `targetPath`'s engine lock, or
 * `null` when there's no lock file, it doesn't parse, or the recorded pid is
 * dead. The pid half of {@link isFlightOwnerAlive}, split out so a caller
 * that needs the ACTUAL pid — not just a yes/no — reads it from the exact
 * same place "owner alive" is decided, instead of re-parsing the lock file
 * separately and risking the two drifting apart. Used by `flight/adopt.ts`
 * to give a `FlightRunnerRegistry` a real pid to wrap after a dashboard
 * restart discovers a still-alive flight it never spawned (see
 * docs/RUNBOOK.md §4, "Dashboard server itself dies while a detached
 * flight-child keeps running").
 */
export function readFlightOwnerPid(
  dbDir: string,
  targetPath: string,
  instanceId?: string,
): number | null {
  const lockPath = join(dbDir, engineLockFileName(deriveFlyProjectId(targetPath), instanceId));
  if (!existsSync(lockPath)) return null;
  let raw: string;
  try {
    raw = readFileSync(lockPath, 'utf8');
  } catch {
    return null;
  }
  const info = parseLockInfo(raw);
  if (info === null || !isProcessAlive(info.pid)) return null;
  return info.pid;
}

/**
 * Whether a live process still holds the per-project engine lock `fly.ts`
 * itself acquires for `targetPath` — the one durable signal that a `'flying'`
 * status still has a real owner, as opposed to being abandoned by a flight
 * that died (SIGKILL, host reboot) before its own `finally` block could flip
 * the status back. `dbDir` is the directory the lock file sits alongside
 * (the store db's own directory). Shared by `control/flight-watchdog.ts`
 * (the single `dashboard:watch` target) and `control/boot-reconcile.ts`
 * (every project, once at dashboard boot) so "owner alive" can never drift
 * between the two call sites — see docs/RUNBOOK.md, "Recovery: a flight died
 * without releasing 'flying'".
 */
export function isFlightOwnerAlive(
  dbDir: string,
  targetPath: string,
  instanceId?: string,
): boolean {
  return readFlightOwnerPid(dbDir, targetPath, instanceId) !== null;
}

/**
 * Whether ANY process — this dashboard server's own in-memory
 * `FlightRunnerRegistry`, a stray terminal `fly.ts` invocation, a different
 * dashboard server, or an N-way fleet sibling — currently holds a live engine
 * lock for `targetPath`, across every instanceId (bare project id AND every
 * `--<instance>` variant), not just one caller-specified id.
 *
 * ROOT CAUSE (board ap-mtm4qzty-1, "multiple concurrent claude/node
 * processes are committing to the PRIMARY (non-worktree) AUTOPILOT
 * directory simultaneously, silently discarding uncommitted edits and
 * duplicating landed work"): `landing/execute.ts`'s flight-running guard
 * only consulted the dashboard's own in-memory `FlightRunnerRegistry`
 * (`isFlightRunning`), which only knows about flights THIS process spawned
 * or adopted. A flight from ANY other process was invisible to it, so
 * `land()` would checkout/merge the base branch in the SAME primary
 * directory a live flight was still committing to — the exact git race
 * `fly.ts`'s own lockfile (`FileInstanceLock`) exists to prevent for
 * flight-vs-flight, but was never consulted here for flight-vs-land. This
 * is the missing cross-process check: scan every lock file this project
 * could hold, exactly the way `fly.ts` writes them (`engineLockFileName`),
 * and treat any live one as "a flight owns the checkout" — the same
 * refusal path `isFlightRunning` already produces.
 */
export function isAnyFlightLockLive(dbDir: string, targetPath: string): boolean {
  const projectId = deriveFlyProjectId(targetPath);
  let entries: string[];
  try {
    entries = readdirSync(dbDir);
  } catch {
    return false;
  }
  const bareName = engineLockFileName(projectId);
  const instancePrefix = `engine-${projectId}--`;
  for (const entry of entries) {
    const isThisProject =
      entry === bareName || (entry.startsWith(instancePrefix) && entry.endsWith('.lock'));
    if (!isThisProject) continue;
    let raw: string;
    try {
      raw = readFileSync(join(dbDir, entry), 'utf8');
    } catch {
      continue;
    }
    const info = parseLockInfo(raw);
    if (info !== null && isProcessAlive(info.pid)) return true;
  }
  return false;
}
