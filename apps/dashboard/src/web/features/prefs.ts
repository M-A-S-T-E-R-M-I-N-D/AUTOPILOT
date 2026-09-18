// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * DISPLAY & ACCESSIBILITY PREFERENCES (epic 0029 slices 1 and 3; operator,
 * 2026-09-13: "closer to AAA — other fonts, other sizes, more or less
 * relaxed spacing, resettable at any time; in the terminal theme the default
 * greenish phosphor, resettable, plus a free-to-play HUD"): one Settings
 * popover in the masthead holds text size, font, density, motion and — under
 * the terminal theme — the phosphor tint, with one Reset. The terminal
 * theme also gets a floating HUD bar (`web/shell.ts`'s `terminalHudHtml()`)
 * offering scanlines and glow the same way — a choice-list preference each —
 * plus its own dismiss, which is a preference too (`hud`: shown | hidden,
 * shown by default): dismissing sets it, Reset clears it, exactly like
 * every other row. Settings carries the SAME three terminal rows
 * (scanlines, glow, HUD bar), so a dismissed bar comes back from there
 * without a full reset (operator, 2026-09-18: "I can't bring this menu
 * back simply after choosing, and it should appear in our Settings panel
 * too"). A saved boolean `true` from before that change still reads as
 * hidden.
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
  scanlines: ['off', 'on'],
  glow: ['off', 'on'],
  hud: ['shown', 'hidden'],
};

/** The preferences client — vanilla, external (keeps CSP script-src 'self'). */
export function prefsJs(): string {
  return `
// DISPLAY & ACCESSIBILITY PREFERENCES (epic 0029 slice 1) — see web/features/prefs.ts.
var PREFS_KEY = 'ap-prefs';
var PREF_CHOICES = ${JSON.stringify(PREF_CHOICES)};
// HUE (epic 0029 slice 7): a rotation in degrees, 0 = the theme as designed —
// a range, not a choice list, so it rides beside PREF_CHOICES. The rotated
// colours are computed HERE from the tokens' --color-*-base twins and written
// inline on <html>: relative colour syntax is not available in every
// Chromium, and an unparseable token at computed time makes every colour
// vanish (the terminal theme, 2026-09-13).
var HUE_MAX = 359;
var HUE_TOKENS = ["surface","surface-raised","surface-sunken","text","text-muted","border","border-strong","accent","accent-text","info","sev-low","needs-you"];
function hueBaseOf(html, name) {
  var v = html.style.getPropertyValue(name);
  if (!v && typeof getComputedStyle === 'function') v = getComputedStyle(html).getPropertyValue(name);
  return (v || '').trim();
}
function hueRotate(oklch, rot) {
  var m = /^oklch\\(\\s*([\\d.]+%?)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)$/.exec(oklch);
  if (!m) return '';
  var h = (Number(m[3]) + rot) % 360;
  return 'oklch(' + m[1] + ' ' + m[2] + ' ' + h + ')';
}
function applyHue(html, hue) {
  for (var i = 0; i < HUE_TOKENS.length; i++) {
    var name = '--color-' + HUE_TOKENS[i];
    var next = hue ? hueRotate(hueBaseOf(html, name + '-base'), hue) : '';
    if (next) { if (html.style.getPropertyValue(name) !== next) html.style.setProperty(name, next); }
    else if (html.style.getPropertyValue(name)) html.style.removeProperty(name);
  }
}
function prefDefaults() {
  var out = {};
  for (var k in PREF_CHOICES) out[k] = PREF_CHOICES[k][0];
  out.hue = 0;
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
  var h = Number(saved.hue);
  if (Number.isInteger(h) && h >= 0 && h <= HUE_MAX) prefs.hue = h;
  // Legacy shape (epic 0029 slice 3 stored a boolean): true meant dismissed.
  if (saved.hud === true) prefs.hud = 'hidden';
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
  var hue = prefs.hue || 0;
  if (hue) {
    if (html.getAttribute('data-hue') !== String(hue)) html.setAttribute('data-hue', String(hue));
  } else if (html.hasAttribute('data-hue')) {
    html.removeAttribute('data-hue');
  }
  applyHue(html, hue);
  // The terminal HUD (epic 0029 slice 3): dismissible, resettable through
  // this same Reset — a preference like any other, just boolean rather than
  // a choice list, the same shape hue already established.
  var range = document.getElementById('pref-hue');
  if (range && range.value !== String(hue)) range.value = String(hue);
  var out = document.getElementById('pref-hue-out');
  if (out && out.textContent !== hue + '°') out.textContent = hue + '°';
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
function setHue(value) {
  var h = Number(value);
  if (!Number.isInteger(h) || h < 0 || h > HUE_MAX) return;
  var prefs = readPrefs();
  prefs.hue = h;
  writePrefs(prefs);
  applyPrefs(prefs);
}
function resetPrefs() {
  try { localStorage.removeItem(PREFS_KEY); } catch (e) {}
  applyPrefs(prefDefaults());
}
function dismissHud() {
  setPref('hud', 'hidden');
}
applyPrefs(readPrefs());
// A theme or phosphor change swaps the base twins under a rotated hue — re-apply.
if (typeof MutationObserver === 'function') {
  new MutationObserver(function () { if (readPrefs().hue) applyHue(document.documentElement, readPrefs().hue); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-phosphor'] });
}
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var b = t.closest('[data-pref]');
  if (b) { setPref(b.getAttribute('data-pref'), b.getAttribute('data-pref-value')); return; }
  if (t.closest('#prefs-reset')) { resetPrefs(); return; }
  if (t.closest('#terminal-hud-close')) dismissHud();
});
document.addEventListener('input', function (e) {
  var t = e.target;
  if (t && t.id === 'pref-hue') setHue(t.value);
});
`.trim();
}
