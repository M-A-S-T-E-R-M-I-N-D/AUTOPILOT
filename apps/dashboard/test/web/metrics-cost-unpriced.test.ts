// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0036 (provider parity): a Codex or Gemini firing reports no price,
 * and the metrics column stores that null as 0. The project page's Metrics
 * panel read it as free: the cost sparkline's bar and the flight timeline
 * strip's segment both captioned such a firing `$0.00`, and the sparkline's
 * label gave a total with no word of the firings it could not price. Both
 * now read the flight-log entry's `costUnpriced` as the flight log's own
 * cost chip does (`flightCostAgoMeta`).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

function firing(over: Record<string, unknown>): Record<string, unknown> {
  return {
    item: null,
    kind: 'fix',
    shipped: true,
    gateResult: 'passed',
    tokensIn: 100,
    tokensOut: 50,
    turns: 4,
    durationMs: 60000,
    completion: 'complete',
    failedCheck: null,
    died: null,
    ...over,
  };
}

// Newest first, as the flight log is served.
const MIXED_LOG = [
  firing({
    id: 'codex1',
    sha: 'c0dexc0',
    cost: 0,
    costUnpriced: true,
    commitSubject: 'fix: flown on codex',
    at: 2000,
  }),
  firing({
    id: 'claude1',
    sha: 'c1aude1',
    cost: 2,
    commitSubject: 'fix: flown on claude',
    at: 1000,
  }),
];

function boot(flightLog: unknown[]): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({
          generatedAt: 1,
          totals: {
            projects: 1,
            flying: 0,
            needsYou: 0,
            firings: flightLog.length,
            shipped: flightLog.length,
            openFindings: 0,
            cost: 2,
          },
          projects: [
            {
              id: 'p1',
              slug: 'alpha',
              name: 'Alpha',
              status: 'idle',
              createdAt: 1,
              primaryLanguage: 'typescript',
              fileCount: 2,
              totalBytes: 100,
              languages: [],
              topDirs: [],
              hotFiles: [],
              gate: null,
              backedUp: false,
              firings: flightLog.length,
              shipped: flightLog.length,
              cost: 2,
              tokensIn: 200,
              tokensOut: 100,
              turns: 8,
              shipRate: 1,
              openFindings: 0,
              gauge: { critical: 0, high: 0, medium: 0, low: 0 },
              lastActivityAt: 1,
              activity: [],
              flightLog,
              tasks: [],
            },
          ],
          empty: false,
        }),
      }) as unknown as Response,
  );
  new Function(clientJs())();
}

function bars(selector: string): Element[] {
  return Array.from(document.querySelectorAll(selector + ' .spark-bar'));
}

describe('the Metrics panel reads an unpriced firing as unpriced, never $0.00 (epic 0036)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("captions the timeline strip's unpriced segment unpriced, a priced one by its cost", async () => {
    vi.useFakeTimers();
    boot(MIXED_LOG);
    await vi.advanceTimersByTimeAsync(1);

    // Oldest → newest: the Claude firing, then the Codex one.
    const [claude, codex] = bars('.timeline-strip');
    expect(claude!.getAttribute('data-tip-cost')).toBe('$2.00');
    expect(codex!.getAttribute('data-tip-cost')).toBe('unpriced');
    expect(codex!.getAttribute('aria-label')).toContain('unpriced');
    expect(codex!.getAttribute('aria-label')).not.toContain('$0.00');
  });

  it("captions the cost sparkline's unpriced bar unpriced, and its label names the firings left out", async () => {
    vi.useFakeTimers();
    boot(MIXED_LOG);
    await vi.advanceTimersByTimeAsync(1);

    const spark = document.querySelector('.metrics .spark');
    expect(spark).toBeTruthy();
    expect(spark!.getAttribute('aria-label')).toBe(
      'Cost per firing over 2 firings, total $2.00, 1 unpriced left out — tab through bars for detail',
    );
    const [claude, codex] = bars('.metrics .spark');
    expect(claude!.getAttribute('data-tip-cost')).toBe('$2.00');
    expect(codex!.getAttribute('data-tip-cost')).toBe('unpriced');
    expect(codex!.getAttribute('aria-label')).not.toContain('$0.00');
  });

  it('keeps the sparkline label as it was when every firing is priced', async () => {
    vi.useFakeTimers();
    boot([MIXED_LOG[1]]);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.metrics .spark')!.getAttribute('aria-label')).toBe(
      'Cost per firing over 1 firings, total $2.00 — tab through bars for detail',
    );
  });
});
