// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the KEEPER PR
 * review panel's "Apply" button — unlike its sibling PR-number span on the
 * same row, which already carries a data-tip/aria-label — had no
 * explanation at all of what applying the KEEPER decision does before the
 * operator's click triggers a real gh merge/review, the same gap
 * release-execute-tooltip.test.ts closed for the RELEASE panel's EXECUTE
 * button.
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

function bootWithPlans(plans: unknown[]): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pr-review')) {
      return { ok: true, json: async () => ({ plans }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('PR review Apply button explains itself on hover/focus', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the "Apply" button a data-tip matching its aria-label, naming the decision', async () => {
    bootWithPlans([
      {
        pr: { number: 42, title: 'fix: leaky socket' },
        decision: { decision: 'merge', reasoning: 'policy-green' },
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-review-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-pr-review-execute]');
    expect(button?.getAttribute('data-tip')).toBeTruthy();
    expect(button?.getAttribute('data-tip')).toBe(button?.getAttribute('aria-label'));
    expect(button?.getAttribute('data-tip')).toContain('#42');
    expect(button?.getAttribute('data-tip')).toContain('merge');
  });

  it('names the reversible-comment-only path for a request-changes decision, not the merge warning', async () => {
    bootWithPlans([
      {
        pr: { number: 7, title: 'chore: bump deps' },
        decision: { decision: 'request-changes', reasoning: 'gate red' },
      },
    ]);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-review-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-pr-review-execute]');
    expect(button?.getAttribute('data-tip')).toContain('#7');
    expect(button?.getAttribute('data-tip')).not.toContain('cannot be undone');
  });
});
