<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0002. Subscription auth over API keys as the default

Status: Accepted

## Context

AUTOPILOT drives the local `claude` CLI rather than calling the Anthropic API
directly, so it inherits the CLI's own credential model instead of
reimplementing auth. The CLI's `-p`/headless credential precedence is: cloud
provider → `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` →
`CLAUDE_CODE_OAUTH_TOKEN` → subscription `/login`. A stray `ANTHROPIC_API_KEY`
in the environment silently overrides subscription billing with per-token
billing — a footgun if left unhandled. Login itself is interactive-only
(`/login` is a REPL command, unavailable in headless mode); `--bare` skips
OAuth/keychain entirely and therefore can't use a subscription at all.

## Decision

Default AUTOPILOT to the user's own Claude subscription (OAuth/keychain
login) as the billing path, not per-token API keys:

- `ClaudeCliModel` strips a stray `ANTHROPIC_API_KEY` when running in
  subscription mode.
- The engine uses `--print` (not `--bare`), the mode that keeps subscription
  auth usable.
- `claude setup-token` (browser OAuth, prints a 1-year token) is the
  "Log in with Claude" path in the dashboard's connect screen, for when a
  stored login has expired.
- API-key and headless-OAuth-token modes remain supported as explicit,
  user-chosen alternate connection modes — required where interactive login
  doesn't exist (e.g. server-side Cloudflare Containers deployment).

## Consequences

Positive: zero API-key management for the common case, no per-token billing
surprises, reuses a subscription the user already pays for.

Tradeoff: unattended/server deployments need the oauth-token or api-key
connection modes instead of interactive login. The stray-env-var stripping
behavior is load-bearing for the "no surprise billing" guarantee and must not
regress silently.

## Related

- `docs/CLAUDE-CLI-INTEGRATION.md`
- `docs/ECOSYSTEM-RESEARCH.md` §1
- `docs/FEATURE-COVERAGE.md` (auth modes row)
