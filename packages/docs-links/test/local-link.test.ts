// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure Markdown local-link resolution this
 * package exists to share between `scripts/docs/check-links.mjs` and the
 * docs reader panel (epic 0023 slice 1). `isLocalTarget`'s own cases mirror
 * `apps/dashboard/test/tooling/check-links.test.ts` (now re-exported through
 * the script, not reimplemented) so the two suites can never silently drift
 * off the same contract.
 */
import { sep } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  isLocalTarget,
  extractLinkTargets,
  localLinkTargets,
  resolveLocalLinkPath,
} from '../src/local-link.js';

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

describe('extractLinkTargets', () => {
  it('returns every link target in document order', () => {
    const markdown = 'See [A](one.md) then [B](two.md "Two").';
    expect(extractLinkTargets(markdown)).toEqual(['one.md', 'two.md']);
  });

  it('returns an empty list when the text has no links', () => {
    expect(extractLinkTargets('plain text, no links here')).toEqual([]);
  });
});

describe('localLinkTargets', () => {
  it('filters out non-local targets, keeping local ones in order', () => {
    const markdown = '[ext](https://example.com) [local](../README.md) [anchor](#top)';
    expect(localLinkTargets(markdown)).toEqual(['../README.md']);
  });
});

describe('resolveLocalLinkPath', () => {
  it('resolves a target relative to the directory of the referring file', () => {
    expect(resolveLocalLinkPath('docs/epics/0023-docs-reader.md', '../README.md')).toBe(
      normalizeForPlatform('docs/README.md'),
    );
  });

  it('resolves a same-directory target', () => {
    expect(resolveLocalLinkPath('README.md', 'CONTRIBUTING.md')).toBe(
      normalizeForPlatform('CONTRIBUTING.md'),
    );
  });

  it('strips a trailing #anchor before resolving', () => {
    expect(resolveLocalLinkPath('README.md', 'CONTRIBUTING.md#setup')).toBe(
      normalizeForPlatform('CONTRIBUTING.md'),
    );
  });

  it('returns null when the target is only an anchor', () => {
    expect(resolveLocalLinkPath('README.md', '#top')).toBeNull();
  });
});

/** node:path's `join`/`normalize` use the platform separator — match that in
 *  the expectation instead of hardcoding one, so the suite is honest on both
 *  POSIX and Windows CI runners. */
function normalizeForPlatform(posixPath: string): string {
  return posixPath.split('/').join(sep);
}
