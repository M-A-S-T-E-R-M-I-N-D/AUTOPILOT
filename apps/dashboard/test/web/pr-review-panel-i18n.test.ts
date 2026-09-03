// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER PR review panel (`renderPrReviewPanel()`) rebuilds on its own
 * 30s poll, independent of the fleet stream's tick — untagged text here
 * would silently stay English in every locale even after the masthead/fleet
 * card i18n slices landed (board web-msnsndki-dz3vn1).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 0,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [],
  empty: true,
};

const PLAN = {
  pr: { number: 42, title: 'fix: leaky socket' },
  decision: { decision: 'merge', reasoning: 'policy-green' },
};

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/pr-review')) {
      return { ok: true, json: async () => ({ plans: [PLAN] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('KEEPER PR review panel i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the panel title and Apply button with their STRINGS keys', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.pr-review-title')?.getAttribute('data-i18n')).toBe(
      'prReviewTitle',
    );
    expect(document.querySelector('.pr-review-execute')?.getAttribute('data-i18n')).toBe(
      'prReviewApply',
    );
  });

  it('switching to Hebrew via the language switcher translates the panel', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const langBtn = document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement;
    expect(langBtn).not.toBeNull();
    langBtn.click();

    expect(document.querySelector('.pr-review-title')?.textContent).toBe(STRINGS.he.prReviewTitle);
    expect(document.querySelector('.pr-review-execute')?.textContent).toBe(
      STRINGS.he.prReviewApply,
    );
  });

  it('a panel rebuilt by the next 30s poll after a locale switch still renders in the active locale', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expect(document.querySelector('.pr-review-title')?.textContent).toBe(STRINGS.he.prReviewTitle);

    await vi.advanceTimersByTimeAsync(30000);

    expect(document.querySelector('.pr-review-title')?.textContent).toBe(STRINGS.he.prReviewTitle);
    expect(document.querySelector('.pr-review-execute')?.textContent).toBe(
      STRINGS.he.prReviewApply,
    );
  });
});
