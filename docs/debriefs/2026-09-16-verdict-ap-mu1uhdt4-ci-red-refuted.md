<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mu1uhdt4-ci-red`: "CI RED after landing main → cd9d8ba: ci.yml — failure" — refuted

Board (high, ranked #1 this firing): "CI RED after landing main → cd9d8ba:
ci.yml — failure (3h ago)".

## Verification of the claim

1. **The named SHA's own CI run is green, not red.** `cd9d8ba` is `chore:
   land autopilot/flight into main` (2026-09-15T01:58:59+03:00, landing the
   round-7 visual baselines). `gh run list --workflow ci.yml --json headSha`
   matches that exact SHA to run id 34906708892, and `gh run view` on that
   run id shows all six jobs — `reuse lint (optional)`, `e2e (dashboard, real
   browser)`, `doc commit-SHA citations are reachable from HEAD`, and `verify`
   on macos-latest/ubuntu-latest/windows-latest — conclusion `success`, with
   real multi-minute durations (11–19 minutes per `verify` job), not a
   suspiciously fast false-green.
2. **The tip is green too.** The current `main` push run (id 34930233601,
   head `969440b4`) also completed `success` across the same six jobs 4 hours
   after the SHA named in this alert landed.
3. **Two runs between those did fail** (id 34908688068 on `a4d5c6de`, id
   34911491928 on `9f542efc`) — but neither is `cd9d8ba`, and both were
   already superseded by a later green push before this firing started. They
   are a separate, self-resolved incident, not evidence for the SHA this
   alert names.

No `ci.yml` failure reproduces against `cd9d8ba` specifically, nor against
the current tip. The alert's premise does not match the GitHub Actions
record for the SHA it names — this is the same stale-signal shape as
`ap-mtyzq62b-ci-red` (`2026-09-13-verdict-ap-mtyzq62b-ci-red-refuted.md`).

## VERDICT

**Refuted — stale/inaccurate.** Per the repo's stale-red-signal doctrine
(`docs/debriefs/2026-09-06-red-main-revert-cascade.md`): a red-main signal
can lag a fix, or simply not match the named SHA's own run history. No
revert, no fix commit, and no further action is warranted — there is
nothing broken in the tree to act on.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file plus the regenerated
`docs/debriefs/README.md` index (`node
scripts/docs/generate-debriefs-index.mjs`), both pure documentation:
`docs/` is excluded from `prettier --check .` (`.prettierignore`) and from
ESLint's configured `files` globs (`eslint.config.js` targets only
`*.ts`/`*.mjs`/`*.js`), so it adds no source or test code and
`typecheck`/`build` are structurally unaffected. `gh run view`/`gh run list`
evidence above was gathered read-only against the real Actions history for
this repo.
