// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure isLocalTarget() decision function of
 * scripts/docs/check-links.mjs, the CI gate that fails a run if a Markdown
 * file's relative link target does not resolve to a real file. `main()`
 * itself stays unimported — it walks the whole tree and reads package.json —
 * same stance apps/dashboard/test/tooling/validate-no-personal-paths.test.ts
 * takes for its sibling script.
 */
import { describe, it, expect } from 'vitest';
import { isLocalTarget } from '../../../../scripts/docs/check-links.mjs';

describe('isLocalTarget', () => {
  it('treats a bare repo-relative path as local', () => {
    expect(isLocalTarget('CONTRIBUTING.md')).toBe(true);
  });

  it('treats a nested relative path as local', () => {
    expect(isLocalTarget('../../docs/epics/0001-foo.md')).toBe(true);
  });

  it('rejects an empty target', () => {
    expect(isLocalTarget('')).toBe(false);
  });

  it('rejects an http(s) URL', () => {
    expect(isLocalTarget('https://github.com/example/repo')).toBe(false);
    expect(isLocalTarget('http://example.com')).toBe(false);
  });

  it('rejects a mailto: link', () => {
    expect(isLocalTarget('mailto:someone@example.com')).toBe(false);
  });

  it('rejects any other URL scheme', () => {
    expect(isLocalTarget('ftp://example.com/file')).toBe(false);
  });

  it('rejects a pure in-page anchor', () => {
    expect(isLocalTarget('#section-heading')).toBe(false);
  });

  it('rejects a protocol-relative URL', () => {
    expect(isLocalTarget('//example.com/path')).toBe(false);
  });

  it('treats a relative path with a trailing anchor as local (the anchor is stripped by the caller)', () => {
    expect(isLocalTarget('README.md#install')).toBe(true);
  });
});
