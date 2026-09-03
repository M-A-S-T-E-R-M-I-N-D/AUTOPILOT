// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the detail panel
 * stacks two activity-shaped sections back to back — "Activity" (the last
 * flight's raw feed) and "Per-firing trace" (every firing, grouped and
 * collapsible) — with zero explanation of how they differ. "Trace" is also
 * genuine jargon on its own. Give the header the same tabindex/data-tip/
 * aria-label wiring the "Hot files" header already carries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
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
  lastActivityAt: 1,
  flightLog: [],
  tasks: [],
  activity: [
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 2, firingId: 'f1' },
    {
      tool: 'Bash',
      target: 'git commit -m "x"',
      kind: 'command',
      phase: 'commit',
      at: 1,
      firingId: 'f1',
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
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

describe('detail panel per-firing trace header', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('explains how it differs from the Activity feed above it, on hover/focus', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const headings = Array.from(document.querySelectorAll('.detail-h'));
    const traceHeading = headings.find((h) => h.textContent === 'Per-firing trace');
    expect(traceHeading).toBeTruthy();
    expect(traceHeading?.getAttribute('tabindex')).toBe('0');
    expect(traceHeading?.getAttribute('data-tip')).toBe(
      'Every firing for this project, grouped and collapsible — unlike Activity above, which only shows the raw feed of the last flight',
    );
    expect(traceHeading?.getAttribute('aria-label')).toBe(
      'Per-firing trace: every firing for this project, grouped and collapsible, unlike the Activity feed above which only shows the last flight',
    );
  });

  it('leaves the Activity header above it untouched (self-explanatory, no tooltip)', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const headings = Array.from(document.querySelectorAll('.detail-h'));
    const activityHeading = headings.find((h) => h.textContent === 'Activity');
    expect(activityHeading).toBeTruthy();
    expect(activityHeading?.getAttribute('data-tip')).toBeNull();
  });
});
