// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Docs reader panel's split-preview editor (epic 0023 "the docs reader"
 * slice 3, board web-mtywp7to-rbebh4): the guarded `POST /api/docs/write`
 * endpoint (`docs/write.ts` + `flight/docs-write.ts`) landed with no UI
 * caller — this is that caller, and its first regression coverage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

// clientJs() is `eval`'d fresh via `new Function` in every test (there is no
// module system to reset), and each run re-registers its own top-level
// `document.addEventListener` click delegates. `document.open()`/`close()`
// resets the DOM tree but NOT those listeners, so without this they stack
// across tests in this file: a click after N boots fires N generations of the
// SAME delegate, which (for the toggle/cancel pair, a synchronous open/close
// state machine) turns one click into an N-deep open/close storm whose final
// state depends on N's parity. Recording and removing every listener this
// test itself added, after each test, keeps the document at exactly one
// generation of delegates per test, matching one real page load.
let restoreListeners: () => void = () => {};

beforeEach(() => {
  const added: Array<[string, EventListenerOrEventListenerObject]> = [];
  const original = document.addEventListener.bind(document);
  document.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    added.push([type, listener]);
    return original(type, listener, options);
  }) as typeof document.addEventListener;
  restoreListeners = () => {
    for (const [type, listener] of added) document.removeEventListener(type, listener);
    document.addEventListener = original;
  };
});

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

const DOC_PATH = 'docs/hello.md';
const DOC_CONTENT = '# Hello world\n\nOriginal body text.';

function boot(options: {
  files?: readonly string[];
  fileContent?: string;
  writeResult?: unknown;
  writeOk?: boolean;
}): ReturnType<typeof vi.fn> {
  const files = options.files ?? [DOC_PATH];
  const fileContent = options.fileContent ?? DOC_CONTENT;
  const writeOk = options.writeOk ?? true;
  const writeResult = options.writeResult ?? { ok: true, path: DOC_PATH };
  document.open();
  document.write(renderShell('p1'));
  document.close();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/docs/write')) {
      return { ok: writeOk, json: async () => writeResult } as unknown as Response;
    }
    if (url.includes('/api/file')) {
      // Echoes back whichever path was actually requested — a hardcoded
      // DOC_PATH here would make the non-Markdown test open a '.md' path
      // no matter which file the reader clicked.
      const requestedPath = new URL(url, 'http://localhost').searchParams.get('path') ?? DOC_PATH;
      return {
        ok: true,
        json: async () => ({
          path: requestedPath,
          content: fileContent,
          touchedAt: null,
          brokenLinks: [],
          linksHere: [],
        }),
      } as unknown as Response;
    }
    if (url.includes('/api/docs')) {
      return { ok: true, json: async () => ({ files }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  globalThis.fetch = fetchMock;
  new Function(clientJs())();
  return fetchMock;
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function openDoc(): Promise<void> {
  await settle();
  (document.querySelector('.docs-list .docs-file') as HTMLButtonElement).click();
  await settle();
}

describe('the Docs reader panel split-preview editor (epic 0023 slice 3)', () => {
  afterEach(() => {
    restoreListeners();
    vi.restoreAllMocks();
  });

  it('offers an Edit toggle for a Markdown doc, seeded with the raw source and a live preview', async () => {
    boot({});
    await openDoc();

    const toggle = document.querySelector('[data-doc-edit-toggle]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    toggle.click();
    await settle();

    const textarea = document.querySelector('.docs-editor-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe(DOC_CONTENT);
    const preview = document.querySelector('.docs-editor-preview');
    expect(preview?.querySelector('h1')?.textContent).toBe('Hello world');
    // The read view steps aside rather than being destroyed — Cancel restores
    // it with zero refetch.
    expect((document.querySelector('.docs-viewer-readview') as HTMLElement).hidden).toBe(true);
  });

  it('offers no Edit toggle for a non-Markdown doc — the split preview is a Markdown feature', async () => {
    boot({ files: ['LICENSE'], fileContent: 'MIT License text.' });
    await openDoc();

    expect(document.querySelector('[data-doc-edit-toggle]')).toBeNull();
  });

  it('re-renders the live preview through the same Markdown pipeline as the reader on every keystroke', async () => {
    boot({});
    await openDoc();
    (document.querySelector('[data-doc-edit-toggle]') as HTMLButtonElement).click();
    await settle();

    const textarea = document.querySelector('.docs-editor-textarea') as HTMLTextAreaElement;
    textarea.value = '## Edited heading';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const preview = document.querySelector('.docs-editor-preview');
    expect(preview?.querySelector('h1')).toBeNull();
    expect(preview?.querySelector('h2')?.textContent).toBe('Edited heading');
  });

  it('Cancel discards the draft and restores the read view without saving anything', async () => {
    const fetchMock = boot({});
    await openDoc();
    (document.querySelector('[data-doc-edit-toggle]') as HTMLButtonElement).click();
    await settle();

    (document.querySelector('.docs-editor-textarea') as HTMLTextAreaElement).value = 'discarded';
    (document.querySelector('[data-doc-edit-cancel]') as HTMLButtonElement).click();

    expect(document.querySelector('.docs-editor')).toBeNull();
    expect((document.querySelector('.docs-viewer-readview') as HTMLElement).hidden).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/docs/write'))).toBe(
      false,
    );
  });

  it('Save posts the edited content and reloads the doc from disk on success', async () => {
    const fetchMock = boot({});
    await openDoc();
    (document.querySelector('[data-doc-edit-toggle]') as HTMLButtonElement).click();
    await settle();

    const textarea = document.querySelector('.docs-editor-textarea') as HTMLTextAreaElement;
    textarea.value = '# Edited';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-doc-edit-save]') as HTMLButtonElement).click();
    await settle();
    await settle();

    const writeCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes('/api/docs/write'),
    );
    expect(writeCall).toBeTruthy();
    const [, init] = writeCall as [RequestInfo | URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      project: 'p1',
      path: DOC_PATH,
      content: '# Edited',
    });
    // Success re-fetches reality (the pool-client/pr-review execute
    // convention) instead of trusting the in-memory draft as the new truth.
    expect(document.querySelector('.docs-editor')).toBeNull();
  });

  it('a refused save shows the server-reasoned rejection instead of silently failing', async () => {
    boot({ writeOk: true, writeResult: { ok: false, reason: 'outside the allow-list' } });
    await openDoc();
    (document.querySelector('[data-doc-edit-toggle]') as HTMLButtonElement).click();
    await settle();

    (document.querySelector('[data-doc-edit-save]') as HTMLButtonElement).click();
    await settle();
    await settle();

    expect(document.querySelector('.docs-editor-result')?.textContent).toBe(
      '✗ outside the allow-list',
    );
    // The editor stays open on a refusal — nothing here should discard the
    // operator's draft.
    expect(document.querySelector('.docs-editor')).toBeTruthy();
  });
});
