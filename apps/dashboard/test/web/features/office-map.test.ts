// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the agent office map panel client
 * (`web/features/office-map.ts`) — officeSatellites, officeMapSection, and
 * prefersReducedMotion, extracted out of `shell.ts`'s `fleetJs()` into one
 * file under `web/features/` (epic 0002 "shell decomposition", SHELL HUB
 * RELIEF). Indirect DOM-render coverage already exists for this panel
 * through the real client bundle (`test/web/office-map.test.ts`,
 * `test/web/office-map-geometry.test.ts`,
 * `test/web/office-satellite-tooltips.test.ts`,
 * `test/web/office-zone-tooltips.test.ts`); this adds the direct coverage
 * its siblings (`activity.test.ts`, `tour.test.ts`) already carry.
 */

import { describe, it, expect } from 'vitest';
import {
  OFFICE_PHASES,
  OFFICE_LABELS,
  OFFICE_W,
  OFFICE_H,
  OFFICE_ZONE_W,
  OFFICE_ZONE_H,
  OFFICE_ZONE_Y,
  OFFICE_GAP,
  OFFICE_IDLE_X,
  OFFICE_IDLE_Y,
  OFFICE_ANIM_MS,
  OFFICE_SATELLITE_R,
  OFFICE_SATELLITE_ORBIT,
  officeZoneX,
  officeTargetFor,
  officeEase,
  officeSatellitePos,
  officeTweenPos,
} from '../../../src/web/office-map.js';
import { officeMapJs } from '../../../src/web/features/office-map.js';

describe('officeMapJs', () => {
  it('embeds every splice real compiled source/value via .toString()/JSON.stringify()', () => {
    const out = officeMapJs();
    expect(out).toContain(`var OFFICE_PHASES = ${JSON.stringify(OFFICE_PHASES)};`);
    expect(out).toContain(`var OFFICE_LABELS = ${JSON.stringify(OFFICE_LABELS)};`);
    expect(out).toContain(`var OFFICE_W = ${OFFICE_W}, OFFICE_H = ${OFFICE_H};`);
    expect(out).toContain(
      `var OFFICE_ZONE_W = ${OFFICE_ZONE_W}, OFFICE_ZONE_H = ${OFFICE_ZONE_H}, OFFICE_ZONE_Y = ${OFFICE_ZONE_Y}, OFFICE_GAP = ${OFFICE_GAP};`,
    );
    expect(out).toContain(
      `var OFFICE_IDLE_X = ${OFFICE_IDLE_X}, OFFICE_IDLE_Y = ${OFFICE_IDLE_Y};`,
    );
    expect(out).toContain(`var OFFICE_ANIM_MS = ${OFFICE_ANIM_MS};`);
    expect(out).toContain(
      `var OFFICE_SATELLITE_R = ${OFFICE_SATELLITE_R}, OFFICE_SATELLITE_ORBIT = ${OFFICE_SATELLITE_ORBIT};`,
    );
    expect(out).toContain(officeZoneX.toString());
    expect(out).toContain(officeTargetFor.toString());
    expect(out).toContain(officeEase.toString());
    expect(out).toContain(officeSatellitePos.toString());
    expect(out).toContain(officeTweenPos.toString());
  });

  it('declares prefersReducedMotion, officeSatellites, and officeMapSection', () => {
    const out = officeMapJs();
    expect(out).toContain('function prefersReducedMotion() {');
    expect(out).toContain('function officeSatellites(svg, NS, center, subagents) {');
    expect(out).toContain('function officeMapSection(c) {');
  });

  it('keeps its own module-level state — officeMapPos/officeMapRaf, keyed by project id, survive full-card rebuilds', () => {
    const out = officeMapJs();
    expect(out).toContain('var officeMapPos = {};');
    expect(out).toContain('var officeMapRaf = {};');
  });

  it('calls el, liveFiring, and OFFICE_TIPS as bare hoisted identifiers, never defines them', () => {
    // OFFICE_TIPS is ALSO read by liveWorkerCard/renderStatTiles (still
    // inline in fleetJs()) and web/features/activity.ts's phaseRail, so it
    // stays behind in fleetJs() rather than moving with this cluster — the
    // same "shared value stays put, the moved cluster calls it as a bare
    // hoisted identifier" shape activity.ts's own OFFICE_TIPS reference
    // already established.
    const out = officeMapJs();
    expect(out).toContain("var wrap = el('div', 'office-map-wrap');");
    expect(out).toContain('var live = liveFiring(c);');
    expect(out).toContain("OFFICE_TIPS[phase] + (active ? ' — current phase' : '')");
    expect(out).not.toContain('function el(');
    expect(out).not.toContain('function liveFiring(');
    expect(out).not.toContain('var OFFICE_TIPS');
  });

  it('is trimmed — no leading/trailing whitespace', () => {
    const out = officeMapJs();
    expect(out).toBe(out.trim());
  });
});
