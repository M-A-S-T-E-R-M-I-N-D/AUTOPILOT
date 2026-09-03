// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure notification-decision logic for the browser Notifications channel
 * (backlog H, board web-msnsndlk-exw3t9) — client-only (no server
 * counterpart), so it lives in `web/` rather than `shared/`, following the
 * exact `flights.ts`/`fly.ts` split: this file's functions are unit-tested
 * directly, then `web/features/notifications.ts` embeds their real compiled
 * source into the generated `/app.js` text via `.toString()` instead of
 * hand-retyping them, so the two copies can never drift apart.
 *
 * Slice one covered the two events the read model already streamed over SSE
 * — a project's `status === 'needs_you'` and a `death-cluster` anomaly
 * (`read/anomalies.ts`). Slice two (this one) adds "flight-landed": a
 * `landed` events row `landing/execute.ts` persists per green
 * gate-then-merge (both the manual EXECUTE button and the automatic
 * land-watchdog go through it), read back via `read/fleet.ts`'s
 * `landedEvents`. Only the newest landed event per project is ever a
 * candidate key — see {@link latestLanded} — since it is a capped
 * historical LOG, not a live true/false condition like needs-you/
 * death-cluster.
 *
 * Every event here only fires while the tab is open (backgrounded is fine; a
 * closed tab has no JS context to fire from). True closed-tab delivery needs
 * a Service Worker + Push API this repo has none of yet; deliberately
 * deferred to a follow-up epic rather than bundled into a bigger,
 * unreviewable slice.
 */

/** Persisted opt-in + quiet-hours settings, `ap-notify-settings` in
 *  localStorage (client-only, survives a dashboard server restart for free —
 *  nothing server-side to lose, same precedent as `ap-fly-settings`). An
 *  empty `quietStart`/`quietEnd` means "no quiet hours configured". */
export interface NotifySettings {
  readonly enabled: boolean;
  readonly quietStart: string; // "HH:MM", 24h, local time
  readonly quietEnd: string; // "HH:MM", 24h, local time
}

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  enabled: false,
  quietStart: '',
  quietEnd: '',
};

/** Defensive parse of the stored settings blob — malformed/foreign JSON (a
 *  hand-edited localStorage value, a future schema) falls back to the
 *  all-off default rather than throwing mid-render. Returns the default as a
 *  fresh literal rather than referencing {@link DEFAULT_NOTIFY_SETTINGS} —
 *  this function is spliced into the client bundle via `.toString()`
 *  (`web/features/notifications.ts`), so it must stand alone with no
 *  reference to another module-level const that would not exist in that
 *  generated scope (same convention `flights.ts`'s `parseFlySettingsStore`
 *  already follows). */
export function parseNotifySettings(raw: string | null | undefined): NotifySettings {
  if (!raw) return { enabled: false, quietStart: '', quietEnd: '' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { enabled: false, quietStart: '', quietEnd: '' };
    }
    const p = parsed as Record<string, unknown>;
    return {
      enabled: p['enabled'] === true,
      quietStart: typeof p['quietStart'] === 'string' ? p['quietStart'] : '',
      quietEnd: typeof p['quietEnd'] === 'string' ? p['quietEnd'] : '',
    };
  } catch {
    return { enabled: false, quietStart: '', quietEnd: '' };
  }
}

/** Minutes since local midnight for an "HH:MM" string, or null when the
 *  string is empty/malformed/out of range.
 *
 *  Exported because `isQuietHour` closes over it and the client receives that
 *  function as `.toString()` text: a module-private helper does not come along
 *  with the emitted source, so it must be embedded alongside it (the same
 *  embed `latestLanded` needed in 8519b1cc). */
export function minutesOf(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** Whether `nowMinutes` (0-1439, minutes since local midnight) falls inside
 *  the configured quiet-hours window — handles a window that wraps past
 *  midnight (e.g. 22:00-07:00) the same way it handles one that doesn't
 *  (e.g. 09:00-17:00). No window configured (either side empty/malformed, or
 *  start === end) never counts as quiet. */
export function isQuietHour(nowMinutes: number, settings: NotifySettings): boolean {
  const start = minutesOf(settings.quietStart);
  const end = minutesOf(settings.quietEnd);
  if (start === null || end === null || start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

/** The subset of `read/fleet.ts`'s `ProjectCard` a notification decision
 *  needs — `anomalies` narrowed to just the field the death-cluster rule
 *  reads, `landedEvents` narrowed to just the fields the flight-landed rule
 *  reads, so this module never has to import the full read-model type. */
export interface NotifyProjectLike {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly anomalies: readonly { readonly kind: string; readonly evidence: string }[];
  /** Persisted flight-landed events (`read/fleet.ts`'s `LandedEventLike`),
   *  newest first — optional so existing callers/fixtures that predate it
   *  still type-check and simply never fire the flight-landed rule. */
  readonly landedEvents?: readonly { readonly details: string; readonly at: number }[];
}

export interface NotifyEvent {
  /** Dedupe key — stable per (project, condition), so a still-ongoing
   *  condition never re-fires on every ~1.5s SSE tick it stays true for. */
  readonly key: string;
  readonly title: string;
  readonly body: string;
}

/** A project's newest landed event (`landedEvents` arrives newest-first from
 *  the read layer), or `undefined` when it has never landed — deliberately
 *  narrowed to the SINGLE latest entry rather than one key per row, same
 *  anti-spam shape `read/anomalies.ts`'s `intentCollisions`/`guardDenials`
 *  already use: `landedEvents` is a capped historical LOG (up to 200 rows),
 *  not a live true/false condition like needs-you/death-cluster, so keying
 *  every row would replay a project's whole landing history as a browser
 *  notification storm the moment a returning tab (already opted in from a
 *  prior session) sees its first tick with an empty `seen` set. */
export function latestLanded(
  p: NotifyProjectLike,
): { readonly details: string; readonly at: number } | undefined {
  return p.landedEvents?.[0];
}

/** Every dedupe key currently true across the fleet — the needs-you and
 *  death-cluster conditions the read model already computes, plus each
 *  project's newest flight-landed event (see {@link latestLanded}). Compared
 *  against on the NEXT tick (not accumulated forever): a project that
 *  recovers drops its key and can fire fresh if the condition recurs later. */
export function activeNotifyKeys(projects: readonly NotifyProjectLike[]): Set<string> {
  const keys = new Set<string>();
  for (const p of projects) {
    if (p.status === 'needs_you') keys.add(`needs-you:${p.id}`);
    for (const a of p.anomalies) {
      if (a.kind === 'death-cluster') keys.add(`death-cluster:${p.id}`);
    }
    const landed = latestLanded(p);
    if (landed) keys.add(`landed:${p.id}:${landed.at}`);
  }
  return keys;
}

/** Needs-you/death-cluster conditions active right now, plus a fresh
 *  flight-landed event, that were NOT in `seen` (the previous tick's
 *  {@link activeNotifyKeys}) — i.e. genuinely new since the last check, not
 *  "still true"/"already landed". */
export function newNotifyEvents(
  projects: readonly NotifyProjectLike[],
  seen: ReadonlySet<string>,
): NotifyEvent[] {
  const events: NotifyEvent[] = [];
  for (const p of projects) {
    if (p.status === 'needs_you') {
      const key = `needs-you:${p.id}`;
      if (!seen.has(key)) {
        events.push({
          key,
          title: `${p.name} needs you`,
          body: 'Blocked on a decision only you can make.',
        });
      }
    }
    for (const a of p.anomalies) {
      if (a.kind === 'death-cluster') {
        const key = `death-cluster:${p.id}`;
        if (!seen.has(key)) {
          events.push({ key, title: `${p.name}: firings are dying`, body: a.evidence });
        }
      }
    }
    const landed = latestLanded(p);
    if (landed) {
      const key = `landed:${p.id}:${landed.at}`;
      if (!seen.has(key)) {
        events.push({
          key,
          title: `${p.name} landed`,
          body: landed.details || 'Merged into base.',
        });
      }
    }
  }
  return events;
}
