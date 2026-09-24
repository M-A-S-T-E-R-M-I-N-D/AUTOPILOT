// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE KEEPER PR REVIEW PANEL'S MAINTAINER CONTROLS AND QUEUE-FOR-HUMAN BADGE
 * GET A STROKE ICON INSTEAD OF A BAKED-IN EMOJI (epic 0025, icon system;
 * board web-mtywp7zq-55f3o9). Executes the ACTUAL client bundle
 * (`clientJs()`), the same real-bundle convention
 * `issue-triage-decision-icon.test.ts` uses for its sibling KEEPER panel.
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

const PLAN = {
  pr: {
    number: 42,
    title: 'fix: leaky socket',
    url: 'https://github.com/acme/widgets/pull/42',
    awaitingApprovalRunIds: ['run1'],
    checkRuns: [],
  },
  decision: { decision: 'queue-for-human', reasoning: 'needs a human' },
};

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: null }) } as unknown as Response;
    }
    if (url.startsWith('/api/pr-review')) {
      return { ok: true, json: async () => ({ plans: [PLAN] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('the KEEPER PR review panel maintainer controls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the approve link carries a lock-open stroke icon, no baked-in emoji', async () => {
    boot();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-approve-link')).not.toBeNull();
    });
    const link = document.querySelector('.pr-review-approve-link');
    expect(link?.querySelector('svg.icon-lock-open')).not.toBeNull();
    expect(link?.textContent).toBe('Review & approve on GitHub');
  });

  it('the maintainer merge button carries a handshake stroke icon, no baked-in emoji', async () => {
    boot();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-human-merge')).not.toBeNull();
    });
    const button = document.querySelector('.pr-review-human-merge');
    expect(button?.querySelector('svg.icon-handshake')).not.toBeNull();
    expect(button?.textContent).toBe('Merge as maintainer');
  });

  it('the awaiting-approval decision badge carries a lock stroke icon, no baked-in emoji', async () => {
    boot();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-badge')).not.toBeNull();
    });
    const badge = document.querySelector('.pr-review-badge');
    expect(badge?.querySelector('svg.icon-lock')).not.toBeNull();
    expect(badge?.textContent).toBe('awaiting approval to run CI');
  });

  it('the plain queue-for-human decision badge carries a user stroke icon, no baked-in emoji', async () => {
    const plan = {
      ...PLAN,
      pr: { ...PLAN.pr, awaitingApprovalRunIds: [] },
    };
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/social-identity')) {
        return { ok: true, json: async () => ({ identity: null }) } as unknown as Response;
      }
      if (url.startsWith('/api/pr-review')) {
        return { ok: true, json: async () => ({ plans: [plan] }) } as unknown as Response;
      }
      return { ok: true, json: async () => STATE } as unknown as Response;
    }) as unknown as typeof fetch;
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-badge')).not.toBeNull();
    });
    const badge = document.querySelector('.pr-review-badge');
    expect(badge?.querySelector('svg.icon-user')).not.toBeNull();
    expect(badge?.textContent).toBe('queue for human');
  });
});
