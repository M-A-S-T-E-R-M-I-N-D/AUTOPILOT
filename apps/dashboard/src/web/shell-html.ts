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
    // i18n (2026-09-12): the label and the tip were the raw theme id and an
    // English sentence in every locale — "dark / light / terminal" inside a
    // Hebrew masthead. Both now ride the DOM sweep: `themeDark`, `themeTipDark`…
    const key = name.charAt(0).toUpperCase() + name.slice(1);
    return `<button data-theme-btn="${name}" aria-pressed="${String(name === DEFAULT_THEME)}" data-tip="${tip}" data-i18n="theme${key}" data-i18n-tip="themeTip${key}" aria-describedby="${descId}">${name}</button><span class="sr-only" id="${descId}" data-i18n="themeTip${key}">${tip}</span>`;
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

/** One subject-nav link: an inline icon (24-unit stroke paths, Feather-
 *  derived, MIT) beside a translatable label. The label sits in its own
 *  span so `translateDom`'s textContent swap never wipes the icon. */
function subjectLink(
  name: string,
  href: string,
  key: string,
  label: string,
  icon: string,
  current: boolean,
): string {
  return (
    '    <a class="subject-link" href="' +
    href +
    '" data-subject-link="' +
    name +
    '"' +
    (current ? ' aria-current="page"' : '') +
    '><svg viewBox="0 0 24 24" aria-hidden="true">' +
    icon +
    '</svg><span data-i18n="' +
    key +
    '">' +
    label +
    '</span></a>\n'
  );
}

const SUBJECT_ICON = {
  fleet:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  fly: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
  keeper:
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  community:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  board:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
  plan: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  docs: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  data: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
} as const;

/**
 * The app shell's subject nav (epic 0021): the places a page has. The fleet
 * page has four (Fleet · Fly · Keeper · Community); a project page has six
 * (Overview · Board · Keeper · Plan · Docs · Data — 0018's tabs, one at a
 * time at every width). The first link is current on first paint; the
 * deferred `subject-nav` module takes it from there. Every href is a real
 * anchor so the bar navigates without the module too.
 */
/** CONTEXT RAIL (epic 0021 slice 6): the supporting pane's aside, on the
 *  fleet page only — a project page is tabs. Rendered hidden and empty; the
 *  shell client fills it from xl and empties it below. The empty line is
 *  what the rail says when nothing flies and nothing waits. */
export function contextRailHtml(project?: string): string {
  if (project !== undefined) return '';
  return (
    '  <aside class="context-rail" id="context-rail" aria-label="Context: lanes in flight and the Keeper queue" data-i18n-aria="contextRail" hidden>' +
    '<p class="context-rail-empty" data-i18n="contextRailEmpty" hidden>Nothing in flight and nothing waiting on you.</p>' +
    '</aside>\n'
  );
}

export function subjectNavHtml(project?: string): string {
  const links =
    project === undefined
      ? [
          subjectLink('fleet', '#totals', 'subjectFleet', 'Fleet', SUBJECT_ICON.fleet, true),
          subjectLink('fly', '#flightbar', 'subjectFly', 'Fly', SUBJECT_ICON.fly, false),
          subjectLink(
            'keeper',
            '#pool-client-panel',
            'subjectKeeper',
            'Keeper',
            SUBJECT_ICON.keeper,
            false,
          ),
          subjectLink(
            'community',
            '#contributor-issue-list-panel',
            'subjectCommunity',
            'Community',
            SUBJECT_ICON.community,
            false,
          ),
        ]
      : [
          subjectLink('fleet', '#fleet', 'subjectOverview', 'Overview', SUBJECT_ICON.fleet, true),
          subjectLink('board', '#fleet', 'subjectBoard', 'Board', SUBJECT_ICON.board, false),
          subjectLink('keeper', '#fleet', 'subjectKeeper', 'Keeper', SUBJECT_ICON.keeper, false),
          subjectLink('plan', '#fleet', 'subjectPlan', 'Plan', SUBJECT_ICON.plan, false),
          subjectLink('docs', '#fleet', 'subjectDocs', 'Docs', SUBJECT_ICON.docs, false),
          subjectLink('data', '#fleet', 'subjectData', 'Data', SUBJECT_ICON.data, false),
        ];
  // FOCUS MODE (slice 8) rides the nav as its last item — a button, not a
  // place — and its exit pill sits outside the nav so it survives the nav
  // leaving the page. Never persisted: a reload is always the way home.
  const focusToggle =
    '    <button type="button" class="subject-link subject-focus" id="focus-toggle" aria-pressed="false" data-tip="Hide the chrome, keep the work (Esc to exit)" data-i18n-tip="focusModeTip"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><span data-i18n="focusMode">Focus</span></button>\n';
  return (
    '  <nav class="subject-nav" id="subject-nav" aria-label="Sections" data-i18n-aria="subjectNav">\n' +
    links.join('') +
    focusToggle +
    '  </nav>\n' +
    '  <button type="button" class="focus-exit" id="focus-exit" hidden><span data-i18n="focusExit">Exit focus</span></button>\n' +
    '  <p class="subject-empty" id="subject-empty" role="status" data-i18n="subjectEmpty" hidden>Nothing here yet — this area fills as the fleet works.</p>'
  );
}
