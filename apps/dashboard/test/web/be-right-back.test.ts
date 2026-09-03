// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure BE-RIGHT-BACK overlay show/hide math
 * (`web/be-right-back.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2, the same `timeline-strip.ts` precedent.
 */

import { describe, it, expect } from 'vitest';
import { brbOverlayVisible, BRB_FAIL_THRESHOLD } from '../../src/web/be-right-back.js';

describe('brbOverlayVisible', () => {
  it('stays hidden below the failure threshold (a single missed poll is normal jitter)', () => {
    expect(brbOverlayVisible(0)).toBe(false);
    expect(brbOverlayVisible(BRB_FAIL_THRESHOLD - 1)).toBe(false);
  });

  it('shows once the streak reaches the threshold', () => {
    expect(brbOverlayVisible(BRB_FAIL_THRESHOLD)).toBe(true);
  });

  it('stays visible for a longer streak past the threshold', () => {
    expect(brbOverlayVisible(BRB_FAIL_THRESHOLD + 5)).toBe(true);
  });

  it('honors a custom threshold override', () => {
    expect(brbOverlayVisible(1, 1)).toBe(true);
    expect(brbOverlayVisible(0, 1)).toBe(false);
  });
});
