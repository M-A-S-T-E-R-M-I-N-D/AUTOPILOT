// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the live worker card's "N recent action(s) seen"
 * and "elapsed · ~N turn(s) so far" line math (`web/live-progress.ts`) —
 * extracted under epic 0002 "shell decomposition", slice 2, forty-second cut.
 * `live-worker-count-tooltip.test.ts` and `live-worker-turns.test.ts` already
 * exercise these branches indirectly through the real client bundle; these
 * tests cover the same branches directly, without DOM.
 *
 * `liveWorkerHeadMeta` coverage was added under the sixty-third cut —
 * `live-worker-tooltips.test.ts` already exercises both the callsign and
 * model chip branches indirectly through the real client bundle, but only
 * asserts the tip is truthy and the aria-label contains/equals a substring,
 * never the callsign chip's full tip text.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  liveWorkerCountLabel,
  liveWorkerTurnLabel,
  liveWorkerHeadMeta,
  orientFixationChipMeta,
} from '../../src/web/live-progress.js';
import { fmtElapsed } from '../../src/web/format.js';

describe('liveWorkerCountLabel', () => {
  it('renders a singular uncapped count', () => {
    expect(liveWorkerCountLabel(1, false)).toBe('1 recent action seen');
  });

  it('renders a plural uncapped count', () => {
    expect(liveWorkerCountLabel(3, false)).toBe('3 recent actions seen');
  });

  it('appends a "+" and stays plural for a capped count of exactly 1', () => {
    expect(liveWorkerCountLabel(1, true)).toBe('1+ recent actions seen');
  });

  it('appends a "+" for a capped plural count', () => {
    expect(liveWorkerCountLabel(2, true)).toBe('2+ recent actions seen');
  });
});

describe('liveWorkerTurnLabel', () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a singular turn count', () => {
    const label = liveWorkerTurnLabel(NOW - 130_000, 1, fmtElapsed);

    expect(label).toBe('2m 10s elapsed · ~1 turn so far — cost known once it lands');
  });

  it('renders a plural turn count', () => {
    const label = liveWorkerTurnLabel(NOW - 130_000, 4, fmtElapsed);

    expect(label).toBe('2m 10s elapsed · ~4 turns so far — cost known once it lands');
  });
});

describe('liveWorkerHeadMeta', () => {
  it('always returns the callsign chip tip/aria-label', () => {
    const meta = liveWorkerHeadMeta('swift-otter', null);

    expect(meta.callsign.tip).toBe(
      'a stable nickname for this firing, derived from its id — not the model or task name',
    );
    expect(meta.callsign.ariaLabel).toBe('firing callsign swift-otter');
  });

  it('returns null for the model chip when the firing predates per-step model tracking', () => {
    expect(liveWorkerHeadMeta('swift-otter', null).model).toBeNull();
    expect(liveWorkerHeadMeta('swift-otter', undefined).model).toBeNull();
  });

  it('returns the model chip tip/aria-label once the firing carries a model', () => {
    const meta = liveWorkerHeadMeta('swift-otter', 'claude-sonnet-5');

    expect(meta.model?.tip).toBe('the model currently running this firing');
    expect(meta.model?.ariaLabel).toBe('model: claude-sonnet-5');
  });
});

describe('orientFixationChipMeta', () => {
  it('renders a singular turn count', () => {
    const meta = orientFixationChipMeta(1);

    expect(meta.tip).toBe(
      '1 turn with no edit yet — may be stuck reading/planning instead of making progress',
    );
    expect(meta.ariaLabel).toBe('possible fixation: 1 turn with no edit yet');
  });

  it('renders a plural turn count', () => {
    const meta = orientFixationChipMeta(15);

    expect(meta.tip).toBe(
      '15 turns with no edit yet — may be stuck reading/planning instead of making progress',
    );
    expect(meta.ariaLabel).toBe('possible fixation: 15 turns with no edit yet');
  });
});
