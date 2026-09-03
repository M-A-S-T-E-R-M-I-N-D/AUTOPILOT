// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the shared `[data-tip]` tooltip's clamp/flip
 * positioning math (`web/tip-position.ts`) — extracted out of `fleetJs()`'s
 * inline `showTip()` (epic 0002 "shell decomposition"). Neither branch had
 * direct coverage before this: jsdom's default `getBoundingClientRect()`
 * returns an all-zero rect for every element, so exercising `showTip()`
 * itself through a rendered DOM can never reach the "fits above" branch —
 * only a direct unit test with real rects can.
 */

import { describe, it, expect } from 'vitest';
import { tipPosition } from '../../src/web/tip-position.js';

describe('tipPosition', () => {
  it('centers horizontally over the target and sits above it when there is room', () => {
    const box = { left: 100, width: 40, top: 200, bottom: 220 };
    const tipBox = { width: 80, height: 30 };
    expect(tipPosition(box, tipBox, 1000)).toEqual({
      left: 100 + 20 - 40, // box.left + width/2 - tipBox.width/2
      top: 200 - 30 - 8, // box.top - tipBox.height - 8
    });
  });

  it('flips below the target when there is no room above (top would clamp under 4)', () => {
    const box = { left: 100, width: 40, top: 10, bottom: 30 };
    const tipBox = { width: 80, height: 30 };
    expect(tipPosition(box, tipBox, 1000)).toEqual({
      left: 100 + 20 - 40,
      top: 30 + 8, // box.bottom + 8
    });
  });

  it('clamps left to the 4px viewport margin near the left edge', () => {
    const box = { left: 0, width: 10, top: 200, bottom: 220 };
    const tipBox = { width: 80, height: 30 };
    expect(tipPosition(box, tipBox, 1000).left).toBe(4);
  });

  it('clamps left to the 4px viewport margin near the right edge', () => {
    const box = { left: 990, width: 10, top: 200, bottom: 220 };
    const tipBox = { width: 80, height: 30 };
    expect(tipPosition(box, tipBox, 1000).left).toBe(1000 - 80 - 4);
  });

  it('stays above at the top===4 boundary but flips one pixel below it', () => {
    const tipBox = { width: 80, height: 30 };
    const atBoundary = { left: 100, width: 40, top: 42, bottom: 62 }; // 42-30-8 = 4, not <4
    expect(tipPosition(atBoundary, tipBox, 1000).top).toBe(4);
    const justUnder = { left: 100, width: 40, top: 41, bottom: 61 }; // 41-30-8 = 3, <4
    expect(tipPosition(justUnder, tipBox, 1000).top).toBe(61 + 8);
  });
});
