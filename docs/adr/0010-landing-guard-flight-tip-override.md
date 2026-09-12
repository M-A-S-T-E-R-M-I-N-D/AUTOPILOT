<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0010. Landing guard: let a flight tip's own fresh green CI run override a stale/red base verdict — a design proposal

Status: Proposed (🟣 operator decision — this record proposes a matching rule,
it does not implement one; the last change to this same guard, ADR 0008's
2026-09-02 amendment, went through an explicit operator pick before code)

## Context

`apps/dashboard/src/landing/execute.ts`'s `E2eLandGuard` (added by ADR 0008's
"option A" amendment) refuses a landing before the gate or any git command
runs when the converged branch's (`base`, almost always `main`) latest
`ci.yml` run is red and fresh. `createRealE2eLandGuard`
(`execute.ts:142-169`) calls `ciWorkflowStatus('ci.yml', run, nowMs, base)`
(`control/ci-status.ts:104-167`), which filters `gh run list` to runs whose
**head branch** is `base` (`ci-status.ts:121`) — i.e. push-triggered runs on
`main` only. A red verdict older than `E2E_VERDICT_FRESHNESS_MS` (48h,
`execute.ts:173`) degrades to "unknown → allow"; a fresh one refuses
unconditionally (`execute.ts:246-271`).

The guard has exactly one input besides `rootPath`: `base`. It never looks at
the branch actually being landed. `Landable.land()`
(`packages/engine/src/landing.ts:19-21`) merges whatever is HEAD of
`rootPath` with no source-branch parameter either — the flight tip's own
identity is invisible to the whole landing path. `vcs.currentBranch()`
already exists and is used at exactly this kind of call site elsewhere
(`control/land-watchdog.ts`, `github/execute.ts`, `github/pr-execute.ts`,
`read/project-detail.ts`), so obtaining it here is not a new capability, just
unused at this one site.

This produces a real, board-flagged cost: when `main`'s last push-triggered
`ci.yml` run is fresh-red for a reason the flight tip already fixed — and
this fleet's own "round" landing ritual sometimes opens a PR first (`land:
round-3 lanes... main is red for... (#53)`, so the flight branch can carry
its own `pull_request`-triggered green run proving the exact fix works — the
guard blocks the landing anyway, with no way to notice the fix already
exists on the tip. `docs/debriefs/2026-09-06-red-main-revert-cascade.md`
names the general shape of this mistake as its law #1: **"a red CI verdict
is evidence about the exact SHA it validated, nothing newer. Any automated
response must first check whether the tip already contains a candidate fix
... and default to WAITING over reverting."** That debrief was about a
flight's revert cascade, not this guard, but the same law applies here in
its passive form: the guard is *correctly* defaulting to WAITING (refusing,
not reverting), but it is not yet checking "does the tip already contain a
candidate fix" before it does — the exact question law #1 requires asking
first.

## The matching-rule question

Any override needs an answer to: when does the flight tip's own CI run count
as proof "this exact content is fine," despite `base` being red? Three
options, in descending order of rigor:

### Option A — exact head-SHA match (recommended)

`gh run list --json headSha,...` (verified against the locally installed
`gh` 2.86.0 — `headSha` is a real supported field, not a proposed one) lets
`ciWorkflowStatus` report which commit a run actually validated. The guard
would: resolve the flight branch's name (`vcs.currentBranch()`) and its
current tip SHA, look up that branch's own latest `ci.yml` run (branch-filtered,
same as today's `base` lookup), and override `base`'s fresh-red verdict to
`ok: true` only when the head run's `headSha` **equals** the current tip SHA,
the head run is itself fresh, and its conclusion is green.

This is the rigorous reading of debrief law #1's "is that tree still the
tip" — it does not trust a branch name alone, because a branch can move
after a green run lands on it (a later commit could reintroduce the break
the earlier green run never saw). SHA equality is the same kind of check
`GitVcs` call sites already do implicitly by operating on `HEAD`, just made
explicit here because two different branches (and their two different `gh
run list` results) are being compared.

### Option B — branch-name match only (rejected as a default)

Trust the flight branch's latest run by name, without comparing `headSha`
to the current tip. Simpler (no new field threading), but reintroduces
exactly the ambiguity law #1 warns about, just inverted: a stale GREEN
verdict on an old commit of the branch would wrongly clear a landing whose
actual tip never ran CI at all. Given the debrief's evidence that this
guard's failure mode (a stale verdict treated as current) already did real
damage once in the adjacent revert-cascade incident, defaulting to the
weaker check is not recommended.

### Option C — no override; make the existing block louder instead

Leave `createRealE2eLandGuard` untouched and instead invest in making a
stuck `e2e-land-block` (already an aggregated fleet-card anomaly chip per
ADR 0008's amendment) more actionable — e.g. surfacing the blocked branch's
own CI status side-by-side in that chip's detail line, so a human can see
"the fix already passed its own CI" without the system acting on it
automatically. Lowest risk and zero new matching-rule surface, but leaves
the actual board-reported friction (a genuinely-fixed landing sitting
blocked) unresolved without a human noticing and intervening.

## Recommendation (non-binding — operator decides)

Option A. It is the only one that both closes the reported gap and honors
debrief law #1's "still the tip" requirement literally rather than by
branch-name proxy. The implementation is scoped, not exploratory — it
reuses the exact `gh run list` / `ciWorkflowStatus` machinery ADR 0008's
amendment already established, adding one more field to an existing read
rather than a new data source:

1. `control/ci-status.ts`: extend `RawGhRun`/`WorkflowRunStatus` with
   `headSha: string | null`, threaded through `ciWorkflowStatus` the same
   way `createdAtMs` already is.
2. `landing/execute.ts`: widen `E2eLandGuard` to accept the flight branch
   name and its current tip SHA (or accept a `vcs`-shaped resolver so the
   guard can ask for both itself — either keeps `createLandingExecuteApi`'s
   existing `vcs.defaultBranch()` call the single source of branch truth).
   `createRealE2eLandGuard` only needs to look up the head branch's own run
   when `base`'s verdict is fresh-red — the common all-green path is
   unchanged.
3. New tests mirroring the existing "staleness" describe block
   (`test/landing/execute.test.ts:981-1022`): fresh-red base + matching-SHA
   fresh-green head → override to `ok: true`; fresh-red base + mismatched
   SHA → still refuses; fresh-red base + no head run at all → still
   refuses (absence of proof is not proof, same never-invent-a-green
   posture the existing staleness path already takes for the opposite
   case).
4. `e2e-land-block` event payload and the `E2eLandGuardResult.detail` string
   should note when a red base verdict was overridden (not just when one
   caused a refusal) so the audit trail — and the fleet-card anomaly chip —
   stays honest about which path a landing took.

Each of the four is independently small; the whole thing is not a single
firing's unit alongside this design record, which is why this ADR is
proposed on its own rather than bundled with code.

## Consequences

Positive: closes the exact false-negative-wait cost debrief law #1 predicts
for the landing path, at zero added runtime cost (still a `gh run list`
read GitHub Actions already computed, never a new CI trigger) — the same
cost profile ADR 0008's amendment already accepted for the base-only check.

Tradeoff: real complexity added to a guard that exists specifically because
an earlier, simpler version of this exact area caused a documented incident
(the revert cascade). A SHA-matching bug here fails in the direction of
wrongly ALLOWING a landing base's own CI says is red — the opposite failure
mode from today's guard, and arguably a worse one to get wrong quietly,
which is why this ADR proposes the design for operator sign-off rather than
shipping the override as a self-initiated fix.

## Related

- `docs/adr/0008-e2e-does-not-gate-direct-push-landings.md` — the guard this
  ADR proposes extending, including its own 2026-09-02 "option A" amendment
  precedent for operator sign-off before implementation.
- `docs/debriefs/2026-09-06-red-main-revert-cascade.md` — law #1, the
  verdict-provenance rule this proposal operationalizes for the landing path.
- `apps/dashboard/src/landing/execute.ts`, `apps/dashboard/src/control/ci-status.ts`,
  `apps/dashboard/test/landing/execute.test.ts`.
