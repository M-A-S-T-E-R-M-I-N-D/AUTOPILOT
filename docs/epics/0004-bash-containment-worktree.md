<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0004. Bash containment — fly from a worktree, not the live checkout

Status: Done — all slices landed (2026-08-13).

Post-completion evolution (2026-08-20 through 2026-08-24): `deriveWorktreePlan` gained the optional
`instanceId` key (PARALLEL UNLOCK C — every same-folder fleet member gets its own
physically separate worktree + branch), and worktree ops doctrine grew at fleet
scale: pre-warm worktrees (create + `pnpm install`) BEFORE launching a wide round
(`ensureWorktree` deliberately does not install dependencies), and re-baseline
instance branches after merge-time twin drops. The containment mechanism this
spec delivered is unchanged; fleet-scale usage lives in `docs/RESEARCH-LIBRARY.md`.
Subsequent fly.ts refactorings (2026-08-23 through present) extracted board-triage,
fleet-wisdom-mining, post-flight-sweeps, and firing-hooks logic into separate modules
for clarity, but the worktree-confinement mechanism (`deriveWorktreePlan` →
`ensureWorktree`/`syncWorktreeBranch` flow) remains structurally identical: `flightRoot`
still points at the ephemeral worktree, not `target`, and guards/gates/vcs all use
`flightRoot` as the working directory.

Post-completion evolution, continued (2026-08-16, 2026-08-27): the `onFiringComplete`
sync-back this epic's slice 3 wires (source comment literally tagged "Bash containment
slice 3") grew two behaviors of its own, neither touching the confinement mechanism
itself. First, a flight-end retry (`a81221fa`, board web-msupuosk-gjll3p): the per-firing
sync-back refuses outright whenever `target`'s checkout is dirty at that exact instant
(e.g. the operator mid-edit in their own live checkout), and that refusal used to be
final — a flight that stayed dirty for its whole run left every firing's commits
stranded on the worktree branch, invisible to the dashboard's LANDING card since it only
reads `target`'s own checked-out branch (144 commits over 2 days before this was
caught). One more sync-back attempt now runs at flight-end, placed after the self-study
ritual (the only other write a self-hosted flight makes into `target`), giving a flight
that was dirty at firing time one last chance to land before it ends. Second, a
convergence gate (`flight/convergence-gate.ts`): `gateConvergedBranch` re-verifies the
MERGED branch after every sync-back — a clean auto-merge of two individually-green
worktrees has twice still left `target` red (duplicate object keys, a dangling
re-export) that vitest missed but tsc caught. The per-firing sync-back runs
typecheck-only (~17s — the ~109s median gap between lane merges can't absorb more); the
flight-end final sync-back runs the FULL detected gate (typecheck + lint + format + test
+ build), since no per-firing cadence pressure applies once the last lane has landed.
Both are alarm-only: a red convergence is surfaced loudly and persisted, never blocks or
reverts the merge, since the work is already committed and safe. `flightRoot` stays the
one directory Bash executes in throughout — both additions are new behavior AT the
sync-back seam, not changes to what gets contained or where.

Post-completion evolution, continued again (2026-09-02): the `onFiringComplete`
sync-back gained a self-healing layer for recurring merge conflicts: `syncWorktreeBranch`
enables git rerere (with autoUpdate) before every merge — the first conflict still
refuses, but one manual operator resolution is recorded and REPLAYED on every later
occurrence. Additionally, `.gitattributes` marks append-only files (like
`docs/SELF-STUDY/PAPER.md`'s evidence sections) with `merge=union` for lossless
N-way merges, where regeneration self-heals misaligned derived fields on the next
run. A conflict with no recorded resolution and no union attribute still aborts and
refuses, preserving fail-loud semantics. This three-layer approach removes the lane
cap previously imposed by recurring file collisions at fleet scale.

Also on 2026-09-02: the `onFiringComplete` sync-back added a third escalation when
the FINAL sync-back refuses (e.g., due to merge conflicts that a retry loop cannot
resolve). Previously, a refusal was surfaced only as a log line and the landing card's
divergence banner — a 38-commit round sat stranded on the worktree branch for 2 days
behind 21 identical warnings that nobody reads mid-flight. The sync-back now files a
high-severity `STRANDED SYNC-BACK` task in the operator's approval inbox, naming the
worktree branch and the refusal reason. Tasks are deduped on the branch name, so
repeat flights over the same stranded branch do not stack copies. This is best-effort
telemetry, never blocking or reverting the flight. The worktree-confinement mechanism
and sync-back retry logic remain unchanged.

Post-completion evolution, continued (2026-09-03): launch time gained the other
half of lane freshness. Slice 2's `syncWorktreeBranch` drains a reused lane's
unlanded commits INTO `target` at launch (catch-up), but nothing ever moved the
lane worktree itself FORWARD onto `target`'s current tip — a reused lane stayed
parked on the older base it branched from, rebuilding every firing on dead code
and manufacturing avoidable merge conflicts at sync-back (observed: every round
launched on a stale lane paid at least one COMBINED merge; rounds launched after
a manual fast-forward collected clean, and an operator-launched round flew stale
because the manual step had no automatic home). `fastForwardWorktree`
(`packages/engine/src/adapters/worktree.ts`, TDD, 3 tests) closes the gap: called
in `fly.ts` immediately after the catch-up drain, it fast-forwards the lane's
checked-out branch onto `target`'s branch tip. Fail-safe by the same construction
as every worktree adapter in this epic — refuses a dirty worktree outright
(crashed-flight leftovers belong to the checkpoint ritual, not silent
clobbering) and runs `--ff-only`, so a diverged lane reports `ok: false`
untouched rather than merging or resetting. Best-effort, same stance as the
catch-up sync it follows: a refusal is logged and the flight proceeds from
wherever the lane stands. Takes effect from the NEXT launch — a flight already
running holds whatever code it loaded. The worktree-confinement mechanism
itself is unchanged; this is lane-freshness hygiene at the same launch-time seam
slice 3 already wires.

`docs/FLIGHT-CONTAINMENT.md` and `docs/EVALUATION-2026-08.md` §3.5 name the one honest
hole left in the containment ladder (SOTA-MAP A4): Bash is not jailed. The PreToolUse
path guard is a textual filter, not a hard boundary, and the OS-level Bash sandbox is
unavailable on native Windows (macOS/Linux/WSL2 only). The documented fix ladder is
worktree → container. This epic lands the worktree rung: a flight's Bash runs inside a
linked git worktree, physically separate from the operator's live checkout, so a
`cd ..`-class escape (the exact shape recorded in `docs/FLIGHT-CONTAINMENT.md`) lands in
disposable scratch space instead of the real tree.

## Acceptance criteria

- `pnpm dashboard:fly` spawns the Claude CLI, the gate, and all firing-scoped git
  operations inside a linked worktree of the target — never the target's own checkout.
- The worktree's branch is distinct from whatever branch is checked out in the target's
  live checkout (git's own rule: one checkout per branch) and is synced back onto the
  target's real branch after a firing ships, additively (no `reset --hard`, same
  discipline as `GitVcs.land`) — the operator's checkout sees the shipped work without
  ever being the directory Bash actually executed in.
- The containment guard (`buildFlightSettings`, `guardedPathsFor`) is re-scoped: the
  worktree becomes the allowed path, and the target's own checkout becomes a GUARDED
  path — an escape that reaches the live checkout is now the exact breach
  `containment.ts`'s audit already detects.
- An escape test proves it: a simulated Bash command shaped like the historical escape
  (`cd` out of the flight dir, `git add`/`git commit` elsewhere) cannot move the target
  checkout's HEAD or working tree — asserted byte-identical before and after.
- Zero behavior change to a flight's OBSERVABLE result: the same commits land on the same
  branch the operator sees today — only the physical directory Bash executes in moves.

## Constraints

- Windows-first: git worktree paths are backslash-native on this platform, but
  `git worktree list --porcelain` always echoes forward slashes — any registration
  check must normalize before comparing (`ensureWorktree`'s `toGitPath`, slice 1).
- One branch, one checkout — a worktree can never check out a branch that's active
  elsewhere; the sync-back step (slice 2) must reconcile without ever forcing a
  checkout git itself would refuse.
- Worktree lifecycle must be idempotent — a crashed flight leaves a worktree behind;
  the next flight reuses it rather than erroring or double-creating (proven in slice 1).
- Additive git only, per SOUL: sync-back uses the same no-`reset --hard` discipline as
  `GitVcs.land`.

## Out of scope

- The container/VM rungs of the ladder (SOTA-MAP A4's steps past worktree).
- Changing the PreToolUse guard's matching logic itself (slice 4 re-scopes its
  arguments, not its implementation).
- Onboarding, backup, or indexing — those read/write the target's real checkout and run
  BEFORE a flight's Bash (and thus the worktree) exists; they stay pointed at `target`.

## Slices

1. **Done.** Worktree lifecycle adapter (`packages/engine/src/adapters/worktree.ts`):
   `ensureWorktree` (idempotent create-or-reuse on a named branch) and `removeWorktree`
   (force-remove + prune). Proven against a real temp git repo, including the isolation
   property the whole epic exists for — a write inside the worktree never appears in the
   source checkout (`worktree.test.ts`). Deliberately NOT wired into `fly.ts` — nothing
   in the live flight loop calls this module yet; this repo self-hosts its own flights,
   so wiring the mechanism that contains Bash into the exact loop currently running
   Bash is staged deliberately, one gate-verified slice at a time.
2. **Done.** Branch-sync (`packages/engine/src/adapters/worktree.ts`'s `syncWorktreeBranch`):
   fast-forwards the target checkout's branch onto the worktree branch's tip — the common
   case, since `ensureWorktree` always branches off the target's HEAD — and falls back to a
   `--no-ff --signoff` merge (same convention as `GitVcs.land`) when the target branch moved
   on while the flight ran. Refuses outright, touching nothing, when the target checkout has
   uncommitted operator changes or has a different branch checked out than expected — a
   flight's work stays parked in the worktree branch rather than guessing how to reconcile
   someone else's in-progress edits. Proven against a real temp git repo for all four paths
   (`worktree.test.ts`). Deliberately NOT wired into `fly.ts` yet, same staging discipline as
   slice 1 — that's slice 3.
3. **Done.** Wire `fly.ts`: `StreamingClaudeCliModel`, `GateRunner`, and the
   firing-scoped `GitVcs` all point at `flightRoot` — `ensureWorktree`'s linked
   worktree (`apps/dashboard/src/flight/worktree.ts`'s `deriveWorktreePlan`
   places it as a SIBLING of `target`, never nested inside it) — instead of
   `target` directly; onboarding/backup/index stay pointed at `target`, as
   planned. Falls back to flying `target` directly if worktree setup ever
   fails, so the mechanism can't itself be a single point of flight failure.
   `syncWorktreeBranch` fast-forwards/merges each firing's commits from the
   worktree branch onto `target`'s live branch right after that firing
   completes (`onFiringComplete`), so the operator's checkout stays current
   without ever being the directory Bash executed in.

   Turned out slice 3 and slice 4's `guardedPathsFor`/`buildFlightSettings`
   re-scoping couldn't actually be separated: once Bash runs in `flightRoot`
   instead of `target`, `buildFlightSettings` MUST scope its allow-list to
   `flightRoot` immediately — leaving it scoped to `target` would deny every
   Read/Write/Edit/Bash the very first flight after this landed, since none of
   the agent's paths are under `target` anymore. Landed both together rather
   than ship a slice known to brick the next self-hosted flight. `target`
   itself is now a guarded path too (`guardedPathsFor(flightRoot, [process.cwd(),
   target])`) — closing the exact "one honest hole" SOTA-MAP A4 named: a
   self-hosted flight (`target === process.cwd()`) previously had ZERO guarded
   paths, so its own containment audit could detect nothing. Each firing's
   sync-back legitimately advances `target`'s HEAD, so the guard's baseline
   snapshot is re-taken right after a successful sync (`guarded` is `let`, not
   `const`) — only a HEAD movement the flight's own sync-back didn't produce
   now reads as a breach.
4. **Done.** Dedicated escape test
   (`apps/dashboard/test/flight/worktree-containment-escape.test.ts`) wires
   the SAME real pieces `fly.ts` wires — `deriveWorktreePlan`,
   `ensureWorktree`/`syncWorktreeBranch`, and the containment audit
   (`guardedPathsFor`/`snapshotGuardedHeads`/`detectContainmentBreaches`)
   against a REAL `GitHeadReader` — over real temp git repos, not the
   `fakeReader` `containment.test.ts` uses for the pure logic alone. Proves:
   a `cd`-relative escape from inside the worktree (a SIBLING of `target`,
   never nested) lands in scratch space and leaves `target`'s HEAD and
   working tree byte-identical before/after; an escape that DOES reach
   `target` directly (an absolute-path commit, simulating the PreToolUse
   guard being bypassed) is caught by the audit backstop; and a legitimate
   sync-back moves `target`'s HEAD without tripping a false breach once the
   guard baseline is re-snapshotted, exactly as `fly.ts`'s
   `onFiringComplete` does.

## Related

- `docs/FLIGHT-CONTAINMENT.md` (the finding + defense-in-depth ladder),
  `docs/EVALUATION-2026-08.md` §3.5 (the honest hole this epic closes),
  `docs/SOTA-MAP-llm-software-engineering-2026-08.md` §A4 (the isolation-substrate rule
  this epic implements), board item `web-msr0ug0e-cgstf0`.
