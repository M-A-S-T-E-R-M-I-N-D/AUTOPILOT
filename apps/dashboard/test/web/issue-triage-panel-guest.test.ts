// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER ISSUE TRIAGE panel's role gate (epic 0019 law 1 extended to the
 * UI, board web-mtt3f7j6-3bj899): a confirmed non-owner of this repo sees
 * the triage preview but never the "Run KEEPER triage" execute button — the
 * same "steward is a guest and proposes instead of writes" rule
 * `pr-review-panel-guest.test.ts`/`release-panel.test.ts`'s role gates
 * already cover for their own panels.
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

const OPEN_ISSUE = {
  issue: { number: 42, title: 'Widget renders blank on load' },
  decision: { decision: 'accept', reasoning: 'No matching open task.' },
};

function bootWithTriage(triage: unknown[], identity: unknown = null): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity }) } as unknown as Response;
    }
    if (url.includes('/api/issue-triage')) {
      return { ok: true, json: async () => ({ triage }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('KEEPER issue triage role gate (epic 0019 law 1 extended to the UI, board web-mtt3f7j6-3bj899)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides the execute button for a confirmed non-owner, showing a guest note instead', async () => {
    bootWithTriage([OPEN_ISSUE], {
      login: 'a-contributor',
      nameWithOwner: 'octocat/hello-world',
      role: 'user',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-guest-note')).not.toBeNull();
    });
    expect(document.querySelector('[data-issue-triage-execute]')).toBeNull();
    expect(document.querySelector('.issue-triage-guest-note')?.textContent).toBe(
      'Issue triage on this repo is run by its maintainer (octocat) — you are signed in as a-contributor.',
    );
  });

  it('keeps the execute button for the resolved repo owner', async () => {
    bootWithTriage([OPEN_ISSUE], {
      login: 'octocat',
      nameWithOwner: 'octocat/hello-world',
      role: 'maintainer',
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute]')).not.toBeNull();
    });
    expect(document.querySelector('.issue-triage-guest-note')).toBeNull();
  });

  it('keeps the execute button when identity is unresolved — the common fully-local project with no GitHub remote', async () => {
    bootWithTriage([OPEN_ISSUE], null);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute]')).not.toBeNull();
    });
    expect(document.querySelector('.issue-triage-guest-note')).toBeNull();
  });
});
