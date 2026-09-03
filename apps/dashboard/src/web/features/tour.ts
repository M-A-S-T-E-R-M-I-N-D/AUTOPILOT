// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The first-run guided tour — a whole bundle-composing assembler function
 * extracted out of `shell.ts`'s `fleetJs()` into its own file under
 * `web/features/` (epic 0002 "shell decomposition", SHELL HUB RELIEF —
 * see docs/epics/0002-shell-decomposition.md, and `web/features/switcher.ts`
 * for the first extraction of this shape). `web/shell.ts`'s `clientJs()`
 * calls it indirectly through `featureModulesJs()`, so its return value —
 * not its compiled source — is what lands in the served `/app.js` text;
 * moving the function itself (not splicing it) is therefore zero behavior
 * change. `discoverFeatureModules('web/features')` finds this file's
 * `tourJs` export the same way it already finds `switcher.ts`'s/
 * `connect.ts`'s. Like `connect.ts`, this one still carries real
 * relative-import splices of its own — `TOUR_STEPS`/`tourStepMeta`,
 * embedded via `JSON.stringify()`/`.toString()` — now resolved relative to
 * this file instead of `shell.ts`.
 *
 * `maybeAutoOpenTour()` (declared below) is called from `fleetJs()`'s
 * `renderFleet()` once the fleet state comes back empty — a call site that
 * stays a bare, unimported identifier reference in `fleetJs()`'s own served
 * text. That works because the served bundle is one concatenated
 * non-module script (`clientJs()` = `fleetJs()` + `featureModulesJs()`):
 * `maybeAutoOpenTour` is a hoisted `function` declaration, and by the time
 * `renderFleet()` actually invokes it (async, after the whole script has
 * already run once), every feature module's functions — this one included —
 * are already defined in the same shared top-level scope, the same way
 * `switcher.ts`'s `applyTheme` and `search.ts`'s calls to `fleetJs()`'s own
 * `el()` helper already rely on.
 *
 * `paintTour()` renders every piece of tour text via `tr(key)` (board
 * web-msnsndki-dz3vn1) rather than the English literals `TOUR_STEPS`/
 * `tourStepMeta` carry — it rebuilds the dialog imperatively on every open
 * and step change, so there is no persistent DOM node a `[data-i18n]` sweep
 * could reach, the same reason `shell.ts`'s `window.confirm()` dialogs read
 * their text from `tr()` instead of a tagged element. `tr` is defined by
 * `features/locale.ts`, which — like this module — rides the deferred
 * `/panels.js` chunk, but `locale` itself lands in the CORE chunk
 * (`web/chunks.ts`), so `tr` is already a hoisted global by the time any
 * deferred script (this one included) can run.
 */
import { TOUR_STEPS, TOUR_STEP_KEYS, tourStepMeta as sharedTourStepMeta } from '../tour.js';

/** The first-run guided tour client — vanilla, external (keeps CSP script-src 'self'). */
export function tourJs(): string {
  return `
// First-run guided tour — a dismissible, keyboard-accessible dialog explaining
// AUTOPILOT's core vocabulary (firing/slice/gate/flight) in plain language.
// Reachable any time via the masthead "Tour" button, and auto-opens once for a
// genuinely fresh profile (see maybeAutoOpenTour below). Most of these terms
// already carry their own [data-tip] glossary tooltip where they're used (see
// tipChip call sites, e.g. the "slice of <task>" chip above) — this is the
// guided walkthrough for someone who hasn't found those yet.
// TOUR_STEPS/tourStepMeta are generated FROM web/tour.ts below (epic 0002
// "shell decomposition", slice 2) — their real value/compiled source via
// JSON.stringify()/.toString(), not a hand-retyped copy. They can no longer
// drift apart.
var TOUR_STEPS = ${JSON.stringify(TOUR_STEPS)};
var TOUR_STEP_KEYS = ${JSON.stringify(TOUR_STEP_KEYS)};
${sharedTourStepMeta.toString()}
var TOUR_SEEN_KEY = 'ap-tour-seen';
var tourStep = 0;
var tourLastFocus = null;
var tourEl = null;
function tourFocusable() {
  return tourEl ? Array.prototype.slice.call(tourEl.querySelectorAll('button')) : [];
}
function closeTour() {
  if (!tourEl) return;
  tourEl.hidden = true;
  tourEl.textContent = '';
  try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch (err) {}
  if (tourLastFocus && typeof tourLastFocus.focus === 'function') tourLastFocus.focus();
  tourLastFocus = null;
}
function onTourKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeTour(); return; }
  if (e.key !== 'Tab') return;
  var items = tourFocusable();
  if (items.length === 0) return;
  var first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function paintTour() {
  tourEl.textContent = '';
  var meta = tourStepMeta(tourStep);
  var keys = TOUR_STEP_KEYS[tourStep];
  var dialog = el('div', 'tour-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'tour-title');
  var h = el('h2', '', tr(keys.titleKey));
  h.id = 'tour-title';
  dialog.appendChild(h);
  dialog.appendChild(el('p', '', tr(keys.bodyKey)));
  var dots = el('div', 'tour-dots');
  dots.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < TOUR_STEPS.length; i++) {
    var dot = el('span', 'tour-dot');
    if (i === tourStep) dot.setAttribute('aria-current', 'true');
    dots.appendChild(dot);
  }
  dialog.appendChild(dots);
  var actions = el('div', 'tour-actions');
  var skip = document.createElement('button');
  skip.type = 'button';
  skip.textContent = tr(meta.isLast ? 'tourClose' : 'tourSkip');
  skip.setAttribute('data-tip', tr(meta.isLast ? 'tourSkipTipLast' : 'tourSkipTipMid'));
  skip.addEventListener('click', closeTour);
  actions.appendChild(skip);
  var nav = el('div', 'tour-nav');
  if (!meta.isFirst) {
    var back = document.createElement('button');
    back.type = 'button';
    back.textContent = tr('tourBack');
    back.setAttribute('data-tip', tr('tourBackTip'));
    back.addEventListener('click', function () { tourStep--; paintTour(); });
    nav.appendChild(back);
  }
  if (!meta.isLast) {
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'tour-next';
    next.textContent = tr('tourNext');
    next.setAttribute('data-tip', tr('tourNextTip'));
    next.addEventListener('click', function () { tourStep++; paintTour(); });
    nav.appendChild(next);
  }
  actions.appendChild(nav);
  dialog.appendChild(actions);
  tourEl.appendChild(dialog);
  var focusable = tourFocusable();
  (focusable[focusable.length - 1] || skip).focus();
}
function openTour() {
  if (!tourEl) {
    tourEl = el('div', 'tour-overlay');
    tourEl.addEventListener('keydown', onTourKeydown);
    document.body.appendChild(tourEl);
  }
  tourStep = 0;
  tourLastFocus = document.activeElement;
  tourEl.hidden = false;
  paintTour();
}
// Auto-open once for a genuinely fresh profile: an empty fleet (nothing onboarded
// yet) that has never dismissed the tour. Gating on the empty fleet — not just the
// missing localStorage flag — means a returning user who cleared storage but still
// has projects flying never gets the dialog shoved in front of them.
function maybeAutoOpenTour() {
  var seen;
  try { seen = localStorage.getItem(TOUR_SEEN_KEY); } catch (err) {}
  if (!seen) openTour();
}
document.addEventListener('click', function (e) {
  var b = e.target && e.target.closest && e.target.closest('#tour-btn');
  if (b) openTour();
});
// CODE-SPLIT handshake (web/chunks.ts): this module rides /panels.js with
// defer, so renderFleet's empty-fleet gate can fire before maybeAutoOpenTour
// exists — the core bundle leaves this flag instead, and the gate's decision
// (made THERE, where fleet state lives) is honored the moment we load.
if (window.__apTourAutoOpenPending) {
  delete window.__apTourAutoOpenPending;
  maybeAutoOpenTour();
}
`.trim();
}
