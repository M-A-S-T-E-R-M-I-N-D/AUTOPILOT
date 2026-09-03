// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the project page's "Per-firing trace" rows
 * (callsign chip, verdict, event count, and relative timestamp) used to be
 * plain, unfocusable text — unlike every other chip/stat around them, which
 * already carries the shared [data-tip] primitive. They now explain
 * themselves on hover/focus too. Since D1 TAB-STOP ROVING (board
 * web-mtd1wyte-ssntzi) only the row's FIRST field (the headline) is a real
 * Tab stop (tabindex="0"); the rest sit at tabindex="-1", reachable with
 * Left/Right/Home/End — see firing-trace-roving-tabindex.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.12,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: Date.now(),
  activity: [
    {
      tool: 'Read',
      target: 'src/index.ts',
      kind: 'file',
      phase: 'orient',
      at: Date.now(),
      firingId: 'p1:firing-1',
    },
    {
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      phase: 'gate',
      at: Date.now(),
      firingId: 'p1:firing-1',
    },
  ],
  tasks: [],
  flightLog: [
    {
      id: 'p1:firing-1',
      item: null,
      kind: 'fix',
      sha: 'abc1234',
      shipped: true,
      gateResult: 'passed',
      cost: 0.12,
      tokensIn: 1000,
      tokensOut: 500,
      turns: 3,
      commitSubject: 'fix: tidy up',
      at: Date.now(),
    },
  ],
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
    cost: 0.12,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the "Per-firing trace" row explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes the headline keyboard-reachable with a tooltip carrying the full text', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const headline = document.querySelector('.firing-headline');
    expect(headline?.getAttribute('tabindex')).toBe('0');
    expect(headline?.getAttribute('data-tip')).toBe('fix: tidy up');
    // D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq): no aria-label
    // duplicating the tip — the full headline rides aria-describedby into a
    // visually-hidden span instead.
    expect(headline?.hasAttribute('aria-label')).toBe(false);
    const descId = headline?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId ?? '');
    expect(desc?.classList.contains('sr-only')).toBe(true);
    expect(desc?.textContent).toBe('fix: tidy up');
    // The desc must NOT sit inside the row button — a button's accessible
    // name is computed from its contents, sr-only text included, so nesting
    // it there would duplicate the headline into the button's name instead.
    expect(desc?.closest('.firing-toggle')).toBeNull();
  });

  it('makes the callsign chip keyboard-reachable and names the firing it stands for', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const callsign = document.querySelector('.firing-callsign');
    expect(callsign?.getAttribute('tabindex')).toBe('-1');
    expect(callsign?.getAttribute('data-tip')).toBe('Radio callsign for p1:firing-1');
    expect(callsign?.getAttribute('aria-label')).toBe('firing: p1:firing-1');
  });

  it('makes the verdict keyboard-reachable and explains how the firing ended', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const verdict = document.querySelector('.flight-verdict');
    expect(verdict?.getAttribute('tabindex')).toBe('-1');
    expect(verdict?.getAttribute('data-tip')).toBe('How this firing ended: shipped');
    expect(verdict?.getAttribute('aria-label')).toBe('verdict: shipped');
  });

  it('makes the event count keyboard-reachable with a tooltip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const count = document.querySelector('.firing-count');
    expect(count?.getAttribute('tabindex')).toBe('-1');
    expect(count?.getAttribute('data-tip')).toBeTruthy();
    expect(count?.textContent).toBe('2 events');
  });

  it('makes the relative timestamp keyboard-reachable with a tooltip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const ago = document.querySelector('.firing-ago');
    expect(ago?.getAttribute('tabindex')).toBe('-1');
    expect(ago?.getAttribute('data-tip')).toBe('When this firing started');
    expect(ago?.getAttribute('aria-label')).toContain('started');
  });

  it('does not render a redundancy chip when no tool+target call repeats (the common, clean case)', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.firing-redundancy')).toBeNull();
  });

  it('surfaces a keyboard-reachable redundancy chip when a firing repeats the same tool+target call — trajectory-level eval', async () => {
    const redundantProject = {
      ...PROJECT,
      activity: [
        ...PROJECT.activity,
        {
          tool: 'Read',
          target: 'src/index.ts',
          kind: 'file',
          phase: 'orient',
          at: Date.now(),
          firingId: 'p1:firing-1',
        },
      ],
    };
    const state = {
      ...STATE,
      totals: { ...STATE.totals, firings: 2 },
      projects: [redundantProject],
    };
    document.open();
    document.write(renderShell('p1'));
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => state }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.firing-redundancy');
    expect(chip?.textContent).toBe('⟲ 1 repeated');
    expect(chip?.getAttribute('tabindex')).toBe('-1');
    expect(chip?.getAttribute('data-tip')).toContain('trajectory-quality signal');
    expect(chip?.getAttribute('aria-label')).toBe('trajectory: ⟲ 1 repeated');
  });
});
