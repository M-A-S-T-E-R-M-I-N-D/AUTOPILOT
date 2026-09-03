// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * UX weakness sweep (epic 0015, board web-mtju8ekq-dlpe9n): the project
 * page's "Contribute upstream" PR form (`renderProjectPage()`'s
 * `.github-pr` section) used to render its title input, details textarea,
 * and submit button fully expanded on every visit, even though opening a
 * PR is a rare, occasional action — the same "always-open form" weakness
 * `soulEditorPanel`'s `<details>` wrapper (`.soul-editor`) already solved
 * for the SOUL-edit form. This closes the same gap here: the form now
 * lives inside a closed-by-default `<details class="github-pr-details">`,
 * same shape as `.soul-editor`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  flightLog: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the "Contribute upstream" PR form is a closed-by-default disclosure', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('wraps the form in a <details> that starts closed', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const details = document.querySelector('.github-pr-details');
    expect(details?.tagName).toBe('DETAILS');
    expect((details as HTMLDetailsElement).open).toBe(false);

    const summary = details?.querySelector('summary.github-pr-summary');
    expect(summary).not.toBeNull();
    expect(summary?.getAttribute('data-i18n')).toBe('githubPrSummary');
    expect(summary?.textContent).toBe(STRINGS.en.githubPrSummary);
  });

  it('still nests the title input, details textarea, and submit button inside .github-pr', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const section = document.querySelector('.github-pr');
    const details = section?.querySelector('.github-pr-details');
    expect(details?.querySelector('input[name="title"]')).not.toBeNull();
    expect(details?.querySelector('textarea[name="body"]')).not.toBeNull();
    expect(details?.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('switching to Hebrew translates the disclosure summary', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const summary = document.querySelector('summary.github-pr-summary');
    expect(summary?.textContent).toBe(STRINGS.he.githubPrSummary);
  });
});
