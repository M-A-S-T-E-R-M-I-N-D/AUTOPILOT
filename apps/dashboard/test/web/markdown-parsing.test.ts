// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the Docs viewer's pure Markdown line-
 * classification/parsing helpers (`web/markdown.ts`) — extracted under
 * epic 0002 "shell decomposition", slice 2. `docs-chart-svg.test.ts` already
 * regression-tests the SVG-embedding half indirectly through the rendered
 * DOM via `clientJs()`; these tests exercise the real functions directly.
 */

import { describe, it, expect } from 'vitest';
import {
  splitTableRow,
  isFence,
  isHeading,
  isListItem,
  isSvgStart,
  isTableStart,
  isBlockStart,
} from '../../src/web/markdown.js';

describe('splitTableRow', () => {
  it('splits cells and trims whitespace', () => {
    expect(splitTableRow('| a | b  |c|')).toEqual(['a', 'b', 'c']);
  });

  it('handles a row with no leading/trailing pipes', () => {
    expect(splitTableRow('a | b')).toEqual(['a', 'b']);
  });
});

describe('isFence', () => {
  it('matches a fenced code block delimiter', () => {
    expect(isFence('```')).toBe(true);
    expect(isFence('  ```ts')).toBe(true);
  });

  it('does not match a plain line', () => {
    expect(isFence('const x = 1;')).toBe(false);
  });
});

describe('isHeading', () => {
  it('matches ATX headings level 1 through 6', () => {
    expect(isHeading('# Title')).toBe(true);
    expect(isHeading('###### Deep')).toBe(true);
  });

  it('rejects a heading with no space after the hashes', () => {
    expect(isHeading('#NoSpace')).toBe(false);
  });

  it('rejects more than six hashes as a plain paragraph', () => {
    expect(isHeading('####### too many')).toBe(false);
  });
});

describe('isListItem', () => {
  it('matches bulleted list items', () => {
    expect(isListItem('- item')).toBe(true);
    expect(isListItem('* item')).toBe(true);
  });

  it('matches ordered list items', () => {
    expect(isListItem('1. item')).toBe(true);
    expect(isListItem('42. item')).toBe(true);
  });

  it('rejects a plain paragraph line', () => {
    expect(isListItem('just text')).toBe(false);
  });
});

describe('isSvgStart', () => {
  it('matches an opening <svg> tag with attributes', () => {
    expect(isSvgStart('<svg viewBox="0 0 1 1">')).toBe(true);
  });

  it('matches a bare <svg> tag case-insensitively', () => {
    expect(isSvgStart('  <SVG>')).toBe(true);
  });

  it('rejects an unrelated tag', () => {
    expect(isSvgStart('<div>')).toBe(false);
  });
});

describe('isTableStart', () => {
  it('recognizes a header row followed by a dash separator row', () => {
    const lines = ['| a | b |', '| -- | -- |', '| 1 | 2 |'];
    expect(isTableStart(lines, 0)).toBe(true);
  });

  it('recognizes alignment colons in the separator row', () => {
    const lines = ['| a | b |', '|:--|--:|'];
    expect(isTableStart(lines, 0)).toBe(true);
  });

  it('recognizes a minimal single-dash separator row (valid GFM)', () => {
    const lines = ['| a | b |', '| - | - |'];
    expect(isTableStart(lines, 0)).toBe(true);
  });

  it('rejects a row with no pipe', () => {
    expect(isTableStart(['plain text', '---'], 0)).toBe(false);
  });

  it('rejects a pipe row whose next line is not a separator', () => {
    const lines = ['| a | b |', 'not a separator'];
    expect(isTableStart(lines, 0)).toBe(false);
  });

  it('rejects a row that is the last line (no separator to check)', () => {
    expect(isTableStart(['| a | b |'], 0)).toBe(false);
  });
});

describe('isBlockStart', () => {
  it('treats a blank line as a block start', () => {
    expect(isBlockStart(['', 'x'], 0)).toBe(true);
  });

  it('treats a fence/heading/list item/svg/table row as a block start', () => {
    expect(isBlockStart(['```'], 0)).toBe(true);
    expect(isBlockStart(['## h'], 0)).toBe(true);
    expect(isBlockStart(['- item'], 0)).toBe(true);
    expect(isBlockStart(['<svg>'], 0)).toBe(true);
    expect(isBlockStart(['| a |', '| -- |'], 0)).toBe(true);
  });

  it('treats an ordinary paragraph line as not a block start', () => {
    expect(isBlockStart(['just some text'], 0)).toBe(false);
  });
});
