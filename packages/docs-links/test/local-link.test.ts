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

  // A renderer reads a link target as a URL: GitHub opens `My%20Notes.md` as
  // the file `My Notes.md` and serves `shot.png?raw=true` as `shot.png`. Taken
  // literally, both named a file that does not exist, so the docs reader
  // painted a working link "(broken link)" in any project whose docs wrote one.
  it('decodes a percent-encoded target, the file a renderer opens', () => {
    expect(resolveLocalLinkPath('docs/index.md', 'My%20Notes.md')).toBe(
      normalizeForPlatform('docs/My Notes.md'),
    );
  });

  it('strips a ?query suffix before resolving', () => {
    expect(resolveLocalLinkPath('README.md', 'docs/shot.png?raw=true')).toBe(
      normalizeForPlatform('docs/shot.png'),
    );
  });

  it('strips a query that comes before an anchor', () => {
    expect(resolveLocalLinkPath('README.md', 'guide.md?plain=1#setup')).toBe(
      normalizeForPlatform('guide.md'),
    );
  });

  it('keeps an encoded # or ? as part of the file name', () => {
    expect(resolveLocalLinkPath('README.md', 'c%23-notes.md')).toBe(
      normalizeForPlatform('c#-notes.md'),
    );
    expect(resolveLocalLinkPath('README.md', 'why%3F.md')).toBe(normalizeForPlatform('why?.md'));
  });

  it('keeps a malformed percent sequence as written instead of throwing', () => {
    expect(resolveLocalLinkPath('README.md', '100%.md')).toBe(normalizeForPlatform('100%.md'));
  });

  it('returns null when the target is only a query', () => {
    expect(resolveLocalLinkPath('README.md', '?tab=readme')).toBeNull();
  });

  // GitHub: "Links starting with / will be relative to the repository root."
  // Joined onto the referring file's directory instead, `/README.md` written
  // in `docs/epics/` named `docs/epics/README.md`, and the docs reader painted
  // the working link "(broken link)".
  it('resolves a root-relative target from the repository root, not the file', () => {
    expect(resolveLocalLinkPath('docs/epics/0023-docs-reader.md', '/README.md')).toBe(
      normalizeForPlatform('README.md'),
    );
    expect(resolveLocalLinkPath('docs/index.md', '/docs/My%20Notes.md#setup')).toBe(
      normalizeForPlatform('docs/My Notes.md'),
    );
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

  it('resolves an encoded target to the decoded path the docs index is keyed by', () => {
    const markdown = '[notes](My%20Notes.md) [shot](shot.png?raw=true)';
    expect(localLinkPaths(markdown, 'docs/index.md')).toEqual([
      'docs/My Notes.md',
      'docs/shot.png',
    ]);
  });

  it('resolves a root-relative link to the repo-relative path a backlink matches', () => {
    expect(localLinkPaths('[plan](/docs/PLAN.md)', 'docs/epics/0023-docs-reader.md')).toEqual([
      'docs/PLAN.md',
    ]);
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

  it('does not close a fence on a line carrying an info string (CommonMark 4.5)', () => {
    // A nested example opened with the same fence length: `\`\`\`js` is
    // content, not a closer — so the example link stays blanked and the real
    // link after the true closer is still read.
    const markdown = '```md\n```js\n[a](x.md)\n```\n[b](README.md)\n';
    expect(extractLinkTargets(markdown)).toEqual(['README.md']);
  });

  it('closes a fence on a line with only trailing spaces, tabs or a CR', () => {
    const markdown = '```\n[a](x.md)\n``` \t\r\n[b](README.md)\n';
    expect(extractLinkTargets(markdown)).toEqual(['README.md']);
  });

  it('does not open a fence on a backtick run whose info string holds a backtick', () => {
    // Inline code at the start of a line, not a fence — reading it as one
    // blanked every link to the end of the document.
    const markdown = '```` ``` ```` is how you write a fence.\n[a doc](README.md)\n';
    expect(extractLinkTargets(markdown)).toEqual(['README.md']);
  });

  it('still opens a tilde fence whose info string holds a backtick', () => {
    expect(extractLinkTargets('~~~ `md`\n[a](x.md)\n~~~\n[b](README.md)\n')).toEqual(['README.md']);
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

  it('stops a span at a CRLF blank line too — a Windows checkout never holds `\\n\\n`', () => {
    const markdown = 'open ` here\r\n\r\n[a doc](README.md)\r\n\r\nclose ` there';
    expect(extractLinkTargets(markdown)).toEqual(['README.md']);
  });

  it('stops a span at a line of only spaces and tabs, which CommonMark calls blank', () => {
    const markdown = 'open ` here\n \t \n[a doc](README.md)\n  \nclose ` there';
    expect(extractLinkTargets(markdown)).toEqual(['README.md']);
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
