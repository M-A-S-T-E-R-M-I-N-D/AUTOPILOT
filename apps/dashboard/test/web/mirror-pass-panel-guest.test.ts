// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The MIRROR PASS panel's role gate (epic 0019 law 1 extended to the UI,
 * board web-mtt3f7j6-3bj899): a confirmed non-owner of this repo sees the
 * reconcile finding but never the "Run mirror pass" execute button — the
 * same "steward is a guest and proposes instead of writes" rule
 * `issue-triage-panel-guest.test.ts`/`pr-review-panel-guest.test.ts`'s role
 * gates already cover for their own panels.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

const RECONCILE_FINDING = [
  { finding: { issueNumber: 42, comment: 'Landed in abc123 — closing.' } },
];

const DRIFT_FINDING = {
  versionDrift: { source: 'README.md', claimedVersion: '1', actualVersion: '2' },
  countsDrift: null,
  linkDrift: null,
};

function bootWithReconcile(
  reconcile: unknown[],
  identity: unknown = null,
  drift: unknown = null,
): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity }) } as unknown as Response;
    }
    // Check the more specific mirror-pass sub-paths before the bare
    // `/api/mirror-pass` preview — every one of them contains that same
    // substring, so order matters here.
    if (url.includes('/api/mirror-pass/landing-note')) {
      return { ok: true, json: async () => ({ landingNote: [] }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass/drift')) {
      return { ok: true, json: async () => ({ drift }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass/stale-claims')) {
      return { ok: true, json: async () => ({ staleClaims: [] }) } as unknown as Response;
    }
    if (url.includes('/api/mirror-pass')) {
      return { ok: true, json: async () => ({ mirrorPass: reconcile }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('MIRROR PASS execute button role gate (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides the execute button for a confirmed non-owner', async () => {
    bootWithReconcile(RECONCILE_FINDING, {
      login: 'a-contributor',
      nameWithOwner: 'octocat/hello-world',
      role: 'user',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.mirror-pass-item')).not.toBeNull();
    });
    expect(document.querySelector('[data-mirror-pass-execute]')).toBeNull();
  });

  it('shows the execute button for the resolved repo owner when a reconcile finding exists', async () => {
    bootWithReconcile(RECONCILE_FINDING, {
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-mirror-pass-execute]')).not.toBeNull();
    });
  });

  it('shows the execute button when identity is unresolved — the common fully-local project with no GitHub remote', async () => {
    bootWithReconcile(RECONCILE_FINDING, null);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-mirror-pass-execute]')).not.toBeNull();
    });
  });

  it('hides the execute button when there is nothing to reconcile, even for the maintainer', async () => {
    bootWithReconcile([], {
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.mirror-pass-body')).not.toBeNull();
    });
    expect(document.querySelector('[data-mirror-pass-execute]')).toBeNull();
  });
});

describe('MIRROR PASS drift-fix button role gate (derivation 3/4 own execute path)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides the drift-fix button for a confirmed non-owner', async () => {
    bootWithReconcile(
      [],
      { login: 'a-contributor', nameWithOwner: 'octocat/hello-world', role: 'user' },
      DRIFT_FINDING,
    );

    await vi.waitFor(() => {
      expect(document.querySelector('.mirror-pass-item')).not.toBeNull();
    });
    expect(document.querySelector('[data-mirror-pass-drift-execute]')).toBeNull();
  });

  it('shows the drift-fix button for the resolved repo owner when a drift finding exists', async () => {
    bootWithReconcile(
      [],
      { login: 'octocat', nameWithOwner: 'octocat/hello-world', role: 'maintainer' },
      DRIFT_FINDING,
    );

    await vi.waitFor(() => {
      expect(document.querySelector('[data-mirror-pass-drift-execute]')).not.toBeNull();
    });
  });

  it('shows the drift-fix button when identity is unresolved — the common fully-local project with no GitHub remote', async () => {
    bootWithReconcile([], null, DRIFT_FINDING);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-mirror-pass-drift-execute]')).not.toBeNull();
    });
  });

  it('hides the drift-fix button when there is no drift, even for the maintainer', async () => {
    bootWithReconcile(
      [],
      { login: 'octocat', nameWithOwner: 'octocat/hello-world', role: 'maintainer' },
      null,
    );

    await vi.waitFor(() => {
      expect(document.querySelector('.mirror-pass-body')).not.toBeNull();
    });
    expect(document.querySelector('[data-mirror-pass-drift-execute]')).toBeNull();
  });

  it('shows both buttons independently when both a reconcile and a drift finding exist', async () => {
    bootWithReconcile(
      RECONCILE_FINDING,
      { login: 'octocat', nameWithOwner: 'octocat/hello-world', role: 'maintainer' },
      DRIFT_FINDING,
    );

    await vi.waitFor(() => {
      expect(document.querySelector('[data-mirror-pass-execute]')).not.toBeNull();
      expect(document.querySelector('[data-mirror-pass-drift-execute]')).not.toBeNull();
    });
  });
});
