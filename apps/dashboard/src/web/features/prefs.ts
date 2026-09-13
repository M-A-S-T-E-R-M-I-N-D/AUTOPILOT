// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DISPLAY & ACCESSIBILITY PREFERENCES (epic 0029 slice 1; operator,
 * 2026-09-13: "closer to AAA — other fonts, other sizes, more or less
 * relaxed spacing, resettable at any time; in the terminal theme the default
 * greenish phosphor, resettable, plus a free-to-play HUD"): one Settings
 * popover in the masthead holds text size, font, density, motion and — under
 * the terminal theme — the phosphor tint, with one Reset.
 *
 * Every preference is an attribute on `<html>` (`data-text`, `data-font`,
 * `data-density`, `data-motion`, `data-phosphor`) that the stylesheet reads;
 * a default carries no attribute at all, so a fresh page and a reset page
 * are byte-identical. Saved in one localStorage key (`ap-prefs`), applied at
 * boot before the first paint of anything below the masthead — the same
 * discipline the theme switcher uses. WCAG 2.2: text resizes up to 125%
 * without loss (1.4.4), spacing widens (1.4.12), motion can be reduced
 * regardless of the OS setting (2.3.3). Every DOM write is guarded.
 *
 * Core chunk: the attributes must be on `<html>` before the deferred panels
 * paint, and the popover is server-rendered so nothing pops in.
 */

/** The preference names, each with its allowed values; the first is the default. */
export const PREF_CHOICES: Readonly<Record<string, readonly string[]>> = {
  text: ['md', 'sm', 'lg', 'xl'],
  font: ['inter', 'system', 'mono'],
  density: ['comfortable', 'compact', 'relaxed'],
  motion: ['system', 'reduce'],
  phosphor: ['green', 'amber', 'white'],
};

/** The preferences client — vanilla, external (keeps CSP script-src 'self'). */
export function prefsJs(): string {
  return `
// DISPLAY & ACCESSIBILITY PREFERENCES (epic 0029 slice 1) — see web/features/prefs.ts.
var PREFS_KEY = 'ap-prefs';
var PREF_CHOICES = ${JSON.stringify(PREF_CHOICES)};
function prefDefaults() {
  var out = {};
  for (var k in PREF_CHOICES) out[k] = PREF_CHOICES[k][0];
  return out;
}
function readPrefs() {
  var prefs = prefDefaults();
  var raw = null;
  try { raw = localStorage.getItem(PREFS_KEY); } catch (e) {}
  if (!raw) return prefs;
  var saved = null;
  try { saved = JSON.parse(raw); } catch (e) { return prefs; }
  if (!saved || typeof saved !== 'object') return prefs;
  for (var k in PREF_CHOICES) {
    if (PREF_CHOICES[k].indexOf(saved[k]) !== -1) prefs[k] = saved[k];
  }
  return prefs;
}
function writePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
}
function applyPrefs(prefs) {
  var html = document.documentElement;
  for (var k in PREF_CHOICES) {
    var v = prefs[k];
    var attr = 'data-' + k;
    // A default carries no attribute: a reset page equals a fresh page.
    if (v === PREF_CHOICES[k][0]) {
      if (html.hasAttribute(attr)) html.removeAttribute(attr);
    } else if (html.getAttribute(attr) !== v) {
      html.setAttribute(attr, v);
    }
  }
  var buttons = document.querySelectorAll('[data-pref]');
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    var pressed = String(prefs[b.getAttribute('data-pref')] === b.getAttribute('data-pref-value'));
    if (b.getAttribute('aria-pressed') !== pressed) b.setAttribute('aria-pressed', pressed);
  }
}
function setPref(name, value) {
  if (!PREF_CHOICES[name] || PREF_CHOICES[name].indexOf(value) === -1) return;
  var prefs = readPrefs();
  prefs[name] = value;
  writePrefs(prefs);
  applyPrefs(prefs);
}
function resetPrefs() {
  try { localStorage.removeItem(PREFS_KEY); } catch (e) {}
  applyPrefs(prefDefaults());
}
applyPrefs(readPrefs());
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var b = t.closest('[data-pref]');
  if (b) { setPref(b.getAttribute('data-pref'), b.getAttribute('data-pref-value')); return; }
  if (t.closest('#prefs-reset')) resetPrefs();
});
`.trim();
}
