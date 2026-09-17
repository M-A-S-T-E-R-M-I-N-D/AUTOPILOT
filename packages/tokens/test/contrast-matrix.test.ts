// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { THEMES, THEME_NAMES, type ThemeName } from '../src/themes.js';
import { contrastMatrix, classifyContrast } from '../src/color.js';

/**
 * D1 CONTRAST MATRIX (epic 0015 §6.6, board web-mtd1wmrg-9w5bk7): `.flight-slice-chip`'s
 * accentText-on-plain-surface defect (fixed 2026-08-28, "the first row of the coming
 * contrast matrix") slipped through because no test enumerated the FULL fg×bg token space —
 * `themes.test.ts` only asserts a hand-picked "key pairs" subset. This is the gate: every
 * pair below FAILING_PAIRS[theme] is today's measured reality (`contrastMatrix()` over all
 * 153 unordered token combinations, most of which are never rendered together by design —
 * e.g. sevCritical text is never painted on a sevHigh fill), recorded per the epic's own
 * ratcheting rule ("ratchets start at today's measured value, never the ideal"). The test
 * does not demand these fail-forever; it demands nothing NEW joins the list — a theme edit
 * that drops a previously-passing pair below 3:1 (the regression class this gate exists to
 * catch) fails here instead of shipping unnoticed like the chip did.
 */

const DARK_FAILING = [
  'accent:danger',
  'accent:info',
  'accent:needsYou',
  'accent:sevCritical',
  'accent:sevHigh',
  'accent:sevLow',
  'accent:sevMedium',
  'accent:success',
  'accent:warning',
  'border:accentText',
  'border:borderStrong',
  'borderStrong:accentText',
  'borderStrong:danger',
  'borderStrong:needsYou',
  'borderStrong:sevCritical',
  'danger:info',
  'danger:needsYou',
  'danger:sevCritical',
  'danger:sevHigh',
  'danger:sevLow',
  'danger:sevMedium',
  'info:needsYou',
  'info:sevCritical',
  'info:sevHigh',
  'info:sevLow',
  'info:sevMedium',
  'sevCritical:needsYou',
  'sevCritical:sevHigh',
  'sevCritical:sevLow',
  'sevCritical:sevMedium',
  'sevHigh:needsYou',
  'sevHigh:sevLow',
  'sevHigh:sevMedium',
  'sevLow:needsYou',
  'sevMedium:needsYou',
  'sevMedium:sevLow',
  'success:danger',
  'success:info',
  'success:needsYou',
  'success:sevCritical',
  'success:sevHigh',
  'success:sevLow',
  'success:sevMedium',
  'success:warning',
  'surface:accentText',
  'surface:border',
  'surface:borderStrong',
  'surface:surfaceRaised',
  'surface:surfaceSunken',
  'surfaceRaised:accentText',
  'surfaceRaised:border',
  'surfaceRaised:borderStrong',
  'surfaceRaised:surfaceSunken',
  'surfaceSunken:accentText',
  'surfaceSunken:border',
  'surfaceSunken:borderStrong',
  'text:accent',
  'text:danger',
  'text:info',
  'text:needsYou',
  'text:sevHigh',
  'text:sevLow',
  'text:sevMedium',
  'text:success',
  'text:textMuted',
  'text:warning',
  'textMuted:accent',
  'textMuted:danger',
  'textMuted:info',
  'textMuted:needsYou',
  'textMuted:sevCritical',
  'textMuted:sevHigh',
  'textMuted:sevLow',
  'textMuted:sevMedium',
  'textMuted:success',
  'textMuted:warning',
  'warning:danger',
  'warning:info',
  'warning:needsYou',
  'warning:sevCritical',
  'warning:sevHigh',
  'warning:sevLow',
  'warning:sevMedium',
];

const LIGHT_FAILING = [
  'accent:danger',
  'accent:info',
  'accent:needsYou',
  'accent:sevCritical',
  'accent:sevHigh',
  'accent:sevLow',
  'accent:sevMedium',
  'accent:success',
  'accent:warning',
  'border:accentText',
  'border:borderStrong',
  'borderStrong:accent',
  'borderStrong:accentText',
  'borderStrong:danger',
  'borderStrong:info',
  'borderStrong:needsYou',
  'borderStrong:sevCritical',
  'borderStrong:sevHigh',
  'borderStrong:sevLow',
  'borderStrong:sevMedium',
  'borderStrong:success',
  'borderStrong:warning',
  'danger:info',
  'danger:needsYou',
  'danger:sevCritical',
  'danger:sevHigh',
  'danger:sevLow',
  'danger:sevMedium',
  'info:needsYou',
  'info:sevCritical',
  'info:sevHigh',
  'info:sevLow',
  'info:sevMedium',
  'sevCritical:needsYou',
  'sevCritical:sevHigh',
  'sevCritical:sevLow',
  'sevCritical:sevMedium',
  'sevHigh:needsYou',
  'sevHigh:sevLow',
  'sevHigh:sevMedium',
  'sevLow:needsYou',
  'sevMedium:needsYou',
  'sevMedium:sevLow',
  'success:danger',
  'success:info',
  'success:needsYou',
  'success:sevCritical',
  'success:sevHigh',
  'success:sevLow',
  'success:sevMedium',
  'success:warning',
  'surface:accentText',
  'surface:border',
  'surface:borderStrong',
  'surface:surfaceRaised',
  'surface:surfaceSunken',
  'surfaceRaised:accentText',
  'surfaceRaised:border',
  'surfaceRaised:borderStrong',
  'surfaceRaised:surfaceSunken',
  'surfaceSunken:accentText',
  'surfaceSunken:border',
  'surfaceSunken:borderStrong',
  'text:danger',
  'text:needsYou',
  'text:sevCritical',
  'text:textMuted',
  'textMuted:accent',
  'textMuted:danger',
  'textMuted:info',
  'textMuted:needsYou',
  'textMuted:sevCritical',
  'textMuted:sevHigh',
  'textMuted:sevLow',
  'textMuted:sevMedium',
  'textMuted:success',
  'textMuted:warning',
  'warning:danger',
  'warning:info',
  'warning:needsYou',
  'warning:sevCritical',
  'warning:sevHigh',
  'warning:sevLow',
  'warning:sevMedium',
];

const TERMINAL_FAILING = [
  'accent:danger',
  'accent:info',
  'accent:needsYou',
  'accent:sevCritical',
  'accent:sevHigh',
  'accent:sevLow',
  'accent:sevMedium',
  'accent:success',
  'accent:warning',
  'border:accentText',
  'border:borderStrong',
  'borderStrong:danger',
  'borderStrong:sevCritical',
  'danger:info',
  'danger:needsYou',
  'danger:sevCritical',
  'danger:sevHigh',
  'danger:sevLow',
  'danger:sevMedium',
  'info:needsYou',
  'info:sevCritical',
  'info:sevHigh',
  'info:sevLow',
  'info:sevMedium',
  'sevCritical:needsYou',
  'sevCritical:sevHigh',
  'sevCritical:sevLow',
  'sevCritical:sevMedium',
  'sevHigh:needsYou',
  'sevHigh:sevLow',
  'sevHigh:sevMedium',
  'sevLow:needsYou',
  'sevMedium:needsYou',
  'sevMedium:sevLow',
  'success:danger',
  'success:info',
  'success:needsYou',
  'success:sevCritical',
  'success:sevHigh',
  'success:sevLow',
  'success:sevMedium',
  'success:warning',
  'surface:accentText',
  'surface:border',
  'surface:surfaceRaised',
  'surface:surfaceSunken',
  'surfaceRaised:accentText',
  'surfaceRaised:border',
  'surfaceRaised:surfaceSunken',
  'surfaceSunken:accentText',
  'surfaceSunken:border',
  'text:accent',
  'text:danger',
  'text:info',
  'text:needsYou',
  'text:sevCritical',
  'text:sevHigh',
  'text:sevLow',
  'text:sevMedium',
  'text:success',
  'text:textMuted',
  'text:warning',
  'textMuted:accent',
  'textMuted:borderStrong',
  'textMuted:danger',
  'textMuted:info',
  'textMuted:needsYou',
  'textMuted:sevCritical',
  'textMuted:sevHigh',
  'textMuted:sevLow',
  'textMuted:sevMedium',
  'textMuted:success',
  'textMuted:warning',
  'warning:danger',
  'warning:info',
  'warning:needsYou',
  'warning:sevCritical',
  'warning:sevHigh',
  'warning:sevLow',
  'warning:sevMedium',
];

const BASELINE_FAILING: Record<ThemeName, readonly string[]> = {
  dark: DARK_FAILING,
  light: LIGHT_FAILING,
  terminal: TERMINAL_FAILING,
};

describe('contrast matrix', () => {
  it.each(THEME_NAMES)(
    '%s: every token pair is classified (text/large/fail)',
    (name: ThemeName) => {
      const pairs = contrastMatrix(THEMES[name]);
      // 18 tokens, C(18,2) unordered pairs.
      expect(pairs).toHaveLength(153);
      for (const pair of pairs) {
        expect(['text', 'large', 'fail']).toContain(pair.level);
        expect(pair.ratio).toBeGreaterThanOrEqual(1);
        expect(pair.ratio).toBeLessThanOrEqual(21);
      }
    },
  );

  it.each(THEME_NAMES)(
    "%s: no pair fails below 3:1 beyond today's recorded baseline",
    (name: ThemeName) => {
      const failing = contrastMatrix(THEMES[name])
        .filter((pair) => pair.level === 'fail')
        .map((pair) => `${pair.a}:${pair.b}`);
      const baseline = new Set(BASELINE_FAILING[name]);
      const newFailures = failing.filter((key) => !baseline.has(key));
      expect(newFailures).toEqual([]);
    },
  );

  // The regression this whole gate exists for: `.flight-slice-chip` painted accentText
  // (designed for text ON an accent fill) directly on the ambient surface — dark-on-dark,
  // invisible. surface:accentText stays a known baseline failure (the pairing is simply
  // wrong, not something a theme edit should ever fix by coincidence) so the CSS-level fix
  // was to stop pairing them, not to change either token's color.
  it('surface:accentText is the confirmed double-duty defect pair, in every theme', () => {
    for (const name of THEME_NAMES) {
      const pair = contrastMatrix(THEMES[name]).find(
        (p) => p.a === 'surface' && p.b === 'accentText',
      );
      expect(pair?.level).toBe('fail');
    }
  });

  // Nothing asserted that a pair can be classified 'text' at all — only that
  // every level is one of the three, and that one specific pair is 'fail'. So
  // a classifier that never returned 'text' passed the whole suite, which is
  // the failure mode this matrix exists to prevent: it would silently demote
  // every AA-passing pair to 'large'.
  it('classifies a genuinely high-contrast pair as text-passing', () => {
    for (const name of THEME_NAMES) {
      const pair = contrastMatrix(THEMES[name]).find((p) => p.a === 'surface' && p.b === 'text');
      expect(pair?.ratio).toBeGreaterThanOrEqual(4.5);
      expect(pair?.level).toBe('text');
    }
  });
});

// Both WCAG AA floors are INCLUSIVE, and no real theme lands on either number
// exactly — so these boundaries are unreachable through contrastMatrix and
// were therefore untested, not unimportant. An off-by-one here reclassifies a
// legitimately passing pair as failing (or the reverse), which is exactly the
// kind of error a contrast ledger must not make.
describe('classifyContrast boundaries', () => {
  it('treats 4.5:1 as text-passing (SC 1.4.3 is >= 4.5, not > 4.5)', () => {
    expect(classifyContrast(4.5)).toBe('text');
    expect(classifyContrast(4.499)).toBe('large');
  });

  it('treats 3:1 as large-passing (SC 1.4.11 is >= 3, not > 3)', () => {
    expect(classifyContrast(3)).toBe('large');
    expect(classifyContrast(2.999)).toBe('fail');
  });

  it('classifies the extremes', () => {
    expect(classifyContrast(21)).toBe('text');
    expect(classifyContrast(1)).toBe('fail');
  });
});
