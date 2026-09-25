<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Reland: `ap-mug77xzl-convred` stays blocked — its first debrief was reverted by a gate flake, not by anything wrong with it

Board (high, still ranked #1 this round): "CONVERGENCE RED: pnpm run test
fails on autopilot/flight — make it pass before landing".

## What happened to the first attempt

A prior firing today wrote
`2026-09-25-verdict-ap-mug77xzl-convred-blocked.md` (commit `345db2a4`,
verdict: blocked, needs a safe execution window, no code touched) and it
was reverted (`0700c3ce`) minutes later. The revert's own commit carries no
diagnosis, but the firing prompt attached to this session names the cause:
`pnpm run test:impacted` failed with

```
FAIL  |node| packages/engine/test/adapters/git.test.ts > GitVcs > returns ''
      for showPatch on an invalid ref rather than throwing
Error: Hook timed out in 120000ms.
```

alongside a wall of `LF will be replaced by CRLF` warnings for `a.txt` and
`docs/note.md` — fixture files that a dozen unrelated suites
(`git.test.ts`, `firing-hooks.test.ts`, `prompt.test.ts`, three `inbox*`
suites) all create independently under `mkdtempSync`. `345db2a4` touched
only two files under `docs/debriefs/`; neither is imported by any test, so
this was never a case of the change itself breaking `showPatch` — a
`beforeEach` hook timeout on an isolated git fixture is the same shape
`docs/FAILURE-DOCTRINE.md` row 55 already named: "The gate reverted good
work because the machine was busy... a docs-only change among them, redone
a firing later." Row 55's shipped fix (`classifyExecFailure` in
`adapters/gate.ts`) demotes a crash whose only output is a worker-start
failure to "no verdict" — but this run named one specific failing test
with a hook timeout, not a bare worker-start crash, so it fell outside
that fix's pattern match and was scored as a real red. Six sibling lanes
(`fleet-2`, `-3`, `-5`, `-6`, `-7`, `-8`) were all live or carrying
unlanded work in this same round's fleet digest — the exact contention
row 55 and row 52 (full-suite runtime swinging 140s → 613s "on the same
commit... depending on disk load") already measured on this machine.

This firing does not touch `adapters/gate.ts`: teaching the classifier to
also demote an isolated single-test hook-timeout risks hiding a genuine
hang (a real infinite loop in `showPatch` would produce an identical
symptom), and that judgment call deserves its own firing with room to
read every call site of `classifyExecFailure`/`environmentCrashReason`
and the tests that pin their current boundary — not a rider on a doc
reland.

## VERDICT (unchanged)

**Blocked — needs a safe execution window, not a code fix from this
firing.** Nothing in the environment has changed since the first debrief:
the same six sibling lanes are still live per this firing's fleet digest,
`gh run list` still has nothing for this branch's convergence checks, and
`.autopilot/`/`.tmp-autopilot/` are still absent from this worktree. The
reasoning in the first debrief holds; this file supersedes it only by
folding in the revert as further evidence that the *first* attempt's
disappearance was a gate artifact, not a retraction. No git revert, no
speculative edit to `convergence-gate.ts`/`convergence-red-task.ts`
(`docs/FAILURE-DOCTRINE.md` row 60's self-closing mechanism is already in
place and will close this task itself the next time a full gate runs
`pnpm run test` clean on this branch).

## Proposed follow-up (not this firing's unit)

File a board task to extend `classifyExecFailure` /
`environmentCrashReason` (`packages/engine/src/adapters/gate.ts`) so a
single isolated `Hook timed out` failure — one test, no assertion
mismatch, under measured multi-lane disk contention — degrades to
"crash, no verdict" the same way a bare worker-start failure already
does, without masking a genuinely hanging test. That is a judgment-heavy
change to the gate's own trust boundary and belongs in a firing with
room to verify it against the existing `gate-exec.test.ts` suite, not a
rider on this reland.

## Verification note for this firing's own METRICS

Same shape as the reverted attempt: this is a new file under
`docs/debriefs/` plus the regenerated `docs/debriefs/README.md` index.
`docs/` is excluded from `prettier --check .` (`.prettierignore`) and from
ESLint's configured `files` globs (`eslint.config.js` targets only
`*.ts`/`*.mjs`/`*.js`), so it adds no source or test code; `typecheck` and
`build` are structurally unaffected. This firing ran `pnpm run typecheck`,
`pnpm run lint`, `pnpm run format:check`, and `pnpm run build` directly
(all fast, non-multi-minute checks) rather than the full `pnpm run test`
suite, per the active MACHINE BUDGET constraint — the harness's own
post-commit gate runs the impacted/full suite next.
