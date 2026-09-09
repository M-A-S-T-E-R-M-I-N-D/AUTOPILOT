// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Docs reader panel's Standing explainer pin (board ap-mtu6l8ct-3,
 * CONTRIBUTOR JOURNEY slice 4/4): `.github/CONTRIBUTOR-STANDING.md`, when a
 * project's indexed doc list actually contains it, is pinned to the top of
 * the list with a friendlier label instead of sitting wherever it falls
 * alphabetically — same fetch+renderMarkdown pipeline as every other doc, so
 * there is nothing to duplicate or drift.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const STANDING_PATH = '.github/CONTRIBUTOR-STANDING.md';

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

function boot(files: readonly string[]): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/docs'))
      return { ok: true, json: async () => ({ files }) } as unknown as Response;
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("the Docs reader panel's Standing explainer pin (board ap-mtu6l8ct-3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it('pins CONTRIBUTOR-STANDING.md first with a friendly label when the project ships one', async () => {
    boot(['README.md', 'docs/foo.md', STANDING_PATH]);
    await settle();

    const buttons = document.querySelectorAll('.docs-list .docs-file');
    expect(buttons.length).toBe(3);
    expect(buttons[0]?.textContent).toBe('🤝 Contributor Standing');
    expect(buttons[0]?.getAttribute('data-doc-open')).toBe(STANDING_PATH);
    // Reordered, never duplicated — the raw path appears exactly once.
    const rawPathButtons = Array.from(buttons).filter(
      (b) => b.getAttribute('data-doc-open') === STANDING_PATH,
    );
    expect(rawPathButtons.length).toBe(1);
  });

  it('opens the real file path when the pinned entry is clicked', async () => {
    boot(['README.md', STANDING_PATH]);
    await settle();

    (document.querySelector('.docs-list .docs-file') as HTMLButtonElement).click();
    await settle();

    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([input]) =>
          String(input).includes('/api/file') &&
          String(input).includes(encodeURIComponent(STANDING_PATH)),
      ),
    ).toBe(true);
  });

  it('leaves the plain list untouched for a project with no CONTRIBUTOR-STANDING.md', async () => {
    boot(['README.md', 'docs/foo.md']);
    await settle();

    const buttons = document.querySelectorAll('.docs-list .docs-file');
    expect(buttons.length).toBe(2);
    expect(Array.from(buttons).some((b) => b.textContent === '🤝 Contributor Standing')).toBe(
      false,
    );
  });
});
