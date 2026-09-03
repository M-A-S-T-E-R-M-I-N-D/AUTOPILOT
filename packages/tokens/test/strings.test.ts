// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { LOCALE_NAMES } from '../src/locales.js';
import { STRINGS, translate, type StringKey } from '../src/strings.js';

/** Keys whose value is deliberately identical in every locale — Latin-script
 *  mode names (like "KEEPER" and "OTLP" elsewhere in the table) that
 *  `strings.ts` documents as staying untranslated by design, and the
 *  punctuation-only `{slot}` templates (a product name beside a version, or
 *  separators between server-sent clauses) that carry no prose to translate. */
const LATIN_SCRIPT_KEYS: ReadonlySet<StringKey> = new Set<StringKey>([
  'personaGenius',
  'personaArchitect',
  'flightRowWatchdogSuffix',
  'connectCliVersion',
  'connectStatusLine',
  'connectTestStatusLine',
]);

describe('STRINGS', () => {
  it('has a table for every known locale', () => {
    for (const name of LOCALE_NAMES) {
      expect(STRINGS[name]).toBeTruthy();
    }
  });

  it('every locale defines the same key set as English', () => {
    const enKeys = Object.keys(STRINGS.en).sort();
    for (const name of LOCALE_NAMES) {
      expect(Object.keys(STRINGS[name]).sort()).toEqual(enKeys);
    }
  });

  it('no translated string is empty', () => {
    for (const name of LOCALE_NAMES) {
      for (const value of Object.values(STRINGS[name])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('non-English locales translate every key except the Latin-script mode names', () => {
    for (const name of LOCALE_NAMES) {
      if (name === 'en') continue;
      for (const [key, value] of Object.entries(STRINGS[name])) {
        if (LATIN_SCRIPT_KEYS.has(key as StringKey)) continue;
        expect(value, `${name}.${key} is identical to English — untranslated?`).not.toBe(
          STRINGS.en[key as StringKey],
        );
      }
    }
  });

  it('every locale carries exactly the {placeholder}s its English source defines', () => {
    const placeholders = (text: string): string[] => (text.match(/\{[a-z]+\}/gi) ?? []).sort();
    for (const name of LOCALE_NAMES) {
      for (const [key, value] of Object.entries(STRINGS[name])) {
        expect(placeholders(value), `${name}.${key}`).toEqual(
          placeholders(STRINGS.en[key as StringKey]),
        );
      }
    }
  });
});

describe('githubPrLabel', () => {
  it('carries a {name} placeholder in every locale, wherever that grammar puts it', () => {
    for (const name of LOCALE_NAMES) {
      expect(STRINGS[name].githubPrLabel).toContain('{name}');
    }
  });
});

describe('translate', () => {
  it('returns the requested locale entry', () => {
    expect(translate('he', 'connect')).toBe(STRINGS.he.connect);
    expect(translate('en', 'connect')).toBe(STRINGS.en.connect);
  });

  it('falls back to the default locale for an unknown locale', () => {
    expect(translate('fr', 'connect')).toBe(STRINGS.en.connect);
    expect(translate('', 'connect')).toBe(STRINGS.en.connect);
  });
});
