// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Publicity affordances panel client
 * (`web/features/publicity.ts`) — a whole self-init region extracted out of
 * `shell.ts`'s `fleetJs()` into its own file under `web/features/` (epic
 * 0002 "shell decomposition", SHELL HUB RELIEF).
 */

import { describe, it, expect } from 'vitest';
import { publicityAffordanceTip } from '../../../src/web/publicity-panel.js';
import { publicityJs } from '../../../src/web/features/publicity.js';

describe('publicityJs', () => {
  it('embeds publicityAffordanceTip real compiled source via .toString()', () => {
    expect(publicityJs()).toContain(publicityAffordanceTip.toString());
  });

  it('declares renderPublicityPanel and loadPublicityPanel', () => {
    const out = publicityJs();
    expect(out).toContain('function renderPublicityPanel(affordances) {');
    expect(out).toContain('function loadPublicityPanel() {');
  });

  it('fetches /api/publicity on demand', () => {
    expect(publicityJs()).toContain(
      "fetch('/api/publicity', { headers: { accept: 'application/json' } })",
    );
  });

  it('self-initializes once — a single loadPublicityPanel() call, no poll timer', () => {
    const out = publicityJs();
    expect(out).toContain('loadPublicityPanel();');
    expect(out).not.toContain('setInterval');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = publicityJs();
    expect(out).toBe(out.trim());
  });

  // D1 ATTRIBUTE PAYLOAD (epic 0015): the link's own label text already gives
  // it an accessible name — an aria-label duplicating the full data-tip
  // sentence verbatim clobbers that name AND doubles the attribute payload.
  it('does not duplicate the tip into an aria-label on the affordance link', () => {
    expect(publicityJs()).not.toContain("setAttribute('aria-label', tip)");
  });

  it('rides the tip into a visually-hidden sibling via aria-describedby instead', () => {
    const out = publicityJs();
    expect(out).toContain("setAttribute('aria-describedby', descId)");
    expect(out).toContain("el('span', 'sr-only', tip)");
  });
});
