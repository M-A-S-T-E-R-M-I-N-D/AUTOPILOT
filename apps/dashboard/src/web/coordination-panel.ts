// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-line formatting for the FLEET COORDINATION panel — client-only (no
 * server counterpart formats these; `flight/fleet-digest.ts`'s
 * `buildFleetDigest` returns markdown-bullet lines meant for a firing's own
 * prompt text, e.g. `"- CLAIMED by fleet-2: [id] title"` or `"- sibling
 * autopilot/...: last commit \"...\""`; presenting those as a UI list item
 * rather than a prompt bullet is purely a client concern, same reasoning
 * `backlog-panel.ts`/`release-panel.ts` use).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** Which of `buildFleetDigest`'s two line shapes a coordination line is —
 *  drives which modifier class the panel gives it so a board claim (the most
 *  actionable line for an operator: "who already has this?") stands out from
 *  a sibling's git-derived status. */
export type CoordinationLineKind = 'claim' | 'sibling' | 'other';

/** One coordination line's rendered display text plus its kind and tooltip. */
export interface CoordinationLineMeta {
  /** The line with its leading markdown bullet (`"- "`) stripped — a prompt
   *  convention that reads as a stray dash in a UI list, which already
   *  supplies its own bullet via `<ul>`/`<li>`. */
  readonly text: string;
  readonly kind: CoordinationLineKind;
  /** What this KIND of line means — fleet-digest jargon ("CLAIMED by",
   *  "sibling …: last commit") is written for a firing's prompt, not an
   *  operator; the panel surfaces this via the shared `[data-tip]` primitive
   *  (interactivity audit v2, web-msm66jlc-gm4oom). Kept inside the function
   *  body below rather than a module-level map: only the function's own
   *  compiled source survives the `.toString()` splice into `/app.js`. */
  readonly tip: string;
}

/** Classifies + strips one `buildFleetDigest` line for display. */
export function coordinationLineMeta(line: string): CoordinationLineMeta {
  const text = line.startsWith('- ') ? line.slice(2) : line;
  if (text.startsWith('CLAIMED by ')) {
    return {
      text,
      kind: 'claim',
      tip: 'A board task the named lane has claimed — its owner is working it right now, so no other lane may pick it up',
    };
  }
  if (text.startsWith('sibling ')) {
    return {
      text,
      kind: 'sibling',
      tip: "A sibling lane's live branch status — its last commit, declared intent, and the files it is touching or has committed but not yet landed",
    };
  }
  return {
    text,
    kind: 'other',
    tip: 'A fleet-digest coordination line — the same context every firing reads before picking work',
  };
}
