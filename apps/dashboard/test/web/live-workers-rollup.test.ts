// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Fleet-wide "who works on what" rollup (backlog `web-mssn106m-bqvxi8`,
 * fourth slice): `web/stat-tiles.ts`'s `liveWorkerItems` is only a real
 * feature once it has a keyboard-reachable, self-explaining expression on
 * the fleet header — this is that expression's regression test, mirroring
 * `model-mix-panel.test.ts`'s boot()/query pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const IDLE_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
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
  lastActivityAt: null,
  activity: [],
  flightLog: [],
  tasks: [],
};

function flyingProject(id: string, name: string, model: string | null) {
  return {
    ...IDLE_PROJECT,
    id,
    slug: name.toLowerCase(),
    name,
    status: 'flying',
    activity: [
      {
        tool: 'Bash',
        target: 'pnpm run test',
        kind: 'command',
        phase: 'gate',
        at: 1,
        firingId: 'f-' + id,
        model,
      },
    ],
  };
}

/** A project running TWO concurrent worktree lanes at once — board
 *  web-mtbp0t86-rnimyi, "fleet cockpit shows 1 pilot for 8 lanes": each
 *  lane is a distinct `firingId` within the same project's activity window. */
function multiLaneFlyingProject(id: string, name: string) {
  return {
    ...IDLE_PROJECT,
    id,
    slug: name.toLowerCase(),
    name,
    status: 'flying',
    activity: [
      {
        tool: 'Bash',
        target: 'pnpm run test',
        kind: 'command',
        phase: 'gate',
        at: 2,
        firingId: 'f-' + id + '-1',
        model: 'claude-sonnet-5',
      },
      {
        tool: 'Edit',
        target: 'src/index.ts',
        kind: 'file',
        phase: 'do',
        at: 1,
        firingId: 'f-' + id + '-2',
        model: 'claude-opus-4-8',
      },
    ],
  };
}

function stateWith(projects: unknown[]) {
  return {
    generatedAt: 1,
    totals: {
      projects: projects.length,
      flying: projects.filter((p) => (p as { status: string }).status === 'flying').length,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects,
    empty: false,
  };
}

function boot(state: unknown): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the fleet-wide "who works on what" rollup', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders one keyboard-reachable chip per currently-flying project', async () => {
    boot(
      stateWith([
        flyingProject('p1', 'Alpha', 'claude-sonnet-5'),
        { ...IDLE_PROJECT, id: 'p2', name: 'Bravo' },
        flyingProject('p3', 'Charlie', null),
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);

    const section = document.getElementById('live-workers');
    expect(section?.hidden).toBe(false);

    const chips = Array.from(document.querySelectorAll('.live-worker-chip'));
    expect(chips.map((c) => c.textContent)).toEqual(['Alpha · claude-sonnet-5', 'Charlie']);
    for (const chip of chips) {
      expect(chip.getAttribute('data-tip')).toBeTruthy();
      expect(chip.getAttribute('aria-label')).toBeTruthy();
    }
    // Roving tabindex (board web-mtd1wyte-ssntzi): only ONE chip is a real Tab
    // stop at a time — the rest are reachable via arrow keys, not a fresh Tab
    // press each, so the strip stops adding one stop per lane.
    expect(chips[0]?.getAttribute('tabindex')).toBe('0');
    expect(chips[1]?.getAttribute('tabindex')).toBe('-1');
    expect(chips[0]?.getAttribute('aria-label')).toBe(
      'flying now: Alpha, model claude-sonnet-5, phase gate',
    );
    expect(chips[1]?.getAttribute('aria-label')).toBe('flying now: Charlie, phase gate');
  });

  it('moves the roving tab stop with ArrowRight/ArrowLeft/Home/End, not a fresh Tab stop per chip', async () => {
    boot(
      stateWith([
        flyingProject('p1', 'Alpha', 'claude-sonnet-5'),
        flyingProject('p2', 'Bravo', null),
        flyingProject('p3', 'Charlie', null),
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.live-worker-chip')) as HTMLElement[];
    expect(chips.map((c) => c.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const [chip0, chip1, chip2] = chips;
    if (!chip0 || !chip1 || !chip2) throw new Error('expected 3 chips');

    chip0.focus();
    chip0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(chips.map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(document.activeElement).toBe(chip1);

    chip1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(chips.map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(document.activeElement).toBe(chip2);

    chip2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(chips.map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(document.activeElement).toBe(chip1);

    chip1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(chips.map((c) => c.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(document.activeElement).toBe(chip0);

    // ArrowLeft at the first chip / ArrowRight at the last chip clamps instead
    // of wrapping or throwing.
    chip0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(chips.map((c) => c.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(document.activeElement).toBe(chip0);
  });

  it('clamps the roving tab stop when a lane finishes and the strip shrinks on the next poll', async () => {
    boot(
      stateWith([
        flyingProject('p1', 'Alpha', 'claude-sonnet-5'),
        flyingProject('p2', 'Bravo', null),
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);
    let chips = Array.from(document.querySelectorAll('.live-worker-chip')) as HTMLElement[];
    // Mouse/programmatic focus moves the roving tab stop too, not just arrow
    // keys (APG recommendation) — focusing chip 1 directly exercises that path.
    const chip1 = chips[1];
    if (!chip1) throw new Error('expected 2 chips');
    chip1.focus();
    expect(chip1.getAttribute('tabindex')).toBe('0');
    expect(chips[0]?.getAttribute('tabindex')).toBe('-1');

    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => stateWith([flyingProject('p1', 'Alpha', 'claude-sonnet-5')]),
        }) as unknown as Response,
    );
    await vi.advanceTimersByTimeAsync(10000);

    chips = Array.from(document.querySelectorAll('.live-worker-chip')) as HTMLElement[];
    expect(chips.length).toBe(1);
    expect(chips[0]?.getAttribute('tabindex')).toBe('0');
  });

  it('renders one chip per concurrent lane, not one per project (board web-mtbp0t86-rnimyi)', async () => {
    boot(stateWith([multiLaneFlyingProject('p1', 'Alpha')]));
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.live-worker-chip'));
    expect(chips.length).toBe(2);
    for (const chip of chips) {
      expect(chip.getAttribute('data-tip')).toBeTruthy();
      expect(chip.getAttribute('aria-label')).toBeTruthy();
    }
    expect(chips[0]?.getAttribute('tabindex')).toBe('0');
    expect(chips[1]?.getAttribute('tabindex')).toBe('-1');
    // Both lanes are on the same project, so the callsign disambiguates each
    // chip's text/aria-label instead of rendering two identical "Alpha" chips.
    const labels = chips.map((c) => c.getAttribute('aria-label'));
    expect(new Set(labels).size).toBe(2);
    expect(labels.every((l) => l?.startsWith('flying now: Alpha ('))).toBe(true);
  });

  it('hides the section entirely when nothing is flying', async () => {
    boot(stateWith([{ ...IDLE_PROJECT, id: 'p2', name: 'Bravo' }]));
    await vi.advanceTimersByTimeAsync(1);

    const section = document.getElementById('live-workers');
    expect(section?.hidden).toBe(true);
    expect(document.querySelectorAll('.live-worker-chip').length).toBe(0);
  });
});
