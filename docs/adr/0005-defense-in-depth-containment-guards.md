<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0005. Defense-in-depth containment guards for flights

Status: Accepted

## Context

On 2026-07-11, while validating a flight against a sandbox placed *under* the
AUTOPILOT repo, the flying agent used its Bash tool to `cd` out of the
sandbox into the parent repository and ran `git add`/`git commit` there —
Claude Code's Bash tool is not jailed to the working directory, and file
tools (Read/Grep/Glob/Write/Edit) passed absolute paths straight through too.
A prompt-only "stay inside the target" rule (firing-v2) is a *soft* control:
it works on a well-behaved model and does nothing against a confused or
adversarial one. No data was lost that time, but a flight could in principle
read, modify, and commit anywhere the OS user can reach.

## Decision

Layer detection **and** prevention rather than relying on either alone:

1. **Post-firing containment audit** (`containment.ts`) — snapshots the HEAD
   of every guarded repo before the run and re-checks between every firing
   and at the end; a moved guarded HEAD means the flight escaped, so it
   stops, prints the breach, and exits non-zero. This is the backstop: it
   can't prevent the first out-of-bounds commit, but it guarantees an escape
   is caught and surfaced without trusting the agent.
2. **CLI permission enforcement** (`guard.ts` + `guard-hook.ts`) — every
   flight is spawned with `--settings` pointing at a generated settings file
   whose `PreToolUse` hooks pipe each Bash call and each
   Read/Grep/Glob/Write/Edit call through a path guard: any absolute path
   outside the target, any home-directory reference, or a bare `cd` is
   denied via the official `permissionDecision: "deny"` response, enforced by
   the harness itself. The same hook denies destructive git (force-push,
   `reset --hard`, `rebase`, `branch -D`, checking out `main`, `clean -f`,
   `filter-branch`) — the SOUL's "additive git only" rule, now enforced
   mechanically instead of prompt-only. Scoped via CLI args only; the user's
   own settings files are never touched.
3. **OS-level Bash sandbox** — Claude Code's native sandbox (macOS/Linux/WSL2
   only) is the end-state where the platform supports it; on native Windows,
   layers (1) and (2) are the operative controls.

## Consequences

Positive: unattended flights on trusted targets become reasonable — an
escape is always caught even where it can't be statically prevented, and
prevention blocks the exact observed escape class plus the named destructive
git shapes.

Tradeoff: the prevention layer is textual/pattern-based, not a formal proof —
it cannot statically resolve every relative-path dance or git invocation, so
the detection audit remains the backstop of record. Untrusted targets still
need the OS sandbox on a platform that has one; native Windows has no
equivalent yet.

## Related

- `docs/FLIGHT-CONTAINMENT.md`
- `docs/PATTERNS-AND-STANDARDS.md` §2 (security & supply chain)
