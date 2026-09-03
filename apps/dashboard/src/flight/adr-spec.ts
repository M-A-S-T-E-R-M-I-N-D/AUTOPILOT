// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ADR convention (web-msnsxucw-dso4s5, `docs/adr/README.md`). Per
 * `PATTERNS-AND-STANDARDS.md` §10 principle 5 ("Plan-before-execute"), a
 * PLAN step that lands, changes, or reverses an architectural decision
 * writes (or supersedes) an ADR as part of that same slice. A task title can
 * carry a trailing `ADR: <path>` marker recording which record that slice
 * wrote — parallel to the existing `EPIC-SPEC:` clause (`./epic-spec.ts`)
 * and `DELIVERABLE:` clause (`./deliverable.ts`). `fly.ts`'s
 * `markTaskDoneIfShipped` uses `extractAdrSpec` to find it and
 * `GitVcs.fileExists` to prove it was actually committed, not just promised
 * in the title, before trusting a `"completion":"complete"` claim — the
 * documented convention stays enforced instead of quietly rotting the way
 * `docs/adr/README.md` itself says the founding decisions did before this
 * directory existed.
 */

const ADR_MARKER = 'ADR:';

/**
 * Extracts a task title's `ADR: <path>` clause, or null if it has none. Only
 * the first whitespace-delimited token after the marker is the path, and
 * trailing sentence punctuation is stripped from it — board task titles read
 * `ADR: <path>. DELIVERABLE: <text>`, and grabbing the whole tail mangled
 * the path into a file that can never exist, demoting every honest
 * completion on such a task (same tail-grab bug class as `epic-spec.ts`'s
 * `extractEpicSpec`, seen live on web-mss50i9r-gvkf81).
 */
export function extractAdrSpec(title: string): string | null {
  const idx = title.indexOf(ADR_MARKER);
  if (idx === -1) return null;
  const tail = title.slice(idx + ADR_MARKER.length).trim();
  const token = tail.split(/\s+/, 1)[0] ?? '';
  const path = token.replace(/[.,;:)\]]+$/, '');
  return path.length > 0 ? path : null;
}
