// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { scanSource, formatReport } from '../../../../scripts/i18n/find-untagged-strings.mjs';

describe('scanSource', () => {
  it('flags a static-text tag with no data-i18n marker', () => {
    const source = '<button type="button">Open GitHub issue</button>';

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([
      { file: 'shell.ts', line: 1, kind: 'text', tag: 'button', text: 'Open GitHub issue' },
    ]);
  });

  it('does not flag a static-text tag that already carries data-i18n', () => {
    const source = '<button type="button" data-i18n="flyIt">Fly it</button>';

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([]);
  });

  it('flags a literal aria-label with no data-i18n-aria marker', () => {
    const source = '<input id="search-q" aria-label="Search query or question" />';

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([
      {
        file: 'shell.ts',
        line: 1,
        kind: 'aria-label',
        tag: 'input',
        text: 'Search query or question',
      },
    ]);
  });

  it('does not flag an aria-label already paired with data-i18n-aria', () => {
    const source = '<nav class="switch" aria-label="Theme" data-i18n-aria="themeNav"></nav>';

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([]);
  });

  it('does not flag a dynamic aria-label built from a template interpolation', () => {
    const source = '<button aria-label="${tip}">${name}</button>';

    const findings = scanSource(source, 'shell-html.ts');

    expect(findings).toEqual([]);
  });

  it('flags a literal placeholder with no data-i18n-placeholder marker', () => {
    const source = '<input id="gh-issue-title" placeholder="Title" />';

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([
      { file: 'shell.ts', line: 1, kind: 'placeholder', tag: 'input', text: 'Title' },
    ]);
  });

  it('does not flag a tag mention inside a doc comment', () => {
    const source = [
      '/**',
      ' *  before appending each `<dd>`. */',
      'export function factsMeta() {}',
    ].join('\n');

    const findings = scanSource(source, 'card-facts.ts');

    expect(findings).toEqual([]);
  });

  it('reports the 1-based line number of the tag, not the match offset', () => {
    const source = ['const x = 1;', '<summary>Details</summary>'].join('\n');

    const findings = scanSource(source, 'shell.ts');

    expect(findings[0]?.line).toBe(2);
  });
});

describe('scanSource — el(tag, cls, text) DOM-builder calls (issue #16 scanner blind spot)', () => {
  it('flags a variable-assigned el() call with no later data-i18n tagging', () => {
    const source = "var rm = el('button', 'card-remove', 'Remove');";

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([
      { file: 'shell.ts', line: 1, kind: 'text', tag: 'button', text: 'Remove' },
    ]);
  });

  it('does not flag an el() call whose variable is tagged on the next line', () => {
    const source = [
      "var rm = el('button', 'card-remove', 'Remove');",
      "rm.setAttribute('data-i18n', 'removeCard');",
    ].join('\n');

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([]);
  });

  it('flags an inline el() call with no variable to ever tag (e.g. appendChild(el(...)))', () => {
    const source = "wrap.appendChild(el('p', 'focus-note', 'Focus locked'));";

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([
      { file: 'shell.ts', line: 1, kind: 'text', tag: 'p', text: 'Focus locked' },
    ]);
  });

  it('does not flag an el() call whose text argument is a variable, not a literal', () => {
    const source = "var e = el('span', extraClass, text);";

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([]);
  });

  it("does not let an unrelated variable's data-i18n tag suppress a different untagged one", () => {
    const source = [
      "var tagged = el('h3', 'detail-h', 'Languages');",
      "tagged.setAttribute('data-i18n', 'languages');",
      "var untagged = el('h3', 'detail-h', 'Directories');",
    ].join('\n');

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([
      { file: 'shell.ts', line: 3, kind: 'text', tag: 'h3', text: 'Directories' },
    ]);
  });

  it('does not flag a data-i18n-aria tag on the variable as if it were a text tag', () => {
    const source = [
      "var btn = el('button', null, 'Open');",
      "btn.setAttribute('data-i18n-aria', 'openLabel');",
    ].join('\n');

    const findings = scanSource(source, 'shell.ts');

    expect(findings).toEqual([
      { file: 'shell.ts', line: 1, kind: 'text', tag: 'button', text: 'Open' },
    ]);
  });
});

describe('scanSource — el() fixture meta-test (pins the combined contract in one realistic pass)', () => {
  it('finds exactly the untagged el() nodes in a composite fixture mirroring shell.ts patterns', () => {
    const fixture = [
      'function el(tag, cls, text) {',
      '  var e = document.createElement(tag);',
      '  if (cls) e.className = cls;',
      '  if (text != null) e.textContent = text;',
      '  return e;',
      '}',
      'function tipChip(text, tip, ariaLabel, extraClass) {',
      "  var e = el('span', extraClass ? 'chip ' + extraClass : 'chip', text);",
      "  e.setAttribute('data-tip', tip);",
      '  return e;',
      '}',
      "var rm = el('button', 'card-remove', 'Remove');",
      "rm.setAttribute('data-i18n', 'removeCard');",
      "var languagesH = el('h3', 'detail-h', 'Languages');",
      "languagesH.setAttribute('data-i18n', 'languages');",
      "wrap.appendChild(el('p', 'focus-note', 'Focus locked: flights work ONLY the focused task(s) until done.'));",
      "so.appendChild(el('span', 'muted', 'Resets firings + ship-rate counters to 0/0.'));",
      "var untaggedBtn = el('button', null, 'Propose edit');",
    ].join('\n');

    const findings = scanSource(fixture, 'fixture.ts');

    expect(findings).toEqual([
      {
        file: 'fixture.ts',
        line: 16,
        kind: 'text',
        tag: 'p',
        text: 'Focus locked: flights work ONLY the focused task(s) until done.',
      },
      {
        file: 'fixture.ts',
        line: 17,
        kind: 'text',
        tag: 'span',
        text: 'Resets firings + ship-rate counters to 0/0.',
      },
      { file: 'fixture.ts', line: 18, kind: 'text', tag: 'button', text: 'Propose edit' },
    ]);
  });
});

describe('formatReport', () => {
  it('reports zero findings when the scan is clean', () => {
    const report = formatReport([], 'apps/dashboard/src/web');

    expect(report).toBe('i18n:untagged: 0 untagged string(s) found under apps/dashboard/src/web');
  });

  it('lists each finding with its file, line, kind, tag, and text', () => {
    const findings = [
      { file: 'shell.ts', line: 5021, kind: 'text' as const, tag: 'label', text: 'Report a bug' },
    ];

    const report = formatReport(findings, 'apps/dashboard/src/web');

    expect(report).toContain('1 untagged string(s) found under apps/dashboard/src/web');
    expect(report).toContain('shell.ts:5021 [text] <label> "Report a bug"');
  });
});
