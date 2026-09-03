// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure diff-line classification — client-only (no server counterpart), so it
 * lives in `web/` rather than `shared/`, the same split `activity-log.ts`
 * documents. Firing Replay viewer, diff-capture slice (BOARD web-msnt26yk-5fzo6j):
 * `web/shell.ts` embeds this module's real compiled source into the generated
 * `/app.js` text via `.toString()` (see `fleetJs()`), same as the other `web/`
 * feature modules, so the two copies can no longer drift apart.
 */

/** One line's rendering class for `git show`'s patch output (commit message +
 *  unified diff): additions/removals color, hunk/file headers stay muted, and
 *  everything else (the commit message, context lines) renders plain. Checked
 *  in this order because `+++`/`---` (file headers) would otherwise also
 *  match the bare `+`/`-` prefix tests. */
export function diffLineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff-file';
  if (line.startsWith('diff --git') || line.startsWith('index ')) return 'diff-meta';
  if (line.startsWith('@@')) return 'diff-hunk';
  if (line.startsWith('+')) return 'diff-add';
  if (line.startsWith('-')) return 'diff-remove';
  return 'diff-context';
}

/**
 * Firing Replay viewer, per-step diff slice (BOARD web-msnt26yk-5fzo6j): in
 * step-through mode, narrows a whole-firing patch down to just the hunks
 * touching `target` — the current replay step's file — so stepping through
 * several edits doesn't show the same wall of text on every step. Falls back
 * to the FULL patch (unchanged `lines`) when `target` is missing or doesn't
 * match any file section in the patch (a non-file step like a Grep search or
 * shell command) — showing everything beats showing nothing.
 *
 * Self-contained on purpose (no module-scope regex/helpers): `web/shell.ts`
 * splices this function into the client bundle via `.toString()`, which
 * carries only the function's OWN source text — the same constraint every
 * other spliced `web/` module works under.
 */
export function diffLinesForStep(
  lines: readonly string[],
  target: string | null | undefined,
): readonly string[] {
  if (!target) return lines;
  const headerRe = /^diff --git a\/.+ b\/(.+)$/;
  let sectionFile: string | null = null;
  let sectionLines: string[] | null = null;
  for (const line of lines) {
    const header = headerRe.exec(line);
    if (header) {
      if (sectionFile === target && sectionLines) return sectionLines;
      sectionFile = header[1]!;
      sectionLines = [line];
    } else if (sectionLines) {
      sectionLines.push(line);
    }
  }
  if (sectionFile === target && sectionLines) return sectionLines;
  return lines;
}

/** The firing detail's "View diff"/"Hide diff" toggle button's `[data-tip]`/
 *  `aria-label` (app-wide interactivity audit v2, web-msm66jlc-gm4oom) — the
 *  button carried no explanation of what it reveals, unlike its sibling
 *  "Step through" replay toggle rendered right above it. State-aware like the
 *  button's own label, so hover/focus previews match what the click will do. */
export function diffToggleTip(diffOpen: boolean): string {
  return diffOpen
    ? 'Hide this diff'
    : "Show this firing's code diff — the git commit patch it shipped";
}
