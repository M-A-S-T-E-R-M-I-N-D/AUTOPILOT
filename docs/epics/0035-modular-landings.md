<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0035. MODULAR LANDINGS — more than one runway, and a main that is always green

Status: **Specified, not started.** Operator directive, 2026-09-17.

> "גם יש הרבה חומר שלא נחת, וגם שווה לחשוב על נחיתות מודולריות — לא כל הטייסים
> נוחתים במסלול אחד, יכול להיות כמה מסלולים, יכול להיות אחד. חשוב על זה לעומק,
> חקור את הנושא גם. צריך שהכל ירד חלק תמיד ומדהים, ללא טעויות, הכל ארוז
> ב-100% שנקבל, וכל משתמש שעושה מרג' תמיד יכול לקבל ירוקים בכיף."

Today there is exactly one runway: `autopilot/flight` → `main`, one flight at a
time, one gate, one merge. That rule was earned — it is what stopped the
flight-vs-flight race that once reverted landed commits — but it is a *lock*,
not a *scheduler*, and a lock has one failure mode: work that misses its slot
does not land at all.

## 1. The measured backlog

Measured 2026-09-17:

| Branch | Commits not in `autopilot/flight` | What it is |
|---|---:|---|
| `autopilot/flight` (vs `origin/main`) | **13** | landed-ready, 30 files, +692/−82 |
| `autopilot/flight-worktree-fly-autopilot` | **4** | **stranded** — two debriefs, an icon swap, strings, plus a WIP checkpoint from a firing that died mid-unit |
| `pr34` (`feat/toolgrant-table`) | 7 | a contributor PR branch, six of them merges from main |
| `scratch/repro-mirror-pass-priority` | 1 | a repro branch, disposable |

The stranded lane is the point. Three of those four commits are finished work —
`docs(debrief)`, `feat(dashboard)` — that simply never synced back. This is the
failure `docs/EVALUATION-2026-08-30-stranded-syncback.md` already names, and it
is still producing casualties. **Work that lands nowhere is work that was never
done**, and no amount of per-firing quality compensates for it.

## 2. What the industry settled on, and why it is the right shape here

The relevant prior art is the **merge queue**, and the rule behind it is old
enough to have a name — the *Not Rocket Science Rule*: never merge anything that
was not proven green **against the state it will actually land into**.

The distinction that matters, and that this repo's current ritual misses:

- Testing a branch against the base it was **cut from** proves the branch was
  green in the past.
- Testing it against the base it will **land onto** proves main will be green in
  the future.

Only the second is a guarantee. A queue builds, for each candidate, the
prospective post-merge tree — main, plus everything ahead of it in the queue,
plus its own changes — and gates on *that*. With speculative batching, candidate
A is tested against main, B against main+A, C against main+A+B, in parallel; if
A fails, B and C are re-tested without it rather than being dragged down.

That is precisely the operator's *"כל משתמש שעושה מרג' תמיד יכול לקבל ירוקים
בכיף"*, and precisely their *"כמה מסלולים"*: the runways are the queue's
parallel speculative branches, and the number of them is a dial, not an
architecture change. **One runway is the degenerate case of N**, which is why
this design subsumes today's behaviour instead of replacing it.

GitHub ships this natively in branch protection (`merge_group` event,
`gh-readonly-queue/<base>/<head>_<sha>` refs, configurable batch sizes).
Bors-NG, the original, is in maintenance mode as of 2026. **Adopt the native
queue; do not hand-roll a second one.** This project's own vetting doctrine says
to prefer the proven mechanism, and a home-grown merge queue is a distributed
systems problem that has already been solved twice.

## 3. The runway model

Three runways, distinguished by what they carry and what they cost:

| Runway | Carries | Gate | Merge |
|---|---|---|---|
| **EXPRESS** | docs-only, debriefs, comments — no code path touched | format + link check | fast-forward, batched |
| **STANDARD** | ordinary slices | the full gate against the prospective tree | `--no-ff`, queued |
| **CONTENDED** | the measured high-contention files: `web/shell.ts` (60 both-sides merges), `package.json` (33), `web/layout-css.ts` (28) | full gate, **serial** | `--no-ff`, one at a time |

**Assignment is derived from the diff, never declared by the pilot.** A pilot
that could self-select its runway would self-select the cheap one. The classifier
reads changed paths and is auditable; misclassification is a bug with a test, not
a judgement call.

**Why EXPRESS is safe and worth having:** the stranded lane's real content was
two debriefs and a doc line. Under today's single runway they queued behind code
and missed the flight entirely. Docs that cannot touch a code path cannot break a
gate, and making them wait is how they get lost.

**Why CONTENDED stays serial:** measured — the area partitioner does *not*
protect those three files; different areas all edit `shell.ts`. Parallel runways
do not repeal contention. This epic does not pretend otherwise.

## 4. Slices

### Slice 1 — Recover the stranded work, and make stranding visible

Not a design task; a measured debt. Merge the three finished commits off
`autopilot/flight-worktree-fly-autopilot`, decide the WIP checkpoint explicitly
(resume or discard — it is a firing that died mid-unit), and then **add the
detector**: any lane branch holding commits absent from the flight branch after
a round ends is a reported anomaly, on the dashboard, not a thing discovered by
running `git rev-list` by hand three weeks later.

**Acceptance.** Zero lane branches ahead of the flight branch after a round, or
a named anomaly saying which and why.

### Slice 2 — Land against the prospective tree, and check preconditions first

Change the landing gate's subject from "this branch" to "this branch merged onto
the current target". Mechanically small, and the whole guarantee: today's gate
can pass on a branch that will not be green once merged, which is how a red main
happens despite a green gate.

**And check the cheap preconditions before spending the expensive gate.**
Observed 2026-09-17: a landing ran the full five-step gate — lint, format,
typecheck, 11,383 tests, build, **5 minutes 40 seconds, all green** — and then
refused with `nothing to land: the working tree is dirty`, because one untracked
scratch file sat in the root. The precondition was knowable in milliseconds and
was checked last. Every precondition that does not require the gate (clean tree,
something actually to land, target reachable, lane not diverged) moves ahead of
it, and the refusal names the file.

**Acceptance.** A branch that is green alone but red once merged is refused, with
the merged-state failure shown. A dirty tree is refused in under a second,
naming what made it dirty, without running a single gate command.

### Slice 3 — The runway classifier

Pure function: changed paths → runway. Fully unit-tested, with the contended
file list sourced from the measured merge-count data rather than hardcoded taste.

### Slice 4 — The queue

Adopt GitHub's native merge queue for `main`, with the batch size starting at 1
(today's behaviour exactly, so the change is provably inert) and rising only on
measured evidence that the gate is stable enough to speculate. CI participates
via the `merge_group` event.

**The flaky-test precondition.** A merge queue amplifies flakiness: a flaky
required check does not fail one PR, it evicts a whole batch and re-runs the
rest. Queue batch size above 1 is gated on a measured flake rate, and that
measurement is part of this slice, not an afterthought.

### Slice 5 — Packed to land

The packer of epic 0033 slice 6 gains the runway verdict and the prospective-tree
result, so "recommended to push" means *verified to land green on the tree it
will land on*. This is where the operator's *"הכל ארוז ב-100%"* becomes a checked
claim rather than a hope.

## 5. What does not change

- **One flight at a time per project.** The queue serializes *landings*, not
  flights. The containment rule that stopped the revert race stands.
- **Never force-push** (the `autopilot/visual-baselines` side branch remains the
  sole sanctioned exception), and **never squash-merge** `autopilot/flight` into
  `main`.
- **The gate is not weakened for any runway.** EXPRESS runs a smaller gate
  because it carries a smaller blast radius, not to go faster.

## 6. Acceptance criteria for the epic

1. No finished commit sits on a lane branch after a round without an anomaly
   naming it.
2. The gate proves the **merged** state, not the branch state.
3. Runway assignment is derived, tested, and auditable.
4. Batch size 1 is byte-identical to today's behaviour.
5. Raising batch size is gated on a measured flake rate.
6. A recommendation to push is backed by a verified prospective-tree result.

## 7. Out of scope

- No hand-rolled merge queue.
- No second scheduler — the queue orders landings; the fleet still orders work.
- No runway self-selection by the pilot.
- No weakening of the contended-file serialization.

## 8. Related

- `docs/EVALUATION-2026-08-30-stranded-syncback.md` — the failure slice 1 pays off.
- `docs/EVALUATION-2026-09-03-sync-conflict-taxonomy.md` — the conflict rungs.
- `apps/dashboard/src/flight/lane-freshness.ts` — CATCH-UP/FORWARD, and epic 0033 slice 7.
- `apps/dashboard/src/landing/execute.ts` — the gate slice 2 changes.
- `docs/DOCTRINE-COORDINATION.md` — sharding, leases, idempotency, convergence.

## 9. Sources consulted

- [What is a merge queue?](https://mergify.com/learn/merge-queue) and [Keep your main branch green](https://mergify.com/keep-your-main-branch-green-use-a-merge-queue) — the prospective-tree principle and speculative batching.
- [The origin story of merge queues](https://mergify.com/blog/the-origin-story-of-merge-queues) — Bors and the Not Rocket Science Rule.
- [GitHub merge queue in 2026: how it works and handling flaky required checks](https://tenki.cloud/blog/github-merge-queue-setup) — `merge_group`, `gh-readonly-queue` refs, batch sizing, and the flakiness amplification that gates slice 4.
- [Companies using merge queues](https://merge-queue.academy/introduction/companies-using-merge-queues/) — adoption and scale evidence.
- [Uber: bypassing large diffs in SubmitQueue](https://www.uber.com/en-SA/blog/bypassing-large-diffs-in-submitqueue) — speculation at scale.

## 10. Addenda from the 2026-09-17/18 landings (slice 2 lessons)

Four facts the ritual learned the hard way, each now in code:

- **Parity is only as good as the stored spec.** The landing's PARITY GATE
  opt-in (`includeCiExtras`) had nothing to include for a project onboarded
  before the detector listed `ci:*` scripts: `gate_config` is written once.
  The landing now re-detects a spec that lacks `ciExtras`, runs the fresh
  extras, and persists them (`gateSpecNeedsRefresh`, `mergeDetectedCiExtras`).
- **Refuse the cheap thing first.** A dirty tree is refused before the gate,
  not after eight minutes of it; the post-gate check stays because the gate
  itself can dirty the tree.
- **The guard runs where the server runs.** A landing that changes the guard
  changes nothing about itself. The result now names any landing module whose
  source is newer than the running build, or whose build is newer than the
  process (`landing/freshness.ts`), so "rebuild and restart" is written on the
  verdict instead of remembered.
- **A cancelled run is no verdict.** `cancel-in-progress` marks the superseded
  run `cancelled`; the land guard reads that as unknown (never block on
  unknown) while the CI report still lists it as needing a look.

