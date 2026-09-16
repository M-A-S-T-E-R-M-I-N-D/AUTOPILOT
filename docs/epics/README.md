<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Epic specs

Spec-driven development for board tasks too large for one firing. `RESEARCH-LIBRARY.md`
("SE methodology for agent loops") already flagged the pattern: *"SDD (spec-driven):
version-controlled spec as source of truth for epics; GitHub reports ~10× fewer
regenerate-from-scratch cycles; ThoughtWorks warns against big-bang specs."* A one-firing
task needs no spec — the board title is spec enough. An **epic-sized** task — one the
operator or a firing expects to span several firings, each landing a slice — gets a
committed spec up front so every firing that picks it up reads the same acceptance
criteria instead of re-deriving scope from whatever the last firing happened to leave
behind (or worse, from the board title alone, which is a summary, not a contract).

`LIVING-REPO-SPEC.md` predates this convention and is exactly what it's asking for —
kept at its existing path rather than renamed into `docs/epics/` for a zero-benefit link
rewrite. New epic specs land here going forward.

## Format

One file per epic, `docs/epics/NNNN-kebab-title.md`:

```markdown
# NNNN. Title

Status: Draft | Active | Done | Abandoned

## Acceptance criteria

The observable, checkable conditions that make this epic done — not a task list.

## Constraints

Hard limits the implementation must respect (performance, compatibility, containment).

## Out of scope

What this epic deliberately does NOT cover — the boundary that keeps it from growing
into the next epic.

## Related

Links to the research/plan doc(s), ADRs, or board items this epic distills.
```

## Convention

- A board task for epic-sized work carries a trailing `EPIC-SPEC: docs/epics/NNNN-kebab-title.md`
  marker in its title — parallel to the existing `DELIVERABLE:` clause convention
  (`apps/dashboard/src/flight/deliverable.ts`), parsed by
  `apps/dashboard/src/flight/epic-spec.ts`.
- A firing that picks up a marked task **reads the linked file before working it** — the
  spec, not the one-line board title, is the scope for that firing's slice.
- Machine-checked: `markTaskDoneIfShipped` (`apps/dashboard/src/fly.ts`) verifies the
  linked file is actually committed (`GitVcs.fileExists`, checked against HEAD) before
  trusting a `"completion":"complete"` claim on a marked task. A marker pointing at a
  spec that was never committed — promised in the title, never written — demotes the
  claim to a slice, the same mechanism the DELIVERABLE verifier and the UX-EXPRESSION
  DOCTRINE already use for an unbacked completion claim.
- Numbers are sequential, never reused. A spec that's superseded gets a new file; the old
  one's Status becomes `Abandoned` with a `Related` link forward, not a silent rewrite.

## Index

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-parallel-flights.md) | Parallel flights — independent projects, independent work plans | Done |
| [0002](0002-shell-decomposition.md) | Shell decomposition — modularize the five outsized files | Active |
| [0003](0003-ring-0-fleet-watchdog.md) | Ring-0 fleet watchdog — one daemon spawns and revives across ALL registered projects | Done |
| [0004](0004-bash-containment-worktree.md) | Bash containment — fly from a worktree, not the live checkout | Done |
| [0005](0005-cockpit-redesign.md) | Cockpit MX redesign — dark-luxury flight deck on a Material-future system | Active |
| [0006](0006-github-connected-mode.md) | GitHub connected mode — solo by default, federated by choice | Active |
| [0007](0007-platform-maintainer-and-pool.md) | The platform — one canonical main, a maintainer autopilot, a contributor pool | Active |
| [0008](0008-brand-identity.md) | Brand identity — the goggles mark: a pilot you can trust, a face you never see | Active |
| [0009](0009-warm-sessions.md) | Warm sessions — resume a flight's CLI session instead of cold-spawning every firing | Active |
| [0010](0010-maintenance-ritual.md) | Maintenance ritual — the recurring sweep the founder does by hand today | Active |
| [0011](0011-architect-chat-v2.md) | ARCHITECT chat v2 — a persona-switched control surface for the Ask panel | Draft |
| [0012](0012-agentic-ask-escalation.md) | Agentic Ask escalation — a READ-ONLY iterative tier for the Ask panel | Done |
| [0013](0013-cost-semantics-v3.md) | Cost semantics v3 — real subscription cost, not API list-price | Draft |
| [0014](0014-fleet-wisdom-generalization.md) | Fleet wisdom generalization — a marker registry, not a similarity engine | Done |
| [0015](0015-cockpit-supervisory-control.md) | Cockpit supervisory control — the COCKPIT MASTER BRIEF, reconciled to this repo | Active |
| [0016](0016-github-social-flight.md) | The GitHub social flight — on/off, only when gh is connected and authenticated | Active |
| [0017](0017-navigation-remake.md) | Navigation remake — minimal, visual, memorable | Done |
| [0018](0018-calm-cockpit.md) | Calm Cockpit — layout stability, tabs, and the many-lanes view | Active |
| [0019](0019-github-steward.md) | GitHub Steward — the pilot manages the page | Active |
| [0020](0020-legible-surface.md) | The legible surface — every panel says what it is and what it did | Active |
| [0021](0021-app-shell.md) | The app shell — subjects, a rail, and a phone-first cockpit (rows 1–11 shipped; row 3 tap-tap connect open) | Active |
| [0022](0022-ask-answer-quality-doctrine.md) | ASK answer-quality doctrine — citations, honest refusals, escalation offer, native locale (born 0021) | Active |
| [0023](0023-docs-reader.md) | The docs reader — Markdown rendered live, edited in place, kept honest | Draft |
| [0024](0024-pipeline-graph-editor.md) | The pipeline as a node graph — every instruction, tool and stage visible and editable | Draft |
| [0025](0025-icon-system.md) | The icon system — one stroke family, no emoji, credits kept | Active |
| [0026](0026-tasks-screen.md) | The tasks screen — a list with a point of view, and Ask one gesture away | Draft |
| [0027](0027-the-envoy.md) | The envoy — the fleet's autonomous, critical representative in public | Draft |
| [0028](0028-busy-states.md) | Busy states — the ritual scrim: acknowledge, show real progress, hold writes, always an escape | Active |
| [0029](0029-settings-and-the-masthead.md) | Settings and the masthead — one gear, icons not emoji, AAA within reach, GitHub as a connection | Active |
| [0030](0030-lock-on-and-fire.md) | Lock on and fire — the selling first file, the real flow in pictures, the hierarchy behind it | Active |
| [0031](0031-the-snackbar.md) | The snackbar — one place where an interaction says what happened | Active |
| [0032](0032-the-onboarding-ladder.md) | The onboarding ladder — micro-tasks that perform themselves, and two ticks worth earning | Active |
| [0033](0033-owned-work.md) | Owned work — from a public claim to a green, shipped contribution | Specified |
| [0034](0034-the-machine-visible.md) | The machine, visible — the live answer, and the cockpit's motion language | Specified |
| [0035](0035-modular-landings.md) | Modular landings — more than one runway, and a main that is always green | Specified |
