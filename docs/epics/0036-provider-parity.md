<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0036. Provider parity — more than one engine behind the same invoke port

Status: In progress — research spec landed 2026-09-27; the first slice (Bedrock/Vertex `AuthMode`
values in `auth.ts`) landed the same day. `ModelPort` now has four live implementations
(`ClaudeCliModel`/`StreamingClaudeCliModel`, `OllamaModel`, `CodexCliModel`, and `GeminiCliModel`) — Bedrock/Vertex
need none, since both route through the same `claude` CLI (see row below). The Codex adapter
landed whole on 2026-09-27: `packages/engine/src/adapters/codex-cli.ts`'s `parseCodexExecOutput`
reads `codex exec --json` stdout into a `ModelResponse` (fixture-tested, `costUsd` always `null`),
and `CodexCliModel` spawns it (`exec --json --model <model> --sandbox workspace-write [resume
<id>] <prompt>`, verified against openai/codex's own docs and `codex-rs/exec/src/cli.rs`).
Not yet flown on a real lane — no routing/config wiring, no idle-timeout hardening
(`ClaudeCliModel`'s equivalent was added after real incidents this adapter has no flight history to
have hit yet). It DOES share `ClaudeCliModel`'s CLI-level resume fallback, added 2026-09-27:
`codex-rs/exec/src/lib.rs` (`resolve_resume_thread_id`) takes a UUID as given and asks for that
thread, so a stale id fails the run before `thread.started`, and `isCodexResumeFailure` retries it
once, cold, as `resumed: false`. A session NAME it cannot find starts a fresh thread silently
instead, so `resumed` is `true` only when `thread.started` names the requested thread. It DOES carry the crash-path `pidRegistry`
containment parity (board ap-mt2ukjg5-2) `ClaudeCliModel`/`GeminiCliModel` already have — added
2026-09-27 ahead of routing wiring, same as Gemini's, so neither non-Claude adapter is a
containment regression from day one — and the same settle path as Gemini's below (injectable
`reapDescendants` seam; a wall-clock-cap kill comes back `timedOut`, not as a crash). The Gemini
adapter landed whole the same day:
`packages/engine/src/adapters/gemini-cli.ts`'s `parseGeminiJsonOutput` reads `gemini --prompt …
--output-format json` output into a `ModelResponse` (fixture-tested, `costUsd` always `null`), and
`GeminiCliModel` spawns it (`--model <model> --output-format json --approval-mode yolo [--skip-trust]
[--resume <id>] [--prompt <prompt>]`, verified against google-gemini/gemini-cli's
`packages/cli/src/config/config.ts`). Two traps shaped it: the positional prompt runs
*interactive*, so the prompt rides on `--prompt` (or on stdin alone past the Windows command-line
threshold, as `ClaudeCliModel` does); and headless mode turns every "ask the user" policy decision
into a denial (`packages/core/src/policy/policy-engine.ts`), so only `yolo` (unsandboxed) lets the
agent edit files and run the gate. Folder trust is on by default and headless mode exits
(`FatalUntrustedWorkspaceError`) in an untrusted folder; `--skip-trust` is opt-in, because trusting
a folder also loads its `.gemini/settings.json` and MCP servers. It carries Codex's gaps (no
routing, no idle timeout) plus one Codex no longer has: no resume-retry. Its settle path matches `ClaudeCliModel.execOnce`'s:
the orphan-sweep reap runs through an injectable `reapDescendants` seam its tests assert on, and a
wall-clock-cap kill comes back `timedOut` (THIRD CAP) rather than reading as an ordinary crash.
It also has the tool-level guard `ClaudeCliModel` gets from its `--settings` PreToolUse hook,
added 2026-09-27: `yolo` runs every shell command unchecked, so `guardSettingsPath` hands the
child a settings file from `buildGeminiFlightSettings` (`packages/engine/src/gemini-guard.ts`)
as `GEMINI_CLI_SYSTEM_SETTINGS_PATH`. That file's `BeforeTool` hook runs the same
`guard-hook.js`, which reads each Gemini tool call as the Claude call it amounts to and denies in
Gemini's `{"decision":"deny","reason"}` shape. The hook contract was read from gemini-cli's
`packages/core/src/hooks/` (`types.ts`, `hookRunner.ts`, `hookPlanner.ts`) and
`packages/cli/src/config/settings.ts`. System settings merge last, so a repo's own
`.gemini/settings.json` cannot switch the hook off; the price is that the child skips the
machine's own system settings file. Gemini already confines its file tools and the shell's
`dir_path` to the workspace, so the shell command text was the real gap. The Copilot CLI adapter remains unstarted and, per the
2026-09-27 re-check below, is now explicitly blocked on capturing a real `--output-format=json`
sample from the closed-source binary — not just unstarted for lack of a turn to spend on it.

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
it. That degradation is a real, accepted cost of adding this adapter, not a bug to fix in it. Two usage traps, read from the Rust source
(`codex-rs/exec/src/event_processor_with_jsonl_output.rs`, `codex-rs/protocol/src/protocol.rs`,
2026-09-27): `usage` is the thread's running total, not a per-turn delta, so the last
`turn.completed` wins and a sum would double-count; and `input_tokens` includes
`cached_input_tokens` (Codex's own `non_cached_input()` subtracts them), so the parse moves the
cached share to `cacheRead` to match what `tokensIn` means for `claude -p`. A stdin trap, read from
`codex-rs/exec/src/lib.rs` (`resolve_root_prompt`, `read_prompt_from_stdin`, 2026-09-27): given a
prompt argument, `codex exec` still reads a non-TTY stdin to EOF and appends it as a `<stdin>`
block, so `CodexCliModel` always closes stdin — before that fix, the pipe `execFile` opens stayed
open and every cold run would have hung until the wall-clock cap. A `-` argument makes both `exec`
and `exec resume` read the prompt from stdin, which is how an over-threshold prompt (the Windows
command-line ceiling) or one starting with `-` reaches the CLI.

**4. Google Gemini CLI** — headless mode triggers on a non-TTY or `-p`/`--prompt`; `--output-format
json` returns one JSON object with response + usage statistics, or JSONL for a stream
([geminicli.com/docs/cli/headless](https://geminicli.com/docs/cli/headless/)). Session resume:
`--resume`/`-r <id>` or `--resume last`; sessions persist under
`~/.gemini/tmp/<project_hash>/chats/`. **Resume gap, since closed upstream:** the session ID was not
surfaced in headless JSON output (upstream issue
[google-gemini/gemini-cli#14435](https://github.com/google-gemini/gemini-cli/issues/14435)); re-read
from source on 2026-09-27, `JsonOutput` in `packages/core/src/output/types.ts` now carries
`session_id`, and `JsonFormatter` writes it whenever the CLI has one — the same envelope-borne id
Claude CLI gives, so no chat-directory scraping is needed. **Cost gap:** `stats`
(`SessionMetrics`, `packages/core/src/telemetry/uiTelemetry.ts`) carries per-model token counts
only, never a priced figure, so a `GeminiCliModel` reports `costUsd: null` exactly like Codex. Two
wire traps, read from the same source: the JSON is ONE pretty-printed object (not JSONL), and a
fatal error (turn limit, API failure) writes its error-only object to **stderr** behind an
`[ERROR] ` prefix instead of stdout (`packages/cli/src/utils/errors.ts`), so the parse reads stdout
first and falls back to stderr. Tokens follow the CLI's own `convertToStreamStats` mapping —
`tokens.input` (already `prompt − cached`) to `tokensIn`, `candidates` to `tokensOut`, `cached` to
`cacheRead` — summed over every model in `stats.models`, since the CLI's router can add its own.

**5. GitHub Copilot CLI** — non-interactive mode (`-p`) exists, but by default mixes model output
with UI chrome (Braille spinner glyphs) and tool-execution annotations on stdout
([github.blog](https://github.blog/ai-and-ml/github-copilot/github-copilot-cli-for-beginners-interactive-v-non-interactive-mode/)).
The `-s`/`--silent` flag strips that down to a clean agent-response-only stdout — but drops usage
statistics in the process. **Re-checked 2026-09-27:** GitHub's own programmatic reference
([docs.github.com/copilot/.../cli-programmatic-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference))
now documents `--output-format=FORMAT` (`text`, the default, or `json` — "the CLI emits JSONL, one
JSON object per line"), which reads as the same clean-AND-parseable shape `claude -p --output-format
json` already gives, closing the `-s`-vs-stats tradeoff the previous note above described. **New
blocker in its place:** unlike `codex-cli.ts` and `gemini-cli.ts`, whose wire formats this epic
verified against openai/codex's and google-gemini/gemini-cli's own OPEN-SOURCE repos, `github/copilot-cli`
ships as a closed-source binary via the `@github/copilot` npm package — no public source tree exists
to read the JSONL event schema from. Neither GitHub's docs nor the open feature request asking for a
session id in non-interactive output
([github/copilot-cli#807](https://github.com/github/copilot-cli/issues/807), closed, no maintainer
example posted) shows one verbatim example line of `--output-format=json` output: no confirmed field
names for the event type, session id, per-model token usage, or error shape. A community tool that
reads Copilot CLI's on-disk session state (`~/.copilot/session-state/<id>/events.jsonl`, a DIFFERENT
mechanism from `--output-format=json` stdout) documents fields there
(`data.modelMetrics.<model>.usage.{inputTokens,outputTokens,cacheReadTokens,cacheWriteTokens}` — see
[ccusage.com/guide/copilot](https://ccusage.com/guide/copilot/)), but that is a different surface and
does not stand in for the stdout schema `CopilotCliModel` would actually parse. Per this epic's own
citation discipline (verify against source before implementing, never guess a wire format), **the
Copilot adapter cannot be built fixture-tested the way Codex/Gemini were until a future firing
captures one real `copilot -p ... --output-format=json` run** (needs an authenticated `copilot login`
this repo does not have configured) and commits its actual output as the fixture. Session resume:
`copilot --resume <SESSION-ID>` (confirmed working, per GitHub's own docs) — separately from the
output-schema question above.

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
| OpenAI Codex CLI | Yes — `codex exec resume`; `thread.started` carries `thread_id` | Yes — full loop | **None** — token counts only, no price | **Adapter shipped** — `CodexCliModel` (`packages/engine/src/adapters/codex-cli.ts`); not yet wired into routing/config, so no lane flies on it |
| Google Gemini CLI | Yes — `--resume <id>`; JSON output carries `session_id` (upstream gap since closed) | Yes — full loop | **None** — token counts only, no price | **Adapter shipped** — `GeminiCliModel` (`packages/engine/src/adapters/gemini-cli.ts`); not yet wired into routing/config, so no lane flies on it |
| GitHub Copilot CLI | Yes — `--resume <id>` | Yes — full loop | `--output-format=json` exists but its wire schema is undocumented and unverifiable (closed-source binary) | **Blocked** — needs a real captured output sample before an adapter can be fixture-tested |

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
