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
   `PreToolUse` hooks pipe each Bash or PowerShell command, each
   Read/Grep/Glob/Write/Edit/NotebookEdit call, and each WebFetch URL through a path
   guard (`node guard-hook.js <target>`): any absolute path outside the target, any home-directory reference (`~`, `$HOME`, `%USERPROFILE%`, PowerShell's
   `$env:USERPROFILE`, and the `$USERPROFILE`/`$APPDATA`/`$LOCALAPPDATA` Git Bash inherits
   from Windows — where credentials live), any system-temp reference (`$TMPDIR`, `$TEMP`,
   `$TMP`, `%TEMP%`, `$env:TEMP` — outside every target; scratch goes in the git-ignored
   `.tmp-autopilot/`), a command that lands there without spelling it (a `mktemp` with no
   `-p DIR`, `--tmpdir=DIR` or plain template, PowerShell's `New-TemporaryFile`, .NET's
   `[IO.Path]::GetTempPath()`/`GetTempFileName()`), or a bare `cd` is denied with the documented
   `permissionDecision: "deny"` JSON, enforced by the harness — Read/Grep/Glob get an
   additional read-hygiene denial (generated/vendored paths waste context, not a
   security control), and a WebFetch of a loopback or private-network address, or of a
   host that resolves to one, is denied as SSRF (THREAT-MODEL.md T6). The same hook also denies destructive git — force-push,
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
   collision control detects the overlap at the moment of commit, allowing the firing to
   reshape before ever recording the collision in history (the existing post-ship verify
   in fly.ts stays as the backstop for whatever slips past this gate-layer check). The
   hook also denies a process-kill command (`kill`,
   `taskkill`, `pkill`, `killall`, `Stop-Process`) and a stop or restart of the dashboard,
   because a flight once killed its own dashboard host this way. It denies `git help` and
   `git … --help` too, because on Windows git opens its HTML docs in the operator's own
   browser. The git and kill checks run on each command in a line separately. The line
   is split at every `&`, `|`, `;` and line break, so `&&`, `||`, a backgrounding `&`
   and PowerShell's `&` call operator all start a new command. `git.exe` in any letter
   case counts as git, and `taskkill.exe` counts as a kill command. Before 2026-09-30
   (`ap-muoadbyk-1`), `true & git push --force` and `& git push --force` got through.
   CLI-arg scoped — the user's own settings files are never
   touched. Verified against the compiled hook over a real subprocess, including the
   exact observed escape shape.
   The Gemini CLI adapter (epic 0036) runs the same `guard-hook.js` as its `BeforeTool`
   hook: `buildGeminiFlightSettings` (`gemini-guard.ts`) writes the hook into a settings
   file that `GeminiCliModel`'s `guardSettingsPath` hands the child as
   `GEMINI_CLI_SYSTEM_SETTINGS_PATH`, the scope that outranks user and workspace
   settings. The hook reads each Gemini tool call (`run_shell_command`, the file tools,
   `web_fetch`) as the Claude call it amounts to, runs every check above, and answers in
   Gemini's own `{"decision":"deny"}` shape. Not yet flown: no lane routes to Gemini.
   The Codex CLI adapter runs it too, as its `PreToolUse` hook on every shell call and
   file patch: `CodexCliModel`'s `guardHookCommand` rides argv as a `-c hooks.PreToolUse=…`
   session override (`codexGuardArgs`). Codex hands the hook a shell call as the Claude
   `Bash` payload, so that needs no translation; an `apply_patch` is judged as a Claude
   `Write`/`Edit` of each file the patch names, resolved against the turn's cwd so a `../`
   escape is judged where it lands (`codex-guard.ts`). A Windows run that could only reach
   Codex through cmd.exe is refused rather than flown unguarded. A hook-denied call leaves
   no trace on Codex's own `exec --json` stream, so the denials come back through argv
   instead: `CodexCliModel` names a per-run deny log outside the target as the hook
   command's third argument, `guard-hook.js` appends every deny it prints there, and once
   the run settles `codexGuardDenialsFromLog` reads the log back into `guardDenials` /
   `guardDenialDetails`, the same shape Gemini's are read into, and removes it. Not yet
   flown: no lane routes to Codex.
   _Honest scope:_ a textual guard — it blocks the observed escape class (absolute-path
   `cd` / `git -C` / reads outside) and the named destructive-git shapes, but cannot
   statically resolve every relative-path dance or git invocation; the detection audit
   (1) remains the backstop. One known gap: a call operator in front of a quoted command
   word (`& 'git' push --force`) is still not recognized as git (THREAT-MODEL.md T1).
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

## Documentation reviews

**2026-10-02 review (DOC-FRESHNESS flag against `guard.ts`, merge commit `a2d0725c`):**
The flagged merge "chore: merge fix/mutants-2026-10-01 into autopilot/flight"
refactored the IPv4-mapped IPv6 host checking in `guard.ts` for mutation testing
clarity: a conditional on `mapped !== null && (test1 || test2)` became an early
return on `mapped === null` followed by the tests, with a Stryker disable comment.
This is a code-clarity change with no behavior change to what the guard blocks or
allows, so no claims in this document changed. Re-checked: all described
preventions (absolute paths, home refs, system temp, destructive git, process kill,
etc.) remain enforced by the current code. All claims still accurate.
