// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Persisted counterpart to `reapCliDescendants`'s in-process reap (ORPHAN
 * SWEEP crash-path follow-up, board ap-mt2ukjg5-2): the settle callbacks in
 * claude-cli.ts only ever reap a CLI child's descendant tree when THIS
 * process is still alive to run them — if the flight process itself dies
 * (crash, SIGKILL, host reboot) before that callback fires, the pid it would
 * have reaped is simply gone from memory and its descendants run forever.
 * One file PER tracked child pid — never a single shared JSON array — so
 * concurrent flights (PARALLEL FLIGHTS lets several run at once against
 * different projects) never race a read-modify-write against each other's
 * entries; `track`/`untrack` each touch only their own file.
 *
 * `sweepStale`, run once at process startup before any flight starts, reaps
 * and clears every entry whose OWNING process (the flight that tracked it)
 * is confirmed dead, leaving entries owned by a still-alive sibling flight
 * untouched. Wired into the real startup path in `apps/dashboard/src/fly.ts`
 * (constructed once per invocation, swept before onboarding, then threaded
 * into every `ClaudeCliModel`/`StreamingClaudeCliModel` as `pidRegistry`) —
 * this module remains the crash-safe primitive underneath it, built and
 * tested in isolation first, same as `instance-lock.ts` was.
 */

import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isProcessAlive } from './instance-lock.js';

export interface TrackedCliPid {
  readonly ownerPid: number;
  readonly startedAt: number;
}

function entryPath(dir: string, childPid: number): string {
  return join(dir, `${childPid}.json`);
}

/** Parses one entry file's contents; null on anything unparseable (treated as reapable). */
export function parseTrackedCliPid(raw: string): TrackedCliPid | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const ownerPid = data['ownerPid'];
    const startedAt = data['startedAt'];
    if (!Number.isInteger(ownerPid) || (ownerPid as number) <= 0) return null;
    if (!Number.isFinite(startedAt)) return null;
    return { ownerPid: ownerPid as number, startedAt: startedAt as number };
  } catch {
    return null;
  }
}

/**
 * A directory of one-entry-per-tracked-pid files backing the crash-path
 * sweep. `isAlive`/`ownerPid`/`now` are injectable so staleness detection is
 * deterministically testable without spawning real processes.
 */
export class CliDescendantRegistry {
  constructor(
    private readonly dir: string,
    private readonly isAlive: (pid: number) => boolean = isProcessAlive,
    private readonly ownerPid: number = process.pid,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Persists that `childPid` is a live CLI invocation THIS process spawned.
   * Best-effort: a write failure (permissions, disk full) never blocks the
   * invocation it's tracking for — the in-process reap in claude-cli.ts
   * remains the primary path either way, this just loses its crash-path
   * safety net for that one entry.
   */
  track(childPid: number): void {
    try {
      mkdirSync(this.dir, { recursive: true });
      writeFileSync(
        entryPath(this.dir, childPid),
        JSON.stringify({ ownerPid: this.ownerPid, startedAt: this.now() }),
      );
    } catch {
      /* best-effort — see doc comment above */
    }
  }

  /** Clears a pid once its normal in-process reap already ran — the common
   *  case, leaving nothing for a later `sweepStale` to find. */
  untrack(childPid: number): void {
    try {
      unlinkSync(entryPath(this.dir, childPid));
    } catch {
      /* already gone — fine */
    }
  }

  /**
   * Reaps and clears every tracked pid whose owning process is confirmed
   * dead — the crash-path counterpart to the normal per-invocation reap.
   * Entries owned by a still-alive process (a sibling flight legitimately
   * mid-invocation) are left untouched. Returns the count reaped.
   */
  sweepStale(reap: (pid: number) => void): number {
    let names: string[];
    try {
      names = readdirSync(this.dir);
    } catch {
      return 0; // directory never created — nothing has ever been tracked
    }
    let reaped = 0;
    for (const name of names) {
      const match = /^(\d+)\.json$/.exec(name);
      if (!match?.[1]) continue;
      const childPid = Number(match[1]);
      const path = join(this.dir, name);
      let entry: TrackedCliPid | null;
      try {
        entry = parseTrackedCliPid(readFileSync(path, 'utf8'));
      } catch {
        entry = null;
      }
      if (entry !== null && this.isAlive(entry.ownerPid)) continue;
      reap(childPid);
      try {
        unlinkSync(path);
      } catch {
        /* already gone */
      }
      reaped += 1;
    }
    return reaped;
  }
}
