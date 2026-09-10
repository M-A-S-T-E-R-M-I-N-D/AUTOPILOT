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

## Verification note for this firing's own METRICS

This firing's own unit of work is this debrief file, added with a scoped
`git add <this-path>` — the only file this firing staged or touched. It is a
pure documentation addition: `docs/` is excluded from `prettier --check .`
(`.prettierignore`) and from ESLint's configured `files` globs
(`eslint.config.js` targets only `*.ts`/`*.mjs`/`*.js`), and it adds no source
or test code, so `typecheck`/`test`/`build` are structurally unaffected by it.

## Note on two pre-existing, unrelated gate reds found while verifying

Running the full gate on this worktree before committing surfaced two failures,
neither touched by this change nor caused by it — both are stale-worktree
artifacts: this branch's merge-base with `main` is 45 commits behind `main`'s
tip (`git log --oneline HEAD..main | wc -l` → 45), and both reds are already
fixed on `main`:

- `pnpm run format:check` flags `packages/tokens/src/strings.ts`. `git log main
  -- packages/tokens/src/strings.ts` shows `a3f108d8 style(landing): the
  autoformat write the landing owns` already reformats this file on `main`;
  this branch predates that commit.
- `pnpm run test:impacted` fails one test,
  `client-bundle-size-budget.test.ts`'s `/panels.js stays within its raw and
  gzip budget` (121909 > 121856 = 119 × 1024). `git diff HEAD main -- apps/
  dashboard/test/server/client-bundle-size-budget.test.ts` shows `main` already
  raised `CHUNK_RAW_BUDGET` from `119 * 1024` to `120 * 1024`
  ("Raised with the script (2026-09-09) for this round's landed UI");
  121909 ≤ 122880 passes under `main`'s budget.

Per this repo's own guidance ("Before fixing an observed red, check history —
a newer commit may already fix it"), neither is this firing's to fix: both are
already resolved on `main`, and reproducing that fix here would just be
redundant edits arriving on `main` a second time through a smaller, staler
branch. Flagging the 45-commit lag itself as a sync-back candidate for
whichever process handles fast-forwarding fleet worktrees.
