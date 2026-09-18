// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Docs reader panel's archived-doc marker (epic 0023 "the docs reader"
 * slice 5, "hygiene"): the 2026-09-12 audit (commit 4d50c153) already moved
 * superseded records under `docs/archive/` and gave them their own index —
 * but the reader's file list still showed them exactly like current
 * doctrine, so "the tree the reader shows" was not yet "the tree we mean".
 * A row whose path starts with `docs/archive/` now carries a visible,
 * accessible "Archived" marker instead of blending in.
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

describe('the Docs reader panel marks archived docs (epic 0023 slice 5)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('marks a docs/archive/ row archived — class, visible badge, and an unchanged real path', async () => {
    boot(['README.md', 'docs/archive/CHANGELOG-PRE-0.14.0.md']);
    await settle();

    const buttons = document.querySelectorAll('.docs-list .docs-file');
    expect(buttons.length).toBe(2);
    const archived = buttons[1] as HTMLButtonElement;
    expect(archived.classList.contains('docs-file-archived')).toBe(true);
    expect(archived.getAttribute('data-doc-open')).toBe('docs/archive/CHANGELOG-PRE-0.14.0.md');
    // The badge is real button content, not an aria-only aside — a sighted
    // reader sees it and a screen reader picks it up as part of the button's
    // own accessible name, with zero extra wiring.
    expect(archived.querySelector('.docs-file-archived-badge')?.textContent).toBe('Archived');
    expect(archived.textContent).toContain('Archived');
  });

  it('leaves a live doc unmarked', async () => {
    boot(['README.md', 'docs/foo.md']);
    await settle();

    const buttons = document.querySelectorAll('.docs-list .docs-file');
    for (const b of Array.from(buttons)) {
      expect(b.classList.contains('docs-file-archived')).toBe(false);
      expect(b.querySelector('.docs-file-archived-badge')).toBeNull();
    }
  });

  it("still opens the archived doc's real file when clicked", async () => {
    boot(['README.md', 'docs/archive/CHANGELOG-PRE-0.14.0.md']);
    await settle();

    (document.querySelectorAll('.docs-list .docs-file')[1] as HTMLButtonElement).click();
    await settle();

    expect(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.some(
        ([input]) =>
          String(input).includes('/api/file') &&
          String(input).includes(encodeURIComponent('docs/archive/CHANGELOG-PRE-0.14.0.md')),
      ),
    ).toBe(true);
  });

  it('notes the archived state in the hover tip and the screen-reader description', async () => {
    boot(['docs/archive/CHANGELOG-PRE-0.14.0.md']);
    await settle();

    const btn = document.querySelector('.docs-list .docs-file') as HTMLButtonElement;
    expect(btn.getAttribute('data-tip')).toContain('archived');
    const descId = btn.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId as string)?.textContent).toContain('archived');
  });
});
