<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# BACKLOG-999 archive — full evidence for closed items

`BACKLOG-999.md` is a live register the loop's Triage sub-agent consults every
firing (`docs/BACKLOG-999.md` §C2) — its own compression goal (board
`web-mtndm5m6-rfly97`, "keep BACKLOG-999 under 100 lines") is working it toward a
compact, scannable register. A `[x]` done item's multi-paragraph implementation
evidence is exactly the content that belongs in a paper trail but not in an
actionable backlog line: this file is where that evidence moves to, verbatim,
so the "no claims without a paper trail" standard
(`docs/CASE-STUDIES/README.md`) still holds after compression.
`BACKLOG-999.md` keeps a one-line pointer back here per moved item.

## §L — Board hygiene (moved 2026-09-09)

- [x] **Board hygiene** Reconcile board vs git on session end: interactive-session work marks no task done (only
  flight METRICS ids do) — reuse the headline resolver's commit↔title matching to propose "this shipped, mark done?"
  The matching primitive landed (`ap-msksw1mf-3`) — `findReconciliationCandidates`/`titleMatchScore` in
  `apps/dashboard/src/read/reconcile.ts` score an open task's title against a commit subject (Jaccard token
  overlap) and surface proposal-only candidates; it caught this backlog file's own live evidence of the bug
  (`ap-msksw1mf-4`'s reuse-lint work and `ap-msksw1me-0`'s OTLP endpoint wiring both shipped via interactive
  commits with no METRICS line, so their board tasks never flipped to `done`). Done — the real caller landed:
  `GitVcs.recentCommits` (`packages/engine/src/adapters/git.ts`) reads the target's recent history, and
  `apps/dashboard/src/fly.ts`'s end-of-flight block feeds it plus the open board through
  `findReconciliationCandidates`, printing each unconfirmed candidate for the operator to confirm on the
  dashboard. Proposal-only by design (never auto-applied) and best-effort (a reconciliation hiccup never fails
  the flight). `ap-msksw1mf-4` and `ap-msksw1me-0` themselves are still manually left open on the live board as
  a real-world fixture for this exact matcher to prove out on the next flight — but only `ap-msksw1mf-4` actually
  will: its shipping commit has a descriptive subject that scores 0.615 against the task title, well
  past the 0.5 threshold. `ap-msksw1me-0` shipped inside a WIP-checkpoint commit whose subject is
  generic firing-cadence boilerplate with no mention of OTLP — that pairing scores ~0.05, so the matcher
  originally could not surface it. This was a real blind spot, not a matcher bug: a checkpoint commit's subject
  never carries the descriptive content title-matching needs, since the firing that packs up mid-unit has no room
  left to compose one. Proven as a regression fixture in `apps/dashboard/test/read/reconcile.test.ts` (`"of the two
  real board fixtures, only the descriptively-committed one is proposed"`).
  **Resolved** — closed exactly this gap: `GitVcs.recentCommits`
  (`packages/engine/src/adapters/git.ts`) now also returns each commit's changed file paths, and
  `findReconciliationCandidates` (`apps/dashboard/src/read/reconcile.ts`) falls back to a boolean
  `filePathMatchesTitle` check — a shared, non-generic token (length >= 4, filtered against a structural-noise
  list) between the task title and a touched path — whenever no commit subject clears the threshold. Proposal-only
  and best-effort like the rest of this feature. Proven against both real fixtures once wired with real file data:
  the reuse-lint task still matches via subject text (score 0.615, unchanged), and the OTLP task is now recovered
  via the path signal (`apps/dashboard/test/read/reconcile.test.ts`, the fixture immediately after the one above).
  `apps/dashboard/src/fly.ts`'s end-of-flight block now passes `commit.files` through for real, so the fix applies
  to live flights, not just the test fixture.
<<<<<<< HEAD
=======

## §K — Dashboard browser tsconfig lib/jsdom split (moved 2026-09-10)

- [x] `apps/dashboard` browser tsconfig — `lib`/jsdom half (M3 prep): give the app its own `compilerOptions.lib`
  (incl. `DOM`) and a jsdom Vitest environment instead of the Node base. Done — this added the jsdom
  `environmentMatchGlobs` env; this item's `lib` half needed splitting the single flat `tsconfig.typecheck.json`
  into per-package configs first (`lib` is program-wide, not per-directory), landed by splitting it into
  `packages/*/tsconfig.typecheck.json` + `apps/dashboard/tsconfig.typecheck.json` (each `extends` that package's
  own build `tsconfig.json`, chained in the root `typecheck` script since composite project references can't
  combine with `--noEmit` — TS6310, confirmed empirically). `apps/dashboard/tsconfig.typecheck.json` now sets
  `"lib": ["ES2022", "DOM"]` for real (`src/web/shell.ts` uses `document`/`window` directly), scoped to that
  package alone — Node-only packages no longer see DOM globals leak in from the old flat program. Removed the
  now-redundant `apps/dashboard/test/web/dom-globals.d.ts` triple-slash shim it superseded. `jsx` remains
  N/A — no React/Vite UI yet; add it if/when that lands.
>>>>>>> autopilot/flight-worktree-fly-autopilot--fleet-5
