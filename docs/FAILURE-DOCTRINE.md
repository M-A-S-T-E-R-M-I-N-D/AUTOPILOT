<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# The won-battles ledger — every failure class we beat, and the law that keeps it dead

Operator mandate (2026-09-08): an identified failure may never recur.
This ledger is the machine-readable answer: one row per failure class,
its PERMANENT counter, and where that counter lives. Pilots: the firing
prompt's hard-rules block is the enforced summary; this is the study
text behind it. A failure that feels familiar probably has a row here —
read it before improvising. A NEW failure class earns a row in the same
commit that fixes it.

| # | Failure class (caught live) | Permanent counter | Where it lives |
| - | --- | --- | --- |
| 1 | Gate reported green while running zero tests | three-valued verdicts (confirmed/refuted/unverifiable) + implausibly-fast green demotes to unverifiable | engine gate + `convergence-gate.ts` |
| 2 | Red-main revert cascades on STALE verdicts (twice, once bidirectional) | no-auto-revert hard rule: verify verdict provenance, propose-don't-revert, default WAIT | firing prompt hard rules + `fly.ts` guard + debriefs 2026-09-06/07 |
| 3 | Broad commits sweeping a sibling's uncommitted/staged work | orphaned-diff-may-be-a-sibling rule, explicit-path adds, land-lock guards | firing prompt + `fly.ts` sync-back lock guard |
| 4 | Lane-vs-lane autoformat revert/reapply wars | autoformat WRITE is the landing's alone; lanes check only | firing prompt (v13) + boarded landing-step |
| 5 | A census trusting the instrument it audits (features barrel; i18n scanner) | censuses diff against the DIRECTORY/disk, never the discoverer alone | `chunks.test.ts` + boarded i18n-scanner fix |
| 6 | Scanner false-positives triggering damage (drive-`y:` from CSS regex) | guard-precision doctrine: negative corpus per scanner, matched text in evidence, scanner-wrong is a first-class hypothesis | `validate-no-personal-paths` + negative-corpus suites |
| 7 | CI-only failures discovered after push, layer by layer | PARITY landing gate runs CI's own ci:* checks before any push | `landing/execute.ts` (proved itself day one) |
| 8 | Landing push-leg failing silently (GitHub a day stale) | push result surfaced as its own landing row; non-FF offers integrate-and-retry | boarded (HIGH) |
| 9 | Zombie server serving a stale build ("feature missing") | update-check self-reports the RUNNING build; restart after rebuild ritual | `/api/update-check` + boarded restart-detect |
| 10 | Stale lane worktree dirs silently killing lanes | ensureWorktree self-heals orphaned dirs | shipped, storm-reverted, reland boarded+focused |
| 11 | Duplicate fixes of the same red by two actors | check `git log` on the failing file before fixing; intent-claims | firing prompt (v13) |
| 12 | Piped exit codes masking failed git/gate commands | never pipe git/gate through head/tail in a `&&` chain | firing prompt (v13) |
| 13 | Fleet identity mis-signing a contributor's work (DCO) | human always signs as themself; engine hardcodes no identity; credit only in the Assisted-by trailer | `docs/ATTRIBUTION.md` §Signing & DCO |
| 14 | Core-bundle wall re-hit by every i18n slice | budgets as tripwires + dead-key pruning; structural: defer the locale table (invited) | `check-bundle-size` + VERDICT web-mtbodv7m |
| 15 | Operator-created tasks invisible below the board fold | report-born tasks are FOCUSED at birth | `applyReportTask` |
| 16 | Machine starvation under multi-lane gates (88-100% CPU) | below-normal lane priority + cross-lane gate semaphore + sustained-load planner | boarded (mercy 1-3) |
| 17 | KEEPER Apply on stale cards | execute re-verifies live PR state and no-ops on merged/closed | `pr-review-execute.ts` `confirmPrNotOpen` |
| 18 | New file added without its census pin (taxonomy stubs ×2) | "a census completes the change" — same-commit pin updates | firing prompt (v13) + additive-only law |
| 19 | The same message posted twice by a retry after an apparent failure that had actually landed (PR #33's approval, 16s apart, 97% identical) | every `gh issue\|pr comment` runs through a guard that reads the thread first: a >=90%-similar message from this identity is a clean no-op | `flight/anti-flood.ts` + `flight/gh-exec.ts` (defaulted, census-pinned) |
| 20 | A third consecutive message from one identity stacking on a thread (issue #16) | at the ceiling the guard EDITS the tail into a dated `**Update:**` block instead of posting | `flight/anti-flood.ts` fold tier + `docs/ATTRIBUTION.md` §3 |
| 21 | An affordance offering an action that would do nothing ("Run KEEPER triage": 0 to accept, 6 already triaged) | disabled-with-reason: a control that cannot act says why, and what re-enables it | `issueTriageHasWork` + `issueTriageNothingToRunTip` |

Board hygiene has its own auditor: `pnpm audit:board-flood` sweeps every
thread for near-duplicates, consecutive runs past the ceiling, and
rapid-fire posts. It found rows 19 and 20 across 31 threads; it is what
proves the guard is working rather than the guard proving itself.

Rows 8, 10 (reland), 14 (structural), 16 are the open counters — each is
a boarded task; everything else is live machinery. When one ships, move
its row's "where" to the code path in the same commit.
