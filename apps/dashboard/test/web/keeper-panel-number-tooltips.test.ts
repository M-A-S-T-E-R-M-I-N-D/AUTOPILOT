// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the KEEPER
 * issue-triage panel's `.issue-triage-number` chip and the KEEPER PR-review
 * panel's `.pr-review-number` chip — both plain "#N" text sitting right next
 * to their fully-tipped decision badge (`tipChip`) — carried no
 * [data-tip]/aria-label/tabindex of their own, so hovering or focusing the
 * bare number told you nothing about which issue/PR it was.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
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
    flying: 0,
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
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/issue-triage')) {
      return {
        ok: true,
        json: async () => ({
          triage: [
            {
              issue: { number: 42, title: 'Widget renders blank on load' },
              decision: { decision: 'accept', reasoning: 'No matching open task.' },
            },
          ],
        }),
      } as unknown as Response;
    }
    if (url.includes('/api/pr-review')) {
      return {
        ok: true,
        json: async () => ({
          plans: [
            {
              pr: { number: 7, title: 'Fix widget blank render' },
              decision: { decision: 'merge', reasoning: 'Gate green, fixes #42.' },
            },
          ],
        }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('KEEPER panel #number chips explain themselves on hover/focus', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the issue-triage #number chip a tabindex, data-tip, and aria-label', async () => {
    boot();

    await vi.waitFor(() => {
      expect(document.querySelector('.issue-triage-number')).not.toBeNull();
    });
    const numberEl = document.querySelector('.issue-triage-number');
    expect(numberEl?.textContent).toBe('#42');
    expect(numberEl?.getAttribute('tabindex')).toBe('0');
    expect(numberEl?.getAttribute('data-tip')).toContain('42');
    expect(numberEl?.getAttribute('data-tip')).toContain('Widget renders blank on load');
    expect(numberEl?.getAttribute('aria-label')).toContain('42');
  });

  it('gives the pr-review #number chip a tabindex, data-tip, and aria-label', async () => {
    boot();

    await vi.waitFor(() => {
      expect(document.querySelector('.pr-review-number')).not.toBeNull();
    });
    const numberEl = document.querySelector('.pr-review-number');
    expect(numberEl?.textContent).toBe('#7');
    expect(numberEl?.getAttribute('tabindex')).toBe('0');
    expect(numberEl?.getAttribute('data-tip')).toContain('7');
    expect(numberEl?.getAttribute('data-tip')).toContain('Fix widget blank render');
    expect(numberEl?.getAttribute('aria-label')).toContain('7');
  });
});
