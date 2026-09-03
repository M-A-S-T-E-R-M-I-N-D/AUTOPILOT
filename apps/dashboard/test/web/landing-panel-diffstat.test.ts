// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the LANDING diffstat/commit-files math
 * (`web/landing-panel.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2, fifty-third cut. `landing-panel.test.ts` only
 * ever exercised the plural (`filesChanged: 3`, multi-file commit) and
 * "no landing" branches through the real client bundle; the singular
 * "1 file"/"1 insertion" branches, the >8-files truncation, and the
 * empty-file-list fallback had no coverage at all before this.
 */

import { describe, it, expect } from 'vitest';
import { landingDiffstatItems, landingCommitFilesMeta } from '../../src/web/landing-panel.js';

describe('landingDiffstatItems', () => {
  it('pluralizes "files" and orders the three chips text/tip/aria-label', () => {
    const items = landingDiffstatItems({ filesChanged: 3, insertions: 42, deletions: 7 });

    expect(items).toEqual([
      ['3 files', 'Files touched across every unmerged commit', '3 files changed'],
      ['+42', 'Lines added', '42 insertions', 'landing-ins'],
      ['-7', 'Lines removed', '7 deletions', 'landing-del'],
    ]);
  });

  it('uses the singular "1 file" for a single changed file', () => {
    const items = landingDiffstatItems({ filesChanged: 1, insertions: 1, deletions: 0 });

    expect(items[0]?.[0]).toBe('1 file');
  });

  it('renders zero diffstat counts honestly', () => {
    const items = landingDiffstatItems({ filesChanged: 0, insertions: 0, deletions: 0 });

    expect(items).toEqual([
      ['0 files', 'Files touched across every unmerged commit', '0 files changed'],
      ['+0', 'Lines added', '0 insertions', 'landing-ins'],
      ['-0', 'Lines removed', '0 deletions', 'landing-del'],
    ]);
  });
});

describe('landingCommitFilesMeta', () => {
  it('pluralizes the label and joins short file lists into the tip', () => {
    const meta = landingCommitFilesMeta(['a.ts', 'b.ts']);

    expect(meta.label).toBe('2 files');
    expect(meta.tip).toBe('a.ts, b.ts');
  });

  it('uses the singular "1 file" for one file', () => {
    const meta = landingCommitFilesMeta(['a.ts']);

    expect(meta.label).toBe('1 file');
    expect(meta.tip).toBe('a.ts');
  });

  it('truncates the tip to the first 8 files with a trailing ellipsis', () => {
    const files = Array.from({ length: 10 }, (_, i) => 'file' + i + '.ts');

    const meta = landingCommitFilesMeta(files);

    expect(meta.label).toBe('10 files');
    expect(meta.tip).toBe(
      'file0.ts, file1.ts, file2.ts, file3.ts, file4.ts, file5.ts, file6.ts, file7.ts…',
    );
  });

  it('falls back to an honest message when the commit carries no file list', () => {
    const meta = landingCommitFilesMeta([]);

    expect(meta.label).toBe('0 files');
    expect(meta.tip).toBe('No file list for this commit');
  });
});
