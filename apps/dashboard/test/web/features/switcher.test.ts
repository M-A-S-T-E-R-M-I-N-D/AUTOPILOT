// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the theme switcher (`web/features/switcher.ts`) —
 * the first assembler function extracted out of `shell.ts` into its own file
 * under `web/features/` (epic 0002 "shell decomposition", PARALLEL UNLOCK B's
 * real extraction).
 */

import { describe, it, expect } from 'vitest';
import { THEME_NAMES } from '@autopilot/tokens';
import { switcherJs } from '../../../src/web/features/switcher.js';

describe('switcherJs', () => {
  it('embeds the real theme names as a JSON array', () => {
    expect(switcherJs()).toContain(`const THEMES = ${JSON.stringify(THEME_NAMES)};`);
  });

  it('applies a saved theme by writing data-theme and reflecting it on aria-pressed', () => {
    expect(switcherJs()).toContain('document.documentElement.dataset.theme = t;');
    expect(switcherJs()).toContain(
      "b.setAttribute('aria-pressed', String(b.dataset.themeBtn === t));",
    );
  });

  it('delegates clicks on [data-theme-btn] to applyTheme', () => {
    expect(switcherJs()).toContain("e.target.closest('[data-theme-btn]')");
    expect(switcherJs()).toContain('if (b) applyTheme(b.dataset.themeBtn);');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = switcherJs();
    expect(out).toBe(out.trim());
  });
});
