<!-- SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Flight containment — a known security gap

## The finding (2026-07-11)

While validating a flight on a throwaway sandbox placed **under** the AUTOPILOT
repo (`.autopilot-run/sbx`), the flying agent used its `Bash` tool to `cd` **out**
of the sandbox into the parent repository and ran `git add` + `git commit` there.
It "shipped 1/1" — but the commits landed on the **wrong repository**.

No data was lost (the commits happened to capture in-progress work, were reviewed,
and were adopted deliberately), but the behavior is a real **containment breach**:

> A flight is only as confined as the shell and tools it runs. **Bash is not
> jailed** — `cd /somewhere/else && git commit` is not blocked by the default
> permission mode. Claude Code's file tools (Read/Grep/Glob/Write/Edit) were
> assumed to be jailed to the working directory but were not: any absolute
> path, in or out, passed straight through until the guard hook below closed it.

So today a flight can, in principle, read, modify, and commit **anywhere the OS
user can reach** — other repos, the home dir, global config. That is unacceptable
for flying untrusted targets, or on a shared machine, or unattended.

## Mitigation in place (necessary, NOT sufficient)

- **Firing prompt containment** (`firing-v2`): the prompt now names the target path
  and states — as a CRITICAL rule — never to `cd` out of it or touch anything
  outside it. This is a *soft* control: a well-behaved model obeys it; a confused
  or adversarial one can ignore it.
- **Cwd, budget, turn cap, backup-before-work, gate-or-revert** still apply and
  bound the blast radius, but none of them jail Bash.

## Defense in depth

1. **Post-firing containment audit — DONE (`containment.ts`).** The engine snapshots the
   HEAD of every guarded repo (the dashboard cwd when the target is elsewhere) and
   re-checks between every firing + at the end. A moved guarded HEAD ⇒ the flight
   escaped ⇒ it stops, prints the breach, and exits non-zero. This is the detection
   backstop: it can't _prevent_ the first out-of-bounds commit, but it guarantees an
   escape is caught and surfaced, machine-checkably, without trusting the agent.
2. **CLI permission enforcement — DONE (`guard.ts` + `guard-hook.ts`).** Every flight is
   spawned with `--settings` pointing at a generated settings file whose official
   `PreToolUse` hooks pipe each Bash command, and each Read/Grep/Glob/Write/Edit call,
   through a path guard (`node guard-hook.js <target>`): any absolute path outside the
   target, any home-directory reference (`~`, `$HOME`, `%USERPROFILE%` — where
   credentials live), or a bare `cd` is denied with the documented
   `permissionDecision: "deny"` JSON, enforced by the harness — Read/Grep/Glob get an
   additional read-hygiene denial (generated/vendored paths waste context, not a
   security control). The same hook also denies destructive git — force-push,
   `reset --hard`, `rebase`, `branch -D`, checking out/switching to `main`, `clean -f`,
   `filter-branch` — the SOUL's "additive git only" rule, previously prompt-only and
   now enforced here too. CLI-arg scoped — the user's own settings files are never
   touched. Verified against the compiled hook over a real subprocess, including the
   exact observed escape shape.
   _Honest scope:_ a textual guard — it blocks the observed escape class (absolute-path
   `cd` / `git -C` / reads outside) and the named destructive-git shapes, but cannot
   statically resolve every relative-path dance or git invocation; the detection audit
   (1) remains the backstop.
3. **Process/OS sandbox — platform-gated.** Claude Code's native Bash sandbox runs on
   **macOS, Linux, and WSL2 only — "Native Windows is not supported"** (official
   sandboxing docs). On those platforms it is the end-state; enable it when flights run
   there. On native Windows, layers (1) + (2) are the operative controls.
4. **Worktree isolation — IN PROGRESS (`docs/epics/0004-bash-containment-worktree.md`).**
   The SOTA-MAP A4 fix ladder's next rung: fly from a linked git worktree instead of the
   live checkout, so an escape has physically separate scratch space to land in instead
   of the real tree. Slice 1 (the worktree lifecycle adapter,
   `packages/engine/src/adapters/worktree.ts`) is done and proven in isolation; it is
   not wired into `fly.ts` yet — see the epic for the remaining slices.

With (1) detection + (2) prevention both live, unattended flights on trusted targets
become reasonable; untrusted targets still deserve the OS sandbox (3) on a platform
that has it, or worktree isolation (4) once wired. Keep flagging the posture in release
notes.

## Test-methodology note

Do **not** place a sandbox flight target under the AUTOPILOT repo (or any repo you
care about). Use a temp dir well outside the tree, so an escape has nothing valuable
adjacent to reach.
