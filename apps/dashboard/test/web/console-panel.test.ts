// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure flight CONSOLE panel aria-label text
 * math (`web/console-panel.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `flight-console.test.ts` already regression-tests
 * this indirectly through the rendered DOM in `clientJs()`, but only ever
 * with a 2-line log ("2 lines") — it never exercises the singular 1-line
 * branch, a genuine test gap the same shape as the twenty-second through
 * twenty-fourth cuts closed elsewhere. This test exercises the real
 * function directly, including both branches.
 */

import { describe, it, expect } from 'vitest';
import { consoleLinesAriaLabel } from '../../src/web/console-panel.js';

describe('consoleLinesAriaLabel', () => {
  it('reads "1 line" (no plural "s") for a single line', () => {
    expect(consoleLinesAriaLabel(1)).toBe('1 line of raw flight process output');
  });

  it('reads "N lines" for any count other than 1', () => {
    expect(consoleLinesAriaLabel(0)).toBe('0 lines of raw flight process output');
    expect(consoleLinesAriaLabel(2)).toBe('2 lines of raw flight process output');
    expect(consoleLinesAriaLabel(42)).toBe('42 lines of raw flight process output');
  });
});
