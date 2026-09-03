// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure geometry/data for the agent office map — client-only (no server
 * counterpart, unlike `shared/*.ts`), so it lives in `web/` rather than
 * `shared/` (epic 0002 "shell decomposition", slice 2: feature-module
 * split of `shell.ts`). Deliberately DOM-free: the SVG-drawing half of the
 * office map (`officeSatellites`/`officeMapSection`/`prefersReducedMotion`)
 * lives in `web/features/office-map.ts` as DOM code embedded in a string
 * template, not as real functions in THIS module, because `document`/
 * `window` types need a DOM lib the dashboard's build tsconfig doesn't
 * currently carry for type-checked TS — a real, invoked function here would
 * need one; a string template (like every other `web/features/*.ts` file)
 * doesn't. `officeSatellites`' own per-satellite orbit-position math
 * (`officeSatellitePos`) lives here though, same as `officeTargetFor`/
 * `officeEase` before it — the loop that turns each position into a
 * `<circle>` stays in `web/features/office-map.ts`.
 *
 * `web/features/office-map.ts` embeds this module's real compiled source
 * into the generated `/app.js` text via `.toString()`/`JSON.stringify()` —
 * see `officeMapJs()` — instead of hand-retyping it, so the constants and
 * the client copy can no longer drift apart. `apps/dashboard/test/web/
 * office-map.test.ts` regression-tests the served bundle's rendered
 * geometry end to end; this module's own tests
 * (`office-map-geometry.test.ts`) cover the pure functions directly.
 */

/** The office rail's phase order, left to right. */
export const OFFICE_PHASES: readonly string[] = ['orient', 'do', 'gate', 'commit'];

/** Short zone label shown under each phase's rect. */
export const OFFICE_LABELS: Readonly<Record<string, string>> = {
  orient: 'ORIENT',
  do: 'DO',
  gate: 'GATE',
  commit: 'COMMIT',
};

/** Tooltip text explaining what a phase means, shown on hover/focus. */
export const OFFICE_TIPS: Readonly<Record<string, string>> = {
  orient: 'ORIENT — reading repo state before picking work',
  do: 'DO — making the focused, minimal change',
  gate: 'GATE — typecheck + test + build must pass',
  commit: 'COMMIT — staging and committing the verified change',
};

export const OFFICE_W = 320;
export const OFFICE_H = 70;
export const OFFICE_ZONE_W = 64;
export const OFFICE_ZONE_H = 28;
export const OFFICE_ZONE_Y = 8;
export const OFFICE_GAP = 13;
export const OFFICE_IDLE_X = OFFICE_W / 2;
export const OFFICE_IDLE_Y = 60;
export const OFFICE_ANIM_MS = 650;
export const OFFICE_SATELLITE_R = 2.5;
export const OFFICE_SATELLITE_ORBIT = 11;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The left edge x of the i-th phase zone on the office rail. */
export function officeZoneX(i: number): number {
  return OFFICE_GAP + i * (OFFICE_ZONE_W + OFFICE_GAP);
}

/** Where the live-firing dot eases toward for a phase — the idle center for
 *  an unrecognized or null phase (nothing flying, or a phase this rail
 *  doesn't track). */
export function officeTargetFor(phase: string | null): Point {
  const i = OFFICE_PHASES.indexOf(phase ?? '');
  if (i === -1) return { x: OFFICE_IDLE_X, y: OFFICE_IDLE_Y };
  return { x: officeZoneX(i) + OFFICE_ZONE_W / 2, y: OFFICE_ZONE_Y + OFFICE_ZONE_H / 2 };
}

/** Cubic ease-out — the curve the dot's requestAnimationFrame tween rides. */
export function officeEase(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Position of the i-th of n orbiting subagent satellites, spread evenly
 *  around center starting from the top (12 o'clock) — center itself when
 *  there are no satellites, since i/n would otherwise divide by zero. */
export function officeSatellitePos(i: number, n: number, center: Point): Point {
  if (n <= 0) return center;
  const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
  return {
    x: center.x + OFFICE_SATELLITE_ORBIT * Math.cos(angle),
    y: center.y + OFFICE_SATELLITE_ORBIT * Math.sin(angle),
  };
}

/** The live-firing dot's eased position `t` (0..1) of the way through its
 *  tween from `from` to `target` — `t=0` is `from` exactly, `t=1` is
 *  `target` exactly. */
export function officeTweenPos(from: Point, target: Point, t: number): Point {
  const e = officeEase(t);
  return {
    x: from.x + (target.x - from.x) * e,
    y: from.y + (target.y - from.y) * e,
  };
}
