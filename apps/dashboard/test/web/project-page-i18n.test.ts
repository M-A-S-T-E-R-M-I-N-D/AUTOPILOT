// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The per-project inside page's "Contribute upstream" form (`renderProjectPage()`'s
 * `.github-pr` section, `shell.ts`'s client-built `ghPrTitle`/`ghPrBodyLabel`/
 * `ghPrSubmit`) is client-rendered JS, not static HTML — invisible to
 * `scripts/i18n/find-untagged-strings.mjs`'s tag scanner, and out of scope for
 * `packages/tokens/src/strings.ts`'s `titlePlaceholder`/`detailsOptionalPlaceholder`
 * comment, which named it as a deferred follow-up when the sibling "Report a
 * bug" form was tagged. This is that follow-up's regression test.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
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
  topDirs: [],
  hotFiles: [],
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

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the per-project "Contribute upstream" PR form i18n wiring (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('tags the title placeholder, body label, and submit button with their STRINGS keys', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const section = document.querySelector('.github-pr');
    expect(section).not.toBeNull();

    const title = section?.querySelector('input[name="title"]') as HTMLInputElement;
    expect(title.placeholder).toBe('Title');
    expect(title.getAttribute('data-i18n-placeholder')).toBe('titlePlaceholder');

    const bodyLabel = section?.querySelector('textarea[name="body"]')?.previousElementSibling;
    expect(bodyLabel?.textContent).toBe('Details (optional)');
    expect(bodyLabel?.getAttribute('data-i18n')).toBe('detailsOptionalPlaceholder');

    const submit = section?.querySelector('button[type="submit"]');
    expect(submit?.textContent).toBe('Open pull request');
    expect(submit?.getAttribute('data-i18n')).toBe('openPullRequest');
  });

  it('tags the branch label — the project name mid-sentence — with a data-i18n-template pair', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const section = document.querySelector('.github-pr');
    const branchLabel = section?.querySelector('label[for^="github-pr-title-"]');
    expect(branchLabel?.textContent).toBe(
      "Contribute Alpha's current branch upstream as a pull request",
    );
    expect(branchLabel?.getAttribute('data-i18n-template')).toBe('githubPrLabel');
    expect(branchLabel?.getAttribute('data-i18n-name')).toBe('Alpha');
  });

  it('switching to Hebrew translates the placeholder, label, submit button, and branch label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const section = document.querySelector('.github-pr');
    const title = section?.querySelector('input[name="title"]') as HTMLInputElement;
    expect(title.placeholder).toBe(STRINGS.he.titlePlaceholder);

    const bodyLabel = section?.querySelector('textarea[name="body"]')?.previousElementSibling;
    expect(bodyLabel?.textContent).toBe(STRINGS.he.detailsOptionalPlaceholder);

    const submit = section?.querySelector('button[type="submit"]');
    expect(submit?.textContent).toBe(STRINGS.he.openPullRequest);

    const branchLabel = section?.querySelector('label[for^="github-pr-title-"]');
    expect(branchLabel?.textContent).toBe(STRINGS.he.githubPrLabel.replace('{name}', 'Alpha'));
  });
});
