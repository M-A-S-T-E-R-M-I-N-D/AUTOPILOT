<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0033. OWNED WORK — from a public claim to a green, shipped contribution

Status: **Active** (operator directive 2026-09-17). Slice 1 INGEST shipped
end to end — reconcile core, reverse edge, takeoff cadence, on-demand CLI
(`pnpm dashboard:owned-work-reconcile`, `docs/RUNBOOK.md` §1) — see the
SHIPPED note under §3. Slice 2 SEE IT is partially shipped (the one pickup
comment, the fleet read's `ownedWorkCount`, the CLI's owned-now line); its
OWNED WORK board section and masthead count are still open. Slices 3–8 not
started.

The operator claimed a public issue and asked the three questions that follow
from it: *where do I see that the task is mine? how do I know the pilot can
find everything it owns and actually work it? and how does it know when the
work is ripe enough to package and push?* Plus two standing asks: the fleet
should prioritise public work by default, and flight N+1 must build on flight
N's tree, not re-derive from the original.

This epic is the answer, specified end to end. It is one chain with eight
links — **claim → ingest → see → focus → derive → ripen → pack → stand** —
and it is written so that each link can ship and be judged on its own.

## 0. The operator's words

> "משתמש לקח עכשיו משימה, למשל עשיתי /claim על משימה… איפה אני רואה שהמשימה
> אצלי, שהיא נלקחה? וגם איך אני מוודא שהטייס יודע לאתר את כל המשימות שברשותו
> ובאמת לעבוד עליהם… הוא צריך לדעת לבצע פוקוס אוטומטי ולתעדף תמיד משימות
> ציבוריות, המשתמש יכול להכנס להגדרות ולהסיר את ההגדרה הזו… ושהוא סיים והוא
> מרגיש שהמשימה סגורה או קרובה לסגורה או ששווה כבר לדחוף אותה כעדכון, יודע גם
> לארוז ולדווח את זה בצורה מסודרת… ובכל סוף טיסה חשוב שיהיה איזה סוכן שידע
> לכוון את איך לארוז הכל לכדי משהו שכבר בשלב הזה אפשר להוריד ירוק… וחשוב גם
> לזכור שאם אנחנו מריצים טיסה 1 ופיתחנו ובדקנו דברים, טיסה 2 היא בעצם רצה על
> הפורמט שכבר עודכן ולא עוד פעם על הגרסה שלי."

And, from the same session:

> "איך אפשר לאפשר למשתמש לראות את ההתקדמות שלו והתפקיד שלו, להציג כמו פרופיל
> אישי של המשתמש שלו בתוך GITHUB ב-AUTOPILOT — כמה תיקונים הוא ביצע, כמה
> קומיטים, מה הדרגה, איפה המקום שלו במשימה."

## 1. The measured gap

Not inferred — measured on 2026-09-17 against the live instance.

| Fact | Evidence |
|---|---|
| The claim landed on GitHub | Issue #6: `assignees: [M-A-S-T-E-R-M-I-N-D]`, label `claimed`, bot reply at 2026-09-16T21:18:31Z |
| AUTOPILOT never heard about it | `GET /api/state` → `fly-autopilot` carries **30 board tasks, none for #6** |
| There is no ingestion path for a GitHub-side claim | The only writer of a claim-contract task is `claimAndQueuePoolIssueTask`, reachable **only** from `POST /api/pool-client/execute` — the dashboard's Contributor-pool panel |

**The defect in one sentence: there are two ways to claim an issue, and only
one of them tells the pilot.** Claiming through the dashboard queues a focused
board task carrying the claim contract. Claiming the way the protocol itself
documents — commenting `/claim`, which is what `.github/workflows/claim.yml`
serves and what every outside contributor will use — writes GitHub state and
nothing else. The contract machinery downstream is real and already correct
(`flight/claim-contract.ts`, the done-hook demotion, the mirror pass settling
on the human's close, the 14-day reaper); it simply never gets fed.

So the honest answer to *"where do I see that the task is mine?"* is: **nowhere
today**, and this is why.

## 2. What "owned" means

Three distinct sources, deliberately not collapsed:

1. **Claimed by the operator** — GitHub assignee is the operator's login on an
   issue in a repo they run. The claim contract applies: *only the human
   closes it.*
2. **Claimed by the operator's pilot on their behalf** — the existing pool-client
   path. Same contract, same marker, already works.
3. **Owned by the project** — an issue in the operator's own repo with no
   assignee. Not "mine"; the fleet may take it under the ordinary triage rules
   (`RESERVED_FOR_HUMANS_DAYS = 14` still governs `good first issue`).

Only (1) and (2) are *owned work*. The distinction matters because owned work
gets focus and never gets auto-closed, and project work gets neither.

## 3. Slice 1 — INGEST: the missing edge

**Goal.** Every issue GitHub says is assigned to the operator becomes a board
task carrying the claim contract, no matter which path created the assignment.

**Design.** A reconciler, not a webhook. Webhooks need a public endpoint this
product deliberately does not have; the fleet already shells `gh` on a cadence
for the mirror pass, and this rides that.

- Read: `gh issue list --assignee @me --state open --json number,title,url,labels,repository`
  across the projects the dashboard knows, plus `--search "assignee:@me"` for
  repos the operator contributes to but does not own.
- For each result, upsert a board task at the **existing content-addressed id**
  (`issueTaskId(issue.number)`) so a pool-claimed task and a GitHub-claimed
  task for the same issue are the same row — never a duplicate.
- Body from the existing `claimContractBody(number, url, { claimant })`.
- Source `github`; focused per slice 3.
- Idempotent by construction: re-running changes nothing. This is the
  convergence primitive the coordination doctrine already names.

**The reverse edge, equally required.** When GitHub says the issue is no longer
assigned to the operator — `/unclaim`, or the 14-day reaper — the task loses
its focus and its contract marker and returns to ordinary queue order. It is
**not** deleted: work already done against it stays visible. The mirror pass
already settles a claimed task when the issue closes; this extends the same
idea to the issue being *released*.

**Acceptance.** With #6 assigned on GitHub and nothing else changed, one pass
makes #6 appear on the board as a focused, contract-marked task; a second pass
changes nothing; `/unclaim` un-focuses it.

**SHIPPED** — `apps/dashboard/src/flight/owned-work-reconcile.ts`:
`fetchAssignedIssues` (the `gh issue list --assignee @me` read, defensive
parse), `planOwnedWorkReconcile` (the pure core — upsert at `issueTaskId`,
refocus, release), `reconcileOwnedWork` (the writes), `runOwnedWorkSweep`
(the takeoff cadence `fly.ts` runs before its first board read, self-target
guarded so a flight over another folder never ingests this repo's
assignments), and the `owned-work-reconcile` case in `control/cli.ts`,
wired as `pnpm dashboard:owned-work-reconcile` and documented in
`docs/RUNBOOK.md`'s command table (UX-EXPRESSION: a docs-discoverable
script, same as epic 0010's rituals). Covered by
`apps/dashboard/test/flight/owned-work-reconcile.test.ts`. Two deliberate
deviations from the text above, each with its reason in the module header:
the reverse edge un-focuses a released task but **keeps** its contract marker
(§12: the fleet must still never auto-close an issue it once saw claimed),
and the read is scoped to the repo the engine runs in — the cross-repo
`--search "assignee:@me"` widening is open, because `issueTaskId(number)`
is content-addressed on the issue number alone and two repos' #6 would
collide on one row; that needs a repo-qualified id first.

## 4. Slice 2 — SEE IT

**Goal.** The operator can answer "what is mine?" in one glance, from the page
they are already on.

- **An OWNED WORK section** at the top of the board: every task whose body
  carries `contract: human-closes` and names the operator as claimant. Each row
  shows the issue number as a link, the repo when it is not this one, the
  claim age, and a readiness chip (slice 5).
- **A masthead count** — "3 owned" — that is a link to that section, so the
  answer is visible without opening the board at all.
- **On the issue itself**: the row deep-links to the GitHub issue, and the
  issue gets exactly one comment when the pilot first picks it up. One. The
  no-spam rule stands: public GitHub writes are a budget, and progress-note
  comments are not a thing this project does.

**Acceptance.** Claim an issue on GitHub; within one reconcile the operator
sees it in OWNED WORK and in the masthead count, without configuring anything.

## 5. Slice 3 — FOCUS: public work first, by default

**Goal.** The pilot spends its firings on owned public work before it spends
them on internal backlog — **by default**, and the operator can turn that off.

**The rule.** Board ordering gains one term ahead of every existing one:

```
owned public work  →  focused tasks  →  ordinary priority order
```

**The setting.** `preferPublicWork`, default **on**, in the existing settings
surface (epic 0029). Off restores today's ordering exactly. The setting is
per-project, because "always prefer public" is right for a repo with outside
contributors and wrong for a private one.

**Why default-on is defensible, and where it stops.** A claimed public issue is
a promise made in public with the operator's name on it; internal backlog is a
promise made to oneself. Default-on encodes that. But it must never starve the
rest: the ordering is a *preference*, not an exclusion — when owned work is
blocked (waiting on review, waiting on the human to close), the fleet falls
through to ordinary order rather than idling. A blocked owned task must not be
able to halt the flight.

**Acceptance.** With an owned task on the board, the next firing picks it. With
`preferPublicWork` off, ordering is byte-identical to today. With the only
owned task blocked, the flight still flies.

## 6. Slice 4 — DERIVE: related work, on purpose

**Goal.** The operator's ask: *"שהוא ידע לבנות משימות הקשורות למשימות הציבוריות
שבבעלותו"* — the pilot should be able to turn one owned issue into the work it
actually implies.

**Design.** A derivation pass, run once per owned task when it is first
focused, that proposes child tasks scoped to the issue's own paths: the fix,
its regression test, the doc line it invalidates, the changelog entry.

**Three hard limits, because this is a task-generator and task-generators run
away.**

1. **Children are proposals until the parent is owned work.** Derivation only
   runs for tasks carrying the claim contract. It never fires on the general
   backlog.
2. **Depth 1.** A derived task may not derive. This is a rule, not a
   preference — it is the whole difference between a plan and a fork bomb.
3. **A cap per parent** (start at 5), and every child names its parent issue in
   its body, so the board can always collapse them back and the operator can
   always see where a task came from.

**Acceptance.** An owned issue produces a bounded, visibly-parented set of
children; a derived task produces none; disabling derivation leaves the parent
behaving exactly as slice 3 leaves it.

## 7. Slice 5 — RIPEN: is it ready to push?

**Goal.** The operator's ask: the pilot should know when the work *"קרובה
לסגורה או ששווה כבר לדחוף אותה"* — near-done, or worth pushing now.

**This must be evidence, never a feeling.** A readiness verdict is computed
from facts the repo already has:

| Signal | Source that already exists |
|---|---|
| Gate green on the lane | the landing gate's own result |
| Every derived child closed or explicitly deferred | the board |
| The issue's scoped paths all touched | `FiringRecord.filesTouched` |
| A regression test exists that fails without the change | the test run |
| No open finding above `medium` on the touched files | the findings store |
| Diff inside the issue's declared scope | `diff-size-gate.ts` |

Rolled into three states, and no more: **NOT READY** (a named blocker),
**RIPE** (everything above holds — this is the "worth pushing now" the operator
asked for), **NEEDS THE HUMAN** (ripe, but the claim contract says only the
claimant closes).

**The contract is not weakened.** RIPE is a *recommendation to the operator*,
rendered as a chip and a one-line reason. The fleet still never closes a
human-claimed issue. That rule is why the claim contract exists and this slice
does not get to soften it.

**Acceptance.** Every state is explainable in one sentence naming the signal
that decided it. A RIPE task never auto-closes anything.

## 8. Slice 6 — THE PACKER: end of flight

**Goal.** The operator's ask: *"בכל סוף טיסה חשוב שיהיה איזה סוכן שידע לכוון את
איך לארוז הכל לכדי משהו שכבר בשלב הזה אפשר להוריד ירוק"* — at the end of every
flight, something that knows how to package what happened into something that
lands green.

**What exists.** The landing ritual already gates (lint/format/typecheck/test/
build) and merges `--no-ff`. The release ritual already versions and tags. What
is missing is the step *between* them: the judgement about what this flight
actually amounts to.

**The packer runs after the last firing and before the landing gate**, and
produces one artifact — a **flight package**:

- **What shipped**, grouped by intent rather than by commit order: the reader
  should see three things done, not nineteen commits.
- **What is ripe** (slice 5) and therefore recommended to push, each with its
  one-line reason.
- **What regressed or stayed red**, stated plainly. A packer that only reports
  good news is worse than no packer, because it converts a true signal into a
  false one.
- **The suggested landing shape**: which commits belong together, which want a
  squash, what the PR body should say, which issues the push closes — and,
  where it applies, that nothing here should be pushed yet and why.

**It recommends; it does not push.** Pushing is an outward-facing act on a
public repo and stays the operator's call. The packer's job is to make that
call take five seconds instead of twenty minutes.

**Acceptance.** Every flight ends with a package. A flight that achieved
nothing produces a package that says so in its first line.

## 9. Slice 7 — CHAINING: flight N+1 starts where flight N finished

**Goal.** The operator's ask: *"אם אנחנו מריצים טיסה 1 ופיתחנו ובדקנו דברים,
טיסה 2 היא בעצם רצה על הפורמט שכבר עודכן ולא עוד פעם על הגרסה שלי… ככה נוודא
שהקומיטים תמיד עוקבים ויעברו וירדו בגרון."*

**What already exists, and is good.** `flight/lane-freshness.ts` splits the
launch sync into CATCH-UP (drains the lane into the target; must yield to a
live sibling) and FORWARD (`fastForwardWorktree`, `--ff-only` inside the lane;
races nothing). That split was itself the fix for stale launches — the flight
logs recorded the skip line firing 51 times against 33 forwards, and the stale
lanes are where a revert/reapply storm came from. The mechanism is sound.

**What this slice adds.** Operator, same session, correcting an earlier draft
of this section: *"זה גם לא בטוח FLIGHT N+1 — חשוב מאוד שכל טייס ידע על איזה
גרסה הוא רץ, ובסוף ידע לארוז שכל הפאץ' ידע לרדת בגרון; בריצה הבאה, מבחינת
הטייס הבא, הפאץ' הזה כבר קיים והוא עובד משם. וגם חייב להיות פתרון ל-MULTI-LANES."*

The ordinal is not the point. **Knowing your base is the point**, and it has to
hold for lanes running side by side, not just for flights in sequence.

1. **Every pilot is told what it is standing on.** The base commit, the version,
   and what landed since the last flight go **into the prompt**, not only into a
   record. A pilot that cannot name its base is flying blind, and a pilot that
   silently re-derives work already landed is the revert/reapply storm again.
   Recording the base is necessary and is *not* sufficient — the agent has to
   read it.
2. **A flight may not launch onto a stale base.** Today FORWARD is attempted;
   this makes a failed forward a **launch refusal** with a named reason, not a
   warning the flight flies past. A diverged lane is a fact to resolve, not a
   condition to fly in.
3. **The patch is packed to apply.** The packer (slice 6) states the base the
   work was built on and verifies the result still fast-forwards onto the
   current target *before* it recommends anything. "It merges cleanly" is a
   checked claim, not a hope — this is what "לרדת בגרון" has to mean
   operationally, and an unverified recommendation is worse than none.
4. **The next pilot starts from the landed patch, never from the pre-patch
   tree.** After landing, every lane that will run next is fast-forwarded to the
   new tip before its prompt is built, so the work is *already present* from the
   next pilot's point of view. It never re-solves a solved problem, and never
   reverts one.

**Multi-lane — the harder half, and the one that actually bites.** Lanes are
concurrent, so "the base" is per lane and they drift apart within a single
round. The existing primitives already carry most of this and must not be
re-invented: CATCH-UP yields to a live sibling lock, FORWARD never races,
sync-back self-heals known conflicts through `rerere` and **aborts** on a fresh
content conflict rather than guessing. What this slice adds on top:

- **Each lane's base is its own recorded, prompted fact** — there is no single
  fleet-wide "current version" while a round is in the air, and pretending
  otherwise is how lanes clobber each other.
- **Landing order is serialized** (it already is: one flight at a time), and
  each lane re-forwards onto the new tip after a sibling lands rather than
  carrying a base that is now historical.
- **A lane that cannot forward does not fly** — it surfaces as a lane needing a
  hand-merge, which is the honest outcome, instead of launching stale and
  producing a patch that will not go down.
- **The area partitioner does not protect high-contention files** — measured:
  `web/shell.ts` 60 both-sides merges, `package.json` 33, `web/layout-css.ts` 28.
  Those stay single-lane-serial. Freshness discipline does not repeal
  contention; the two are separate problems and this slice only solves the first.

**Acceptance.** Every flight record names its base commit, and every prompt
states it. A lane that cannot fast-forward onto the target refuses to launch and
says which ref and why. The packer refuses to recommend a push it has not
verified still fast-forwards. After a landing, no sibling lane's next prompt is
built on the pre-landing tree.

## 10. Slice 8 — THE PROFILE: where the operator stands

**Goal.** *"פרופיל אישי… כמה תיקונים הוא ביצע, כמה קומיטים, מה הדרגה, איפה
המקום שלו במשימה."* This is epic 0032's deferred profile slice, and it belongs
here because the claim is what gives it something true to show.

**Content, every line sourced:**

- **Standing tier** — from `.github/CONTRIBUTOR-STANDING.md`'s existing ladder,
  computed rather than declared, with the next tier and what it takes.
- **Merged contributions** — commits and PRs, from `gh`, for this identity.
- **Owned work, now** — the OWNED WORK list of slice 2, with claim ages.
- **Completed claims** — issues claimed and closed, which is the honest measure
  of the loop this epic builds.

**One rule: nothing on this page may be flattering and unsourced.** A profile
that inflates is worthless to the person reading it about themselves. Every
number links to the thing that produced it.

## 11. Acceptance criteria for the epic

The chain is done when, with no manual step anywhere:

1. `/claim` on GitHub → the task is on the board, focused, contract-marked.
2. The operator sees it without looking for it.
3. The next firing works it, because public work is preferred by default — and
   that preference is one switch away from off.
4. Its implied work exists as bounded, parented children.
5. Its readiness is a verdict backed by named signals, and the human still
   closes it.
6. The flight ends with a package that says what shipped, what is ripe, and
   what is still red.
7. The next flight starts from that flight's tree, or refuses to start.
8. The operator can see their own standing, every line sourced.

## 12. Out of scope

- **No auto-close of a human-claimed issue, ever.** Not under any readiness
  verdict. This is the claim contract and it is not negotiable here.
- **No auto-push and no auto-PR.** The packer recommends; the operator acts.
- **No progress-note comments on public issues.** One pickup comment, maximum.
  The no-spam budget stands.
- **No new claim protocol.** `/claim` and the pool client are the two paths;
  this epic makes them converge, not multiply.
- **No webhook endpoint.** Reconcile on the existing `gh` cadence.
- **No derived task deriving.** Depth 1, permanently.

## 13. Constraints

- Every slice ships with the a11y assertion and the regression test the repo
  already requires; `SLICE_BUDGET = 1`.
- The reconciler is idempotent and convergent — the coordination doctrine's
  primitives, not a second scheduler.
- Task ids stay content-addressed on the issue number: one issue, one row,
  whichever path found it.
- `preferPublicWork` defaults on but must be provably reversible: with it off,
  ordering is byte-identical to today's.
- Public GitHub writes stay inside the existing budget.

## 14. Related

- `apps/dashboard/src/flight/claim-contract.ts` — the contract and its three readers.
- `apps/dashboard/src/flight/pool-client.ts` — `claimAndQueuePoolIssueTask`, the
  path that already does slice 1 correctly for one of the two claim routes.
- `apps/dashboard/src/flight/lane-freshness.ts` — the launch-sync split slice 7 hardens.
- `apps/dashboard/src/flight/issue-triage.ts` — `RESERVED_FOR_HUMANS_DAYS`.
- `.github/workflows/claim.yml`, `.github/workflows/stale-claim-reaper.yml`.
- `.github/CONTRIBUTOR-STANDING.md` — the ladder slice 8 computes.
- Epic 0032 (the onboarding ladder) — slice 8 is its deferred profile slice.
- `docs/DOCTRINE-COORDINATION.md` — idempotency and convergence.
