<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# Processing `ap-mun9xrap-1`: "firing tools could not run the gate or commit" — does not reproduce, and 47 firing commits since say the same

Board (high): "Harness: firing tools could not run the gate or commit: Bash tool PATH
arrives Windows-form (git/pnpm/node not found) and the PowerShell allowlist covers
only read-only git, so git add, git diff, pnpm…" (title truncated by the board
summary). The id's timestamp half (`mun9xrap`, base-36 milliseconds) decodes to
2026-09-30 01:54:53 +03:00, the same second as `ap-mun9xrba-2`
(see `2026-09-30-verdict-ap-mun9xrba-2-test-impacted-blast-radius-refuted.md`).

The claim has two halves. Each was checked from inside a flight firing
(fleet-5, Claude Code 2.1.281), the same place the report came from.

## Half 1: the Bash tool's PATH

Does not reproduce. The Bash tool's `$PATH` arrived in POSIX form
(`/c/Users/…/bin:/mingw64/bin:/usr/local/bin:/usr/bin:…`), and every tool the
gate needs resolved on it:

| Tool | Resolved at | Version |
| --- | --- | --- |
| `git` | `/mingw64/bin/git` | 2.46.2.windows.1 |
| `pnpm` | `/c/Users/…/AppData/Roaming/npm/pnpm` | 10.33.2 |
| `node` | `/c/nvm4w/nodejs/node` | v22.23.2 |

Nothing in the harness rewrites PATH, so no code change here can explain or
cause a Windows-form PATH:

- `packages/engine/src/auth.ts` `resolveClaudeEnv` copies its base env and only
  deletes or sets the provider credential keys.
- `apps/dashboard/src/flight/spawn-flight.ts` copies `process.env` and adds only
  `AUTOPILOT_FLIGHT`, `AUTOPILOT_FLIGHT_INSTANCE_ID`, `VITEST_MAX_FORKS`,
  `VITEST_MAX_THREADS` and `AUTOPILOT_FLEET_TASK_SCOPE`.

The strongest evidence that the condition passed is the history. Since the
report was filed, **47 commits carrying the `Harness: claude-cli` trailer**
reached `autopilot/flight` or `main`. The first was `9493145b` at 02:16, 21
minutes after the report, and the newest one this lane's HEAD reaches is
`a22d433a` at 14:58 (44 of the 47 are reachable from it). Each one was
a firing that ran git through its tools and committed. Whatever broke PATH at
01:54 lasted one firing, or a few at most. The cause is not established. The
Bash tool's environment comes from Claude Code's own shell setup, not from
this repository.

## Half 2: the PowerShell allowlist

Partly true, and true by design. The flight's tool grant
(`DEFAULT_ALLOWED_TOOLS`, `packages/engine/src/config.ts`) names `Bash` and not
`PowerShell`. A PowerShell command therefore falls through to the operator's
user-level permission rules, which live outside this repository. In this
firing:

- `git diff --stat HEAD~1 HEAD` through PowerShell ran. The report's "git diff"
  no longer holds.
- `pnpm --version` through PowerShell was refused: "requires approval", which a
  headless firing cannot give.

This only blocks a firing when Bash is also broken, because Bash is the granted
shell and the gate and commit both run through it. It matters for one reason:
it leaves no fallback shell if the Half 1 condition ever comes back.

## VERDICT

**Close — does not reproduce.** In this firing the granted shell runs git,
pnpm and node, and 47 firing commits since the report show the same. The
PowerShell refusal is the permission model working as configured, not a defect
in this repository.

One real decision is left, and it is the operator's, not a firing's: **should
the flight grant PowerShell as a second shell?** Adding `'PowerShell'` to
`DEFAULT_ALLOWED_TOOLS` would give a firing a fallback when Bash's PATH breaks.
The guard has covered PowerShell since `6ce7b6ae` (matcher `Bash|PowerShell`,
plus PowerShell's home-directory spellings). But the guard's command checks
were written for Bash text, and granting a second shell widens the flight's
attack surface. That makes it a THREAT-MODEL change, so it goes forward as a
proposal and is not made here.

If the Windows-form PATH comes back, the firing that meets it should record
`echo "$PATH"` and `which git pnpm node` from the Bash tool before anything
else. Without that capture this report could not be traced to a cause.

## Verification note for this firing's own METRICS

This unit is this debrief plus the regenerated `docs/debriefs/README.md` index
(`node scripts/docs/generate-debriefs-index.mjs`). Both are documentation only.
The evidence came from read-only commands: `which`, `--version`, `git diff
--stat` and `git log --grep`, and source reads of the two env-building
modules.
