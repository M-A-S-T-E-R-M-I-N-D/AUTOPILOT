// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * MASTHEAD POPOVERS (epic 0029 slice 6): every `<details name="masthead-popover">`
 * in the masthead — Connect, theme, language, notifications, settings, the
 * version menu, Foundation — behaves like one menu system. The operator's
 * ask (2026-09-13): a popover stayed open after a choice, and nothing closed
 * it when the pointer went elsewhere; hover should open a menu temporarily,
 * a click should pin it, and a choice or a click elsewhere should end it.
 *
 * Laws:
 * 1. LIGHT DISMISS — a pointer down outside every open popover closes them
 *    all; Escape closes them and returns focus to the summary that was open.
 * 2. A CHOICE CLOSES — picking a theme or a language closes its popover.
 *    Settings stay open: its rows are several choices in a row, and a
 *    pointer elsewhere or Escape still ends it.
 * 3. HOVER OPENS, CLICK PINS — only on devices that can hover
 *    (`(hover: hover)`): entering a closed popover opens it as a temporary
 *    (`data-hover`) menu and leaving closes it after a short grace; a click
 *    on its summary while hover-open pins it (`data-pinned`) instead of
 *    toggling it shut, and a pinned popover ignores mouseleave until a
 *    choice, Escape, or an outside pointer. Touch and keyboard keep the
 *    native <details> behaviour untouched — no hover path exists for them.
 *
 * Core chunk: the masthead is on every page. Every DOM write is guarded
 * (epic 0018 law 3) — an already-closed popover is never rewritten.
 */

/** The masthead popover client — vanilla, external (keeps CSP script-src 'self'). */
export function popoversJs(): string {
  return `
// MASTHEAD POPOVERS (epic 0029 slice 6) — see web/features/popovers.ts.
var POPOVER_SELECTOR = 'details[name="masthead-popover"]';
var POPOVER_CLOSE_DELAY_MS = 220;
function popoverAll() {
  return Array.prototype.slice.call(document.querySelectorAll(POPOVER_SELECTOR));
}
function popoverClose(d) {
  if (!d.open) return;
  d.removeAttribute('open');
  d.removeAttribute('data-pinned');
  d.removeAttribute('data-hover');
}
function popoverCloseAll(except) {
  popoverAll().forEach(function (d) { if (d !== except) popoverClose(d); });
}
function popoverInit() {
  var hoverable = !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);
  // Law 1 — light dismiss.
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    var inside = t && t.closest ? t.closest(POPOVER_SELECTOR) : null;
    if (!inside) popoverCloseAll(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = popoverAll().filter(function (d) { return d.open; });
    if (!open.length) return;
    popoverCloseAll(null);
    var s = open[0].querySelector('summary');
    if (s) { try { s.focus(); } catch (x) {} }
  });
  // Law 2 — a choice closes.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var choice = t.closest('[data-theme-btn], [data-lang-btn]');
    if (!choice) return;
    var d = choice.closest(POPOVER_SELECTOR);
    if (d) popoverClose(d);
  });
  // Law 3 — hover opens, click pins.
  popoverAll().forEach(function (d) {
    var timer = null;
    d.addEventListener('toggle', function () {
      if (d.open && !d.hasAttribute('data-hover')) d.setAttribute('data-pinned', '');
      if (!d.open) { d.removeAttribute('data-pinned'); d.removeAttribute('data-hover'); }
    });
    if (!hoverable) return;
    var summary = d.querySelector('summary');
    d.addEventListener('mouseenter', function () {
      if (timer) { clearTimeout(timer); timer = null; }
      if (d.open) return;
      d.setAttribute('data-hover', '');
      popoverCloseAll(d);
      d.setAttribute('open', '');
    });
    d.addEventListener('mouseleave', function () {
      if (d.hasAttribute('data-pinned')) return;
      timer = setTimeout(function () {
        timer = null;
        if (!d.hasAttribute('data-pinned')) popoverClose(d);
      }, POPOVER_CLOSE_DELAY_MS);
    });
    if (summary) summary.addEventListener('click', function (e) {
      if (d.open && d.hasAttribute('data-hover')) {
        e.preventDefault();
        d.removeAttribute('data-hover');
        d.setAttribute('data-pinned', '');
      }
    });
  });
}
popoverInit();
`.trim();
}
