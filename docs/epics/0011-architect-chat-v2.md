<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0011. ARCHITECT chat v2 — a persona-switched control surface for the Ask panel

Status: Active — slices 1-3 shipped end-to-end (2026-08-21): the Ask panel's
GENIUS/ARCHITECT persona toggle, ARCHITECT's action-card proposal flow, and
the confirm-gated control-tool execute endpoint are all live in production
code. Slice 4 (`fly_start`/`fly_stop`) remains deferred — see Out of scope.

Board task: `web-msnqmgge-oijj8x`. v1 shipped MCP write tools with no UI
consumer (`packages/mcp/src/control.ts` — `tasks_list`, `tasks_set_status`,
`tasks_create`, `tasks_reorder`, `tasks_delete`, `project_reset`; all
unit-tested in `packages/mcp/test/control.test.ts`, but, per
`docs/THREAT-MODEL.md` §2, **dormant** — no production entry point wires
`createControlServer`/`registerControlTools` into anything live today). v2 is
the UI half: a persona switch in the dashboard's own Ask panel. Research
basis: `docs/RESEARCH-LIBRARY.md` "Copilot / side-chat UX" (2026-08-08) —
*"GENIUS (read, context-aware, grounded in map+search+LIVE STATE+CHANGELOG) +
ARCHITECT (same core + MCP control tools; destructive ops = outcome preview +
explicit confirm)."*

**Why this spec exists now, not earlier:** `docs/RESEARCH-LIBRARY.md`'s
"7→10 ramp — slice-relay duplication" entry (2026-08-20) documents THREE
sibling instances (fleet-9, -4, -7) independently picking this exact board
task in the same round and building the SAME next increment
(`tasks_reorder`), ~$9.2 of duplicate work dropped at merge. The task had no
committed spec, so each picker re-derived scope from the board title alone.
This file is that spec — the slice ledger below is the fix (`docs/epics/
README.md`'s convention: a firing that picks up an `EPIC-SPEC:`-marked task
reads the linked file, not the title, for scope).

## Acceptance criteria

- The Ask panel (`apps/dashboard/src/web/features/search.ts`) offers a
  two-state persona toggle, GENIUS (default, unchanged behavior) and
  ARCHITECT (opt-in per session, not persisted as a silent default).
- In ARCHITECT mode, a control-tool action (list/status/create/reorder a
  task) the model proposes renders as an explicit, inspectable action card
  before it runs — never a silent side effect buried in prose.
- Read actions (`tasks_list`) may auto-run once confirmed present; write
  actions (`tasks_set_status`, `tasks_create`, `tasks_reorder`) and
  destructive actions (`tasks_delete`, `project_reset`) require an explicit
  operator click to execute — no auto-write, ever (mirrors `pr-review-
  execute.ts`/`release/execute.ts`'s preview-then-CSRF-guarded-execute
  shape, the repo's existing pattern for "an agent proposes, the operator
  confirms").
- Every executed control-tool call is appended to the same operator action
  log `web/features/fly.ts`'s `targetedAction` already writes into
  (`recordOperatorAction`) — an ARCHITECT-driven change is visibly
  attributed, not indistinguishable from silence.
- `docs/THREAT-MODEL.md` §2's "MCP control server is dormant" line and T9
  ("gets wired up without the same review this document gives the flying
  agent") are updated to reflect the real wiring once slice 1 lands — the
  threat model tracks production reality, not a stale "not yet applicable."

## Constraints

- No new network-exposed transport: the control tool handlers
  (`tasksList`, `taskSetStatus`, `tasksCreate`, `tasksReorder`, `tasksDelete`,
  `projectReset` — all plain `Store`-in/data-out functions already) are
  called **in-process** from the dashboard server, the same way `server.ts`
  already calls other `Store`-mutating functions — this epic does not stand
  up `createControlServer`'s MCP stdio/HTTP transport for an external
  client. That remains a separate, explicitly-flagged future step (T9)
  because an external MCP client is a different threat surface (any
  process on the machine, not just this dashboard's own browser tab) and
  deserves its own review when it's actually needed.
- CSP `default-src 'self'` untouched; the Ask panel client stays vanilla,
  external-script-only (`connect.ts`/`fly.ts`'s existing pattern).
- Confirm-gated writes reuse the existing CSRF + rate-limit shape
  (`server/server.ts`'s pattern for `/api/pr-review/execute`,
  `/api/release/execute`) rather than inventing a second one.
- `fly_start`/`fly_stop` (named in the board title) are **out of scope for
  slices 1-3** — see Out of scope.

## Out of scope

- `fly_start`/`fly_stop` MCP tools. `FlightRunnerRegistry` (the live,
  in-process flight state these would control) lives in
  `apps/dashboard/src/flight/registry.ts`; `@autopilot/mcp` currently
  depends only on `@autopilot/store` (durable SQLite state), not on
  live in-memory dashboard state. Adding these tools is a real
  architecture question — does the registry get injected into
  `registerControlTools` as a second dependency alongside `Store`, or does
  a separate tool-registration function exist for live-process control? —
  that deserves its own slice and its own review, not a rushed mirror of
  the `tasks_*` pattern onto a fundamentally different (process-spawning)
  capability. Tracked as slice 4+.
- Standing up `createControlServer` as a reachable MCP transport for an
  EXTERNAL client (another LLM agent, a third-party harness) — THREAT-MODEL
  T9's trigger. This epic's ARCHITECT persona calls the same handler
  functions directly and in-process; it is not that external surface.
- The "approve" tool — already covered by `tasks_set_status` moving a task
  off `needs_approval` (`control.ts`'s own docstring); no new tool needed.
- Multi-step autonomous tool loops (the model deciding to chain several
  control calls without an intervening confirm). ARCHITECT chat v2 is
  single-action-per-confirm; an agentic multi-step loop is `web-
  msnqmghc-3cb6dc` ("Agentic Ask escalation")'s territory, and even that
  task's spec (once written) should keep it READ-ONLY (Read/Grep/Glob),
  never control-tool writes — the two epics must not blur: GENIUS may
  escalate to a deeper READ, ARCHITECT may perform a confirmed WRITE,
  and no path exists from one to the other's capability without an
  explicit persona switch the operator makes.

## Slices

1. **SHIPPED** — In-process wiring + re-review: resolve THREAT-MODEL T9's "gets wired up
   without review" trigger by wiring the existing `tasksList`/
   `taskSetStatus`/`tasksCreate`/`tasksReorder`/`tasksDelete`/`projectReset`
   handlers into the dashboard server directly (no new transport), behind a
   confirm-gated execute endpoint for write/destructive calls, with the
   operator-action-log entry described above. Implemented in
   `apps/dashboard/src/flight/control-execute.ts` (see Related section).
   THREAT-MODEL.md's T9 row was re-reviewed for slices 2-3 (2026-08-24) and
   updated to match — see `docs/THREAT-MODEL.md`.
2. **SHIPPED** — Ask panel persona toggle: GENIUS/ARCHITECT UI control in
   `search.ts` (`#ask-persona` button group), threaded through
   `/api/ask/stream`'s request body as a `persona` field
   (`server/ask.ts`'s `parsePersona`, default `'genius'`, byte-identical
   GENIUS path). Covered by `test/web/ask-persona-toggle.test.ts`.
3. **SHIPPED** — ARCHITECT intent routing + action cards: the ARCHITECT-mode
   prompt addendum (`ask/architect-proposal.ts`'s `buildArchitectAddendum`)
   teaches the model to fence at most one proposal; `parseArchitectProposal`
   lifts it out of the answer into the terminal SSE frame's `proposal` field
   (invalid/absent blocks leave the prose untouched). The client
   (`search.ts`'s `renderProposal`) renders it as an inspectable action card
   — `tasks_list` (safety `read`) auto-runs since it has no side effect;
   write/destructive tools render an explicit confirm button (destructive
   labeled "Confirm (destructive)") — and POSTs to slice 1's
   `/api/control/execute` on confirm, then appends `'ARCHITECT ran <tool>'`
   to the shared `operatorActionLog`. Covered by
   `test/ask/architect-proposal.test.ts` and
   `test/web/architect-action-card.test.ts`.
4. `fly_start`/`fly_stop` (deferred — see Out of scope): once slices 1-3
   prove the in-process pattern, revisit whether `FlightRunnerRegistry`
   gets injected as a second control dependency or gets its own
   tool-registration function.

## Related

- `docs/RESEARCH-LIBRARY.md` "Copilot / side-chat UX" (2026-08-08) — the
  GENIUS/ARCHITECT design source.
- `docs/RESEARCH-LIBRARY.md` "The 7→10 ramp — scale evaluation + the
  slice-relay duplication class" (2026-08-20) — the incident this spec
  exists to prevent a repeat of.
- `docs/THREAT-MODEL.md` §2 ("MCP control server is dormant") and T9 — the
  security review trigger slice 1 resolves.
- `packages/mcp/src/control.ts` — the existing, tested, dormant tool
  handlers this epic makes reachable.
- `apps/dashboard/src/flight/control-execute.ts` — slice 1 implementation:
  in-process wiring of control-tool dispatch, argument validation, safety
  annotations, and outcome reporting (shipping the API without the UI
  consumer yet — slices 2-3).
- `docs/BACKLOG-999.md` §I / `web-msnqmghc-3cb6dc` ("Agentic Ask
  escalation") — the sibling epic this one must not blur into (see Out of
  scope).
