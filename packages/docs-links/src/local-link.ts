// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Markdown local-link resolution — the pure decision core `scripts/docs/
 * check-links.mjs` has carried inline since it first shipped, extracted here
 * so the docs reader panel (epic 0023 "the docs reader", slice 1: "every
 * internal link is checked as it renders") can reuse the exact same rules
 * instead of a second implementation that drifts. `apps/dashboard/src` has
 * `rootDir: src` in its tsconfig, so a relative import reaching outside it
 * into `scripts/` would break the production build (`tsc -b` refuses an
 * input file outside a composite project's rootDir) — a workspace package
 * import (`@autopilot/docs-links`) has no such restriction, the same
 * reason `@autopilot/tokens` and `@autopilot/engine` already cross that
 * boundary. Pure — no fs access — so both the CI script and the dashboard's
 * server-side resolver can unit-test it directly against fixture strings.
 */

import { dirname, join, normalize, sep } from 'node:path';

/** Every `[text](target)` — optionally followed by a `"title"` — inside
 *  `markdown`. Both classes exclude `[`, so no candidate can scan across
 *  the start of the next one: a nested bracket in the text never matched
 *  anyway (the scan stops at the first `]`), a `[` in a target is not a
 *  link target this repo writes, and letting either class swallow `[` made
 *  every `[` restart a scan over the whole run — polynomial on `[[[[…` and
 *  on `[](` followed by `[](!` runs (CodeQL js/polynomial-redos, both
 *  witnesses timed: 150–260 ms to 0 on twenty thousand characters). */
const LINK_RE = /\[[^[\]]*\]\(([^)\s[]+)(?:\s+"[^"]*")?\)/g;

/**
 * A link target this module can verify against the filesystem — repo-relative
 * paths only. Absolute URLs, protocol links and in-page anchors are not
 * git-verifiable, so they are deliberately out of scope rather than guessed.
 */
export function isLocalTarget(target: string): boolean {
  if (target.length === 0) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // http:, https:, mailto:, …
  if (target.startsWith('#')) return false;
  if (target.startsWith('//')) return false;
  return true;
}

/**
 * `markdown` with every fenced block and inline code span blanked out, so a
 * link scan reads only prose.
 *
 * A link inside backticks is an EXAMPLE, not a link. A publicity draft
 * explaining where to insert an entry in somebody else's README wrote "right
 * before the `## [AutoPR](...)` heading", and the CI link check called `...` a
 * broken relative link and reddened a landing (2026-09-22). The docs reader
 * shares this module, so it was painting the same example as a dead link in
 * the UI.
 *
 * Deliberately a scanner, not a regex: this file already carries a CodeQL
 * polynomial-redos fix, and a hand-written pass over the characters is linear
 * by construction rather than by argument. Blanked regions keep their length
 * and every newline, so anything downstream that counts offsets or lines
 * still lines up.
 *
 * A span may WRAP A LINE — the draft's did, which is how the first attempt at
 * this still missed it — so the inline pass runs over the whole document and
 * stops a span at a blank line, the way CommonMark ends one at a paragraph
 * break. An unterminated fence blanks to the end of the document, matching a
 * renderer. An unterminated inline run is left alone: a lone backtick in
 * prose is a typo, not a code span, and swallowing the rest of the document
 * would hide every real link behind it.
 */
export function withoutCode(markdown: string): string {
  return blankInlineCode(blankFencedBlocks(markdown));
}

/** `markdown` with every fenced block blanked, newlines kept.
 *
 *  The two CommonMark 4.5 rules a bare run-of-ticks match missed: a closing
 *  fence may be followed only by spaces or tabs, so a nested `` ```js `` inside
 *  an open ```` ``` ```` block is content and not its end; and a backtick
 *  fence's info string may not hold a backtick, so a line opening with
 *  inline code (```` ``` ```` written as code) is prose, not a fence that
 *  blanks every link to the end of the document. */
function blankFencedBlocks(markdown: string): string {
  // The info is sliced off rather than captured: `.` never matches the `\r`
  // a CRLF line ends with, so a `(.*)$` capture would find no fence there.
  const fenceOf = (line: string): { run: string; info: string } | null => {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    const run = match?.[1];
    return match === null || run === undefined ? null : { run, info: line.slice(match[0].length) };
  };
  let open: string | null = null;
  return markdown
    .split('\n')
    .map((line) => {
      const fence = fenceOf(line);
      if (open !== null) {
        // Only a bare fence of the SAME character, at least as long, closes one.
        if (
          fence !== null &&
          fence.run[0] === open[0] &&
          fence.run.length >= open.length &&
          fence.info.trim().length === 0
        ) {
          open = null;
        }
        return ' '.repeat(line.length);
      }
      if (fence !== null && !(fence.run[0] === '`' && fence.info.includes('`'))) {
        open = fence.run;
        return ' '.repeat(line.length);
      }
      return line;
    })
    .join('\n');
}

/** `text` with every inline code span blanked. A run of N backticks opens a
 *  span that the next run of exactly N closes, searched no further than the
 *  next blank line. */
function blankInlineCode(text: string): string {
  // A blank line is one holding nothing but spaces and tabs (CommonMark), and
  // in a CRLF checkout it ends `\r\n` — so a plain `\n\n` search found no
  // paragraph break in a Windows file at all, and one stray backtick blanked
  // every link up to the next backtick, paragraphs later.
  const paragraphEnd = (from: number): number => {
    for (let at = text.indexOf('\n', from); at !== -1; at = text.indexOf('\n', at + 1)) {
      let next = at + 1;
      while (text[next] === ' ' || text[next] === '\t' || text[next] === '\r') next += 1;
      if (text[next] === '\n') return at;
    }
    return text.length;
  };
  const blanked = (slice: string): string => slice.replace(/[^\n]/g, ' ');

  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '`') {
      out += text[i];
      i += 1;
      continue;
    }
    let afterOpen = i;
    while (afterOpen < text.length && text[afterOpen] === '`') afterOpen += 1;
    const ticks = afterOpen - i;
    const closer = '`'.repeat(ticks);
    const limit = paragraphEnd(afterOpen);
    let search = afterOpen;
    let found = -1;
    while (search < limit) {
      const at = text.indexOf(closer, search);
      if (at === -1 || at >= limit) break;
      let after = at + ticks;
      // A LONGER run is not this span's closer.
      if (after < text.length && text[after] === '`') {
        while (after < text.length && text[after] === '`') after += 1;
        search = after;
        continue;
      }
      found = at;
      break;
    }
    if (found === -1) {
      out += text.slice(i, afterOpen);
      i = afterOpen;
      continue;
    }
    out += blanked(text.slice(i, found + ticks));
    i = found + ticks;
  }
  return out;
}

/** Every raw link target found in `markdown`, in document order, unfiltered —
 *  callers narrow to git-verifiable ones with {@link isLocalTarget}. */
export function extractLinkTargets(markdown: string): readonly string[] {
  const targets: string[] = [];
  for (const match of withoutCode(markdown).matchAll(LINK_RE)) {
    const target = match[1];
    if (target !== undefined) targets.push(target);
  }
  return targets;
}

/** Every local link target found in `markdown` — {@link extractLinkTargets}
 *  already filtered through {@link isLocalTarget}. */
export function localLinkTargets(markdown: string): readonly string[] {
  return extractLinkTargets(markdown).filter(isLocalTarget);
}

/**
 * Resolve a local link `target` written inside `fromFile` to the path it
 * names, relative to the same root `fromFile` is relative to. An `#anchor`
 * suffix names a heading inside the target, not a file, and is stripped
 * first; a target that is nothing BUT an anchor (`"#top"` already rejected by
 * {@link isLocalTarget}, but a bare `"#"` reaching here) resolves to nothing.
 *
 * The target is read the way a renderer reads it — as a URL: a `?query` is
 * stripped too (GitHub serves `shot.png?raw=true` as `shot.png`), and
 * percent-escapes are decoded (`My%20Notes.md` opens `My Notes.md`). Taken
 * literally, both named a file that does not exist, and the docs reader
 * painted the working link "(broken link)". Decoding comes last, so an
 * encoded `%23` or `%3F` stays part of the file name.
 */
export function resolveLocalLinkPath(fromFile: string, target: string): string | null {
  const path = decodePath(target.split('#')[0]?.split('?')[0] ?? '');
  if (path.length === 0) return null;
  return normalize(join(dirname(fromFile), path));
}

/** `path` with its percent-escapes decoded. A `%` that does not start a valid
 *  escape (`100%.md`) makes `decodeURIComponent` throw; that path was never
 *  encoded, so it is kept as written. */
function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Every local link inside `markdown` (found at `fromFile`), resolved to the
 *  repo-relative path it names — always `/`-separated, unlike
 *  {@link resolveLocalLinkPath}'s platform-native separator, since this is
 *  the form a caller compares against an index keyed by git-style paths (the
 *  docs reader's search index, epic 0023 "the docs reader" slice 1: "every
 *  internal link is checked as it renders"). Order matches the markdown; a
 *  target repeated twice appears twice. */
export function localLinkPaths(markdown: string, fromFile: string): readonly string[] {
  const paths: string[] = [];
  for (const target of localLinkTargets(markdown)) {
    const resolved = resolveLocalLinkPath(fromFile, target);
    if (resolved !== null) paths.push(resolved.split(sep).join('/'));
  }
  return paths;
}
