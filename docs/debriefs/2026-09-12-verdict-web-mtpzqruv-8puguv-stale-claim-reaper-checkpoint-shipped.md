<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# COLLAB PROTOCOL stale-claim reaper (`web-mtpzqruv-8puguv`): firing 507's checkpoint verified and closed

Per the RESUME CHECK protocol, this firing's first job was to finish the unit
firing 507 left mid-flight (`e97024a3 "wip(autopilot): checkpoint — firing
507 died mid-unit; next firing resumes it"`, `.autopilot-intent`:
"`.github/workflows/stale-claim-reaper.yml` — COLLAB PROTOCOL slice
(web-mtpzqruv-8puguv): scheduled workflow auto-releases quiet claims after
14 days, matching claim.yml/ROADMAP.md's documented promise"). The
checkpoint's diff was already complete and the working tree was already
clean — nothing further to write — so this firing's unit was full-gate
verification of that diff before treating the slice as done.

## What the checkpoint shipped

`.github/workflows/stale-claim-reaper.yml`: a scheduled workflow (daily cron
+ `workflow_dispatch`) that enforces the promise `claim.yml` already makes
every claimer (`"14 quiet days auto-release it"`) and `docs/ROADMAP.md`'s
"How work gets shared" table already documents (row: `Hand it back | Comment
/unclaim (or 14 quiet days auto-release it)`) — a promise that, before this
slice, nothing actually enforced. For every open `claimed` issue with an
assignee, it reads the issue timeline (which carries both the `assigned`
event and every later comment/commit-reference/cross-referenced PR
attributed to that actor), takes the later of assignment-time or
last-activity-time as the baseline, and — once quiet for ≥14 days — removes
the assignee, strips the `claimed` label, and posts a kind auto-release
comment inviting a re-claim. Same zero-third-party-action stance as
`claim.yml`: only the runner's preinstalled `gh`/`jq` and the workflow
`GITHUB_TOKEN`.

## Verification performed this firing

- `node scripts/ci/validate-spdx-headers.mjs` — clean (1407 files, including
  the new workflow's header).
- `pnpm run ci:validate-configs` — clean (33 JSON configs; the new workflow
  has no `uses:` steps at all, same as `claim.yml`, so the unpinned-action
  scanner has nothing to flag).
- `pnpm run typecheck` — clean.
- `pnpm run lint` — clean.
- `pnpm run format:check` — clean.
- `pnpm run build` — clean.
- `pnpm run test:impacted` (`vitest run --changed HEAD~1` +
  `test:registry-guards`) — 653/653 passed, including
  `apps/dashboard/test/flight/pr-review.test.ts` (429 tests) and the
  splice-manifest/chunks/bundle-size census suite.
- Cross-checked the new workflow's promise against `docs/ROADMAP.md` line 59
  and `claim.yml`'s own claim-comment text — both already state "14 quiet
  days auto-release it" verbatim, so no doc wording needed to change; the
  workflow is what now makes that sentence true rather than aspirational.
- Confirmed no existing test file exercises `claim.yml`'s bash logic either
  (grepped `apps/dashboard/test/` and `docs/`) — so the absence of a
  dedicated test for `stale-claim-reaper.yml` matches the established
  pattern for this class of file, not a coverage gap.

## Verdict

**Close — genuinely complete, not a hoped-but-unverified checkpoint.** The
workflow file is syntactically and semantically consistent with its sibling
`claim.yml`, matches the documented protocol it enforces, and the full gate
(typecheck/lint/format/build/test, plus the SPDX and config-shape scans) is
green with zero additional code changes needed.

## Pick-discipline note

This firing did not re-triage the board — RESUME CHECK requires finishing
firing 507's already-committed unit before this firing is "free to pick" at
all, so `picked_rank` reflects `web-mtpzqruv-8puguv`'s position (9th) in
this firing's assigned board order, with the resume mandate as the
deviation reason. Ranks 1-8 were not evaluated this firing; they remain
open for a subsequent firing's own PICK DISCIPLINE pass.

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, a `docs/` path staged
with a scoped `git add`. `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), so this adds no
source or test code and `typecheck`/`build` are structurally unaffected. The
full gate above was run in full during verification of the checkpoint's own
diff and passed clean.
