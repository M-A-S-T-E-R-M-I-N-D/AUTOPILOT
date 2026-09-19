<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mu8jt1xg-ci-red`: "CI RED after landing main → 18c6cfa: ci.yml — failure" — refuted

Board (high, ranked #1 this firing): "CI RED after landing main → 18c6cfa:
ci.yml — failure (34m ago)".

## Verification of the claim

1. **The named SHA's own `CI` workflow run is green, not red.** `18c6cfa2` is
   `chore: land autopilot/flight into main` (2026-09-19T18:34:32+03:00).
   `gh run list --commit 18c6cfa2...` shows exactly one attempt each of the
   `CI` and `CodeQL` workflows for this SHA, both `completed`/`success`
   (`databaseId` 35452243144 and 35452243099, both created
   2026-09-19T15:34:38Z) — no failed attempt precedes them.
2. **Every individual check run agrees.** `gh api
   repos/.../commits/18c6cfa2.../check-runs` lists all eight jobs —
   `Analyze (actions)`, `Analyze (javascript-typescript)`, `verify` on
   ubuntu-latest/macos-latest/windows-latest, `e2e (dashboard, real
   browser)`, `doc commit-SHA citations are reachable from HEAD`, and `reuse
   lint (optional)` — conclusion `success`, with real multi-minute durations
   (11–25 minutes per `verify` job), not a suspiciously fast false-green.
   There is no `ci.yml` job, nor any GitHub-native check (Dependabot,
   CodeQL), showing a failure or even a prior failed attempt on this commit.
3. **The landing before and after are green too.** `9644eb0d` (the commit
   two land-cycles back) is the one `ci.yml` run that DID fail in this
   window (`databaseId` 35450437560, 2026-09-19T15:00:17Z) — but it was
   superseded by `93332cdc`'s fix before `18c6cfa2` ever landed, and
   `18c6cfa2`'s own run already reflects the fix (green, as above). The
   current tip `e6d8256c` has its `CI` run `in_progress` (started minutes
   ago) with `CodeQL` already `success`.

No `ci.yml` failure reproduces against `18c6cfa2` — the SHA this task names
is fully green on every job, first attempt. This is the same
stale/mischaracterized-signal shape as `ap-mu6rf2a8-ci-red`
(`2026-09-19-verdict-ap-mu6rf2a8-ci-red-refuted.md`), `ap-mu3x3ejj-ci-red`
(`2026-09-18-verdict-ap-mu3x3ejj-ci-red-refuted.md`), `ap-mu1uhdt4-ci-red`
(`2026-09-16-verdict-ap-mu1uhdt4-ci-red-refuted.md`), and `ap-mtyzq62b-ci-red`
(`2026-09-13-verdict-ap-mtyzq62b-ci-red-refuted.md`) before it — a fifth
recurrence, and the second one today, of the same pattern: this repo's
post-push verdict alert can name a SHA whose own run was, or has since
become, green.

## VERDICT

**Refuted — stale/inaccurate.** Per the repo's stale-red-signal doctrine
(`docs/debriefs/2026-09-06-red-main-revert-cascade.md`): a red-main signal
can lag a fix or point past a since-resolved incident. Here the named SHA
itself never had a failing `CI` run — no revert, no fix commit, and no
further action is warranted. Two same-day recurrences (this and
`ap-mu6rf2a8-ci-red`) strengthens the case already raised in that debrief:
the board's CI-red alert source is worth auditing for how it attributes a
red conclusion to a SHA that turns out to have none.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file plus the regenerated
`docs/debriefs/README.md` index (`node
scripts/docs/generate-debriefs-index.mjs`), both pure documentation:
`docs/` is excluded from `prettier --check .` (`.prettierignore`) and from
ESLint's configured `files` globs (`eslint.config.js` targets only
`*.ts`/`*.mjs`/`*.js`), so it adds no source or test code and
`typecheck`/`build` are structurally unaffected. `gh run list`/`gh api`
evidence above was gathered read-only against the real Actions history for
this repo.
