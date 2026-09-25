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
   check half's blocker was cleared the same day: `check-links.mjs`'s
   local-link resolution (`isLocalTarget`, target extraction, path
   resolution) now lives in `@autopilot/docs-links` — a workspace package, so
   `apps/dashboard/src` (whose `tsconfig.json` sets `rootDir: src`, ruling
   out a direct relative import of a repo-root script) can import it the same
   way it already imports `@autopilot/tokens`. `check-links.mjs` itself now
   calls into the shared package instead of carrying its own copy, verified
   byte-identical behavior via the existing `check-links.test.ts` suite.
   **Slice landed 2026-09-18:** the link-check half followed the same day —
   `@autopilot/docs-links` gained `localLinkPaths` (every local link a doc
   resolves to, `/`-separated so it compares against the git-style index
   regardless of platform); `read/project-detail.ts`'s new `brokenDocLinks`
   batches those resolved targets against the project's indexed paths in one
   `IN (...)` query and degrades to `[]` on any failure, the same
   never-fail-the-read contract `touchedAt` already set; `GET /api/file`
   carries the result as `brokenLinks` (`null` when the dep is absent or
   throws, mirroring `touchedAt`'s `null`); and the viewer marks a matching
   `data-doc-open` link `.docs-link-dead` with an `sr-only` "(broken link)"
   note, so the census is both server-checked and visibly (and audibly)
   painted.
2. Search + ToC + "what links here".
   **ToC landed 2026-09-18:** the viewer builds a table of contents from the
   raw markdown's ATX headings and inserts it above the rendered body,
   skipping a single-heading doc. **Search already covered:** the project's
   full-text index (`readSearchFromStore`, `web/features/search.ts`) already
   indexes every doc-ish path `listProjectDocs` serves — the epic's own ask
   named this ("the existing project search index already holds docs/"), so
   no second, doc-scoped search box is needed. **"What links here" landed
   2026-09-18:** `project-detail.ts`'s `docLinksHere` queries every OTHER
   indexed doc-ish path's content in one pass and resolves each through the
   same `localLinkPaths` `brokenDocLinks` (slice 1) already relies on — no
   second link resolver. `GET /api/file` carries the result as `linksHere`
   (`null` on a missing dep or a thrown failure, the same degrade-on-failure
   contract `touchedAt`/`brokenLinks` already set), and the viewer renders it
   as a backlinks nav below the body, each entry wired through the SAME
   `data-doc-open` attribute (and its one module-level click delegate) the
   docs list and in-body links already use — opening a backlink is just
   opening a doc, zero new event plumbing.
3. The editor: guarded write endpoint, split preview, provenance line, tests for
   the allow-list (the security-sensitive path census must flag it).
   **Allow-list planner landed 2026-09-25:** `flight/docs-write.ts` ships the
   pure decision half — `planDocsWrite` validates a repo-relative path against
   the `docs/`/`README.md`/`CHANGELOG.md` allow-list (refusing traversal,
   absolute paths, and binary content) and appends the who/when/which-page
   provenance line; `pr-review.ts`'s security-sensitive path census now flags
   it. **Guarded endpoint landed 2026-09-25:** `docs/write.ts`'s
   `createDocsWriteApi` turns a validated plan into a real project-scoped file
   write (same `projectId` → `root_path` store lookup `inbox/add.ts` uses),
   and `server.ts`'s `handleDocsWrite` wires `POST /api/docs/write` as a
   CSRF-guarded, separately rate-limited JSON POST, resolving the acting
   author server-side via the existing `socialIdentity` read (never trusted
   from the request body). Still missing: the split-preview editor UI — no
   user-facing expression exists yet, so this slice stays open.
4. Live re-render on disk change with diff highlight.
5. Hygiene: the archive/index moves from the 2026-09-12 audit
   (`docs/archive/README.md`), so the tree the reader shows is the tree we mean.
   **Landed 2026-09-18:** the audit itself (commit 4d50c153) already moved
   every superseded record under `docs/archive/` with its own index — the
   remaining gap was the reader's own list, which still showed an archived
   doc exactly like current doctrine. A row whose path starts with
   `docs/archive/` now carries `.docs-file-archived` (a dashed, recessive
   edge instead of the pin's solid accent) plus a visible "Archived" badge
   that is real button content, so it reaches a screen reader as part of the
   button's own accessible name with zero extra ARIA plumbing; the hover tip
   and its `aria-describedby` sibling note "archived, kept for citations"
   too. Opening the doc is unchanged — the real path still resolves through
   `data-doc-open`.

## Related

Epic 0021 (the app shell the reader lives in), 0020 (every panel says what it
is), `docs/README.md` (the index the reader renders first).
