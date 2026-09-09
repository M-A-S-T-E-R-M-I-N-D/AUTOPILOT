// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER PR review panel's role gate (epic 0019 law 1 extended to the
 * UI, board web-mtt3f7j6-3bj899): a confirmed non-owner of this repo sees
 * the preview but never the write buttons (Apply / merge-as-maintainer /
 * re-run / update-branch) — the same "steward is a guest and proposes
 * instead of writes" rule `release-panel.test.ts`'s role-gate describe
 * block already covers for the RELEASE panel.
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

function bootWithPlans(plans: unknown[], identity: unknown = null): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity }) } as unknown as Response;
    }
    if (url.includes('/api/pr-review')) {
      return { ok: true, json: async () => ({ plans }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

const MERGEABLE = [
  {
    pr: { number: 42, title: 'fix: leaky socket' },
    decision: { decision: 'merge', reasoning: 'policy-green' },
  },
];

describe('KEEPER PR review role gate (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides the Apply button for a confirmed non-owner, showing a guest note instead', async () => {
    bootWithPlans(MERGEABLE, {
      login: 'a-contributor',
      nameWithOwner: 'octocat/hello-world',
      role: 'user',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-guest-note')).not.toBeNull();
    });
    expect(document.querySelector('[data-pr-review-execute]')).toBeNull();
    expect(document.querySelector('.pr-review-guest-note')?.textContent).toBe(
      'PR review actions on this repo are taken by its maintainer (octocat) — you are signed in as a-contributor.',
    );
  });

  it('keeps the Apply button for the resolved repo owner', async () => {
    bootWithPlans(MERGEABLE, {
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-review-execute]')).not.toBeNull();
    });
    expect(document.querySelector('.pr-review-guest-note')).toBeNull();
  });

  it('keeps the Apply button when identity is unresolved — the common fully-local project with no GitHub remote', async () => {
    bootWithPlans(MERGEABLE, null);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pr-review-execute]')).not.toBeNull();
    });
    expect(document.querySelector('.pr-review-guest-note')).toBeNull();
  });
});
