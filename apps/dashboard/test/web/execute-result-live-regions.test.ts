// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The remaining execute-result elements are polite live regions — the sweep
 * that follows board ap-mtmpekhi-0 (`issue-triage-result-live-region.test.ts`,
 * itself the twin of f966e48e's `pr-review-result`). Three more panels write
 * an outcome into a plain element AFTER an operator confirm / save click, once
 * focus has long moved on, so a screen-reader user heard nothing when the
 * call landed or failed:
 *
 * - the pool client's `.pool-client-result` (epic 0007 PLATFORM 6/7), written
 *   after the claim confirm dialog;
 * - the release panel's `.release-result`, written after the cut-release
 *   confirm dialog;
 * - the Docs reader editor's `.docs-editor-result` (epic 0023 slice 3),
 *   written when a save is refused or the network fails.
 *
 * The ARCHITECT proposal card's `.control-proposal-status` is deliberately
 * NOT in this sweep: it lives inside `#ask-proposal`, which shell.ts already
 * marks `role="status" aria-live="polite"`, so a nested region there would
 * only double-announce.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

// Each test evals the client bundle afresh and re-registers its top-level
// click delegates; document.open()/close() resets the DOM but not those
// listeners, so without this they would stack across the tests in this file
// (see docs-viewer-editor.test.ts for the full account).
let restoreListeners: () => void = () => {};

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
  rootPath: '/repo/alpha',
  githubRepo: 'example/repo',
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

const POOL_ENTRY = {
  issue: {
    number: 42,
    title: 'Keyboard nav is broken in the fleet table',
    url: 'https://github.com/example/repo/issues/42',
    assignees: [],
  },
  decision: { decision: 'claim', reasoning: 'claiming #42 for octocat' },
};

const RELEASE = {
  tagName: 'v1.2.0',
  currentVersion: '1.2.0',
  plan: { ok: true, bump: 'minor', version: '1.3.0', changelog: '# Changelog' },
};

const DOC_PATH = 'docs/hello.md';

type Route = (url: string, init?: RequestInit) => unknown | undefined;

function boot(page: string, route: Route): void {
  document.open();
  document.write(renderShell(page));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const hit = route(url, init);
    if (hit !== undefined) return hit as Response;
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: null }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

function jsonResponse(status: number, body: unknown): unknown {
  return { ok: status < 400, status, json: async () => body };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function expectPoliteStatus(elm: Element | null | undefined): void {
  expect(elm).not.toBeNull();
  expect(elm?.getAttribute('role')).toBe('status');
  expect(elm?.getAttribute('aria-live')).toBe('polite');
}

describe('the remaining execute-result elements are polite live regions (ap-mtmpekhi-0 sweep)', () => {
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

  afterEach(() => {
    restoreListeners();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pool client: the claim result element announces, and keeps announcing after a failed claim', async () => {
    boot('', (url) => {
      if (url.includes('/api/pool-client/execute')) {
        return jsonResponse(200, {
          decision: POOL_ENTRY.decision,
          commandResults: [{ command: { details: 'assigning #42 to octocat' }, code: 1 }],
        });
      }
      if (url.includes('/api/pool-client')) return jsonResponse(200, { entries: [POOL_ENTRY] });
      return undefined;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-pool-client-execute="42"]')).not.toBeNull();
    });
    const item = document
      .querySelector('[data-pool-client-execute="42"]')
      ?.closest('.pool-client-item');
    const resultEl = item?.querySelector('.pool-client-result');
    expectPoliteStatus(resultEl);

    (document.querySelector('[data-pool-client-execute="42"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(resultEl?.textContent).toBe('✗ assigning #42 to octocat failed (exit 1).');
    });
    // The handler rewrites className and textContent in place — the live-region
    // attributes must survive that write or the announcement never fires.
    expectPoliteStatus(resultEl);
    expect(resultEl?.className).toBe('pool-client-result pool-client-result-fail');
  });

  it('release: the cut-release result element announces, and keeps announcing after a refused cut', async () => {
    boot('p1', (url) => {
      if (url.includes('/api/release/execute')) {
        return jsonResponse(409, {
          ok: false,
          details: 'no release-worthy commits since the last release',
        });
      }
      if (url.includes('/api/release')) return jsonResponse(200, { release: RELEASE });
      return undefined;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-release-execute="p1"]')).not.toBeNull();
    });
    const resultEl = document.querySelector('.release-panel .release-result');
    expectPoliteStatus(resultEl);

    (document.querySelector('[data-release-execute="p1"]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(resultEl?.textContent).toBe('✗ no release-worthy commits since the last release');
    });
    expectPoliteStatus(resultEl);
    expect(resultEl?.className).toBe('release-result release-result-fail');
  });

  it('docs editor: the save result element announces, and keeps announcing after a refused save', async () => {
    boot('p1', (url) => {
      if (url.includes('/api/docs/write')) {
        return jsonResponse(403, { ok: false, reason: 'that path is not under docs/' });
      }
      if (url.includes('/api/file')) {
        return jsonResponse(200, {
          path: DOC_PATH,
          content: '# Hello world\n\nOriginal body text.',
          touchedAt: null,
          brokenLinks: [],
          linksHere: [],
        });
      }
      if (url.includes('/api/docs')) return jsonResponse(200, { files: [DOC_PATH] });
      return undefined;
    });

    await settle();
    (document.querySelector('.docs-list .docs-file') as HTMLButtonElement).click();
    await settle();
    (document.querySelector('[data-doc-edit-toggle]') as HTMLButtonElement).click();
    await settle();

    const resultEl = document.querySelector('[data-doc-edit-result="p1"]');
    expectPoliteStatus(resultEl);

    (document.querySelector('[data-doc-edit-save]') as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(resultEl?.textContent).toBe('✗ that path is not under docs/');
    });
    expectPoliteStatus(resultEl);
  });
});
