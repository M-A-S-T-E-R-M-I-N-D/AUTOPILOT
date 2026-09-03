// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING follow-on (board web-mtd1wyte-ssntzi): the LANDING
 * panel gave every field its own unconditional tabindex="0" — three per
 * commit row (sha, subject, files), three on the branch line, one per
 * overlap warning, one per diffstat/debrief chip — the same per-row
 * multiplier pattern the flight-log rows fixed in d16d901b. Each line/row
 * now exposes a single Tab stop seeded on its first field; the shared
 * wireRoving() handlers (web/shell.ts) move it with Left/Right/Home/End
 * and follow mouse/programmatic focus.
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
  // One shipped firing with notable events: renders the flight debrief with
  // its four summary chips, a best line, and a two-chip notable line.
  flightLog: [
    {
      shipped: true,
      gateResult: null,
      died: null,
      cost: 1,
      durationMs: 100,
      guardDenials: 2,
      autoformatRescued: true,
    },
  ],
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

// Two commits that must NOT group (different types, no shared BOARD id), so
// two top-level .landing-commit rows render; two overlaps for the alert list.
const LANDING = {
  branch: 'autopilot/flight',
  base: 'main',
  commits: [
    { shortSha: 'a1b2c3d', subject: 'feat: add landing card', files: ['a.ts', 'b.ts'] },
    { shortSha: 'e5f6a7b', subject: 'docs: explain it', files: ['c.md'] },
  ],
  diffstat: { filesChanged: 3, insertions: 42, deletions: 7 },
  overlaps: [
    { branch: 'autopilot/flight-worktree-p1--fleet-2', files: ['shared.txt'] },
    { branch: 'autopilot/flight-worktree-p1--fleet-4', files: ['other.txt'] },
  ],
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/landing')) {
      return { ok: true, json: async () => ({ landing: LANDING }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

function tabindexes(container: Element, itemSel = '[tabindex]'): (string | null)[] {
  return Array.from(container.querySelectorAll(itemSel)).map((n) => n.getAttribute('tabindex'));
}

describe('LANDING panel lines use a roving Tab stop instead of one per field', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seeds one Tab stop per commit row, branch line, overlap list, and chip line', async () => {
    boot();
    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
      expect(document.querySelector('.flight-debrief-notable')).not.toBeNull();
    });

    const rows = Array.from(document.querySelectorAll('.landing-commit'));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const fields = Array.from(row.querySelectorAll('[tabindex]'));
      expect(fields).toHaveLength(3);
      expect(fields[0]?.className).toContain('landing-commit-sha');
      expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    }

    const branchLine = document.querySelector('.landing-branch');
    expect(branchLine).not.toBeNull();
    const branchFields = Array.from(branchLine!.querySelectorAll('[tabindex]'));
    expect(branchFields[0]?.className).toContain('landing-branch-name');
    expect(branchFields.map((f) => f.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);

    const overlaps = document.querySelector('.landing-overlaps');
    expect(overlaps).not.toBeNull();
    expect(tabindexes(overlaps!)).toEqual(['0', '-1']);

    const diffstat = document.querySelector('.landing-diffstat');
    expect(diffstat).not.toBeNull();
    expect(tabindexes(diffstat!, '.chip')).toEqual(['0', '-1', '-1']);

    const debriefChips = document.querySelector('.flight-debrief-chips');
    expect(debriefChips).not.toBeNull();
    expect(tabindexes(debriefChips!, '.chip')).toEqual(['0', '-1', '-1', '-1']);

    const notable = document.querySelector('.flight-debrief-notable');
    expect(notable).not.toBeNull();
    expect(tabindexes(notable!, '.chip')).toEqual(['0', '-1']);
  });

  it('moves the roving stop with ArrowRight/End/Home, never crossing into another row', async () => {
    boot();
    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });

    const rows = Array.from(document.querySelectorAll('.landing-commit'));
    const fields = Array.from(rows[0]!.querySelectorAll('[tabindex]')) as HTMLElement[];
    const [sha, subject, files] = fields;
    if (!sha || !subject || !files) throw new Error('expected sha + subject + files fields');

    sha.focus();
    sha.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(subject);
    expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);

    subject.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(files);

    // End clamps within THIS row — the second row's own seeded stop is untouched.
    const otherSha = rows[1]!.querySelector('[tabindex]');
    expect(otherSha?.getAttribute('tabindex')).toBe('0');

    files.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(sha);
    expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('moves the roving stop to whichever field gets mouse/programmatic focus', async () => {
    boot();
    await vi.waitFor(() => {
      expect(document.querySelector('.landing-commits')).not.toBeNull();
    });

    const branchLine = document.querySelector('.landing-branch');
    const fields = Array.from(branchLine!.querySelectorAll('[tabindex]')) as HTMLElement[];
    const base = fields.find((f) => f.classList.contains('landing-base-name'));
    if (!base) throw new Error('expected a base-name field on the branch line');

    base.focus();
    expect(fields.map((f) => f.getAttribute('tabindex'))).toEqual(
      fields.map((f) => (f === base ? '0' : '-1')),
    );
  });
});
