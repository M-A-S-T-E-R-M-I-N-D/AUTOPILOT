// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the fly bar's own
 * three controls — "Fly it", "Pause", and "Stop" — carried no [data-tip],
 * while every per-flight row button (Pause/Stop/Cancel/Resume) and the
 * Browse… modal already explain themselves. Each click has real,
 * non-obvious consequences (launches an autonomous engine that spends real
 * budget, suspends it, or ends it for good), so hover/focus should say so
 * BEFORE the click. Their markup lives in shell.ts but their behavior in
 * fly.ts, so the tips ride the same runtime-setAttribute pattern
 * `connect-tooltips.test.ts` locks down for the CONNECT popover.
 * i18n (board web-msnsndki-dz3vn1): the tip TEXT now lives in STRINGS —
 * `fly-tooltips-i18n.test.ts` locks the setTip/data-i18n-tip wiring; this
 * file keeps the audit's real promise, that each English tip still states
 * its control's consequence.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { flyJs } from '../../src/web/features/fly.js';

describe('the fly bar Fly it/Pause/Stop buttons explain themselves on hover/focus', () => {
  const out = flyJs();

  it('tips "Fly it" with what launches and that it spends real budget', () => {
    expect(out).toContain("setTip(goEl, 'flyGoTip');");
    expect(STRINGS.en.flyGoTip).toContain('spending real budget');
  });

  it('tips "Pause" as a suspension that holds until resume', () => {
    expect(out).toContain("setTip(pauseEl, 'flyPauseTip');");
    expect(STRINGS.en.flyPauseTip).toContain('until you resume');
  });

  it('tips "Stop" as final while keeping already-committed work', () => {
    expect(out).toContain("setTip(stopEl, 'flyStopTip');");
    expect(STRINGS.en.flyStopTip).toContain('already committed stays');
  });
});

describe('the fly bar firings/budget/mode/total inputs explain themselves on hover/focus', () => {
  const out = flyJs();

  it('tips the firings count as the stop condition it drives', () => {
    expect(out).toContain("setTip(firingsEl, 'flyFiringsTip');");
    expect(STRINGS.en.flyFiringsTip).toContain('before stopping');
  });

  it('tips the per-firing budget as a spend cap', () => {
    expect(out).toContain("setTip(budgetEl, 'flyBudgetTip');");
    expect(STRINGS.en.flyBudgetTip).toContain('one firing may spend');
  });

  it('tips the budget mode select with the same choice its aria-label already states', () => {
    expect(out).toContain("setTip(modeEl, 'flyModeTip');");
    expect(STRINGS.en.flyModeTip).toContain('fixed firing count or total spend target');
  });

  it('tips the total-spend target as the flight-wide stop condition', () => {
    expect(out).toContain("setTip(totalEl, 'flyTotalTip');");
    expect(STRINGS.en.flyTotalTip).toContain('total spend across all firings');
  });

  it('tips the lanes field with what multi-lane actually does (board web-mtdcfel4-0bxf4h)', () => {
    expect(out).toContain("setTip(lanesEl, 'flyLanesTip');");
    expect(STRINGS.en.flyLanesTip).toContain('parallel lanes');
  });
});
