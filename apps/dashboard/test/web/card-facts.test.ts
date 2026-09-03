// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure facts-list text/tip/aria-label math
 * (`web/card-facts.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. `detail-facts-tooltips.test.ts` already regression-tests this
 * logic indirectly through the rendered DOM in `clientJs()`, but only ever
 * with both `gate` and `backedUp` present — it never exercises either field
 * absent, a genuine test gap the same shape as the twenty-second through
 * twenty-fourth cuts closed elsewhere. These tests exercise the real
 * function directly, including both absent branches.
 */

import { describe, it, expect } from 'vitest';
import { factsMeta } from '../../src/web/card-facts.js';

describe('factsMeta', () => {
  it('builds the Gate row text/tip/aria-label when gate is set', () => {
    const meta = factsMeta({ gate: 'js · vitest run', backedUp: false });
    expect(meta.gate).toEqual({
      text: 'js · vitest run',
      tip: 'The check AUTOPILOT runs to verify a change before it commits',
      ariaLabel:
        'Gate: js · vitest run — the check AUTOPILOT runs to verify a change before it commits',
    });
  });

  it('leaves the Gate row null when the project carries no gate', () => {
    const meta = factsMeta({ gate: null, backedUp: false });
    expect(meta.gate).toBeNull();
  });

  it('builds the Backup row text/tip/aria-label when backedUp is true', () => {
    const meta = factsMeta({ gate: null, backedUp: true });
    expect(meta.backup).toEqual({
      text: 'MYTH + LEGACY snapshot',
      tip: 'MYTH is the pristine pre-touch snapshot, LEGACY is the lock-on baseline — both git tags exist before AUTOPILOT changes anything',
      ariaLabel: 'Backup: MYTH and LEGACY snapshot tags exist before AUTOPILOT changes anything',
    });
  });

  it('leaves the Backup row null when the project is not backed up', () => {
    const meta = factsMeta({ gate: null, backedUp: false });
    expect(meta.backup).toBeNull();
  });

  it('fills both rows when the project carries both facts', () => {
    const meta = factsMeta({ gate: 'go test', backedUp: true });
    expect(meta.gate).not.toBeNull();
    expect(meta.backup).not.toBeNull();
  });
});
