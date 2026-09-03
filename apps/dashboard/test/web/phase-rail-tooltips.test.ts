// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the phase-rail buttons (`.phaserail .phase`,
 * the ORIENT/DO/GATE/COMMIT segments with their activity counts) already
 * carried a full `aria-label` but — unlike every other `aria-label`-bearing
 * element in the shell — never got the matching [data-tip] partner, so
 * sighted mouse/keyboard users saw no visible explanation on hover or focus.
 * They now explain themselves like the rest of the shell.
 *
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom) follow-up: the tip
 * text itself only restated the segment's own label ("orient — N activities,
 * toggle detail") without defining what "orient"/"gate" mean as AUTOPILOT
 * flight phases. It now reuses the same OFFICE_TIPS definitions the live
 * office map already shows for these phases.
 *
 * D1 ATTRIBUTE PAYLOAD (epic 0015, web-mtd1wmqc-v7h6cq) follow-up: the
 * aria-label duplicated the full data-tip sentence verbatim, replacing the
 * button's own concise content name (phase name + count). The tip now rides
 * aria-describedby into a visually-hidden sibling span instead.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  tasks: [],
  activity: [
    { tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
    { tool: 'Edit', target: 'src/b.ts', kind: 'file', phase: 'do', at: 2, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
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

describe('phase-rail buttons explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rides each segment tip on aria-describedby instead of duplicating it into aria-label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const segs = Array.from(document.querySelectorAll('.phaserail .phase'));
    expect(segs.length).toBe(4);
    for (const seg of segs) {
      const tip = seg.getAttribute('data-tip');
      expect(tip).toBeTruthy();
      // D1 ATTRIBUTE PAYLOAD (epic 0015): the button's own text (phase name +
      // count) is its accessible name — the tip must ride aria-describedby
      // into a visually-hidden sibling, not duplicate data-tip verbatim into
      // an aria-label that would also clobber the concise content name.
      expect(seg.hasAttribute('aria-label')).toBe(false);
      const descId = seg.getAttribute('aria-describedby');
      expect(descId).toBeTruthy();
      const desc = document.getElementById(descId!);
      expect(desc?.classList.contains('sr-only')).toBe(true);
      expect(desc?.textContent).toBe(tip);
    }
  });

  it('names the phase and its activity count in the tooltip text', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const orient = document.querySelector('.phaserail .phase-orient');
    expect(orient?.getAttribute('data-tip')).toBe(
      'ORIENT — reading repo state before picking work — 1 activity, toggle detail',
    );
    const gate = document.querySelector('.phaserail .phase-gate');
    expect(gate?.getAttribute('data-tip')).toBe(
      'GATE — typecheck + test + build must pass — 0 activities, toggle detail',
    );
  });
});
