// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The docs reader's split-preview editor (epic 0023 "the docs reader" slice
 * 3, board web-mtywp7to-rbebh4): the guarded `POST /api/docs/write` endpoint
 * and its pure allow-list planner landed with no caller — this is that
 * caller's own coverage, driving the real rendered DOM the way an operator
 * would (open a doc, click Edit, type, Save or Cancel), not just asserting
 * against the generated script's source text the way
 * `web/features/docs-viewer.test.ts` does for the read-only surfaces.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 1,
  totalBytes: 100,
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
  lastActivityAt: null,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

const DOC_PATH = 'docs/README.md';
const DOC_CONTENT = '# Title\n\nSome body text.\n';

interface BootOptions {
  writeResponse?: { status: number; body: unknown };
}

function boot(opts: BootOptions = {}): { writeCalls: Array<{ url: string; body: unknown }> } {
  const writeCalls: Array<{ url: string; body: unknown }> = [];
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const href = String(url);
    if (href.includes('/api/docs/write')) {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      writeCalls.push({ url: href, body });
      const resp = opts.writeResponse ?? { status: 200, body: { ok: true, path: DOC_PATH } };
      return {
        ok: resp.status < 400,
        status: resp.status,
        json: async () => resp.body,
      } as unknown as Response;
    }
    if (href.includes('/api/docs')) {
      return { ok: true, json: async () => ({ files: [DOC_PATH] }) } as unknown as Response;
    }
    if (href.includes('/api/file')) {
      return {
        ok: true,
        json: async () => ({ path: DOC_PATH, content: DOC_CONTENT }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as typeof fetch;
  new Function(clientJs())();
  return { writeCalls };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function openDoc(): void {
  document.querySelector<HTMLButtonElement>('[data-doc-open]')!.click();
}

describe('the docs editor (epic 0023 slice 3, board web-mtywp7to-rbebh4)', () => {
  it('offers an Edit button once a doc is loaded', async () => {
    boot();
    await flush();
    openDoc();
    await flush();

    const editBtn = document.querySelector<HTMLButtonElement>('.docs-edit-btn');
    expect(editBtn).not.toBeNull();
    expect(editBtn!.textContent).toBe('Edit');
  });

  it('clicking Edit swaps the read view for a textarea seeded with the real content, plus a live preview', async () => {
    boot();
    await flush();
    openDoc();
    await flush();
    document.querySelector<HTMLButtonElement>('.docs-edit-btn')!.click();

    const textarea = document.querySelector<HTMLTextAreaElement>('.docs-editor-textarea');
    expect(textarea).not.toBeNull();
    expect(textarea!.value).toBe(DOC_CONTENT);
    // The preview pane renders through the SAME renderMarkdown pipeline the
    // read view uses — its heading should already reflect the seeded draft.
    const preview = document.querySelector('.docs-editor-preview');
    expect(preview?.querySelector('h1')?.textContent).toBe('Title');
  });

  it('typing updates the live preview on a short debounce', async () => {
    vi.useFakeTimers();
    try {
      boot();
      await vi.advanceTimersByTimeAsync(0);
      openDoc();
      await vi.advanceTimersByTimeAsync(0);
      document.querySelector<HTMLButtonElement>('.docs-edit-btn')!.click();

      const textarea = document.querySelector<HTMLTextAreaElement>('.docs-editor-textarea')!;
      textarea.value = '# Retitled\n\nEdited body.\n';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await vi.advanceTimersByTimeAsync(200);

      const preview = document.querySelector('.docs-editor-preview');
      expect(preview?.querySelector('h1')?.textContent).toBe('Retitled');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Cancel discards the draft and returns to the read view without saving', async () => {
    const { writeCalls } = boot();
    await flush();
    openDoc();
    await flush();
    document.querySelector<HTMLButtonElement>('.docs-edit-btn')!.click();
    document.querySelector<HTMLTextAreaElement>('.docs-editor-textarea')!.value = 'discarded draft';
    document.querySelector<HTMLButtonElement>('.docs-editor-cancel')!.click();
    await flush();

    expect(writeCalls).toHaveLength(0);
    expect(document.querySelector('.docs-editor-textarea')).toBeNull();
    expect(document.querySelector('.docs-viewer-body')?.textContent).toContain('Some body text.');
  });

  it('Save POSTs the edited content to /api/docs/write and returns to the refreshed read view on success', async () => {
    const { writeCalls } = boot();
    await flush();
    openDoc();
    await flush();
    document.querySelector<HTMLButtonElement>('.docs-edit-btn')!.click();
    document.querySelector<HTMLTextAreaElement>('.docs-editor-textarea')!.value =
      '# Retitled\n\nEdited body.\n';
    document.querySelector<HTMLButtonElement>('.docs-editor-save')!.click();
    await flush();
    await flush();

    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]!.body).toEqual({
      project: 'p1',
      path: DOC_PATH,
      content: '# Retitled\n\nEdited body.\n',
    });
    // Save reloads from the server rather than trusting the draft — the
    // fixture always answers /api/file with the original DOC_CONTENT, so
    // seeing THAT back (not the draft) is the proof of a real reload.
    expect(document.querySelector('.docs-editor-textarea')).toBeNull();
    expect(document.querySelector('.docs-viewer-body')?.textContent).toContain('Some body text.');
  });

  it('a refused save shows the server reason and stays in edit mode with the draft intact', async () => {
    boot({ writeResponse: { status: 400, body: { ok: false, reason: 'outside the allow-list' } } });
    await flush();
    openDoc();
    await flush();
    document.querySelector<HTMLButtonElement>('.docs-edit-btn')!.click();
    const textarea = document.querySelector<HTMLTextAreaElement>('.docs-editor-textarea')!;
    textarea.value = 'still a draft';
    document.querySelector<HTMLButtonElement>('.docs-editor-save')!.click();
    await flush();
    await flush();

    expect(document.querySelector('.docs-editor-textarea')).not.toBeNull();
    expect(document.querySelector<HTMLTextAreaElement>('.docs-editor-textarea')!.value).toBe(
      'still a draft',
    );
    expect(document.querySelector('.docs-editor-status')?.textContent).toBe(
      'Not saved — outside the allow-list',
    );
    expect(document.querySelector<HTMLButtonElement>('.docs-editor-save')!.disabled).toBe(false);
  });
});
