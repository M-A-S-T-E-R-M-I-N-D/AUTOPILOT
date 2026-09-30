<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mun9xrba-2`: "test:impacted blast radius: fleet-report.ts -> round-evaluation.ts -> fly.ts -> cli.ts/server/main.ts" — refuted, and the real gap runs the other way

Board (medium): "test:impacted blast radius: fleet-report.ts -> round-evaluation.ts
-> fly.ts -> cli.ts/server/main.ts, so vitest --changed on any fleet-report or
round-evaluation edit runs the whole git-heavy flight…" (title truncated by the
board summary). The id's timestamp half (`mun9xrba`, base-36 milliseconds)
decodes to 2026-09-30 01:54:53 +03:00. It was filed alongside `ap-mun9xrap-1`,
which is a separate harness task.

## What the claim gets right

The static imports it names are real:

- `apps/dashboard/src/flight/round-evaluation.ts` imports `renderFleetReport`,
  `summarizeConvergence` and `summarizeFirings` from `read/fleet-report.ts`.
- `apps/dashboard/src/fly.ts` imports `ROUND_START_SLACK_MS`, `endRound` and
  `gitIn` from `flight/round-evaluation.ts`.
- `apps/dashboard/src/control/cli.ts` imports from both.

## Why the blast radius stops there

`vitest run --changed <ref>` selects a test only when the changed file sits in
that test's own import graph. The chain ends at `fly.ts` for tests, because
`fly.ts` is a process entry point, never a module a test imports:
`server/main.ts` and `control/cli.ts` locate it by path
(`new URL('../fly.js', import.meta.url)`) and spawn it. No test file imports
`fly.ts`, `control/cli.ts` or `server/main.ts`. Six tests read `fly.ts`, but
only as source text through `readFileSync`, and a text read is not an edge in
the graph. `read/fleet-report-source.ts` imports only types from
`fleet-report.ts`, and type imports are erased before Vitest walks the graph,
so that one adds no edge either.

## Measured

Each probe below made a one-comment edit to the file, ran
`pnpm exec vitest list --changed --filesOnly` (Vitest 4.1.11, the same
selection `test:impacted` uses, diffed against the working tree instead of a
ref), then ran `git restore` on the file.

| Edited file | Tests `--changed` selects |
| --- | --- |
| `apps/dashboard/src/read/fleet-report.ts` | `test/read/fleet-report.test.ts`, `test/flight/round-evaluation.test.ts` |
| `apps/dashboard/src/flight/round-evaluation.ts` | `test/flight/round-evaluation.test.ts` |
| `apps/dashboard/src/fly.ts` | none |

Running the two files a fleet-report edit selects took 23.8s of wall clock:
31 tests, 12.5s of test time, and 12.4s of that in `round-evaluation.test.ts`'s
real-git suites. That is the "git-heavy" part of the claim, and it is the whole
of it.

Even that suite is already paid for on every firing. `round-evaluation.test.ts`
is one of the 36 files `pnpm run test:registry-guards`
(`scripts/ci/run-repo-census-tests.mjs`) runs on every per-firing gate,
whatever changed. So a fleet-report edit costs one extra test file beyond that
fixed set: the pure `fleet-report.test.ts`, which runs in milliseconds.

## The real gap runs the other way

The proposal worried that editing a leaf module runs too much. The probes show
the opposite problem at the root: **an edit to `fly.ts` selects zero tests at
the per-firing gate.** Six test files pin `fly.ts` by reading its source text:

- `apps/dashboard/test/flight/lane-head.test.ts`
- `apps/dashboard/test/flight/lane-freshness.test.ts`
- `apps/dashboard/test/flight/strand-tasks.test.ts`
- `apps/dashboard/test/flight/merged-head-gating.test.ts`
- `apps/dashboard/test/flight/social-flight-pass.test.ts`
- `apps/dashboard/test/flight/round-evaluation.test.ts`

Only the last one is in the census set, and it got there because its
temporary-repo fixtures mention `docs/` paths, not because it reads `fly.ts`.
The other five run in neither leg of the per-firing gate. They run only on the
scheduled full suite (`FULL_TEST_EVERY_N_FIRINGS = 5` in
`apps/dashboard/src/flight/gate-schedule.ts`). This is the same failure shape
that `run-repo-census-tests.mjs` was written to close for README, docs and
config reads: a test that reads a file by path imports nothing it checks. That
script's `REPO_PATH_RE` does not cover `src/` reads.

## VERDICT

**Close — refuted.** An edit to `fleet-report.ts` or `round-evaluation.ts`
does not reach `fly.ts`, `cli.ts` or `server/main.ts` in any test's import
graph, so it cannot run "the whole git-heavy flight". Its measured extra cost
at the per-firing gate is one pure test file. Nothing needs cutting.

The inverse gap (a `fly.ts` edit gates on zero tests) is real. It is filed as
its own proposal rather than fixed here, because the fix changes gate test
selection in `scripts/ci/run-repo-census-tests.mjs` and needs its own
reviewed slice.

## Verification note for this firing's own METRICS

This unit is this debrief plus the regenerated `docs/debriefs/README.md` index
(`node scripts/docs/generate-debriefs-index.mjs`). Both are documentation only.
The three probe edits were restored with `git restore` before anything was
staged, and `git status --short` was empty after each one. The evidence came
from `vitest list --changed`, one targeted `vitest run` of the two selected
files, `run-repo-census-tests.mjs --list`, and read-only source inspection.
The newest commit to touch `fleet-report.ts` is `287f395d`, and the commit that
created the round evaluation is `f1175bd0`. Both are ancestors of this
firing's HEAD, so the probes measured the graph as it stands.
