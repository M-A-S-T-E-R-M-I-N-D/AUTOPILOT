// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure tooltip/aria-label text math for the Docs reader panel's per-file
 * buttons — client-only (no server counterpart), so it lives in `web/`
 * rather than `shared/`, the same reason `flight-map.ts`'s `fnodeTip` does
 * (epic 0002 "shell decomposition", slice 2: feature-module split of
 * `shell.ts`).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The "Currently viewing …"/"Open …" tip text `docsSection` writes to both
 *  a doc-file button's `data-tip` and `aria-label`. */
export function docFileTip(file: string, isOpen: boolean): string {
  return (isOpen ? 'Currently viewing ' : 'Open ') + file;
}
