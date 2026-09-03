// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure "Recently shipped" flight summary line
 * text/tip/aria-label math (`web/flight-summary-panel.ts`) — extracted under
 * epic 0002 "shell decomposition", slice 2. `flight-summary-tooltips.test.ts`
 * already regression-tests this logic indirectly through the rendered DOM in
 * `clientJs()`; these tests exercise the real function directly instead.
 */

import { describe, it, expect } from 'vitest';
import { flightSummaryLineMeta } from '../../src/web/flight-summary-panel.js';

const fmtCost = (n: number): string => '$' + n.toFixed(2);
const fmtAgo = (at: number): string => (Date.now() - at < 60_000 ? 'just now' : 'a while ago');

describe('flightSummaryLineMeta', () => {
  it('builds the headline tip/aria-label from the flight headline', () => {
    const meta = flightSummaryLineMeta(
      { headline: 'Fix the thing', cost: 0.12, closedTaskTitle: null, at: Date.now() },
      fmtCost,
      fmtAgo,
    );
    expect(meta.headlineTip).toBe('What this firing shipped');
    expect(meta.headlineAriaLabel).toBe('shipped: Fix the thing');
  });

  it('formats the cost text/tip/aria-label via the injected fmtCost', () => {
    const meta = flightSummaryLineMeta(
      { headline: 'h', cost: 0.42, closedTaskTitle: null, at: Date.now() },
      fmtCost,
      fmtAgo,
    );
    expect(meta.costText).toBe('$0.42');
    expect(meta.costTip).toBe('Total spend for this firing');
    expect(meta.costAriaLabel).toBe('cost: $0.42');
  });

  it('leaves the real-cost chip fields null when realCostUsd is unconfigured/untracked', () => {
    const meta = flightSummaryLineMeta(
      { headline: 'h', cost: 0.42, closedTaskTitle: null, at: Date.now() },
      fmtCost,
      fmtAgo,
    );
    expect(meta.realCostText).toBeNull();
    expect(meta.realCostTip).toBeNull();
    expect(meta.realCostAriaLabel).toBeNull();
  });

  it('fills the real-cost chip text/tip/aria-label when realCostUsd is tracked, including a real zero', () => {
    const meta = flightSummaryLineMeta(
      { headline: 'h', cost: 0.42, realCostUsd: 0, closedTaskTitle: null, at: Date.now() },
      fmtCost,
      fmtAgo,
    );
    expect(meta.realCostText).toBe('real $0.00');
    expect(meta.realCostTip).toBe(
      'Real cost — apportioned by your subscription share, not API list price',
    );
    expect(meta.realCostAriaLabel).toBe('real cost: $0.00');
  });

  it('leaves the closed-task chip fields null when the flight closed no task', () => {
    const meta = flightSummaryLineMeta(
      { headline: 'h', cost: 0, closedTaskTitle: null, at: Date.now() },
      fmtCost,
      fmtAgo,
    );
    expect(meta.closedText).toBeNull();
    expect(meta.closedTip).toBeNull();
    expect(meta.closedAriaLabel).toBeNull();
  });

  it('fills the closed-task chip text/tip/aria-label when a task closed', () => {
    const meta = flightSummaryLineMeta(
      { headline: 'h', cost: 0, closedTaskTitle: 'Fix the thing', at: Date.now() },
      fmtCost,
      fmtAgo,
    );
    expect(meta.closedText).toBe('closed');
    expect(meta.closedTip).toBe('Closed task: Fix the thing');
    expect(meta.closedAriaLabel).toBe('closed task: Fix the thing');
  });

  it('formats the relative timestamp text/tip/aria-label via the injected fmtAgo', () => {
    const meta = flightSummaryLineMeta(
      { headline: 'h', cost: 0, closedTaskTitle: null, at: Date.now() },
      fmtCost,
      fmtAgo,
    );
    expect(meta.agoText).toBe('just now');
    expect(meta.agoTip).toBe('When this firing shipped');
    expect(meta.agoAriaLabel).toBe('shipped just now');
  });
});
