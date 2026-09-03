// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * UX weakness sweep (epic 0015, board web-mtju8ekq-dlpe9n), cut 2 of 3: the
 * project page's Inbox note form (`renderProjectPage()`'s `tasksSection()`
 * — heading plus `.inbox-add` form) used to render fully expanded on every
 * visit, even though dropping a note for the next firing is a rare,
 * occasional action — the same "always-open form" weakness the "Contribute
 * upstream" PR form and `soulEditorPanel`'s `.soul-editor` already solved.
 * This closes the same gap here: the heading and form now live inside a
 * closed-by-default `<details class="inbox-details">`, same shape as
 * `.soul-editor`/`.github-pr-details`.
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
  languages: [],
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

describe('the Inbox note form is a closed-by-default disclosure', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('wraps the heading and form in a <details> that starts closed', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const details = document.querySelector('.inbox-details');
    expect(details?.tagName).toBe('DETAILS');
    expect((details as HTMLDetailsElement).open).toBe(false);

    const summary = details?.querySelector('summary.inbox-summary');
    expect(summary).not.toBeNull();
    expect(summary?.getAttribute('data-i18n')).toBe('inboxSummary');
    expect(summary?.textContent).toBe(STRINGS.en.inboxSummary);
  });

  it('still nests the labelled textarea and submit button inside the details', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const details = document.querySelector('.inbox-details');
    const form = details?.querySelector('[data-inbox-add="p1"]');
    expect(form).not.toBeNull();
    expect(form?.querySelector('textarea[name="message"]')).not.toBeNull();
    expect(form?.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it('switching to Hebrew translates the disclosure summary', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const summary = document.querySelector('summary.inbox-summary');
    expect(summary?.textContent).toBe(STRINGS.he.inboxSummary);
  });
});
