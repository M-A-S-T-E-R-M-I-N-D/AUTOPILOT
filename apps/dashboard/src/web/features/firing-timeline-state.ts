// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The "Per-firing trace" cluster's CORE half (board ap-muo35gze-1): its state
 * maps and the `firingTimelineSection(c)` entry that `shell.ts`'s
 * `firingTimelineNode` calls. The renderer (`firingTraceSection`), its Firing
 * Replay viewer and its handlers live in `firing-timeline.ts`, which rides
 * the deferred `/panels.js` (web/chunks.ts): 14.4KB minified that no longer
 * blocks first paint.
 *
 * The maps stay in core because `shell.ts`'s `detailSectionSigsFor` reads
 * them bare on every render. The entry is typeof-guarded because the renderer
 * does not exist until `/panels.js` executes. Every render waits for
 * DOMContentLoaded (renderFleet's DEFER-ORDER LAW), by which point it has, so
 * the guard is a boot-window formality: the contract `metricsDetailNode`
 * already keeps for the deferred `metricsSection`.
 */
export function firingTimelineStateJs(): string {
  return `
// Which firing is drilled open per project (survives SSE re-renders).
var openFirings = {};
// Firing Replay viewer, slice 1 (BOARD web-msnt26yk-5fzo6j): a drilled-open
// firing's COMPLETE trace, fetched on demand from /api/firing-activity since
// /api/state's own feed caps at the newest N events project-wide — keyed by
// "<projectId>:<firingId>", populated once per firing and cached (a past
// firing's trace never changes).
var firingActivityExtra = {};
var firingActivityLoading = {};
// Firing Replay viewer, diff-capture slice (BOARD web-msnt26yk-5fzo6j): a
// drilled-open firing's commit diff, fetched on demand from /api/firing-diff
// only once its "View diff" toggle is opened (no cost to firings the operator
// never inspects) — keyed by "<projectId>:<firingId>", cached like
// firingActivityExtra above (a past firing's diff never changes).
var openDiffs = {};
var firingDiffExtra = {};
var firingDiffLoading = {};
// Firing Replay viewer, step-through slice (BOARD web-msnt26yk-5fzo6j): which
// step a drilled-open firing's playback controls are showing, keyed by
// "<projectId>:<firingId>" like the caches above. No key present for a
// firing means "not in step-through mode" — the full trace renders as
// before; entering replay sets it to 0 and Prev/Next/Exit move or clear it.
var replaySteps = {};
// The renderer rides /panels.js (defer); until it runs there is no trace.
function firingTimelineSection(c) {
  return typeof firingTraceSection === 'function' ? firingTraceSection(c) : null;
}
`.trim();
}
