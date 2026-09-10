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
| 22 | A refusal naming an action the operator had no way to take ("update the branch first"; a red check with no re-run) | every refusal that names an action ships that action as a button beside it | `update-branch` + `rerun-checks` verbs in `flight/human-merge.ts` |
| 23 | A refusal's reason wiped by the success-path re-render, leaving a dead-looking button | re-poll only when something actually changed; a refusal keeps its message and its button | `wirePrMaintainerAction`'s `changed` gate |
| 24 | Panel callbacks rendering into a torn-down document — a run with 9,865 passing tests failing on an unhandled rejection | self-polling panels bail when the document is gone | `renderPrReviewPanel` guard (sibling of issue-triage's `isConnected`) |
| 25 | A timeout fix applied to `testTimeout` only, while the flakier half — `beforeEach` setup — stayed at the 10s default | one budget covers both: `hookTimeout` raised alongside `testTimeout`, same reasoning | `vitest.config.ts` |

| 26 | A merge commit that CLAIMS both parents and keeps only one's tree (`-s ours`) — undetectable by anything in the repo | merge-integrity check: tree-identical-to-first-parent AND content missing at the tip = the parent's work was discarded | `ci:merge-integrity` + both corpora in `merge-integrity.test.ts` |
| 27 | Concurrent flights sharing one non-worktree checkout race at git-index/working-tree level (`ap-mtm4qzty-1`, reconfirmed 8×: swept commits, identical-content races, a hard reset silently erasing another firing's uncommitted edit) | `fly.ts`'s FLIGHT-VS-FLIGHT guards refuse the land-time bookends (primary-fallback start, sync-back call sites) when a sibling's lock is live; the edit-time window between those bookends has no lock and relies only on the reactive `3f4bd6c6` detect-before-commit rule | `fly.ts` land-time guards + firing-prompt hard rule (`packages/engine/src/prompt.ts`) — **open**: full edit-time isolation is the already-proposed operator call (every flight in its own worktree, per debriefs 2026-09-06/07/10) |

Row 26 came with a second lesson about guards themselves. The obvious
check — "does a parent have lines the merge lacks?" — flagged **14 of
this repo's 90 merges**, every one a false positive: the fleet's
sync-back legitimately produces identical-tree merges when a lane's work
already landed by another route. `git cherry` could not adjudicate it
either (the merge makes the parent reachable, so every commit reads as
"applied" even when its content was dropped). Only the tip-content test
separates the two. **A guard is not finished when it fires; it is
finished when it stops firing on the things that are fine.**

Row 25 is the shape worth naming on its own: **a fix applied to half its
surface reads as a fix until the other half fails.** The comment above
`testTimeout` had already diagnosed the exact cause (real-git suites,
loaded Windows CI) — the setup cost simply lived in hooks the setting
never reached.

Board hygiene has its own auditor: `pnpm audit:board-flood` sweeps every
thread for near-duplicates, consecutive runs past the ceiling, and
rapid-fire posts. It found rows 19 and 20 across 31 threads; it is what
proves the guard is working rather than the guard proving itself.

Rows 8, 10 (reland), 14 (structural), 16, 27 (operator-owned) are the open
counters — each is a boarded task or a standing operator decision;
everything else is live machinery. When one ships, move its row's "where"
to the code path in the same commit.
