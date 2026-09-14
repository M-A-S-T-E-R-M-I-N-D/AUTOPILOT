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
import {
  TOUR_STEPS,
  TOUR_STEP_KEYS,
  tourStepMeta as sharedTourStepMeta,
  anchorPosition as sharedAnchorPosition,
  TOUR_GAP_PX,
  TOUR_MARGIN_PX,
} from '../tour.js';

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
var TOUR_GAP_PX = ${TOUR_GAP_PX};
var TOUR_MARGIN_PX = ${TOUR_MARGIN_PX};
${sharedAnchorPosition.toString()}
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
  var ring = document.getElementById('tour-ring');
  if (ring) ring.hidden = true;
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
// The element this stop points at, or null when the page does not have it.
function tourTarget(step) {
  if (!step || !step.selector) return null;
  try { return document.querySelector(step.selector); } catch (err) { return null; }
}

// Which stops this page can actually show. The Fly bar is absent on some
// subjects and the checklist disappears once both ticks are earned, so a
// fixed walk would point at empty space. Indices stay intact — TOUR_STEP_KEYS
// is index-parallel — and absent ones are stepped over instead of removed.
function tourPresent(i) {
  return !!tourTarget(TOUR_STEPS[i]);
}
function tourFirstPresent(from, dir) {
  var i = from;
  while (i >= 0 && i < TOUR_STEPS.length && !tourPresent(i)) i += dir;
  return i >= 0 && i < TOUR_STEPS.length ? i : -1;
}
function tourAdvance(dir) {
  var i = tourFirstPresent(tourStep + dir, dir);
  if (i === -1) { closeTour(); return; }
  tourStep = i;
  paintTour();
}

// Ring the target and bring it into view. The ring is a positioned box, not
// a filter or a clip-path on the page — nothing about the underlying layout
// moves, so a control cannot shift out from under the pointer mid-tour.
function tourSpotlight(target) {
  var ring = document.getElementById('tour-ring');
  if (!ring) {
    ring = el('div', 'tour-ring');
    ring.id = 'tour-ring';
    ring.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ring);
  }
  if (!target || typeof target.getBoundingClientRect !== 'function') {
    ring.hidden = true;
    return null;
  }
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  var r = target.getBoundingClientRect();
  ring.hidden = false;
  // translate, not offset: the stylesheet only ever animates transform
  // (COCKPIT 6/6's compositor-only rule), and moving a 9999px box-shadow by
  // layout would be the most expensive way possible to do it.
  ring.style.transform = 'translate(' + r.left + 'px, ' + r.top + 'px)';
  ring.style.inlineSize = r.width + 'px';
  ring.style.blockSize = r.height + 'px';
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

function paintTour() {
  tourEl.textContent = '';
  var meta = tourStepMeta(tourStep);
  var keys = TOUR_STEP_KEYS[tourStep];
  // First/last are about what this PAGE can show, not the fixed array.
  var isFirst = tourFirstPresent(tourStep - 1, -1) === -1;
  var isLast = tourFirstPresent(tourStep + 1, 1) === -1;
  var dialog = el('div', 'tour-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'tour-title');
  var h = el('h2', '', tr(keys.titleKey));
  h.id = 'tour-title';
  // "Step 3 of 9" belongs in the dialog's own heading, not a live region:
  // an aria-modal dialog hides outside live regions, and moving focus into
  // it suppresses the announcement anyway (WCAG 4.1.3).
  var counter = el('span', 'tour-step-count', tr('tourStepCount', {
    step: tourStep + 1,
    total: TOUR_STEPS.length,
  }));
  h.appendChild(counter);
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
  skip.textContent = tr(isLast ? 'tourClose' : 'tourSkip');
  skip.setAttribute('data-tip', tr(isLast ? 'tourSkipTipLast' : 'tourSkipTipMid'));
  skip.addEventListener('click', closeTour);
  actions.appendChild(skip);
  var nav = el('div', 'tour-nav');
  if (!isFirst) {
    var back = document.createElement('button');
    back.type = 'button';
    back.textContent = tr('tourBack');
    back.setAttribute('data-tip', tr('tourBackTip'));
    back.addEventListener('click', function () { tourAdvance(-1); });
    nav.appendChild(back);
  }
  if (!isLast) {
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'tour-next';
    next.textContent = tr('tourNext');
    next.setAttribute('data-tip', tr('tourNextTip'));
    next.addEventListener('click', function () { tourAdvance(1); });
    nav.appendChild(next);
  } else {
    // THE HAND-OVER (operator, 2026-09-15: "the tour was supposed to be
    // connected to the onboarding"). The tour teaches four words and then
    // used to just stop, leaving the reader with vocabulary and nothing to
    // press. Its last step now opens the checklist, which is the half that
    // asks them to actually do something. Guarded: the ladder rides the same
    // deferred chunk, and a page without it simply closes as before.
    var toLadder = document.createElement('button');
    toLadder.type = 'button';
    // NOT 'tour-next': that class means ADVANCE, and anything walking the
    // tour by clicking it would walk straight out of the dialog.
    toLadder.className = 'tour-start';
    toLadder.textContent = tr('tourToLadder');
    toLadder.setAttribute('data-tip', tr('tourToLadderTip'));
    toLadder.addEventListener('click', function () {
      closeTour();
      if (typeof obFocusLadder === 'function') obFocusLadder();
    });
    nav.appendChild(toLadder);
  }
  actions.appendChild(nav);
  dialog.appendChild(actions);
  tourEl.appendChild(dialog);

  // Ring the target, then place the card BESIDE it — measured, because the
  // card's height depends on how long this stop's sentence wrapped. A
  // placement that would overflow flips to the opposite side rather than
  // sliding over the thing it is pointing at (WCAG 2.4.11).
  var rect = tourSpotlight(tourTarget(meta.step));
  if (rect) {
    var card = dialog.getBoundingClientRect();
    var at = anchorPosition(
      rect,
      { width: card.width, height: card.height },
      { width: window.innerWidth, height: window.innerHeight },
      meta.step.placement,
    );
    dialog.classList.add('is-anchored');
    dialog.dataset.placement = at.placement;
    dialog.style.insetInlineStart = at.x + 'px';
    dialog.style.insetBlockStart = at.y + 'px';
  }

  var focusable = tourFocusable();
  (focusable[focusable.length - 1] || skip).focus();
}
function openTour() {
  if (!tourEl) {
    tourEl = el('div', 'tour-overlay');
    tourEl.addEventListener('keydown', onTourKeydown);
    document.body.appendChild(tourEl);
  }
  // Start on the first stop this page can actually show.
  var first = tourFirstPresent(0, 1);
  tourStep = first === -1 ? 0 : first;
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
