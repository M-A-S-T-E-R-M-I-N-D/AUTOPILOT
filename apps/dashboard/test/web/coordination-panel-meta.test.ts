// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct coverage for web/coordination-panel.ts's coordinationLineMeta — the
 * FLEET COORDINATION panel's per-line classification/strip (BOARD
 * web-mtbp0t8z-aftrnm, "NO VISIBLE INTER-LANE COORDINATION").
 */

import { describe, it, expect } from 'vitest';
import { coordinationLineMeta } from '../../src/web/coordination-panel.js';

describe('coordinationLineMeta', () => {
  it('classifies a CLAIMED-by line and strips the leading bullet', () => {
    const meta = coordinationLineMeta('- CLAIMED by fleet-2: [t1] Wire up the retry queue');

    expect(meta.kind).toBe('claim');
    expect(meta.text).toBe('CLAIMED by fleet-2: [t1] Wire up the retry queue');
  });

  it('classifies a sibling status line and strips the leading bullet', () => {
    const meta = coordinationLineMeta(
      '- sibling autopilot/flight-worktree-fleet-4: last commit "fix: retry queue"',
    );

    expect(meta.kind).toBe('sibling');
    expect(meta.text).toBe(
      'sibling autopilot/flight-worktree-fleet-4: last commit "fix: retry queue"',
    );
  });

  it('falls back to "other" for a line matching neither shape, still stripping the bullet', () => {
    const meta = coordinationLineMeta('- something else entirely');

    expect(meta.kind).toBe('other');
    expect(meta.text).toBe('something else entirely');
  });

  it('passes through a line with no leading bullet unchanged', () => {
    const meta = coordinationLineMeta('CLAIMED by solo: [t2] no dash prefix here');

    expect(meta.kind).toBe('claim');
    expect(meta.text).toBe('CLAIMED by solo: [t2] no dash prefix here');
  });

  it('carries a kind-specific tooltip so each line explains itself (interactivity audit v2)', () => {
    const claim = coordinationLineMeta('- CLAIMED by fleet-2: [t1] Wire up the retry queue');
    const sibling = coordinationLineMeta('- sibling autopilot/flight-x: last commit "fix: y"');
    const other = coordinationLineMeta('- something else entirely');

    expect(claim.tip).toContain('claimed');
    expect(sibling.tip).toContain("sibling lane's");
    expect(other.tip).toContain('fleet-digest');
    expect(new Set([claim.tip, sibling.tip, other.tip]).size).toBe(3);
  });
});
