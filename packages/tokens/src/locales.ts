// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Locale foundation for AUTOPILOT's i18n effort (backlog C, board
 * web-msnsndki-dz3vn1) — Hebrew, the founders' language, is the first
 * addition beyond English, and Hebrew is RTL, so reading direction is a
 * first-class property of a locale here, not an afterthought bolted onto
 * English-only markup later. This module is the mechanical layer only:
 * locale identity, native display name, and direction. Per-string
 * translation of every primary surface and a full RTL layout audit are
 * follow-up slices this foundation unblocks — see the `web/features/locale.ts`
 * switcher this ships alongside for the first real, visible consumer.
 */

export const LOCALE_NAMES = ['en', 'he'] as const;
export type LocaleName = (typeof LOCALE_NAMES)[number];

/** Each locale's own name, written in its own script — never translated to
 *  whichever locale is currently active, so a reader can always find their
 *  own language in the switcher regardless of what is currently selected. */
export const LOCALE_LABELS: Readonly<Record<LocaleName, string>> = {
  en: 'English',
  he: 'עברית',
};

/** The default locale (English) — matches `renderShell()`'s server-rendered `<html lang>`. */
export const DEFAULT_LOCALE: LocaleName = 'en';

/** Locales that read right-to-left. Hebrew is the first AUTOPILOT ships. */
export const RTL_LOCALES: readonly LocaleName[] = ['he'];

/** Whether `locale` reads right-to-left. Takes a plain `string` (not
 *  `LocaleName`) so it can validate untrusted input — a saved `localStorage`
 *  value or a URL param — without the caller narrowing first. */
export function isRtlLocale(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale);
}

/** The `dir` attribute value a locale's layout should carry. */
export function localeDir(locale: string): 'rtl' | 'ltr' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}
