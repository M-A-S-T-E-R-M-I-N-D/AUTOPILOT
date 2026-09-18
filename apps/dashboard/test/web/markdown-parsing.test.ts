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
  blockquoteText,
  isHr,
  headingOf,
  headingSlug,
  fenceLang,
  tableAlignments,
  listItemOf,
  taskOf,
  inlineTokens,
  resolveDocLink,
  classifyHref,
  calloutKind,
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

/*
 * THE PARITY SLICE (operator, 2026-09-18): the helpers the docs reader gained
 * for quotes, rules, task lists, nested lists, strikethrough, fence labels,
 * heading anchors, aligned tables and self-resolved links. Boundaries are
 * pinned on purpose — the `dashboard-markdown` mutation config holds this
 * file to 100%.
 */

describe('isListItem — the markers CommonMark allows', () => {
  it('accepts -, *, + and numbered 1. / 1) markers followed by a space', () => {
    for (const line of ['- a', '* a', '+ a', '1. a', '12) a', '   - nested']) {
      expect(isListItem(line), line).toBe(true);
    }
  });

  it('rejects a marker with no space after it, and plain prose', () => {
    expect(isListItem('-a')).toBe(false);
    expect(isListItem('1.a')).toBe(false);
    expect(isListItem('a - b')).toBe(false);
  });
});

describe('blockquoteText', () => {
  it('strips the marker and ONE optional space, keeping the rest verbatim', () => {
    expect(blockquoteText('> quoted')).toBe('quoted');
    expect(blockquoteText('>quoted')).toBe('quoted');
    expect(blockquoteText('>  two spaces')).toBe(' two spaces');
    expect(blockquoteText('>')).toBe('');
  });

  it('allows up to three leading spaces, and answers null for anything else', () => {
    expect(blockquoteText('   > deep')).toBe('deep');
    expect(blockquoteText('    > code')).toBeNull();
    expect(blockquoteText('a > b')).toBeNull();
    expect(blockquoteText('')).toBeNull();
  });
});

describe('isHr', () => {
  it('is three or more of the same -, * or _, spaces allowed between', () => {
    for (const line of ['---', '***', '___', '- - -', '  ----', '* * * *']) {
      expect(isHr(line), line).toBe(true);
    }
  });

  it('is NOT two markers, a mixed run, a table separator, or trailing text', () => {
    for (const line of ['--', '-*-', '|---|', '--- x', '    ---', '']) {
      expect(isHr(line), line).toBe(false);
    }
  });
});

describe('headingOf and headingSlug', () => {
  it('reads the level and the text, dropping a closing run of hashes', () => {
    expect(headingOf('# Title')).toEqual({ level: 1, text: 'Title' });
    expect(headingOf('### Deep one ###')).toEqual({ level: 3, text: 'Deep one' });
    expect(headingOf('###### Six')).toEqual({ level: 6, text: 'Six' });
  });

  it('is null for seven hashes, a missing space, or prose', () => {
    expect(headingOf('####### Seven')).toBeNull();
    expect(headingOf('#Nope')).toBeNull();
    expect(headingOf('Title')).toBeNull();
  });

  it('slugs like GitHub: lowercase, punctuation dropped, whitespace runs to one hyphen, every script kept', () => {
    expect(headingSlug('Hello, World!')).toBe('hello-world');
    expect(headingSlug('  Two   words ')).toBe('two-words');
    expect(headingSlug('Keep-hyphens_not_underscores')).toBe('keep-hyphensnotunderscores');
    expect(headingSlug('שלום עולם')).toBe('שלום-עולם');
    expect(headingSlug('v1.2 Notes')).toBe('v12-notes');
  });
});

describe('fenceLang', () => {
  it('reads the info string, lowercased, and is empty for a bare fence', () => {
    expect(fenceLang('```ts')).toBe('ts');
    expect(fenceLang('  ``` Mermaid')).toBe('mermaid');
    expect(fenceLang('```c++')).toBe('c++');
    expect(fenceLang('```')).toBe('');
  });

  it('is empty for a line that is not a fence at all', () => {
    expect(fenceLang('const x = 1;')).toBe('');
  });
});

describe('tableAlignments', () => {
  it('reads start / center / end from the colons, null where there are none', () => {
    expect(tableAlignments('| :--- | :---: | ---: | --- |')).toEqual([
      'start',
      'center',
      'end',
      null,
    ]);
    expect(tableAlignments(':-|-:')).toEqual(['start', 'end']);
  });
});

describe('listItemOf', () => {
  it('measures the indent in columns (a tab is four), reads the marker kind and the text', () => {
    expect(listItemOf('- item')).toEqual({ indent: 0, ordered: false, text: 'item' });
    expect(listItemOf('  * two in')).toEqual({ indent: 2, ordered: false, text: 'two in' });
    expect(listItemOf('\t1. tabbed')).toEqual({ indent: 4, ordered: true, text: 'tabbed' });
    expect(listItemOf('3) paren')).toEqual({ indent: 0, ordered: true, text: 'paren' });
  });

  it('answers the whole line, indent 0, unordered, for a line that is not an item', () => {
    expect(listItemOf('prose')).toEqual({ indent: 0, ordered: false, text: 'prose' });
  });
});

describe('taskOf', () => {
  it('reads an unchecked, a lowercase-checked and an uppercase-checked task', () => {
    expect(taskOf('[ ] todo')).toEqual({ checked: false, text: 'todo' });
    expect(taskOf('[x] done')).toEqual({ checked: true, text: 'done' });
    expect(taskOf('[X] done')).toEqual({ checked: true, text: 'done' });
  });

  it('an empty task is still a task; a bracket that is not a task box is not', () => {
    expect(taskOf('[ ]')).toEqual({ checked: false, text: '' });
    expect(taskOf('[y] nope')).toBeNull();
    expect(taskOf('[ ]nospace')).toBeNull();
    expect(taskOf('plain')).toBeNull();
  });
});

describe('inlineTokens', () => {
  it('splits code, links, images, bold (both spellings), italic (both), strikethrough and text, in order', () => {
    expect(inlineTokens('a `co` [li](uu) ![im](p.png) **bb** __b2__ ~~ss~~ *ee* _e2_ z')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'code', text: 'co' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'li', href: 'uu' },
      { type: 'text', text: ' ' },
      { type: 'image', text: 'im', href: 'p.png' },
      { type: 'text', text: ' ' },
      { type: 'strong', text: 'bb' },
      { type: 'text', text: ' ' },
      { type: 'strong', text: 'b2' },
      { type: 'text', text: ' ' },
      { type: 'strike', text: 'ss' },
      { type: 'text', text: ' ' },
      { type: 'em', text: 'ee' },
      { type: 'text', text: ' ' },
      { type: 'em', text: 'e2' },
      { type: 'text', text: ' z' },
    ]);
  });

  it('a run with no markup is one text token; an image may have an empty alt', () => {
    expect(inlineTokens('plain words')).toEqual([{ type: 'text', text: 'plain words' }]);
    expect(inlineTokens('![](x.png)')).toEqual([{ type: 'image', text: '', href: 'x.png' }]);
    expect(inlineTokens('')).toEqual([]);
  });
});

describe('resolveDocLink', () => {
  it('resolves a relative path against the document directory, honouring . and ..', () => {
    expect(resolveDocLink('docs/a/b.md', 'c.md')).toBe('docs/a/c.md');
    expect(resolveDocLink('docs/a/b.md', './c.md')).toBe('docs/a/c.md');
    expect(resolveDocLink('docs/a/b.md', '../c.md')).toBe('docs/c.md');
    expect(resolveDocLink('docs/a/b.md', '../../README.md')).toBe('README.md');
    expect(resolveDocLink('README.md', 'docs/x.md')).toBe('docs/x.md');
  });

  it('drops a fragment or query on the link — the viewer opens whole files', () => {
    expect(resolveDocLink('docs/a.md', 'b.md#part')).toBe('docs/b.md');
    expect(resolveDocLink('docs/a.md', 'b.md?x=1')).toBe('docs/b.md');
  });

  it('is null for a scheme, a root-absolute path, a bare fragment, an empty target, or a climb above the repository', () => {
    expect(resolveDocLink('docs/a.md', 'https://x.test/y')).toBeNull();
    expect(resolveDocLink('docs/a.md', 'mailto:someone')).toBeNull();
    expect(resolveDocLink('docs/a.md', '/etc/passwd')).toBeNull();
    expect(resolveDocLink('docs/a.md', '#part')).toBeNull();
    expect(resolveDocLink('docs/a.md', '')).toBeNull();
    expect(resolveDocLink('docs/a.md', '../../x.md')).toBeNull();
    expect(resolveDocLink('README.md', '../x.md')).toBeNull();
  });
});

describe('classifyHref', () => {
  it('http and https are external; a fragment is an anchor by slug; a relative path is a doc', () => {
    expect(classifyHref('https://x.test/y', 'docs/a.md')).toEqual({
      kind: 'external',
      target: 'https://x.test/y',
    });
    expect(classifyHref('HTTP://x.test', 'docs/a.md')).toEqual({
      kind: 'external',
      target: 'HTTP://x.test',
    });
    expect(classifyHref('#Some Heading', 'docs/a.md')).toEqual({
      kind: 'anchor',
      target: 'some-heading',
    });
    expect(classifyHref('b.md', 'docs/a.md')).toEqual({ kind: 'doc', target: 'docs/b.md' });
  });

  it('everything else is plain text: javascript:, data:, a bare #, a climb out of the repository', () => {
    expect(classifyHref('javascript:alert(1)', 'docs/a.md')).toEqual({ kind: 'text' });
    expect(classifyHref('data:text/html,x', 'docs/a.md')).toEqual({ kind: 'text' });
    expect(classifyHref('#', 'docs/a.md')).toEqual({ kind: 'text' });
    expect(classifyHref('../../x.md', 'docs/a.md')).toEqual({ kind: 'text' });
  });
});

describe('isBlockStart — the new block kinds end a paragraph too', () => {
  it('a rule or a quote line starts a block', () => {
    expect(isBlockStart(['text', '---'], 1)).toBe(true);
    expect(isBlockStart(['text', '> quote'], 1)).toBe(true);
    expect(isBlockStart(['text', 'more text'], 1)).toBe(false);
  });
});

describe('the pre-existing helpers, now under the mutation gate — the boundaries they never had', () => {
  it('splitTableRow trims the whole line first, so outer whitespace is not a cell', () => {
    expect(splitTableRow('  | a | b |  ')).toEqual(['a', 'b']);
  });

  it('isFence and isSvgStart are anchored at the start of the line', () => {
    expect(isFence('text ```')).toBe(false);
    expect(isSvgStart('x <svg>')).toBe(false);
  });

  it('isTableStart: a header row without a following separator, or as the last line, is not a table', () => {
    expect(isTableStart(['| a |'], 0)).toBe(false);
    expect(isTableStart([], 0)).toBe(false);
    expect(isTableStart(['| a |', 'prose'], 0)).toBe(false);
  });

  it('isTableStart: the separator may carry spaces, alignment colons, and skip the outer pipes — but nothing else', () => {
    expect(isTableStart(['| a | b |', '| --- | :-: |'], 0)).toBe(true);
    expect(isTableStart(['| a | b |', '|---|---|'], 0)).toBe(true);
    expect(isTableStart(['a | b', ' --- | ---: '], 0)).toBe(true);
    expect(isTableStart([' | a |', ' | --- | '], 0)).toBe(true);
    expect(isTableStart(['| a |', 'x |---|'], 0)).toBe(false);
    expect(isTableStart(['| a |', '|---| x'], 0)).toBe(false);
  });

  it('isBlockStart: a whitespace-only line starts a block, and so does the end of the input', () => {
    expect(isBlockStart(['   '], 0)).toBe(true);
    expect(isBlockStart(['text'], 1)).toBe(true);
  });
});

describe('the new helpers — the boundaries the first mutation run exposed', () => {
  it('a heading keeps only ONE space between the hashes and the text, and drops trailing spaces after closing hashes', () => {
    expect(headingOf('#  Two')).toEqual({ level: 1, text: 'Two' });
    expect(headingOf('## T ##  ')).toEqual({ level: 2, text: 'T' });
  });

  it('a rule may end in trailing whitespace', () => {
    expect(isHr('--- ')).toBe(true);
  });

  it('fenceLang, listItemOf and taskOf are anchored at the start', () => {
    expect(fenceLang('x ```ts')).toBe('');
    expect(listItemOf('x - y')).toEqual({ indent: 0, ordered: false, text: 'x - y' });
    expect(taskOf('x [ ] y')).toBeNull();
  });

  it('a list item or a task keeps only ONE space after its marker; a multi-digit marker is numbered', () => {
    expect(listItemOf('-  two')).toEqual({ indent: 0, ordered: false, text: 'two' });
    expect(listItemOf('12. a')).toEqual({ indent: 0, ordered: true, text: 'a' });
    expect(taskOf('[ ]  two')).toEqual({ checked: false, text: 'two' });
  });

  it('resolveDocLink: a colon later in a path is not a scheme, a trailing # is dropped, an empty segment is skipped', () => {
    expect(resolveDocLink('docs/a.md', 'notes/time:table.md')).toBe('docs/notes/time:table.md');
    expect(resolveDocLink('docs/a.md', 'b.md#')).toBe('docs/b.md');
    expect(resolveDocLink('docs/a.md', 'a//b.md')).toBe('docs/a/b.md');
  });

  it('classifyHref: only a leading http(s) is external — a scheme that merely contains one is text', () => {
    expect(classifyHref('mailto:https://x', 'docs/a.md')).toEqual({ kind: 'text' });
  });
});

describe('calloutKind', () => {
  it('reads all five GitHub alert kinds, case-insensitively', () => {
    expect(calloutKind('[!NOTE]')).toBe('note');
    expect(calloutKind('[!TIP]')).toBe('tip');
    expect(calloutKind('[!IMPORTANT]')).toBe('important');
    expect(calloutKind('[!WARNING]')).toBe('warning');
    expect(calloutKind('[!CAUTION]')).toBe('caution');
    expect(calloutKind('[!note]')).toBe('note');
    expect(calloutKind('[!NoTe]')).toBe('note');
  });

  it('tolerates surrounding and trailing whitespace, nothing else on the line', () => {
    expect(calloutKind('  [!NOTE]  ')).toBe('note');
    expect(calloutKind('[!NOTE] ')).toBe('note');
  });

  it('is null for a marker that is not the WHOLE line, an unknown kind, or plain text', () => {
    expect(calloutKind('[!NOTE] extra text')).toBeNull();
    expect(calloutKind('prefix [!NOTE]')).toBeNull();
    expect(calloutKind('[!BOGUS]')).toBeNull();
    expect(calloutKind('plain quoted text')).toBeNull();
    expect(calloutKind('')).toBeNull();
    expect(calloutKind('[!]')).toBeNull();
  });
});
