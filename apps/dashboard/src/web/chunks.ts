// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CLIENT CODE-SPLITTING (epic 0002 slice 2 / BUNDLE DIET, board
 * web-msr0ufy0-8pht13 + the A2 reseed web-msuflffa-imy6ne): the chunk map
 * that decides which feature modules ride in which served script.
 *
 * WHY: the single /app.js crossed 210KB minified against a 150KB budget —
 * the one red `verify` leg blocking every release — and A2's finding holds:
 * concatenating MORE modules can never shrink the concatenation. The only
 * lever that scales is serving less on first load. Measured 2026-08-28
 * (per-module minified, esbuild, charset=utf8): features total ~112KB +
 * fleetJs ~86KB.
 *
 * HOW THE SPLIT IS SAFE: pages navigate by full page load (`.card-link` is a
 * plain href), and every chunk is a CLASSIC script sharing one global scope,
 * so hoisted function declarations from a later script are callable by an
 * earlier one at event time — exactly the hoisting contract the one-bundle
 * architecture already relied on. What matters is only that a function is
 * defined before it is CALLED, never before it is referenced in source:
 *
 * - PROJECT_PAGE_FEATURES are called exclusively inside
 *   `renderProjectPage()` (verified by call-site scan, 2026-08-28 — e.g.
 *   `landingSection`/`releaseSection`). `renderProjectPage()` runs only when
 *   the shell carries a `data-project` anchor, and `/p/<id>` pages emit the
 *   project chunk's script tag, deferred, so it has executed long before the
 *   first `/api/state` response triggers a render.
 * - DEFERRED_OPERATOR_FEATURES self-initialize on their own timers/listeners
 *   and nothing in the core bundle calls them unguarded: `renderFleet`'s
 *   `syncPoolClientProjects`/`maybeAutoOpenTour` call sites are
 *   typeof-guarded (same contract `maybeNotifyFleet` has used all along), so
 *   until the deferred chunk executes those calls are skipped, and each
 *   module's own self-init runs the moment its script does. `locale-data` is
 *   the one exception to "self-initialize": it carries no functions of its
 *   own, just the non-English `STRINGS` data (board ap-mtk2tgvh-0's BUNDLE
 *   DIET) plus a call INTO core's `translateDom` to re-sweep once that data
 *   lands — safe because core (non-deferred `/app.js`) always finishes
 *   executing before any deferred chunk starts.
 * - Everything else is CORE: called during home-card building
 *   (`activitySection` L1593, `firingTimelineSection` L1596,
 *   `metricsSection` L1616, `officeMapSection` via the L1250 dispatch
 *   table), at boot (`translateDom`), or from renderFleet's sync hooks.
 *
 * Cross-module call edges verified against the split (2026-08-28 scan):
 * issue-triage→pr-review, docs-viewer→search, pr-review→locale,
 * locale-data→locale all point INTO core; evolution→process-health stays
 * inside the project chunk.
 *
 * A module missing from every list below lands in CORE — the safe default
 * (it can only cost bundle bytes, never a ReferenceError). The chunk test
 * asserts the lists stay disjoint, name only real modules, and that the
 * three composers cover the discovered module set exactly.
 */

import { FEATURE_MODULE_FUNCTIONS_BY_BASENAME } from './features/index.js';

/** Every feature module by its kebab-case name — generated from
 *  `discoverFeatureModules()` (see `web/features/index.ts`'s own
 *  `FEATURE_MODULE_FUNCTIONS_BY_BASENAME`, regenerated via
 *  `node scripts/codemod/generate-splice-manifest.mjs --emit-index`) instead
 *  of a hand-written import plus object-literal entry per module. The chunk
 *  test still compares this against `discoverFeatureModules()` directly, so a
 *  module missing from the generated barrel (a stale regen) fails loudly too;
 *  the LISTS below may stay untouched, in which case a new module defaults to
 *  core. */
export const FEATURE_JS_BY_NAME: Readonly<Record<string, () => string>> =
  FEATURE_MODULE_FUNCTIONS_BY_BASENAME;

/** Called only from `renderProjectPage()` — served as /project.js on
 *  `/p/<id>` pages only. */
export const PROJECT_PAGE_FEATURES: readonly string[] = [
  'activity-heatmap',
  'backlog',
  'coordination',
  'docs-viewer',
  'evolution',
  'flight-console',
  'flight-summary',
  'issue-triage',
  'landing',
  'pipeline',
  'process-health',
  'release',
  'round-panel',
];

/** Self-initializing operator panels nothing in core calls unguarded —
 *  served as /panels.js with `defer` on every page. */
export const DEFERRED_OPERATOR_FEATURES: readonly string[] = [
  'connect',
  'pr-review',
  'metrics',
  'notifications',
  'pool-client',
  'publicity',
  'tour',
  'report-capture-client',
  'report-menu',
  'locale-data',
];

function joined(names: readonly string[]): string {
  return names.map((n) => (FEATURE_JS_BY_NAME[n] as () => string)()).join('\n');
}

/** Core chunk: every module not explicitly deferred — the safe default. */
export function coreFeatureModulesJs(): string {
  const deferred = new Set([...PROJECT_PAGE_FEATURES, ...DEFERRED_OPERATOR_FEATURES]);
  return joined(Object.keys(FEATURE_JS_BY_NAME).filter((n) => !deferred.has(n)));
}

/** The `/project.js` chunk (project pages only, defer-ordered after core). */
export function projectFeatureModulesJs(): string {
  return joined(PROJECT_PAGE_FEATURES);
}

/** The `/panels.js` chunk (every page, defer — self-init panels). */
export function deferredFeatureModulesJs(): string {
  return joined(DEFERRED_OPERATOR_FEATURES);
}
