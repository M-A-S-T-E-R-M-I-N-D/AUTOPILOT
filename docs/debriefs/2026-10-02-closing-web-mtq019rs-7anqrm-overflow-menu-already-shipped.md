<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Closing `web-mtq019rs-7anqrm`: EPIC 0017 slice 3's overflow menu already shipped 2026-09-14 — LTS landed in the status pill instead, same decluttering goal met

Board (medium): "EPIC 0017 3/5: overflow menu absorbing tour, LTS check,
report-issue, docs links — secondary never costs masthead real estate
again." This firing picked it up expecting a build. It is already done;
the board snapshot this firing started from predates the shipping commit
by more than two weeks.

## Verification of the claim

1. **The overflow menu exists and is live**, `apps/dashboard/src/web/shell.ts:5708-5717`:
   a `<details class="connect more-menu" id="more-menu" name="masthead-popover">`
   disclosure beside the command palette button, holding `#tour-btn`
   (Tour), `#progress-btn` (My progress), `#docs-link` (the docs index,
   opens a new tab), `#benchmark-link`, and `#report-btn` (Report from
   here) — each a `.more-item` row, not masthead real estate.
2. **The shipping commit says so itself and is an ancestor of `HEAD`:**
   `6614e911` ("feat(dashboard): the overflow menu — tour, the docs and
   report from here behind one ellipsis", 2026-09-14): "the slice's
   original list is complete and the epic is done." `git merge-base
   --is-ancestor 6614e911 HEAD` confirms. A follow-up fix,
   `91246496` (2026-09-28, also an ancestor), relands the popover focus
   law so choosing Tour from the menu returns focus to the menu's own
   summary rather than a button a real browser cannot refocus inside a
   closed `<details>`.
3. **LTS check did not move into the ellipsis — it folded into the
   consolidated status pill instead, per slice 2 (status-pill
   consolidation, shipped 2026-09-24), and the deeper goal ("secondary
   never costs masthead real estate") still holds:** `#gh-lts` /
   `#gh-lts-check` live inside the Connect popover's gh cluster
   (`shell.ts:5654-5655`), grouped with the rest of connection status/
   detail/actions rather than with Tour/Docs/Report in a menu that has no
   other connection-shaped rows. `docs/epics/0017-navigation-remake.md`'s
   own top-of-file status already records this: "the overflow menu
   (Tour, the docs, Report from here behind one ellipsis — epic 0017
   slice 3 …)" lists three items, not four, and line 47-48 ties LTS's
   disappearance from the flat masthead to the same decluttering effort
   without claiming it rides the ellipsis specifically. Neither reading
   leaves LTS costing masthead real estate on its own.
4. **The regression net the epic asked for is already in place and
   green.** `docs/epics/0017-navigation-remake.md` (slice-1 note):
   "a census test pins the inventory … so the remake cannot silently
   drop one." `apps/dashboard/test/web/masthead-census.test.ts` pins
   both halves: `#gh-lts`/`#gh-lts-check` inside the connect cluster
   (lines 79-80) and `#more-menu` with `#tour-btn`/`#docs-link`/
   `#report-btn` inside it, menu-before-items in document order (lines
   136-149). Full run this firing:
   ```
   npx vitest run apps/dashboard/test/web/masthead-census.test.ts
   Test Files  1 passed (1)
        Tests  14 passed (14)
   ```

## VERDICT

**Confirmed shipped, close.** `web-mtq019rs-7anqrm` describes work that
landed 2026-09-14 (menu) and 2026-09-24 (LTS's actual destination, the
consolidated status pill), both ancestors of this firing's `HEAD`, both
pinned by a passing census test, and the epic doc already agrees. The
only mismatch is the task's literal wording ("LTS check" inside the
ellipsis) against where LTS actually ended up (the status pill) — a
difference in which secondary surface absorbed it, not in whether the
masthead still spends real estate on it. It does not.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief file and the regenerated
`docs/debriefs/README.md` index (`node scripts/docs/generate-debriefs-index.mjs`)
— the only paths staged. Pure documentation: `docs/` is excluded from
`prettier --check .` (`.prettierignore`) and from ESLint's configured
`files` globs (`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so
it adds no source or test code and `typecheck`/`build` are structurally
unaffected. The 14 tests above were run in full during verification and
passed clean; no other test file was touched or needed re-running.

## Deviation note (PICK DISCIPLINE)

`picked_rank: 6`. Ranks 1-5 on this firing's board did not fit a single
safe firing:

- **#1** (`ap-mtzrb9gy-3`, EPIC 0020 S8b fix-commit generation core) —
  the task's own title says it needs a 🟣 operator scope decision first;
  `docs/debriefs/2026-09-13-verdict-ap-mtydvfm1-0-epic-0020-s8-fix-commit-half-confirmed.md`
  independently confirms this is new fix-authoring capability with no
  precedent in the tree, not a wiring task — blocked on a human call
  before any code.
- **#2** (`ap-mtzrb9gz-4`, EPIC 0020 S8c apply-approved-fix execute
  path) — the same VERDICT doc scopes this as buildable only "once (a)
  and (b) exist"; (a) (the diff-approval UI shell) shipped 2026-09-16
  per `docs/debriefs/2026-09-16-epic-0020-s8a-diff-approval-shell-confirmed-shipped.md`,
  but (b) is exactly #1 above, still unbuilt and operator-gated — #2 has
  nothing to execute yet.
- **#3** (`web-mtrh1hn3-8x9f0z`, EPIC 0019 S4 operator routing console)
  — a new dashboard surface (milestone progress, label queues, claims
  rendered next to the board) with no existing panel/API to extend;
  checked `apps/dashboard/src` for prior art and found none beyond the
  unrelated mirror-pass/taxonomy-seed infrastructure. A new route, panel,
  i18n strings and accessibility-clean markup in one firing risks the
  turn budget more than this firing could verify.
- **#4** (`web-mtpzzxn4-69csqx`, EPIC 0016 4/6 standalone Fly-GitHub
  target) — requires the flight runner to guarantee zero code-tree edits
  in a whole new flight mode (`flight/runner.ts`, `spawn-flight.ts`, the
  fly-bar target control), a backend behavior change beyond a UI
  addition.
- **#5** (`web-mtpzzxw4-au1b6x`, EPIC 0016 5/6 observability) — the
  weave-in pass (`flight/social-flight-pass.ts`) already prints its own
  summary line to the flight log every time it runs (identity, caps,
  verdict counts), so that half is live; but a SOCIAL section in the
  FLIGHT DEBRIEF digest (`web/flight-debrief.ts`'s `flightDebriefOf`)
  needs social-pass outcomes threaded from three call sites in `fly.ts`
  into a flight-level record, exposed over the API, and rendered —
  while "filed/closed" counts would read as permanently zero today,
  since the execute half epic 0016 slice 3 still calls "still open" has
  nothing to post yet. Multi-layer plumbing for data that cannot be
  non-zero yet is not this firing's unit.

`web-mtq019rs-7anqrm` (#6) touches no sibling's claimed or unlanded
files — verified against every fleet branch's `git diff --name-only
main...<branch>` — because it touches none at all: this firing's own
diff is two documentation files.
