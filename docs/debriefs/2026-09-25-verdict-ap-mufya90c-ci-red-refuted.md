<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mufya90c-ci-red`: "CI RED after landing main → 4b47e76: ci.yml — failure" — refuted

Board (high, ranked #1 this firing): "CI RED after landing main → 4b47e76:
ci.yml — failure (1h ago)".

## Verification of the claim

1. **The named SHA's own `CI` workflow run is green, not red.** `4b47e763` is
   `chore: land autopilot/flight into main` (2026-09-24T22:54:11+03:00).
   `gh run list --commit 4b47e76365f4...` shows exactly one attempt each of
   the `CI` and `CodeQL` (`Push on main`) workflows for this SHA, plus one
   Dependabot Updates run, all `completed`/`success` (`databaseId`
   36051278456, 36051277442, 36051395282) — no failed attempt precedes them.
2. **Every individual check run agrees.** `gh api
   repos/.../commits/4b47e763.../check-runs` lists all ten jobs —
   `Analyze (actions)`, `Analyze (javascript-typescript)`, `Secret scan`,
   `verify` on ubuntu-latest/macos-latest/windows-latest, `e2e (dashboard,
   real browser)`, `doc commit-SHA citations are reachable from HEAD`, `reuse
   lint (optional)`, and `Dependabot` — conclusion `success` on every one,
   first attempt.
3. **The real red was the prior landing, already fixed before this SHA
   existed.** `fb2f9db8` (`chore: land autopilot/flight into main`,
   2026-09-24T20:57:04+03:00, an ancestor of `4b47e763` per `git merge-base
   --is-ancestor`) has the one `CI` run that DID fail in this window
   (`databaseId` 36037858198, 2026-09-24T17:57:11Z): the `e2e (dashboard,
   real browser)` job's mobile suite failed all three attempts on `shell
   mobile app shell — WCAG 2.5.8 the 24px floor`, a deep-equality mismatch on
   a touch target's measured size. The root cause was a real regression — the
   Settings panel's What's New button rendered 18px wide in a compact
   window's stacked column — fixed by `93374fcc` (`fix(dashboard): the
   what's-new settings button keeps its size on a phone`, 22:35:07+03:00) and
   pinned by a new regression test in `7a2a7493` (`test(e2e): the settings
   what's-new button keeps a thumb-sized target on a phone`, 22:47:37+03:00).
   Both commits are ancestors of `4b47e763` and landed roughly 20 minutes
   before it did — `4b47e763`'s own green `e2e` run already reflects the fix.
4. **The current tip is green too.** `7115446b` (2026-09-24T23:31:45+03:00,
   the present `main` HEAD) has its own `CI` run `success`
   (`databaseId` 36055486763), so nothing has regressed since.

No `ci.yml` failure reproduces against `4b47e76` — the SHA this task names is
fully green on every job, first attempt. This is the same
stale/mischaracterized-signal shape as `ap-mu8jt1xg-ci-red`
(`2026-09-19-verdict-ap-mu8jt1xg-ci-red-refuted.md`), `ap-mu6rf2a8-ci-red`
(`2026-09-19-verdict-ap-mu6rf2a8-ci-red-refuted.md`), `ap-mu3x3ejj-ci-red`
(`2026-09-18-verdict-ap-mu3x3ejj-ci-red-refuted.md`), `ap-mu1uhdt4-ci-red`
(`2026-09-16-verdict-ap-mu1uhdt4-ci-red-refuted.md`), and `ap-mtyzq62b-ci-red`
(`2026-09-13-verdict-ap-mtyzq62b-ci-red-refuted.md`) before it — a sixth
recurrence of the same pattern: the board's CI-red alert names the *landing*
SHA associated with a recent red window, not necessarily the SHA whose own
run actually failed, and a fast-follow fix that lands before the alert is
read makes the named SHA green by the time anyone checks it.

## VERDICT

**Refuted — stale/inaccurate.** Per the repo's stale-red-signal doctrine
(`docs/debriefs/2026-09-06-red-main-revert-cascade.md`): a red-main signal
can lag a fix or point past a since-resolved incident. Here the named SHA
itself never had a failing `CI` run, the actual regression (an 18px mobile
touch target violating WCAG 2.5.8) was real but was already fixed and
regression-tested by two commits that landed before `4b47e76`, and the
current tip remains green. No revert, no further fix, and no additional
action is warranted. A sixth same-shaped recurrence in under two weeks
reinforces the case already raised in `ap-mu8jt1xg-ci-red`'s debrief: the
board's CI-red alert source is worth auditing for how it attributes a red
conclusion to a landing SHA that turns out to have none.

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
