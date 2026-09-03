// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The humanized activity feed: each action renders as a plain-language
 * sentence ("Editing a.ts.", "Running the gate: pnpm test.") with a vendored
 * inline SVG icon instead of a raw tool-name badge. Drives the REAL client
 * bundle in jsdom against a mocked /api/state, same pattern as
 * narrator.test.ts and project-page.test.ts.
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

describe('the humanized activity feed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders each action as a plain-language sentence, newest first', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const sentences = Array.from(document.querySelectorAll('.act .act-sentence')).map(
      (n) => n.textContent,
    );
    expect(sentences).toEqual([
      'Editing a.ts.',
      'Reading b.ts.',
      'Searching for "TODO".',
      'Running the gate: pnpm run test.',
      'Committing: git commit -m "x".',
      'Using Task.',
    ]);
  });

  it('gives every row a vendored, decorative inline SVG icon (no external asset)', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const rows = document.querySelectorAll('.act');
    const icons = document.querySelectorAll('.act .act-icon');
    expect(icons).toHaveLength(rows.length);
    icons.forEach((icon) => {
      expect(icon.tagName.toLowerCase()).toBe('svg');
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      // Vendored: built from inline <path>/<circle>/<rect> children, not an
      // external <use> href or background-image reference.
      expect(icon.getAttribute('xlink:href')).toBeNull();
      expect(icon.children.length).toBeGreaterThan(0);
    });
  });

  it('makes the raw tool + full target keyboard-reachable with a tooltip (app-wide interactivity audit)', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const first = document.querySelector('.act .act-sentence') as HTMLElement | null;
    expect(first?.getAttribute('tabindex')).toBe('0');
    expect(first?.getAttribute('data-tip')).toBe('Edit: src/deep/a.ts');
    expect(first?.getAttribute('aria-label')).toBe('Editing a.ts. Edit: src/deep/a.ts');
  });

  it('leaves a targetless action row out of tab order (nothing to explain)', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const last = document.querySelectorAll('.act .act-sentence');
    const targetless = last[last.length - 1] as HTMLElement;
    expect(targetless.textContent).toBe('Using Task.');
    expect(targetless.getAttribute('tabindex')).toBeNull();
    expect(targetless.getAttribute('data-tip')).toBeNull();
  });

  it('does not show the reasoning excerpt in the compact top-level feed', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.act-reason')).toBeNull();
  });

  it('does not show the model/token chip in the compact top-level feed', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.act-meta')).toBeNull();
  });

  it('shows the reasoning excerpt for its own step in the per-firing drill-down', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const toggle = document.querySelector('[data-firing-toggle="f1"]') as HTMLElement | null;
    expect(toggle).not.toBeNull();
    toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    const reasons = Array.from(document.querySelectorAll('.firing-detail .act-reason')).map(
      (n) => n.textContent,
    );
    expect(reasons).toEqual(['Fixing the off-by-one in the paginator.']);
  });

  it('shows a model + token-usage chip for its own step in the per-firing drill-down (MICRO-ACTION TELEMETRY)', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const toggle = document.querySelector('[data-firing-toggle="f1"]') as HTMLElement | null;
    toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.firing-detail .act-meta')).map(
      (n) => n.textContent,
    );
    expect(chips).toEqual(['claude-sonnet-5 · 165 tok']);
  });

  it('makes the model/token chip keyboard-reachable with a tooltip (app-wide interactivity audit)', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const toggle = document.querySelector('[data-firing-toggle="f1"]') as HTMLElement | null;
    toggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.firing-detail .act-meta') as HTMLElement | null;
    // Roving tabindex (D1 TAB-STOP ROVING): the drill-down's first sentence
    // holds the list's single Tab stop; the arrow keys reach this chip
    // (activity-roving-tabindex.test.ts).
    expect(chip?.getAttribute('tabindex')).toBe('-1');
    expect(chip?.getAttribute('data-tip')).toBe('Model and token usage billed for this step');
    expect(chip?.getAttribute('aria-label')).toBe('step cost: claude-sonnet-5 · 165 tok');
  });
});
