// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the live worker card's callsign chip, phase
 * pill, and tool/target action line used to be plain, unfocusable text — the
 * only unexplained surface left on the card (its narrator, focus-task, and
 * turn/elapsed lines are already prose). They now explain themselves on
 * hover/focus too, like the office map zones and fleet chips already do.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

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

describe('the live worker card explains itself on hover/focus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () =>
            stateWith({
              activity: [
                {
                  tool: 'Bash',
                  target: 'pnpm run test',
                  kind: 'command',
                  phase: 'gate',
                  at: 1,
                  firingId: 'f1',
                  model: 'claude-sonnet-5',
                },
              ],
            }),
        }) as unknown as Response,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes the callsign chip, phase pill, and action spans keyboard-reachable with tooltips, one roving Tab stop', async () => {
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    // D1 TAB-STOP ROVING: the callsign chip is the card's first line, so it
    // is the ONE Tab stop; the phase/tool/target/model lines below sit at -1
    // and are reached with Left/Right/Home/End (live-worker-roving-tabindex.test.ts).
    const callsign = document.querySelector('.live-callsign');
    expect(callsign?.getAttribute('tabindex')).toBe('0');
    expect(callsign?.getAttribute('data-tip')).toBeTruthy();
    expect(callsign?.getAttribute('aria-label')).toContain('firing callsign');

    const phase = document.querySelector('.live-phase-gate');
    expect(phase?.getAttribute('tabindex')).toBe('-1');
    expect(phase?.getAttribute('data-tip')).toContain('GATE');
    expect(phase?.getAttribute('data-tip')).toContain('(current)');
    expect(phase?.getAttribute('aria-label')).toContain('current phase: gate');
    // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label states the current phase
    // concisely — it must not also duplicate data-tip's full descriptive
    // sentence verbatim, the same class of duplication 189137e0/f8779d15/
    // c3c57f5d fixed for the task-chip/search-hit/task-title aria-labels.
    expect(phase?.getAttribute('aria-label')).toBe('current phase: gate');
    expect(phase?.getAttribute('aria-label')).not.toContain('typecheck + test + build must pass');

    const tool = document.querySelector('.act-tool');
    expect(tool?.getAttribute('tabindex')).toBe('-1');
    expect(tool?.getAttribute('data-tip')).toBeTruthy();
    expect(tool?.getAttribute('aria-label')).toBe('tool: Bash');

    const target = document.querySelector('.act-target');
    expect(target?.getAttribute('tabindex')).toBe('-1');
    expect(target?.getAttribute('data-tip')).toBeTruthy();
    expect(target?.getAttribute('aria-label')).toBe('target: pnpm run test');

    const model = document.querySelector('.live-model');
    expect(model?.textContent).toBe('claude-sonnet-5');
    expect(model?.getAttribute('tabindex')).toBe('-1');
    expect(model?.getAttribute('data-tip')).toBeTruthy();
    expect(model?.getAttribute('aria-label')).toBe('model: claude-sonnet-5');
  });

  it('omits the model chip when the firing predates per-step model tracking', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () =>
            stateWith({
              activity: [
                {
                  tool: 'Bash',
                  target: 'pnpm run test',
                  kind: 'command',
                  phase: 'gate',
                  at: 1,
                  firingId: 'f1',
                },
              ],
            }),
        }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.live-model')).toBeNull();
  });

  it('falls back to a generic tip for a phase outside the office map zones', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () =>
            stateWith({
              activity: [
                {
                  tool: 'Grep',
                  target: 'foo',
                  kind: 'search',
                  phase: 'other',
                  at: 1,
                  firingId: 'f1',
                },
              ],
            }),
        }) as unknown as Response,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const phase = document.querySelector('.live-phase-other');
    expect(phase?.getAttribute('data-tip')).toContain('not yet classified');
  });
});
