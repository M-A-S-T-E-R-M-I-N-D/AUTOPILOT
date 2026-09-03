// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure logic shared by the server read-model (`read/fleet.ts`) and the
 * hand-authored client bundle (`web/shell.ts`, no bundler, CSP `self`-only —
 * epic 0002 "shell decomposition", slice 1). `web/shell.ts` embeds this
 * module's real compiled source into the generated `/app.js` text via
 * `.toString()` — see `fleetJs()` — instead of hand-retyping the flight
 * map's file-collapsing logic, so the two copies can no longer drift apart.
 * `apps/dashboard/test/web/file-nodes-parity.test.ts` regression-tests that
 * the served bundle's output matches this module's own function.
 *
 * `activityFileNodes` takes basename resolution via a caller-supplied
 * `nameOf` rather than importing `basename` from `shared/narrator.ts` —
 * mirroring the existing `heatmapDays(..., verdictOf)` injection pattern
 * (`web/heatmap.ts`) already used elsewhere in the client. A real (not
 * `.toString()`-spliced) cross-module import here would type-check and run
 * fine under a bundler, but breaks under Vitest's SSR module transform: the
 * compiled function body ends up referencing a `__vite_ssr_import_N__`
 * namespace binding that doesn't exist once the function's source is lifted
 * out via `.toString()` and re-run standalone in the client bundle. Keeping
 * this module import-free avoids that trap entirely.
 */

/** The activity fields {@link activityFileNodes} reads — a narrow view of `read/fleet.ts`'s `ActivityEntry`. */
export interface FileNodeActivity {
  readonly tool: string;
  readonly target: string;
  readonly kind: string;
  readonly phase: string;
  readonly at: number;
}

/** A file the agent has touched — one node on the live flight map. */
export interface FileNode {
  readonly path: string;
  readonly name: string; // basename
  readonly touches: number;
  readonly phase: string; // phase of the most recent touch
  readonly tool: string; // tool of the most recent touch
  readonly at: number; // time of the most recent touch
}

export const DEFAULT_FILE_NODE_CAP = 8;

/**
 * Collapse the raw activity timeline into distinct **file nodes** for the flight
 * map — one per file the agent touched, carrying its touch count and the phase +
 * tool of its most recent touch, newest first, capped for legibility. Pure and
 * event-derived: it never invents a node the events don't show (MASTER-PLAN §5.2).
 */
export function activityFileNodes(
  activity: readonly FileNodeActivity[],
  nameOf: (target: string) => string,
  cap: number = DEFAULT_FILE_NODE_CAP,
): readonly FileNode[] {
  const byPath = new Map<string, FileNode>();
  for (const a of activity) {
    if (a.kind !== 'file') continue;
    const existing = byPath.get(a.target);
    const touches = (existing?.touches ?? 0) + 1;
    // Keep the most-recent touch's phase/tool/time as the node's identity.
    const isNewer = !existing || a.at >= existing.at;
    byPath.set(a.target, {
      path: a.target,
      name: nameOf(a.target),
      touches,
      phase: isNewer ? a.phase : existing.phase,
      tool: isNewer ? a.tool : existing.tool,
      at: isNewer ? a.at : existing.at,
    });
  }
  return [...byPath.values()].sort((x, y) => y.at - x.at).slice(0, Math.max(0, cap));
}
