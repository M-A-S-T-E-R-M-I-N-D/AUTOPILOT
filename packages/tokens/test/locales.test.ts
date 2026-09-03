// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  LOCALE_NAMES,
  LOCALE_LABELS,
  DEFAULT_LOCALE,
  RTL_LOCALES,
  isRtlLocale,
  localeDir,
} from '../src/locales.js';

describe('locales', () => {
  it('ships English and Hebrew', () => {
    expect(LOCALE_NAMES).toEqual(['en', 'he']);
  });

  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('every locale has a native display label', () => {
    for (const name of LOCALE_NAMES) {
      expect(LOCALE_LABELS[name]).toBeTruthy();
    }
  });

  it('marks Hebrew, and only Hebrew, as RTL', () => {
    expect(RTL_LOCALES).toEqual(['he']);
  });

  it.each(LOCALE_NAMES)('isRtlLocale(%s) matches RTL_LOCALES membership', (name) => {
    expect(isRtlLocale(name)).toBe((RTL_LOCALES as readonly string[]).includes(name));
  });

  it('isRtlLocale is false for an unknown or empty locale', () => {
    expect(isRtlLocale('fr')).toBe(false);
    expect(isRtlLocale('')).toBe(false);
  });

  it('localeDir returns rtl for Hebrew and ltr for English', () => {
    expect(localeDir('he')).toBe('rtl');
    expect(localeDir('en')).toBe('ltr');
  });

  it('localeDir falls back to ltr for an unknown locale', () => {
    expect(localeDir('xx')).toBe('ltr');
  });
});
