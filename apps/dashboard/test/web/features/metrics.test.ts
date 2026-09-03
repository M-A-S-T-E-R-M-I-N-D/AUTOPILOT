// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the project page's Metrics detail-panel cluster
 * client (`web/features/metrics.ts`) — the per-project cost sparkline
 * (`costSparkline`), the flight timeline strip (`flightTimelineStrip`), and
 * the metrics section that composes both alongside the stat row and model mix
 * (`metricsSection`), three functions extracted out of `shell.ts`'s
 * `fleetJs()` into one file under `web/features/` (epic 0002 "shell
 * decomposition", SHELL HUB RELIEF). Indirect DOM-render coverage already
 * exists for these panels through the real client bundle
 * (`flight-timeline-strip.test.ts`, `model-mix-panel.test.ts`); this adds the
 * direct coverage its siblings (`evolution.test.ts`, `process-health.test.ts`)
 * already carry.
 */

import { describe, it, expect } from 'vitest';
import { timelineSegments } from '../../../src/web/timeline-strip.js';
import { metricsStatItems, modelMixItems, modelMixChipMeta } from '../../../src/web/stat-tiles.js';
import { metricsJs } from '../../../src/web/features/metrics.js';

describe('metricsJs', () => {
  it('embeds timelineSegments real compiled source via .toString()', () => {
    const out = metricsJs();
    expect(out).toContain(timelineSegments.toString());
  });

  it('embeds metricsStatItems/modelMixItems/modelMixChipMeta real compiled source via .toString()', () => {
    const out = metricsJs();
    expect(out).toContain(metricsStatItems.toString());
    expect(out).toContain(modelMixItems.toString());
    expect(out).toContain(modelMixChipMeta.toString());
  });

  it('declares all three functions', () => {
    const out = metricsJs();
    expect(out).toContain('function costSparkline(log, tasks) {');
    expect(out).toContain('function flightTimelineStrip(log, tasks, pid) {');
    expect(out).toContain('function metricsSection(c) {');
  });

  it('hides the panel until firings data exists, and the timeline strip until real timing data exists', () => {
    const out = metricsJs();
    expect(out).toContain('if (!c.firings) return null;');
    expect(out).toContain('if (!geo) return null;');
  });

  it('composes costSparkline and flightTimelineStrip inside metricsSection', () => {
    const out = metricsJs();
    expect(out).toContain('var spark = costSparkline(chrono, c.tasks);');
    expect(out).toContain('var timeline = flightTimelineStrip(chrono, c.tasks, c.id);');
  });

  it('reuses the shared svgNode/sparkBars/metricSparkline/flightBarMeta/taskMap/flightHeadlineOf/el/tipChip/stat/fmtCost/fmtTokens helpers rather than re-declaring them', () => {
    // These stay inline in fleetJs() — metricSparkline/flightBarMeta/svgNode/
    // sparkBars/taskMap/flightHeadlineOf are shared with the fleet-wide
    // sparklines (fleetCostSpark/fleetTurnsSpark/fleetFormSpark/
    // fleetCacheSpark) that stay behind; this cluster calls them as bare
    // hoisted bundle identifiers, never defines them.
    const out = metricsJs();
    expect(out).toContain('metricSparkline(');
    expect(out).not.toContain('function metricSparkline(');
    expect(out).not.toContain('function svgNode(');
    expect(out).not.toContain('function sparkBars(');
    expect(out).not.toContain('function flightBarMeta(');
    expect(out).not.toContain('function taskMap(');
    expect(out).not.toContain('function flightHeadlineOf(');
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function tipChip(');
    expect(out).not.toContain('function stat(');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = metricsJs();
    expect(out).toBe(out.trim());
  });
});
