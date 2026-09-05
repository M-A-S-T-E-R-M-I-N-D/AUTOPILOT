<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0014. Fleet wisdom generalization — a marker registry, not a similarity engine

Status: Done — all four slices landed: slices 1 (registry refactor), 2 (noop-streak project miner, `gate_result: no-commit`), 3 (noop-streak fleet registry entry + graduation e2e), 4a (registry-driven `wisdomKind` label derivation + FleetView state plumbing — client JS is a serialized string that cannot import the registry, so the kind is derived server-side), and 4b (the shell's `fleetWisdomPanel` renders `state.wisdomKind` in its summary title when the proposal carries a registered marker, falling back to the generic title otherwise; `fleet-wisdom-panel.test.ts` covers both branches plus an axe scan) all shipped end-to-end.

Board task: `web-msnt26xe-pc4pzp` ("FLEET WISDOM (M7 companion): learnings that
generalize (gate patterns, gotchas, conventions) graduate from per-project SOUL to a
shared fleet layer with confidentiality boundaries…").

**Why this spec exists now:** the shipped fleet-wisdom lifecycle
(`docs/DOCTRINE-COORDINATION.md` §"Fleet wisdom") recognizes exactly ONE learning — the
checkpoint-streak note — and its docs close with "broadening to more learning kinds
(gate patterns, gotchas, conventions) is open design work." A firing then issued
VERDICT `ap-mt2pfd8k-1`: the broadening needs a design firing before another
single-firing slice. This file is that design firing's deliverable: the decision, the
invariants every future slice must preserve, and the slice plan.

## Context — what ships today (the seam this epic extends)

- **Project level:** `mineSoulAmendment`/`pruneSoulAmendment`
  (`apps/dashboard/src/flight/soul-mining.ts`) mine and retract ONE learning per
  project, recognized by its stable marker heading
  `CHECKPOINT_SOUL_AMENDMENT_MARKER` (`## Learned: recurring checkpoint pattern`).
  The note text is a fixed template; the trigger is mechanical (`gate_result:
  checkpointed` streak of 3).
- **Fleet level:** `mineFleetWisdom`
  (`apps/dashboard/src/flight/fleet-wisdom-mining.ts`) counts DISTINCT project SOULs
  carrying that marker; at `FLEET_WISDOM_GENERALIZATION_THRESHOLD = 3` it proposes a
  fixed, pre-authored fleet template into the `fleet.wisdom_proposed` slot
  (`packages/store/src/mutate.ts`, schema v20). Ratify/dismiss routes and the shell
  banner are operator-only; `composeSoulWithFleetWisdom` layers ratified wisdom into
  every firing prompt, stripping the marker section when the project's own SOUL
  already carries it.

## The design decision

**Core question:** how does the fleet layer recognize "the same learning" across N
projects when SOUL text is free-form? Three candidate mechanisms:

1. **Free-text similarity** (embeddings, or an LLM judging "are these notes the same
   lesson?") — REJECTED. Non-deterministic, not unit-testable, and it breaks the
   confidentiality boundary *by construction*: producing a shared note from similar
   project notes means reading project text INTO the shared output, which is exactly
   the leak the fixed-template design exists to make impossible.
2. **Operator promotes by hand** — already possible (the fleet `wisdom` text is
   editable via ratify), but it is not the automation the board task asks for, and it
   gives the operator no signal about WHEN a lesson has generalized.
3. **Marker registry** — CHOSEN. Every machine-mined SOUL note already carries a
   stable `## Learned: …` marker heading written by its project-level miner.
   Generalizing is therefore a `LEARNING_KINDS` registry with one entry per known
   marker: `{ marker, fleetTemplate(count) }` (per-kind threshold override only if a
   real case demands it — YAGNI until then). `mineFleetWisdom` iterates the registry
   instead of hardcoding one marker; `composeSoulWithFleetWisdom` dedups per
   registry marker via the existing `stripMarkedSection`.

**Implication, stated as a feature:** a learning can only graduate if it was MINED
(marker-stamped, fixed-template) at the project level first. Free-hand operator notes
never auto-graduate. That is the confidentiality boundary made structural — the
graduation pipeline only ever carries text that was BORN as a pre-authored template,
so no redaction pass exists to get wrong.

## Invariants — every slice must preserve these

- ONE pending fleet proposal at a time; mining never overwrites an unreviewed one.
  With multiple registry kinds and a single slot, mining proposes the FIRST registry
  entry that qualifies (registry order = priority); the rest wait for the sweep after
  the operator acts. A proposal queue is out of scope.
- Ratify/dismiss stays operator-only. Nothing is ever applied automatically.
- Whole-text replace, never diffs — same contract as `mineSoulAmendment`.
- Fleet templates interpolate ONLY the count of confirming projects — never slug,
  name, root path, or verbatim SOUL content.
- A learning kind is a marker + fixed template pair. Adding a kind must not require
  touching storage, routes, or the compose seam — registry-driven by construction.

## Acceptance criteria

- `mineFleetWisdom` and `composeSoulWithFleetWisdom` are registry-driven, with at
  least TWO learning kinds live end-to-end (project miner → fleet graduation).
- All invariants above hold, each pinned by a unit test (the existing
  `fleet-wisdom-mining.test.ts` invariant tests extended per-kind).
- The pending-wisdom banner names WHICH learning kind the proposal carries (derived
  by marker match), keyboard-operable and axe-clean per the UX-EXPRESSION doctrine.
- `docs/DOCTRINE-COORDINATION.md` §"Fleet wisdom" drops its "open design work" clause
  and links here instead (done in this design firing).

## Slice plan (each sized for one firing)

1. **Registry refactor, behavior-preserving** — extract `LEARNING_KINDS` with the
   single checkpoint entry; `mineFleetWisdom`/`composeSoulWithFleetWisdom` iterate
   it. Existing tests stay green unchanged; add one registry-shape test (every entry
   has a `## Learned:`-prefixed marker and a template that contains no `{slug}`-like
   interpolation of project fields).
2. **Second learning kind, project level** — a noop-streak miner in
   `soul-mining.ts`: `gate_result` shows N consecutive `noop` firings → propose a
   marked note ("recurring noop pattern — the board may be stale or scoped away from
   this project; propose VERDICTs instead of re-scanning"). Mine + prune pair, same
   fixed-template/streak mechanics as the checkpoint note. (Candidate chosen because
   it is mechanically derivable from `metrics.gate_result` exactly like the existing
   one — "gate patterns" and "gotchas" from the board title need richer signals that
   do not exist as structured data yet; see Out of scope.)
3. **Second kind, fleet level** — registry entry (marker + count-only fleet
   template) for the noop-streak learning; graduation e2e test across three fake
   projects.
4. **Banner names the kind** — the shell's pending-wisdom panel derives the learning
   kind from the proposal's marker and renders it in the panel title; axe/keyboard
   assertions extended in `fleet-wisdom-panel.test.ts`.

## Out of scope

- Free-text similarity or LLM-judged generalization of unmarked SOUL content.
- A proposal queue (multiple pending fleet proposals) — the one-slot invariant
  stands until the operator actually reports proposal contention.
- Fleet-level PRUNE parity (retracting a fleet note when fewer than threshold
  projects still carry the local marker): after ratification projects legitimately
  prune their local copies once their streak breaks, so "count dropped" does NOT
  mean "lesson stale" — a correct retraction signal needs design of its own. Noted
  here so the gap is recorded, deliberately not sliced.
- Learning kinds requiring signals that are not yet structured data (per-gate-command
  flake rates, config-gotcha detection). Each needs its own telemetry column first —
  a separate board task, not a stretch goal of this epic.

## Related

- `docs/DOCTRINE-COORDINATION.md` §"Fleet wisdom — learnings graduate from SOUL into a
  shared layer" — the shipped lifecycle this epic extends.
- Board `web-msnt26xe-pc4pzp` (the epic's task), verdict `ap-mt2pfd8k-1` (the design
  firing this file discharges).
- `apps/dashboard/src/flight/soul-mining.ts`,
  `apps/dashboard/src/flight/fleet-wisdom-mining.ts` — the two seams every slice
  lands in.
