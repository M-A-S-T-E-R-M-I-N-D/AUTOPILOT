// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Small pure HTML-building helpers `renderShell()` calls — the theme and
 * language switcher navs' per-option `<button>` markup and generic
 * HTML-attribute escaping. None of these read or touch `document`/`window`,
 * and none are ever part of the browser-executed `/app.js` bundle
 * `clientJs()` builds (that's the separate, client-side button renderers
 * inside `features/switcher.ts`'s `switcherJs()` and `features/locale.ts`'s
 * `localeJs()`) — so, like `web/layout-css.ts`, a real `import` from
 * `web/shell-html.js` is enough; no `.toString()`/`JSON.stringify()` splice
 * treatment needed (epic 0002 "shell decomposition", slice 2 follow-on).
 */

import {
  DEFAULT_THEME,
  THEME_NAMES,
  DEFAULT_LOCALE,
  LOCALE_NAMES,
  LOCALE_LABELS,
} from '@autopilot/tokens';

/** The theme switcher nav's per-theme `<button>` markup, one per known theme.
 *  Each button explains itself on hover+focus (interactivity audit
 *  web-msm66jlc-gm4oom). D1 ATTRIBUTE PAYLOAD (epic 0015): the button's own
 *  text is its accessible name (the nav's aria-label="Theme" supplies the
 *  context), so the "Switch to the ... theme" tip rides `aria-describedby`
 *  into a visually-hidden SIBLING span instead of an aria-label restating
 *  data-tip verbatim — a child span would bleed the tip back into the
 *  button's accessible-name content computation. */
export function themeButtons(): string {
  return THEME_NAMES.map((name) => {
    const tip = `Switch to the ${name} theme`;
    const descId = `theme-desc-${name}`;
    return `<button data-theme-btn="${name}" aria-pressed="${String(name === DEFAULT_THEME)}" data-tip="${tip}" aria-describedby="${descId}">${name}</button><span class="sr-only" id="${descId}">${tip}</span>`;
  }).join('');
}

/** The language switcher nav's per-locale `<button>` markup, one per known
 *  locale (i18n foundation, board web-msnsndki-dz3vn1) — each button's label
 *  is that locale's OWN native name (`LOCALE_LABELS`), never translated to
 *  the currently active locale, so a reader can always find their own
 *  language regardless of what is currently selected. Each button explains
 *  itself on hover+focus (interactivity audit web-msm66jlc-gm4oom), mirroring
 *  `themeButtons()`: the native label is the accessible name and the tip
 *  rides `aria-describedby` into a visually-hidden sibling span (D1
 *  ATTRIBUTE PAYLOAD, epic 0015). */
export function langButtons(): string {
  return LOCALE_NAMES.map((name) => {
    const tip = `Switch the dashboard language to ${LOCALE_LABELS[name]}`;
    const descId = `lang-desc-${name}`;
    return `<button data-lang-btn="${name}" aria-pressed="${String(name === DEFAULT_LOCALE)}" data-tip="${tip}" aria-describedby="${descId}">${LOCALE_LABELS[name]}</button><span class="sr-only" id="${descId}">${tip}</span>`;
  }).join('');
}

/** Escape a value for an HTML attribute (store ids are ours, but never trust). */
export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
