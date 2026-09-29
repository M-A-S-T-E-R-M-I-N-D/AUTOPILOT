// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The KEEPER ISSUE TRIAGE panel's execute result is a live region (board
 * ap-mtmpekhi-0, twin of `pr-review-result-live-region.test.ts` / f966e48e):
 * the click handler writes the execute outcome — "✓ Ran 3 gh commands.",
 * "✗ 1 of 3 gh command(s) failed — …", the request-failed message — into a
 * `.issue-triage-result` element AFTER the operator's confirm dialog, well
 * after focus has moved on, so without `role="status"`/`aria-live="polite"`
 * a screen-reader user heard nothing when a real batch of `gh` calls landed
 * or failed. Every sibling result element already announces itself this way
 * (`pr-review-result`, `discussions-triage-result`, `landing-result`,
 * `gh-issue-result`), so this closes the one remaining gap in the KEEPER
 * triage surface.
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

const OPEN_ISSUE = {
  issue: { number: 42, title: 'Widget renders blank on load' },
  decision: { decision: 'accept', reasoning: 'No matching open task.' },
};

function boot(executeResponse: { status: number; body: unknown }): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/issue-triage/execute') && init?.method === 'POST') {
      return {
        ok: executeResponse.status < 400,
        status: executeResponse.status,
        json: async () => executeResponse.body,
      } as unknown as Response;
    }
    if (url.includes('/api/social-identity')) {
      return { ok: true, json: async () => ({ identity: null }) } as unknown as Response;
    }
    if (url.includes('/api/issue-triage')) {
      return { ok: true, json: async () => ({ triage: [OPEN_ISSUE] }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
}

describe('KEEPER issue triage execute result is a polite live region (board ap-mtmpekhi-0)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the result element with role="status" and aria-live="polite"', async () => {
    boot({ status: 200, body: { commandResults: [] } });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute]')).not.toBeNull();
    });
    const resultEl = document.querySelector('.issue-triage-result');
    expect(resultEl).not.toBeNull();
    expect(resultEl?.getAttribute('role')).toBe('status');
    expect(resultEl?.getAttribute('aria-live')).toBe('polite');
  });

  it('announces the execute outcome through that same live region after a confirmed run', async () => {
    boot({ status: 500, body: { error: 'gh exploded mid-triage' } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await vi.waitFor(() => {
      expect(document.querySelector('[data-issue-triage-execute="p1"]')).not.toBeNull();
    });
    (document.querySelector('[data-issue-triage-execute="p1"]') as HTMLButtonElement).click();

    const body = document
      .querySelector('[data-issue-triage-execute="p1"]')
      ?.closest('.issue-triage-body');
    const resultEl = body?.querySelector('.issue-triage-result');
    await vi.waitFor(() => {
      expect(resultEl?.textContent).toBe('✗ gh exploded mid-triage');
    });
    // The handler updates the element in place — the live-region semantics
    // must survive the write, or the announcement never fires.
    expect(resultEl?.getAttribute('role')).toBe('status');
    expect(resultEl?.getAttribute('aria-live')).toBe('polite');
    expect(resultEl?.className).toBe('issue-triage-result issue-triage-result-fail');
  });
});
