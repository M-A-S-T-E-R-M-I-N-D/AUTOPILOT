// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the LANDING panel's
 * "Execute landing" EXECUTE button — unlike its sibling RELEASE panel EXECUTE
 * button (release-execute-tooltip.test.ts) — had no [data-tip]/aria-label at
 * all, so neither sighted mouse/keyboard users nor screen readers got any
 * explanation of what landing actually does before they clicked the button
 * that runs the gate and merges into the base branch.
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

function bootWithLanding(landing: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/landing')) {
      return { ok: true, json: async () => ({ landing }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('landing EXECUTE button explains itself on hover/focus', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the "Execute landing" button a data-tip matching its aria-label, naming the base branch', async () => {
    bootWithLanding({
      branch: 'autopilot/flight',
      base: 'main',
      commits: [{ shortSha: 'a1b2c3d', subject: 'feat: add landing card', files: ['a.ts'] }],
      diffstat: { filesChanged: 1, insertions: 5, deletions: 1 },
    });

    await vi.waitFor(() => {
      expect(document.querySelector('[data-land-execute]')).not.toBeNull();
    });
    const button = document.querySelector('[data-land-execute]');
    expect(button?.getAttribute('data-tip')).toBeTruthy();
    expect(button?.getAttribute('data-tip')).toBe(button?.getAttribute('aria-label'));
    expect(button?.getAttribute('data-tip')).toContain('main');
  });
});
