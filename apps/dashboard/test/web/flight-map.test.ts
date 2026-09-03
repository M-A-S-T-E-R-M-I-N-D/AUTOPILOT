// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure "files in flight" tooltip-text math
 * (`web/flight-map.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. `flightmap-tooltips.test.ts` already regression-tests this logic
 * indirectly through the rendered DOM in `clientJs()`; these tests exercise
 * the real function directly instead.
 */

import { describe, it, expect } from 'vitest';
import { fnodeTip } from '../../src/web/flight-map.js';

describe('fnodeTip', () => {
  it('pluralizes "touches" for more than one touch', () => {
    expect(fnodeTip({ path: 'src/deep/a.ts', touches: 3, tool: 'Edit' })).toBe(
      'src/deep/a.ts — 3 touches (Edit)',
    );
  });

  it('keeps "touch" singular for exactly one touch', () => {
    expect(fnodeTip({ path: 'src/b.ts', touches: 1, tool: 'Read' })).toBe(
      'src/b.ts — 1 touch (Read)',
    );
  });

  it('names the most-recent tool', () => {
    expect(fnodeTip({ path: 'README.md', touches: 2, tool: 'Grep' })).toBe(
      'README.md — 2 touches (Grep)',
    );
  });
});
