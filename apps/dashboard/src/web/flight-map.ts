// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure tooltip-text math for the "files in flight" map — client-only (no
 * server counterpart, unlike `shared/file-nodes.ts`, whose `activityFileNodes`
 * this module's caller feeds), so it lives in `web/` rather than `shared/`
 * (epic 0002 "shell decomposition", slice 2: feature-module split of
 * `shell.ts`), following the same pattern `flight-metrics.ts`/`format.ts`
 * proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The file-node fields {@link fnodeTip} reads — a narrow view of `shared/file-nodes.ts`'s `FileNode`. */
export interface FnodeTipInput {
  readonly path: string;
  readonly touches: number;
  readonly tool: string;
}

/** The flight map's per-node tooltip/description text: path, pluralized touch count, and most-recent tool. */
export function fnodeTip(n: FnodeTipInput): string {
  return (
    n.path + ' — ' + n.touches + ' touch' + (n.touches === 1 ? '' : 'es') + ' (' + n.tool + ')'
  );
}
