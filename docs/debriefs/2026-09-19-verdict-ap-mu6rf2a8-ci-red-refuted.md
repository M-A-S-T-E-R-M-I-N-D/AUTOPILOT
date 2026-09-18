<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mu6rf2a8-ci-red`: "CI RED after landing main → cfec097: ci.yml — failure" — refuted

Board (high, ranked #1 this firing): "CI RED after landing main → cfec097:
ci.yml — failure (58m ago)".

## Verification of the claim

1. **The named SHA's own `ci.yml` run is green, not red.** `cfec097` is
   `chore: land autopilot/flight into main` (2026-09-18T12:32:04+03:00,
   merging epic 0035 modular-landings work). `gh api
   repos/.../commits/cfec0974.../check-runs` shows all six `ci.yml` jobs —
   `reuse lint (optional)`, `doc commit-SHA citations are reachable from
   HEAD`, `e2e (dashboard, real browser)`, and `verify` on
   ubuntu-latest/windows-latest/macos-latest — conclusion `success`, with
   real multi-minute durations (11–24 minutes per `verify` job,
   09:32–09:56 UTC), not a suspiciously fast false-green.
2. **The actual failure on that commit is not `ci.yml` at all.** The same
   `check-runs` response lists two entries named `Dependabot` — GitHub's
   native dependency-update job (from `.github/dependabot.yml`'s weekly
   `npm` schedule), a separate check that never runs as part of this repo's
   `ci.yml` workflow. One succeeded; the other failed with `Dependabot
   encountered '1' error(s)` and `| @types/node | unknown_error | null |`
   — an internal Dependabot-service error with no detail beyond
   `unknown_error`, after it had already opened its intended PR (`zod` 4.6.2
   → 4.6.5). `.github/dependabot.yml` itself is unchanged and was not the
   proximate cause: this is a transient service-side hiccup in GitHub's own
   updater container, not a lint/build/test failure this repo's code or
   config can fix.
3. **Every landing since is green too.** The five commits landed after
   `cfec097` (`0618fe31`, `c9a7eded`, `ba63a75b`, `a7688886`, and the
   current tip `4ddc1485`) each show `success` on every completed `ci.yml`
   job; `4ddc1485`'s three `verify` jobs were still `in_progress` at the
   time of this check (started ~2 minutes prior) with everything already
   completed — `e2e`, `reuse lint`, `doc commit-SHA citations`, both CodeQL
   analyses — green.

No `ci.yml` failure reproduces against `cfec097`, nor against any commit
since. The alert conflates GitHub's separate `Dependabot` auto-update check
with this repo's `ci.yml` workflow — the same stale/mischaracterized-signal
shape as `ap-mu3x3ejj-ci-red`
(`2026-09-18-verdict-ap-mu3x3ejj-ci-red-refuted.md`), `ap-mu1uhdt4-ci-red`
(`2026-09-16-verdict-ap-mu1uhdt4-ci-red-refuted.md`), and
`ap-mtyzq62b-ci-red` (`2026-09-13-verdict-ap-mtyzq62b-ci-red-refuted.md`)
before it — a fourth recurrence of the same pattern, this time with a new
false-positive source (a Dependabot service error, not a workflow job).

## VERDICT

**Refuted — stale/inaccurate.** Per the repo's stale-red-signal doctrine
(`docs/debriefs/2026-09-06-red-main-revert-cascade.md`): a red-main signal
can lag a fix, point past a since-resolved incident, or — as here — name a
check that was never part of `ci.yml` in the first place. No revert, no fix
commit, and no further action is warranted — there is nothing broken in the
tree to act on. Given the recurrence count, a future slice may be worth
narrowing the board's CI-red alert source to `ci.yml`-only check runs
(excluding GitHub-native checks like `Dependabot` and `CodeQL`) so it stops
re-raising the same false positive shape.

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
