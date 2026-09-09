// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE POOL PANEL'S DEAD LINK (epic 0020 "the legible surface", slice 5 —
 * operator, 2026-09-09: "אם אנחנו מביאים מידע מהGITHUB למה אנחנו לא
 * יכולים לקשר באופן ישיר"). `flight/pool-client.ts`'s `fetchPoolIssues`
 * already reads `url` off `gh issue list --json number,title,url,labels,
 * assignees` — `PoolIssue.url` was fetched on every 30s poll and never
 * once read by `renderPoolClientPanel`, the exact "fetched and discarded"
 * bug slice 1 fixed on the KEEPER PR-review panel one file over
 * (`pr-check-strip.test.ts`'s "makes the PR number a real link" case).
 * Executes the ACTUAL client bundle (`clientJs()`), the same real-bundle
 * convention `pr-check-strip.test.ts`/`pool-client-fly.test.ts` use.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

function bootWithEntries(entries: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/pool-client')) {
      return { ok: true, json: async () => ({ entries }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ projects: [], empty: true }) } as unknown as Response;
  });
  new Function(clientJs())();
}

const ENTRY = {
  issue: {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    url: 'https://github.com/example/repo/issues/42',
    assignees: [],
  },
  decision: { decision: 'claim', reasoning: 'claiming #42 for octocat' },
};

describe('the pool client issue number links out, safely targeted', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('makes the issue number a real link to GitHub, safely targeted', async () => {
    bootWithEntries([ENTRY]);

    await vi.waitFor(() => {
      expect(document.querySelector('.pool-client-number-link')).not.toBeNull();
    });
    const link = document.querySelector('.pool-client-number-link') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://github.com/example/repo/issues/42');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toBe('#42');
  });

  it('falls back to plain text — never a dead link — when the issue carries no url', async () => {
    const noUrlEntry = { ...ENTRY, issue: { ...ENTRY.issue, url: undefined } };
    bootWithEntries([noUrlEntry]);

    await vi.waitFor(() => {
      expect(document.querySelector('.pool-client-number')).not.toBeNull();
    });
    expect(document.querySelector('.pool-client-number')?.tagName).toBe('SPAN');
    expect(document.querySelector('.pool-client-number-link')).toBeNull();
  });
});
