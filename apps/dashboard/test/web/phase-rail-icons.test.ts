// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Activity panel's phase
 * rail. The live cards' phase pill, the office map's zones and the activity
 * feed's phase rows all draw orient, DO, gate and commit with one shape each
 * (`LIVE_PHASE_ICONS` in `web/shell.ts`), yet the rail's four segment buttons,
 * the same four phases, were bare words over a count.
 *
 * Each segment's name now leads with that phase's icon: `compass`, `pencil`,
 * `shield-check` and `git-commit-horizontal`; nothing is newly vendored. The
 * icon is decorative, so a segment's name stays its phase word and count, and
 * the rail is rebuilt on every render, so a later tick draws the same icons.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

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

const PHASE_ICONS: Record<string, string> = {
  orient: 'compass',
  do: 'pencil',
  gate: 'shield-check',
  commit: 'git-commit-horizontal',
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

function segment(phase: string): HTMLButtonElement {
  return document.querySelector(`.phaserail .phase-${phase}`) as HTMLButtonElement;
}

describe('the phase rail leads each segment with its phase icon', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('draws the live phase pill’s icon before each phase word', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    for (const [phase, icon] of Object.entries(PHASE_ICONS)) {
      expect(ICON_SHAPES[icon], icon).toBeDefined();
      const name = segment(phase).querySelector('.phase-name') as HTMLElement;
      const svg = name.firstElementChild as SVGElement;
      expect(svg.getAttribute('class'), phase).toBe(`icon icon-${icon}`);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.innerHTML).not.toBe('');
      expect(name.textContent).toBe(phase);
    }
  });

  it('keeps each segment’s name its phase word and count', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    expect(segment('orient').textContent).toBe('orient1');
    expect(segment('do').textContent).toBe('do1');
    expect(segment('gate').textContent).toBe('gate0');
    expect(segment('commit').textContent).toBe('commit0');
    expect(segment('orient').hasAttribute('aria-label')).toBe(false);
  });

  it('draws the same icons after a later tick rebuilds the rail', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(10_000);

    for (const [phase, icon] of Object.entries(PHASE_ICONS)) {
      const icons = segment(phase).querySelectorAll('.icon');
      expect(icons, phase).toHaveLength(1);
      expect(icons[0]!.getAttribute('class')).toBe(`icon icon-${icon}`);
    }
  });

  it('sizes and spaces the icon beside the small phase word', () => {
    expect(layoutCss()).toContain('.phase-name > .icon');
  });

  it('stays axe-clean', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();

    const rail = document.querySelector('.phaserail') as Element;
    const results = await axe.run(rail.parentElement as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
