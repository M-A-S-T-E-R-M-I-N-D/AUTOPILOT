// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * SAFETY-II NEAR-MISS RITUAL (board web-mt1qat5h-nxzgjs;
 * docs/DOCTRINE-WEAKPOINT-RESEARCH.md "Lens 4 — Near-miss mining"): weak
 * signals — guard denials, intent collisions, autoformat rescues, sync-back
 * refusals, checkpoint errors — rarely sink a single flight on their own, but
 * the doctrine's own motivating incident (a sync-back refusal logged for two
 * days before it stranded 144 commits) is exactly the failure mode of
 * ignoring them individually. `fly.ts`'s post-flight sweep aggregates one
 * flight's counts into a single debrief line via {@link nearMissDebriefLine},
 * then persists them so {@link detectRecurringNearMissClass} can flag a class
 * that keeps recurring across flights — surfaced before it becomes an
 * incident, not after.
 */

export interface NearMissCounts {
  readonly guardDenials: number;
  readonly intentCollisions: number;
  readonly rescues: number;
  readonly syncBackRefusals: number;
  readonly checkpointErrors: number;
}

const NEAR_MISS_CLASSES = [
  'guardDenials',
  'intentCollisions',
  'rescues',
  'syncBackRefusals',
  'checkpointErrors',
] as const;

export type NearMissClass = (typeof NEAR_MISS_CLASSES)[number];

const NEAR_MISS_LABELS: Readonly<
  Record<NearMissClass, readonly [singular: string, plural: string]>
> = {
  guardDenials: ['guard denial', 'guard denials'],
  intentCollisions: ['intent collision', 'intent collisions'],
  rescues: ['autoformat rescue', 'autoformat rescues'],
  syncBackRefusals: ['sync-back refusal', 'sync-back refusals'],
  checkpointErrors: ['checkpoint error', 'checkpoint errors'],
};

/** Sum of every weak-signal count — 0 means a clean flight, nothing to debrief. */
export function nearMissTotal(c: NearMissCounts): number {
  return c.guardDenials + c.intentCollisions + c.rescues + c.syncBackRefusals + c.checkpointErrors;
}

/**
 * One post-flight debrief line naming every non-zero weak-signal class this
 * flight saw, in {@link NEAR_MISS_CLASSES} order — `null` for a clean flight
 * (nothing to debrief) rather than padding the line with "0 guard denials".
 */
export function nearMissDebriefLine(c: NearMissCounts): string | null {
  if (nearMissTotal(c) === 0) return null;
  const parts = NEAR_MISS_CLASSES.filter((cls) => c[cls] > 0).map((cls) => {
    const n = c[cls];
    const [singular, plural] = NEAR_MISS_LABELS[cls];
    return `${n} ${n === 1 ? singular : plural}`;
  });
  return `SAFETY-II near-miss debrief: ${parts.join(', ')}.`;
}

/** The human, pluralized label for a near-miss class — shared by the
 *  debrief line above and the dashboard's recurring-class anomaly chip
 *  (read/anomalies.ts), so the two never drift into different wording for
 *  the same class. */
export function nearMissClassLabel(cls: NearMissClass): string {
  return NEAR_MISS_LABELS[cls][1];
}

/**
 * Parses one persisted `near-miss-debrief` event's JSON payload (fly.ts's
 * post-flight sweep writes a `NearMissCounts` object verbatim) back into a
 * typed {@link NearMissCounts} — the read-back half of that persistence, so
 * fly.ts can rebuild the history {@link detectRecurringNearMissClass} needs
 * across flights. Defensive like the read-model's other event parsers: a
 * missing/malformed/partial payload yields `null` (skip that row) rather
 * than throwing.
 */
export function parseNearMissCounts(payload: string | null): NearMissCounts | null {
  if (payload === null) return null;
  try {
    const record = JSON.parse(payload) as Partial<Record<NearMissClass, unknown>>;
    const counts = {} as Record<NearMissClass, number>;
    for (const cls of NEAR_MISS_CLASSES) {
      const v = record[cls];
      if (typeof v !== 'number') return null;
      counts[cls] = v;
    }
    return counts;
  } catch {
    return null;
  }
}

/** How many consecutive flights (newest first) the SAME class must appear
 *  nonzero in before it counts as recurring — a single flight's near-misses
 *  are noise; a class showing up flight after flight is a pattern. */
const RECURRING_STREAK_THRESHOLD = 3;

export interface RecurringNearMiss {
  readonly nearMissClass: NearMissClass;
  readonly streak: number;
}

/**
 * Flags a weak-signal class that has recurred nonzero across the most recent
 * flights (newest first) — the doctrine's ask: surface a recurring class
 * BEFORE it becomes an incident, not after. Ties broken by
 * {@link NEAR_MISS_CLASSES} order (guard denials first) for determinism.
 * `null` when nothing has crossed the threshold.
 */
export function detectRecurringNearMissClass(
  history: readonly NearMissCounts[],
): RecurringNearMiss | null {
  let best: RecurringNearMiss | null = null;
  for (const cls of NEAR_MISS_CLASSES) {
    let streak = 0;
    for (const h of history) {
      if (h[cls] > 0) streak++;
      else break;
    }
    if (streak >= RECURRING_STREAK_THRESHOLD && (!best || streak > best.streak)) {
      best = { nearMissClass: cls, streak };
    }
  }
  return best;
}
