<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT-blocking evidence `ap-mtv8ql4c-0`: the AUTOFORMAT mutex is per-checkout, not fleet-wide

Board: `ap-mtv8ql4c-0` (high) — "VERDICT-blocking evidence for `ap-mtuks0jm-0`:
`18aafd26` reverts `1f31e4ba` directly (not `ce8eb871`, the commit actually on
HEAD), implying a second actor outside `RemediatingGate`'s mutex independently
reverted using a stale target commit SHA instead of the actual commit on HEAD
at revert time."

`ap-mtuks0jm-0` itself already closed (debrief
`2026-09-10-verdict-ap-mtuks0jm-0-autoformat-single-writer-mutex-closed.md`,
re-landed at `33c56283` after a collateral revert) with **"Confirmed — close
`web-mtsx325f-uzdisr`"**, on the premise that the `87982ca7` mutex fix makes
`RemediatingGate` a single writer "across the fleet." This firing's unit is to
verify the blocking evidence against that premise.

## Verification

**The cited SHA evidence checks out exactly as described.** `1f31e4ba`
("style(autopilot): autoformat", +4/−2 on `packages/tokens/src/strings.ts`,
2026-09-10 08:19:11) was reverted by `f98c9f88` (08:22:28), reapplied by
`ce8eb871` (08:22:29) — restoring the identical +4/−2 diff — and then reverted
*again* one second later by `18aafd26` (08:22:29), whose message reads "This
reverts commit `1f31e4ba`," not `ce8eb871`. `git revert` always resolves its
argument and writes the *resolved* SHA into "This reverts commit …" — so a
process that ran `git revert HEAD` (or `git revert 1f31e4ba`) and produced
that exact message did so while its own view of HEAD was still `1f31e4ba`,
even though the shared branch had already moved two commits past that by the
time `18aafd26` landed. That is a stale read racing a concurrent write —
precisely what a mutex exists to prevent.

**This is not a one-off.** The same four-commit shape (autoformat → revert →
reapply → revert, all inside a single-digit-second window) recurred a second
time the same day, entirely independently: `9ef80a95` (11:29:59) → `26a5def6`
+ `5e6aaae7` + `4dc4bc24` (all 11:42:15). Both episodes post-date `87982ca7`
(2026-09-09 12:46:42, "make AUTOFORMAT remediation a single writer across the
fleet") by 19–23 hours — the exact failure mode the mutex was built to close,
happening twice more *after* the fix was live everywhere.

**Root cause: the lock path is a `cwd()`-relative default, not a fleet-shared
one.** `RemediatingGate`'s lock is `withRitualLock(resolveLockPath(dbPath,
AUTOFORMAT_LOCK_FILE_NAME), …)` (`apps/dashboard/src/fly.ts:870`), and
`resolveLockPath` just colocates the lock file next to `dbPath`'s directory
(`ritual-lock.ts:48`). `dbPath` itself comes from `resolveDbPath()`
(`apps/dashboard/src/read/config.ts:16`): `AUTOPILOT_DB` wins if set,
otherwise `join(cwd(), '.autopilot', 'autopilot.db')`. Checked this firing's
own environment directly — `AUTOPILOT_DB` is **unset**
(`AUTOPILOT_FLIGHT_INSTANCE_ID=fleet-2`, `AUTOPILOT_DB=` empty) — and
`git worktree list` confirms seven separate worktrees (`AUTOPILOT`,
`fly-autopilot`, `fleet-2` through `fleet-6`), each its own `cwd()`. With no
override, every one of those resolves `.autopilot/autopilot.db` — and
therefore `autoformat.lock` — to a path *inside its own worktree*.
`FileInstanceLock` (`packages/engine/src/adapters/instance-lock.ts:75`) is a
plain atomic-create-file lock keyed on that literal path; it has no cross-path
or cross-machine awareness at all. Two `RemediatingGate` instances running in
*the same worktree* now correctly serialize. Two running in *different*
fleet worktrees — the actual topology this fleet flies under — hold two
different files and never contend for anything.

`docs/DOCTRINE-COORDINATION.md`'s claim that this is "the same lock directory
every sibling instance already shares" is true only for instances that happen
to share one `cwd()`. It does not hold across the fleet's normal worktree
topology, which is exactly where both dated recurrences above originated:
each sibling detects the same red `format:check` on its own locally-synced
copy of the branch and independently runs its own remediation cycle; the
mutex never sees the collision because there is no shared lock to see it with.

## VERDICT

**Refutes `ap-mtuks0jm-0`'s "Confirmed — close."** The mutex fix is real,
correctly implemented, and closes the race for the one topology it actually
covers (multiple flights sharing one checkout) — but the fleet's real
topology is multiple checkouts (worktrees), and the dated evidence
(`18aafd26`, then independently `4dc4bc24`, both after `87982ca7` landed)
shows the cross-checkout race is unfixed. `web-mtsx325f-uzdisr` should be
**reopened**, not treated as closed, and `docs/DOCTRINE-COORDINATION.md`'s
"remains an open question if the mutex alone proves insufficient in
practice" clause has now been answered by direct, dated evidence: it has
proven insufficient in practice.

Corrected the doctrine doc in this same commit (§5, "Fixed (single-writer via
mutex, not phase-move)") to state the per-checkout scope precisely and cite
both dated recurrences, rather than leave the fleet-wide claim standing
uncorrected for the next firing that reads it as settled.

The actual fix — either a lock path fleet siblings can genuinely share (a
location outside any one worktree, reachable by absolute path or env var from
every sibling) or moving remediation to land/sync-back time as the doctrine's
own "larger redesign" alternative already named — is real engineering work
beyond one verification firing's scope. Proposed as follow-up below; not
attempted here.
