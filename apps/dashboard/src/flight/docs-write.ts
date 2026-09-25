// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The docs reader's editor, write half (epic 0023 "The docs reader" slice 3,
 * board web-mtywp7to-rbebh4): "save writes the file through a guarded
 * endpoint (path allow-list under `docs/`, `README.md`, `CHANGELOG.md`;
 * never outside the repo; never binary), records a provenance line (who,
 * when, from which page)". This slice ships only the pure decision —
 * {@link planDocsWrite} validates a caller-supplied repo-relative path
 * against the allow-list, refuses any traversal/absolute-path/binary-content
 * attempt, and appends the provenance line to the saved content. It has no
 * I/O and is never called from anywhere yet: the guarded `POST` endpoint
 * (CSRF, rate-limited, confirm-before-write, matching `release/execute.ts`'s
 * write-to-disk discipline) and the split-preview editor UI are their own
 * follow-up slices — the same isolated-pure-planner-before-wiring shape
 * `flight/social-pass.ts` and `flight/mirror-pass-priority.ts` already used
 * for their own first slices.
 *
 * The allow-list is deliberately a fixed root set, not a caller-supplied
 * glob or regex: a regex allow-list is itself a thing a hostile or buggy
 * caller could widen, where a fixed array of exact roots cannot silently
 * grow past what this file's own source shows. Path safety is decided on
 * the STRING alone (no `fs`/`path` module resolution against a real
 * filesystem) because this planner is pure and portable across the
 * server's real repo root and a test's fake one alike; the traversal guard
 * below is therefore its own segment-by-segment walk rather than a
 * `path.resolve` + `startsWith` check, so it holds the same way on both
 * platforms this dashboard runs on (`/` and `\` path separators).
 */

/** Repo-relative roots the editor may ever write under. `docs/` covers any
 *  file nested under it; the other two are exact single-file matches — the
 *  editor is not a general file manager, only the fleet's own doctrine and
 *  its two root-level companions. */
export const DOCS_WRITE_ALLOWED_ROOTS: readonly string[] = ['docs/', 'README.md', 'CHANGELOG.md'];

export interface DocsWriteRequest {
  /** Repo-relative, `/`-separated path exactly as the editor's page names
   *  it — never resolved against a real filesystem here. */
  readonly path: string;
  /** The full new file content the editor saved (not a diff). */
  readonly content: string;
  /** Who saved it — the resolved GitHub/operator identity, never a
   *  client-supplied display name. */
  readonly author: string;
  /** When it was saved — an ISO-8601 timestamp the caller captures, never
   *  `Date.now()` read inside this pure function. */
  readonly when: string;
  /** Which dashboard page/surface the save came from (the epic's own
   *  "from which page"), e.g. `"docs-reader"`. */
  readonly page: string;
}

export interface DocsWritePlan {
  readonly ok: true;
  /** The same path the request carried, once validated. */
  readonly path: string;
  /** The request's content with the provenance line appended. */
  readonly content: string;
}

export interface DocsWriteRejection {
  readonly ok: false;
  /** Human-readable reason a human reviewing a refused save can act on —
   *  never a bare boolean, the same reasoned-refusal shape every other
   *  planner in `flight/` returns. */
  readonly reason: string;
}

/** True when every segment of a `/`-split repo-relative path is a plain
 *  name — never empty, never `.`/`..`, never carrying a `\` (a literal
 *  backslash inside one segment, which a `/`-split alone would not catch,
 *  and which this codebase's own `@autopilot/docs-links` convention already
 *  treats as foreign to a repo-relative path). Empty segments catch a
 *  doubled `//`; `.`/`..` catch a same-dir or parent-dir escape at any
 *  depth, not just a leading one. */
function hasSafePathSegments(path: string): boolean {
  if (path.length === 0) return false;
  const segments = path.split('/');
  return segments.every(
    (segment) =>
      segment.length > 0 && segment !== '.' && segment !== '..' && !segment.includes('\\'),
  );
}

/** True when `path` names a file the editor's allow-list permits: exactly
 *  `README.md`/`CHANGELOG.md`, or anything nested under `docs/` (a bare
 *  `"docs/"` with nothing after it names no file, so it is refused too).
 *  An absolute path (leading `/`, or a Windows drive letter and colon) never
 *  matches any root here — every root is a bare relative name — so it
 *  fails this check before the segment walk even runs. */
export function isDocsWritePathAllowed(path: string): boolean {
  if (!hasSafePathSegments(path)) return false;
  if (path === 'README.md' || path === 'CHANGELOG.md') return true;
  return path.startsWith('docs/') && path.length > 'docs/'.length;
}

/** True when `content` carries a NUL byte — the same cheap binary heuristic
 *  `pr-review.ts`'s diff-based `assessPrDiff` check exists for, applied here
 *  to the content itself rather than a fetched diff: bytes the reader
 *  cannot render as Markdown get no write path at all. */
function isBinaryContent(content: string): boolean {
  return content.includes('\u0000');
}

/** The provenance line the editor appends to every saved file — a Markdown
 *  HTML comment, invisible in the rendered reader, naming who saved it, when,
 *  and from which dashboard page, so a later reader (human or the mirror
 *  pass) can tell an in-app edit apart from a normal commit. Appended with a
 *  leading blank line so it never runs into the file's last real line, and a
 *  trailing newline so the file still ends on one. */
function provenanceLine(author: string, when: string, page: string): string {
  return `\n<!-- edited via dashboard by ${author} on ${when} from ${page} -->\n`;
}

/**
 * Validates `request` against the editor's allow-list and binary guard, and
 * on success returns the content to write with its provenance line appended.
 * Pure and side-effect-free: no file is read or written here, matching this
 * module's header. Refuses (never throws) on the first failing check, in
 * the same reasoned-rejection shape `planPrReview`'s queue-for-human verdicts
 * use — a caller wiring the real endpoint turns a rejection into an HTTP 4xx
 * with `reason` as the body, never a generic 500.
 */
export function planDocsWrite(request: DocsWriteRequest): DocsWritePlan | DocsWriteRejection {
  if (!isDocsWritePathAllowed(request.path)) {
    return {
      ok: false,
      reason:
        `"${request.path}" is outside the docs editor's allow-list ` +
        `(${DOCS_WRITE_ALLOWED_ROOTS.join(', ')}) — refusing to write outside the repo's own doctrine.`,
    };
  }
  if (isBinaryContent(request.content)) {
    return {
      ok: false,
      reason:
        'the saved content carries binary data (a NUL byte) — the editor writes Markdown/text only.',
    };
  }
  return {
    ok: true,
    path: request.path,
    content: request.content + provenanceLine(request.author, request.when, request.page),
  };
}
