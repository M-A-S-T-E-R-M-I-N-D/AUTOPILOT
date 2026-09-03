// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's "is the agent improving?"
 * evolution cluster client (`web/features/evolution.ts`) — the operator-
 * evaluation trend bar chart (`evaluationTrendPanel`) and the evolution
 * stat-tile summary (`evolutionSection`), two sibling panels extracted out
 * of `shell.ts`'s `fleetJs()` into one file under `web/features/` (epic 0002
 * "shell decomposition", SHELL HUB RELIEF). Indirect DOM-render coverage
 * already exists for the trend chart (`evaluation-trend-panel.test.ts`);
 * this adds the direct coverage its sibling (`process-health.test.ts`)
 * already carries.
 */

import { describe, it, expect } from 'vitest';
import {
  EVAL_TREND_WEEKS,
  EVAL_TREND_DAY_MS,
  EVAL_TREND_WEEK_MS,
  EVAL_TREND_FLAT_BAND,
  evalDayTs,
  evalDayKey,
  evalWeekStart,
  evaluationTrendWeeks,
  evaluationTrendSummary,
  evaluationTrendWeekTip,
  evaluationTrendLabel,
} from '../../../src/web/evaluation-trend.js';
import { evaluationTrendTileItems } from '../../../src/web/stat-tiles.js';
import { evolutionJs } from '../../../src/web/features/evolution.js';

describe('evolutionJs', () => {
  it('embeds the evaluation-trend consts as bare JSON values', () => {
    const out = evolutionJs();
    expect(out).toContain(`var EVAL_TREND_WEEKS = ${JSON.stringify(EVAL_TREND_WEEKS)};`);
    expect(out).toContain(`var EVAL_TREND_DAY_MS = ${JSON.stringify(EVAL_TREND_DAY_MS)};`);
    expect(out).toContain(`var EVAL_TREND_WEEK_MS = ${JSON.stringify(EVAL_TREND_WEEK_MS)};`);
    expect(out).toContain(`var EVAL_TREND_FLAT_BAND = ${JSON.stringify(EVAL_TREND_FLAT_BAND)};`);
  });

  it('embeds evalDayTs/evalDayKey/evalWeekStart/evaluationTrendWeeks/evaluationTrendSummary/evaluationTrendWeekTip/evaluationTrendLabel real compiled source via .toString()', () => {
    const out = evolutionJs();
    expect(out).toContain(evalDayTs.toString());
    expect(out).toContain(evalDayKey.toString());
    expect(out).toContain(evalWeekStart.toString());
    expect(out).toContain(evaluationTrendWeeks.toString());
    expect(out).toContain(evaluationTrendSummary.toString());
    expect(out).toContain(evaluationTrendWeekTip.toString());
    expect(out).toContain(evaluationTrendLabel.toString());
  });

  it('embeds evaluationTrendTileItems real compiled source via .toString()', () => {
    const out = evolutionJs();
    expect(out).toContain(evaluationTrendTileItems.toString());
  });

  it('declares both sibling section functions', () => {
    const out = evolutionJs();
    expect(out).toContain('function evaluationTrendPanel(c) {');
    expect(out).toContain('function evolutionSection(c) {');
  });

  it('hides each panel until at least one operator verdict has been recorded', () => {
    const out = evolutionJs();
    expect(out).toContain('if (summary.approved + summary.rejected === 0) return null;');
    expect(out).toContain('if (summary.approved === 0 && summary.rejected === 0) return null;');
  });

  it('reuses the shared el/statTile helpers rather than re-declaring them', () => {
    // el/statTile stay inline in fleetJs() (statTile shared with the
    // process-health cluster); this panel calls them as bare hoisted bundle
    // identifiers, never defines them.
    const out = evolutionJs();
    expect(out).toContain('grid.appendChild(statTile(');
    expect(out).not.toContain('function statTile(');
    expect(out).not.toContain('function el(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = evolutionJs();
    expect(out).toBe(out.trim());
  });
});
