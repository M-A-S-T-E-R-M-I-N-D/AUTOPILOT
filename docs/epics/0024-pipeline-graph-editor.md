<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0024. The pipeline as a node graph — every instruction, tool and stage visible and editable

Status: Draft (2026-09-13). Board tasks seeded 2026-09-12 under this number.

## The ask

Operator, 2026-09-12 and 13: the pipeline section "is ugly and everything
flickers — take it several levels up"; "we want to see the whole pipeline, the
LLM's instructions, the LLM's tools, exactly like the node-based workflow tools
the generative-media world uses"; and: do not name that software — understand
what it is and describe it by its nature; prefer a more modern, recommended
approach wherever one exists.

## The nature of the model we adopt

The reference class is the **node-graph workflow editor**: a canvas of typed
nodes joined by typed links, where the graph IS the program.

- A node is declared once, by a manifest: a category (its menu path), its inputs
  (required, optional, hidden; each a type plus options — a list of choices is
  a combo), its outputs (types plus names), and the function that runs it. Nodes
  are discovered from a folder; a broken node is reported, never fatal; a node
  may ship its own small client script for a custom widget.
- The graph has two serialized forms: a **UI form** (positions, sizes, collapsed
  state, order, widget values, groups — for persistence and the canvas) and an
  **execution form** (only the logical links and widget values — what the engine
  consumes). Submitting the execution form validates it first and returns errors
  addressed to a node and a field, which the canvas paints in place.
- Execution walks the graph in dependency order, lazily; a node whose inputs
  did not change is served from a content-keyed cache, so only what is downstream
  of a change recomputes. The server streams events — which node is executing,
  its progress (value/max), what it produced, what was cached, start/success/
  error — and the canvas lights the running node.
- Subgraphs: a selection becomes one node with boundary inputs and outputs, and
  its inner parameters can be promoted to the parent's face, so a complex stage
  reads as one box and still edits from outside.

The modern, recommended shape of this (2025–26): a typed node registry with
schema-validated manifests, a headless graph library on the canvas (rather than
a hand-rolled one), the execution form as a plain JSON document with a version,
and validation errors as structured node/field pairs.

## Mapping to AUTOPILOT

| Node kind | Backing today | Editable params |
| --- | --- | --- |
| Prompt sections (SOUL, laws, board, focus, inbox) | `packages/engine/src/prompt.ts` | text, order, on/off |
| Tool grants and guards | config/permissions + the auto-mode classifier | allow/deny lists |
| Model routing | `config/models`, the lucky-fit scorer | model per stage, budget |
| The loop stages (orient → pick → do → gate → commit → report → pace) | `apps/dashboard/src/fly.ts` | pacing, retries |
| Gate steps (typecheck, lint, format, test, build) | `config/gate`, `packages/engine/src/adapters/gate.ts` | command, order, parallelism |
| Hooks | `flight/firing-hooks.ts` | on/off |
| Rituals (triage, mirror pass, landing, release) | `flight/*-execute.ts`, `landing/` | schedule, caps |

Each node names its backing script or data path and which parameters are
editable; the current flight-plan editor becomes the **gate** subgraph inside the
whole-firing graph. The OTLP spans and the activity phases light the running node
exactly the way the reference class lights `executing`. Custom nodes are a
`nodes/` registry with a typed manifest (name, category, inputs, outputs, run),
discovered like the reference class discovers its extensions and sandboxed by the
same guard the flight uses. The UI form is saved per project beside the execution
form the engine consumes; validation returns node/field errors the editor paints in
place.

## Design direction

The existing SVG canvas stays (it already pans, zooms, and renders in all three
themes); it gains a typed node registry, the two graph forms, subgraphs with
promoted parameters, in-place validation and live node highlighting. No flicker:
the canvas patches nodes by id on a tick (the panel-cache law of 2026-09-12),
never rebuilds. Keyboard: arrow keys move selection, Enter opens a node's
parameters in the side sheet, Delete asks.

## Slices

1. Typed node registry + manifest schema; the current pipeline renders from it
   (no behaviour change).
2. The execution form + validation with node/field errors painted in place.
3. Live highlighting from spans and activity phases; progress per node.
4. Subgraphs with promoted parameters; the gate as the first subgraph.
5. Custom nodes from `nodes/`, discovered and sandboxed.

## Related

Epic 0021 (the shell), 0018 (calm cockpit — no flicker), 0015 (supervisory
control), the plan editor (`web/features/pipeline.ts`).
