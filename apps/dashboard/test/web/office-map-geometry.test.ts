// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the office map's pure geometry (`web/office-map.ts`)
 * — the first client-only module extracted under epic 0002 "shell
 * decomposition", slice 2. `office-map.test.ts` already regression-tests
 * this logic indirectly through the rendered SVG in `clientJs()`; these
 * tests exercise the real functions directly instead of parsing DOM output.
 */

import { describe, it, expect } from 'vitest';
import {
  OFFICE_PHASES,
  OFFICE_ZONE_W,
  OFFICE_ZONE_Y,
  OFFICE_ZONE_H,
  OFFICE_GAP,
  OFFICE_IDLE_X,
  OFFICE_IDLE_Y,
  OFFICE_SATELLITE_ORBIT,
  officeZoneX,
  officeTargetFor,
  officeEase,
  officeSatellitePos,
  officeTweenPos,
} from '../../src/web/office-map.js';

describe('officeZoneX', () => {
  it('places the first zone at the left gap', () => {
    expect(officeZoneX(0)).toBe(OFFICE_GAP);
  });

  it('spaces each subsequent zone by zone width + gap', () => {
    expect(officeZoneX(1)).toBe(OFFICE_GAP + (OFFICE_ZONE_W + OFFICE_GAP));
    expect(officeZoneX(3)).toBe(OFFICE_GAP + 3 * (OFFICE_ZONE_W + OFFICE_GAP));
  });
});

describe('officeTargetFor', () => {
  it('centers the target on the matching phase zone', () => {
    const i = OFFICE_PHASES.indexOf('gate');
    expect(officeTargetFor('gate')).toEqual({
      x: officeZoneX(i) + OFFICE_ZONE_W / 2,
      y: OFFICE_ZONE_Y + OFFICE_ZONE_H / 2,
    });
  });

  it('falls back to the idle center for a phase not on the rail', () => {
    expect(officeTargetFor('other')).toEqual({ x: OFFICE_IDLE_X, y: OFFICE_IDLE_Y });
  });

  it('falls back to the idle center when nothing is live (null phase)', () => {
    expect(officeTargetFor(null)).toEqual({ x: OFFICE_IDLE_X, y: OFFICE_IDLE_Y });
  });
});

describe('officeEase', () => {
  it('starts at 0 and ends at 1', () => {
    expect(officeEase(0)).toBe(0);
    expect(officeEase(1)).toBe(1);
  });

  it('front-loads the motion (cubic ease-out passes the midpoint by t=0.5)', () => {
    expect(officeEase(0.5)).toBeCloseTo(0.875, 5);
  });
});

describe('officeSatellitePos', () => {
  const center = { x: 10, y: 20 };

  it('places the first of n satellites directly above center', () => {
    const pos = officeSatellitePos(0, 4, center);
    expect(pos.x).toBeCloseTo(center.x, 5);
    expect(pos.y).toBeCloseTo(center.y - OFFICE_SATELLITE_ORBIT, 5);
  });

  it('spreads satellites evenly around the orbit', () => {
    const n = 3;
    const positions = [0, 1, 2].map((i) => officeSatellitePos(i, n, center));
    for (const pos of positions) {
      const dx = pos.x - center.x;
      const dy = pos.y - center.y;
      expect(Math.hypot(dx, dy)).toBeCloseTo(OFFICE_SATELLITE_ORBIT, 5);
    }
    // No two satellites land on the same spot.
    const unique = new Set(positions.map((p) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`));
    expect(unique.size).toBe(n);
  });

  it('is stable for the same (i, n, center) input', () => {
    expect(officeSatellitePos(1, 5, center)).toEqual(officeSatellitePos(1, 5, center));
  });

  it('falls back to center instead of NaN when there are no satellites (n=0)', () => {
    expect(officeSatellitePos(0, 0, center)).toEqual(center);
  });
});

describe('officeTweenPos', () => {
  const from = { x: 0, y: 10 };
  const target = { x: 100, y: 20 };

  it('is exactly from at t=0', () => {
    expect(officeTweenPos(from, target, 0)).toEqual(from);
  });

  it('is exactly target at t=1', () => {
    expect(officeTweenPos(from, target, 1)).toEqual(target);
  });

  it('interpolates each axis by the same eased fraction as officeEase', () => {
    const e = officeEase(0.5);
    expect(officeTweenPos(from, target, 0.5)).toEqual({
      x: from.x + (target.x - from.x) * e,
      y: from.y + (target.y - from.y) * e,
    });
  });
});
