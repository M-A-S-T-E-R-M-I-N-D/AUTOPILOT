// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the RELEASE preview line's version/bump chip math
 * (`web/release-panel.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2, sixty-fourth cut. `release-panel.test.ts`'s "RELEASE preview"
 * suite only ever asserted the rendered `.release-line` text content, never
 * either chip's `data-tip`/`aria-label`.
 */

import { describe, it, expect } from 'vitest';
import { releaseVersionItems } from '../../src/web/release-panel.js';

describe('releaseVersionItems', () => {
  it('orders the version and bump chips text/tip/aria-label/class', () => {
    const items = releaseVersionItems('1.2.0', { bump: 'minor', version: '1.3.0' });

    expect(items).toEqual([
      [
        '1.2.0 → 1.3.0',
        'Next release version',
        'SemVer minor bump: 1.2.0 → 1.3.0',
        'release-version',
      ],
      ['minor', 'Bump kind', 'bump kind: minor', 'release-bump'],
    ]);
  });

  it('reflects a major bump in both the version chip and the bump chip', () => {
    const items = releaseVersionItems('1.2.0', { bump: 'major', version: '2.0.0' });

    expect(items[0]?.[2]).toBe('SemVer major bump: 1.2.0 → 2.0.0');
    expect(items[1]?.[0]).toBe('major');
  });
});
