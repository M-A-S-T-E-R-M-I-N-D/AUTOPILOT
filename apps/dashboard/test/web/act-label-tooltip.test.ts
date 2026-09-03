// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the activity feed's
 * heading rendered as plain, unexplained text — "● live activity" or "last
 * flight — debrief" — with no [data-tip]. "Debrief" is real internal jargon
 * (see activitySection's comment: it means "a recap of the last flight now
 * that nothing is live," not a stuck live view) that a viewer has no way to
 * discover without reading the source.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const BASE_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
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
  tasks: [],
  activity: [
    { tool: 'Read', target: 'src/a.ts', kind: 'file', phase: 'orient', at: 1, firingId: 'f1' },
  ],
};

function stateFor(project: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: project['status'] === 'flying' ? 1 : 0,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [project],
    empty: false,
  };
}

function boot(project: Record<string, unknown>): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  const state = stateFor(project);
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('activity feed heading explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('spells out that "debrief" means a recap, not a live view, when idle', async () => {
    boot({ ...BASE_PROJECT, status: 'idle', flightLog: [{ id: 'f1', at: 1, cost: 0, turns: 1 }] });
    await vi.advanceTimersByTimeAsync(1);

    const label = document.querySelector('.act-label');
    expect(label?.textContent).toBe('last flight — debrief');
    expect(label?.getAttribute('tabindex')).toBe('0');
    expect(label?.getAttribute('data-tip')).toBe(
      'A recap of the last completed firing, not a live view — nothing is flying right now',
    );
    // D1 ATTRIBUTE PAYLOAD (epic 0015): the heading's own text already IS its
    // accessible name — the tip must ride aria-describedby into a
    // visually-hidden sibling, not an aria-label that restates the text and
    // then duplicates data-tip verbatim.
    expect(label?.hasAttribute('aria-label')).toBe(false);
    const descId = label?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    const desc = document.getElementById(descId!);
    expect(desc?.classList.contains('sr-only')).toBe(true);
    expect(desc?.textContent).toBe(
      'A recap of the last completed firing, not a live view — nothing is flying right now',
    );
  });

  it('explains the live badge when a firing is actually in progress', async () => {
    boot({ ...BASE_PROJECT, status: 'flying', flightLog: [] });
    await vi.advanceTimersByTimeAsync(1);

    const label = document.querySelector('.act-label');
    expect(label?.textContent).toBe('● live activity');
    expect(label?.getAttribute('tabindex')).toBe('0');
    expect(label?.getAttribute('data-tip')).toBe(
      'A firing is running right now — this feed updates live as it acts',
    );
    expect(label?.hasAttribute('aria-label')).toBe(false);
    const descId = label?.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)?.textContent).toBe(
      'A firing is running right now — this feed updates live as it acts',
    );
  });
});
