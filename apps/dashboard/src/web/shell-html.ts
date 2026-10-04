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
import { iconSvg } from './icons.js';

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

/** One subject-nav link: a vendored icon (`iconSvg`, epic 0025) beside a
 *  translatable label. The label sits in its own span so `translateDom`'s
 *  textContent swap never wipes the icon. */
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
    '>' +
    iconSvg(icon) +
    '<span data-i18n="' +
    key +
    '">' +
    label +
    '</span></a>\n'
  );
}

/** One GLOBAL destination (2026-09-27): the same five places on every
 *  page. On the fleet page they ARE its subjects (`subjectLink`); on a
 *  project page they lead back to the fleet page's places, so they carry
 *  `data-global-link`, never `data-subject-link` — the project's own
 *  subjects live in its tab row. */
function globalLink(
  name: string,
  href: string,
  key: string,
  label: string,
  icon: string,
  here: boolean,
): string {
  return (
    '    <a class="subject-link" href="' +
    href +
    '" data-global-link="' +
    name +
    '"' +
    (here ? ' aria-current="true"' : '') +
    '>' +
    iconSvg(icon) +
    '<span data-i18n="' +
    key +
    '">' +
    label +
    '</span></a>\n'
  );
}

/** One tab in a project's own row: a project subject, icon and label. */
function projectTab(
  name: string,
  key: string,
  label: string,
  icon: string,
  current: boolean,
): string {
  return (
    '    <a class="project-tab" href="#fleet" data-subject-link="' +
    name +
    '"' +
    (current ? ' aria-current="page"' : '') +
    '>' +
    iconSvg(icon) +
    '<span data-i18n="' +
    key +
    '">' +
    label +
    '</span></a>\n'
  );
}

/** Each place's vendored icon (epic 0025 law 1): the Lucide counterparts of
 *  the Feather-derived shapes the rail used to print by hand. */
const SUBJECT_ICON = {
  fleet: 'layout-grid',
  fly: 'send',
  keeper: 'inbox',
  community: 'users',
  board: 'square-kanban',
  plan: 'git-branch',
  docs: 'book-open',
  benchmark: 'chart-scatter',
  data: 'chart-no-axes-column',
} as const;

/**
 * The app shell's subject nav (epic 0021): the places a page has. The fleet
 * page has five (Fleet · Fly · Keeper · Community · Benchmark); a project page has six
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

/** THE BENCHMARK subject's section (2026-09-26), on the fleet page only:
 *  a bare mount the `/benchmark.js` chunk (web/benchmark-page.ts) fills once
 *  the screen is on screen. Hidden until that chunk runs. */
export function benchmarkSubjectHtml(project?: string): string {
  if (project !== undefined) return '';
  return (
    '  <section class="benchmark-panel" id="benchmark-panel" aria-label="Model benchmark" data-i18n-aria="benchmarkPanel" data-subject="benchmark" hidden>' +
    '<div class="bm-page" id="benchmark"></div></section>\n'
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
          // THE BENCHMARK (operator, 2026-09-26): every model the fleet has
          // flown, as a place in the app — web/benchmark-page.ts draws it.
          subjectLink(
            'benchmark',
            '#benchmark-panel',
            'subjectBenchmark',
            'Benchmark',
            SUBJECT_ICON.benchmark,
            false,
          ),
        ]
      : // ONE GLOBAL NAV (2026-09-27, NN/g global navigation, M3 navigation
        // rail, Primer's app header): a project page keeps the same five
        // places in the rail — Benchmark was unreachable from inside a
        // project — and moves the project's own subjects to a tab row.
        [
          globalLink('fleet', '/', 'subjectFleet', 'Fleet', SUBJECT_ICON.fleet, true),
          globalLink('fly', '/#flightbar', 'subjectFly', 'Fly', SUBJECT_ICON.fly, false),
          globalLink(
            'keeper',
            '/#pool-client-panel',
            'subjectKeeper',
            'Keeper',
            SUBJECT_ICON.keeper,
            false,
          ),
          globalLink(
            'community',
            '/#contributor-issue-list-panel',
            'subjectCommunity',
            'Community',
            SUBJECT_ICON.community,
            false,
          ),
          globalLink(
            'benchmark',
            '/?project=' + escapeAttr(encodeURIComponent(project)) + '#benchmark-panel',
            'subjectBenchmark',
            'Benchmark',
            SUBJECT_ICON.benchmark,
            false,
          ),
        ];
  const projectTabs =
    project === undefined
      ? ''
      : '  <nav class="project-tabs" id="project-tabs" aria-label="Project sections" data-i18n-aria="projectTabs">\n' +
        projectTab('fleet', 'subjectOverview', 'Overview', SUBJECT_ICON.fleet, true) +
        projectTab('board', 'subjectBoard', 'Board', SUBJECT_ICON.board, false) +
        projectTab('keeper', 'subjectKeeper', 'Keeper', SUBJECT_ICON.keeper, false) +
        projectTab('plan', 'subjectPlan', 'Plan', SUBJECT_ICON.plan, false) +
        projectTab('docs', 'subjectDocs', 'Docs', SUBJECT_ICON.docs, false) +
        projectTab('data', 'subjectData', 'Data', SUBJECT_ICON.data, false) +
        '  </nav>\n';
  // FOCUS MODE (slice 8) rides the nav as its last item — a button, not a
  // place — and its exit pill sits outside the nav so it survives the nav
  // leaving the page. Never persisted: a reload is always the way home.
  // The toggle leads with maximize and the pill with minimize (epic 0025),
  // decorative beside each one's [data-i18n] label.
  const focusToggle =
    '    <button type="button" class="subject-link subject-focus" id="focus-toggle" aria-pressed="false" data-tip="Hide the chrome, keep the work (Esc to exit)" data-i18n-tip="focusModeTip">' +
    iconSvg('maximize') +
    '<span data-i18n="focusMode">Focus</span></button>\n';
  return (
    '  <nav class="subject-nav" id="subject-nav" aria-label="Sections" data-i18n-aria="subjectNav">\n' +
    links.join('') +
    focusToggle +
    '  </nav>\n' +
    projectTabs +
    '  <button type="button" class="focus-exit" id="focus-exit" hidden>' +
    iconSvg('minimize') +
    '<span data-i18n="focusExit">Exit focus</span></button>\n' +
    '  <p class="subject-empty" id="subject-empty" role="status" data-i18n="subjectEmpty" hidden>Nothing here yet — this area fills as the fleet works.</p>'
  );
}
