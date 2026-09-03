// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import {
  splitTopLevelRegions,
  reassembleRegions,
  writeRegionsToDisk,
  readRegionsFromDisk,
} from '../../../../scripts/codemod/split-top-level-regions.mjs';

const SHELL_TS = fileURLToPath(new URL('../../src/web/shell.ts', import.meta.url));

const FIXTURE = `// leading file comment
import { a } from './a.js';
import { b } from './b.js';

/** doc comment above a const */
export const X = 1;

function greet(name: string): string {
  return \`hi \${name}\`;
}

export class Widget {
  render() {
    return 'ok';
  }
}

interface Shape {
  area(): number;
}

type Id = string | number;

enum Color {
  Red,
  Blue,
}
`;

describe('splitTopLevelRegions', () => {
  it('produces one region per top-level statement', () => {
    const regions = splitTopLevelRegions(FIXTURE, 'fixture.ts');
    // 2 imports, 1 const, 1 function, 1 class, 1 interface, 1 type, 1 enum
    expect(regions).toHaveLength(8);
  });

  it('assigns ascending, gapless, non-overlapping indices', () => {
    const regions = splitTopLevelRegions(FIXTURE, 'fixture.ts');
    regions.forEach((region, i) => {
      expect(region.index).toBe(i);
      if (i > 0) expect(region.start).toBe(regions.at(i - 1)?.end);
    });
    expect(regions.at(0)?.start).toBe(0);
    expect(regions.at(-1)?.end).toBe(FIXTURE.length);
  });

  it('names regions after their declaration kind and identifier', () => {
    const regions = splitTopLevelRegions(FIXTURE, 'fixture.ts');
    expect(regions.map((r) => r.name)).toEqual([
      '0000-import',
      '0001-import',
      '0002-const-X',
      '0003-function-greet',
      '0004-class-Widget',
      '0005-interface-Shape',
      '0006-type-Id',
      '0007-enum-Color',
    ]);
  });

  it('reassembles to the exact original text, including comments and blank lines', () => {
    const regions = splitTopLevelRegions(FIXTURE, 'fixture.ts');
    expect(reassembleRegions(regions)).toBe(FIXTURE);
  });

  it('reassembles correctly regardless of input region order', () => {
    const regions = splitTopLevelRegions(FIXTURE, 'fixture.ts');
    const shuffled = [...regions].reverse();
    expect(reassembleRegions(shuffled)).toBe(FIXTURE);
  });

  it('handles a file with no top-level statements', () => {
    const empty = '// just a comment, no statements\n';
    const regions = splitTopLevelRegions(empty, 'empty.ts');
    expect(regions).toHaveLength(1);
    expect(reassembleRegions(regions)).toBe(empty);
  });

  it('handles a file with no trailing newline', () => {
    const noTrailingNewline = 'export const A = 1;\nexport const B = 2;';
    const regions = splitTopLevelRegions(noTrailingNewline, 'no-newline.ts');
    expect(reassembleRegions(regions)).toBe(noTrailingNewline);
  });

  it('splits the real apps/dashboard/src/web/shell.ts byte-for-byte', () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    const regions = splitTopLevelRegions(original, SHELL_TS);

    expect(regions.length).toBeGreaterThan(20);
    expect(reassembleRegions(regions)).toBe(original);
  });
});

describe('disk round trip', () => {
  let outputDir: string;

  afterEach(() => {
    if (outputDir) rmSync(outputDir, { recursive: true, force: true });
  });

  it('writes region files + a manifest that reassemble byte-for-byte off disk', () => {
    outputDir = mkdtempSync(path.join(tmpdir(), 'split-regions-'));
    const regions = splitTopLevelRegions(FIXTURE, 'fixture.ts');

    writeRegionsToDisk(regions, outputDir);
    const reassembled = readRegionsFromDisk(outputDir);

    expect(reassembled).toBe(FIXTURE);
  });

  it('round-trips the real shell.ts through disk byte-for-byte', () => {
    outputDir = mkdtempSync(path.join(tmpdir(), 'split-regions-shell-'));
    const original = readFileSync(SHELL_TS, 'utf8');
    const regions = splitTopLevelRegions(original, SHELL_TS);

    writeRegionsToDisk(regions, outputDir);
    const reassembled = readRegionsFromDisk(outputDir);

    expect(reassembled).toBe(original);
  });
});
