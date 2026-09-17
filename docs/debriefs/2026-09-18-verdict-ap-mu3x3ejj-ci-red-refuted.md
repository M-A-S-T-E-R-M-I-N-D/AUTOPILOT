<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mu3x3ejj-ci-red`: "CI RED after landing main → 9119cce: ci.yml — failure" — refuted

Board (high, ranked #1 this firing): "CI RED after landing main → 9119cce:
ci.yml — failure (29m ago)".

## Verification of the claim

1. **The named SHA's own CI run is green, not red.** `9119cce` is `chore:
   land autopilot/flight into main` (2026-09-16T12:47:38+03:00, landing
   refreshed visual-regression baselines only — five PNG snapshots, no
   source). `gh api .../commits/9119cce.../check-runs` and `gh run list
   --json headSha` both resolve that exact SHA to CI run id 35081420183 and
   CodeQL run id 35081420043; `gh run view 35081420183 --json jobs` shows
   all six `ci.yml` jobs — `reuse lint (optional)`, `doc commit-SHA
   citations are reachable from HEAD`, `e2e (dashboard, real browser)`, and
   `verify` on ubuntu-latest/windows-latest/macos-latest — conclusion
   `success`, with real multi-minute durations (10–20 minutes per `verify`
   job, 09:47:45–10:08:24 UTC), not a suspiciously fast false-green.
2. **The tip is green too.** The current `main` push run (id 35266962422,
   head `4d5f3e78`, the zod dependency bump) also completed `success` across
   the same six jobs, over a day after the SHA this alert names landed.
3. **A different SHA did fail in between, and was already self-fixed.** Run
   id 35257108262 on `8490c592` (`chore: land autopilot/flight into main`,
   2026-09-17T21:09:28+03:00) failed `verify` on all three OSes with
   `no-personal-paths FAILED: 3 personal identifier(s) found` — a
   drive-letter path leaking into source. That is a real, but separate,
   incident: it is not `9119cce`, and it was already fixed by the very next
   commit, `b36ae0c0` ("fix(ci): keep drive-letter paths out of source, and
   let scanner reds name their remedy"), landed before this firing started.
   Every push since (`6712f26d`, `60181aff`, `0151f18c`, `17dfa96c`,
   `4d5f3e78`) is green.

No `ci.yml` failure reproduces against `9119cce` specifically, nor against
the current tip. The alert's premise does not match the GitHub Actions
record for the SHA it names — this is the same stale-signal shape as
`ap-mu1uhdt4-ci-red` (`2026-09-16-verdict-ap-mu1uhdt4-ci-red-refuted.md`)
and `ap-mtyzq62b-ci-red` (`2026-09-13-verdict-ap-mtyzq62b-ci-red-refuted.md`)
before it — a third recurrence of the same pattern.

## VERDICT

**Refuted — stale/inaccurate.** Per the repo's stale-red-signal doctrine
(`docs/debriefs/2026-09-06-red-main-revert-cascade.md`): a red-main signal
can lag a fix by naming an SHA whose own run was never red, or point past a
since-resolved incident. No revert, no fix commit, and no further action is
warranted — there is nothing broken in the tree to act on.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file plus the regenerated
`docs/debriefs/README.md` index (`node
scripts/docs/generate-debriefs-index.mjs`), both pure documentation:
`docs/` is excluded from `prettier --check .` (`.prettierignore`) and from
ESLint's configured `files` globs (`eslint.config.js` targets only
`*.ts`/`*.mjs`/`*.js`), so it adds no source or test code and
`typecheck`/`build` are structurally unaffected. `gh run view`/`gh run
list`/`gh api` evidence above was gathered read-only against the real
Actions history for this repo.
