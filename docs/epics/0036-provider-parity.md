<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0036. Provider parity — more than one engine behind the same invoke port

Status: In progress (re-checked 2026-10-03) — the Codex and Gemini adapters, the Bedrock/Vertex
`AuthMode` values and the gate-failure demotion rule shipped by 0.57.0 (2026-10-02), and a lane flies on
either CLI since that day (`AUTOPILOT_ENGINE`); the fly bar's engine picker, per-lane engine on a fleet
launch, the flight row's engine and backend names and the connect panel's endpoint/Bedrock/Vertex modes landed
2026-10-03 (after the 0.57.0 tag, unreleased). The `endpoint` auth mode (0.49.0) and the Ollama
adapter predate the epic, and Ollama is still the one-substep offload, not a lane. The Copilot CLI
adapter is unstarted, blocked on a captured `--output-format=json` sample (its wire schema is
undocumented; see finding 5). Research spec landed 2026-09-27; the first slice (Bedrock/Vertex `AuthMode`
values in `auth.ts`) landed the same day. `ModelPort` now has four live implementations
(`ClaudeCliModel`/`StreamingClaudeCliModel`, `OllamaModel`, `CodexCliModel`, and `GeminiCliModel`) — Bedrock/Vertex
need none, since both route through the same `claude` CLI (see row below). The Codex adapter
landed whole on 2026-09-27: `packages/engine/src/adapters/codex-cli.ts`'s `parseCodexExecOutput`
reads `codex exec --json` stdout into a `ModelResponse` (fixture-tested, `costUsd` always `null`),
and `CodexCliModel` spawns it (`exec --json --model <model> --sandbox workspace-write [resume
<id>] <prompt>`, verified against openai/codex's own docs and `codex-rs/exec/src/cli.rs`).
Since 2026-10-02 a lane can fly on it: `AUTOPILOT_ENGINE=codex` with `AUTOPILOT_ENGINE_MODEL`
naming the model (`apps/dashboard/src/flight/firing-engine.ts`, routing below); a Gemini lane flies
the same way under `AUTOPILOT_ENGINE=gemini`. Since 2026-09-29 it carries
`StreamingClaudeCliModel`'s idle cap: `codex exec --json` prints each event as a line the moment it
happens (`codex-rs/exec/src/event_processor_with_jsonl_output.rs`, `emit`), so every stdout chunk
re-arms an `idleTimeoutMs` timer (default `DEFAULT_CLI_IDLE_TIMEOUT_MS`, 20 min), and a child silent
that long is killed and comes back `timedOut` instead of holding its lane for the 90-minute wall
clock. It DOES share `ClaudeCliModel`'s CLI-level resume fallback, added 2026-09-27:
`codex-rs/exec/src/lib.rs` (`resolve_resume_thread_id`) takes a UUID as given and asks for that
thread, so a stale id fails the run before `thread.started`, and `isCodexResumeFailure` retries it
once, cold, as `resumed: false`. A session NAME it cannot find starts a fresh thread silently
instead, so `resumed` is `true` only when `thread.started` names the requested thread. It DOES carry the crash-path `pidRegistry`
containment parity (board ap-mt2ukjg5-2) `ClaudeCliModel`/`GeminiCliModel` already have — added
2026-09-27 ahead of routing wiring, same as Gemini's, so neither non-Claude adapter is a
containment regression from day one — and the same settle path as Gemini's below (injectable
`reapDescendants` seam; a wall-clock-cap kill comes back `timedOut`, not as a crash). The Gemini
adapter landed whole the same day:
`packages/engine/src/adapters/gemini-cli.ts`'s `parseGeminiJsonOutput` read `gemini --prompt …
--output-format json` output into a `ModelResponse` (fixture-tested, `costUsd` always `null`;
retired 2026-10-01, below), and
`GeminiCliModel` spawned it (`--model <model> --output-format json` — `stream-json` since
2026-10-01, below — `--approval-mode yolo [--skip-trust] [--resume <id>] [--prompt <prompt>]`,
verified against google-gemini/gemini-cli's
`packages/cli/src/config/config.ts`). Two traps shaped it: the positional prompt runs
*interactive*, so the prompt rides on `--prompt` (or on stdin alone past the Windows command-line
threshold, as `ClaudeCliModel` does, and since 2026-09-29 whenever it starts with `-`: `--prompt`
is `nargs: 1`, and yargs-parser's `eatNargs` never takes an arg matching `/^-[^0-9]/` as its value,
so the run would fail "Not enough arguments following: prompt"); and headless mode turns every "ask the user" policy decision
into a denial (`packages/core/src/policy/policy-engine.ts`), so only `yolo` (unsandboxed) lets the
agent edit files and run the gate. Folder trust is on by default and headless mode exits
(`FatalUntrustedWorkspaceError`) in an untrusted folder; `--skip-trust` is opt-in, because trusting
a folder also loads its `.gemini/settings.json` and MCP servers. Since 2026-10-02 a lane can fly
on it under `AUTOPILOT_ENGINE=gemini`, with the launcher writing its guard settings file (routing below).
Since 2026-10-01 it carries Codex's idle cap too. `--output-format json` writes its one object only
when the run ends, so there was no stdout to watch until then; `GeminiCliModel` now runs
`--output-format stream-json`, which prints `init` before the first model request and each event as
it happens (`nonInteractiveCli.ts`), so every stdout chunk re-arms the same `idleTimeoutMs` timer
(default `DEFAULT_CLI_IDLE_TIMEOUT_MS`, 20 min). A silent child is killed, its pipes closed first as
Codex's are, and comes back `timedOut` with the `init` session id still resumable. A stale
`--resume` id is still caught: `resolveSessionId` runs before any event is written and reports to
stderr (`gemini.tsx`), so that exit stays the no-envelope exit 42 `isGeminiResumeFailure` reads.
`parseGeminiStreamJsonOutput` reads the `JsonStreamEvent` lines
(`packages/core/src/output/types.ts`, all on stdout via `StreamJsonFormatter.emitEvent`, a fatal
error included as a `result` with `status: 'error'`, `packages/cli/src/utils/errors.ts`), fixture-tested.
Its `result` is the text streamed after the last tool event, since JSON mode's `response` restarts
every turn too (`nonInteractiveCli.ts`). Tokens come from the CLI's own `convertToStreamStats`
totals, and a run killed before its `result` keeps the `init` session id. Nothing spawned the
JSON-object form any more, so `parseGeminiJsonOutput` and its tests were retired the same day; the
stream parse's own tests cover every helper the two shared. Since 2026-09-28
it has Codex's resume fallback too: `resolveSessionId`
(`packages/cli/src/gemini.tsx`) looks a `--resume` id up before the run starts and exits
`FATAL_INPUT_ERROR` (42, `packages/core/src/utils/exitCodes.ts`) on an unknown one, writing no
output object, so `isGeminiResumeFailure` retries exactly that exit once, cold, as `resumed:
false`. `--resume latest` with no saved session starts a fresh one instead of failing, so `resumed`
is `true` only when the output's `session_id` is the one requested. Its settle path matches `ClaudeCliModel.execOnce`'s:
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
`dir_path` to the workspace, so the shell command text was the real gap. Since 2026-10-01 both
adapters time each run themselves and report it as `ModelResponse.observed.elapsedMs`, so a firing
flown on either no longer records `durationMs: null`: `codex exec --json` carries no duration at
all, and Gemini's `duration_ms` rides only on the `result` event a killed run never writes.
`observed.turns` is optional for them, since neither wire marks a model turn, and a count never
seen stays unknown in the firing record instead of becoming `0`. Since 2026-10-02 a run that ends
without an envelope says why, as `StreamingClaudeCliModel`'s does: its `stdout` is the CLI's
stderr tail (`cliDeathText` in `claude-cli.ts`), or the cap that killed it when the child left no
stderr, because `firing.ts` records that text as the firing's death tail. Before, both adapters
handed on the raw event stream there: a failed login, an untrusted folder or a bad config exits
before the first event with its reason on stderr only, so such a firing recorded no reason at all,
and a killed one stored every event it had printed as its reason. Since 2026-10-02 a Gemini run
also reports the tool calls the guard denied, as `ModelResponse.guardDenials`/`guardDenialDetails`
the way `StreamingClaudeCliModel`'s does, so the firing's guard-denial events and the loop's
"guard denied" alert see a Gemini lane too. gemini-cli's `coreToolHookTriggers.ts` turns a
BeforeTool deny into an error whose `message` is the hook's own reason, and `nonInteractiveCli.ts`
emits that call as a `tool_result` with `status: 'error'` and `error.message`. That reason is the
Claude guard's deny text, so `stream.ts`'s `guardDenialFromText` reads both wires. Only the error
is trusted: a tool that succeeded can print the same words in `output`. A Codex run has carried the
guard hook since 2026-10-02 (finding 3, below), and since the same day it reports the calls that
hook denied too, read off a deny log rather than the wire, since `exec --json` never shows a
blocked call (finding 3). Since 2026-10-02 a Gemini run also feeds THREAT-MODEL T6's web-search audit:
given `onWebSearch`, `GeminiCliModel` reads each stdout line as it lands and reports every
`google_web_search` `tool_use` (`nonInteractiveCli.ts` emits it before the tool runs) through
`geminiWebSearchFromEvent` as the `WebSearchAudit` `StreamingClaudeCliModel` hands the flight's
`web-search` rows: the query whole up to `WEB_SEARCH_AUDIT_MAX_CHARS`, no domain filter
(`WebSearchToolParams` in `tools/web-search.ts` takes `query` alone). A last line with no newline is
read at settle, after the response resolves, so a sink that throws cannot leave the run unsettled.
Since 2026-10-02 a Codex run feeds the same audit: given `onWebSearch`, `CodexCliModel` reads each
stdout line the same way and reports every `web_search` item through `codexWebSearchesFromEvent`.
Only `item.completed` counts, because the started item's query is empty until the search has run
(`ext/web-search/src/tool.rs`). A `search` action is audited once per query in its own
`query`/`queries`, since the item's `query` is only a display detail that keeps the first of several
and elides the rest as ` ...` (`core/src/web_search.rs`, `web_search_action_detail`). A page opened
or searched within, and a CLI that sends no action, are audited by that detail, the URL or pattern
the tool was sent. Since 2026-10-02 a Gemini run also feeds the live activity timeline: given
`onActivity`, `GeminiCliModel` reports each `tool_use` line as it lands through
`geminiActivityReader`, as the `Activity` `StreamingClaudeCliModel` hands the activity map. The
target is read off the call's `parameters` by `stream.ts`'s own field rules
(`activityFromToolCall`), so `run_shell_command`'s `command`, `read_file`'s `file_path` and
`grep_search`'s `pattern` render as a Claude Bash, Read and Grep step do. The reasoning is the
assistant text streamed since the last `tool_result`: `nonInteractiveCli.ts` emits every call of
one model response before any of their results, so calls made together share it as a Claude
message's do. The model is the `init` event's (`config.getModel()`); tokens stay `null`, since no
event before `result` carries usage. Since 2026-10-02 a Codex run feeds the timeline too: given
`onActivity`, `CodexCliModel` reports each tool-call item through `codexActivityReader`, once, on
its first line. A `command_execution`, `file_change` or `mcp_tool_call` is read at `item.started`,
whose target is known before it runs (`event_processor_with_jsonl_output.rs` reuses that id for
the `item.completed`), and a `web_search` at `item.completed`, since its query is empty until it
ran. A patch is a step per file it touches, as a Claude Edit is, and an MCP call is named
`<server>.<tool>`. The reasoning is the `agent_message` text completed since the last tool item
did, the preamble the model writes before acting; a `reasoning` summary is the model's thinking,
which the Claude timeline leaves out too. No event names the model that ran, so a step carries
the requested one, as the envelope's `modelUsed` does, and its tokens stay `null`, since only
`turn.completed` carries usage. The Copilot CLI adapter remains unstarted and, per the
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

**Reachable since 2026-10-03.** Until then `endpoint`, `bedrock` and `vertex` flew nowhere. `fly.ts`
reads a lane's auth from `connection.json` alone, through `readConnectionConfig`
(`apps/dashboard/src/connection/config.ts`), which knew three modes and read any other back as
`subscription`, and `validateConnect` (`connection/service.ts`, behind `POST /api/connection`) stored
`subscription` for them too. Both now take all six modes with their fields. `validateConnect` keeps
only the chosen mode's fields, requires an endpoint's http(s) base URL and a Vertex project, and
refuses a base URL carrying userinfo, a query or a fragment: `describeAuth` names an endpoint by its
URL in the status the dashboard renders, and a credential belongs in the token field, which the
status never returns. The status counts an endpoint ready on its base URL alone, since a local
server takes no token, and Bedrock ready as soon as the CLI is, since its AWS credentials are
ambient. Since 2026-10-03 the connect panel offers all three too (GitHub #21's slice S1). Each
has a fieldset of its own in `shell.ts`'s connect form: the endpoint's base URL (required, `type="url"`)
and optional token, Bedrock's optional AWS region, and Vertex's required project and optional
region. `features/connect.ts` shows only the chosen mode's fieldset and disables the rest, so a
hidden required field never blocks a Save, and it clears a token whose mode is left. The POST body
is `connectRequestBody`'s (`web/connect-panel.ts`): the mode and its own fields only. Before, a
stored endpoint, Bedrock or Vertex mode left the select blank, and a Save then posted an empty mode
that `validateConnect` refused. The fields are not filled back in from the stored config, since the
status DTO carries only the mode's description.

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
Since 2026-10-04 the fleet report keeps it unknown as well. The metrics column stores a null cost as
0, so `dashboard:fleet-report` priced every Codex or Gemini ship at $0.00, and a mixed round's cost
per ship fell with each one (one $2.00 Claude ship beside two Codex ships read $0.67).
`readReportFirings` (`read/fleet-report-source.ts`) now reads the firing record's own `costUsd`, a
null one as unpriced, and `summarizeFirings` (`read/fleet-report.ts`) prices a group by its priced
firings alone, prints `-` for a group with none, and counts the rest (`unpriced 2`). The round
evaluation's commit header calls a round whose ships carry no price `unpriced`, not shipless. Until a
later 2026-10-04 commit the dashboard's flight log still read such a firing as free: its cost chip
printed the metrics column's `$0.00`. A flight-log row now carries `costUnpriced` (`FlightEntry`,
read by `read/source.ts`'s `recordsNoPrice`, the reading the report uses), and the chip of a flat
row or a slice group's member reads `unpriced`, its label `cost: unpriced, no price was reported`
(`flightCostAgoMeta`, `web/flight-log-rows.ts`). Until a later 2026-10-04 commit THE BENCHMARK, the
page built to compare providers side by side, read it as free as well: `readBenchmarkFirings`
(`read/benchmark.ts`) took the metrics column's cost, so a Codex model's leaderboard row read $0.00
per ship and its bubble sat at the cheap edge of the cost-against-quality chart. It now reads the
record through the same `recordsNoPrice`, and `summarizeModels` prices a model by its priced firings
alone, as the fleet report prices a group: `costUsd` is `null` when none was priced, `unpriced`
counts the rest, and `costPerShipUsd` divides by priced ships only. The page's leaderboard then
reads `unpriced` in its cost-per-ship and spent columns, such a model has no bubble, and the
every-firing chart leaves out a firing with no cost and says how many it left out
(`benchmark-page.ts`). Until a later 2026-10-04 commit the project card's `cost-spike` anomaly
averaged such firings in as well: three Codex firings beside five $1.00 Claude ones made a $2.00
Claude firing read as a spike. `costSpike` (`read/anomalies.ts`) now builds its baseline from the
five priced firings before the latest, reaching past the unpriced ones, and its evidence says how
many it left out (`average of the last 5 priced firings (2 unpriced left out)`). Until a later
2026-10-04 commit the landing card's FLIGHT DEBRIEF summed them as free too: its spend chip added
each firing's metrics column, so one $2.00 Claude ship beside two Codex ships read `$2.00`.
`flightDebriefOf` (`web/flight-debrief.ts`) now reads the flight-log entry's `costUnpriced`, counts
such a firing in `unpriced` and leaves it out of the total, the best and the worst, and
`flightDebriefChipItems` names them beside the priced total (`$2.00 + 2 unpriced`), or alone when
none was priced (`2 unpriced`), its tip saying a Codex or Gemini run reports no price. Until a later
2026-10-04 commit the WARM SESSIONS panel, epic 0009's resumed-against-cold comparison, averaged them
in as free too: one resumed $3.00 Claude firing beside one resumed Codex firing read a $1.50 resumed
average, so resume looked cheaper than it was. `warmSessionSavings` and `extendedFiringSavings`
(`packages/store/src/warm-sessions.ts`) now average cost over a group's priced firings alone
(`PRICED_METRICS_SQL`: a firing whose record says `costUsd: null` has no `known_cost`, by the
`recordsNoPrice` rule), its tokens and turns still counted, and a group with no priced firing has no
cost average, so its cost tiles read `—`. Until a later 2026-10-04 commit the fleet's `cost / shipped`
tile and the What's new page's cost per shipped divided by every ship too, so one $2.00 Claude ship
beside two Codex ships read $0.67. `firingStats` (`packages/store/src/read.ts`) now counts
`pricedShipped`, the ships whose record carries a price (`UNPRICED_FIRING_SQL`, the predicate the
warm-sessions averages read), `buildFleetView` (`read/fleet.ts`) and `readRoundInfo`
(`read/project-detail.ts`) divide by it, a fleet with no priced ship reads `—`, and the tile's tip
and label name the ships left out (`2 unpriced left out, no price was reported`). Until a
2026-10-05 commit the What's new page's round tile still named none of them, and read `unknown`
when no ship was priced, as for a round with no ships; `readRoundInfo` now counts them in
`unpricedShipped`, and the tile (`web/whats-new.ts`) names them under its figure (`2 unpriced left
out, no price was reported`) and reads `unpriced` when none was priced. Until a later
2026-10-04 commit THE PROMPT-VERSION GATE did the same: `aggregateEvalRows`
(`packages/store/src/eval-gate.ts`) left an unpriced firing's cost out of the total but divided it
by every ship, so one $2.00 Claude ship beside two Codex ships read $0.67 per solve, and a costlier
prompt could pass `evaluatePromptVersionGate`'s cost-per-solved check. `evalRegressionByPickSource`
read the metrics column, counting such a firing as $0 in its variance too. Both now divide by the
priced ships alone (`costPerSolvedOf`), the pick-source query reads a firing whose record says
`costUsd: null` as NULL (`UNPRICED_FIRING_SQL`), and a group with no priced ship has no cost per
solved, so the gate skips that check rather than judge it on a $0. Until a later 2026-10-04 commit
THE MODEL SCOREBOARD, which staffs each tier with a model, did the same: `tierStats`
(`flight/model-scoreboard.ts`) divided an arm's cost by every ship, and a run killed before its
envelope records `costUsd: null`, stored as 0, so two such Opus ships beside two $3.00 ones read
$1.50 per ship and could win Opus a tier on cost. `readRoutedFirings` now reads such a firing's cost
as NULL (`UNPRICED_FIRING_SQL`), `ArmStats.pricedShipped` counts the ships whose cost is known,
`leaderOf` divides by them, so an arm with none never leads on cost, the printed scoreboard names
the ships it left out (`per ship $3.00 (2 unpriced left out)`, or `unpriced`), and the benchmark
page's tier arms divide the same way (`scoreboardTiers`). Until a later 2026-10-04 commit the Tasks
card's QUEUE FORECAST averaged them in as free too: a $2.00 Claude firing beside a Codex one read
$1.00 per firing, so the open queue looked half as costly to drain. `queueForecastMeta`
(`web/task-queue.ts`) now reads the flight-log entry's `costUnpriced`, still counts such a firing
toward the completion pace, and averages cost over the priced firings alone; its tip names the ones
it left out (`2 unpriced left out, no price was reported`), and a window with none priced
reads `cost unpriced`, never `~$0.00`. Until a later 2026-10-04 commit the fly bar's TOTAL progress
bar paced its total-spend ETA the same way: a lane's spend divided by every firing it landed, so
two unpriced firings beside one $2.00 Claude firing read $0.67 per firing, and the $8 left of a $10
total looked like 12 more firings, not 4. `flightProgressOf` (`web/flight-progress.ts`) now reads
the flight-log entry's `costUnpriced`, averages cost over the priced firings alone, still counts an
unpriced firing's duration, and shows no ETA until a firing reports a price. Until a later
2026-10-04 commit the project page's METRICS panel captioned such a firing `$0.00` too: the cost
sparkline's bar and the flight timeline strip's segment said so in their tips and labels, and the
sparkline's label gave a total with no word of the firings it could not price. `costSparkline` and
`flightTimelineStrip` (`web/features/metrics.ts`) now read the flight-log entry's `costUnpriced`,
caption such a firing `unpriced`, and the sparkline's label names them (`total $2.00, 1 unpriced
left out`). Until a 2026-10-05 commit the fleet-wide cost tile's sparkline read it as `$0.00`
too; `fleetCostSpark` (`shell.ts`) now reads `costUnpriced` the same way (`total $0.40, 1 unpriced
left out`). Until a later 2026-10-05 commit the Tasks card's TASK BURN chip summed such a firing in
as free too: two Codex slices beside one $2.00 Claude slice read `3 slices · $2.00`, and a task
flown on Codex alone read `$0.00`. `taskBurnOf` (`web/flight-metrics.ts`) now counts it in
`unpriced`, still a slice with its wall time, and `taskBurnLabel` (`web/task-queue.ts`) names them
beside the priced total (`3 slices · $2.00 + 2 unpriced`), or reads `unpriced` when none was priced,
its tip saying no price was reported. Until a later 2026-10-05 commit a task's row detail did the
same in its HISTORY: each firing's line read `$0.00`, and its head summed the task's cost with no
word of them. `taskHistoryOf` (`web/flight-metrics.ts`) now gives such a line a null cost, which
`shell.ts` prints as `unpriced`, counts them in `unpriced`, and the head names them beside the
priced total (`2 firings worked it · $2.00 + 1 unpriced`), or reads `unpriced` when none was
priced. Until a later 2026-10-05 commit the FLIGHT LOG still did the same in two places its
2026-10-04 chip fix missed: a slice group's collapsed head summed its slices' metrics column, so a
Codex slice beside a $0.10 Claude one read a `$0.10` total with no word of it, and an opened row's
detail line printed `$0.00`. `flightGroupSummary` (`web/flight-log-rows.ts`) now counts such a
slice in `unpriced` and leaves it out of the total, `flightGroupHeadMeta` names them beside it in
the head's chip, tip and label (`$0.10 + 1 unpriced`, `total cost: $0.10, 1 unpriced left out`),
or reads `unpriced` when no slice was priced, and `flightDetailLine` reads `costUnpriced` as the
chip does. Until a later 2026-10-05 commit the project page's RECENTLY SHIPPED panel printed such a
ship's cost chip `$0.00` too. `finishedFlightSummaries` (`shared/flight-summary.ts`) now carries the
flight-log entry's `costUnpriced` onto each summary, and `flightSummaryLineMeta`
(`web/flight-summary-panel.ts`) reads it as the flight log's chip does: `unpriced`, its label
`cost: unpriced, no price was reported`, its tip `No price was reported for this firing`. Until a
later 2026-10-05 commit the project ask's LIVE STATE did the same in words: its `Last firings` line,
which the model reads as the freshest telemetry, gave such a firing `$0.00`. `gatherLiveState`
(`read/project-detail.ts`) now reads the flight-log entry's `costUnpriced` and writes `unpriced (no
price reported)` there instead. Until a later 2026-10-05 commit the project page's CURRENT ROUND
panel summed them in as free too: its spend chip read the metrics column's total, so a $2.00 Claude
ship beside two Codex firings read `$2.00`, and a round flown on Codex alone read `$0.00`.
`readRoundInfo` now counts every such firing in the round, shipped or not, in `unpriced`, and
`roundStatItems` (`web/stat-tiles.ts`) names them beside the priced spend (`$2.00 + 2 unpriced`), or
alone when none was priced (`2 unpriced`), its tip saying a Codex or Gemini run reports no price. Since
2026-10-04 the report also compares engines, GitHub #21's per-provider quality telemetry: each
firing's record names the CLI it flew on (`FiringRecord.engine`, from `EngineConfig.engine`, which
`firingConfigForEngine` sets on every lane, Claude's included), and `renderFleetReport` groups the
firings `by engine` before `by model`, so a Codex lane's ship and revert rates read beside Claude's
on the same round. A record written before the field names none and reads `unrecorded`, never Claude.
Until a later 2026-10-04 commit the revert rate was not there to read: each line gave the ship and
death rates only, and a reverted firing showed in the round-wide `by outcome` section alone, though
reverts are what demote a lane off Claude. `summarizeFirings` now counts them (`reverted`), and every
summary line prints the rate between the two (`shipped  50%  reverted  50%  died   0%`). Until a
later 2026-10-04 commit a demotion was missing too: the flight log's `DEMOTED` line was its only
trace, so the report could not say which lane stopped taking work. A demoted lane now writes a
`lane-demoted` event (`laneDemotionOf`, `flight/firing-engine.ts`) naming its lane, engine, model,
the reverts in a row and the firings it flew, and `readReportDemotions` reads it back. The lane rides
the payload since a later 2026-10-04 fix: every lane writes its events under the base project id,
only its firing ids carry `--fleet-N`, so a lane read off the project id named every demoted lane
`base`. The report's `demoted lanes` section, right after `by engine`, lists each one
(`fleet-2 codex (gpt-5-codex)  demoted after 3 firings, 2 reverted in a row`), says `none` when a
lane flew off Claude and kept its work, and is left out of a Claude-only report. Two usage traps, read from the Rust source
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
command-line ceiling) or one starting with `-` reaches the CLI. A Windows trap, fixed 2026-10-01:
npm installs `codex` there as a `codex.cmd` shim, and `execFile` launches no `.cmd` itself (ENOENT,
the same failure `gate.ts`'s `buildInvocation` already routes around), so the adapter could not
start at all on Windows. A bare `codex` now runs through `cmd.exe /c`, attached rather than
detached (the gate's shape), with every prompt on stdin so cmd.exe never parses it. Node quotes
no argument free of whitespace, so a model name or resume id holding cmd.exe syntax (`&`, `|`,
`%`) is refused before the spawn; a refused resume id retries cold, like a stale one. The idle-cap
kill closes our end of the pipes first, as `execFile`'s own timeout kill does, since the node
shim behind cmd.exe outlives the kill and holds them open. `GeminiCliModel` had the same trap
(npm's `gemini.cmd`) and took the same route the same day; see its section below. Since 2026-10-02
cmd.exe is Codex's fallback, not its route: see the guard re-check below.

**Containment guard, re-checked 2026-10-02 against openai/codex `main`:** the CLI now has the tool
hook this epic said it lacked. Lifecycle hooks, `PreToolUse` among them, are a stable feature on by
default (`codex-rs/features/src/lib.rs`, key `hooks`, `default_enabled: true`), and `codex exec`
runs them too (`codex-rs/exec/src/lib.rs` hands its hook-trust flag to the session). The contract is
nearly Claude's own. The hook reads JSON on stdin with `hook_event_name: "PreToolUse"`, `tool_name`
and `tool_input` (`codex-rs/hooks/schema/generated/pre-tool-use.command.input.schema.json`). A shell
call, plain or unified `exec_command`, is named `Bash` with `tool_input.command`, and a file edit is
`apply_patch` with the whole patch as its `command` (`codex-rs/core/src/tools/hook_names.rs`, which
also lets a matcher name it `Write` or `Edit`). A deny is Claude's own `hookSpecificOutput` with
`permissionDecision: "deny"` and `permissionDecisionReason`, or exit 2 with the reason on stderr
(`codex-rs/hooks/src/events/pre_tool_use.rs`, test `permission_decision_deny_blocks_processing`).
A matcher of bare names and `|` is an exact match, anything else an unanchored regex
(`codex-rs/hooks/src/engine/matcher.rs`). A command hook's `timeout` is in seconds, as Claude's is
(`codex-rs/config/src/hook_config.rs`), and `commandWindows` overrides `command` on Windows. So
`guard-hook.js` would judge a Codex `Bash` call as it stands; `apply_patch` needs its file paths read
out of the patch first, the way `gemini-guard.ts` reads Gemini's tool calls.

Hooks load from every config layer, the `-c` session-flags layer included
(`codex-rs/hooks/src/engine/discovery.rs`), but a hook that is not managed runs only once its hash
is trusted or under `--dangerously-bypass-hook-trust` (`codex-rs/utils/cli/src/shared_options.rs`).
The flag would not run a target's own hooks in an untrusted worktree, since a repo's `.codex/` layer
loads only for a trusted project. **Why it took a second slice:** the hook rides argv as an inline
TOML value (`-c hooks.PreToolUse=[{matcher=…,hooks=[{type="command",command=…}]}]`), and on Windows
every argument went through cmd.exe, where the adapter refuses anything outside `CMD_SAFE_ARG`:
quotes, braces, `=` and spaces all are. The file routes do not fit either. `--profile <name>`
layers `$CODEX_HOME/<name>.config.toml`, a file in the operator's own Codex home, and a
`.codex/hooks.json` would sit in the target, inside the agent's reach. Since 2026-10-02 the adapter
has a route past cmd.exe: `resolveNpmShim` (`packages/engine/src/adapters/npm-shim.ts`) finds
`codex.cmd` along PATH as cmd.exe would, each folder in PATHEXT order, and reads the JS entry
npm/cmd-shim's `writeShim_` (`lib/index.js`) wrote into it (`"%_prog%"  "%dp0%\<entry>" %*`).
`CodexCliModel` then runs node on that entry, attached, so argv reaches the CLI as given:
`@openai/codex`'s `bin/codex.js` spawns the native binary with `process.argv.slice(2)` and no shell.
A shim it cannot read that way (node flags, no shebang, a `codex.exe` earlier on PATH) keeps the
cmd.exe route. It walks absolute PATH folders only, where cmd.exe searches `.;%PATH%`
(learn.microsoft.com, `NeedCurrentDirectoryForExePathW`), so a `codex.cmd` planted in the target is
never what that launch runs. Since 2026-10-02 the hook rides that argv: given `guardHookCommand`,
the command `guard.ts`'s `guardHookCommand` builds for Claude and Gemini, `CodexCliModel` passes
`codexGuardArgs`, one `-c` override naming a `Bash` command hook with `GUARD_TIMEOUT_S`, plus
`--dangerously-bypass-hook-trust`. Both are global, so they parse after `exec`
(`codex-rs/utils/cli/src/config_override.rs`, `codex-rs/exec/src/cli.rs` `mark_exec_global_args`).
Codex runs the command through `$SHELL -lc`, or `cmd.exe /C` on Windows
(`codex-rs/hooks/src/engine/command_runner.rs`), the shells its quoting is built for. The payload
needs no translation: `exec_command` hands the hook `{"tool_name":"Bash","tool_input":{"command"}}`
(`codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs`), which `guard-hook.js` judges as
a Claude call, and the Claude deny it prints is a Codex deny. A run left on the cmd.exe fallback is
refused rather than flown without its guard, since the TOML fails `CMD_SAFE_ARG`. The trust bypass
also runs the operator's own untrusted hooks from their Codex home. Since 2026-10-02 the hook
matches `Bash|apply_patch`, so a file patch is judged too. `core/src/tools/handlers/apply_patch.rs`
(`pre_tool_use_payload`) sends it as `{"tool_name":"apply_patch","tool_input":{"command":<patch>}}`,
and the handler takes only that freeform form, so no patch skips the hook. `codex-guard.ts`'s
`codexPatchPaths` reads the files a patch names by the header rules of
`apply-patch/src/streaming_parser.rs`: lines split on `\n`, a header read from the line trimmed
whole by Rust's `str::trim` (NEL included, which JavaScript's `trim` leaves on), but inside an
Update hunk from the line trimmed at its end only, so an indented header there stays a context
line, and `*** Move to: ` read only there. `codexPatchToClaudeHookPayloads` resolves each path
against the payload's `cwd`, the turn cwd the handler resolves it against, so a `../` escape is
judged where it lands, and `guard-hook.js` judges each as a Claude `Write` (Add, Move to) or `Edit`
(Update, Delete). A hook-denied call, read on 2026-10-02, leaves no trace on the `exec --json`
stream. `core/src/tools/registry.rs` returns the block to the model before the handler runs, so no
`command_execution` or `file_change` item ever starts, and `exec/src/event_processor_with_jsonl_output.rs`
drops `HookStarted` and `HookCompleted`. A sync hook's own `systemMessage` rides only on the dropped
`HookCompleted` (`hooks/src/events/pre_tool_use.rs`), and a command hook takes no `env` of its own
(`config/src/hook_config.rs`), while one set on the CLI would reach the agent's shell too.
So the denials come back through argv: `CodexCliModel` makes a deny log for each attempt under the
OS temp directory, outside the target, and appends its path to the guard command as a third
argument. `guard-hook.js` appends every deny it prints there, one decision per line, and after the
run settles `codexGuardDenialsFromLog` reads it into `guardDenials`/`guardDenialDetails`, by
`guardDenialFromText` as Gemini's are, and the log is removed. Still open: `exec_command`'s `workdir`
never reaches the hook, so a command is judged without it.

**Routing, since 2026-10-02:** a flight launched with `AUTOPILOT_ENGINE=codex` flies every firing on
`CodexCliModel`, on the model `AUTOPILOT_ENGINE_MODEL` names
(`apps/dashboard/src/flight/firing-engine.ts`). The model has its own variable because every other
model lever (`AUTOPILOT_MODEL`, the routing tiers, the SOUL pin) names a Claude model, and the
flight's other Claude calls, the commit reviewer and the merge-escalation agent, keep using them. A
codex lane puts its model in every model slot of its firing config, the quota fallback and
resilience's pair included, skips per-task model routing, and runs `guardHookCommand`, the command
the Claude settings file runs, as its guard hook. Its gate-reverted firings demote it after two in a
row. An unknown engine, a missing model or a Claude model refuses the flight instead of flying Claude
unasked. Since 2026-10-03 a dashboard launch meets that refusal before the lane starts: the flight
PREFLIGHT (`flight/preflight.ts`) reads the same `firingEngineFromEnv` as its `engine` check, and
blocks too when the engine's CLI does not answer `--version` on the PATH, since every firing would
die on the missing binary and, committing nothing, never reach the demotion count. Since 2026-10-03
it also asks a Codex CLI whether it is signed in (GitHub #21's "login detection"), through
`codexLoginStatus` (`flight/preflight-facts.ts`). `run_login_status` (`codex-rs/cli/src/login.rs`,
read that day) answers on stderr: exit 0 behind `Logged in using …`, and exit 1 behind either
`Not logged in` or `Error checking login status: …`. Only `Not logged in` counts as signed out,
and the `engine` line becomes a warning naming `codex login`. It warns rather than blocks, since
Codex's own config can route the model to a provider that needs no sign-in, and the preflight
cannot see that. Nothing is asked while `CODEX_API_KEY` is set: `codex exec` signs in with it
(`enable_codex_api_key_env`, `codex-rs/exec/src/lib.rs`), and the status verb never reads it. The
Gemini CLI has no status verb, so since 2026-10-03 a Gemini lane's preflight reads where a headless
run looks, through `geminiAuthProbeFor` (`flight/preflight-facts.ts`). `validateNonInteractiveAuth`
(`packages/cli/src/validateNonInterActiveAuth.ts`, read that day) takes the merged settings'
`security.auth.selectedType`, else what `getAuthTypeFromEnv` (`packages/core/src/core/contentGenerator.ts`)
reads: `GOOGLE_GENAI_USE_GCA` or `GOOGLE_GENAI_USE_VERTEXAI` set to `true`, `GOOGLE_GEMINI_BASE_URL`,
`GEMINI_API_KEY`, or Cloud Shell's or compute ADC's switch. With none it exits
`FATAL_AUTHENTICATION_ERROR` before the first turn. The probe reads the lane's env, the user settings
under `GEMINI_CLI_HOME` or the home folder, the target's `.gemini/settings.json` and a
`GEMINI_CLI_SYSTEM_DEFAULTS_PATH`, and every `.env` `findEnvFile` (`packages/cli/src/config/settings.ts`)
might load into the env, from the target up and then the home folder's. The CLI loads only the first
`.env` it finds, from the lane's worktree up, so counting each can miss an unset method but never
invents one. A settings file `JSON.parse` cannot read (the CLI strips comments first) counts when it
still shows a `selectedType`, and otherwise leaves the answer unknown. Finding none turns the `engine`
line into a warning naming `gemini` and `GEMINI_API_KEY`. It warns rather than blocks, since the lane's
own `.env` walk starts from a worktree the preflight does not walk. A warning shows in `doctor
<folder>` and, since 2026-10-03, on a dashboard launch too: a launch that flies past warnings
names them in its start message (`preflightWarnings`, `flight/preflight.ts`), which the fly bar
shows, as "flying … — 3 firing(s) — preflight warns: engine: …". Before, the Fly button said only
"flying", and a launch reported its preflight only when it was refused. Since 2026-10-03 a fleet
launch's summary names them too, on each started lane's own line ("base: 200 started — 2 task(s)
reserved — preflight warns: engine: …"), which the fly bar shows for a multi-lane launch: a
started flight's result carries its warnings apart from its message (`StartFlightResult.warnings`),
and both the in-process launcher and the CLI's loopback one hand them to `runFleetLaunch`.

Since 2026-10-03 one dashboard launch can choose its engine without the dashboard's env, the
server half of GitHub #21's slice S-last (per-lane pilot selection in the fly bar). A
`POST /api/fly` body's `engine` and `engineModel` ride `StartFlightInput` and are read by
`firingEngineFromRequest` (`flight/firing-engine.ts`), which hands the pair to `firingEngineFromEnv`.
So a chosen engine meets every refusal above, in `FlightRunner.start()`, before the preflight runs.
It also refuses a model with no engine, which it would otherwise drop unread, and a model name over
128 characters or outside `[A-Za-z0-9._:/@-]`, since the name rides an adapter's argv. The route
then reaches the preflight, whose `engine` check reads it as the child's env would, and the spawn,
where `firingEngineEnv` sets `AUTOPILOT_ENGINE` and `AUTOPILOT_ENGINE_MODEL` over the inherited
ones. A Claude choice is written out as `AUTOPILOT_ENGINE=claude`, so it beats an inherited engine.
A launch that chose none passes nothing, and the child inherits the dashboard's env as before.
Since 2026-10-03 the fly bar offers the choice too (the UI half): an **Engine** select in its launch
settings (`fly-engine` in `shell.ts`: default, Claude Code, Codex, Gemini) and, while Codex or
Gemini is chosen, an **Engine model** field. `features/fly.ts` sends `engine` only when one is
chosen, and `engineModel` only beside Codex or Gemini, so a default launch's body is the one it
always was and a Claude choice carries no model it would never read. An empty model is refused in
the bar, the field focused, before any request. The choice is remembered with the folder, as its
budget is (`FlySettings` in `web/flights.ts`), and restored whenever that folder is picked again, so
Resume relaunches a paused folder on the engine it last flew, and one saved without an engine on
the default, never on what another launch left in the select. Since 2026-10-03 a multi-lane launch
takes the choice too: `POST /api/fleet` reads `engine` and `engineModel` through the same
`firingEngineFromRequest`, once, so a choice no lane could fly is a 400 with its reason before the
first lane starts, and `runFleetLaunch` (`flight/fleet-launch.ts`) puts the parse's reading on every
lane's `POST /api/fly` body, where each lane's `start()` and preflight judge it again. The fleet's
summary line names the engine. The bar no longer refuses an engine with Lanes above 1: it sends the
choice on the fleet body, and shows the server's reason when the launch is refused. A lane the
preflight refuses (the engine's CLI missing from the PATH) now says why in the bar's summary, since
the in-process fleet launcher forwards the dashboard's message as the CLI's loopback one does.
Since 2026-10-03 one fleet's lanes can fly different CLIs, the server half of S-last's heterogeneous
lanes: `POST /api/fleet` takes `laneEngines`, one `{ engine, engineModel }` per lane in roster order
(base, fleet-2, …). `fleetLaneEnginesFromRequest` (`flight/fleet-launch.ts`) reads each entry as
`firingEngineFromRequest` reads a single launch's pair, so one lane no CLI could fly refuses the
whole fleet, naming that lane, before the first starts. An entry naming no engine, and every lane
past the list's end, flies on the launch's own `engine`, and a list longer than the fleet is refused
rather than dropped unread. The summary then says "engine per lane", and each lane's line names
its own ("fleet-2 on gemini (gemini-2.5-pro): 200 started — …"). Since 2026-10-03 the fly bar
offers that choice (the UI half): with Lanes above 1, an **Engine per lane** fieldset holds one
select per lane in roster order (`fly-lane-engine-<i>` in `features/fly.ts`, labelled "Lane base",
"Lane fleet-2", …), each on "same as Engine" by default, and a model field beside a Codex or Gemini
lane. A launch sends `laneEngines` only when a lane names its own engine, `{}` for each lane left on
the Engine above, so a fleet that chose none sends the body it always did. A Codex or Gemini lane
with no model is refused in the bar, its field focused, before any request. The choice is remembered
with the folder, so a fleet's Resume flies each lane on the engine it last flew.
Since 2026-10-03 the bar also shows which engine each running flight is on: `FlightStatus` carries
the launch's `engine` and, beside Codex or Gemini, its `engineModel` (`flight/runner.ts`), and the
flight's row reads "Flying … — 3 firing(s) · Codex (gpt-5-codex)" (`flightRowEngineModelSuffix`,
`flightRowEngineSuffix` for a Claude choice). A fleet flying several CLIs at once can be read at a
glance. A launch that chose no engine flies on the dashboard's env, and since 2026-10-03 its row
names that engine too: `FlightRunnerDeps.inheritedEngine` reads the dashboard's own
`AUTOPILOT_ENGINE` through `firingEngineRequestFromEnv` (`server/main.ts`), for the status only, so
the child and the preflight still get no engine of their own. Unset, the row names none, as before.
Since 2026-10-03 a Claude flight's row also names the backend its CLI is routed to, GitHub #21
slice S1's provider chip: "· Claude Code (Amazon Bedrock)", or an endpoint by its host, "· Claude
Code (localhost:11434)". `FlightRunnerDeps.claudeBackend` reads `connection.json` at launch, as the
child reads it at its start, through `claudeBackendOf` (`connection/config.ts`), which judges it as
`resolveClaudeEnv` routes it: an endpoint needs its base URL and Vertex its project, or the CLI flies
Anthropic's own API and the row names no backend. `FlightStatus` carries `backend` and an endpoint's
`backendHost`, the URL's host alone, never userinfo, a path or a query a hand-edited file could
carry. A Codex or Gemini lane names none, since it never reads the file. Since 2026-10-04 the live
lane cards name it too, the rest of slice S1's "provider chip in the fly bar + lane cards": each card
carries a chip with its lane's CLI and, for Claude, its backend ("Claude Code (Amazon Bedrock)",
"Codex"), a Codex or Gemini model being the model chip's beside it. The cards are built from the
store, which knows nothing of the registry, so `withLaneEngines` (`read/lane-engines.ts`) merges each
running flight's engine and backend into its project's card as `laneEngines`, in `server/main.ts`'s
`readState`, keyed as `firingIdOf` keys the lane's firing ids (`<project>--<instanceId>`, or the bare
project for the base flight). A lane whose flight names no engine shows no chip, as its row names none.
Since 2026-10-03 a flight the watchdog starts on its own flies on the watch's own
engine. A single-folder `watch` always did, since its flight is a child that inherits the watch's
env, but a fleet-mode spawn (`createHttpSpawnFlight` in `control/cli.ts`) rides the dashboard's
`POST /api/fly` and flew on the dashboard's env. `watch` now reads `AUTOPILOT_ENGINE` and
`AUTOPILOT_ENGINE_MODEL` once through `firingEngineRequestFromEnv`, judged as the request will be,
and `watchFlyBody` (`control/flight-watchdog.ts`) carries the choice on every spawn's body, through
the same `firingEngineRequestFields` `POST /api/fleet` uses. Unset, a spawn names no engine, as
before. A setting a flight would refuse stops the watch at start (`watch refused: …`) instead of
failing every spawn's request unseen, and the start line names the engine (`watchEngineClause`).

Since 2026-10-02 `AUTOPILOT_ENGINE=gemini` routes a lane to `GeminiCliModel` the same way, with the
same model slots, routing skip and demotion. Since 2026-10-03 it also refuses a model
`resolveModelVendor` places with any publisher but Google, or one served locally: the Gemini CLI
calls Google's API alone, so such a model would fail every firing instead of refusing once. Codex
keeps only the Claude refusal, since its own config can point it at other providers, and a name the
vendor table cannot place flies on either engine. A Gemini lane's guard is the `BeforeTool` hook
`buildGeminiFlightSettings` builds: `fly.ts` writes it to a per-instance
`flight-guard-<project>[--<instance>].gemini-settings.json` (`geminiGuardSettingsFileName`, whose
suffix no Claude `--settings` name can share), reads it back through `verifyGuardSettings` as it
does the Claude file, and refuses the flight if it does not match. The lane passes `trustWorkspace`
(`--skip-trust`). gemini-cli registers the merged settings' hooks only in a trusted folder
(`packages/core/src/hooks/hookRegistry.ts`, "Project hooks disabled because the folder is not
trusted"), and `--skip-trust` sets `GEMINI_CLI_TRUST_WORKSPACE=true` (`packages/cli/src/config/config.ts`),
which `checkPathTrust` (`packages/core/src/utils/trust.ts`) takes as trusted before any
`trustedFolders.json` rule, read 2026-10-02. Without it every firing would exit
`FatalUntrustedWorkspaceError`; `claude -p` likewise runs with no trust prompt. An operator env with
`GEMINI_RESTRICTED_MODE=true` or `GEMINI_CLI_TRUST_WORKSPACE=false` wins over the flag, and the run
then exits rather than flying without its hook. The price is the one `trustWorkspace` names: the
target's own `.gemini/settings.json`, `.env` and MCP servers load, though system settings merge last,
so they cannot switch the guard off.

Since 2026-10-03 the same settings file holds a Gemini lane to the flight's turn cap, the number
`--max-turns` gives a Claude firing and the prompt's TURN BUDGET states. Before, nothing did: a
Gemini run stopped only at the wall clock or the idle cap. `buildGeminiFlightSettings` writes the cap
as `model.maxSessionTurns`, the CLI's one turn limit (no flag sets it,
`packages/cli/src/config/config.ts`), and `verifyGuardSettings` reads it back with the hook. Read from
gemini-cli that day: `nonInteractiveCli.ts` counts each model request of a run, restarting for every
run, and past the cap ends it through `handleMaxTurnsExceededError` (`utils/errors.ts`) as a `result`
with `error.type` `FatalTurnLimitedError`, exit 53. `GeminiClient.processTurn` (`core/client.ts`)
counts next-speaker and retry turns as well, so it can stop a run first; the run then writes
`Maximum session turns exceeded` as an error event and ends as a `success`. `parseGeminiStreamJsonOutput`
reads either as `stopReason: 'max_turns'`, so the firing records `maxTurnsHit` and the next prompt
gets the turn-cap death feedback a Claude firing gets. The cap restarts with each run, so until
2026-10-03 a finish-line extension, which resumes the session, got the whole cap, not the smaller
tap `finishLineCaps` asks for. Since then `GeminiCliModel` takes `InvokeCaps.maxTurns`: the run gets
a copy of the guard settings under the OS temp directory with `model.maxSessionTurns` lowered to it
(`geminiSettingsWithTurnCap`, which never raises a lower cap and keeps the hook as written), removed
when the run settles. A copy it cannot make leaves the run on the guard file as given, its hook and
whole cap intact. A Codex lane is held to no turn cap, and cannot be: `codex exec` has no
turn limit, flag or config key, and the request for one
([openai/codex#12336](https://github.com/openai/codex/issues/12336)) was closed as not planned.
Until 2026-10-03 its prompt's TURN BUDGET still promised the flight's cap. Since then `fly.ts` hands
the prompt only the cap the lane's CLI enforces (`firingEngineTurnCap`, `flight/firing-engine.ts`),
so a Codex lane's TURN BUDGET names the wall clock alone ("the harness hard-stops you after 90
minutes of wall clock", `turnBudgetSection` in `packages/engine/src/prompt.ts`), and its flight-log
engine line says only the wall clock and the idle cap stop a firing.

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
That JSON-object parse was retired on 2026-10-01: stream-json writes a fatal error to stdout as its
`result` event, and that event's `stats` already carry the CLI's own totals. A Windows trap, fixed 2026-10-01, the same one Codex had: npm installs `gemini` as a `gemini.cmd`
shim that `execFile` cannot launch (ENOENT), so the adapter could not start on Windows. A bare
`gemini` now runs through `cmd.exe /c`, attached, with every prompt on stdin instead of `--prompt`
(headless mode already triggers on a non-TTY stdin). The model, approval mode and resume id still
ride argv, so any holding cmd.exe syntax is refused before the spawn with the CLI's own
unknown-session exit (42); a refused resume id retries cold. Both adapters share that check as
`gate.ts`'s `CMD_SAFE_ARG`, which admits `_` so `auto_edit` passes. Its idle-cap kill closes our
end of the pipes first, as Codex's does, since the node shim behind cmd.exe outlives the kill.

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
twice" quality gate the roadmap names. Since 2026-10-02 the loop has it
(`demoteAfterGateFailures`, see the acceptance criteria below), and a codex or gemini lane passes it.

**7. A parity matrix in the docs** — the table below. Kept here rather than in a separate file per
the epic-spec convention (`docs/epics/README.md`): one committed spec per epic, not a spec plus a
disconnected reference doc that can drift out of sync with it.

| Adapter | Sessions/resume | Tool use (agentic loop) | Cost reporting | Status |
| --- | --- | --- | --- | --- |
| Claude Code CLI (`ClaudeCliModel`/streaming) | Yes — `--resume`, envelope carries `session_id` | Yes — full loop | Real, from CLI envelope | **Shipped** |
| Ollama (`OllamaModel`) | No | No — single-turn only | Real `$0` (local compute) | **Shipped**, triage-only lane |
| Amazon Bedrock (same `claude` CLI) | Same as Claude CLI (no adapter change) | Same as Claude CLI | Same as Claude CLI | **Shipped** — `auth.ts` `bedrock` mode (`packages/engine/src/auth.ts`); since 2026-10-03 a lane flies on it from `connection.json` (`readConnectionConfig`, `validateConnect`), chosen in the connect panel |
| Google Vertex (same `claude` CLI) | Same as Claude CLI | Same as Claude CLI | Same as Claude CLI | **Shipped** — `auth.ts` `vertex` mode (`packages/engine/src/auth.ts`); since 2026-10-03 a lane flies on it from `connection.json`, chosen in the connect panel, as Bedrock is |
| OpenAI Codex CLI | Yes — `codex exec resume`; `thread.started` carries `thread_id` | Yes — full loop | **None** — token counts only, no price | **Routed** — `CodexCliModel` (`packages/engine/src/adapters/codex-cli.ts`); since 2026-10-02 a lane flies on it under `AUTOPILOT_ENGINE=codex` + `AUTOPILOT_ENGINE_MODEL` (`flight/firing-engine.ts`), or since 2026-10-03 from the fly bar's Engine select for one lane or a whole fleet (`POST /api/fleet`), or lane by lane (Engine per lane, `laneEngines`), demoted after two reverted firings in a row; since 2026-10-02 it runs the containment guard as its `PreToolUse` hook on every shell call and `apply_patch` (`codexGuardArgs`, `codex-guard.ts`, finding 3), and reports the calls it denied from a per-run deny log (`codexGuardDenialsFromLog`) |
| Google Gemini CLI | Yes — `--resume <id>`; JSON output carries `session_id` (upstream gap since closed); a stale id retries cold | Yes — full loop | **None** — token counts only, no price | **Routed** — `GeminiCliModel` (`packages/engine/src/adapters/gemini-cli.ts`); since 2026-10-02 a lane flies on it under `AUTOPILOT_ENGINE=gemini` + `AUTOPILOT_ENGINE_MODEL` (`flight/firing-engine.ts`), or since 2026-10-03 from the fly bar's Engine select for one lane or a whole fleet, or lane by lane, its `BeforeTool` guard written and verified per instance (`geminiGuardSettingsFileName`), the worktree trusted per session, each run held to the flight's turn cap (`model.maxSessionTurns`, since 2026-10-03) and a finish-line extension to its smaller one, demoted after two reverted firings in a row |
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
  needed before Ollama's promotion and reusable for any CLI adapter's lane. **Mechanism shipped
  2026-10-02, not yet switched on:** `runLoop`'s `demoteAfterGateFailures` option
  (`packages/engine/src/loop.ts`) ends the flight `stoppedBy: 'demoted'`, after the demoting
  firing's claim is released, once the gate has reverted that many firings in a row. Only a
  `'reverted'` gate counts. A gate crash (`'unverifiable'`) is no proof the work was bad, and a
  firing with no commit gave the gate nothing to judge, so either starts the count over. The
  flight log says `DEMOTED: …`, and the done line names the requested count it fell short of.
  The option is off by default. **Switched on 2026-10-02 for a codex or gemini lane:** `fly.ts` passes
  `demoteAfterGateFailures: 2` (`NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES`) whenever
  `AUTOPILOT_ENGINE` routes the lane off Claude.
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
