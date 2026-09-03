// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Detect a target repo's own backlog convention (generalizes what was a
 * hardcoded `docs/BACKLOG-999.md` — AUTOPILOT's own doc — into a pattern any
 * flown project can use). Runs during onboarding, alongside gate detection,
 * over the same read-only {@link FsSnapshot} — never touches the filesystem
 * directly, so it stays pure and unit-testable.
 */

import type { FsSnapshot } from '../gate/snapshot.js';

/** `BACKLOG.md`, `BACKLOG-999.md`, `TODO.md` — anywhere in the tree, any case. */
const BACKLOG_BASENAME_RE = /^(backlog(-[a-z0-9]+)?|todo)\.md$/i;

/**
 * A `Backlog: <path>` line anywhere in SOUL text, mirroring the `Stack: <x>`
 * convention. `[ \t]*` (not `\s*`) between the colon and the value — `\s`
 * would swallow the line's own newline and misread a value-less `Backlog:`
 * line as declaring whatever text starts the next line.
 */
// No trailing `$` needed: `.` (no `s` flag) already never crosses a line
// terminator, so `(\S.*)` greedily consumes exactly to end-of-line on its own.
const SOUL_BACKLOG_RE = /^Backlog:[ \t]*(\S.*)/im;

function basenameOf(path: string): string {
  const slash = path.lastIndexOf('/');
  // No `slash === -1 ? path : ...` branch needed: when there's no `/`,
  // `slash` is -1 and `path.slice(0)` already equals `path` unchanged.
  return path.slice(slash + 1);
}

/**
 * Find the target's backlog file, repo-root-relative, or null when it has
 * none — most flown repos won't, and that is a normal, silently-handled case
 * (callers treat null as "skip the backlog language entirely"), not an error.
 * Ties (more than one match) prefer the shallowest path, then lexical order,
 * so detection is deterministic across runs.
 */
export function detectBacklogPath(snap: FsSnapshot): string | null {
  const matches = snap.files.filter((f) => BACKLOG_BASENAME_RE.test(basenameOf(f)));
  // No `matches.length === 0` early return needed: sorting an empty array is
  // a no-op, and `matches[0] ?? null` below already yields null for it.
  matches.sort((a, b) => {
    const depth = a.split('/').length - b.split('/').length;
    return depth !== 0 ? depth : a.localeCompare(b);
  });
  return matches[0] ?? null;
}

/**
 * Read an operator-declared `Backlog: <path>` line out of a project's SOUL text
 * — the escape hatch for backlog files {@link detectBacklogPath}'s filename
 * heuristic can't find (a non-standard name, several candidates, a path outside
 * the scanned tree). Returns null when SOUL has no such line, which callers
 * treat as "fall back to the detected path", not an error.
 */
export function parseSoulBacklogPath(soul: string): string | null {
  const match = SOUL_BACKLOG_RE.exec(soul);
  if (!match) return null;
  // Stryker disable next-line OptionalChaining, StringLiteral: SOUL_BACKLOG_RE's
  // group is `(\S.*)`, so whenever `match` is non-null, match[1] is guaranteed
  // defined — the `?.`/`?? ''` only exist to satisfy TypeScript's
  // RegExpExecArray typing, which can't express that regex-level guarantee.
  const path = match[1]?.trim() ?? '';
  // Stryker disable next-line ConditionalExpression, EqualityOperator: same
  // guarantee as above, plus `\S` guarantees the first character survives
  // trim() — `path` can never be empty here, so the false branch is
  // unreachable, not just untested.
  return path.length > 0 ? path : null;
}
