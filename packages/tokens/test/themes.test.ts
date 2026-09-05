// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { THEMES, THEME_NAMES, type ThemeName } from '../src/themes.js';
import { COLOR_TOKENS, contrastRatio, type Theme } from '../src/color.js';

describe('themes', () => {
  it('ships dark, light, and terminal', () => {
    expect(THEME_NAMES).toEqual(['dark', 'light', 'terminal']);
  });

  it.each(THEME_NAMES)('%s defines every semantic color token', (name: ThemeName) => {
    const theme = THEMES[name];
    for (const token of COLOR_TOKENS) {
      expect(theme[token]).toMatch(/^oklch\(/);
    }
  });

  // WCAG: normal text needs ≥ 4.5:1; large/muted text + UI components ≥ 3:1.
  it.each(THEME_NAMES)('%s meets WCAG AA contrast on its key pairs', (name: ThemeName) => {
    const t: Theme = THEMES[name];
    expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.text, t.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(t.textMuted, t.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t.accent, t.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t.accentText, t.accent)).toBeGreaterThanOrEqual(4.5);
  });

  // Every sev* token plus needsYou and success doubles as small (--text-xs) TEXT color,
  // not just a background/border accent — .chip.sev-critical, .connect-ok/.connect-bad,
  // .task-done, .pill-needs_you, .fnode-gate, etc. all set `color:` directly from these
  // tokens, and the cockpit semantic-color pass moved every ok/shipped/accepted text use
  // (.connect-ok, .diff-add, .landing-result-ok, …) from sevLow onto success. That needs
  // normal-text contrast (4.5:1) against both surfaces they render on, not just the
  // 3:1 floor for large text/UI components — light sevHigh sat only 0.01 above 4.5:1
  // against surfaceRaised, unverified, before this test existed.
  it.each(THEME_NAMES)('%s sev*/needsYou/success meet WCAG AA as small text', (name: ThemeName) => {
    const t: Theme = THEMES[name];
    const tokens = [
      'sevCritical',
      'sevHigh',
      'sevMedium',
      'sevLow',
      'needsYou',
      'success',
    ] as const;
    for (const token of tokens) {
      expect(contrastRatio(t[token], t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t[token], t.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The flight-log verdict chips (COCKPIT 4/6) paint accentText ON a semantic fill at
  // --text-xs: .flight-shipped on success, .flight-reverted/.flight-turn-capped/
  // .flight-timed-out/.flight-errored on sevHigh, .flight-unverified/.flight-checkpointed
  // on sevMedium (.flight-summary-task and the .task-done-btn hover reuse the success
  // pair). Small text on a fill needs 4.5:1 against the FILL, not the surface — a pair
  // no other test touched; light accentText/sevHigh clears the floor by only 0.28.
  it.each(THEME_NAMES)('%s verdict-chip fills keep accentText at WCAG AA', (name: ThemeName) => {
    const t: Theme = THEMES[name];
    for (const fill of ['success', 'sevHigh', 'sevMedium'] as const) {
      expect(contrastRatio(t.accentText, t[fill])).toBeGreaterThanOrEqual(4.5);
    }
  });

  // D1 CONTRAST MATRIX (epic 0015 §6.6): the tests above pin a handful of known-used
  // pairs; `scripts/cockpit-metrics.mjs` computes the FULL cross-product (every
  // foreground token against every surface, plus accentText against every fill) and
  // commits it to `docs/COCKPIT-BASELINE.md` — that script's own header
  // says the matrix's floor is "asserted separately by the token package's contrast
  // tests", i.e. here. This test is that gate: it recomputes the same full matrix
  // directly from THEMES/contrastRatio (no dependency on the build the script needs)
  // and fails the moment a pair NOT already named below drops under the WCAG 1.4.11
  // non-text floor (3:1) — a silent regression a spot-check above would miss because
  // it only touches pairs someone already thought to pin.
  //
  // Mirrors `themeContrastCells` in scripts/cockpit-metrics.mjs exactly: every
  // COLOR_TOKENS entry except the 3 surfaces and accentText, against each surface;
  // accentText against every fill token (accentText IS the surface color in dark, so
  // pairing it against surfaces would report by-design-identical colors as failures).
  const SURFACE_TOKENS = ['surface', 'surfaceRaised', 'surfaceSunken'] as const;
  const FILL_TOKENS = [
    'accent',
    'success',
    'warning',
    'danger',
    'info',
    'sevCritical',
    'sevHigh',
    'sevMedium',
    'sevLow',
    'needsYou',
  ] as const;
  const WCAG_NON_TEXT_RATIO = 3;

  function belowNonTextFloor(t: Theme): string[] {
    const failing: string[] = [];
    for (const token of COLOR_TOKENS) {
      if ((SURFACE_TOKENS as readonly string[]).includes(token) || token === 'accentText') {
        continue;
      }
      for (const surface of SURFACE_TOKENS) {
        if (contrastRatio(t[token], t[surface]) < WCAG_NON_TEXT_RATIO) {
          failing.push(`${token} on ${surface}`);
        }
      }
    }
    for (const fill of FILL_TOKENS) {
      if (contrastRatio(t.accentText, t[fill]) < WCAG_NON_TEXT_RATIO) {
        failing.push(`accentText on ${fill}`);
      }
    }
    return failing.sort();
  }

  // Baseline measured 2026-08-28 (docs/archive/EVALUATION-2026-08-28-cockpit-baseline.md's
  // contrast matrix, now folded into docs/COCKPIT-BASELINE.md): `border`/`borderStrong`
  // are decorative dividers — never carrying
  // text, never a UI component boundary WCAG 1.4.11 requires distinguishing on their
  // own — so a sub-3:1 border is accepted as-is rather than blocking every other pair's
  // gate. Fixing a listed pair means removing it here, a conscious ratchet tightening;
  // ANY pair not listed that drops below 3:1 fails this test.
  const KNOWN_BELOW_NON_TEXT: Record<ThemeName, string[]> = {
    dark: [
      'border on surface',
      'border on surfaceRaised',
      'border on surfaceSunken',
      'borderStrong on surface',
      'borderStrong on surfaceRaised',
      'borderStrong on surfaceSunken',
    ].sort(),
    light: [
      'border on surface',
      'border on surfaceRaised',
      'border on surfaceSunken',
      'borderStrong on surface',
      'borderStrong on surfaceRaised',
      'borderStrong on surfaceSunken',
    ].sort(),
    terminal: ['border on surface', 'border on surfaceRaised', 'border on surfaceSunken'].sort(),
  };

  it.each(THEME_NAMES)(
    '%s has no new pair below the WCAG 1.4.11 non-text floor',
    (name: ThemeName) => {
      expect(belowNonTextFloor(THEMES[name])).toEqual(KNOWN_BELOW_NON_TEXT[name]);
    },
  );
});
