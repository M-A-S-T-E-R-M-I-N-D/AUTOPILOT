<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `web-mtt8lo8x-lna12h`: "link census" is already fully shipped

Board (high): "EPIC 0020 S5 LINK CENSUS: a test fails when a rendered GitHub
noun (PR/issue number, run id, commit SHA, handle) has no link while the API
reported a URL for it — the structural stop for dead-end text". This is the
board's top-ranked item this firing. Picked it up expecting a remaining gap
and found none — this firing's unit is the verification that closes it.

## Verification of the claim

1. **The epic doc already marks this slice shipped.**
   `docs/epics/0020-legible-surface.md` row 5 records slice 5 — word-for-word
   the board title, down to "structural stop for failure #2" — as
   **shipped**, citing `test/flight/link-census.test.ts` (which "found and
   fixed the pool-client panel's own dead issue-number link"),
   `web/features/pool-client.ts`, and `test/web/pool-client-link.test.ts`.
2. **The census test exists, is a real structural check, and passes.**
   `apps/dashboard/test/flight/link-census.test.ts` scans every `.ts` under
   `src/flight/` for exported interfaces with a real `url` field and fails
   the run if the matching `web/features/` renderer never turns that `.url`
   into an `href` — exactly the "dead-end text" stop the board title
   describes. It carries a documented `NOT_YET_RENDERED` exclusion list
   (`social-pass.ts`, `contributor-issue-list.ts`) and a `RENDERED_BY` map,
   not a blanket skip.
3. **The one violation the census found is already fixed.**
   `apps/dashboard/src/web/features/pool-client.ts:167-178` renders the
   issue number as a real anchor only `entry.issue.url ? <a href=...> : <span>`
   — a link when the API supplied one, plain text otherwise, never a link
   that goes nowhere.
4. **Tests pass clean.** Ran the exact files the epic doc cites from a clean
   tree:
   ```
   npx vitest run apps/dashboard/test/flight/link-census.test.ts apps/dashboard/test/web/pool-client-link.test.ts
   ✓ |node|  test/flight/link-census.test.ts (3 tests)
   ✓ |jsdom| test/web/pool-client-link.test.ts (2 tests)
   Test Files  2 passed (2)
        Tests  5 passed (5)
   ```

## VERDICT

**Close — already fully shipped.** The board entry duplicates epic 0020
slice 5, which is complete: the census test exists, enforces the exact
invariant the title describes, and is green; the one dead link it originally
caught (`pool-client.ts`'s issue number) is fixed. No further slice is
actionable here — this looks like a stale board entry (created before, or
not synced after, slice 5 landed) rather than open work.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, added with a scoped
`git add <this-path>` — the only file this firing staged or touched. Pure
documentation: `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so it adds no source
or test code and `typecheck`/`build` are structurally unaffected. The 5 tests
above were already run in full during verification and passed clean.
