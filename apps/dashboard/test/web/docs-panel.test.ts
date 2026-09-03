// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure Docs reader file-button tip/aria-label
 * text math (`web/docs-panel.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2. `docs-file-tooltip.test.ts` already
 * regression-tests this indirectly through the rendered DOM in `clientJs()`,
 * but only ever with the file closed ("Open <file>") — it never exercises
 * the currently-open branch, a genuine test gap the same shape as the
 * twenty-second through twenty-fourth cuts closed elsewhere. This test
 * exercises the real function directly, including both branches.
 */

import { describe, it, expect } from 'vitest';
import { docFileTip } from '../../src/web/docs-panel.js';

describe('docFileTip', () => {
  it('reads "Open <file>" when the file is not the open doc', () => {
    expect(docFileTip('README.md', false)).toBe('Open README.md');
  });

  it('reads "Currently viewing <file>" when the file is the open doc', () => {
    expect(docFileTip('docs/MASTER-PLAN.md', true)).toBe('Currently viewing docs/MASTER-PLAN.md');
  });
});
