// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0018 "calm cockpit" slice 1 (docs/epics/0018-calm-cockpit.md), LAYOUT
 * STABILITY LAW "repaint only on value change": the fleet GRID already keys
 * its `renderCard(c, fleetCardStates[id])` call off a persisted per-project
 * state so a section (head/meta/worker/office/stats/gauge/actions) is only
 * rebuilt when ITS OWN diff signature changes (`card-sections.ts`'s
 * `cardSectionSigs`) — that is the fix the "Fixes the live-blink bug" comment
 * there describes. The per-project INSIDE page (`renderProjectPage`'s
 * `card(c)`) never got the same treatment: `card()` always called
 * `renderCard(c, null)`, so `prev` was permanently null and EVERY section —
 * including the anomaly/guard-denial chip badges in `cardHead` and the
 * live-worker "lag" chip in `liveWorkerCard` — was torn down and rebuilt
 * from scratch on every tick, even a tick where nothing about THIS project
 * changed (only some other project, or an unrelated totals field, moved).
 * That is the literal "detected-lag chip, near-miss/guard chips ... repaint
 * identical facts" blinking the operator's pain report names.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 1,
      shipped: 1,
      openFindings: 0,
      cost: 0.1,
    },
    projects: [
      {
        id: 'p1',
        slug: 'alpha',
        name: 'Alpha',
        status: 'flying',
        createdAt: 1,
        fileCount: 2,
        totalBytes: 100,
        languages: [{ language: 'typescript', files: 2, bytes: 100 }],
        topDirs: [],
        hotFiles: [],
        gate: 'js · vitest run',
        backedUp: true,
        firings: 1,
        shipped: 1,
        cost: 0.1,
        tokensIn: 10,
        tokensOut: 5,
        shipRate: 1,
        openFindings: 0,
        gauge: { critical: 0, high: 0, medium: 0, low: 0 },
        lastActivityAt: 1,
        flightLog: [],
        activity: [],
        tasks: [],
        anomalies: [{ kind: 'near-miss-recurring', evidence: 'flaky retry observed twice' }],
        ...overrides,
      },
    ],
    empty: false,
  };
}

describe('project page card section reuse across ticks (epic 0018 slice 1)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the same anomaly chip DOM node when a later tick leaves this project untouched', async () => {
    vi.useFakeTimers();
    const state = makeState();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => state }) as unknown as Response,
    );
    document.open();
    document.write(renderShell('p1'));
    document.close();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.card-head .chip-anomaly');
    expect(chip).not.toBeNull();

    // A totally unrelated field changes (another project's count) so the
    // whole-fleet dirty check still fires renderProjectPage — but nothing
    // about p1's own head section (id/name/status/anomalies/soulReviewed)
    // moved, so its chip must survive as the SAME node.
    state.totals.firings = 2;
    await vi.advanceTimersByTimeAsync(3000);

    const chipAfter = document.querySelector('.card-head .chip-anomaly');
    expect(chipAfter).toBe(chip);
  });

  it('rebuilds the anomaly chip once the anomaly actually changes', async () => {
    vi.useFakeTimers();
    const state = makeState();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => state }) as unknown as Response,
    );
    document.open();
    document.write(renderShell('p1'));
    document.close();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.card-head .chip-anomaly')?.textContent).toBe(
      '🩹 recurring near-miss',
    );

    state.projects[0]!.anomalies = [{ kind: 'guard-denial', evidence: 'blocked a write' }];
    await vi.advanceTimersByTimeAsync(3000);

    expect(document.querySelector('.card-head .chip-anomaly')?.textContent).toBe('🛡️ guard denial');
  });
});
