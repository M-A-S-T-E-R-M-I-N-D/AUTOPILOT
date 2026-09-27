<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing CLOSED-TASK AUDIT `closedaudit-web-mss50iak-g176g8` (second attempt): the PLATFORM 7/7 page-upkeep deliverable still checks out

Board: `CLOSED-TASK AUDIT: "web-mss50iak-g176g8" claimed done but its DELIVERABLE clause no longer
checks out — re-verify: PLATFORM 7/7 - page upkeep + publicity: KEEPER keeps README/docs/Releases
fresh; watc…` (still truncated by the board's own 200-char title window before it reaches a firing
— the literal `DELIVERABLE:` clause sits past the cut, same as
[2026-09-26-closedaudit-web-mss50iak-g176g8-deliverable-confirmed.md](2026-09-26-closedaudit-web-mss50iak-g176g8-deliverable-confirmed.md)
found). That first debrief verified the visible substance, concluded "Refuted — close", and closed
on that evidence. This is a second attempt at the SAME task id, still open a day later: `a4602661`
(`fix(dashboard): the closed-task audit re-checks an old proposal's task outside the done window`)
names `closedaudit-web-mss50iak-g176g8` explicitly, on 2026-09-27, as still on the board after the
first attempt.

## Why the first attempt likely didn't stick

Three mechanism bugs affecting this task class landed after the first debrief: `c6e65a2b` (a failed
`git grep` was read as "keyword absent" instead of "search failed"), `bdcfd726` (a closedaudit
proposal's own title now quotes the drifted clause near the front, inside the 200-char board window,
instead of relying on `re-verify: <original title>` to carry it past the cut), and `a4602661` (the
sweep's automatic re-audit only considered the 50 most-recently-done tasks, so an older `DONE` task
an open audit names could never be re-audited, and its proposal could never self-clear).

None of the three explains this specific non-closure on their own: `prunableClosedTaskAuditIds`
(`apps/dashboard/src/flight/post-flight-sweeps.ts:338`) only auto-defers a closedaudit proposal that
is unclaimed and either `needs_approval` or auto-approved-and-queued — "an operator who re-queues one
has overruled it" (same file, doc comment above that function). This task appears directly in the
BOARD's operator-priority list, which means a person moved it past `needs_approval` deliberately; by
that same contract it is **excluded** from automatic deferral by design and can only be closed by a
firing's own verified completion, same as
[2026-09-27-closedaudit-web-mtd1wyte-ssntzi-roving-still-live.md](2026-09-27-closedaudit-web-mtd1wyte-ssntzi-roving-still-live.md)
concluded for a sibling task the same day. So the three landed fixes matter for *future* findings and
for *not-yet-approved* proposals — they do not retroactively close an already-approved one. Whatever
kept the first attempt from sticking is still unconfirmed; if this second attempt also fails to
clear the board, that is itself evidence of a defect in how a firing's completion actually reaches
this task's row, worth its own bug report rather than a third identical debrief.

## Re-verifying the deliverable, one day later

Every component the visible title names, re-checked today against `HEAD`:

1. **README freshness — live.** `scripts/citation/generate-citation.mjs` still rewrites README's
   version line from `package.json`; `pnpm run ci:citation` (`--check`) is still wired into
   `pnpm run verify` (`package.json`).
2. **Docs freshness — live.** `apps/dashboard/src/flight/doc-freshness.ts` and its test
   (`apps/dashboard/test/flight/doc-freshness.test.ts`) are both present and unchanged in shape.
3. **Releases freshness — live.** `apps/dashboard/src/release/execute.ts` and
   `apps/dashboard/src/release/maturity.ts` are both present.
4. **KEEPER + publicity — live.** `apps/dashboard/src/flight/publicity.ts` and
   `apps/dashboard/src/web/publicity-panel.ts` are both present.
5. **The watchdog itself — live and tested.** `apps/dashboard/src/flight/closed-task-audit.ts` and
   its test (`apps/dashboard/test/flight/closed-task-audit.test.ts`) are both present; running
   `vitest run apps/dashboard/test/flight/post-flight-sweeps.test.ts -t runClosedTaskAuditSweep`
   today passes all 14 non-skipped cases, including the two added by `a4602661`
   (`re-audits the task an open proposal names after it leaves the done window`).

No component this title names has regressed. KEEPER keeps README, docs and Releases fresh; the
publicity page-upkeep watchdog machinery — closed-task-audit, doc-freshness — is present, wired into
`post-flight-sweeps.ts`, and covered by passing tests.

## VERDICT

**Refuted — close `closedaudit-web-mss50iak-g176g8` (second confirmation).** The PLATFORM 7/7
page-upkeep deliverable is present, wired, and tested exactly as the first debrief found. No code
change is warranted. If this proposal is still open in a future firing prompt after this commit, the
next firing to encounter it should stop re-verifying the (unchanged) deliverable and instead treat
the non-closure itself as the bug to investigate.
