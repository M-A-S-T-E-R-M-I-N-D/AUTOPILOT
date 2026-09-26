// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Docs reader panel's live re-render on disk change (epic 0023 "the docs
 * reader" slice 4, board web-mtywp7to-rbebh4, law #1 "Live"): until this
 * slice, `refreshDocsList` skipped an already-open doc on every tick no
 * matter what changed on disk — this is the first regression coverage for
 * the repaint-on-change path (`checkDocLive`/`paintDoc` in
 * `src/web/features/docs-viewer.ts`).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

// Same listener-leak guard docs-viewer-editor.test.ts uses: clientJs() is
// eval'd fresh via `new Function` every test, and each run re-registers its
// own top-level document.addEventListener click delegates that document.open()
// /close() does not clear.
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
  vi.useFakeTimers();
  costBump = 0;
});

afterEach(() => {
  restoreListeners();
  vi.useRealTimers();
  vi.restoreAllMocks();
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
const CONTENT_A = '# Hello world\n\nOriginal body text.';
const CONTENT_B = '# Hello world\n\nEdited on disk by the flight.';

// A tick past REFRESH_MS (3000ms, shell.ts) that also flushes the promise
// chains fetch-based code schedules — the same margin live-render.test.ts uses.
const TICK_MS = 3100;

// shell.ts's renderFleetBody gates the WHOLE per-project rebuild (and so
// docsSection/refreshDocsList/checkDocLive with it) behind a fleet-level
// state signature dirty-check — an identical poll response is a deliberate
// no-op, "the reader is sacred". A real fleet is never that still (workers'
// elapsed clocks, costs, and counts move every tick), so tick() below bumps a
// harmless field each call to mirror that and let a doc-content-only change
// actually reach the docs panel's own check.
let costBump = 0;

function boot(getContent: () => string): ReturnType<typeof vi.fn> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/file')) {
      const requestedPath = new URL(url, 'http://localhost').searchParams.get('path') ?? DOC_PATH;
      return {
        ok: true,
        json: async () => ({
          path: requestedPath,
          content: getContent(),
          touchedAt: null,
          brokenLinks: [],
          linksHere: [],
        }),
      } as unknown as Response;
    }
    if (url.includes('/api/docs')) {
      return { ok: true, json: async () => ({ files: [DOC_PATH] }) } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({
        ...STATE,
        totals: { ...STATE.totals, cost: STATE.totals.cost + costBump },
      }),
    } as unknown as Response;
  });
  globalThis.fetch = fetchMock;
  new Function(clientJs())();
  return fetchMock;
}

async function tick(ms = TICK_MS): Promise<void> {
  costBump += 1; // see the costBump comment above — forces a real fleet-level rebuild
  await vi.advanceTimersByTimeAsync(ms);
}

async function openDoc(): Promise<void> {
  await tick(1);
  (document.querySelector('.docs-list .docs-file') as HTMLButtonElement).click();
  await tick(1);
}

describe('the Docs reader panel live re-render on disk change (epic 0023 slice 4)', () => {
  it('repaints an open doc on a disk change, then clears the diff flash', async () => {
    let content = CONTENT_A;
    boot(() => content);
    await openDoc();
    expect(document.querySelector('.docs-viewer-body')?.textContent).toContain(
      'Original body text.',
    );

    content = CONTENT_B; // "the flight writes debriefs/doctrine while the operator reads"
    await tick();

    expect(document.querySelector('.docs-viewer-body')?.textContent).toContain(
      'Edited on disk by the flight.',
    );
    // The highlight is present right after the repaint...
    expect(document.querySelector('.docs-viewer-diff-flash')).not.toBeNull();
    // ...and gone once its (reduced-motion-safe) cleanup timer elapses.
    await tick(2300);
    expect(document.querySelector('.docs-viewer-diff-flash')).toBeNull();
  });

  it('skips the repaint and flash when the disk content is unchanged', async () => {
    boot(() => CONTENT_A);
    await openDoc();
    const bodyBefore = document.querySelector('.docs-viewer-body');

    await tick();
    await tick();

    // Same node — paintDoc was never called for an identical read.
    expect(document.querySelector('.docs-viewer-body')).toBe(bodyBefore);
    expect(document.querySelector('.docs-viewer-diff-flash')).toBeNull();
  });

  it('skips the live check while editing, never clobbering an unsaved draft', async () => {
    let content = CONTENT_A;
    boot(() => content);
    await openDoc();
    (document.querySelector('[data-doc-edit-toggle]') as HTMLButtonElement).click();
    await tick(1);

    const textarea = document.querySelector('.docs-editor-textarea') as HTMLTextAreaElement;
    textarea.value = 'unsaved draft text';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    content = CONTENT_B; // changes on disk while the operator is mid-edit
    await tick();

    expect((document.querySelector('.docs-editor-textarea') as HTMLTextAreaElement).value).toBe(
      'unsaved draft text',
    );
    expect(document.querySelector('.docs-editor')).not.toBeNull();
  });
});
