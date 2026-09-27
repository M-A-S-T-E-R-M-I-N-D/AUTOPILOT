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
   `filter-branch`, and a `git revert` of anything but a bare `HEAD` (shipped
   2026-09-06, after a live flight's nine-deep revert cascade destroyed
   already-landed work reacting to a stale red-main verdict — see
   `docs/debriefs/2026-09-06-red-main-revert-cascade.md` and THREAT-MODEL.md's T12)
   — the SOUL's "additive git only" rule, previously prompt-only and
   now enforced here too. `git commit --amend` joined that list on 2026-09-24
   (`AMEND_RE`, FAILURE-DOCTRINE row 53): sync-back may already have merged a lane's
   HEAD into the flight branch, so an amended copy merges in beside the original, the
   same change twice with a second task's edit filed under the first task's message. A
   firing makes a new commit instead. It also denies a `git commit` that hand-writes its own
   `Signed-off-by:` trailer (`commitSignoffDenial`, shipped 2026-09-05) — `git commit -s`
   derives that trailer from the repository identity, and a hand-typed one can name
   whichever address the agent sees in context, which has published a personal email
   into a DCO trailer before. At every `git commit` the hook also re-reads sibling
   lanes (`adapters/sibling-commit-scan.ts`), because the FLEET digest in the firing's
   prompt is already stale by then: it refuses a staged file a sibling's live
   `.autopilot-intent` names (`checkPreCommitSiblingOverlap`) and, since 2026-09-25
   (FAILURE-DOCTRINE row 61), a file the commit adds that a sibling is creating too,
   untracked or staged in its worktree or committed on its lane but not yet synced
   (`checkPreCommitSiblingNewFiles`). Two lanes adding one file is a certain add/add
   conflict: the second sync-back aborts and strands that lane's later commits. This
   is collision control, not containment; it rides the same hook because the commit is
   the last moment to catch it. CLI-arg scoped — the user's own settings files are never
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
4. **Worktree isolation — SHIPPED (2026-08-13, `docs/epics/0004-bash-containment-worktree.md`,
   all slices landed).** Every flight now flies from a linked git worktree instead of the
   live checkout (`fly.ts` derives the plan via `deriveWorktreePlan` → `ensureWorktree`
   and points `flightRoot` into it), so an escape has physically separate scratch space
   to land in instead of the real tree. Hardened again 2026-09-04: a flown SUBFOLDER of
   a larger repo now scopes `flightRoot` to the nested project's own path
   (`repoPrefixOf`), closing the gate-ran-the-wrong-project harness gap the calculator
   case study exposed.

With (1) detection + (2) prevention + (4) worktree isolation all live, unattended
flights on trusted targets are reasonable; untrusted targets still deserve the OS
sandbox (3) on a platform that has it. Keep flagging the posture in release notes.

## Test-methodology note

Do **not** place a sandbox flight target under the AUTOPILOT repo (or any repo you
care about). Use a temp dir well outside the tree, so an escape has nothing valuable
adjacent to reach.
