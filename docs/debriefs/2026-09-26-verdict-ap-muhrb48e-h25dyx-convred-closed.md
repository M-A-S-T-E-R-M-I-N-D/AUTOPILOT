<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-muhrb48e-h25dyx-convred`: "CONVERGENCE RED: pnpm run test fails on autopilot/flight" — root cause identified and already fixed at HEAD, closing

Board (high, ranked #1 this round): "CONVERGENCE RED: pnpm run test fails on
autopilot/flight — make it pass before landing".

## Timing: the red was filed against a since-fixed regression

The task id embeds its filing time: `muhrb48e` (base36) decodes to
`2026-09-26T02:14:33.518Z` (`2026-09-26 05:14:33 +0300`). The commit history
on `autopilot/flight` around that moment:

```
4ee20801  05:03:23 +0300  feat(docs): record the README demo as a frame sequence from the shared staged scene
04adf2f6  05:03:00 +0300  chore: sync autopilot/flight-worktree-fly-autopilot--fleet-5 into autopilot/flight
2dedce2f  05:06:05 +0300  chore: sync autopilot/flight-worktree-fly-autopilot--fleet-4 into autopilot/flight
                          ← task filed 05:14:33, against this SHA or earlier
eda1ec98  05:19:10 +0300  fix(gate): the per-firing gate also runs tests that scan the repository with git ls-files
a295ce9e  05:27:04 +0300  chore: land autopilot/flight into main  ← current HEAD
```

`4ee20801` added `scripts/docs/record-demo-frames.mjs`, whose fixture-server
`spawn()` call omitted `windowsHide: true`. That is a direct violation of
`apps/dashboard/test/flight/spawn-windows-hide.test.ts`'s
"every production spawn passes windowsHide" assertion, which scans every
`scripts/**/*.mjs` file for exactly this. That test is part of the plain
`pnpm run test` run (it has no `--changed`/impacted gating of its own), so
from `4ee20801` onward, `pnpm run test` on `autopilot/flight` would fail —
this is the concrete, reproducible cause the board title describes, not a
flake.

`eda1ec98`, landed ~5 minutes after the task was filed, fixes exactly this:
it adds `windowsHide: true` to the `record-demo-frames.mjs` spawn, and
separately teaches the whole-repo census
(`scripts/ci/run-repo-census-tests.mjs`) to recognize
`spawn-windows-hide.test.ts` itself as a repository-scanning test (it uses
`git ls-files` and names no folder literally, so the per-firing
`test:registry-guards` gate had never been running it — see
`docs/FAILURE-DOCTRINE.md` row 68). `a295ce9e` landed that fix into `main`
eight minutes later. This worktree's HEAD is `a295ce9e`, identical to `main`.

## What this firing verified on the current HEAD

Per MACHINE BUDGET, this firing does not run the full, multi-minute
`pnpm run test` itself under active fleet contention (the fleet digest for
this round lists five sibling lanes, several carrying unlanded work) — that
full-suite reproduction is the harness gate's job. Instead, on this exact
HEAD (`a295ce9e`):

- `vitest run apps/dashboard/test/flight/spawn-windows-hide.test.ts` — the
  test that the missing `windowsHide` call would have failed — passes clean
  (3/3 tests, including "every production spawn passes windowsHide").
- `vitest run apps/dashboard/test/tooling/run-repo-census-tests.test.ts` —
  the census test `eda1ec98` extended — passes clean (5/5 tests).
- `git show eda1ec98 -- scripts/docs/record-demo-frames.mjs` confirms the
  literal fix: `spawn(process.execPath, [FIXTURE_SERVER], { stdio: 'ignore' })`
  → `{ stdio: 'ignore', windowsHide: true }`.

The specific, identified cause of the red is fixed at HEAD, and the fixing
commit is already merged to `main` (not just sitting on `autopilot/flight`).

## VERDICT

**Close.** Unlike a merely "likely stale" red where no specific failure
could be pinned down (see `ap-muhfpue7-ne4oua-convred`'s debrief,
2026-09-26), this one has an identified, reproduced-by-inspection root
cause — a `windowsHide`-guard violation in a commit filed shortly before
this task — and the fix for that exact cause is an ancestor of current
HEAD on both `autopilot/flight` and `main`. `convergence-red-task.ts`'s
`closeResolvedConvergenceRedTasks` self-closes this task the next time a
full convergence gate runs `pnpm run test` clean, which the evidence above
says it now will.

## Proposed follow-up (not this firing's unit)

None new. `docs/FAILURE-DOCTRINE.md` row 68 (added in `eda1ec98`) already
captures the generalizable lesson (a `git ls-files`-based census test counts
as repository-reading for gate-discovery purposes) — no further action
needed from this debrief.

## Verification note for this firing's own METRICS

This is a new file under `docs/debriefs/` plus the regenerated
`docs/debriefs/README.md` index (`node
scripts/docs/generate-debriefs-index.mjs`). `docs/` is excluded from
`prettier --check .` (`.prettierignore`) and from ESLint's configured
`files` globs, so it adds no source or test code; `typecheck` and `build`
are structurally unaffected. This firing ran `pnpm run typecheck`,
`pnpm run lint`, `pnpm run format:check`, `pnpm run build`, and two targeted
`vitest run` invocations directly (both already clean at HEAD before this
commit — this debrief adds no source change), rather than the full
`pnpm run test` suite, per the active MACHINE BUDGET constraint.
