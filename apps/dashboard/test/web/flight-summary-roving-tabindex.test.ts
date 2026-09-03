// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING follow-on (board web-mtd1wyte-ssntzi): a "Recently
 * shipped" flight-summary line's fields (headline, cost, real-cost,
 * closed-task chip, ago) each claimed their own Tab stop — up to 5 per line,
 * the same per-row multiplier pattern the flight-log rows fixed in d16d901b.
 * Only the headline (always the line's first field) is now a Tab stop; the
 * shared wireRoving() handlers (web/shell.ts, already used by the flight-log
 * and coordination groups) move it with Left/Right/Home/End.
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
  firings: 2,
  shipped: 2,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [{ id: 't1', title: 'Fix the thing', status: 'done' }],
  // f1 carries a closed task AND a real-cost figure — its line renders all
  // five conditional fields (headline, cost, real-cost, closed chip, ago).
  // f2 is the minimal shape (headline, cost, ago), so one fixture covers
  // both the longest and shortest field runs.
  flightLog: [
    {
      id: 'f1',
      shipped: true,
      item: 't1',
      cost: 0.12,
      realCostUsd: 0.05,
      sha: 'abc1234',
      at: Date.now() - 60_000,
      kind: 'fix',
    },
    {
      id: 'f2',
      shipped: true,
      item: null,
      cost: 0.3,
      sha: 'def5678',
      commitSubject: 'chore: tidy up',
      at: Date.now() - 120_000,
      kind: 'chore',
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 2,
    shipped: 2,
    openFindings: 0,
    cost: 0.42,
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

describe('flight-summary lines use a roving Tab stop instead of one per field', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('seeds only the headline as a Tab stop, for the longest and shortest field runs alike', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const lines = Array.from(document.querySelectorAll('.flight-summary-line'));
    expect(lines).toHaveLength(2);

    const fieldRuns = lines.map((line) => Array.from(line.querySelectorAll('[tabindex]')));
    // f1's line carries all five fields, f2's the minimal three.
    expect(fieldRuns.map((fields) => fields.length).sort()).toEqual([3, 5]);
    for (const fields of fieldRuns) {
      expect(fields[0]?.className).toContain('flight-summary-headline');
      expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual([
        '0',
        ...fields.slice(1).map(() => '-1'),
      ]);
    }
  });

  it('moves the roving tab stop with ArrowRight/ArrowLeft/Home/End, never crossing into another line', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const lines = Array.from(document.querySelectorAll('.flight-summary-line'));
    const fields = Array.from(lines[0]!.querySelectorAll('[tabindex]')) as HTMLElement[];
    const [headline, cost] = fields;
    if (!headline || !cost) throw new Error('expected at least headline + cost fields');

    headline.focus();
    headline.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(cost);
    expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      ...fields.slice(2).map(() => '-1'),
    ]);

    cost.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(fields[fields.length - 1]);

    fields[fields.length - 1]!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
    expect(document.activeElement).toBe(headline);

    // The other line's own headline is untouched by this line's roving state.
    const otherHeadline = lines[1]!.querySelector('[tabindex]');
    expect(otherHeadline?.getAttribute('tabindex')).toBe('0');
  });

  it('moves the roving tab stop to whichever field gets mouse/programmatic focus', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const lines = Array.from(document.querySelectorAll('.flight-summary-line'));
    const fields = Array.from(lines[0]!.querySelectorAll('[tabindex]')) as HTMLElement[];
    const ago = fields.find((f) => f.classList.contains('flight-summary-ago'));
    if (!ago) throw new Error('expected an ago field on the line');

    ago.focus();
    expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual(
      fields.map((f) => (f === ago ? '0' : '-1')),
    );
  });
});
