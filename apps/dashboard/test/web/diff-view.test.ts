// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure diff-line classifier (`web/diff-view.ts`)
 * — Firing Replay viewer, diff-capture slice (BOARD web-msnt26yk-5fzo6j).
 */

import { describe, it, expect } from 'vitest';
import { diffLineClass, diffLinesForStep, diffToggleTip } from '../../src/web/diff-view.js';

describe('diffLineClass', () => {
  it('classifies an added line', () => {
    expect(diffLineClass('+  const x = 1;')).toBe('diff-add');
  });

  it('classifies a removed line', () => {
    expect(diffLineClass('-  const x = 2;')).toBe('diff-remove');
  });

  it('classifies a hunk header', () => {
    expect(diffLineClass('@@ -1,3 +1,4 @@')).toBe('diff-hunk');
  });

  it('classifies the +++/--- file headers as diff-file, not diff-add/diff-remove', () => {
    expect(diffLineClass('+++ b/src/a.ts')).toBe('diff-file');
    expect(diffLineClass('--- a/src/a.ts')).toBe('diff-file');
  });

  it('classifies the "diff --git" and "index" preamble lines as diff-meta', () => {
    expect(diffLineClass('diff --git a/src/a.ts b/src/a.ts')).toBe('diff-meta');
    expect(diffLineClass('index abc123..def456 100644')).toBe('diff-meta');
  });

  it('classifies everything else (commit message, context lines) as diff-context', () => {
    expect(diffLineClass('    a context line')).toBe('diff-context');
    expect(diffLineClass('feat: add a widget')).toBe('diff-context');
    expect(diffLineClass('')).toBe('diff-context');
  });
});

const MULTI_FILE_PATCH = [
  'commit abc123',
  'Author: A <a@example.com>',
  '',
  '    feat: add a widget',
  '',
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' line1',
  '+added line',
  ' line2',
  'diff --git a/src/b.ts b/src/b.ts',
  'index 333..444 100644',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
  '@@ -1,1 +1,1 @@',
  '-old',
  '+new',
];

describe('diffLinesForStep', () => {
  it('narrows a multi-file patch down to the target file’s own hunk', () => {
    expect(diffLinesForStep(MULTI_FILE_PATCH, 'src/a.ts')).toEqual([
      'diff --git a/src/a.ts b/src/a.ts',
      'index 111..222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,3 @@',
      ' line1',
      '+added line',
      ' line2',
    ]);
  });

  it('narrows to the second file when it is the target, running to end of patch', () => {
    expect(diffLinesForStep(MULTI_FILE_PATCH, 'src/b.ts')).toEqual([
      'diff --git a/src/b.ts b/src/b.ts',
      'index 333..444 100644',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ]);
  });

  it('returns the full patch unchanged when no target is given', () => {
    expect(diffLinesForStep(MULTI_FILE_PATCH, null)).toBe(MULTI_FILE_PATCH);
    expect(diffLinesForStep(MULTI_FILE_PATCH, undefined)).toBe(MULTI_FILE_PATCH);
  });

  it('falls back to the full patch when the target matches no file section (e.g. a search term)', () => {
    expect(diffLinesForStep(MULTI_FILE_PATCH, 'TODO')).toBe(MULTI_FILE_PATCH);
    expect(diffLinesForStep(MULTI_FILE_PATCH, 'src/c.ts')).toBe(MULTI_FILE_PATCH);
  });
});

describe('diffToggleTip', () => {
  it('explains what clicking will reveal when the diff is closed', () => {
    expect(diffToggleTip(false)).toBe(
      "Show this firing's code diff — the git commit patch it shipped",
    );
  });

  it('explains what clicking will do when the diff is already open', () => {
    expect(diffToggleTip(true)).toBe('Hide this diff');
  });
});
