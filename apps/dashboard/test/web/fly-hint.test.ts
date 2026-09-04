// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the fly bar's live HINT sentence math
 * (`web/fly-hint.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2, twenty-fourth cut. This had no test coverage at all beforehand —
 * not even an indirect DOM-render one — closing a genuine test gap, not
 * just an inline-to-module move. `tr` is now injected (board
 * web-msnsndki-dz3vn1), so these exercise the real STRINGS wording in both
 * English and Hebrew, not just English literals.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { flyHintText, type FlyHintTranslator } from '../../src/web/fly-hint.js';

/** The bundle's `tr()` map-form substitution (web/features/locale.ts) over
 *  one locale's table, mirrored so the direct calls below read the same
 *  STRINGS wording the served bundle does (board web-msnsndki-dz3vn1). */
function translatorFor(locale: 'en' | 'he'): FlyHintTranslator {
  return (key, subs) =>
    Object.keys(subs ?? {}).reduce(
      (t, k) => t.split('{' + k + '}').join(String(subs?.[k])),
      STRINGS[locale][key],
    );
}
const enTr = translatorFor('en');
const heTr = translatorFor('he');

describe('flyHintText', () => {
  it('renders the firing-count mode sentence with a rounded total ceiling', () => {
    const text = flyHintText(false, 2.5, 0, 3, null, enTr);

    expect(text).toBe(
      '3 firing(s) × $2.5 each — spends up to $7.5 total · each firing: up to $2.5.',
    );
  });

  it('appends the turn cap clause when the server has reported one', () => {
    const text = flyHintText(false, 2, 0, 3, 40, enTr);

    expect(text).toBe(
      '3 firing(s) × $2 each — spends up to $6 total · each firing: up to $2 and 40 turns.',
    );
  });

  it('renders the total-budget mode sentence with the funded-firings estimate', () => {
    const text = flyHintText(true, 2, 10, 1, null, enTr);

    // 10 remaining / 2 per firing = up to 5 more firings
    expect(text).toBe(
      'Keeps firing while the remaining $10 can fund another $2 firing — ≈ up to 5 firing(s) · each firing: up to $2.',
    );
  });

  it('clamps the total-budget estimate to at least 1 firing once any budget remains', () => {
    const text = flyHintText(true, 5, 1, 1, null, enTr);

    // 1 remaining / 5 per firing rounds down to 0, but Math.max(1, ...) floors it at 1
    expect(text).toBe(
      'Keeps firing while the remaining $1 can fund another $5 firing — ≈ up to 1 firing(s) · each firing: up to $5.',
    );
  });

  it('estimates 0 firings — not 1 — when no total budget remains at all', () => {
    const text = flyHintText(true, 5, 0, 1, null, enTr);

    // totalUsd=0: no budget remains, so the "at least 1" clamp must not
    // apply here — unlike the totalUsd=1 case above where some (rounds-down
    // to <1) budget still remains.
    expect(text).toBe(
      'Keeps firing while the remaining $0 can fund another $5 firing — ≈ up to 0 firing(s) · each firing: up to $5.',
    );
  });

  it('estimates 0 firings when the per-firing budget is 0', () => {
    const text = flyHintText(true, 0, 10, 1, null, enTr);

    expect(text).toBe(
      'Keeps firing while the remaining $10 can fund another $0 firing — ≈ up to 0 firing(s) · each firing: up to $0.',
    );
  });

  it('rounds the firing-count ceiling to cents', () => {
    const text = flyHintText(false, 0.1, 0, 3, null, enTr);

    // 3 * 0.1 = 0.30000000000000004 in raw float math — must round to 0.3
    expect(text).toBe(
      '3 firing(s) × $0.1 each — spends up to $0.3 total · each firing: up to $0.1.',
    );
  });

  it('renders the Hebrew table for both sentence shapes and the turn-cap clause', () => {
    expect(flyHintText(false, 2, 0, 3, 40, heTr)).toBe(
      '3 הפעלות × $2 כל אחת — מוציא עד $6 בסך הכול · כל הפעלה: עד $2 ו-40 תורות.',
    );
    expect(flyHintText(true, 2, 10, 1, null, heTr)).toBe(
      'ממשיך לירות כל עוד הנותר $10 יכול לממן הפעלה נוספת של $2 — עד כ-5 הפעלות · כל הפעלה: עד $2.',
    );
  });
});
