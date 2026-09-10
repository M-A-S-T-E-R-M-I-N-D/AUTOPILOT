// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Real-bundle DOM render coverage for the CONTRIBUTOR ISSUE LIST panel
 * (board web-mtt3hery-l8v0lf, CONTRIBUTOR JOURNEY slice 1 of 4) — executes
 * the ACTUAL client bundle (`clientJs()`), the same real-bundle convention
 * `pool-client-link.test.ts` uses, so this stays honest to what a browser
 * actually runs rather than testing `renderContributorIssueListPanel` in
 * isolation.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

function bootWithEntries(entries: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/contributor-issues')) {
      return { ok: true, json: async () => ({ entries }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ projects: [], empty: true }) } as unknown as Response;
  });
  new Function(clientJs())();
}

const ENTRY = {
  number: 42,
  title: 'Keyboard nav is broken in the fleet table',
  url: 'https://github.com/example/repo/issues/42',
  tier: 'good first issue',
};

describe('the contributor issue list panel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays hidden when there is nothing open to show', async () => {
    bootWithEntries([]);

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(document.getElementById('contributor-issue-list-panel')?.hasAttribute('hidden')).toBe(
      true,
    );
  });

  it('renders an entry as a real, safely-targeted link to GitHub', async () => {
    bootWithEntries([ENTRY]);

    await vi.waitFor(() => {
      expect(document.querySelector('.contributor-issue-list-number')).not.toBeNull();
    });
    const link = document.querySelector('.contributor-issue-list-number') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://github.com/example/repo/issues/42');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toBe('#42');
    expect(document.getElementById('contributor-issue-list-panel')?.hasAttribute('hidden')).toBe(
      false,
    );
  });

  it('badges the tier and shows the issue title', async () => {
    bootWithEntries([ENTRY]);

    await vi.waitFor(() => {
      expect(document.querySelector('.contributor-issue-list-badge')).not.toBeNull();
    });
    expect(document.querySelector('.contributor-issue-list-badge')?.textContent).toBe(
      '🌱 good first issue',
    );
    expect(document.querySelector('.contributor-issue-list-issue-title')?.textContent).toBe(
      'Keyboard nav is broken in the fleet table',
    );
  });

  it('renders the /claim walkthrough as a real, keyboard-operable <details> disclosure alongside the list', async () => {
    bootWithEntries([ENTRY]);

    await vi.waitFor(() => {
      expect(document.querySelector('.contributor-claim-walkthrough')).not.toBeNull();
    });
    const details = document.querySelector('.contributor-claim-walkthrough');
    expect(details?.tagName).toBe('DETAILS');
    expect(details?.querySelector('summary')?.textContent).toBe('How to claim');
    const steps = details?.querySelectorAll('li');
    expect(steps?.length).toBe(4);
    expect(steps?.[0]?.textContent).toContain('Fork it');
  });

  it('renders no walkthrough at all when there is nothing open to claim', async () => {
    bootWithEntries([]);

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    expect(document.querySelector('.contributor-claim-walkthrough')).toBeNull();
  });
});
