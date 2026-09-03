// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Live wiring for RIGHT-CLICK REPORT-FROM-HERE (`web-mtdc6wsm-hek3bl`, epic
 * 0015) — `src/web/report-capture.ts`'s header comment deferred "the
 * contextmenu listener itself" and "actually overriding `console.error` to
 * feed the ring buffer" to a later slice; this is that slice. A new file
 * under `web/features/` (not a `shell.ts` edit — `shell.ts` is high-
 * contention, the same reason the D4 keyboard-grid slice kept its wiring
 * out), so `discoverFeatureModules('web/features')` finds this file's
 * `reportCaptureClientJs` export the same way it finds every other feature
 * module, and `web/features/index.ts` (regenerated via `--emit-index`, never
 * hand-edited) carries it into `featureModulesJs()`.
 *
 * Unlike `features/landing.ts` (hoisted function declarations only, zero
 * top-level statements — it is only ever CALLED, from `renderProjectPage()`
 * call sites), this module self-initializes at the bottom, the same shape
 * `features/switcher.ts`'s theme-on-load `document.addEventListener('click',
 * ...)` and `features/pool-client.ts`'s self-init `setInterval(...)` already
 * use: nothing needs to call this module, it wires itself up the moment its
 * text lands in the concatenated `/app.js` bundle.
 *
 * `resolveOwningModule`/`captureDomSnapshot`/`captureComputedCss`/
 * `createConsoleErrorRingBuffer`/`recordConsoleError` are generated FROM
 * `report-capture.ts` below via `.toString()` — their real compiled source,
 * not a hand-retyped copy, the same no-drift convention `features/report-menu.ts`
 * uses for `report-panel.ts`. Two of those functions reference a
 * module-scope constant as a free variable rather than a parameter
 * (`resolveOwningModule` closes over `REPORT_REGION_ATTR`, `captureDomSnapshot`
 * over `REPORT_DOM_MAX_TEXT_LENGTH` via its `.slice()` clip and
 * `captureComputedCss`'s default parameter closes over
 * `REPORT_CSS_PROPERTIES`) — `.toString()` only serializes a function's own
 * body text, never its closure, so this embeds each constant's REAL value
 * (via `JSON.stringify`, the same const-splice shape `features/switcher.ts`
 * uses for `THEME_NAMES`) immediately before the functions that need it in
 * scope. Every identifier this module declares at the assembled script's
 * top level is prefixed `reportCapture*` (or reuses the `report-capture.ts`
 * constant's own distinctive `REPORT_*` name) precisely because the served
 * bundle is one concatenated non-module script — a generic name here could
 * collide with another feature module's own top-level declaration.
 *
 * `data-report-region` is real because `shell.ts`'s `renderProjectPage()`
 * tags each of its eight region containers with it directly at render (REPORT
 * UNIFICATION 2/2, epic 0015) — the sibling-tag relay this module used to run
 * (a `reportTagRegions()` walk over per-region `reportFromHereSection` panels
 * plus a `MutationObserver` re-running it on every `#fleet` mutation) is
 * gone, superseded along with the eight always-open panels it read identity
 * from. The contextmenu listener below resolves an owning module straight off
 * `window.REPORT_REGIONS` — `shell.ts` declares `var REPORT_REGIONS` at its
 * script's top level, and every chunk on this page is a CLASSIC script
 * sharing one global scope (`web/chunks.ts`'s header comment), so the real
 * top-level literal is reachable as a real global with no attribute
 * plumbing; `/app.js` (core, not deferred) always executes before this
 * `/panels.js` chunk (deferred), so it is set before any contextmenu can
 * fire. The listener never calls `preventDefault()`, so the browser's native
 * context menu keeps working exactly as before this slice landed; it only
 * ever ADDS a `window.__autopilotReportCapture` snapshot for
 * `features/report-menu.ts`'s dialog to read.
 */
import {
  resolveOwningModule,
  captureDomSnapshot,
  captureComputedCss,
  createConsoleErrorRingBuffer,
  recordConsoleError,
  REPORT_REGION_ATTR,
  REPORT_DOM_MAX_TEXT_LENGTH,
  REPORT_CSS_PROPERTIES,
} from '../report-capture.js';

/** How many DOM levels below the right-clicked element {@link
 *  captureDomSnapshot} recurses into — deep enough to show real structure,
 *  shallow enough that a right-click near a region's root stays a small
 *  payload. */
const REPORT_CAPTURE_MAX_DEPTH = 4;

/** How many children per node {@link captureDomSnapshot} keeps at each
 *  level — see `captureDomSnapshot`'s own doc for why this caps rather than
 *  samples. */
const REPORT_CAPTURE_MAX_CHILDREN = 12;

/** How many recent console errors the live ring buffer retains — enough to
 *  show what led up to a right-click, small enough to never bloat a
 *  capture. */
const REPORT_CAPTURE_CONSOLE_ERROR_CAPACITY = 20;

/** The live contextmenu + console.error wiring for report-from-here capture
 *  — vanilla, external (keeps CSP script-src 'self'). */
export function reportCaptureClientJs(): string {
  return `
const REPORT_REGION_ATTR = ${JSON.stringify(REPORT_REGION_ATTR)};
const REPORT_DOM_MAX_TEXT_LENGTH = ${JSON.stringify(REPORT_DOM_MAX_TEXT_LENGTH)};
const REPORT_CSS_PROPERTIES = ${JSON.stringify(REPORT_CSS_PROPERTIES)};
${resolveOwningModule.toString()}
${captureDomSnapshot.toString()}
${captureComputedCss.toString()}
${createConsoleErrorRingBuffer.toString()}
${recordConsoleError.toString()}
var reportCaptureConsoleErrors = createConsoleErrorRingBuffer(${REPORT_CAPTURE_CONSOLE_ERROR_CAPACITY});
var reportCaptureRealConsoleError = console.error.bind(console);
console.error = function () {
  var message = Array.prototype.slice.call(arguments).map(String).join(' ');
  reportCaptureConsoleErrors = recordConsoleError(reportCaptureConsoleErrors, message, Date.now());
  reportCaptureRealConsoleError.apply(console, arguments);
};
document.addEventListener('contextmenu', function (e) {
  var target = e.target;
  if (!target || !target.closest || typeof getComputedStyle !== 'function') return;
  window.__autopilotReportCapture = {
    owningModule: resolveOwningModule(
      target,
      typeof REPORT_REGIONS !== 'undefined' ? REPORT_REGIONS : {},
    ),
    dom: captureDomSnapshot(target, ${REPORT_CAPTURE_MAX_DEPTH}, ${REPORT_CAPTURE_MAX_CHILDREN}),
    css: captureComputedCss(getComputedStyle(target)),
    consoleErrors: reportCaptureConsoleErrors.entries,
    capturedAt: Date.now(),
  };
});
`.trim();
}
