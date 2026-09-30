<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Deciding `ap-muo2yojl-0`: the flight keeps Bash as its only shell, and PowerShell stays ungranted

Board (medium): "Decide whether the flight grants PowerShell as a fallback shell
(`DEFAULT_ALLOWED_TOOLS`). The guard covers it since `6ce7b6ae`, but its checks
were written for Bash text. This changes THREAT-MODEL T1." The question came out of
`2026-09-30-verdict-ap-mun9xrap-1-firing-tools-not-reproduced.md`, which closed a
"Bash PATH arrives Windows-form" report and left the fallback-shell question open.

## Decision

**Not granted.** `DEFAULT_ALLOWED_TOOLS` keeps `Bash` and does not list
`PowerShell`. This keeps the current state, so THREAT-MODEL T1 needs no new
mitigation, only a note that the question was asked and answered.
`packages/engine/test/config.test.ts` now pins the decision. A change that adds
`'PowerShell'` fails that test and points back to this file.

Granting PowerShell remains open to the operator. The last section lists what
would have to be true first.

## Why: what granting would buy

Very little. The only case for a second shell is a firing whose Bash tool loses
git, pnpm and node. That happened once, at 01:54 on 2026-09-30, and has not
recurred: 47 firing commits followed it (counted in that debrief). This firing's Bash
also resolved `node` v22.23.2 at the first try. A fallback for a condition seen
once, with no captured cause, is a weak reason to widen the only control
Windows has (T4: no OS sandbox on native Windows).

## Why: what granting would cost

`--allowedTools PowerShell` admits every PowerShell command with no approval
prompt. Today a PowerShell call gets through only where the operator's
user-level rules allow it, outside this repository (read-only git, per the
`ap-mun9xrap-1` debrief). With the grant, the guard alone would stand between a
firing and PowerShell. The guard's checks read shell text, and they were written
for Bash text.

Each command below was run through `checkCommandContainment` from
`packages/engine/src/guard.ts` at this lane's HEAD (`0a2aed73`), with the target
root set to this worktree. The probe was
`node --experimental-strip-types .tmp-autopilot/probe.mts`, which imported the
TypeScript source directly.

**Denied, as intended.** These spellings are covered, so the 2026-09-30 hardening
holds:

| PowerShell command | Refused by |
| --- | --- |
| `Get-Content "$env:USERPROFILE\.ssh\id_rsa"` | home-directory reference |
| `Get-ChildItem $home`, `Get-ChildItem ~\.ssh` | home-directory reference |
| `Get-Content C:\Users\operator\notes.txt`, `Set-Location C:\Users` | absolute path outside the target |
| `Stop-Process -Name node`, `kill 1234` | process-kill (suicide guard) |
| `git push --force origin x` | additive git only |
| `Set-Content $env:TEMP\x.txt hi` | system temp directory |

**Allowed, and PowerShell-only.** Bash has no spelling of these:

| PowerShell command | What it reaches | Why the guard misses it |
| --- | --- | --- |
| `Get-ChildItem $env:LOCALAPPDATA` | the user profile's `AppData\Local` | only `USERPROFILE`/`APPDATA`/`HOMEPATH` are listed for `$env:` |
| `Get-Item Env:USERPROFILE` | the home path, through the `Env:` drive | no `$`, so no variable pattern matches |
| `[Environment]::GetFolderPath('UserProfile')`, `[Environment]::GetEnvironmentVariable('USERPROFILE')` | the home path, through .NET | no path or variable text at all |
| `Get-ItemProperty HKCU:\Software\Microsoft`, `Get-ChildItem HKLM:\SOFTWARE` | the registry | `HKCU:\` is not a one-letter drive, so it is not extracted as an absolute path |
| `Set-ItemProperty HKCU:\Software\X -Name y -Value z` | a **write** to the operator's registry | same |
| `Get-ChildItem Cert:\CurrentUser\My` | the user's certificate store, private keys included | same |
| `spps -Name node` | kills a process | `spps` is a built-in alias of `Stop-Process` that the kill pattern does not name |
| `(Get-Process node).Kill()` | kills a process | a method call, not a command word |
| `& git push --force origin x`, `& Stop-Process -Name node` | force-push; kill | the call operator `&` moves the command word off the segment start that the git and kill checks anchor to |
| `iex 'git push --force origin x'` | force-push | quoted text is treated as inert, and `Invoke-Expression` runs it |
| `Start-Process https://example.com`, `Invoke-Item .` | a browser or Explorer window on the operator's desktop | T11's GUI-escape check covers `git help` only |

Some of these widen the attack surface in kind, not only in count. Bash has no
registry and no certificate store, and the guard has never modelled either. The
`&` call operator is ordinary PowerShell, not an obfuscation trick, and it
switches off every check anchored to the command word: destructive git,
`git help`, the kill words, and the commit-time sign-off and sibling scans. Covering every row is a real
engineering unit. It would mean treating PSDrive prefixes as absolute paths,
stripping `&` and `.` before the segment checks, adding an alias table for the kill
words, and blocking the `[Environment]::` special-folder calls. It is not a
one-line allowlist edit.

## Found on the way: gaps in the granted shell

The same probe found holes that exist **today**, with or without PowerShell,
because they sit in Bash or in the shell-agnostic checks. Git Bash on Windows
inherits the Windows environment. This firing's Bash tool lists `USERPROFILE`,
`APPDATA`, `LOCALAPPDATA`, `HOMEPATH` and `HOMEDRIVE` in `env` (names only, no
values printed).

| Bash command | Result | Why |
| --- | --- | --- |
| `cat "$USERPROFILE/.ssh/id_rsa"` | **allowed** | `HOME_REF` has the cmd form `%USERPROFILE%`, not the Bash form `$USERPROFILE` |
| `ls "$APPDATA"`, `ls "$LOCALAPPDATA"` | **allowed** | same |
| `true & git push --force origin x`, `true & kill 1234` | **allowed** | a single `&` (run in background) is a command separator, but `SEGMENT_SPLIT_RE` splits only on `&&`, `\|`, `;` and newlines |
| `git.exe push --force origin x` | **allowed** | the git checks match the command word `git` exactly |
| `bash -c 'git push --force origin x'`, `pwsh -c "…"` | **allowed** | quoted text is treated as inert |
| `ls "$HOMEPATH"` | denied | only by accident: `HOME_REF`'s `\$\{?HOME\}?` has no word boundary, so it matches the `$HOME` prefix |

These are follow-ups, not part of this decision. The first two rows are the most
urgent, because they reach the credential locations T1 exists to protect, in the
shell every firing already holds. They are proposed as separate board tasks.
Each should be fixed test-first against `packages/engine/test/guard.test.ts`.
The rest share the "textual guard" caveat that THREAT-MODEL T1 already states,
and each can be closed the same way.

## What would have to be true to grant PowerShell

1. A reproduced Bash failure. The Windows-form PATH comes back, and the firing
   that meets it records `echo "$PATH"` and `which git pnpm node` first, as the
   `ap-mun9xrap-1` debrief asks. Without a cause, a second shell treats a
   symptom.
2. The PowerShell-only rows above denied by tests in `guard.test.ts`, at minimum
   the registry and certificate drives, the `&` call operator and the kill
   aliases.
3. THREAT-MODEL T1 rewritten to say which shell grants exist and what the guard
   does and does not see in each.

Until all three hold, a firing that finds Bash broken should checkpoint and
report the failure, not look for another shell.
