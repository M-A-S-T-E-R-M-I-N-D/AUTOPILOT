// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the fleet grid's dirty-check diff signature
 * (`web/fleet-view.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. Previously only covered indirectly through the rendered DOM in
 * `fleetJs()`'s `renderFleet`; these tests exercise the real function
 * directly instead.
 */

import { describe, it, expect } from 'vitest';
import { fleetStateSig } from '../../src/web/fleet-view.js';

describe('fleetStateSig', () => {
  it('is stable for the same totals/projects/empty', () => {
    const state = { totals: { firings: 3 }, projects: [{ id: 'a' }], empty: false };
    expect(fleetStateSig(state)).toBe(fleetStateSig(state));
  });

  it('differs when totals change', () => {
    const before = fleetStateSig({ totals: { firings: 3 }, projects: [], empty: false });
    const after = fleetStateSig({ totals: { firings: 4 }, projects: [], empty: false });
    expect(before).not.toBe(after);
  });

  it('differs when the project list changes', () => {
    const before = fleetStateSig({ totals: {}, projects: [{ id: 'a' }], empty: false });
    const after = fleetStateSig({ totals: {}, projects: [{ id: 'a' }, { id: 'b' }], empty: false });
    expect(before).not.toBe(after);
  });

  it('differs when the empty flag changes', () => {
    const before = fleetStateSig({ totals: {}, projects: [], empty: true });
    const after = fleetStateSig({ totals: {}, projects: [], empty: false });
    expect(before).not.toBe(after);
  });

  it('ignores fields outside totals/projects/empty (e.g. generatedAt)', () => {
    const base = { totals: { firings: 3 }, projects: [], empty: false };
    const withTimestamp = { ...base, generatedAt: 123 };
    const withOtherTimestamp = { ...base, generatedAt: 456 };
    expect(fleetStateSig(withTimestamp)).toBe(fleetStateSig(withOtherTimestamp));
  });
});
