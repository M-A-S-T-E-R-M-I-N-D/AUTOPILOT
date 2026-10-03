// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Community group's panel
 * headings. Good first issues, Pool and Fleet coordination lead with a
 * stroke icon through `panelHeading()`, but Contributor standing and
 * Collaboration built a bare `<h3>` tagged with a STRINGS key that did not
 * exist, so under Hebrew they stayed English. Each now leads with its own
 * vendored icon (`award`, `map`) beside an inner `[data-i18n]` span, and a
 * locale switch translates the words without wiping the icon.
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

const COLLABORATION = {
  roadmap: [
    { number: 7, title: 'Fly lanes on more engines', url: 'https://example.test/7', assignees: [] },
  ],
  helpWanted: [],
};

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/collaboration')) {
      return { ok: true, json: async () => COLLABORATION } as unknown as Response;
    }
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: null }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const HEADINGS = [
  { selector: '.contributor-standing-title', key: 'contributorStandingTitle', icon: 'award' },
  { selector: '.collaboration-title', key: 'collaborationTitle', icon: 'map' },
] as const;

describe('the Community panel headings (epic 0025 slice 2)', () => {
  beforeEach(() => localStorage.removeItem('ap-locale'));
  afterEach(() => vi.restoreAllMocks());

  it.each(HEADINGS)('$selector leads with the $icon icon beside its tagged words', async (h) => {
    boot();
    await settle();

    const title = document.querySelector(h.selector);
    expect(title).not.toBeNull();
    expect(title?.hasAttribute('data-i18n')).toBe(false);
    const icon = title?.firstElementChild;
    expect(icon?.getAttribute('class')).toBe('icon icon-' + h.icon);
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelectorAll('path, circle').length).toBeGreaterThan(0);
    expect(title?.querySelector('.heading-text')?.getAttribute('data-i18n')).toBe(h.key);
    expect(title?.textContent).toBe(STRINGS.en[h.key]);
  });

  it('both keys carry their own words in every locale', () => {
    for (const h of HEADINGS) {
      expect(STRINGS.en[h.key]).toBeTruthy();
      expect(STRINGS.he[h.key]).toBeTruthy();
      expect(STRINGS.he[h.key]).not.toBe(STRINGS.en[h.key]);
    }
  });

  it('switching to Hebrew translates both headings and keeps their icons', async () => {
    boot();
    await settle();

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    for (const h of HEADINGS) {
      const title = document.querySelector(h.selector);
      expect(title?.textContent).toBe(STRINGS.he[h.key]);
      expect(title?.querySelector('svg.icon-' + h.icon)).not.toBeNull();
    }
  });
});
