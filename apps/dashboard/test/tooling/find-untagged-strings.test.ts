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
