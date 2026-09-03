// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Flight containment audit (docs/FLIGHT-CONTAINMENT.md). A flight is only as
 * confined as the shell it runs, and Bash is not jailed — the agent can `cd` out
 * of the target and commit elsewhere. The firing prompt forbids this, but a prompt
 * is a soft control. This is the HARD, machine-checkable backstop: snapshot the
 * HEAD of every repo that must NOT change (e.g. the dashboard's own repo when the
 * target is a different folder), and after each firing check whether any of them
 * moved. A moved guarded HEAD means the flight escaped — a breach the engine can
 * detect on its own, no cooperation from the agent required.
 */

/** Reads a git repo's HEAD sha; returns '' when the path is not a repo or errors. */
export interface HeadReader {
  headOf(repoPath: string): string;
}

export interface GuardedHead {
  readonly repoPath: string;
  readonly head: string;
}

export interface ContainmentBreach {
  readonly repoPath: string;
  readonly before: string;
  readonly after: string;
}

/**
 * The set of paths to guard for a flight: every candidate that is NOT the target
 * itself. Flying the target legitimately commits to it, so it is never guarded;
 * every OTHER repo (the dashboard's cwd, a parent repo) must stay frozen. Callers
 * pass already-resolved absolute paths; comparison is exact.
 */
export function guardedPathsFor(target: string, candidates: readonly string[]): readonly string[] {
  return candidates.filter((c) => c !== target);
}

/** Snapshot the HEAD of each guarded repo before the flight runs. */
export function snapshotGuardedHeads(
  reader: HeadReader,
  paths: readonly string[],
): readonly GuardedHead[] {
  return paths.map((repoPath) => ({ repoPath, head: reader.headOf(repoPath) }));
}

/**
 * Any guarded repo whose HEAD differs from its snapshot is a containment breach:
 * the flight touched a repository it was told never to touch (a new commit, a
 * checkout, a reset — anything that moves HEAD). Returns one entry per breach.
 */
export function detectContainmentBreaches(
  reader: HeadReader,
  snapshot: readonly GuardedHead[],
): readonly ContainmentBreach[] {
  const breaches: ContainmentBreach[] = [];
  for (const guarded of snapshot) {
    const after = reader.headOf(guarded.repoPath);
    if (after !== guarded.head) {
      breaches.push({ repoPath: guarded.repoPath, before: guarded.head, after });
    }
  }
  return breaches;
}

/** A one-line, human-readable description of a breach (for logs + alerts). */
export function describeBreach(breach: ContainmentBreach): string {
  const from = breach.before === '' ? '(none)' : breach.before.slice(0, 12);
  const to = breach.after === '' ? '(none)' : breach.after.slice(0, 12);
  return `CONTAINMENT BREACH — ${breach.repoPath} HEAD moved ${from} → ${to} (the flight left its target)`;
}

export interface BreachClassification {
  /** Must abort the flight — Bash could plausibly have produced this movement. */
  readonly hard: readonly ContainmentBreach[];
  /** Informational only — logged, baseline adopted, flight keeps flying. */
  readonly operator: readonly ContainmentBreach[];
}

/**
 * CONTAINMENT vs OPERATOR (web-msu3x5ub-vqxjhu): a moved guarded HEAD is not
 * automatically an escape. Once worktree isolation is active (`flightRoot`
 * is a linked worktree distinct from `target` — docs/FLIGHT-CONTAINMENT.md
 * layer 4), this flight's own Bash is walled off from every guarded path by
 * TWO independent controls already: the physical worktree separation and the
 * PreToolUse path guard (layer 2). A guarded HEAD moving anyway is therefore
 * almost always the operator's own git activity on their live checkout (a
 * merge, a manual commit, a review) or a ritual this flight hasn't
 * re-baselined yet — not this flight breaking out. Treating it as fatal used
 * to ABORT an otherwise-healthy flight for someone else's commit.
 *
 * Isolation NOT active (`flightRoot === target`, the worktree-setup-failed
 * fallback) keeps the full hard-stop: Bash then runs directly inside a
 * guarded path, so a movement elsewhere is the original 2026-07-11 escape
 * shape (docs/adr/0005) and must still abort.
 */
export function classifyBreaches(
  found: readonly ContainmentBreach[],
  isolationActive: boolean,
): BreachClassification {
  if (isolationActive) return { hard: [], operator: found };
  return { hard: found, operator: [] };
}
