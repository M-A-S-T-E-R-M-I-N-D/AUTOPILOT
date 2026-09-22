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
  localLinkPaths,
  withoutCode,
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

describe('localLinkPaths', () => {
  it('resolves every local link to a forward-slash repo-relative path, skipping non-local ones', () => {
    const markdown =
      'See [the plan](../PLAN.md) and [external](https://example.com), also [anchor](#top).';
    expect(localLinkPaths(markdown, 'docs/epics/0023-docs-reader.md')).toEqual(['docs/PLAN.md']);
  });

  it('keeps a repeated target for each occurrence, in document order', () => {
    const markdown = '[A](one.md) [B](two.md) [A again](one.md)';
    expect(localLinkPaths(markdown, 'README.md')).toEqual(['one.md', 'two.md', 'one.md']);
  });

  it('returns an empty list when the markdown has no local links', () => {
    expect(localLinkPaths('[ext](https://example.com)', 'README.md')).toEqual([]);
  });
});

/** node:path's `join`/`normalize` use the platform separator — match that in
 *  the expectation instead of hardcoding one, so the suite is honest on both
 *  POSIX and Windows CI runners. */
function normalizeForPlatform(posixPath: string): string {
  return posixPath.split('/').join(sep);
}

describe('extractLinkTargets stays linear on hostile input (CodeQL js/polynomial-redos)', () => {
  it('scans runs of brackets and of `[](!` in bounded time and finds nothing in them', () => {
    for (const hostile of ['['.repeat(20_000), '[](' + '[](!'.repeat(6_000)]) {
      const startedAt = Date.now();
      expect(extractLinkTargets(hostile)).toEqual([]);
      expect(Date.now() - startedAt).toBeLessThan(200);
    }
  });

  it('a `[` inside a target is not a link — the class that keeps the scan linear', () => {
    expect(extractLinkTargets('[a](x[1].md) [b](y.md)')).toEqual(['y.md']);
  });
});

/**
 * A LINK INSIDE BACKTICKS IS AN EXAMPLE (2026-09-22). A publicity draft
 * explained where to insert an entry in somebody else's README — "right
 * before the `## [AutoPR](...)` heading" — and the CI link check called `...`
 * a broken relative link and reddened a landing. The docs reader shares this
 * module, so the same example was painted as a dead link in the UI. The span
 * in that draft WRAPPED A LINE, which is how a first, line-by-line attempt at
 * this still missed it.
 */
describe('withoutCode', () => {
  it('blanks an inline code span but keeps the prose around it', () => {
    const markdown = 'see `a code span` here';
    const blanked = withoutCode(markdown);
    expect(blanked).toHaveLength(markdown.length);
    expect(blanked).not.toContain('`');
    expect(blanked).not.toContain('code span');
    expect(blanked.startsWith('see ')).toBe(true);
    expect(blanked.endsWith(' here')).toBe(true);
  });

  it('blanks a span that wraps a line — the case that reddened the landing', () => {
    const markdown =
      'before `AutoG < AUTOPILOT <\nAutoPR` — drop it before the `## [AutoPR](...)` heading.';
    expect(extractLinkTargets(markdown)).toEqual([]);
  });

  it('still finds a real link on the same line as a code span', () => {
    expect(extractLinkTargets('`code` and [a doc](README.md) together')).toEqual(['README.md']);
  });

  it('blanks a fenced block, so an example link inside it is not a link', () => {
    const markdown = '```md\n[not a link](nowhere.md)\n```\n[real](README.md)\n';
    expect(extractLinkTargets(markdown)).toEqual(['README.md']);
  });

  it('closes a fence only on the same character and at least the same length', () => {
    const markdown = '````\n[a](x.md)\n```\n[b](y.md)\n````\n[c](z.md)\n';
    expect(extractLinkTargets(markdown)).toEqual(['z.md']);
  });

  it('treats an unterminated fence as running to the end, the way a renderer does', () => {
    expect(extractLinkTargets('```\n[a](x.md)\n')).toEqual([]);
  });

  it('leaves a lone backtick alone rather than swallowing every link after it', () => {
    expect(extractLinkTargets('a stray ` tick then [a doc](README.md)')).toEqual(['README.md']);
  });

  it('stops a span at a blank line, as a paragraph break does', () => {
    expect(extractLinkTargets('open ` here\n\n[a doc](README.md)')).toEqual(['README.md']);
  });

  it('handles a double-backtick span containing a single backtick', () => {
    expect(extractLinkTargets('``a ` b [x](y.md)`` then [z](w.md)')).toEqual(['w.md']);
  });

  it('keeps the document length and every newline, so offsets still line up', () => {
    const markdown = 'a `b`\n```\nc\n```\nd\n';
    const blanked = withoutCode(markdown);
    expect(blanked).toHaveLength(markdown.length);
    expect(blanked.split('\n')).toHaveLength(markdown.split('\n').length);
  });

  it('leaves a document with no code at all untouched', () => {
    const markdown = '# Title\n\n[a doc](README.md)\n';
    expect(withoutCode(markdown)).toBe(markdown);
  });
});
