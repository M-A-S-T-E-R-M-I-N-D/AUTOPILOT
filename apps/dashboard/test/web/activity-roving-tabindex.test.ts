// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING follow-on (board web-mtd1wyte-ssntzi): the humanized
 * activity feed gave every action row its own Tab stop — one per tool call in
 * the project page's compact debrief feed, one per row in a phase's "inside
 * orient/do/gate/commit" drill-down, and up to TWO per row (the sentence plus
 * its step-cost meta chip) in the per-firing trace drill-down. A firing with
 * fifty tool calls was fifty-plus Tab presses before the next panel.
 *
 * Every `.activity` list is now ONE roving group: only its first tip-carrying
 * field is a Tab stop and the shared wireRoving() handlers move it with
 * Left/Right/Home/End and follow mouse/programmatic focus, clamped at the
 * list's rim so arrows never walk into the flight map, the phase rail, or a
 * neighboring list. Rows with nothing to explain (no target) stay out of the
 * tab order entirely, exactly as before.
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
    {
      tool: 'Edit',
      target: 'src/deep/a.ts',
      kind: 'file',
      phase: 'do',
      at: 6,
      firingId: 'f1',
      reasoning: 'Fixing the off-by-one in the paginator.',
      model: 'claude-sonnet-5',
      tokensIn: 120,
      tokensOut: 45,
    },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 5, firingId: 'f1' },
    { tool: 'Grep', target: 'TODO', kind: 'search', phase: 'orient', at: 4, firingId: 'f1' },
    {
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      phase: 'gate',
      at: 3,
      firingId: 'f1',
    },
    {
      tool: 'Bash',
      target: 'git commit -m "x"',
      kind: 'command',
      phase: 'commit',
      at: 2,
      firingId: 'f1',
    },
    { tool: 'Task', target: '', kind: 'other', phase: 'do', at: 1, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

async function bootAndPaint(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
}

function all(sel: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel)) as HTMLElement[];
}

function tabindexes(items: Element[]): (string | null)[] {
  return items.map((i) => i.getAttribute('tabindex'));
}

function seeded(items: Element[]): (string | null)[] {
  return items.map((_, i) => (i === 0 ? '0' : '-1'));
}

function onlyAt(items: Element[], stop: Element): (string | null)[] {
  return items.map((i) => (i === stop ? '0' : '-1'));
}

function key(target: Element, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

function click(sel: string): void {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) throw new Error('expected ' + sel + ' to render');
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

/** The compact debrief feed — the `.activity` list that is a DIRECT child of
 *  the Activity panel wrap (a phase drill-down's `.phase-acts` list sits one
 *  level deeper, inside its `.phase-detail`). */
const FEED = '.act-wrap > .activity';

describe('the activity feed uses one roving Tab stop per list instead of one per row', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('seeds only the first sentence of the compact feed as a Tab stop; targetless rows stay out of tab order', async () => {
    await bootAndPaint();

    const stops = all(FEED + ' [tabindex]');
    // Six rows, five with a target to explain — "Using Task." has none.
    expect(stops).toHaveLength(5);
    expect(stops.every((s) => s.classList.contains('act-sentence'))).toBe(true);
    expect(tabindexes(stops)).toEqual(seeded(stops));

    const sentences = all(FEED + ' .act-sentence');
    const targetless = sentences[sentences.length - 1];
    expect(targetless?.textContent).toBe('Using Task.');
    expect(targetless?.getAttribute('tabindex')).toBeNull();
  });

  it('moves the feed stop with ArrowRight/ArrowLeft/Home/End, clamped at the list rim, and follows focus', async () => {
    await bootAndPaint();

    const stops = all(FEED + ' [tabindex]');
    const [first, second] = stops;
    const last = stops[stops.length - 1];
    if (!first || !second || !last) throw new Error('expected the activity feed to render');

    first.focus();
    key(first, 'ArrowRight');
    expect(document.activeElement).toBe(second);
    expect(tabindexes(stops)).toEqual(onlyAt(stops, second));

    key(second, 'End');
    expect(document.activeElement).toBe(last);
    key(last, 'ArrowRight');
    expect(document.activeElement).toBe(last);

    key(last, 'Home');
    expect(document.activeElement).toBe(first);
    key(first, 'ArrowLeft');
    expect(document.activeElement).toBe(first);

    // Mouse/programmatic focus re-seeds the group where the user landed.
    last.focus();
    expect(tabindexes(stops)).toEqual(onlyAt(stops, last));
  });

  it('never leaks the feed stop into the flight map or the flight map stop into the feed', async () => {
    await bootAndPaint();

    const stops = all(FEED + ' [tabindex]');
    const fnodes = all('.flightmap .fnode');
    const last = stops[stops.length - 1];
    const [fnode0, fnode1] = fnodes;
    if (!last || !fnode0 || !fnode1) throw new Error('expected the feed and flight map to render');

    last.focus();
    key(last, 'ArrowRight');
    expect(document.activeElement).toBe(last);
    expect(tabindexes(fnodes)).toEqual(seeded(fnodes));

    fnode0.focus();
    key(fnode0, 'ArrowRight');
    expect(document.activeElement).toBe(fnode1);
    // Walking the flight map left the feed's stop where focus last landed
    // (its last row, above) — Tabbing back returns there, not to row one.
    expect(tabindexes(stops)).toEqual(onlyAt(stops, last));
  });

  it('seeds the per-firing trace drill-down as one group spanning sentences AND step-cost meta chips', async () => {
    await bootAndPaint();
    click('[data-firing-toggle="f1"]');
    await vi.advanceTimersByTimeAsync(1);

    const stops = all('.firing-detail [tabindex]');
    // Five sentences with a target plus the Edit step's model/token chip.
    expect(stops).toHaveLength(6);
    expect(tabindexes(stops)).toEqual(seeded(stops));

    const [sentence, meta, nextSentence] = stops;
    if (!sentence || !meta || !nextSentence)
      throw new Error('expected the trace drill-down to render');
    expect(sentence.classList.contains('act-sentence')).toBe(true);
    expect(meta.classList.contains('act-meta')).toBe(true);
    expect(nextSentence.classList.contains('act-sentence')).toBe(true);

    // ArrowRight walks sentence -> its own meta chip -> the next row's sentence.
    sentence.focus();
    key(sentence, 'ArrowRight');
    expect(document.activeElement).toBe(meta);
    key(meta, 'ArrowRight');
    expect(document.activeElement).toBe(nextSentence);
    expect(tabindexes(stops)).toEqual(onlyAt(stops, nextSentence));

    // The compact feed above is its own group — untouched by the drill-down walk.
    const feedStops = all(FEED + ' [tabindex]');
    expect(tabindexes(feedStops)).toEqual(seeded(feedStops));
  });

  it('seeds a phase drill-down list separately from the compact feed', async () => {
    await bootAndPaint();
    click('[data-phase-toggle="orient"]');
    await vi.advanceTimersByTimeAsync(1);

    const phaseStops = all('.phase-acts [tabindex]');
    // Read b.ts and Grep TODO are the two orient-phase actions.
    expect(phaseStops).toHaveLength(2);
    expect(tabindexes(phaseStops)).toEqual(seeded(phaseStops));

    const [phaseFirst, phaseSecond] = phaseStops;
    if (!phaseFirst || !phaseSecond) throw new Error('expected the phase drill-down to render');
    phaseFirst.focus();
    key(phaseFirst, 'ArrowRight');
    expect(document.activeElement).toBe(phaseSecond);
    // Clamped: the phase list's last row never walks on into the compact feed.
    key(phaseSecond, 'ArrowRight');
    expect(document.activeElement).toBe(phaseSecond);

    const feedStops = all(FEED + ' [tabindex]');
    expect(feedStops).toHaveLength(5);
    expect(tabindexes(feedStops)).toEqual(seeded(feedStops));
  });
});
