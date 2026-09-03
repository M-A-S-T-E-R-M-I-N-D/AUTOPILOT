// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC SPEC convention (web-msnswvej-u71q3p, `docs/epics/README.md`). An
 * epic-sized board task — one expected to span multiple firings — can carry
 * an `EPIC-SPEC: <path>` marker in its title, parallel to the existing
 * `DELIVERABLE:` clause (`./deliverable.ts`); the two may appear together,
 * so only the path token after the marker is the spec, never the rest of
 * the sentence. The linked file is
 * the acceptance-criteria/constraints/out-of-scope spec a firing is
 * expected to read before working the task; `fly.ts`'s
 * `markTaskDoneIfShipped` uses `extractEpicSpec` to find it and
 * `GitVcs.fileExists` to prove it was actually committed, not just promised
 * in the title, before trusting a `"completion":"complete"` claim.
 */

const EPIC_SPEC_MARKER = 'EPIC-SPEC:';

/**
 * Extracts a task title's `EPIC-SPEC: <path>` clause, or null if it has
 * none. Only the first whitespace-delimited token after the marker is the
 * path, and trailing sentence punctuation is stripped from it — board task
 * titles read `EPIC-SPEC: <path>. DELIVERABLE: <text>`, and grabbing the
 * whole tail mangled the path into a file that can never exist, demoting
 * every honest completion on such a task (seen live on web-mss50i9r-gvkf81).
 */
export function extractEpicSpec(title: string): string | null {
  const idx = title.indexOf(EPIC_SPEC_MARKER);
  if (idx === -1) return null;
  const tail = title.slice(idx + EPIC_SPEC_MARKER.length).trim();
  // Stryker disable next-line Regex,StringLiteral: `split(pattern, 1)`'s
  // single returned element is everything before the FIRST match's start —
  // `+` only changes how much that match consumes, never where it starts,
  // so `/\s+/` and `/\s/` produce the identical element 0 for every input
  // (verified: both regexes agree on 'a  b', tab/newline mixes, and '').
  // That same "1 element always returned" guarantee also means `[0]` can
  // never be undefined for ANY string input — the `?? ''` fallback is
  // unreachable, not killable either.
  const token = tail.split(/\s+/, 1)[0] ?? '';
  const path = token.replace(/[.,;:)\]]+$/, '');
  return path.length > 0 ? path : null;
}
