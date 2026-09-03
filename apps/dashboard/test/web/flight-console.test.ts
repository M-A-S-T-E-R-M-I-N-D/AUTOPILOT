// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The raw flight CONSOLE (web-msnqqjmd-9bx0wd, headless-surfacing sweep): GET
 * /api/flightlog tailed the flight process's stdout+stderr but had no UI
 * consumer anywhere in the client bundle. These tests drive the REAL served
 * client bundle in jsdom against a URL-aware mocked fetch, verifying the panel
 * stays collapsed (no fetch) until expanded, then lazy-loads exactly once.
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

function bootWithConsoleLines(lines: unknown): { fetchMock: ReturnType<typeof vi.fn> } {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/flightlog')) {
      return { ok: true, json: async () => ({ lines }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  new Function(clientJs())();
  return { fetchMock };
}

describe('the raw flight console panel', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders collapsed and does not fetch /api/flightlog until expanded', async () => {
    const { fetchMock } = bootWithConsoleLines(['line one', 'line two']);

    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });

    const details = document.querySelector('.console-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(document.querySelector('.console-body')?.textContent).toContain('expand to load');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/flightlog'))).toBe(false);
  });

  it('is keyboard-operable and lazy-loads the tail exactly once when expanded', async () => {
    const { fetchMock } = bootWithConsoleLines(['first line', 'second line']);

    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });

    const summary = document.querySelector('.console-title') as HTMLElement;
    expect(summary.tagName).toBe('SUMMARY'); // native disclosure — focusable/keyboard-operable for free
    summary.click();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-lines')).not.toBeNull();
    });
    expect(document.querySelector('.console-lines')?.textContent).toBe('first line\nsecond line');
    // Scoped to THIS project (PARALLEL FLIGHTS 4/6) — not the old global tail.
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/flightlog?project=p1')),
    ).toBe(true);

    const pre = document.querySelector('.console-lines');
    expect(pre?.getAttribute('tabindex')).toBe('0');
    expect(pre?.getAttribute('aria-label')).toContain('2 lines');
    // Sighted mouse/keyboard users get the same explanation as screen readers —
    // the aria-label alone left a hover/focus tooltip missing (web-msm66jlc-gm4oom).
    expect(pre?.getAttribute('data-tip')).toContain('2 lines');

    // Collapse and re-expand — should not re-fetch a second time.
    summary.click();
    summary.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.console-lines')).not.toBeNull();
    });
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes('/api/flightlog'),
    );
    expect(calls).toHaveLength(1);
  });

  it('shows an honest empty state when the log has no lines yet', async () => {
    bootWithConsoleLines([]);

    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });

    (document.querySelector('.console-title') as HTMLElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-body')?.textContent).toContain(
        'No console output yet.',
      );
    });
  });

  it('degrades to an honest unavailable message when the fetch fails', async () => {
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/flightlog')) throw new Error('network down');
      return { ok: true, json: async () => STATE } as unknown as Response;
    });
    new Function(clientJs())();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-panel')).not.toBeNull();
    });
    (document.querySelector('.console-title') as HTMLElement).click();

    await vi.waitFor(() => {
      expect(document.querySelector('.console-body')?.textContent).toContain(
        'Flight console unavailable.',
      );
    });
  });
});
