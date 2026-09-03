// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure status-pill label/tip/aria-label math
 * (`web/status-pill.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. No existing test, direct or indirect, exercised this logic
 * beforehand — a genuine zero-coverage gap the same shape as the
 * twenty-second through twenty-fourth cuts.
 */

import { describe, it, expect } from 'vitest';
import { statusPillMeta } from '../../src/web/status-pill.js';

const TIPS = {
  flying: 'A firing is in progress right now',
  needs_approval: 'Self-proposed — waiting on your approve/reject decision',
};

describe('statusPillMeta', () => {
  it('replaces the underscore in the status with a space for the label', () => {
    expect(statusPillMeta('needs_approval', TIPS).label).toBe('needs approval');
  });

  it('leaves a status with no underscore untouched', () => {
    expect(statusPillMeta('flying', TIPS).label).toBe('flying');
  });

  it('only replaces the first underscore, mirroring the original inline .replace', () => {
    expect(statusPillMeta('a_b_c', TIPS).label).toBe('a b_c');
  });

  it('carries the tip map entry as the tip and builds the "Status: <label> — <tip>" aria-label', () => {
    const meta = statusPillMeta('flying', TIPS);
    expect(meta.tip).toBe('A firing is in progress right now');
    expect(meta.ariaLabel).toBe('Status: flying — A firing is in progress right now');
  });

  it('builds the aria-label off the already-spaced label, not the raw status', () => {
    expect(statusPillMeta('needs_approval', TIPS).ariaLabel).toBe(
      'Status: needs approval — Self-proposed — waiting on your approve/reject decision',
    );
  });

  it('returns a null tip and aria-label when the status has no entry in the tip map', () => {
    const meta = statusPillMeta('unknown_status', TIPS);
    expect(meta.tip).toBeNull();
    expect(meta.ariaLabel).toBeNull();
  });
});
