// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE KEEPER ISSUE-TRIAGE PANEL'S DEAD LINK (epic 0020 "the legible
 * surface", slice 3 — operator, 2026-09-09: "אם אנחנו מביאים מידע
 * מהGITHUB למה אנחנו לא יכולים לקשר באופן ישיר"). `flight/issue-triage.ts`'s
 * `fetchOpenIssues` now reads `url` off `gh issue list --json number,title,
 * body,url,labels,assignees,author` — mirrors `pr-review.ts`'s PR-number
 * link (slice 1) and `pool-client.ts`'s issue-number link (slice 5) so the
 * KEEPER triage preview's own issue number stops being a dead end too.
 * Executes the ACTUAL client bundle (`clientJs()`), the same real-bundle
 * convention `pool-client-link.test.ts`/`pr-check-strip.test.ts` use.
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

function bootWithTriage(triage: unknown[]): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: null }) } as unknown as Response;
    }
    if (url.includes('/api/issue-triage')) {
      return { ok: true, json: async () => ({ triage }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

const ISSUE_WITH_URL = {
  issue: {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    url: 'https://github.com/example/repo/issues/42',
  },
  decision: { decision: 'accept', reasoning: 'No matching open task.' },
};

describe('the KEEPER issue-triage number links out, safely targeted', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes the issue number a real link to GitHub, safely targeted', async () => {
    bootWithTriage([ISSUE_WITH_URL]);

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-number-link')).not.toBeNull();
    });
    const link = document.querySelector('.issue-triage-number-link') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://github.com/example/repo/issues/42');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toBe('#42');
  });

  it('falls back to plain text — never a dead link — when the issue carries no url', async () => {
    const noUrlIssue = { ...ISSUE_WITH_URL, issue: { ...ISSUE_WITH_URL.issue, url: undefined } };
    bootWithTriage([noUrlIssue]);

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-number')).not.toBeNull();
    });
    expect(document.querySelector('.issue-triage-number')?.tagName).toBe('SPAN');
    expect(document.querySelector('.issue-triage-number-link')).toBeNull();
  });
});
