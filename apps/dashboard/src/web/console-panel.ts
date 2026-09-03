// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure aria-label text math for the raw flight CONSOLE panel's log
 * `<pre>` — client-only (no server counterpart), so it lives in `web/`
 * rather than `shared/`, the same reason `docs-panel.ts`'s `docFileTip`
 * does (epic 0002 "shell decomposition", slice 2: feature-module split of
 * `shell.ts`).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The pluralized "N line(s) of raw flight process output" aria-label
 *  `renderConsoleBody` writes to the console log `<pre>`. */
export function consoleLinesAriaLabel(lineCount: number): string {
  return lineCount + ' line' + (lineCount === 1 ? '' : 's') + ' of raw flight process output';
}
