// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../../src/index/language.js';
import type { Language } from '@autopilot/store';

// Every EXTENSION_MAP entry, asserted individually so a mutant that drops or
// mis-maps a single key (e.g. 'kt' silently losing its 'kotlin' mapping)
// fails exactly one assertion instead of hiding behind a passing aggregate.
const EXTENSION_CASES: ReadonlyArray<readonly [string, Language]> = [
  ['ts', 'typescript'],
  ['tsx', 'typescript'],
  ['mts', 'typescript'],
  ['cts', 'typescript'],
  ['js', 'javascript'],
  ['jsx', 'javascript'],
  ['mjs', 'javascript'],
  ['cjs', 'javascript'],
  ['py', 'python'],
  ['go', 'go'],
  ['rs', 'rust'],
  ['java', 'java'],
  ['kt', 'kotlin'],
  ['kts', 'kotlin'],
  ['swift', 'swift'],
  ['rb', 'ruby'],
  ['php', 'php'],
  ['cs', 'csharp'],
  ['cpp', 'cpp'],
  ['cc', 'cpp'],
  ['cxx', 'cpp'],
  ['hpp', 'cpp'],
  ['c', 'c'],
  ['h', 'c'],
  ['sh', 'shell'],
  ['bash', 'shell'],
  ['html', 'html'],
  ['htm', 'html'],
  ['css', 'css'],
  ['scss', 'css'],
  ['sql', 'sql'],
  ['json', 'json'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
  ['toml', 'toml'],
  ['md', 'markdown'],
  ['markdown', 'markdown'],
];

describe('detectLanguage', () => {
  it.each(EXTENSION_CASES)('maps .%s to %s', (ext, language) => {
    expect(detectLanguage(`file.${ext}`)).toBe(language);
  });

  it('is case-insensitive on the extension', () => {
    expect(detectLanguage('Main.TS')).toBe('typescript');
    expect(detectLanguage('script.PY')).toBe('python');
  });

  it('degrades an unrecognized extension to "other"', () => {
    expect(detectLanguage('archive.unknownext')).toBe('other');
  });

  it('degrades a path with no extension at all to "other"', () => {
    expect(detectLanguage('Makefile')).toBe('other');
  });

  it('degrades a dot-less filename to "other" even when it spells a known extension', () => {
    // No '.', so lastIndexOf returns -1 and the early-return branch must
    // fire — a mutant that skips it would fall through to slice(dot + 1),
    // read the whole filename 'rs', and misclassify this as 'rust'.
    expect(detectLanguage('rs')).toBe('other');
  });

  it('extracts the extension correctly when the dot sits at index 1', () => {
    // Pins the -1 sentinel to exactly "no dot found" — a mutant comparing
    // `dot === 1` instead of `dot === -1` would misfire here and return
    // 'other' instead of the real extension.
    expect(detectLanguage('a.ts')).toBe('typescript');
  });

  it('treats a trailing dot with no characters after it as no extension', () => {
    expect(detectLanguage('weird.')).toBe('other');
  });

  it('uses only the extension after the LAST dot, not the first', () => {
    // A naive indexOf (vs lastIndexOf) would slice from the first dot and
    // read 'spec.ts' — not in the map — collapsing this to 'other'.
    expect(detectLanguage('component.spec.ts')).toBe('typescript');
  });

  it('resolves a nested repo-relative path the same as a bare filename', () => {
    expect(detectLanguage('src/deep/nested/module.go')).toBe('go');
  });
});
