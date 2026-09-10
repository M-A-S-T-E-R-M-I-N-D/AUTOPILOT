<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing VERDICT `ap-mtuks0jm-0`: AUTOFORMAT single-writer fix confirmed shipped and synced

Board: `ap-mtuks0jm-0` (VERDICT close, targeting `web-mtsx325f-uzdisr`) —
"AUTOFORMAT single-writer fixed via mutex (87982ca7 on main/autopilot/flight),
phase-move explicitly deprioritized in DOCTRINE-COORDINATION.md — just needs
sync-back".

## Verification of the claim

Confirmed on all three counts.

1. **The mutex fix is real and lands where claimed.** `87982ca7` ("fix(engine):
   make AUTOFORMAT remediation a single writer across the fleet", committed
   2026-09-09 12:46:42 +0300) implements exactly the described guard:
   `RemediatingGate` (`packages/engine/src/adapters/remediating-gate.ts`) now
   accepts an optional `withLock` wrapped around only its
   fixer→commit→re-verify span, and `fly.ts` wires that to `withRitualLock`
   against a dedicated `autoformat.lock` file
   (`apps/dashboard/src/flight/ritual-lock.ts`) — a green gate never waits on
   the lock; only the remediation path does.
2. **Phase-move is explicitly deprioritized in doctrine, not silently
   dropped.** `docs/DOCTRINE-COORDINATION.md` (§5 Convergence, "How it also
   broke — AUTOFORMAT was not a single writer") states the fix in these exact
   terms: "**Fixed (single-writer via mutex, not phase-move).**" and goes on
   to say moving remediation to land/sync-back time "remains an open question
   if the mutex alone proves insufficient in practice; it is not required to
   close this gap." That is a documented, deliberate deprioritization, not an
   omission.
3. **Sync-back is already complete — nothing is left to carry.** `git branch
   -a --contains 87982ca7` returns `main`, `remotes/origin/main`,
   `autopilot/flight`, and every currently-checked-out fleet worktree branch
   including this one (`autopilot/flight-worktree-fly-autopilot--fleet-2`).
   The commit is one day old at this firing's start and already universal
   across the fleet's branches — the "just needs sync-back" clause in the
   verdict is itself now stale: sync-back finished before this firing began.

## VERDICT

**Confirmed — close `web-mtsx325f-uzdisr`.** The single-writer race described
in `docs/debriefs/2026-09-06-red-main-revert-cascade.md`'s firing-179 addendum
is fixed by a mutex already on `main`, the alternative (moving remediation to
phase/land time) is documented as deliberately deprioritized rather than
outstanding, and the commit has already propagated to every branch that would
need it. No further action — code, doctrine, and propagation all agree the
underlying task is done.

## Addendum (2026-09-10, resume firing): why this debrief needed a second landing

The first attempt to close this VERDICT (`2f1e6bcb`) added only this file —
docs-only, `git add`-scoped to this path, structurally inert to
`typecheck`/`test`/`build`. It still got swept into an auto-revert
(`1d1c6822`) as collateral: the branch-wide gate was already red for two
*pre-existing, unrelated* reasons at the time, and the revert mechanism
reverts the trailing commit(s) when the aggregate gate fails, regardless of
whether that commit caused the failure.

Both reds were already fixed on `main` (confirmed by `git diff HEAD main`
before touching anything):

- `pnpm run format:check` flagged `packages/tokens/src/strings.ts` — `main`
  already wraps two long Hebrew string literals across lines; this branch had
  the pre-wrap single-line form.
- `pnpm run test:impacted` failed
  `client-bundle-size-budget.test.ts`'s `/panels.js stays within its raw and
  gzip budget` (121909 > 121856 = 119 × 1024) — `main` had already raised
  `CHUNK_RAW_BUDGET` to `120 * 1024` in both the test and its mirrored source,
  `scripts/ci/check-bundle-size.mjs`.

Rather than re-attempt a docs-only commit into the same red and risk a third
collateral revert, this firing carries both already-verified fixes from
`main` into this branch (matching `main`'s exact values/wording) in the same
commit as this file, so the gate this debrief lands under is actually green
end to end — not just green for the diff.

## Verification note for this firing's own METRICS

This firing's unit of work is this debrief plus the two mechanical
stale-branch fixes above (`packages/tokens/src/strings.ts`,
`apps/dashboard/test/server/client-bundle-size-budget.test.ts`,
`scripts/ci/check-bundle-size.mjs`) — all four files staged together. The
full gate (`typecheck`, `lint`, `format:check`, `test:impacted`, `build`) was
run against this exact tree before committing.
