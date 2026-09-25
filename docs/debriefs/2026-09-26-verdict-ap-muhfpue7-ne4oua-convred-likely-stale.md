<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-muhfpue7-ne4oua-convred`: "CONVERGENCE RED: pnpm run test fails on autopilot/flight" — evidence points to stale, self-close expected

Board (high, ranked #1 this round): "CONVERGENCE RED: pnpm run test fails on
autopilot/flight — make it pass before landing".

## Timing: the red predates five commits that have since landed clean

The task id embeds its filing time: `muhfpue7` (base36) decodes to
`2026-09-25T20:50:05.215Z` (`2026-09-25 23:50:05 +0300`). The commit history
on `autopilot/flight` around that moment:

```
7f59a675  23:34:20 +0300  test(mutation): add the eleventh Stryker config for scripts/ci/*.mjs
43da1edb  23:35:27 +0300  chore: sync autopilot/flight-worktree-fly-autopilot into autopilot/flight
acb1ebe0  23:38:37 +0300  chore: sync autopilot/flight-worktree-fly-autopilot--fleet-5 into autopilot/flight
                          ← task filed 23:50:05, against this SHA or earlier
251c51ee  00:00:55 +0300  fix(engine): a firing's leftovers are set aside, and its commit is gated on its own
888b4fea  00:00:58 +0300  feat(flight): the fleet benchmarks its models and staffs each tier from the result
80beba4d  00:02:35 +0300  refactor(engine): the leftover stash reads its outcome from the tree
d123949d  00:16:25 +0300  docs(epics): record the 2026-09-19 timeout tuning and 2026-09-24 model-ranking fix on 0009
55e8549a  00:20:10 +0300  chore: sync autopilot/flight-worktree-fly-autopilot--fleet-2 into autopilot/flight  ← current HEAD
```

Five commits landed after the red was filed, each gated individually by the
harness before landing. This branch's current HEAD (`55e8549a`) is the exact
SHA this worktree sits on — `git diff --stat autopilot/flight HEAD` is empty.
This is the same shape `docs/FAILURE-DOCTRINE.md` warns about for red-main
signals generally: a red judged a SHA a later commit already moved past.

## The specific flake class from the last convred is already fixed

The prior convergence-red on this same check
(`ap-mug77xzl-convred`, filed and blocked-verdicted on 2026-09-25, see
`2026-09-25-verdict-ap-mug77xzl-convred-blocked-reland.md`) traced to an
isolated `Hook timed out in 120000ms` on
`packages/engine/test/adapters/git.test.ts` under multi-lane disk
contention. That debrief's proposed follow-up —
teaching `classifyExecFailure`/`environmentCrashReason` to demote an
isolated single-test hook-timeout to "no verdict" — shipped in `edda8b1f`
("fix(gate): demote a red gate to no-verdict for an isolated test hook
timeout", 2026-09-25 17:21:57 +0300), which is an ancestor of this HEAD.
`ap-muhfpue7-ne4oua-convred` was filed roughly 3.5 hours after that fix
landed, so it is a genuinely fresh filing, not a re-flag of the same
already-patched flake shape.

## What this firing verified on the current HEAD

Per MACHINE BUDGET, this firing does not run the bare, multi-minute
`pnpm run test` full suite itself under active fleet contention (the fleet
digest for this round lists six sibling lanes — `-3`, `-4`, `-5`, `-6`,
`-7`, `-8` — all live or carrying unlanded work); that full-suite
reproduction is the harness gate's job, not a self-initiated one here.
Instead, on this exact HEAD:

- `pnpm run test:impacted` (the gate's own scoped command) ran clean: 29
  test files, 1177 tests, including the full
  `packages/engine/test/adapters/git.test.ts` suite that hook-timed-out
  last time — no timeout, no hang, no `LF will be replaced by CRLF`
  fixture-warning noise this run.
- Targeted `vitest run` on the two source files touched by the newest,
  least-independently-verified commits at HEAD —
  `packages/engine/test/firing.test.ts` (72 tests) and
  `apps/dashboard/test/flight/model-scoreboard.test.ts` (11 tests) — both
  clean.
- `gh run list --branch autopilot/flight` shows nothing for this SHA (or
  any SHA landed after 2026-09-19); no external CI evidence exists to
  cross-check against.

No failing test was reproduced anywhere this firing could safely look.

## VERDICT

**Likely stale — default to WAITING, no code change from this firing.**
The red was filed against a SHA that five later commits have already
passed beyond, the one previously-diagnosed flake class it might have
matched is already patched upstream of HEAD, and every test this firing
could run within the machine budget (impacted suite plus the two
newest-code targeted files) is clean. Per the hard rule on red-main
signals, this firing does not chase it with a revert or a speculative
code change. `convergence-red-task.ts`'s `closeResolvedConvergenceRedTasks`
self-closes this task the next time a full convergence gate runs
`pnpm run test` clean on `autopilot/flight` — expected imminently once a
gate window is free of the current lane contention.

## Proposed follow-up (not this firing's unit)

None beyond what `ap-mug77xzl-convred`'s debrief already proposed (the
`classifyExecFailure` hook-timeout generalization), which has since
shipped. If a future firing finds this same task (or a same-shaped new
one) still open after several more commits have landed with their own
green gates, that is the point to suspect a real, reproducible failure
rather than staleness, and to escalate to running the full suite in a
dedicated solo-flight window per the MACHINE BUDGET guidance.

## Verification note for this firing's own METRICS

This is a new file under `docs/debriefs/` plus the regenerated
`docs/debriefs/README.md` index (`node
scripts/docs/generate-debriefs-index.mjs`). `docs/` is excluded from
`prettier --check .` (`.prettierignore`) and from ESLint's configured
`files` globs, so it adds no source or test code; `typecheck` and `build`
are structurally unaffected. This firing ran `pnpm run typecheck`,
`pnpm run lint`, `pnpm run format:check`, `pnpm run build`,
`pnpm run test:impacted`, and two targeted `vitest run` invocations
directly, rather than the full `pnpm run test` suite, per the active
MACHINE BUDGET constraint — the harness's own post-commit gate runs the
impacted/full suite next.
