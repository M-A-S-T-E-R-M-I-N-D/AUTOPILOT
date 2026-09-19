// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure line-classification/parsing helpers for the Docs viewer's Markdown
 * renderer — client-only (no server counterpart, unlike `shared/*.ts`), so
 * it lives in `web/` rather than `shared/` (epic 0002 "shell decomposition",
 * slice 2: feature-module split of `shell.ts`), following the same pattern
 * `office-map.ts`/`format.ts`/`heatmap.ts`/`flight-metrics.ts` proved.
 * Deliberately DOM-free: the DOM-building half (`appendInline`,
 * `sanitizeChartNode`, `renderChartSvg`, `renderMarkdown` itself) stays
 * inline in `fleetJs()`, same reason `office-map.ts` left its SVG-drawing
 * half inline — those need `document`/DOM types the build tsconfig doesn't
 * currently carry.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** Splits one Markdown table row into trimmed cell text, dropping the
 *  leading/trailing pipe if present. */
export function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

/** A fenced code block delimiter line (```` ``` ````). */
export function isFence(line: string): boolean {
  return /^\s*```/.test(line);
}

/** An ATX heading line (`#` through `######`). */
export function isHeading(line: string): boolean {
  return /^#{1,6}\s/.test(line);
}

/** A bulleted (`-`/`*`) or ordered (`1.`) list item line. */
export function isListItem(line: string): boolean {
  return /^\s*([-*+]|\d+[.)])\s/.test(line);
}

/** The opening line of a raw embedded `<svg>` block (self-study charts). */
export function isSvgStart(line: string): boolean {
  return /^\s*<svg[\s>]/i.test(line);
}

/** True when `lines[idx]` is a table header row — it contains a pipe and the
 *  next line is a valid header/body separator (`| :-- | --: |`, dashes only,
 *  etc). */
export function isTableStart(lines: readonly string[], idx: number): boolean {
  const next = lines[idx + 1];
  if (next === undefined) return false;
  // A method ON the separator line, not a regex test that would coerce an
  // undefined line to the string "undefined" and quietly answer false.
  return (
    String(lines[idx]).includes('|') &&
    next.match(/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/) !== null
  );
}

/** True when `lines[idx]` starts (or is) a block-level element — a blank
 *  line, fence, heading, list item, table, or embedded SVG — so a paragraph
 *  scan knows where to stop. */
export function isBlockStart(lines: readonly string[], idx: number): boolean {
  const line = lines[idx];
  if (line === undefined) return true;
  return (
    !line.trim() ||
    isFence(line) ||
    isHeading(line) ||
    isListItem(line) ||
    isTableStart(lines, idx) ||
    isSvgStart(line) ||
    isHr(line) ||
    blockquoteText(line) !== null
  );
}

/*
 * THE DOCS READER'S PARITY SLICE (operator, 2026-09-18: "like in MDVIEWER it
 * must support tables, charts, diagrams, text styling (bold, italic...), and
 * checkboxes, absolutely"). Every helper below is pure string math spliced
 * into the client by `.toString()`, so each must be SELF-CONTAINED: no
 * module-level constants, no imports — only calls to sibling helpers that
 * are spliced alongside it (`features/search.ts` lists them).
 */

/** `> quoted` → the quoted text (the marker and one optional space gone);
 *  null for a line that is not a blockquote. Up to three leading spaces,
 *  as CommonMark allows. */
export function blockquoteText(line: string): string | null {
  const m = /^ {0,3}>\s?(.*)/.exec(line);
  return m ? m[1]! : null;
}

/** A thematic break: three or more of the same `-`, `*` or `_`, spaces
 *  allowed between, nothing else on the line. */
export function isHr(line: string): boolean {
  return /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

/** An ATX heading's level and text, trailing `#`s dropped; null otherwise. */
export function headingOf(line: string): { readonly level: number; readonly text: string } | null {
  const m = /^(#{1,6})\s+(.*?)\s*(?:#+\s*)?$/.exec(line);
  return m ? { level: m[1]!.length, text: m[2]! } : null;
}

/** A GitHub-style anchor id: lowercased, punctuation dropped, runs of
 *  whitespace to one hyphen. Letters of every script survive. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

/** The info string of an opening fence, lowercased: ```ts → 'ts', ``` → ''. */
export function fenceLang(line: string): string {
  const m = /^\s*```\s*([A-Za-z0-9_+-]*)/.exec(line);
  return m ? m[1]!.toLowerCase() : '';
}

/** Column alignments from a table's separator row (`:---`, `:---:`, `---:`);
 *  null where the author left the column unaligned. */
export function tableAlignments(separator: string): readonly ('start' | 'center' | 'end' | null)[] {
  return splitTableRow(separator).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'end';
    if (left) return 'start';
    return null;
  });
}

/** One list line taken apart: its indent in columns (a tab is four), whether
 *  the marker is numbered, and the text after the marker. The caller has
 *  already established `isListItem`; a non-item answers indent 0, unordered,
 *  the whole line. */
export function listItemOf(line: string): {
  readonly indent: number;
  readonly ordered: boolean;
  readonly text: string;
} {
  const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)/.exec(line);
  if (!m) return { indent: 0, ordered: false, text: line };
  return {
    indent: m[1]!.replace(/\t/g, '    ').length,
    // A marker is `-`, `*`, `+` or digits with a dot/paren — a digit anywhere
    // in it means numbered.
    ordered: /\d/.test(m[2]!),
    text: m[3]!,
  };
}

/** `[ ] text` / `[x] text` (the item text after its marker) → the task;
 *  null for a plain item. An empty task text is still a task. */
export function taskOf(
  itemText: string,
): { readonly checked: boolean; readonly text: string } | null {
  const m = /^\[([ xX])\](?:\s+(.*))?$/.exec(itemText);
  return m ? { checked: m[1] !== ' ', text: m[2] ?? '' } : null;
}

/** One inline run: plain text or a styled span, or a link/image with its
 *  destination. Flat, not nested — bold inside a link stays literal, the
 *  same reach the reader had before this slice. */
export type InlineToken =
  | { readonly type: 'text' | 'code' | 'strong' | 'em' | 'strike'; readonly text: string }
  | { readonly type: 'link' | 'image'; readonly text: string; readonly href: string };

export function inlineTokens(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  let last = 0;
  for (const m of text.matchAll(
    /`([^`]+)`|!\[([^\]]*)\]\(([^\s)]+)\)|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_/g,
  )) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) });
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] });
    else if (m[3] !== undefined) out.push({ type: 'image', text: m[2]!, href: m[3] });
    else if (m[5] !== undefined) out.push({ type: 'link', text: m[4]!, href: m[5] });
    else if (m[6] !== undefined) out.push({ type: 'strong', text: m[6] });
    else if (m[7] !== undefined) out.push({ type: 'strong', text: m[7] });
    else if (m[8] !== undefined) out.push({ type: 'strike', text: m[8] });
    else if (m[9] !== undefined) out.push({ type: 'em', text: m[9] });
    else out.push({ type: 'em', text: m[10]! });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** Where a relative link points, resolved against the document it sits in
 *  (`docs/a/b.md` + `../c.md` → `docs/c.md`). Null for anything that is not
 *  a relative path: a scheme, a root-absolute path, a bare fragment, an
 *  empty target, or a `..` that would climb above the repository. A
 *  fragment or query on the link is dropped — the viewer opens whole files. */
export function resolveDocLink(basePath: string, href: string): string | null {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href) || href.startsWith('#') || href.startsWith('/')) {
    return null;
  }
  const clean = href.split('#')[0]!.split('?')[0]!;
  if (clean === '') return null;
  const parts = basePath.split('/').slice(0, -1);
  for (const part of clean.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

/** What a link becomes in the reader. `external` opens a new tab (http/https
 *  only), `anchor` scrolls to a heading of THIS document, `doc` opens another
 *  document of the same project, and `text` is everything else — javascript:
 *  and data: schemes included — rendered as plain words. */
export type HrefKind =
  | { readonly kind: 'external' | 'anchor' | 'doc'; readonly target: string }
  | { readonly kind: 'text' };

export function classifyHref(href: string, basePath: string): HrefKind {
  if (/^https?:\/\//i.test(href)) return { kind: 'external', target: href };
  if (href.startsWith('#')) {
    return href.length > 1 ? { kind: 'anchor', target: headingSlug(href) } : { kind: 'text' };
  }
  const doc = resolveDocLink(basePath, href);
  return doc === null ? { kind: 'text' } : { kind: 'doc', target: doc };
}

/** GitHub's five Markdown alert kinds — https://github.blog/changelog/2023-12-14-new-markdown-extension-alerts-provide-attention-grabbing-callouts/ */
export type CalloutKind = 'note' | 'tip' | 'important' | 'warning' | 'caution';

/** `[!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` as the
 *  WHOLE first line of a blockquote (GitHub's alert syntax, case-insensitive
 *  per its own spec) → the callout kind; null for anything else, including a
 *  bracket that merely starts with one of these words. */
export function calloutKind(line: string): CalloutKind | null {
  // The line is trimmed first, so the marker must END the string: a
  // trailing whitespace class here was dead (the nightly sweep's one
  // survivor, 2026-09-19) and would have let `[!NOTE]xyz` through.
  const m = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i.exec(line.trim());
  return m ? (m[1]!.toLowerCase() as CalloutKind) : null;
}
