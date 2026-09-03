// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * APG tabs pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) markup and client wiring —
 * epic 0015 D2.13 "tabbed IA" (board web-mtdc6wuk-0exzb4): the project page's four-tab rewrite
 * (Process/Evaluations/Releases/Runtime, URL-addressable, replacing the long scroll) is a
 * multi-slice epic on D4's scale (the pipeline lens took 11 commits — see the operator's
 * 2026-08-28 directive in docs/epics/0015-cockpit-supervisory-control.md). Slices so far: the
 * reusable, pure, server-renderable tablist/tabpanel markup, the pure roving-focus model, and
 * (this slice) the click/keyboard client wiring ({@link tabsJs}) that ties them together —
 * mirroring the order D4 itself took, where `renderPipelinePanel`/`resolveSelection` (pure, unit-
 * and axe-tested) landed before the click/keyboard client wiring did. `clientJs()` in
 * `web/shell.ts` doesn't splice {@link tabsJs} in yet — zero bundle bytes, zero page change;
 * doing that, calling `renderProjectPage` with real tab content, and making the active tab
 * URL-addressable (`tab-route.ts` already has the pure hash logic ready) are later slices.
 *
 * Automatic activation model (moving focus also selects the panel) — matches this dashboard's
 * existing switch-group idioms (`features/pipeline.ts`'s lens/mode/layout switches), which apply
 * their change immediately rather than requiring a separate activation keypress.
 */

import { escapeAttr } from './shell-html.js';

/** One tab's identity and label — the caller owns what each tab's panel renders. */
export interface TabDef {
  readonly id: string;
  readonly label: string;
}

/** `TabDef.id` → the tab button's element id. */
export function tabId(id: string): string {
  return 'tab-' + id;
}

/** `TabDef.id` → its panel's element id — what the tab's `aria-controls` points at. */
export function tabPanelId(id: string): string {
  return 'tab-panel-' + id;
}

/**
 * Renders an APG tablist: `role="tablist"` of `role="tab"` buttons, one per `tabs` entry, roving
 * tabindex seeded to `activeId` (only that tab starts a real Tab stop) and `aria-selected`
 * reflecting it. The caller renders each tab's own `role="tabpanel"` — see {@link renderTabPanel}
 * — using {@link tabId}/{@link tabPanelId} for matching ids.
 */
export function renderTabList(tabs: readonly TabDef[], activeId: string, label: string): string {
  const buttons = tabs
    .map((tab) => {
      const selected = tab.id === activeId;
      return (
        `<button type="button" role="tab" id="${escapeAttr(tabId(tab.id))}" ` +
        `aria-controls="${escapeAttr(tabPanelId(tab.id))}" aria-selected="${selected}" ` +
        `tabindex="${selected ? '0' : '-1'}">${escapeAttr(tab.label)}</button>`
      );
    })
    .join('');
  return (
    `<div class="tablist" role="tablist" aria-label="${escapeAttr(label)}">` + buttons + `</div>`
  );
}

/**
 * Wraps `contentHtml` in `tab`'s `role="tabpanel"` — visible only when `tab.id === activeId`
 * (every other tab's panel carries the `hidden` attribute), labelled by its matching tab via
 * `aria-labelledby`. `tabindex="0"` lets a keyboard user Tab straight into the panel even when
 * its content has no focusable child of its own (APG's tabpanel recommendation).
 */
export function renderTabPanel(tab: TabDef, activeId: string, contentHtml: string): string {
  const hiddenAttr = tab.id === activeId ? '' : ' hidden';
  return (
    `<div class="tabpanel" role="tabpanel" id="${escapeAttr(tabPanelId(tab.id))}" ` +
    `aria-labelledby="${escapeAttr(tabId(tab.id))}" tabindex="0"${hiddenAttr}>${contentHtml}</div>`
  );
}

const ROVING_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End'] as const;

/** A key {@link nextTabId} understands — the APG tabs pattern's roving-focus key set. */
export type TabRovingKey = (typeof ROVING_KEYS)[number];

/** Whether `key` is one {@link nextTabId} understands. */
export function isTabRovingKey(key: string): key is TabRovingKey {
  return (ROVING_KEYS as readonly string[]).includes(key);
}

/**
 * Pure roving-focus model (Left/Right/Home/End, clamped not wrapped — the same clamping
 * `wireRoving`/the pipeline panel's `nextSelection` already use) — no DOM. A `currentId` not
 * present in `tabs` (including an empty `tabs`) returns itself unchanged rather than throwing,
 * the same "stale selection resolves to a no-op" contract `resolveSelection` holds for the
 * pipeline panel.
 */
export function nextTabId(tabs: readonly TabDef[], currentId: string, key: TabRovingKey): string {
  const idx = tabs.findIndex((tab) => tab.id === currentId);
  if (idx < 0) return currentId;
  if (key === 'Home') return tabs[0]!.id;
  if (key === 'End') return tabs[tabs.length - 1]!.id;
  if (key === 'ArrowLeft') return tabs[Math.max(0, idx - 1)]!.id;
  return tabs[Math.min(tabs.length - 1, idx + 1)]!.id;
}

/**
 * Click and keyboard wiring for an already-rendered tablist/tabpanel group — text, not a
 * callable function: this dashboard's client script is served as one same-origin `/app.js` file
 * (CSP `script-src 'self'`, no bundler) assembled by splicing real function source
 * (`.toString()`) and hand-written snippets like this one into `web/shell.ts`'s `clientJs()`
 * (see that file's `wireRoving`/`switcherJs`-style helpers). A real DOM-typed function can't
 * live in this package's compiled `src/` — the production build's `tsconfig.json` has no `DOM`
 * lib (only the `.typecheck.json` variant used for tests adds it) — so, like every other
 * interactive snippet here, this one is untyped JS text, delegated on `document` so it survives
 * `renderProjectPage`'s wholesale re-renders. Still unspliced: nothing in `clientJs()` embeds
 * this yet (see the module header) — exercised directly via `new Function(tabsJs())()` against a
 * mounted fragment, the same harness `clientJs()` itself gets tested with elsewhere.
 *
 * Selecting a tab — by click, or by Left/Right/Home/End ({@link nextTabId}'s automatic-
 * activation model: moving the roving Tab stop also selects the panel, per the module header) —
 * updates `aria-selected`/`tabindex` on every tab button and `hidden` on its matching panel
 * (found via the clicked/moved tab's `aria-controls`, so this needs no reference to `tabs`).
 */
export function tabsJs(): string {
  return `
function apgActivateTab(tab) {
  var tablist = tab.closest('[role="tablist"]');
  if (!tablist) return;
  var tabs = tablist.querySelectorAll('[role="tab"]');
  for (var i = 0; i < tabs.length; i++) {
    var candidate = tabs[i];
    var selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.setAttribute('tabindex', selected ? '0' : '-1');
    var panel = document.getElementById(candidate.getAttribute('aria-controls'));
    if (!panel) continue;
    if (selected) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
  }
}
document.addEventListener('click', function (e) {
  var tab = e.target.closest && e.target.closest('[role="tab"]');
  if (!tab || tab.getAttribute('aria-selected') === 'true') return;
  apgActivateTab(tab);
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
  var tab = e.target.closest && e.target.closest('[role="tab"]');
  if (!tab) return;
  var tablist = tab.closest('[role="tablist"]');
  if (!tablist) return;
  var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
  var idx = tabs.indexOf(tab);
  if (idx < 0) return;
  var next = idx;
  if (e.key === 'ArrowLeft') next = Math.max(0, idx - 1);
  else if (e.key === 'ArrowRight') next = Math.min(tabs.length - 1, idx + 1);
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = tabs.length - 1;
  if (next === idx) return;
  e.preventDefault();
  apgActivateTab(tabs[next]);
  tabs[next].focus();
});
`.trim();
}
