<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0009. Real sandbox tier for flights on native Windows — an evaluation

Status: Proposed (🟣 operator decision — this record scores options, it does
not pick one)

## Context

ADR 0005 and `docs/FLIGHT-CONTAINMENT.md` already name the gap plainly: layers
(1) post-firing containment audit and (2) the `guard.ts`/`guard-hook.ts`
textual PreToolUse guard are "the operative controls" on native Windows,
because layer (3) — Claude Code's own OS-level Bash sandbox — only runs on
macOS, Linux, and WSL2. This fleet flies on native Windows (`Platform: win32`
in every firing's environment block), so every flight today runs under (1)+(2)
only: a detection backstop plus a string-pattern denylist over absolute paths,
`cd`, and destructive git. Neither is a real OS-enforced boundary — a guard
that recognizes `cat -v "/etc/passwd"` as an exemption trick, or a path shape
the regex doesn't anticipate, is a gap by construction (`guard.ts`'s own
"Honest scope" comment says so).

This record surveys what a REAL sandbox tier would look like on native
Windows, so the operator has a scored comparison instead of an ad-hoc pick.
Four candidates, each evaluated on three axes: **setup burden** (one-time cost
to stand up, per-fleet-instance cost to run), **claude-login viability** (can
an unattended flight authenticate and run Claude Code's normal
command-execute-observe loop inside it), and **real containment** (what it
adds over the current PreToolUse-hook-only posture).

## The four candidates

### 1. Windows Sandbox

A disposable, per-launch Hyper-V-lite VM, built into Windows Pro/Enterprise
(not available on Windows Home). Since Windows 11 24H2 it ships a native `wsb`
CLI (`wsb start`, `wsb exec`, `wsb share`) intended for scripting.

- **Setup burden**: moderate to stand up (requires Pro/Enterprise, a `.wsb`
  config file, `wsb share` to mount the flight's worktree in) but genuinely
  disposable per flight — no state to reset between runs.
- **claude-login viability**: poor. `wsb exec` is fire-and-forget with **no
  stdout/stderr capture** — a hard blocker for a harness that needs to observe
  the agent's turn-by-turn tool calls, not just fire a command and hope.
  Networking is also difficult to lock down without admin rights (Windows
  Firewall generally can't be configured from inside without elevation), which
  cuts against running flights that need `gh`/npm registry access but nothing
  else.
- **Real containment**: high in principle (separate VM, separate kernel) but
  the I/O-capture gap makes it impractical for THIS harness without a custom
  wrapper (e.g., writing output to a shared folder and polling it) — real
  engineering, not a drop-in.

### 2. Restricted token / AppContainer (in-process Windows primitives)

The approach OpenAI's Codex CLI actually ships as its native Windows backend:
`CreateProcessAsUser` with a token stripped of privileges and augmented with
restricting SIDs, ACL-scoped filesystem boundaries, and a private desktop for
UI isolation — no VM, no container, just OS-level token/ACL restriction of the
same process tree already used today.

- **Setup burden**: no new runtime to install, but real implementation burden
  — this is native Win32 API surface (`CreateRestrictedToken`,
  `CreateProcessAsUser`, ACL manipulation), not an off-the-shelf package for a
  Node-spawned child process. Would need a small native helper (Rust/C++ or a
  well-audited npm binding) added to this repo's own supply chain.
  AppContainer proper was ruled out even by Codex's own team: its default-deny
  filesystem posture assumes a standalone app, not a process that needs to
  read the repo, toolchains, and git config — punching enough holes to make it
  work makes the boundary "meaningless" (their words, cited in the research
  below).
- **claude-login viability**: good — it's still the same Windows desktop
  session, no VM boundary to cross for browser-based OAuth or network egress.
- **Real containment**: a genuine step up from a textual guard (OS-enforced
  ACLs instead of string matching) but documented as **write-scoping, not full
  containment** — a "Configuration-Based Sandbox Escape" is a known attack
  class where writing the CLI's own config from inside the restricted process
  becomes an escape primitive on the next launch. OpenAI's own guidance is to
  prefer WSL2 over this composition when WSL2 is available, because
  Landlock/seccomp/bubblewrap isolate more strongly than restricted-token
  composition on native Windows.

### 3. WSL2

Claude Code's `/sandbox` (bubblewrap for filesystem/mount-namespace isolation,
`socat` for network-proxy routing) is **vendor-supported and already built**
for this exact target — WSL2 is one of the three platforms (with macOS and
Linux) where the real OS-level sandbox ships today. Nothing to build; it's
the same sandbox ADR 0005 already calls "the end-state where the platform
supports it."

- **Setup burden**: lowest of the three real-isolation options. Enable WSL2
  (`wsl --install`), install a distro, `apt install bubblewrap socat` inside
  it. One-time per machine, not per flight. The fleet's own dashboard/engine
  would need to spawn flights' Claude Code processes from inside the WSL2
  distro rather than from PowerShell/Git Bash — a real wiring change to
  `fly.ts`'s spawn path, but no new guard code to write or maintain.
- **claude-login viability**: high — WSL2 is a normal Linux userspace with
  normal network egress; `claude login` / `claude setup-token` behaves exactly
  as it does on native Linux.
- **Real containment**: the actual thing — Linux namespaces enforced by
  bubblewrap, not a Windows-specific approximation. Closes the gap
  `FLIGHT-CONTAINMENT.md` names directly, using Anthropic's own maintained
  code instead of a bespoke guard this fleet has to keep matching against new
  escape shapes.

### 4. Docker (Docker Sandboxes)

Docker's dedicated product for this exact problem: `docker sandbox run claude
.` launches a microVM with its own Docker daemon, workspace-synced at the same
absolute path, with network allow/deny lists. Anthropic's own docs now
reference it directly as a supported sandbox environment. Requires Docker
Desktop 4.58+; cross-platform including Windows.

- **Setup burden**: heaviest — a multi-GB Docker Desktop install, a licensing
  question for organizations above Docker's free-tier thresholds, and a
  microVM spun up per flight. Running several fleet instances concurrently
  (this fleet's own normal operating mode — see the FLEET block every firing
  carries) multiplies that per-flight microVM cost, which is exactly the kind
  of resource contention the MACHINE BUDGET rule already flags for this
  machine (mutation suites are banned for the same reason).
- **claude-login viability**: good — normal container network egress, same
  login flow as any Linux host; credential/session persistence across flights
  needs its own design (mount a credentials volume, or re-auth per flight).
- **Real containment**: the strongest of the four on paper (hard microVM
  boundary, isolated even from the host's own Docker daemon), but the
  heaviest weight for a fleet that already runs multiple concurrent instances
  on one machine.

## Scoring summary

| Option | Setup burden | claude-login viability | Real containment vs current hook |
| --- | --- | --- | --- |
| Windows Sandbox | Moderate (Pro/Enterprise only) | Poor — no I/O capture from `wsb exec` | High in theory, blocked in practice by the I/O gap |
| Restricted token / AppContainer | High (new native helper to build+maintain) | Good | Moderate — write-scoping, not full containment; known escape class |
| **WSL2** | **Low** (one-time OS feature + two packages) | **High** | **Real** — vendor-built OS-level sandbox, not bespoke |
| Docker Sandboxes | High (Desktop install, licensing, per-flight microVM cost) | Good | Highest in isolation, heaviest under this fleet's concurrent-instance load |

## Recommendation (non-binding — operator decides)

WSL2 scores best on all three axes simultaneously: lowest setup burden,
highest claude-login viability, and it is not an approximation of real
containment but the actual vendor-maintained sandbox this project's own docs
already treat as the target end-state. The honest cost is not technical risk
but a workflow change: flights would need to spawn from inside a WSL2
distribution instead of PowerShell/Git Bash, which touches `fly.ts`'s spawn
path and this fleet's own tooling assumptions (paths, `gh` auth, npm/pnpm
under WSL2's filesystem) — real work, but scoped and well-trodden (it is
Anthropic's own documented Windows story, not a novel integration).

Restricted-token composition is the right answer only if WSL2 is somehow
unavailable on the target machine — it is a genuine improvement over the
current textual guard, but a known-incomplete one that Codex's own maintainers
already default away from when WSL2 exists. Windows Sandbox and Docker
Sandboxes are not recommended for THIS harness's per-flight loop: the former
for the I/O-capture gap, the latter for cost multiplying under concurrent
fleet instances rather than because it's technically weaker — it is, on
paper, the strongest boundary of the four.

## Consequences

Positive: the operator gets a scored, sourced comparison instead of picking a
sandbox tier from vibes; whichever tier is chosen, this record is the "why"
a future ADR (or a Superseded-by update to this one) can point back to.

Tradeoff: this is evaluation, not implementation — no containment gap closes
until the operator picks one and a follow-up epic actually wires it in.
Adopting WSL2 as recommended still requires reworking how `fly.ts` spawns a
flight's Claude Code process, which is real, multi-file engineering work, not
a config flag.

## Related

- `docs/FLIGHT-CONTAINMENT.md` — the finding and the current (1)+(2)+(4)
  mitigation layers this record evaluates a real (3) against, for Windows.
- `docs/adr/0005-defense-in-depth-containment-guards.md` — the ADR this one
  extends; that record's own "native Windows has no equivalent yet" line is
  the gap this evaluation addresses.
- `packages/engine/src/guard.ts`, `guard-hook.ts` — the current textual
  PreToolUse guard this evaluation compares each option against.
