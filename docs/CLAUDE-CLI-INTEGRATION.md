<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Claude Code CLI integration — auth + headless run (researched)

Findings from the official Claude Code docs (code.claude.com/docs), pinned so the
connection + live-flight code stays grounded. AUTOPILOT drives the **local `claude`
CLI**; it never re-implements Anthropic auth.

## Authentication

- **Login is interactive only.** `/login` is a REPL command — **not available in
  `-p`/headless mode**. There is no programmatic login. First run of `claude` opens
  a browser (localhost OAuth callback, auto-completes); fallback is press `c` to
  copy the URL, or paste a login code (WSL/SSH/containers).
- **`claude setup-token`** runs the same browser OAuth and **prints a 1-year token**
  → set `CLAUDE_CODE_OAUTH_TOKEN`. This is the reliable path when the stored login
  has **expired** (bare `claude` won't auto-renew — you'd type `/login` in the REPL).
  → AUTOPILOT's "Log in with Claude" button launches `claude setup-token` and takes
  the pasted token (oauth-token mode).
- **Credential storage** (the CLI's own): macOS Keychain; Linux
  `~/.claude/.credentials.json` (0600); Windows `%USERPROFILE%\.claude\.credentials.json`
  (or `$CLAUDE_CONFIG_DIR`). → the connect screen's passive "logged in?" heuristic
  checks this file; the **Test connection** button is the definitive check.
- **Precedence** (`-p` mode): cloud provider → `ANTHROPIC_AUTH_TOKEN` →
  `ANTHROPIC_API_KEY` → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` → subscription
  `/login`. A stray `ANTHROPIC_API_KEY` silently overrides the subscription → we
  strip it in subscription mode.
- `claude --version` (presence) · `claude doctor` (deeper install/config check).

## Headless run — what the live flight uses

- `claude -p "<prompt>" --output-format json` → envelope with `result`,
  `total_cost_usd` (+ per-model breakdown), `num_turns`, `duration_ms`, `is_error`,
  `session_id`, `modelUsage` tokens. Matches the engine's `parseModelEnvelope`.
- **Autonomy:** `--permission-mode acceptEdits` (write files + mkdir/touch/mv/cp
  without prompts) or explicit `--allowedTools "Bash,Read,Edit,…"`; `dontAsk` for
  locked-down runs. The engine passes `--allowedTools`/`--disallowedTools`.
- **Live stream (for the activity map, M4):** `--output-format stream-json --verbose
  --include-partial-messages` → NDJSON events: `system/init` (model/tools/mcp/plugins),
  `stream_event` (text deltas = the agent "thinking/doing"), `system/api_retry`
  (`error` ∈ authentication_failed, rate_limit, overloaded, billing_error, …).
- **`--bare`** skips OAuth/keychain → needs `ANTHROPIC_API_KEY`/`apiKeyHelper`, so it
  **can't use a subscription**. AUTOPILOT uses `--print` (not `--bare`) so subscription
  auth works. (`--bare` will become the `-p` default later — revisit then.)
- Long prompts: pipe via stdin (10MB cap). `--append-system-prompt[-file]` to inject
  the SOUL. `--continue`/`--resume <session_id>` for multi-turn.

## Implications for AUTOPILOT

1. **Login** can only be brokered through the CLI → the dashboard button launches
   `claude setup-token` + a paste field; there is no pure-web login.
2. **Live flight**: the engine's `ClaudeCliModel` (`claude --print … --output-format
   json`) is the right driver on subscription auth; add `--permission-mode acceptEdits`
   (or a tuned allow-list) for unattended edits when we wire the real firing prompt.
3. **Activity map** streams from `stream-json` events — the M4 live-stream source.
4. `api_retry` `error: authentication_failed` is the in-run signal to surface "your
   login expired" mid-flight.
