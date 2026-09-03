// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING follow-on (board web-mtd1wyte-ssntzi): a flight-log
 * row's header fields (verdict dot, headline, slice/auto-fixed/guard chips,
 * sha, cost, real-cost, ago) used to each claim their own Tab stop — the
 * measured 25.0 stops/flight-log row (cockpit-metrics.mjs, 08-28), the
 * biggest per-row multiplier the follow-on found. An expanded group row's
 * members repeated the same pattern per member. Only the first field in each
 * row/member is now a Tab stop; the shared wireRoving() handlers (web/
 * shell.ts, already used by the gauge/langbar/task-chip groups) move it with
 * Left/Right/Home/End.
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
  firings: 3,
  shipped: 3,
  cost: 0.5,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [{ id: 'epic1', title: 'Ship the whole galaxy feature', status: 'in_progress' }],
  // f2/f1 are consecutive slices of the same open task — they collapse into
  // one expandable .flight-group row with two .flight-group-member entries.
  // f0 is unrelated and stays a plain .flight row, giving one fixture that
  // covers both roving-group shapes (header + member).
  flightLog: [
    {
      id: 'f2',
      shipped: true,
      item: 'epic1',
      completion: 'slice',
      commitSubject: 'feat: galaxy renderer draws the second moon',
      cost: 0.2,
      sha: 'sha0002',
      at: Date.now() - 10_000,
      kind: 'feat',
    },
    {
      id: 'f1',
      shipped: true,
      item: 'epic1',
      completion: 'slice',
      commitSubject: 'feat: galaxy renderer draws the first moon',
      cost: 0.2,
      sha: 'sha0001',
      at: Date.now() - 20_000,
      kind: 'feat',
    },
    {
      id: 'f0',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'chore: unrelated cleanup',
      cost: 0.1,
      sha: 'sha0000',
      at: Date.now() - 30_000,
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
    firings: 3,
    shipped: 3,
    openFindings: 0,
    cost: 0.5,
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

describe('flight-log rows use a roving Tab stop instead of one per field', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('seeds only the first header field as a Tab stop, for a plain row and a group row alike', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.className).toContain('flight-group'); // f2/f1 collapsed

    for (const row of rows) {
      const fields = Array.from(row!.querySelector('.flight-head')!.querySelectorAll('[tabindex]'));
      expect(fields.length).toBeGreaterThan(1); // dot + at least item/cost/ago
      expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual([
        '0',
        ...fields.slice(1).map(() => '-1'),
      ]);
    }
  });

  it('moves the header roving tab stop with ArrowRight/ArrowLeft/Home/End, never crossing into another row', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    const groupFields = Array.from(
      rows[0]!.querySelector('.flight-head')!.querySelectorAll('[tabindex]'),
    ) as HTMLElement[];
    const [dot, item] = groupFields;
    if (!dot || !item) throw new Error('expected at least dot + item fields on the group header');

    dot.focus();
    dot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(item);
    expect(groupFields.map((f) => f.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      ...groupFields.slice(2).map(() => '-1'),
    ]);

    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(dot);

    // The plain row's own header is untouched by the group row's roving state.
    const plainDot = rows[1]!.querySelector('.flight-head [tabindex]');
    expect(plainDot?.getAttribute('tabindex')).toBe('0');
  });

  it('moves the header roving tab stop to whichever field gets mouse/programmatic focus', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const rows = Array.from(document.querySelectorAll('.flightlog > li'));
    const fields = Array.from(
      rows[1]!.querySelector('.flight-head')!.querySelectorAll('[tabindex]'),
    ) as HTMLElement[];
    const cost = fields.find((f) => f.classList.contains('flight-cost'));
    if (!cost) throw new Error('expected a cost field on the plain row');

    cost.focus();
    expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual(
      fields.map((f) => (f === cost ? '0' : '-1')),
    );
  });

  it('seeds and roves each expanded group member independently, scoped per member', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('.flight-group .flight-head') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);

    const members = Array.from(document.querySelectorAll('.flight-group-member'));
    expect(members).toHaveLength(2);
    const memberFields = members.map(
      (m) => Array.from(m.querySelectorAll('[tabindex]')) as HTMLElement[],
    );
    for (const fields of memberFields) {
      expect(fields.length).toBeGreaterThan(1);
      expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual([
        '0',
        ...fields.slice(1).map(() => '-1'),
      ]);
    }

    // Moving member 0's roving stop leaves member 1's untouched.
    const [m0dot, m0item] = memberFields[0]!;
    if (!m0dot || !m0item) throw new Error('expected at least dot + item on the first member');
    m0dot.focus();
    m0dot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(m0item);
    expect(memberFields[1]!.map((f) => f.getAttribute('tabindex'))).toEqual([
      '0',
      ...memberFields[1]!.slice(1).map(() => '-1'),
    ]);

    await vi.advanceTimersByTimeAsync(5000);
  });
});
