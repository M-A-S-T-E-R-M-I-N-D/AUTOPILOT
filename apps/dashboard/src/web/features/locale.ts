// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The language switcher — the client-side twin of `web/shell-html.ts`'s
 * `langButtons()`, following the exact `switcher.ts`/`switcherJs()` pattern
 * (epic 0002 "shell decomposition"): a feature-module assembler `web/shell.ts`'s
 * `clientJs()` imports and calls directly, so its return value — not its
 * compiled source — is what lands in the served `/app.js` text.
 * `discoverFeatureModules('web/features')` finds this file's `localeJs`
 * export the same way it finds `switcherJs`'s.
 *
 * `translateDom()` also sweeps `[data-i18n-template]`: a `STRINGS` entry
 * that carries a `{name}` placeholder rather than fixed text (so far just
 * `githubPrLabel`, `packages/tokens/src/strings.ts`'s per-project
 * "Contribute upstream" PR form label) — the element's own `data-i18n-name`
 * attribute supplies the value substituted in, since a locale's grammar may
 * place the name somewhere other than where English's word order does.
 *
 * `tr(key, subs?)` is the client-side mirror of `@autopilot/tokens`' own
 * server-side `translate()`, for the handful of translatable strings that
 * are never DOM attributes `translateDom()` can sweep — `window.confirm()`
 * dialogs, whose text is a call argument evaluated once at click time, not
 * an element `applyLocale()` visits. It reads `document.documentElement.lang`
 * itself rather than taking a locale parameter, since its callers (`shell.ts`'s
 * click handlers) fire long after the page's initial `applyLocale()` call,
 * not during a locale-aware sweep that already has `l` in scope. `subs` is
 * `tr`'s own equivalent of `translateDom()`'s `[data-i18n-template]`/
 * `data-i18n-name` pair — a confirm dialog has no DOM node to carry a
 * `data-i18n-name` attribute, so a template key's placeholders are
 * substituted from the call site instead. Most callers only ever
 * interpolate one project/task name, so `subs` may be a bare string as
 * shorthand for `{name}` (`shell.ts`'s `tr('taskDeleteConfirm', name)`); the
 * PR-open confirm (board web-msnsndki-dz3vn1) needs both `{name}` AND a
 * user-typed `{title}` in one sentence, so `subs` may also be a substitution
 * map (`tr('githubPrConfirm', { name, title })`) — every `{key}` occurrence
 * in the template gets replaced by its matching map entry.
 *
 * Applying a locale sets BOTH `lang` (screen readers/spellcheck) and `dir`
 * (layout) on `<html>` — Hebrew (i18n foundation, board web-msnsndki-dz3vn1,
 * the founders' language) is the first RTL locale AUTOPILOT ships, so
 * direction flips as a real CSS `dir` attribute the moment a locale is
 * chosen, not a class name a later slice would have to keep in sync by hand.
 *
 * It also swaps the text of every `[data-i18n]` element, the `aria-label` of
 * every `[data-i18n-aria]` element, the `placeholder` of every
 * `[data-i18n-placeholder]` element, and the `data-tip` hover text of every
 * `[data-i18n-tip]` element (the fly bar's persistent controls, tagged by
 * `web/features/fly.ts`'s `setTip()`), to that locale's entry in
 * `@autopilot/tokens`' `STRINGS` table — the per-string translation slice
 * this foundation unblocks, starting with the masthead (`shell.ts`'s
 * `renderShell()` tags its always-visible chrome text `data-i18n="<key>"`,
 * chrome whose translatable string lives in an attribute rather than text
 * content — e.g. the Theme/Language switcher navs' labels —
 * `data-i18n-aria="<key>"`, and an `<input>`'s hint text before it's
 * focused — e.g. the searchbar's `#search-q` — `data-i18n-placeholder="<key>"`).
 * Every other surface stays English-only until a follow-up slice extends
 * `STRINGS` and tags more elements.
 *
 * That sweep is its own `translateDom()`, not inlined into `applyLocale()`,
 * because `shell.ts`'s fleet cards are client-rendered and re-rendered
 * continuously (the live fleet stream patches cards in place on every
 * tick) — a card built or patched after the page's one-time `applyLocale()`
 * call would otherwise render in English regardless of the active locale.
 * `fleetJs()`'s `renderFleet()` calls `translateDom(document.documentElement.lang)`
 * after every patch (board web-msnsndki-dz3vn1) so freshly-built card DOM
 * always lands in the current locale; `translateDom` is a plain top-level
 * `function` (hoisted, not a `const`) so `renderFleet()` can call it even
 * though `fleetJs()`'s text is concatenated BEFORE this module's in
 * `clientJs()` — hoisting makes the declaration order irrelevant, since both
 * scripts share one global scope once the browser runs them.
 *
 * Only `STRINGS.en` ships in THIS (core, render-blocking `/app.js`) script —
 * board ap-mtk2tgvh-0: every non-English table bulked up the core chunk for
 * every visitor regardless of locale, and English needs no translation table
 * at all (the server already renders English by default). `STRINGS` is a
 * `let`, not `const`, so `features/locale-data.ts` — deferred, riding
 * `/panels.js` — can widen it with the other locales once it loads;
 * `translateDom`/`tr`'s `STRINGS[l] || STRINGS.en` fallback means a saved
 * non-English locale simply reads English until that deferred script
 * executes (by the first fleet tick per the established defer contract), the
 * same graceful-degradation shape `renderFleet`'s `typeof`-guarded deferred
 * calls already use elsewhere in this split.
 */
import { LOCALE_NAMES, RTL_LOCALES, STRINGS } from '@autopilot/tokens';

/** The language switcher — vanilla, external (keeps CSP script-src 'self'). */
export function localeJs(): string {
  const names = JSON.stringify(LOCALE_NAMES);
  const rtlNames = JSON.stringify(RTL_LOCALES);
  const stringsEn = JSON.stringify(STRINGS.en);
  return `
const LOCALES = ${names};
const RTL_LOCALES = ${rtlNames};
let STRINGS = { en: ${stringsEn} };
function substituteName(tpl, name) {
  return tpl.replaceAll('{name}', name);
}
function translateDom(l) {
  const table = STRINGS[l] || STRINGS.en;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const text = table[el.dataset.i18n];
    if (text) el.textContent = text;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const text = table[el.dataset.i18nAria];
    if (text) el.setAttribute('aria-label', text);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const text = table[el.dataset.i18nPlaceholder];
    if (text) el.setAttribute('placeholder', text);
  });
  document.querySelectorAll('[data-i18n-tip]').forEach((el) => {
    const text = table[el.dataset.i18nTip];
    if (text) el.setAttribute('data-tip', text);
  });
  document.querySelectorAll('[data-i18n-template]').forEach((el) => {
    const tpl = table[el.dataset.i18nTemplate];
    if (tpl) el.textContent = substituteName(tpl, el.dataset.i18nName || '');
  });
}
function tr(key, subs) {
  const l = document.documentElement.lang || 'en';
  const table = STRINGS[l] || STRINGS.en;
  const text = table[key] || STRINGS.en[key];
  if (subs == null) return text;
  if (typeof subs === 'string') return substituteName(text, subs);
  return Object.keys(subs).reduce((t, k) => t.split('{' + k + '}').join(String(subs[k])), text);
}
function applyLocale(l) {
  document.documentElement.lang = l;
  document.documentElement.dir = RTL_LOCALES.includes(l) ? 'rtl' : 'ltr';
  try { localStorage.setItem('ap-locale', l); } catch {}
  document.querySelectorAll('[data-lang-btn]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.langBtn === l));
  });
  translateDom(l);
}
let savedLocale = null;
try { savedLocale = localStorage.getItem('ap-locale'); } catch {}
if (savedLocale && LOCALES.includes(savedLocale)) applyLocale(savedLocale);
else translateDom(document.documentElement.lang || 'en');
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-lang-btn]');
  if (b) applyLocale(b.dataset.langBtn);
});
`.trim();
}
