// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { validateDocsWritePath } from '../src/docs-write-guard.js';

describe('validateDocsWritePath', () => {
  it('accepts a path under docs/', () => {
    const result = validateDocsWritePath('docs/epics/0023-docs-reader.md');
    expect(result).toEqual({ ok: true, path: 'docs/epics/0023-docs-reader.md' });
  });

  it('accepts README.md exactly', () => {
    expect(validateDocsWritePath('README.md')).toEqual({ ok: true, path: 'README.md' });
  });

  it('accepts CHANGELOG.md exactly', () => {
    expect(validateDocsWritePath('CHANGELOG.md')).toEqual({ ok: true, path: 'CHANGELOG.md' });
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateDocsWritePath('  docs/README.md  ')).toEqual({
      ok: true,
      path: 'docs/README.md',
    });
  });

  it('refuses a missing path', () => {
    expect(validateDocsWritePath(undefined).ok).toBe(false);
  });

  it('refuses a non-string path', () => {
    expect(validateDocsWritePath(42).ok).toBe(false);
  });

  it('refuses an empty or whitespace-only path', () => {
    expect(validateDocsWritePath('   ').ok).toBe(false);
  });

  it('refuses a path outside the allow-list', () => {
    const result = validateDocsWritePath('src/index.ts');
    expect(result).toEqual({ ok: false, error: 'only Markdown files can be edited' });
  });

  it('refuses a non-Markdown path even under docs/', () => {
    const result = validateDocsWritePath('docs/screens/fleet-light.png');
    expect(result).toEqual({ ok: false, error: 'only Markdown files can be edited' });
  });

  it('refuses a path that climbs out of the repo with ..', () => {
    const result = validateDocsWritePath('docs/../../etc/passwd.md');
    expect(result.ok).toBe(false);
  });

  it('refuses an absolute unix path', () => {
    expect(validateDocsWritePath('/etc/passwd.md').ok).toBe(false);
  });

  it('refuses an absolute windows path', () => {
    expect(validateDocsWritePath('C:/Windows/System32/evil.md').ok).toBe(false);
  });

  it('refuses a path with backslashes', () => {
    expect(validateDocsWritePath('docs\\epics\\0023.md').ok).toBe(false);
  });

  it('refuses a path with an empty segment (double slash)', () => {
    expect(validateDocsWritePath('docs//readme.md').ok).toBe(false);
  });

  it('refuses a docs-prefixed-looking sibling directory', () => {
    // "docsx/" starts with "docs" but not the "docs/" prefix this guard requires.
    expect(validateDocsWritePath('docsx/notes.md').ok).toBe(false);
  });

  it('refuses a bare "docs/" with no filename', () => {
    expect(validateDocsWritePath('docs/').ok).toBe(false);
  });

  it('is case-insensitive on the .md extension', () => {
    expect(validateDocsWritePath('docs/README.MD').ok).toBe(true);
  });
});
