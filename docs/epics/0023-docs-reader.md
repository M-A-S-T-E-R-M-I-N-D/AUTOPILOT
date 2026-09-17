<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0023. The docs reader — Markdown rendered live, edited in place, kept honest

Status: Draft (2026-09-13). Board tasks seeded 2026-09-12 under this number.

## The ask

Operator, 2026-09-12: "we have a chance in the docs reader to bring something of a
much higher level — Markdown documents rendered in real time"; and the same day,
"it feels like a sea of documents, think about hygiene".

The dashboard already has a docs subject (`web/features/docs-viewer.ts`): a tree,
a rendered page, cached nodes. It reads. It does not yet let the operator write,
it does not say how fresh a page is, and it does not help find anything.

## What it becomes

A reader that is also the fleet's own editor for its doctrine, with four laws:

1. **Live.** The page re-renders as the file changes on disk (the flight writes
   debriefs and doctrine while the operator reads), through the same SSE tick the
   rest of the cockpit uses; a changed page keeps the reader's scroll position and
   marks the diff for a few seconds. The editor renders the preview as you type —
   one Markdown pipeline for both, never two renderers that drift.
2. **Edit in place.** A page opens as an editor with one key; save writes the file
   through a guarded endpoint (path allow-list under `docs/`, `README.md`,
   `CHANGELOG.md`; never outside the repo; never binary), records a provenance
   line (who, when, from which page), and the next mirror pass treats the change
   like any other doc edit. Undo/redo survive a tick (the plan editor's own law).
3. **Honest.** Every page shows its freshness (last commit touching it, the
   `verify-by` date when it carries one, the DOC-FRESHNESS sweep's verdict) and
   every internal link is checked as it renders — a dead link is painted as one.
   Commit-SHA citations resolve to the commit's subject on hover.
4. **Findable.** A search box over titles, headings and bodies (the existing
   project search index already holds `docs/`); a table of contents per page; a
   "what links here" list from the link census.

## Design direction

Reading surface, not a wiki skin: measure-limited prose (`65ch`), the sheet's
type scale, code with the mono face, tables that scroll inside their own frame,
the three themes. The editor is a split pane at `lg`, a toggle below it. Motion:
the diff highlight fades on the compositor; nothing else moves.

## Slices

1. Freshness + link check on the rendered page (read-only; reuses
   `doc-freshness.ts` and `scripts/docs/check-links.mjs`'s resolver).
   **Freshness half landed 2026-09-18:** `GET /api/file` now returns
   `touchedAt` (epoch-ms of the doc's last real commit, via
   `doc-freshness.ts`'s `gitLastTouchedAt`, degrading to `null` on any
   failure), and the viewer paints a "Last updated" badge from it. The link-
   check half (painting a dead internal link as one) is still open, but its
   blocker is cleared: `check-links.mjs`'s local-link resolution
   (`isLocalTarget`, target extraction, path resolution) now lives in
   `@autopilot/docs-links` (2026-09-18) — a workspace package, so
   `apps/dashboard/src` (whose `tsconfig.json` sets `rootDir: src`, ruling
   out a direct relative import of a repo-root script) can import it the same
   way it already imports `@autopilot/tokens`. `check-links.mjs` itself now
   calls into the shared package instead of carrying its own copy, verified
   byte-identical behavior via the existing `check-links.test.ts` suite. What
   remains: a server-side check (`GET /api/file` resolving each local link
   against the project's indexed doc list, degrading to "unchecked" the same
   way `touchedAt` degrades to `null`) and the viewer painting a dead one.
2. Search + ToC + "what links here".
3. The editor: guarded write endpoint, split preview, provenance line, tests for
   the allow-list (the security-sensitive path census must flag it).
4. Live re-render on disk change with diff highlight.
5. Hygiene: the archive/index moves from the 2026-09-12 audit
   (`docs/archive/README.md`), so the tree the reader shows is the tree we mean.

## Related

Epic 0021 (the app shell the reader lives in), 0020 (every panel says what it
is), `docs/README.md` (the index the reader renders first).
