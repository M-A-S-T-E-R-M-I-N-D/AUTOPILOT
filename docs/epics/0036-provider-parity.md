<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0036. Provider parity — more than one engine behind the same invoke port

Status: In progress — research spec landed 2026-09-27; the first slice (Bedrock/Vertex `AuthMode`
values in `auth.ts`) landed the same day. `ModelPort` still has exactly two live implementations
(`ClaudeCliModel`/`StreamingClaudeCliModel` and `OllamaModel`) — Bedrock/Vertex need none, since
both route through the same `claude` CLI (see row below). No new agentic-CLI adapter (Codex, Gemini,
Copilot) exists yet.

`docs/ROADMAP.md` §3 (M14, "not started") names the gap directly: AUTOPILOT flies one engine — the
Claude Code CLI on a personal subscription — and that is both its best property and its largest
single point of failure. Community epic:
[GitHub #21](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/issues/21). The roadmap's own
cheapest-first order is preserved below; this spec exists so a future firing picking up any one
slice reads the same acceptance criteria instead of re-researching each CLI's actual capabilities
from scratch, or worse, guessing at them.

## What exists today (the building blocks this epic reuses)

- `packages/engine/src/ports.ts`'s `ModelPort.invoke` is the seam every driver implements —
  `firing.ts` depends only on the interface, never a concrete driver.
- `packages/engine/src/adapters/claude-cli.ts` — the only agentic (multi-turn, tool-using) driver
  today. Sessions: yes, via `--resume <session_id>` (`docs/epics/0009-warm-sessions.md`). Cost: real,
  read straight from the CLI's own `--output-format json` envelope (`total_cost_usd`) — never
  computed from a local pricing table.
- `packages/engine/src/adapters/ollama.ts` — the one non-Claude driver today, but deliberately
  minimal: single-turn, non-streaming, no tool use, no sessions. `costUsd` is a real `0` (local
  compute has no bill), not an estimate.
- `packages/engine/src/auth.ts` — `AuthConfig`/`AuthMode` already supports `api-key` and
  `oauth-token` (both drive the same `claude` CLI on Anthropic's own API), plus a generic
  `endpoint` mode (`ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`) documented as covering "a local
  Ollama server, DeepSeek's Claude Code-compatible endpoint, a self-hosted gateway". Every mode
  strips the other three's env vars first, so modes never leak into each other.
- `ports.ts`'s `ModelEnvelope.costUsd` and `firing.ts` (§3.6, DEATH-COST capture) both hold the same
  rule: **cost is never invented from tokens** — an adapter that cannot get a priced figure from its
  own tool reports `null`, never a locally-computed estimate. This rule binds every adapter below.

## Researched findings (2026-09-27) — per candidate, cheapest-first per the roadmap

**1. API-key parity for Anthropic** — already substantially built. `auth.ts`'s `api-key` mode works
today; what the roadmap flags as missing ("first-class... a warning when a benchmark sweep runs on a
subscription") depends on a benchmark-sweep feature that does not exist yet (M15 is also "not
started" per the roadmap) — building that warning now would be for a feature with no caller. **This
sub-item is done except for a dependency that isn't there; out of scope until M15 lands.**

**2. Amazon Bedrock / Google Vertex** — not separate CLIs or adapters at all: the *same*
`claude` binary, routed to a different backend via env vars Anthropic documents at
[code.claude.com/docs/en/env-vars](https://code.claude.com/docs/en/env-vars) —
`CLAUDE_CODE_USE_BEDROCK=1` (+ `AWS_REGION`, AWS credentials) or `CLAUDE_CODE_USE_VERTEX=1`
(+ `CLOUD_ML_REGION`, `ANTHROPIC_VERTEX_PROJECT_ID`, GCP credentials). `ClaudeCliModel`/
`StreamingClaudeCliModel` need **zero** code changes — only `auth.ts` grows two new `AuthMode`
values (or the existing `endpoint` mode gains a variant) that set the right env vars and strip the
other modes'. **This is the actually-cheapest unbuilt slice**, cheaper than either CLI adapter below
— no new spawn/parse logic, no new CLI binary to discover on PATH, no new JSON schema to trust.

**3. OpenAI Codex CLI** (Apache-2.0, local) — `codex exec --json` is the non-interactive mode
(no TUI), returning newline-delimited JSON events
([developers.openai.com/codex/noninteractive](https://developers.openai.com/codex/noninteractive)).
Session resume: `codex exec resume --last "<prompt>"` or `codex exec resume <SESSION_ID>`, plus
forking a session. Tool use: full agentic coding loop, comparable in shape to `claude -p`.
**Cost gap:** the `turn.completed` event's `usage` object carries only
`input_tokens`/`cached_input_tokens`/`output_tokens` — **no priced dollar figure at all**. A
third-party integrator names this explicitly: "Cost reporting is Claude-Code-only: a Codex run has
no priced figure, only raw tokenUsage" (`openai/codex`-adjacent tooling issue tracker, cited via
search 2026-09-27). Per the never-invent-a-cost rule above, a `CodexCliModel` MUST report
`costUsd: null`, never a locally-priced estimate — which degrades every cost-based telemetry surface
(per-firing $, the MACHINE-WIDE 30d-equiv denominator, evaluation scorecards) for any lane flown on
it. That degradation is a real, accepted cost of adding this adapter, not a bug to fix in it.

**4. Google Gemini CLI** — headless mode triggers on a non-TTY or `-p`/`--prompt`; `--output-format
json` returns one JSON object with response + usage statistics, or JSONL for a stream
([geminicli.com/docs/cli/headless](https://geminicli.com/docs/cli/headless/)). Session resume:
`--resume`/`-r <id>` or `--resume last`; sessions persist under
`~/.gemini/tmp/<project_hash>/chats/`. **Resume gap:** the session ID is not actually surfaced in
headless JSON output today — open upstream issue
[google-gemini/gemini-cli#14435](https://github.com/google-gemini/gemini-cli/issues/14435) asks for
exactly this. Unlike Claude CLI's envelope `session_id` field, a `GeminiCliModel` wanting warm-session
continuity would have to read the newest file under the project's chat directory after each
invocation rather than trust the JSON response — a materially less reliable mechanism than the one
`docs/epics/0009-warm-sessions.md` already validated for Claude CLI.

**5. GitHub Copilot CLI** — non-interactive mode (`-p`) exists, but by default mixes model output
with UI chrome (Braille spinner glyphs) and tool-execution annotations on stdout
([github.blog](https://github.blog/ai-and-ml/github-copilot/github-copilot-cli-for-beginners-interactive-v-non-interactive-mode/)).
The `-s`/`--silent` flag strips that down to a clean agent-response-only stdout — but **drops usage
statistics in the process**. **Parity gap:** unlike `claude -p --output-format json` (clean AND
carries usage in the same call), a `CopilotCliModel` faces a real choice between parseable stdout and
any usage numbers at all; it cannot have both from one invocation the way Claude CLI can. Session
resume: `copilot --resume <SESSION-ID>`.

**6. Local models via Ollama, promoted to a real lane** — `OllamaModel` already exists but is wired
only for the dashboard's single-turn triage substep (`apps/dashboard/src/fly.ts`'s
`runBoardTriage`), deliberately not `firing.ts`'s primary work-unit call (`ollama.ts`'s own docstring
names why: no tool use, no agent loop). Promoting it to a real mechanical-work lane (docs,
formatting, test scaffolds) is a scheduling/routing change in the loop, not a `ModelPort` change —
`OllamaModel` itself needs no new capability, but the lane needs the "demotes a lane that fails
twice" quality gate the roadmap names, which doesn't exist yet for any lane.

**7. A parity matrix in the docs** — the table below. Kept here rather than in a separate file per
the epic-spec convention (`docs/epics/README.md`): one committed spec per epic, not a spec plus a
disconnected reference doc that can drift out of sync with it.

| Adapter | Sessions/resume | Tool use (agentic loop) | Cost reporting | Status |
| --- | --- | --- | --- | --- |
| Claude Code CLI (`ClaudeCliModel`/streaming) | Yes — `--resume`, envelope carries `session_id` | Yes — full loop | Real, from CLI envelope | **Shipped** |
| Ollama (`OllamaModel`) | No | No — single-turn only | Real `$0` (local compute) | **Shipped**, triage-only lane |
| Amazon Bedrock (same `claude` CLI) | Same as Claude CLI (no adapter change) | Same as Claude CLI | Same as Claude CLI | **Shipped** — `auth.ts` `bedrock` mode (`packages/engine/src/auth.ts`) |
| Google Vertex (same `claude` CLI) | Same as Claude CLI | Same as Claude CLI | Same as Claude CLI | **Shipped** — `auth.ts` `vertex` mode (`packages/engine/src/auth.ts`) |
| OpenAI Codex CLI | Yes — `codex exec resume` | Yes — full loop | **None** — token counts only, no price | Not started |
| Google Gemini CLI | Partial — resume works, session ID not in JSON output (upstream gap) | Yes — full loop | Yes — usage stats in JSON | Not started |
| GitHub Copilot CLI | Yes — `--resume <id>` | Yes — full loop | Clean stdout XOR usage stats, not both | Not started |

## Acceptance criteria

- Bedrock and Vertex are reachable via new `AuthMode` values (or an extended `endpoint` mode) in
  `auth.ts`, with a unit test proving each mode's env vars are set AND every other mode's are
  stripped — the existing `resolveClaudeEnv` discipline extended, not bypassed.
- Each new agentic-CLI adapter (Codex, Gemini, Copilot) implements `ModelPort` behind its own file in
  `packages/engine/src/adapters/`, mirroring `claude-cli.ts`'s pure-parse/impure-transport split
  (a parse function unit-tested with fixture JSON, the spawn kept separate and untested-by-unit-test)
  so the trust-critical parsing logic is testable without a real binary on PATH.
- Every new adapter's `ModelResponse.envelope.costUsd` is `null` when the underlying tool reports no
  priced figure (Codex today) — never a value computed from a hardcoded per-token price table added
  to this repo.
- A lane flown on a non-Claude engine is demoted (stops being offered new work) after two consecutive
  gate-failing firings — the "quality gate that demotes a lane that fails twice" the roadmap names,
  needed before Ollama's promotion and reusable for any CLI adapter's lane.
- The parity matrix table above is kept current as each row's Status changes — updated in the SAME
  commit that ships the adapter, not a follow-up.

## Constraints

- Never invent a cost. An adapter with no priced figure from its own tool reports `null`
  (`ports.ts`, `firing.ts` §3.6) — this is non-negotiable per existing doctrine, not a per-adapter
  judgment call.
- `ModelPort.invoke` never rejects (existing contract, `ollama.ts`) — every new adapter captures a
  dead/unreachable/malformed-response case as a failed `ModelResponse`, never a thrown error the
  caller must catch.
- Each `AuthMode`/adapter must actively strip the env vars every OTHER mode/adapter would set, the
  same discipline `resolveClaudeEnv` already enforces — a stray credential from a previous mode must
  never silently hijack a later invocation.
- MACHINE BUDGET doctrine (this repo's own fleet rules) applies to any new local-model lane exactly
  as it already applies to Ollama: no multi-minute all-core job runs unbounded under a fleet.

## Out of scope

- Building any adapter's actual code — this spec is research + acceptance criteria only. A future
  firing implements ONE slice (Bedrock/Vertex auth modes first, per the cheapest-first order above)
  and updates this file's Status/matrix row in the same commit.
- The subscription-benchmark-sweep warning named in `docs/ROADMAP.md` item 1 — blocked on a
  benchmark-sweep feature (M15) that does not exist yet.
- M15 (benchmarks & standing) and M16 (adjacent modes) — separate, later milestones per the roadmap;
  this epic is M14 only.
- Any CLI or backend not already named in `docs/ROADMAP.md` §3 (e.g. other local model runners) —
  adding a new candidate to the roadmap's own list is a roadmap change, not this epic's call to make.

## Related

- `docs/ROADMAP.md` §3 — M14, the milestone this epic implements.
- Community epic [GitHub #21](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/issues/21).
- `packages/engine/src/ports.ts` — the `ModelPort` seam every adapter implements.
- `packages/engine/src/auth.ts`, `packages/engine/src/adapters/claude-cli.ts`,
  `packages/engine/src/adapters/ollama.ts` — the existing drivers this epic extends.
- `docs/CLAUDE-CLI-INTEGRATION.md` — the researched-and-pinned precedent for how a CLI's headless
  auth/output contract gets documented before code depends on it; this epic's per-candidate findings
  follow the same pattern.
- `docs/epics/0009-warm-sessions.md` — the session-resume mechanism Gemini/Codex/Copilot's own
  resume flags would need to integrate with, and the measured finding (blanket resume can lose money)
  that any new adapter's resume support should be evaluated against, not assumed to win.
- `docs/MODELS.md` — the model catalogue/alias system, orthogonal to this epic (which model runs is a
  separate question from which engine/CLI runs it).
