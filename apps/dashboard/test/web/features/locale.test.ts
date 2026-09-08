// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the language switcher (`web/features/locale.ts`)
 * — the i18n foundation's first real, visible consumer (board
 * web-msnsndki-dz3vn1), following the exact pattern
 * `switcher.test.ts` proved for the theme switcher.
 */

import { describe, it, expect } from 'vitest';
import { LOCALE_NAMES, RTL_LOCALES, STRINGS } from '@autopilot/tokens';
import { localeJs } from '../../../src/web/features/locale.js';

describe('localeJs', () => {
  it('embeds the real locale names as a JSON array', () => {
    expect(localeJs()).toContain(`const LOCALES = ${JSON.stringify(LOCALE_NAMES)};`);
  });

  it('embeds the real RTL locale set as a JSON array', () => {
    expect(localeJs()).toContain(`const RTL_LOCALES = ${JSON.stringify(RTL_LOCALES)};`);
  });

  it('embeds only the English string table — non-English locales ship in the deferred locale-data chunk (board ap-mtk2tgvh-0)', () => {
    expect(localeJs()).toContain(`let STRINGS = { en: ${JSON.stringify(STRINGS.en)} };`);
    expect(localeJs()).not.toContain(JSON.stringify(STRINGS.he));
  });

  it('translateDom swaps every [data-i18n] element to the given locale, falling back to English', () => {
    expect(localeJs()).toContain('function translateDom(l) {');
    expect(localeJs()).toContain('const table = STRINGS[l] || STRINGS.en;');
    expect(localeJs()).toContain("document.querySelectorAll('[data-i18n]').forEach((el) => {");
    expect(localeJs()).toContain('const text = table[el.dataset.i18n];');
    expect(localeJs()).toContain('if (text && el.textContent !== text) el.textContent = text;');
  });

  it('the [data-i18n] sweep leaves an already-current element’s text node alone — an aria-live region must not re-announce an identical repaint', () => {
    const { translateDom } = new Function(`${localeJs()}\nreturn { translateDom };`)();
    const host = document.createElement('p');
    host.setAttribute('data-i18n', 'ask');
    host.textContent = STRINGS.en.ask;
    document.body.appendChild(host);
    const node = host.firstChild;

    translateDom('en');
    expect(host.firstChild).toBe(node);

    // A real change still writes (only STRINGS.en ships in this chunk, so the
    // change is a re-tag, not a locale switch).
    host.setAttribute('data-i18n', 'search');
    translateDom('en');
    expect(host.textContent).toBe(STRINGS.en.search);
    host.remove();
  });

  it('translateDom swaps the aria-label of every [data-i18n-aria] element to the given locale', () => {
    expect(localeJs()).toContain("document.querySelectorAll('[data-i18n-aria]').forEach((el) => {");
    expect(localeJs()).toContain('const text = table[el.dataset.i18nAria];');
    expect(localeJs()).toContain("if (text) el.setAttribute('aria-label', text);");
  });

  it('translateDom swaps the placeholder of every [data-i18n-placeholder] element to the given locale', () => {
    expect(localeJs()).toContain(
      "document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {",
    );
    expect(localeJs()).toContain('const text = table[el.dataset.i18nPlaceholder];');
    expect(localeJs()).toContain("if (text) el.setAttribute('placeholder', text);");
  });

  it('translateDom swaps the data-tip of every [data-i18n-tip] element to the given locale', () => {
    expect(localeJs()).toContain("document.querySelectorAll('[data-i18n-tip]').forEach((el) => {");
    expect(localeJs()).toContain('const text = table[el.dataset.i18nTip];');
    expect(localeJs()).toContain("if (text) el.setAttribute('data-tip', text);");
  });

  it('translateDom substitutes the {name} placeholder of every [data-i18n-template] element from its own data-i18n-name', () => {
    expect(localeJs()).toContain(
      "document.querySelectorAll('[data-i18n-template]').forEach((el) => {",
    );
    expect(localeJs()).toContain('const tpl = table[el.dataset.i18nTemplate];');
    expect(localeJs()).toContain("let text = substituteName(tpl, el.dataset.i18nName || '');");
  });

  it('the [data-i18n-template] sweep only writes textContent on a real change — an aria-live region must not re-announce an identical repaint', () => {
    expect(localeJs()).toContain('const text = fillTemplate(tpl, el, table);');
    expect(localeJs()).toContain('if (el.textContent !== text) el.textContent = text;');
  });

  it('translateDom fills the data-tip of every [data-i18n-tip-template] element through the same fillTemplate as the aria twin — a hover tip wrapping a live value', () => {
    expect(localeJs()).toContain(
      "document.querySelectorAll('[data-i18n-tip-template]').forEach((el) => {",
    );
    expect(localeJs()).toContain('const tpl = table[el.dataset.i18nTipTemplate];');
    expect(localeJs()).toContain(
      "if (tpl) el.setAttribute('data-tip', fillTemplate(tpl, el, table));",
    );
  });

  it('fillTemplate fills any other {slot} from the element’s data-i18n-args JSON map — the DOM twin of tr()’s substitution map', () => {
    const { fillTemplate } = new Function(`${localeJs()}\nreturn { fillTemplate };`)();
    const el = { dataset: { i18nArgs: JSON.stringify({ step: 2, total: 5 }) } };
    expect(fillTemplate('Step {step} of {total}', el, {})).toBe('Step 2 of 5');
    // Every occurrence, and {name}/{label}/{tip} still fill from their own sources.
    const both = {
      dataset: { i18nName: 'Ada', i18n: 'flyIt', i18nArgs: JSON.stringify({ n: 3 }) },
    };
    expect(fillTemplate('{name}: {label} ×{n} ({n})', both, { flyIt: 'Go' })).toBe(
      'Ada: Go ×3 (3)',
    );
  });

  it('fillTemplate leaves the slots alone on a missing or malformed data-i18n-args, rather than taking the whole sweep down', () => {
    const { fillTemplate } = new Function(`${localeJs()}\nreturn { fillTemplate };`)();
    expect(fillTemplate('Step {step} of {total}', { dataset: {} }, {})).toBe(
      'Step {step} of {total}',
    );
    expect(fillTemplate('Step {step}', { dataset: { i18nArgs: '{not json' } }, {})).toBe(
      'Step {step}',
    );
    expect(fillTemplate('Step {step}', { dataset: { i18nArgs: 'null' } }, {})).toBe('Step {step}');
  });

  it('fillTemplate fills {label}/{tip} from the table entries for the element’s OWN data-i18n / data-i18n-tip keys, after {name}', () => {
    const { fillTemplate } = new Function(`${localeJs()}\nreturn { fillTemplate };`)();
    const el = { dataset: { i18nName: 'Ada', i18n: 'flyIt', i18nTip: 'flyGoTip' } };
    const table = { flyIt: 'Go', flyGoTip: 'Launches a flight' };
    expect(fillTemplate('{name}: {label} — {tip}', el, table)).toBe('Ada: Go — Launches a flight');
    // An element with no own keys leaves the slots alone rather than blanking them.
    expect(fillTemplate('{label}/{tip}', { dataset: {} }, table)).toBe('{label}/{tip}');
  });

  it('substituteName replaces every occurrence of {name}, not just the first — a grammar that repeats the name must not silently under-translate', () => {
    const { substituteName } = new Function(`${localeJs()}\nreturn { substituteName };`)();
    expect(substituteName('{name} told {name} about {name}', 'Ada')).toBe('Ada told Ada about Ada');
  });

  it('applies a locale by writing lang, deriving dir from the RTL set, persisting it, and delegates the text swap to translateDom', () => {
    expect(localeJs()).toContain('document.documentElement.lang = l;');
    expect(localeJs()).toContain(
      "document.documentElement.dir = RTL_LOCALES.includes(l) ? 'rtl' : 'ltr';",
    );
    expect(localeJs()).toContain("localStorage.setItem('ap-locale', l);");
    expect(localeJs()).toContain('translateDom(l);');
  });

  it('reflects the applied locale on aria-pressed for every [data-lang-btn]', () => {
    expect(localeJs()).toContain(
      "b.setAttribute('aria-pressed', String(b.dataset.langBtn === l));",
    );
  });

  it('restores a saved locale on load only if it is a known locale', () => {
    expect(localeJs()).toContain("localStorage.getItem('ap-locale');");
    expect(localeJs()).toContain(
      'if (savedLocale && LOCALES.includes(savedLocale)) applyLocale(savedLocale);',
    );
  });

  it('sweeps once even without a saved locale, filling tags set by modules composed before STRINGS existed', () => {
    expect(localeJs()).toContain("else translateDom(document.documentElement.lang || 'en');");
  });

  it('delegates clicks on [data-lang-btn] to applyLocale', () => {
    expect(localeJs()).toContain("e.target.closest('[data-lang-btn]')");
    expect(localeJs()).toContain('if (b) applyLocale(b.dataset.langBtn);');
  });

  it('tr looks up a single string key in the current document language, falling back to English', () => {
    expect(localeJs()).toContain('function tr(key, subs) {');
    expect(localeJs()).toContain("const l = document.documentElement.lang || 'en';");
    expect(localeJs()).toContain('const table = STRINGS[l] || STRINGS.en;');
    expect(localeJs()).toContain('const text = table[key] || STRINGS.en[key];');
  });

  it('tr substitutes a bare-string subs argument as the {name} placeholder shorthand, since a confirm dialog has no DOM node to carry data-i18n-name', () => {
    expect(localeJs()).toContain('if (subs == null) return text;');
    expect(localeJs()).toContain(
      "if (typeof subs === 'string') return substituteName(text, subs);",
    );
  });

  it('tr substitutes every placeholder in a substitution map, for templates needing more than one value', () => {
    expect(localeJs()).toContain('return substituteMap(text, subs);');
    const { substituteMap } = new Function(`${localeJs()}\nreturn { substituteMap };`)();
    expect(substituteMap('{a} and {b}, {a} again', { a: 1, b: 'two' })).toBe('1 and two, 1 again');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = localeJs();
    expect(out).toBe(out.trim());
  });
});
