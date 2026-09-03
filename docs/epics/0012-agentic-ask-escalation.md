<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0012. Agentic Ask escalation — a READ-ONLY iterative tier for the Ask panel

Status: Done — all 3 slices landed

Board task: `web-msnqmghc-3cb6dc` ("Agentic Ask escalation: tier 1 stays the cheap
indexed answer; when insufficient or on a Deep toggle, escalate to a READ-ONLY agentic
session jailed by the guard (Read/Grep/Glob, no writes), iterative…").

**Why this spec exists now:** the board title is the only description of this task
anywhere in the repo — `docs/BACKLOG-999.md` no longer carries the line
`docs/epics/0011-architect-chat-v2.md` cites it from, and no other doc names it. That is
exactly the situation `docs/epics/README.md` was written to prevent (and
`docs/RESEARCH-LIBRARY.md`'s "7→10 ramp — slice-relay duplication" entry, 2026-08-20,
documented the ~$9.2 cost of three sibling firings re-deriving scope from a bare title
and independently building the same increment). Epic 0011's own Out of scope section
explicitly reserved this task ID for this exact capability and set one hard condition on
it up front: it "should keep it READ-ONLY (Read/Grep/Glob), never control-tool writes —
the two epics must not blur." This file is that spec.

## Context — what tier 1 already does, and where it stops

Tier 1 ships today: `askProject`/`askProjectStream`
(`apps/dashboard/src/ask/service.ts`), reachable via `POST /api/ask` and
`POST /api/ask/stream`, documented in `docs/THREAT-MODEL.md` §2's `"Ask your project"`
row. It is a single **tool-less** model call — `askEngineConfig`
(`apps/dashboard/src/server/main.ts:166-174`) sets `allowedTools: []`,
`disallowedTools: ['*']`, `maxTurns: 2`, `maxBudgetUsd: 0.5` — grounded on whatever
`gatherGroundedSources` (`ask/service.ts:74-90`) assembles: the operator's current view
(if supplied), a live-telemetry snapshot, the project structure map, and up to
`MAX_SOURCES = 3` FTS-retrieved content excerpts. When none of those four sources
contain the answer, there is no fallback — the model either says so
(`NO_SOURCES_ANSWER`, `ask/service.ts:27-28`) or, worse, answers past its grounding.
`docs/REACTIVITY.md` §1 named the fix a milestone ago: *"Agentic on-demand —
Read/Glob/Grep for anything the index didn't surface (multi-turn, idle-timer resets per
tool)"* and *"Ask (read-only) — tools = Read/Glob/Grep"* at capability tier
`Ask=Read/Glob/Grep·10`. This epic builds that tier.

## Acceptance criteria

- The Ask panel gains a per-question **Deep toggle**, default OFF. With it off, behavior
  is byte-identical to today's tier-1 flow — this epic adds a path, it does not change
  the existing one.
- Escalation to the read-only agentic tier fires on either of two triggers, matching the
  board title's "insufficient OR toggle":
  - **Manual** — the operator has the Deep toggle on for that question. Always escalates,
    regardless of whether tier 1 would have found sources.
  - **Automatic** — the Deep toggle is off, tier 1 runs first, and its grounded sources
    are empty (the `NO_SOURCES_ANSWER` case, `ask/service.ts:110-112`). This is the ONLY
    automatic trigger for v1 — see Out of scope for why a fuzzier "model judges its own
    answer insufficient" trigger is deliberately excluded.
- The escalation session is spawned with `allowedTools: ['Read', 'Grep', 'Glob']` via the
  same `--allowedTools`/`--disallowedTools` CLI mechanism tier 1 already uses
  (`buildClaudeArgs`, `packages/engine/src/adapters/claude-cli.ts:280-297`) — Bash,
  Write, Edit, NotebookEdit, and every other tool stay off the allow-list. **Before
  slice 1 ships**, verify against the installed Claude CLI's actual documented
  precedence rules whether an `allowedTools` grant needs a matching, non-wildcard
  `disallowedTools` list to stay airtight, or whether `disallowedTools: ['*']` (tier 1's
  current value) would silently blank the allow-list back to nothing — getting this
  wrong either bricks the feature (safe, just useless) or, far worse, silently widens the
  grant. This is a correctness-of-the-jail question, not a design choice, and belongs in
  code review before merge, not asserted here.
- The same `--settings` guard-hook flight already uses for containment
  (`packages/engine/src/guard.ts`, `buildFlightSettings`) is layered on top, with
  `targetRoot` set to the project folder being asked about — belt-and-suspenders: even if
  the tool grant above were ever misconfigured, the PreToolUse hook independently denies
  any `Read`/`Grep`/`Glob` outside that folder and applies the existing B7 read-hygiene
  filter (skip `dist`/`coverage`/`node_modules`/`.git`). This is the literal mechanism
  the board title's "jailed by the guard" phrase names — no new guard code, just wiring
  the existing one into a second call site.
- `maxTurns` is bounded but genuinely iterative — `docs/REACTIVITY.md`'s own number for
  this tier is `10` (`Ask=Read/Glob/Grep·10`); use it unless implementation surfaces a
  reason to differ, and say so in the slice's commit if it changes.
- `maxBudgetUsd` gets its own cap, distinct from and higher than tier 1's `0.5` (an
  iterative multi-tool-call session costs more per question than one tool-less call by
  design) — pick a concrete number in the implementing slice and record the reasoning,
  don't leave it at tier 1's value by accident.
- While escalated, the operator sees what the agent is reading, live — the streaming
  adapter already emits this (`StreamingClaudeCliOptions.onActivity`,
  `packages/engine/src/adapters/claude-cli.ts:328`); the Ask panel renders it the same
  way `docs/REACTIVITY.md` §3 describes for flights ("Reading src/x.ts… → ok" chips), not
  as a silent multi-second pause before an answer appears.
- `docs/THREAT-MODEL.md` §2 gains a new row for this tier once slice 1 lands, alongside
  the existing `"Ask your project"` row, documenting its real
  `allowedTools`/`disallowedTools`/`maxTurns`/`maxBudgetUsd` — the threat model tracks
  production reality, matching the convention epic 0011 §Acceptance criteria already
  established for its own THREAT-MODEL update.

## Constraints

- **Read-only, no exceptions.** No control-tool call (`tasks_*`, `project_reset`) is ever
  reachable from this path, at any turn, under any escalation trigger. Epic 0011's
  ARCHITECT persona is the write-capable surface; this epic's GENIUS-side escalation is
  not, and no code path may blur the two — mirrors 0011 Out of scope's own statement of
  the same boundary from the other side.
- No new transport, no new spawn primitive: this reuses `ClaudeCliModel`/
  `StreamingClaudeCliModel` and `buildFlightSettings` exactly as flights already do —
  the composition is new, the mechanisms are not.
- Reads discovered during escalation are answer-time only — they do not get written back
  into the persistent FTS/embedding index. Feeding escalation findings back into the
  index to improve future tier-1 hit rates is a real idea but a different, separate
  improvement (index-population strategy), not this epic.
- Same untrusted-data framing as tier 1: file content the escalation session reads is
  data, never instructions (`docs/REACTIVITY.md` §1's `<<< PROJECT_CONTENT >>>`
  delimiter convention) — a comment in a source file must not be able to redirect what
  the agent does next.

## Out of scope

- **Model-judged insufficiency** as an automatic trigger (the model deciding, after
  answering, that its own tier-1 answer was inadequate and silently re-running itself
  escalated). `docs/RESEARCH-LIBRARY.md`'s "Silent model downgrade" entry is a sharp
  reminder of what happens when a fallback path is inferred rather than an explicit
  signal — the same reasoning applies here. v1 ships only the two deterministic triggers
  in Acceptance criteria (empty sources, or the operator's own toggle); a fuzzier
  self-assessed trigger is a future slice if the deterministic one proves too narrow in
  practice.
- Feeding escalation-discovered content back into the persistent index (see Constraints).
- Any write capability, ever, under any trigger — see Constraints; that is epic 0011's
  territory, explicitly.
- Persisting the Deep toggle as a per-session or per-operator default. Every question
  starts from tier 1 unless the operator opts in that time, matching the board title's
  "on a Deep toggle" phrasing (a per-question control) rather than a mode switch.
- Standing up `createControlServer` as an external MCP transport — unrelated to this
  epic; already out of scope for 0011 too, for the same THREAT-MODEL T9 reason.

## Slices

1. **Engine composition + THREAT-MODEL update.** Shipped. Built the escalation
   `EngineConfig` (allowed/disallowed tools, resolved `maxTurns`/`maxBudgetUsd`,
   `packages/engine/src/ask-escalation.ts`) and `askProjectEscalated`
   (`apps/dashboard/src/ask/service.ts`) — unit-testable in isolation. Resolved the
   allowedTools/disallowedTools precedence question (deny beats allow, first match wins;
   an explicit enumeration, not a `'*'` wildcard). `docs/THREAT-MODEL.md` §2 row added.
2. **Automatic trigger.** Shipped. `askProject`/`askProjectStream` fall through to
   `askProjectEscalated` on empty sources when the composition root supplies an
   `escalation` dep (`AskDeps.escalation`/`AskStreamDeps.escalation`); a sourced question's
   behavior is unchanged. Composition-root wiring in `apps/dashboard/src/server/main.ts`
   (`askEscalationDepsFor`) resolves the asked project's `root_path`
   (`gatherProjectRoot`, `apps/dashboard/src/read/source.ts`) fresh per call, writes that
   project's own containment-guard settings file
   (`askEscalationGuardSettingsFileName`, `apps/dashboard/src/flight/lock.ts` — a
   `ask-escalation-guard-` prefix, distinct from a flight's `flight-guard-` one, so a
   concurrent ask escalation and a real flight against the same project never race to
   write the same path), and spawns the escalation session `repo`-rooted there so
   Read/Grep/Glob resolve against the project being asked about. `docs/THREAT-MODEL.md`
   §2 row updated to reflect the tier is now reachable.
3. **Deep toggle UI + manual trigger.** Shipped. The Ask panel gained a per-question
   Deep checkbox (`apps/dashboard/src/web/shell.ts`) read by `apps/dashboard/src/web/
   features/search.ts` and sent as `deep` on the `/api/ask/stream` request body;
   `askProject`/`askProjectStream` (`ask/service.ts`) force escalation when `deep` is
   true, ahead of the retrieval short-circuit, matching the board title's "insufficient
   OR toggle". `askEscalationDepsFor` (`server/main.ts`) now spawns the escalation
   session via `StreamingClaudeCliModel` (previously the non-streaming `ClaudeCliModel`)
   so its `onActivity` callback can relay live Read/Grep/Glob tool use through a new
   `{activity}` SSE frame (`server/server.ts`'s `handleAskStream`) to the panel, rendered
   as REACTIVITY.md §3-style chips in a dedicated `#ask-activity` container (kept apart
   from the answer container so a chip trail survives the answer's own re-renders). The
   non-streaming `/api/ask` endpoint also accepts `deep` for API parity, but never sees
   activity chips — no live transport to relay them over.

## Related

- `docs/REACTIVITY.md` §1, §3 — the design source for the read-only agentic tier and the
  live-activity rendering this epic implements.
- `docs/epics/0011-architect-chat-v2.md` Out of scope — reserved this task ID and set the
  READ-ONLY condition this spec formalizes.
- `docs/THREAT-MODEL.md` §2 (`"Ask your project"` row) — the row this epic's slice 1
  extends with the escalated tier's own entry.
- `docs/RESEARCH-LIBRARY.md` "The 7→10 ramp — scale evaluation + the slice-relay
  duplication class" (2026-08-20) — the incident class this spec exists to prevent a
  repeat of; "Silent model downgrade" — the reasoning behind excluding a model-judged
  auto-escalation trigger from v1.
- `apps/dashboard/src/ask/service.ts`, `apps/dashboard/src/server/main.ts:166-174` — the
  tier-1 implementation this epic extends, byte-identical when Deep is off.
- `packages/engine/src/adapters/claude-cli.ts:280-297` (`buildClaudeArgs`,
  `allowedTools`/`disallowedTools`) and `packages/engine/src/guard.ts`
  (`buildFlightSettings`) — the existing mechanisms this epic composes, not reinvents.
