// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the shell's dialog titles.
 * The Getting started checklist heads with its `compass` beside an inner
 * `[data-i18n]` span, but the Ask sheet ("Ask") and the command palette
 * ("Go to, open, or do") headed with bare words. The Ask sheet leads with the
 * `message-circle` its floating button draws, so the sheet reads as the
 * button's own; the palette, a type-to-find over places, projects and
 * actions, leads with `search`.
 *
 * Each icon is decorative beside the words, so the dialog's accessible name,
 * which `aria-labelledby` takes from the title, stays the words alone. The
 * STRINGS key moves onto an inner span, the way the checklist's title carries
 * it, so a locale sweep rewrites the words and never touches the icon.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

function boot(project?: string): void {
  document.open();
  document.write(renderShell(project));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

const TITLES = [
  { id: 'ask-sheet-title', dialog: 'ask-sheet', key: 'askSheetTitle', icon: 'message-circle' },
  { id: 'palette-title', dialog: 'palette', key: 'paletteTitle', icon: 'search' },
] as const;

describe('the shell dialog titles (epic 0025 slice 2)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(TITLES)('$id leads with the decorative $icon icon beside its words', (t) => {
    for (const page of [undefined, 'demo']) {
      boot(page);
      const title = document.getElementById(t.id);
      expect(title?.tagName).toBe('H2');
      const icon = title?.firstElementChild;
      expect(icon?.getAttribute('class')).toBe('icon icon-' + t.icon);
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.querySelectorAll('path, circle').length).toBeGreaterThan(0);
      expect(title?.querySelectorAll('svg')).toHaveLength(1);
      const words = title?.querySelector('span[data-i18n="' + t.key + '"]');
      expect(words?.textContent).toBe(STRINGS.en[t.key]);
      expect(title?.hasAttribute('data-i18n')).toBe(false);
      expect(title?.textContent).toBe(STRINGS.en[t.key]);
      expect(document.getElementById(t.dialog)?.getAttribute('aria-labelledby')).toBe(t.id);
    }
  });

  it('switching to Hebrew translates both titles and keeps their icons', () => {
    boot('demo');

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const t of TITLES) {
      const title = document.getElementById(t.id);
      expect(title?.textContent).toBe(STRINGS.he[t.key]);
      expect(title?.firstElementChild?.getAttribute('class')).toBe('icon icon-' + t.icon);
      expect(title?.querySelectorAll('svg')).toHaveLength(1);
    }
  });
});
