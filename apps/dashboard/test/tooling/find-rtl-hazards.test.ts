// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  scanCssSource,
  scanRoot,
  formatReport,
} from '../../../../scripts/i18n/find-rtl-hazards.mjs';

describe('scanCssSource', () => {
  it('flags a physical margin with its logical equivalent', () => {
    const source = '.card { margin-left: 8px; }';

    const findings = scanCssSource(source, 'layout-css.ts');

    expect(findings).toEqual([
      { file: 'layout-css.ts', line: 1, hazard: 'margin-left', suggestion: 'margin-inline-start' },
    ]);
  });

  it('flags a bare position offset as an inset-inline hazard', () => {
    const source = '.tip { position: absolute; right: 0; }';

    const findings = scanCssSource(source, 'layout-css.ts');

    expect(findings).toEqual([
      { file: 'layout-css.ts', line: 1, hazard: 'right', suggestion: 'inset-inline-end' },
    ]);
  });

  it('flags a physical border-radius corner', () => {
    const source = '.panel { border-top-left-radius: 4px; }';

    const findings = scanCssSource(source, 'layout-css.ts');

    expect(findings).toEqual([
      {
        file: 'layout-css.ts',
        line: 1,
        hazard: 'border-top-left-radius',
        suggestion: 'border-start-start-radius',
      },
    ]);
  });

  it('flags physical text-align and float values', () => {
    const source = ['.a { text-align: right; }', '.b { float: left; }'].join('\n');

    const findings = scanCssSource(source, 'layout-css.ts');

    expect(findings).toEqual([
      {
        file: 'layout-css.ts',
        line: 1,
        hazard: 'text-align: right',
        suggestion: 'text-align: end',
      },
      { file: 'layout-css.ts', line: 2, hazard: 'float: left', suggestion: 'float: inline-start' },
    ]);
  });

  it('does not flag logical properties or logical text-align values', () => {
    const source = [
      '.a { margin-inline-start: 8px; inset-inline-end: 0; }',
      '.b { text-align: start; border-inline-start: 1px solid; }',
    ].join('\n');

    const findings = scanCssSource(source, 'layout-css.ts');

    expect(findings).toEqual([]);
  });

  it('does not flag a line marked rtl-ok', () => {
    const source = '.pin { left: 0; } /* rtl-ok */';

    const findings = scanCssSource(source, 'layout-css.ts');

    expect(findings).toEqual([]);
  });

  it('reports the 1-based line number of the declaration', () => {
    const source = ['.a { color: red; }', '.b { padding-right: 4px; }'].join('\n');

    const findings = scanCssSource(source, 'layout-css.ts');

    expect(findings).toEqual([
      {
        file: 'layout-css.ts',
        line: 2,
        hazard: 'padding-right',
        suggestion: 'padding-inline-end',
      },
    ]);
  });
});

describe('formatReport', () => {
  it('reports zero findings when the scan is clean', () => {
    const report = formatReport([], 'apps/dashboard/src/web');

    expect(report).toBe(
      'i18n:rtl: 0 physical-direction CSS declaration(s) found under apps/dashboard/src/web',
    );
  });

  it('lists each finding with its file, line, hazard, and suggestion', () => {
    const findings = [
      { file: 'layout-css.ts', line: 58, hazard: 'right', suggestion: 'inset-inline-end' },
    ];

    const report = formatReport(findings, 'apps/dashboard/src/web');

    expect(report).toContain('1 physical-direction CSS declaration(s)');
    expect(report).toContain('layout-css.ts:58 right → use inset-inline-end');
  });
});

describe('the live dashboard CSS', () => {
  it('stays RTL-clean — the dir=rtl layout audit holds', () => {
    const webRoot = fileURLToPath(new URL('../../src/web', import.meta.url));

    const findings = scanRoot(webRoot);

    expect(findings).toEqual([]);
  });
});
