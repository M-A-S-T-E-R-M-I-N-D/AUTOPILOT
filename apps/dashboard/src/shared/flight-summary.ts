// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure logic shared by the server read-model (`read/fleet.ts`) and the
 * hand-authored client bundle (`web/shell.ts`, no bundler, CSP `self`-only —
 * epic 0002 "shell decomposition", slice 1). `web/shell.ts` embeds this
 * module's real compiled source into the generated `/app.js` text via
 * `.toString()` — see `fleetJs()` — instead of hand-retyping the headline
 * resolution logic, so the two copies can no longer drift apart.
 * `apps/dashboard/test/web/flight-summary-parity.test.ts` regression-tests
 * that the served bundle's output matches this module's own functions.
 *
 * Before this slice the server's `finishedFlightSummaries` used a simpler
 * headline fallback (`task title → commit subject → item → kind`) than the
 * client's `flightHeadlineOf`, missing the documented "a slice leads with its
 * own commit subject, not the shared task title every sibling slice repeats"
 * rule (see `FlightEntry.completion` in `read/fleet.ts`) — a real divergence,
 * not just duplicated code. Both sides now resolve headlines identically.
 */

/** The task fields {@link flightHeadlineOf} reads — a narrow view of `read/fleet.ts`'s `TaskEntry`. */
export interface TaskLike {
  readonly id: string;
  readonly title: string;
  readonly status: string;
}

/** The flight-log fields {@link flightHeadlineOf} reads — a narrow view of `read/fleet.ts`'s `FlightEntry`. */
export interface FlightHeadlineEntry {
  readonly item: string | null;
  readonly kind: string | null;
  readonly gateResult: string | null;
  readonly died: 'turn-cap' | 'timeout' | 'error' | null;
  readonly completion: string | null;
  readonly commitSubject: string | null;
}

/**
 * The ONE honest headline for a flight-log row: what shipped (or why nothing
 * did). Resolution order: a 'slice' completion leads with its OWN commit
 * subject rather than the task title (every sibling slice shares that title —
 * leading with it reads as duplicate rows); otherwise task title → real
 * commit subject → item id → a plain explanation of why nothing landed.
 */
export function flightHeadlineOf(
  f: FlightHeadlineEntry,
  taskById: Readonly<Record<string, TaskLike>> | null,
): string {
  const task = f.item && taskById ? taskById[f.item] : null;
  if (f.completion === 'slice' && f.commitSubject) return f.commitSubject;
  return (
    (task && task.title) ||
    f.commitSubject ||
    f.item ||
    (f.gateResult === 'checkpointed'
      ? 'died mid-unit — WIP packed into a checkpoint commit'
      : f.died === 'turn-cap'
        ? 'died at the turn cap — nothing committed'
        : f.died === 'timeout'
          ? 'timed out at the CLI wall-clock cap — nothing committed'
          : f.died === 'error'
            ? 'errored mid-firing — nothing committed'
            : `${f.kind || 'a'} firing`)
  );
}

/** A flight-log row as {@link finishedFlightSummaries} needs it. */
export interface FlightSummaryEntry extends FlightHeadlineEntry {
  readonly id: string;
  readonly shipped: boolean;
  readonly cost: number;
  /** Cost semantics v3 (epic 0013) — see `read/fleet.ts`'s `FlightEntry.realCostUsd`
   *  for the field's full meaning. Optional for the same pre-existing-fixture
   *  reason as that field. */
  readonly realCostUsd?: number | null;
  readonly sha: string | null;
  readonly at: number;
}

/** One human-readable summary line for a finished (shipped) flight. */
export interface FlightSummary {
  readonly id: string;
  /** What shipped — see {@link flightHeadlineOf}. */
  readonly headline: string;
  readonly cost: number;
  /** Cost semantics v3 (epic 0013) — this flight's cost apportioned by real
   *  subscription share instead of API list price. `null` when unconfigured
   *  or the firing predates this being tracked, never a fabricated number. */
  readonly realCostUsd?: number | null;
  readonly sha: string | null;
  /** The task title this flight closed, only when that task is now `done`. */
  readonly closedTaskTitle: string | null;
  readonly at: number;
}

/** The project fields {@link finishedFlightSummaries} needs. */
export interface FlightSummaryProject {
  readonly tasks: readonly TaskLike[];
  readonly flightLog: readonly FlightSummaryEntry[];
}

/**
 * The human summary line for each finished (shipped) flight — what shipped,
 * its cost, and the task it closed. A flight's `item` is the short id of the
 * board task it worked; the task's title closes the badge at ANY status (not
 * only `done` — a shipped firing's board sync can lag).
 */
export function finishedFlightSummaries(p: FlightSummaryProject): readonly FlightSummary[] {
  const taskById: Record<string, TaskLike> = {};
  // Stryker disable next-line ArrayDeclaration: a fallback placeholder element
  // here is still just a string, not a TaskLike — every read of it below
  // (`.id`, later `.title`/`.status` via taskById) is `undefined` on a
  // string, identical to the real empty-array case never populating
  // taskById at all. Only a malformed non-array `p.tasks` at runtime (never
  // reachable via this module's typed callers, but real JSON crossing the
  // client fetch boundary can't be trusted) exercises the fallback itself.
  for (const t of p.tasks || []) taskById[t.id] = t;
  const out: FlightSummary[] = [];
  // Stryker disable next-line ArrayDeclaration: same reasoning as the
  // `p.tasks` fallback above — a placeholder string's `.shipped` is
  // `undefined`, so `if (!f.shipped) continue` skips it identically to the
  // real empty-array case iterating zero times.
  for (const f of p.flightLog || []) {
    if (!f.shipped) continue;
    const task = f.item ? taskById[f.item] : null;
    const closedTaskTitle = task && task.status === 'done' ? task.title : null;
    out.push({
      id: f.id,
      headline: flightHeadlineOf(f, taskById),
      cost: f.cost,
      realCostUsd: f.realCostUsd ?? null,
      sha: f.sha,
      closedTaskTitle,
      at: f.at,
    });
  }
  return out;
}
