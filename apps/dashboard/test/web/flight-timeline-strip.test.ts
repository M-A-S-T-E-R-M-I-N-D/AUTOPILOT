// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLIGHT TIMELINE strip: a per-project horizontal strip in the Metrics detail
 * section, one segment per firing, segment WIDTH proportional to duration_ms
 * (unlike the existing cost sparkline, which encodes value as bar HEIGHT),
 * colored by the same shipped/reverted/checkpointed verdict every other
 * flight-log surface uses, with the shared [data-tip-*] hover/focus tooltip
 * and the existing data-flight-row/-pid click-to-drill wiring.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const FLIGHT_LOG = [
  {
    id: 'f2',
    item: null,
    kind: 'fix',
    sha: 'b2b2b2b',
    shipped: false,
    gateResult: 'reverted',
    cost: 0.3,
    tokensIn: 200,
    tokensOut: 80,
    turns: 9,
    durationMs: 60000,
    commitSubject: 'fix: two',
    completion: null,
    failedCheck: 'test',
    died: null,
    at: 2000,
  },
  {
    id: 'f1',
    item: null,
    kind: 'feat',
    sha: 'a1a1a1a',
    shipped: true,
    gateResult: 'passed',
    cost: 0.1,
    tokensIn: 100,
    tokensOut: 50,
    turns: 4,
    durationMs: 180000,
    commitSubject: 'feat: one',
    completion: 'complete',
    failedCheck: null,
    died: null,
    at: 1000,
  },
];

function projectWith(flightLog: unknown[]) {
  return {
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
    shipped: 1,
    cost: 0.4,
    tokensIn: 300,
    tokensOut: 130,
    turns: 13,
    shipRate: 0.5,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: 1,
    activity: [],
    flightLog,
    tasks: [],
  };
}

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
            shipped: 1,
            openFindings: 0,
            cost: 0.4,
          },
          projects: [projectWith(flightLog)],
          empty: false,
        }),
      }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the FLIGHT TIMELINE strip', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders one segment per firing, sized by relative duration, colored by verdict', async () => {
    vi.useFakeTimers();
    boot(FLIGHT_LOG);
    await vi.advanceTimersByTimeAsync(1);

    const strip = document.querySelector('.timeline-strip');
    expect(strip).toBeTruthy();
    const segments = strip!.querySelectorAll('.spark-bar');
    expect(segments.length).toBe(2);

    // Rendered oldest → newest: f1 (shipped, 180000ms) then f2 (reverted, 60000ms).
    expect(segments[0]!.getAttribute('class')).toContain('spark-shipped');
    expect(segments[1]!.getAttribute('class')).toContain('spark-reverted');

    const w0 = Number(segments[0]!.getAttribute('width'));
    const w1 = Number(segments[1]!.getAttribute('width'));
    expect(w0).toBeGreaterThan(w1); // 180000ms vs 60000ms of the same 240-wide strip
    expect(w0 + w1).toBeCloseTo(240, 5);
  });

  it('carries the shared hover/focus tooltip data (task, cost, turns) and click-to-drill wiring', async () => {
    vi.useFakeTimers();
    boot(FLIGHT_LOG);
    await vi.advanceTimersByTimeAsync(1);

    const segments = document.querySelectorAll('.timeline-strip .spark-bar');
    const reverted = segments[1]!;
    expect(reverted.getAttribute('data-tip-title')).toBe('fix: two');
    expect(reverted.getAttribute('data-tip-verdict')).toBe('reverted — test');
    expect(reverted.getAttribute('data-tip-cost')).toBe('$0.30');
    expect(reverted.getAttribute('data-tip-turns')).toBe('9 turns');
    expect(reverted.getAttribute('data-flight-row')).toBe('f2');
    expect(reverted.getAttribute('data-flight-pid')).toBe('p1');
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only
    // the first segment is a Tab stop, not one per firing — see the
    // dedicated roving-tabindex tests below.
    expect(reverted.getAttribute('tabindex')).toBe('-1');
  });

  it('omits the strip (no fake timeline) when no firing has real duration data', async () => {
    vi.useFakeTimers();
    boot(FLIGHT_LOG.map((f) => ({ ...f, durationMs: null })));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.timeline-strip')).toBeNull();
  });

  it('gives only the first segment a Tab stop, not one per firing (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi)', async () => {
    vi.useFakeTimers();
    boot(FLIGHT_LOG);
    await vi.advanceTimersByTimeAsync(1);

    const segments = Array.from(document.querySelectorAll('.timeline-strip .spark-bar'));
    expect(segments.length).toBe(2);
    expect(segments.map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  it('moves the roving tab stop with ArrowRight/ArrowLeft/Home/End, not a fresh Tab stop per segment', async () => {
    vi.useFakeTimers();
    boot(FLIGHT_LOG);
    await vi.advanceTimersByTimeAsync(1);

    const segments = Array.from(
      document.querySelectorAll('.timeline-strip .spark-bar'),
    ) as unknown as HTMLElement[];
    const [seg0, seg1] = segments;
    if (!seg0 || !seg1) throw new Error('expected 2 timeline segments');

    seg0.focus();
    seg0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(segments.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0']);
    expect(document.activeElement).toBe(seg1);

    seg1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(segments.map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1']);
    expect(document.activeElement).toBe(seg0);

    // ArrowLeft at the first segment clamps instead of wrapping or throwing.
    seg0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(segments.map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1']);
    expect(document.activeElement).toBe(seg0);

    seg0.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(segments.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0']);
    expect(document.activeElement).toBe(seg1);
  });

  it('moves the roving tab stop to whichever segment gets mouse/programmatic focus', async () => {
    vi.useFakeTimers();
    boot(FLIGHT_LOG);
    await vi.advanceTimersByTimeAsync(1);

    const segments = Array.from(
      document.querySelectorAll('.timeline-strip .spark-bar'),
    ) as unknown as HTMLElement[];
    const seg1 = segments[1];
    if (!seg1) throw new Error('expected a second timeline segment');

    seg1.focus();
    expect(segments.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0']);
  });
});
