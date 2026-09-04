// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER PR review panel's Apply result is a live region (BOARD
 * web-mss50ia0-s6vtbd, "PLATFORM 4/7"): the click handler writes the execute
 * outcome — "✓ merged", "✗ the gate failed", the stale-decision refusal —
 * into a `.pr-review-result` element AFTER the operator's confirm, well after
 * focus has moved on, so without `role="status"`/`aria-live="polite"` a
 * screen-reader user heard nothing when a real `gh` merge/review landed or
 * failed. Every sibling result element already announces itself this way
 * (`landing-result`, `report-menu`'s result, `gh-issue-result`), so this
 * closes the one gap in the operator-facing KEEPER surface.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
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

const PLANS = [
  {
    pr: { number: 42, title: 'fix: leaky socket' },
    decision: { decision: 'merge', reasoning: 'policy-green' },
  },
  {
    pr: { number: 7, title: 'chore: bump deps' },
    decision: { decision: 'request-changes', reasoning: 'gate red' },
  },
];

function boot(executeResponse: { status: number; body: unknown }): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/pr-review/execute') && init?.method === 'POST') {
      return {
        ok: executeResponse.status < 400,
        status: executeResponse.status,
        json: async () => executeResponse.body,
      } as unknown as Response;
    }
    if (url.includes('/api/pr-review')) {
      return { ok: true, json: async () => ({ plans: PLANS }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('KEEPER PR review Apply result is a polite live region (PLATFORM 4/7)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders every PR row\'s result element with role="status" and aria-live="polite"', async () => {
    boot({ status: 200, body: { results: [] } });

    await vi.waitFor(() => {
      expect(document.querySelectorAll('.pr-review-result').length).toBe(PLANS.length);
    });
    for (const resultEl of document.querySelectorAll('.pr-review-result')) {
      expect(resultEl.getAttribute('role')).toBe('status');
      expect(resultEl.getAttribute('aria-live')).toBe('polite');
    }
  });

  it('announces the execute outcome through that same live region after Apply', async () => {
    boot({ status: 500, body: { error: 'gh exploded mid-merge' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-review-execute="42"]')).not.toBeNull();
    });
    (document.querySelector('[data-pr-review-execute="42"]') as HTMLButtonElement).click();

    const item = document
      .querySelector('[data-pr-review-execute="42"]')
      ?.closest('.pr-review-item');
    const resultEl = item?.querySelector('.pr-review-result');
    await vi.waitFor(() => {
      expect(resultEl?.textContent).toBe('✗ gh exploded mid-merge');
    });
    // The handler updates the element in place — the live-region semantics
    // must survive the write, or the announcement never fires.
    expect(resultEl?.getAttribute('role')).toBe('status');
    expect(resultEl?.getAttribute('aria-live')).toBe('polite');
    expect(resultEl?.className).toBe('pr-review-result pr-review-result-fail');
  });
});
