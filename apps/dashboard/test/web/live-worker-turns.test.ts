// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The worker card's live turn counter + elapsed time line. Cost is only known
 * once a firing lands (recordFiring writes it once, at commit time) — this
 * drives the REAL client bundle in jsdom (same pattern as worker-task.test.ts)
 * to prove the card surfaces an honest, explicitly-labeled turn approximation
 * and elapsed duration in the meantime, instead of staying silent on both.
 *
 * It was also the one line in liveWorkerCard without a [data-tip]/aria-label —
 * its siblings (recent-actions count, tool span, target span) all explain
 * themselves on hover+focus, but the "~N turns" approximation didn't say WHY
 * it's approximate (app-wide interactivity audit, web-msm66jlc-gm4oom).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

const BASE_PROJECT = {
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
  lastActivityAt: null,
  // Both rows share the same (model, tokensIn, tokensOut) — the message-level
  // fields a single assistant turn's parallel tool calls both carry — so they
  // collapse into ONE turn, not two.
  activity: [
    {
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      phase: 'gate',
      at: NOW - 125_000,
      firingId: 'f1',
      model: 'sonnet',
      tokensIn: 500,
      tokensOut: 40,
    },
    {
      tool: 'Read',
      target: 'src/a.ts',
      kind: 'file',
      phase: 'orient',
      at: NOW - 130_000,
      firingId: 'f1',
      model: 'sonnet',
      tokensIn: 500,
      tokensOut: 40,
    },
  ],
  flightLog: [],
  tasks: [],
};

function stateWith(project: Record<string, unknown>) {
  return {
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
    projects: [{ ...BASE_PROJECT, ...project }],
    empty: false,
  };
}

describe('the worker card turn + elapsed line', () => {
  let current: ReturnType<typeof stateWith>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => current }) as unknown as Response,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows elapsed time and a distinct-turn count, and says cost is pending', async () => {
    current = stateWith({});
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const line = document.querySelector('.live-worker-turns');
    expect(line?.textContent).toBe('2m 10s elapsed · ~1 turn so far — cost known once it lands');
  });

  it('is keyboard-focusable and explains why the turn count is approximate', async () => {
    current = stateWith({});
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const line = document.querySelector('.live-worker-turns');
    // D1 TAB-STOP ROVING: one Tab stop per live-worker card (its first line);
    // the arrow keys reach this line (live-worker-roving-tabindex.test.ts).
    expect(line?.getAttribute('tabindex')).toBe('-1');
    expect(line?.getAttribute('data-tip')).toContain('adjacent tool calls collapse into one turn');
    expect(line?.getAttribute('aria-label')).toBe(
      '2m 10s elapsed · ~1 turn so far — cost known once it lands',
    );
  });

  it('counts a genuinely distinct turn separately from the collapsed pair', async () => {
    current = stateWith({
      activity: [
        {
          tool: 'Bash',
          target: 'pnpm run test',
          kind: 'command',
          phase: 'gate',
          at: NOW - 5_000,
          firingId: 'f1',
          model: 'sonnet',
          tokensIn: 700,
          tokensOut: 60,
        },
        ...BASE_PROJECT.activity,
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const line = document.querySelector('.live-worker-turns');
    expect(line?.textContent).toContain('~2 turns so far');
  });
});
