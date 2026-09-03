// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure activity-feed grouping/lookup/label helpers — client-only (no server
 * counterpart, unlike `shared/*.ts`), so it lives in `web/` rather than
 * `shared/` (epic 0002 "shell decomposition", slice 2: feature-module split
 * of `shell.ts`), following the same pattern `office-map.ts`/`format.ts`/
 * `heatmap.ts`/`flight-metrics.ts`/`markdown.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** An activity-feed entry {@link groupByFiring} buckets by `firingId`. */
export interface FiringTaggedActivity {
  readonly firingId?: string | null;
}

/** One firing's activity entries, in original (newest-first) order. */
export interface FiringGroup<T> {
  readonly firingId: string;
  readonly entries: readonly T[];
}

/** Buckets activity entries by firingId, preserving first-seen order —
 *  drives the "who did what, when, in which firing" timeline view. Entries
 *  with no firingId (predates capture) collect under 'unattributed'. */
export function groupByFiring<T extends FiringTaggedActivity>(
  acts: readonly T[],
): FiringGroup<T>[] {
  const order: string[] = [];
  const groups: Record<string, T[]> = {};
  for (const act of acts) {
    const fid = act.firingId || 'unattributed';
    if (!groups[fid]) {
      groups[fid] = [];
      order.push(fid);
    }
    groups[fid]!.push(act);
  }
  return order.map((fid) => ({ firingId: fid, entries: groups[fid]! }));
}

/** A flight-log entry {@link firingLogEntry} matches by id. */
export interface FlightLogEntryLike {
  readonly id: string;
}

/** A card's flight log, as read by {@link firingLogEntry}. */
export interface CardWithFlightLog<T> {
  readonly flightLog?: readonly T[] | null | undefined;
}

/** Looks up a card's flight-log row for a given firing id, or null when the
 *  firing hasn't landed yet (still live, or predates the flight log). */
export function firingLogEntry<T extends FlightLogEntryLike>(
  c: CardWithFlightLog<T>,
  fid: string,
): T | null {
  const log = c.flightLog || [];
  for (const entry of log) if (entry.id === fid) return entry;
  return null;
}

/** An activity entry {@link actMeta} reads to build the model/token-usage chip. */
export interface ActMetaEntry {
  readonly model?: string | null;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
}

/** Model + token-usage chip text for one step (MICRO-ACTION TELEMETRY) — an
 *  honest per-turn cost approximation, not just a per-firing total. Null when
 *  the entry carried neither (predates capture, or a non-assistant step).
 *  Takes fmtTokens via injection (mirrors metricSparkline's fmtValue param)
 *  rather than importing it from `./format.ts`, since a real cross-module
 *  import type-checks fine but breaks once Vitest's SSR transform rewrites it
 *  to a reference that doesn't survive `.toString()` extraction. */
export function actMeta(a: ActMetaEntry, fmtTokens: (n: number) => string): string | null {
  const parts: string[] = [];
  if (a.model) parts.push(a.model);
  const tokensIn = typeof a.tokensIn === 'number' ? a.tokensIn : 0;
  const tokensOut = typeof a.tokensOut === 'number' ? a.tokensOut : 0;
  if (
    (typeof a.tokensIn === 'number' || typeof a.tokensOut === 'number') &&
    tokensIn + tokensOut > 0
  ) {
    parts.push(`${fmtTokens(tokensIn + tokensOut)} tok`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** {@link activityLiveLabel}'s result: the activity feed's own heading —
 *  text, `<h4>` class, and hover/focus tip, all keyed off the same
 *  live/idle split. */
export interface ActivityLiveLabel {
  readonly text: string;
  readonly className: string;
  readonly tip: string;
}

/** The activity feed's heading — "● live activity" while a firing is
 *  actually in progress, or "last flight — debrief" once nothing is live
 *  (a recap of the last completed firing, not a stuck live view). Honest
 *  framing an operator flagged directly: "shouldn't this reset?" */
export function activityLiveLabel(isLive: boolean): ActivityLiveLabel {
  const text = isLive ? '● live activity' : 'last flight — debrief';
  const className = 'act-label' + (isLive ? ' act-label-live' : '');
  const tip = isLive
    ? 'A firing is running right now — this feed updates live as it acts'
    : 'A recap of the last completed firing, not a live view — nothing is flying right now';
  return { text, className, tip };
}
