# AUTOPILOT Threat Model

> **Living document, localized-maintenance convention** (same split as `docs/MODEL-CARD.md`). **§2–§6 prose changes
> only when the system's actual agent/tool/credential surface changes.** **§3's table is the one section meant to
> regenerate automatically** — run `pnpm threat-model:update` after touching `packages/engine/src/config.ts`'s tool
> grants; never hand-edit between its markers. `pnpm run verify` fails (`ci:threat-model`) if this table is stale.
> See §8 before treating any claim here as independently verified.

## 1. Scope & purpose

AUTOPILOT is an autonomous engineering agent: it spawns the local Claude Code CLI unattended, against a target git
repository, with a broad tool grant (Bash, file edits, network fetch) and the ability to commit. That combination —
autonomy + broad tools + write access to a real repository — is exactly the shape `docs/FLIGHT-CONTAINMENT.md`
documents one real incident against (2026-07-11: a flight `cd`'d out of a nested sandbox and committed to the parent
repo). This document is the wider threat model that incident narrowed attention onto: every agent surface this
codebase runs, every tool each one can reach, every credential the system holds, and — for each — what's mitigated,
what's partial, and what's still open.

**Out of scope:** vulnerabilities in the Claude Code CLI itself, the underlying model's alignment properties, or the
operating system's own security boundaries (file permissions, process isolation) — this document treats those as
external dependencies and states where AUTOPILOT relies on them.

## 2. Agent inventory

Every place this codebase spawns or invokes an LLM process, with its entry point and tool posture.

| Agent | Entry point | Tools | Turn / budget cap |
|---|---|---|---|
| **Main flying agent** — edits/commits to the target repo | `apps/dashboard/src/fly.ts` constructs `StreamingClaudeCliModel`, driven by `packages/engine/src/loop.ts` (`runLoop`) → `packages/engine/src/firing.ts` (`runFiring`), one call per firing; process spawned from `apps/dashboard/src/server/main.ts` (`flyEntry`), launched by `POST /api/fly` (`apps/dashboard/src/server/server.ts`) | Full grant — §3 table | `FLY_MAX_TURNS` / per-firing + total budget (`apps/dashboard/src/flight/budget.ts`) |
| **Post-flight triage** — re-ranks the open task board | `apps/dashboard/src/fly.ts:649-671`, prompt from `apps/dashboard/src/flight/triage.ts` | `allowedTools: []`, `disallowedTools: ['*']` — tool-less | `maxTurns: 2`, `maxBudgetUsd: 0.5` |
| **"Ask your project"** — grounded Q&A over indexed repo content | `apps/dashboard/src/server/main.ts:120-128` (`askEngineConfig`); business logic in `apps/dashboard/src/ask/service.ts` (`askProject`/`askProjectStream`), reachable via `POST /api/ask` and `POST /api/ask/stream` | `allowedTools: []`, `disallowedTools: ['*']` — tool-less | `maxTurns: 2`, `maxBudgetUsd: 0.5` |
| **"Ask your project" — escalated (read-only agentic)** | `packages/engine/src/ask-escalation.ts` (`buildAskEscalationConfig`); business logic in `apps/dashboard/src/ask/service.ts` (`askProjectEscalated`) — reachable via `POST /api/ask`(`/stream`)'s automatic empty-sources trigger (slice 2, `askEscalationDepsFor`, `apps/dashboard/src/server/main.ts`) and, as of `docs/epics/0012-agentic-ask-escalation.md` slice 3, the manual Deep-toggle trigger (the Ask panel's `#ask-deep` checkbox, `apps/dashboard/src/web/shell.ts`, sent as `deep` on the request body — always escalates, regardless of retrieval). While escalated, `askProjectStream`'s live Read/Grep/Glob tool activity relays to the panel over the streaming endpoint's `{activity}` SSE frame (`handleAskStream`, `apps/dashboard/src/server/server.ts`); the non-streaming `/api/ask` endpoint accepts `deep` too but has no live transport to relay activity over | `allowedTools: ['Read', 'Grep', 'Glob']`, `disallowedTools`: every other tool this codebase's config names, listed explicitly — **not** `['*']`, which would blank the allow-list back to nothing under the CLI's documented deny-beats-allow precedence (see `ask-escalation.ts`'s docstring). Guard-settings containment (`buildFlightSettings`) is layered on top, `targetRoot` set to the asked project's `root_path` | `maxTurns: 10`, `maxBudgetUsd: 2` |
| **Auth-verification probe** — confirms the CLI can authenticate | `apps/dashboard/src/connection/verify.ts` (`verifyClaudeAuth`), reachable via `POST /api/connection/test` | Fixed single-turn prompt, no tool grant surface | `--max-turns 1` |
| **MCP control server** — exposes `tasks_list`/`tasks_set_status`/`tasks_create`/`tasks_reorder`/`tasks_delete`/`project_reset` as MCP tools over the store | `packages/mcp/src/control.ts` (`registerControlTools`, `createControlServer`) | N/A — not an LLM caller itself; a *server* an external MCP client could drive | — |
| **Control-tool execute endpoint** — the same six handlers, called in-process (no MCP transport) | `apps/dashboard/src/flight/control-execute.ts` (`createControlExecuteApi`), reachable via `POST /api/control/execute` | The Ask panel's ARCHITECT persona (`ask/architect-proposal.ts`) is now the LLM caller — a parsed proposal is untrusted model output; write/destructive tools require an explicit operator confirm click before this endpoint is ever called (`docs/epics/0011-architect-chat-v2.md` slices 2-3, both shipped) | CSRF-guarded JSON POST + `CONTROL_RATE_LIMIT` (`server.ts`) |

Two more spawned processes are not LLM calls but are automated and touch repo state, included for completeness:
the login launcher (`apps/dashboard/src/connection/login.ts`, opens a terminal for human OAuth) and the CLI presence
probe (`apps/dashboard/src/connection/cli-probe.ts`, `claude --version`).

**MCP control server's transport is still dormant; its handlers are now live in-process.**
`createControlServer`/`registerControlTools` (the MCP `StdioServerTransport`-attachable server) remain exercised
only by `packages/mcp/test/control.test.ts` — no production entry point starts that transport, so an *external* MCP
client still cannot reach this surface. `docs/epics/0011-architect-chat-v2.md` slice 1 has landed, though:
`apps/dashboard/src/server/main.ts` now wires the same six handler functions (`tasksList`/`taskSetStatus`/
`tasksCreate`/`tasksReorder`/`tasksDelete`/`projectReset`) into the dashboard server directly via
`flight/control-execute.ts`'s `createControlExecuteApi`, reachable at `POST /api/control/execute` — a loopback-only,
CSRF-guarded, rate-limited JSON endpoint with the same `isAllowedHost` binding every other write endpoint here has.
Its UI consumer, the Ask panel's ARCHITECT persona toggle and action cards (slices 2-3), has now shipped: an LLM
(ARCHITECT mode) can propose one of these six calls, but write/destructive tools never execute without an explicit
operator confirm click, and every executed call is logged to the visible operator action log (see T9's re-reviewed
row). Absent an ARCHITECT proposal, the same trust boundary T8 documents for `/api/landing/execute` still applies —
anything already reaching the loopback dashboard port can drive this endpoint directly. Re-review triggers again
only if `createControlServer`'s external transport is ever stood up for a client outside this dashboard.

## 3. Tool grant — main flying agent

The main flying agent is the only agent with a non-empty tool grant, so it is the one worth tracking precisely. The
table below is **not hand-maintained** — it is generated from `packages/engine/src/config.ts`'s
`DEFAULT_ALLOWED_TOOLS`/`DEFAULT_DISALLOWED_TOOLS`, the same constants `packages/engine/src/adapters/claude-cli.ts`
(`buildClaudeArgs`) reads to build the real `--allowedTools`/`--disallowedTools` CLI arguments. Regenerate with
`pnpm threat-model:update` whenever the grant changes — a manually-edited table here would silently drift from the
code that governs actual behavior, exactly the failure mode this document exists to prevent.

<!-- TOOLGRANT:TABLE:START -->
_Generated 2026-08-11T00:28:41.246Z by `pnpm threat-model:update` from `packages/engine/src/config.ts` `DEFAULT_ALLOWED_TOOLS` / `DEFAULT_DISALLOWED_TOOLS` — the source the flying agent's CLI invocation actually builds its `--allowedTools`/`--disallowedTools` args from._

| Tool | Grant |
|---|---|
| Bash | ✅ allowed |
| Read | ✅ allowed |
| Write | ✅ allowed |
| Edit | ✅ allowed |
| Glob | ✅ allowed |
| Grep | ✅ allowed |
| WebSearch | ✅ allowed |
| WebFetch | ✅ allowed |
| Agent | ✅ allowed |
| Task | ✅ allowed |
| Workflow | ✅ allowed |
| Skill | ✅ allowed |
| ToolSearch | ✅ allowed |
| TodoWrite | ✅ allowed |
| AskUserQuestion | ⛔ disallowed |
| CronCreate | ⛔ disallowed |
| CronDelete | ⛔ disallowed |
| CronList | ⛔ disallowed |
| ScheduleWakeup | ⛔ disallowed |
| SendMessage | ⛔ disallowed |
| TaskStop | ⛔ disallowed |
| NotebookEdit | ⛔ disallowed |
| EnterWorktree | ⛔ disallowed |
| ExitWorktree | ⛔ disallowed |
<!-- TOOLGRANT:TABLE:END -->

Notable entries:
- **`Bash`** — unrestricted shell access to the target repo's working tree (and, absent the containment guard, to
  anywhere the OS user can reach — §5).
- **`WebSearch`/`WebFetch`** — the flying agent can reach the open internet. `WebFetch` now goes through the guard's
  SSRF target check (§5, T6) — a loopback/private/link-local URL is denied; `WebSearch` takes a query string, not a
  fetchable URL, so it has no analogous target to check and remains unguarded. Neither is subject to a public-domain
  allowlist/denylist.
- **`Agent`/`Task`/`Workflow`/`Skill`/`ToolSearch`** — the flying agent can itself spawn subagents/skills, a
  recursive agent surface. Whether a subagent spawned this way inherits the same `--settings`/`PreToolUse` guard as
  its parent is not established by anything in this codebase — it depends on Claude Code's own subagent hook-
  inheritance behavior, external to this repo. Treat as an open question, not a verified mitigation.
- **`AskUserQuestion`/`SendMessage`/`Cron*`/`ScheduleWakeup`/`TaskStop`** are disallowed — an unattended firing
  cannot block on human input or reach for interactive/scheduling control surfaces mid-firing.

## 4. Assets & credentials inventory

No real secret VALUES are committed anywhere in this repository (enforced by `pnpm ci:secret-scan`, §6). The table
below is the inventory of credential-shaped assets the *system* can hold or reach at runtime.

| Asset | Location | Purpose | At-rest protection |
|---|---|---|---|
| `ANTHROPIC_API_KEY` (opt-in) | Read/stripped in `packages/engine/src/auth.ts` (`resolveClaudeEnv`) | Alternative to subscription auth for the spawned `claude` CLI. Anthropic's documented precedence means a stray ambient key silently overrides subscription login in headless mode — so subscription mode actively `delete`s both credential env vars from the spawned child's env before setting only the active mode's | Never written to disk by this code path; lives in `AuthConfig` in memory only unless persisted via the next row |
| `CLAUDE_CODE_OAUTH_TOKEN` (opt-in) | Same file, same strip/isolate treatment | Headless subscription OAuth (`claude setup-token`) | Same as above |
| Persisted `AuthConfig` (api-key / oauth-token modes only) | `apps/dashboard/src/connection/config.ts` (`writeConnectionConfig`) → `connection.json`, path built in `main.ts` as a sibling of the SQLite DB | On-disk cache of the chosen non-default auth mode so it survives a restart | Written with mode `0o600` + `chmodSync(0o600)` best-effort (POSIX; no-op on Windows — **this repo's own dev environment is win32**, so this protection does not apply there); the file lives under a git-ignored path |
| Claude Code's own OAuth credentials file | Only *checked for existence*, never read, in `apps/dashboard/src/connection/verify.ts` (`credentialsFilePath`) | Confirms subscription login is present | Owned entirely by the Claude Code CLI, outside this repo's control; this is exactly the path the containment guard's `HOME_REF` pattern (`packages/engine/src/guard.ts`) exists to keep the flying agent's own Bash tool away from |
| `OTEL_EXPORTER_OTLP_HEADERS` (opt-in, off by default) | `apps/dashboard/src/flight/otlp.ts` | Free-form header list (e.g. an `Authorization` bearer) sent to an operator-configured OTLP collector | Not persisted by this codebase — read from process env per flight; the collector endpoint itself is untrusted input to the extent an operator misconfigures it |
| Database path / task + telemetry store | `AUTOPILOT_DB` env var, `apps/dashboard/src/read/config.ts`; default `.autopilot/autopilot.db` | Not a secret itself, but sits next to `connection.json` and records full firing history (prompts, costs, outcomes) | Git-ignored (`FLIGHT-CONTAINMENT.md`'s stated convention); no encryption at rest |

CI backstop: `scripts/ci/secret-scan.mjs` pattern-matches every tracked file for AWS keys, GitHub tokens (classic +
fine-grained PAT), Slack tokens/webhooks, Google API keys, Stripe live keys, Anthropic (`sk-ant-`) and OpenAI (`sk-`)
keys, npm tokens, JWTs, PEM private-key blocks, and URL-embedded basic-auth credentials — format-based, not
keyword/entropy heuristics, to keep false positives near zero (`PATTERNS-AND-STANDARDS.md` §2). It fails CI on any
match; it is a detection backstop, not a preventive control — nothing stops a credential from being typed into a
tracked file in the first place except the CI gate catching it before merge.

## 5. Trust boundaries & threat scenarios

| # | Threat | Vector | Mitigation | Residual risk | Status |
|---|---|---|---|---|---|
| T1 | Flying agent escapes the target repo via Bash | `cd`/`git -C`/absolute paths outside the target (the actual 2026-07-11 incident) | Post-firing containment audit (`packages/engine/src/containment.ts`, HEAD-snapshot diff, detection) + CLI-level `PreToolUse` guard denying absolute paths outside target, home-dir references, bare `cd` (`guard.ts` `checkCommandContainment`) | Guard is a textual/pattern check over the command string, not a filesystem sandbox — cannot statically resolve every relative-path or variable-expansion dance; detection audit is the real backstop | **Partial** — detection: done; prevention: done for observed shapes; full sandbox: platform-gated (below) |
| T2 | Flying agent runs destructive git (force-push, `reset --hard`, `rebase`, `branch -D`, checkout `main`, `clean -f`, `filter-branch`) | Any Bash command | CLI-level guard (`guard.ts` `checkDestructiveGit`), strips git global options first so `git -C <path> reset --hard` can't dodge subcommand detection | Fixed enumerated command list — `git commit --amend`, `git reflog expire`, `git gc --prune=now`, `git tag -d` and similar are not checked | **Partial** |
| T3 | Flying agent (or a file-editing tool call) writes/reads outside the target via `Read`/`Grep`/`Glob`/`Write`/`Edit`/`NotebookEdit` | Absolute `file_path`/`path`/`notebook_path` argument outside target | Same `PreToolUse` guard, `evaluateHookInput` covers these matchers too (`guard.ts:309-361`, `buildFlightSettings:400-414`) — previously only Bash was path-checked | Same textual-guard caveat as T1 | **Mitigated** for the observed argument shapes |
| T4 | No OS-level Bash sandbox on the platform this repo actually runs on | Any Bash command, unconditionally | Claude Code's native Bash sandbox is macOS/Linux/WSL2 only per its own docs — **not native Windows** | On native Windows (this repo's dev environment — `Platform: win32`), the guard-hook (T1–T3) and detection audit are the *entire* operative control; there is no process/OS jail underneath them | **Open** on native Windows — documented, not solvable from inside this repo |
| T5 | Flying agent spawns a subagent (`Agent`/`Task`/`Workflow`/`Skill`, all allowed — §3) that doesn't inherit the parent's `--settings` guard | Recursive agent spawn | None specific to this repo — the guard's `PreToolUse` matchers are scoped to `Bash` and the file-edit tool set (§3), not to subagent-spawn tools | Unverified whether Claude Code propagates `--settings` hooks to spawned subagents; if it doesn't, a subagent inherits the parent's tool grant with none of its containment | **Open / unverified** — needs a direct test against Claude Code's own subagent hook-inheritance behavior, not something this codebase controls |
| T6 | Flying agent exfiltrates repo content or fetches malicious content via `WebFetch`/`WebSearch` | Any URL, unrestricted | `WebFetch` now goes through the guard's SSRF check in two layers: `checkWebFetchTarget` (`guard.ts`) denies a loopback (`localhost`/`127.0.0.1`/`[::1]`/`0.0.0.0`), RFC 1918 private, or link-local (`169.254.0.0/16`, including the cloud instance-metadata endpoint) hostname with zero I/O; `checkWebFetchDnsRebinding` (`guard.ts`, wired into `guard-hook.ts` behind `dns.promises.lookup`) then resolves the hostname and denies too if ANY resolved address is loopback/private/link-local, closing the "hostname doesn't name a private address but resolves to one" case this row previously listed as open | Not a true TOCTOU fix: a zero-TTL DNS record could answer with a public address at this check and a private one moments later when Claude Code's own WebFetch implementation performs its own, independent lookup to actually fetch — this guard can't pin that downstream request to the address it resolved. `WebSearch` has no fetchable-URL field and remains unguarded; no allowlist/denylist/logging of *public* fetched URLs | **Partial** — loopback/private/link-local `WebFetch` targets, whether named literally or only reached via a single DNS resolution: mitigated; true TOCTOU/zero-TTL DNS rebinding and `WebSearch`: still open |
| T7 | A credential (API key / OAuth token) leaks into a subprocess env, log, or committed file | Misconfigured env, accidental commit | `resolveClaudeEnv` always strips both credential env vars before setting only the active mode's (never both modes simultaneously); DTOs documented as never returning the value (`connection` service); `secret-scan.mjs` CI gate on tracked files | No secret-scanning of *runtime logs*, stdout/stderr capture (`.autopilot/flight.log`), or the telemetry store itself — only tracked source files are scanned | **Partial** |
| T8 | `POST /api/landing/execute` runs an unreviewed `git merge --no-ff --signoff` on a red gate or against a spoofed base branch | A malicious/malformed request to the loopback dashboard API | Gate-then-merge: `executeLanding` (`packages/engine/src/landing.ts`) refuses to touch git at all when the gate is red; base branch is always resolved server-side (`GitVcs.defaultBranch()`), never trusted from the client; `Content-Type: application/json` CSRF guard + loopback-only binding (`isAllowedHost`, `apps/dashboard/src/server/security.ts`) + separate rate limit (`LANDING_RATE_LIMIT = 5`/window, `server.ts`) | Loopback-only binding assumes the machine itself is trusted — any other local process (or a browser tab, absent the JSON-only CSRF guard) reaching `localhost` at the dashboard port has the same access an operator does | **Mitigated**, contingent on the host machine's own trust boundary |
| T9 | The MCP control server's handlers get wired up without the same review this document gives the flying agent; an LLM (ARCHITECT persona) proposing control-tool calls could get a harmful write/destructive action confirmed | Code change (slices 1-3, all landed) | `docs/epics/0011-architect-chat-v2.md` slices 1-3 — an operator-facing, loopback-only, CSRF-guarded, rate-limited `POST /api/control/execute` (§2, slice 1); the ARCHITECT persona's proposal is untrusted model output parsed by an allowlist regex/JSON parser (`ask/architect-proposal.ts`'s `parseArchitectProposal` — unknown tool or malformed block leaves the prose untouched, never partially executes); args are re-validated server-side at execute time regardless of what the model claimed (`flight/control-execute.ts`'s per-tool `dispatch`); `tasks_list` (safety `read`) auto-runs since it has no side effect, every `write`/`destructive` tool renders an explicit confirm button (`web/features/search.ts`'s `renderProposal`) and nothing executes without that click; every executed call is appended to the visible `operatorActionLog` (attribution, not silence). No external MCP transport exists yet. | The write/destructive gate is a **human-in-the-loop UI control, not a technical guarantee**: a convincingly-framed prompt-injected proposal could still get an inattentive operator to click "Confirm (destructive)" on `tasks_delete`/`project_reset` — same class of risk as any confirm-before-destructive-action UI, not unique to this endpoint. Loopback-only binding still assumes the host machine itself is trusted (same caveat as T8). | **Re-reviewed for slices 2-3 (2026-08-24) — narrowed, not closed.** All three shipped slices match the epic's acceptance criteria (allowlisted tool, server-side re-validation, no auto-write, logged). Re-review triggers again when `createControlServer`'s external MCP transport is ever stood up for a client outside this dashboard (unchanged future trigger) — that remains the one open architecture question, tracked as this epic's explicit Out of scope. |
| T10 | Malformed/adversarial tool-call input crashes or is silently ignored by the guard hook | A crafted tool-call payload the guard's parser can't handle | Documented fail-open: a parse failure returns `null` (allow) rather than crashing every command — "a wedged parser must not brick every command; the detection audit remains the backstop" | An attacker who can reliably trigger the parse-failure path bypasses the guard entirely for that call; only the post-hoc detection audit would catch the resulting HEAD movement | **Open by design** — intentional tradeoff, not an oversight, but worth stating plainly |
| T11 | Flying agent's Bash command spawns a GUI window on the operator's own desktop | `git ... --help`/`-h`/`git help ...` — git's Windows `help.format` default opens the local HTML docs in the operator's default browser instead of a pager in the flight's own terminal (observed 2026-08-27: a lane ran `git revert --help` and popped a browser tab on the operator's desktop mid-flight) | CLI-level guard (`guard.ts` `checkGitHelpEscape`) denies any git invocation carrying `--help`/`-h` or the `help` subcommand, same `PreToolUse` layer as T1/T2 | Fixed enumerated shape (git help only) — another CLI known to pop a GUI/browser on `--help` (or any other side-effecting flag) would not be caught until named and added | **Mitigated** for the observed shape |

## 6. Known gaps (cross-references)

This document narrates threats; it does not re-litigate mitigations already fully written up elsewhere. Read these
alongside it:

- `docs/FLIGHT-CONTAINMENT.md` — the original containment finding (T1) and its defense-in-depth layers, including
  the full honest-scope statement for the CLI guard.
- `docs/adr/0005-defense-in-depth-containment-guards.md` — the architectural decision record for the two-layer
  containment design.
- `docs/adr/0002-subscription-auth-over-api-keys.md` — why subscription-mode auth (no API key by default) was
  chosen, relevant background for §4's credential table.
- `docs/MODEL-CARD.md` §5 — "Limitations & known failure modes," overlapping with T1/T4 from a capability-claim
  angle rather than a threat angle.

## 7. Evidence pointers

| Pointer | Value |
|---|---|
| Tool-grant source of truth | `packages/engine/src/config.ts` — regenerate §3's table with `pnpm threat-model:update` |
| Containment guard source | `packages/engine/src/guard.ts` + `guard-hook.ts` |
| Secret-scan rule count | 13 format-based patterns (`scripts/ci/secret-scan.mjs`), CI-enforced via `pnpm ci:secret-scan` |
| This document last reviewed against the above | 2026-08-11 |

## 8. AI-Use Disclosure

This document was drafted autonomously by AUTOPILOT (model `claude-sonnet-5`) during a single unsupervised firing,
including its own research pass over the codebase (an `Explore` subagent inventoried agents/tools/credentials; every
file:line citation retained here was independently re-verified by direct `Read`/`Grep` against the source before
inclusion — several subagent-reported citations were found incorrect during that pass and corrected or removed
rather than published uncritically). Nothing in this document has been independently reviewed by a human or a party
other than AUTOPILOT itself — same **Available**-only posture as `docs/MODEL-CARD.md` §7 and
`docs/SELF-STUDY/PAPER.md` §2. Treat T5 and T6 in particular as flagged-but-unverified: they name real gaps in this
codebase's own controls, not confirmed exploits.
