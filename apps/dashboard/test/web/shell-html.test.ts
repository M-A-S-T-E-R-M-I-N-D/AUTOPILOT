// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for `web/shell-html.ts`'s pure HTML-building helpers
 * (`themeButtons`/`escapeAttr`) — extracted under epic 0002 "shell
 * decomposition", slice 2 follow-on. `routes.test.ts` already regression-
 * tests `themeButtons()`'s output indirectly through `renderShell()`'s full
 * HTML document; `escapeAttr` had no coverage at all before this, direct or
 * indirect — a genuine test gap, the same shape closed by earlier cuts in
 * this epic.
 */

import { describe, it, expect } from 'vitest';
import {
  THEME_NAMES,
  DEFAULT_THEME,
  LOCALE_NAMES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
} from '@autopilot/tokens';
import { themeButtons, langButtons, escapeAttr } from '../../src/web/shell-html.js';

describe('themeButtons', () => {
  it('renders one button per known theme, each carrying its own name', () => {
    for (const name of THEME_NAMES) {
      expect(themeButtons()).toContain(`data-theme-btn="${name}"`);
    }
  });

  it('marks only the default theme as pressed', () => {
    const html = themeButtons();
    expect(html).toContain(`data-theme-btn="${DEFAULT_THEME}" aria-pressed="true"`);
    for (const name of THEME_NAMES) {
      if (name === DEFAULT_THEME) continue;
      expect(html).toContain(`data-theme-btn="${name}" aria-pressed="false"`);
    }
  });

  it('explains each button on hover+focus without duplicating the tip into aria-label (D1 ATTRIBUTE PAYLOAD)', () => {
    const html = themeButtons();
    for (const name of THEME_NAMES) {
      const tip = `Switch to the ${name} theme`;
      expect(html).toContain(`data-tip="${tip}"`);
      expect(html).not.toContain(`aria-label="${tip}"`);
      expect(html).toContain(`aria-describedby="theme-desc-${name}"`);
      expect(html).toContain(`<span class="sr-only" id="theme-desc-${name}">${tip}</span>`);
    }
  });
});

describe('langButtons', () => {
  it('renders one button per known locale, each carrying its own native label', () => {
    for (const name of LOCALE_NAMES) {
      expect(langButtons()).toContain(`data-lang-btn="${name}"`);
      expect(langButtons()).toContain(`>${LOCALE_LABELS[name]}<`);
    }
  });

  it('marks only the default locale as pressed', () => {
    const html = langButtons();
    expect(html).toContain(`data-lang-btn="${DEFAULT_LOCALE}" aria-pressed="true"`);
    for (const name of LOCALE_NAMES) {
      if (name === DEFAULT_LOCALE) continue;
      expect(html).toContain(`data-lang-btn="${name}" aria-pressed="false"`);
    }
  });

  it('explains each button on hover+focus without duplicating the tip into aria-label (D1 ATTRIBUTE PAYLOAD)', () => {
    const html = langButtons();
    for (const name of LOCALE_NAMES) {
      const tip = `Switch the dashboard language to ${LOCALE_LABELS[name]}`;
      expect(html).toContain(`data-tip="${tip}"`);
      expect(html).not.toContain(`aria-label="${tip}"`);
      expect(html).toContain(`aria-describedby="lang-desc-${name}"`);
      expect(html).toContain(`<span class="sr-only" id="lang-desc-${name}">${tip}</span>`);
    }
  });
});

describe('escapeAttr', () => {
  it('escapes &, ", <, and > for safe use inside an HTML attribute', () => {
    expect(escapeAttr(`a & b "c" <d> e`)).toBe('a &amp; b &quot;c&quot; &lt;d&gt; e');
  });

  it('leaves a value with no special characters unchanged', () => {
    expect(escapeAttr('plain-project-id-42')).toBe('plain-project-id-42');
  });

  it('escapes & before the entities it introduces, never double-escaping', () => {
    expect(escapeAttr('<')).toBe('&lt;');
    expect(escapeAttr('&lt;')).toBe('&amp;lt;');
  });
});
