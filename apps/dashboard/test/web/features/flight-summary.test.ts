// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's "Recently shipped" flight
 * summary panel client (`web/features/flight-summary.ts`) — a whole
 * assembler function extracted out of `shell.ts`'s `fleetJs()` into its own
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF). Indirect DOM-render coverage already exists for this panel
 * through the real client bundle (`test/web/flight-summary-tooltips.test.ts`,
 * `test/web/flight-summary-m3-surface.test.ts`); this adds the direct
 * coverage its siblings (`round-panel.test.ts`, `release.test.ts`) already
 * carry.
 */

import { describe, it, expect } from 'vitest';
import { finishedFlightSummaries } from '../../../src/shared/flight-summary.js';
import { flightSummaryLineMeta } from '../../../src/web/flight-summary-panel.js';
import { flightSummaryJs } from '../../../src/web/features/flight-summary.js';

describe('flightSummaryJs', () => {
  it('embeds finishedFlightSummaries/flightSummaryLineMeta real compiled source via .toString()', () => {
    const out = flightSummaryJs();
    expect(out).toContain(finishedFlightSummaries.toString());
    expect(out).toContain(flightSummaryLineMeta.toString());
  });

  it('declares flightSummarySection', () => {
    const out = flightSummaryJs();
    expect(out).toContain('function flightSummarySection(c) {');
  });

  it('renders nothing when there are no finished flight summaries', () => {
    expect(flightSummaryJs()).toContain('if (!summaries.length) return null;');
  });

  it('renders a second cost chip only when the real-cost figure (cost semantics v3) is available', () => {
    const out = flightSummaryJs();
    expect(out).toContain('if (meta.realCostText) {');
  });

  it('reuses the shared el/fmtCost/fmtAgo helpers rather than re-declaring them', () => {
    const out = flightSummaryJs();
    expect(out).toContain("el('div', 'flight-summary')");
    expect(out).toContain('flightSummaryLineMeta(s, fmtCost, fmtAgo)');
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function fmtCost(');
    expect(out).not.toContain('function fmtAgo(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = flightSummaryJs();
    expect(out).toBe(out.trim());
  });
});
