<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtpzz1yd-1`: the MERGE-ESCALATION split was carried out in four slices, all live — close; rung 4 has not resolved a conflict yet

Board: "VERDICT split `web-mtloi2qq-4hkdyu` (MERGE-ESCALATION agent)". This
is a VERDICT task: a prior firing's proposal about another task, not
buildable work. Under the VERDICT-processing protocol, this firing checks
the claim against the code, tests and git history, and completes this task
with the evidence. It leaves the named task alone.

## What the two ids are

The board summary carries only the title. The verdict's body lives in the
operator's store, outside this flight's worktree, so this firing worked from
the title and the spec it points at. The ids decode (base-36 ms) to:

- `web-mtloi2qq-4hkdyu`: 2026-09-03 15:27 UTC. That is the day
  `docs/EVALUATION-2026-09-03-sync-conflict-taxonomy.md` landed and created
  the board task "MERGE-ESCALATION: agent-resolved sync-back conflicts,
  gate-validated" as rung 4 of the sync-back conflict ladder.
- `ap-mtpzz1yd-1`: 2026-09-06 15:59 UTC. No rung-4 code existed then. The
  first rung-4 file appears in a checkpoint two days later.

So the verdict said "too big for one firing" before any of the work began.
That call was right. The work took four slices over four days, and two of
them needed a second firing.

## The split, as it actually shipped

| Slice | What it adds | Commits |
| --- | --- | --- |
| 1. Conflict context | `gatherMergeConflictContext` reads base/ours/theirs for each unmerged path from the index (stages 1-3; a missing stage is `null`, so add/add and delete/modify still work). `formatMergeEscalationContext` renders it. The `STRANDED SYNC-BACK` task carries it as its body. | `b8edea48` (checkpoint, firing 269), then `4fc1c0f6` (2026-09-09, names `web-mtloi2qq-4hkdyu`) |
| 2. Decision core | `runMergeEscalationAgent`: invoke the agent, check that nothing is left unmerged, run the gate, commit. Every outcome other than `resolved` aborts the merge first. | `677f93a0`, reverted by `6d3283cb`, relanded as `0274f844` (2026-09-09) |
| 3. Real git and gate wiring | `createGitMergeEscalationDeps`: real `git diff --diff-filter=U`, `git commit --signoff`, `git merge --abort`, and the caller's `GatePort`. | `c94472df` (2026-09-09) |
| 4. Live wiring | An optional `escalate` hook on `syncWorktreeBranch`, supplied only at the flight-end sync-back in `apps/dashboard/src/fly.ts`. The agent is a `ClaudeCliModel` capped at 15 turns and $3. | `219f7298` (checkpoint, firing 483), then `ee3177bf` (2026-09-12) |

A later change kept the rung's gate where it has to be. `68a7fd06`
(2026-09-19, doctrine row 32) moved every convergence gate into the lane's
private worktree, except the escalation's. An in-progress merge exists only
in the live checkout.

## Each clause of the rung-4 spec, checked against HEAD

| Spec clause (`EVALUATION-2026-09-03-sync-conflict-taxonomy.md`) | Where it is met |
| --- | --- |
| Context: both sides, the merge base, and more than the hunk | full-file stages 1-3 per path, `packages/engine/src/adapters/merge-conflict-context.ts` |
| The agent writes a candidate resolution | `buildMergeEscalationPrompt`: resolve only the listed paths, keep both lanes' intent, `git add` each file, do not commit |
| The FULL detected gate validates it | `fullConvergedGate` in `fly.ts`: `fullGateSpec` plus every `ci:*` extra. That includes `ci:conflict-markers`, which is what catches a file the agent staged with its markers still in it. `git diff --diff-filter=U` only sees unmerged index entries. |
| Green: commit with an attribution trailer | `mergeEscalationCommitMessage`: `Merge-Escalation-Agent: docs/EVALUATION-2026-09-03-sync-conflict-taxonomy.md rung 4` |
| Red: abort, strand honestly, file the inbox task as before | `runMergeEscalationAgent` aborts. `syncWorktreeBranch` then falls through to its own `merge --abort` and returns the conflicts. `fly.ts` files the `STRANDED SYNC-BACK` task as `needs_approval`. |
| The audit ritual still covers the agent | `scripts/audit-sync-merges.mjs` selects `--merges --grep=chore: sync`. That is a substring match, so the rung-4 subject `chore: sync <lane> into <target> (rung 4 merge-escalation agent resolved)` is audited like any other sync merge. |

Tests, run this firing: `merge-escalation-agent.test.ts`,
`merge-conflict-context.test.ts` and `merged-head-gating.test.ts` pass 29 of 29.
The four `escalate` cases in `worktree.test.ts` pass 4 of 4. Those cover a
hook that resolves (no abort, success), a hook that fails (abort, refuse,
conflicts attached) and a failed merge with no conflicts (the hook is never
called).

## What the evidence does not show: a resolved conflict

`git log --all --grep='Merge-Escalation-Agent:'` returns nothing. No commit
carrying the rung's trailer exists on any ref, including the 2026-09-24
push-protection backup refs. Since `ee3177bf` went live, genuine content
conflicts have reached the rung at least twice:

- **2026-09-19.** Doctrine row 31: lane 3's merge "stopped on a content
  conflict in the generated debrief index and sat there while the escalation
  agent worked". That file is a `merge=union` absorber now, so this shape
  no longer reaches rung 4.
- **2026-09-25.** `ap-mug7lyxz-strand`: an add/add conflict on
  `config/mutation/stryker.ci-quarantine-report.config.mjs` stranded at
  flight end. The `STRANDED SYNC-BACK` task is filed only after the
  flight-end `syncWorktreeBranch` returns `ok: false`. That is the one call
  that carries `escalate`, so the agent had its attempt and did not land a
  resolution. (The 2026-09-25 debrief found the lane's work intact anyway.
  The other side of the name collision had already landed.)

This firing cannot say why the attempts failed, and neither can the
operator. The outcome (`agent-failed`, `left-unresolved`, `gate-red` or
`commit-failed`, with its details) goes only to the flight log through
`out()`. `syncWorktreeBranch` reads only `attempt.ok` from a failed hook and
drops `attempt.details`. So the strand task's title carries the original
`git merge` failure text and its body the conflict context, and neither says
that rung 4 ran or why it gave up. Unlike `sync-back-refusal`, no event row
is written. The rung's success rate cannot be measured from the repository or
the store.

Two doc comments also still describe the rung as unwired. The module header
of `merge-conflict-context.ts` (lines 15-18) says the agent is "still
follow-on work" and the ladder "still stops at abort, refuse, file the
task". The `MergeEscalationDeps` doc in `merge-escalation-agent.ts` (line 81)
says "nothing here is wired to a real spawn/gate/commit yet". Both have been
stale since `ee3177bf`.

## VERDICT

**Close: the split was carried out.** All four slices the build needed are
on HEAD, wired live at the flight-end sync-back, and covered by passing
tests. Every clause of the rung-4 spec has code behind it. No slice is left
to propose. Whether to close `web-mtloi2qq-4hkdyu` itself is the operator's
call. This firing does not touch it.

One follow-up is proposed. It is not part of the split. It is what makes the
shipped rung measurable. Persist each rung-4 outcome (its kind and details)
as an event, carry it into the `STRANDED SYNC-BACK` task when the attempt
fails, and refresh the two stale doc comments above. Until that lands, "the
agent has resolved 0 of at least 2 live conflicts" is the only number anyone
can give, and it does not say whether the problem is the prompt, the 15-turn
cap, or the gate.
