<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# AUTOPILOT — operations runbook

Every failure mode below has actually happened during development and, until now, the recovery
path lived only in operator memory. This is the write-down: what broke, how to tell, how to fix
it without losing data. Cross-referenced from [README.md](README.md).

**Ground truth paths** (all git-ignored, all under the flown workspace):

| Path | What it is |
|---|---|
| `.autopilot/autopilot.db` (+ `-wal` / `-shm`) | The SQLite telemetry store (WAL mode). `AUTOPILOT_DB` overrides. |
| `.autopilot/backups/` | Rotated snapshots (`autopilot-<ISO-stamp>.db`), newest kept, oldest pruned. |
| `.autopilot/engine-<projectId>.lock` | Per-project single-flight instance lock (one flight/loop at a time per project). |
| `.autopilot/flight.log` | A flight's captured stdout+stderr. |
| `.autopilot-run/dashboard.json` | Dashboard control state: `{pid, port, startedAt}`. |
| `.autopilot-run/dashboard.log` | Detached dashboard server's stdout+stderr. |

## 1. Dashboard lifecycle (happy path)

Use the CLI, not raw `node`/`kill` — it owns the state file and does the stale-pid check for you:

| Command | Does |
|---|---|
| `pnpm dashboard:start` / `START-DASHBOARD.cmd` | Build, then spawn the server detached, wait for `/api/health`, open the browser. |
| `pnpm dashboard:status` / `STATUS-DASHBOARD.cmd` | Report `running (pid …) → url` / `stopped` / `stale`, then run `doctor`. |
| `pnpm dashboard:stop` / `STOP-DASHBOARD.cmd` | `SIGTERM` the recorded pid, clear the state file. |
| `pnpm dashboard:restart` / `RESTART-DASHBOARD.cmd` | Rebuild, then stop + start. |
| `pnpm dashboard:doctor` | Node version, server-built, state-dir-writable checks. |
| `pnpm dashboard:ci-status` | Latest `gh run list` result per `.github/workflows/*.yml` file — read-only CI-run babysitting, never retries/cancels. |
| `pnpm dashboard:maintenance-sweep` | One read of the founder's routine sweep: dependabot's open PR backlog, doc-freshness drift, the next release's plan verdict, and the CI-run report together — read-only throughout. |
| `pnpm dashboard:vacuum` | Reclaim the FTS5 `project_search` index's freelist (`VACUUM` + `optimize`) on the SQLite store. Rewrites the whole store file, so run it only when no flight/dashboard is mid-transaction on the same store — never wired into `watch` or any automatic ritual. |

`DashboardControl` (`apps/dashboard/src/control/control.ts`) already self-heals the ordinary case:
`status()` probes the recorded pid with signal `0` (existence check, kills nothing); if the state
file exists but the pid is dead, it classifies as `stale` and deletes the state file on the spot.
**If the dashboard was always started/stopped through this CLI, you never need the manual ritual
below** — `stop` then `start` is enough.

### Reading the live worker card (the narrator line)

The sentence on a flying project's worker card ("Editing a.ts.", "Running the gate:
pnpm test (3 in a row).") is the **narrator**: a deterministic, model-free summary
composed from the firing's most recent activity — no LLM call, so it can never
hallucinate what the agent is doing. What keeps it readable (`shared/narrator.ts`,
board `web-msqgnkdw-s7zlmm`):

- Consecutive same-kind actions collapse into one sentence with a streak count.
- Quoted targets are trimmed to 60 chars, and the finished sentence is hard-capped
  at 90 — a long tool name cannot compose past the card.
- The known noisy shape is summarized: a command looping over several board-task
  ids reads as "Updating N tasks" instead of raw command soup.
- The card clamps the line to two lines with an ellipsis (`.live-worker-narrator`),
  so the narrator never exits its card even for unbroken strings.
- Server and client mirror by construction: both compose through the one shared
  function (embedded into the served bundle via `.toString()`), and
  `narrator-parity.test.ts` pins the two outputs together.

## 2. The stale-4317-server ritual (when the CLI can't see it)

The gap: `DashboardControl` only knows about processes it started itself (tracked in
`.autopilot-run/dashboard.json`). A process that ends up holding port `4317` some other way — a
terminal killed without letting `SIGTERM` reach the child, a second `pnpm dashboard` run in a
plain shell (bypasses the CLI and its state file entirely), a crashed IDE task — is invisible to
`status`/`stop`. `apps/dashboard/src/server/main.ts` registers no `server.on('error', …)` handler,
so the next `start` hits `EADDRINUSE` and **crashes with an uncaught exception** instead of a clean
error message.

**Symptom:** `pnpm dashboard:start` (or the `.cmd`) fails immediately, or the browser opens to a
page that doesn't match the code you just built, or `dashboard:status` says `stopped` but the URL
still answers in another tab.

**Recovery (Windows):**

```bat
netstat -ano | findstr :4317
REM last column is the PID holding the port
taskkill /PID <pid> /F
```

**Recovery (macOS/Linux):**

```bash
lsof -i :4317
kill <pid>          # SIGTERM first
kill -9 <pid>        # only if it ignores SIGTERM
```

Then `pnpm dashboard:start` again. If the port was reassigned on purpose
(`AUTOPILOT_DASHBOARD_PORT`), `findstr`/`lsof` on that port number instead of `4317`.

**Prevention:** always stop through the CLI (`dashboard:stop` / `STOP-DASHBOARD.cmd`), not by
closing the terminal window that launched a foreground `pnpm dashboard` run.

## 3. SQLite store / WAL recovery

The store (`packages/store/src/db.ts`) runs in `journal_mode = WAL` for the writer connection (the
engine) so the dashboard can read concurrently without blocking. That means the live store is
**three files**, not one: `autopilot.db`, `autopilot.db-wal`, `autopilot.db-shm`. Never copy just
the `.db` file by hand — you'll miss uncheckpointed writes sitting in `-wal`.

- **Snapshotting** (`packages/store/src/snapshot.ts`, runs automatically every flight): uses
  SQLite's online backup API (safe against a concurrent writer, unlike a raw file copy), then
  forces `journal_mode = DELETE` on the copy so the snapshot is a genuine single self-contained
  file with no stray `-wal`/`-shm` siblings. Every snapshot is `PRAGMA integrity_check`'d before
  being trusted; a corrupt result is deleted immediately, never left on disk as a silent bad
  backup. Retention: newest `DEFAULT_SNAPSHOT_RETENTION` (10) kept, oldest pruned.
- **Listing/restoring**: `pnpm dashboard:restore` with no args lists what's in `.autopilot/backups`
  (oldest first, with sizes). `pnpm dashboard:restore <name|latest>` integrity-checks the target
  first (refuses a corrupt snapshot outright) and moves the current `autopilot.db` (+ `-wal`/
  `-shm`, best-effort) aside as `*.pre-restore-<stamp>` rather than deleting it — a bad restore is
  itself recoverable.
- **Suspected corruption** (dashboard errors reading telemetry, `doctor` unhappy, a crash mid-write
  that wasn't a clean `SIGTERM`): stop the dashboard and any running flight first (§1/§4), then
  `pnpm dashboard:restore latest`. If you need to inspect rather than restore, open the `.db` file
  read-only (`sqlite3 .autopilot/autopilot.db "PRAGMA integrity_check;"` or the same pragma via
  `better-sqlite3`) — never write to a store you suspect is corrupt.
- **Full reset** (throwing away telemetry on purpose, not recovering from a failure):
  `pnpm dashboard:reset` deletes `autopilot.db`/`-wal`/`-shm` and the demo/sample repos under
  `.autopilot/`, but keeps your saved login. Re-onboard with `pnpm dashboard:fly <folder>`.

## 4. Flight instance lock (stuck "a flight is already running")

`packages/engine/src/adapters/instance-lock.ts` backs a single-flight guard at
`.autopilot/engine-<projectId>.lock` — one lockfile PER PROJECT, independent of the dashboard's
in-memory per-process guard. It's what stops two `pnpm dashboard:fly` invocations against the SAME
project (or a stray terminal run alongside the dashboard) from racing that project's rows and
target repo; flights against two DIFFERENT projects each take their own lock and run concurrently.

- **Self-healing case:** the lock is JSON `{pid, startedAt}`. `acquire()` probes the recorded pid
  with signal `0`; if that process is dead the lock is stale and gets reclaimed automatically on
  the next attempt. You should never need to touch the file by hand.
- **If it's still stuck** (the reported holder pid is alive but you know the flight is dead — e.g.
  the process survived a partial crash): confirm with `tasklist /FI "PID eq <pid>"` (Windows) or
  `ps -p <pid>` (POSIX) that it's truly not a live flight, stop it if it is, then delete the
  matching `.autopilot/engine-<projectId>.lock` by hand. Deleting a lock out from under a genuinely
  running flight will let a second flight start against the same project — only do this once
  you've confirmed the pid is gone or hung.

### Recovery: a flight died without releasing 'flying'

Audit of the full orphan path (what happens when a flight-child or the dashboard server itself
dies mid-flight):

- **Flight-child crashes, dashboard survives (handled):** `fly.ts`'s `finally` block flips the
  project's status off `'flying'` (to `registered` or `paused`) even on a caught crash/SIGTERM, and
  releases the lock above. Nothing gets stuck.
- **Flight-child dies WITHOUT running that `finally`** — SIGKILL, OOM kill, or the host
  itself rebooting — **is the gap this section closes.** The project's status stays `'flying'`
  forever with no check for whether a flight is actually still alive. Two independent mechanisms
  now share the SAME liveness check (`isFlightOwnerAlive()`, `apps/dashboard/src/flight/lock.ts` —
  file exists, pid parses, `isProcessAlive` is true — so "owner alive" can never drift between
  them):
  - `flightWatchdogTick` (`control/flight-watchdog.ts`), wired into the single-target
    `dashboard:watch <folder>` loop: when its one watched folder is `'flying'` with a dead owner, it
    treats the row as abandoned and re-spawns immediately.
  - `reconcileOrphanedFlights` (`control/boot-reconcile.ts`), run once at EVERY dashboard server
    boot (`server/main.ts`) across every project in the store — not just one watched folder. A
    `'flying'` project with a dead owner is flipped back to `'registered'` (the same write `fly.ts`'s
    own `finally` block makes on a clean exit) and logged (`[boot-reconcile] ... reset to
    'registered'`); it does NOT auto-respawn — that's left to the operator or the fleet watchdog's
    own next tick, since a bare server boot isn't the moment to unilaterally decide to spend budget.
  A genuinely alive owner is left completely untouched by both paths. The fleet-wide watchdog tick
  (`fleetFlightWatchdogTick` in `fleet-watchdog.ts`) still doesn't share this reconciliation itself —
  it doesn't need to, since `reconcileOrphanedFlights` already closes the dead-owner gap fleet-wide
  at every boot, upstream of any watchdog tick.
- **Dashboard server itself dies while a detached flight-child keeps running (handled):**
  `flight/spawn-flight.ts` spawns each flight `detached: true` specifically so the flight survives a
  dashboard crash — but `FlightRunnerRegistry` tracks running flights purely in-memory, and every
  dashboard boot wires up a brand-new, empty registry (`flight-api.ts`, `server/main.ts`). Boot now
  closes both halves of this gap: `reconcileOrphanedFlights` finds the still-alive owner, reads its
  pid (`readFlightOwnerPid`, `flight/lock.ts`), and **adopts** it into `flightRegistry`
  (`FlightRunnerRegistry.adopt()`, `flight/registry.ts`, `server/main.ts`) — wrapping the bare pid as
  a `SpawnedFlight` via `flight/adopt.ts`'s `adoptFlight()`. Stop now sends the adopted pid a real
  `SIGTERM` (there's no `ChildProcess` handle for a pid this process didn't spawn, so `kill()` signals
  it directly); status polls `isProcessAlive` on an interval to notice the pid's eventual exit (no
  Node `'exit'` event fires for a pid we didn't spawn). The boot log line changes accordingly:
  `[boot-reconcile] ... is 'flying' with a live owner pid <pid> — adopted so Stop/Pause work against
  it.` A pid that dies in the gap between the reconciliation check and the adopt read is left
  untouched instead (same "left untouched" log line as before) — reconciliation naturally catches it
  as abandoned on the NEXT boot.

## 5. Containment breach (a flight touched something outside its target)

Full writeup: [FLIGHT-CONTAINMENT.md](FLIGHT-CONTAINMENT.md). Short version for the moment it
happens:

1. The post-firing containment audit (`containment.ts`) snapshots every guarded repo's HEAD and
   compares it between firings — a moved HEAD it didn't expect means an escape, and it **stops the
   flight and exits non-zero** rather than continuing. If you see that exit, the flight is already
   halted; you don't need to intervene to stop it further.
2. Diff the guarded repo(s) against their last-known-good SHA (the audit's own failure message
   names it) to see exactly what landed where it shouldn't have.
3. Because containment is additive-only by convention, the unwanted commit(s) are almost always
   still just commits — `git revert` (not `reset --hard`) them in the affected repo, or hand-review
   and keep them if (as in the founding incident) they turn out to be legitimate in-progress work
   that only landed in the wrong place.
4. Confirm the two defense-in-depth layers are actually active before flying again: the CLI
   permission guard (`guard.ts` + `guard-hook.ts`, generated `--settings` passed to every flight)
   and, on macOS/Linux/WSL2, Claude Code's native Bash sandbox — native Windows has no OS-level
   sandbox, so layers (1)+(2) are the only controls there.
5. Never place a sandboxed test target **under** this repo (see FLIGHT-CONTAINMENT.md's
   test-methodology note) — that's how the founding incident happened.

## 6. Model routing (why a firing ran on the model it did)

Not a failure mode — the intended behavior, written down so an unexpected model in the flight log
reads as a decision, not a bug. Since MODEL ROUTING v1 (`apps/dashboard/src/flight/model-routing.ts`),
a firing's PRIMARY model is routed per-task, not pinned flight-wide: before each firing's prompt is
built, the board task that firing is about to claim is classified into a tier, and the loop
(`packages/engine/src/loop.ts`) swaps the resolved model into that one firing's config.

| Tier | Model (default) | A task lands here when… |
|---|---|---|
| escalated | `fable` | its title carries an `EPIC-SPEC:` marker, **or** its trailing slice-streak is ≥ 3 (advancing firing after firing without ever completing — the stuck pattern), **or** its title names `architecture` / `security review` |
| mechanical | `haiku` | its title starts with a self-mined ritual prefix (`DOC-FRESHNESS:` / `CLOSED-TASK AUDIT:`) — cheap re-verification, not net-new reasoning |
| default | `sonnet` | everything else — including firings with no claimed board task (free picks are never routed) |

Escalation wins over mechanical: an EPIC-SPEC'd or stuck task escalates even if its title also
carries a ritual prefix.

**Operator levers** (env, no source edit):

- `AUTOPILOT_MODEL` — flight-wide pin. Always wins outright; routing is a default, not a lock-out.
- `AUTOPILOT_MECHANICAL_MODEL` — the cheap tier's model (default `haiku`; the same variable board
  TRIAGE uses, so the cheap tier is tuned in exactly one place).
- `AUTOPILOT_ESCALATED_MODEL` — the escalated tier's model (default `fable`).

**How to tell it fired:** whenever routing changes a firing's model away from the flight default,
the flight log prints `🧭 model routing: <tier> → <model> — <task title>` right before the firing's
prompt is built. No 🧭 line means the firing ran on the flight-wide default. Model-resilience
fallback (quota exhaustion → fallback model) keys off the per-firing primary, so routed firings
degrade exactly like default ones.

### Substep routing & local offload (the M6 cost lever)

Separate from the per-firing PRIMARY model above, individual tool-less SUBSTEPS route through
their own tier table (`packages/engine/src/routing.ts` — `local` / `cheap` / `top`, defaults
`ollama-local` / `haiku` / `opus`, tunable via `EngineConfig.routing`). Routed call sites today:

| Substep | Tier | What it is |
|---|---|---|
| board TRIAGE | local | post-flight open-task reordering — one cheap, tool-less call (`fly.ts`) |
| ask-your-project | cheap | the dashboard's Q&A endpoints, buffered + streaming (`server/main.ts`) |

Two things deliberately do NOT route: the primary work-unit call (needs full agentic tool use no
single-turn local completion provides — it stays on the per-firing model above), and gate
remediation formatting (model-free by design — `RemediatingGate` runs the deterministic formatter,
cheaper than any tier). An unrecognized substep label always fails SAFE to the top tier, never to
local/cheap.

**Free local offload** (runs TRIAGE on your own GPU instead of cloud quota — nothing leaves the
machine):

1. Run an [Ollama](https://ollama.com) server and pull a small model (e.g. `ollama pull llama3.2`).
2. Set `AUTOPILOT_MECHANICAL_MODEL=ollama-local` — matching `routing.localModel`'s sentinel is the
   opt-in; local-tier substeps now use the local adapter instead of the cloud CLI.
3. Optionally set `AUTOPILOT_OLLAMA_MODEL=<real tag>` (default `llama3.2`) — the sentinel itself is
   never sent to the server — and `AUTOPILOT_OLLAMA_BASE_URL` if Ollama isn't at the default
   `http://127.0.0.1:11434` (e.g. a GPU box on the LAN).

Point `AUTOPILOT_MECHANICAL_MODEL` at any cloud model instead (or leave it unset for `haiku`) and
mechanical substeps stay on the cloud CLI at that model — local offload is opt-in, never a default.

## 7. Self-mined ritual proposals (CLOSED-TASK AUDIT / DOC-FRESHNESS)

Not a failure mode — the intended behavior, written down so a `CLOSED-TASK AUDIT:` or
`DOC-FRESHNESS:` task appearing in your approval queue reads as a decision waiting for you, not as
the autopilot inventing work. Once per flight, after the firings finish, two drift sweeps run.
Neither ever changes anything on its own: each finding becomes a NEW proposal task
(`source: 'self'`, `status: 'needs_approval'`) that sits in the dashboard's approval queue until
you approve or discard it.

**CLOSED-TASK AUDIT** (`apps/dashboard/src/flight/closed-task-audit.ts`) — the VERIFY DIET
false-close class. The ship-time DELIVERABLE verifier only proves a "complete" claim true against
that one commit's patch; code drifts after a task closes, and a later refactor can delete the very
thing the claim pointed at. This sweep re-checks the project's 50 most-recently-closed done tasks
that carry a `DELIVERABLE:` clause against the CURRENT committed tree, and flags two drift classes:

| Finding | What it means |
|---|---|
| deliverable-drift | the clause's keywords vanished from the tree entirely — the shipped thing appears to be gone |
| ux-expression-drift | the keywords survive, but no longer in any `/web/` or `docs/*.md` file — the promised UI/Docs surface was ripped out, leaving only stray backend mentions |

**DOC-FRESHNESS** — a governed epic doc whose subject paths were touched more recently than the
doc itself; the doc may describe code that has since moved on.

**How findings surface:** the flight log prints a `🔍 closed-task drift proposed` /
`📑 doc-freshness drift proposed` line, and the proposal task (`closedaudit-<taskId>` /
`docfresh-<doc>-<timestamp>`) appears in the approval queue. The original done task is NEVER
flipped back to open — reopen = a fresh-id task, and only through your explicit approval
(RESEARCH-LIBRARY doctrine: "reopen = NEW fresh-id task, never a status flip").

**What to do with one:**

- **Approve** it if the drift looks real — it becomes ordinary board work, and a future firing
  re-verifies/repairs the deliverable. Ritual-prefixed tasks route to the cheap mechanical model
  tier automatically (§6).
- **Discard** it if the drift is intentional (e.g. the deliverable was deliberately removed or
  renamed in a later design). The proposal id is keyed on the audited task alone, so a discarded
  or still-pending finding is NOT re-proposed every flight; if the drift is later fixed, the audit
  simply stops finding it.

Both sweeps are best-effort: a crash prints `sweep skipped (best-effort, non-fatal)` in the
flight log and never fails the flight.

## 8. KEEPER review ritual (why a PR was merged, bounced, or held for you)

Not a failure mode — the maintainer-autopilot behavior (epic 0007, PLATFORM 4/7), written down
so a merge or request-changes appearing under your gh identity reads as policy, not surprise.
The project page's KEEPER review panel previews a decision for every open PR on the canonical
repo; nothing executes until you confirm from the panel. Draft PRs never enter the sweep at
all: a draft is its author's explicit not-ready signal, so the ritual posts no verdict on it —
not even a comment — and it simply doesn't appear in the panel until marked ready for review.

**The decision policy** (`apps/dashboard/src/flight/pr-review.ts`) judges only gh-reported
facts — gate status, conflict state, touched paths. The PR's title and description are never
inputs: a misleading description cannot talk its way past the ritual. Checks run in this order:

| Check (in order) | Decision |
|---|---|
| Touches a security-sensitive path (guard/containment/auth/CSP surfaces, CI workflow config, `CODEOWNERS`/branch-protection, the credential-persisting `connection/` module, the CSRF/rate-limit `server/` module, the `landing/`, `release/`, and `control/` execute surfaces, or this ritual's own decision/execute files) | queue-for-human — NEVER auto-merged, no matter how green the gate; always waits for MASTERMIND's eyes |
| Renames a file OUT of a security-sensitive path (the fetched diff's `rename from` headers — gh's files list reports only a rename's NEW name) | queue-for-human — the path sweep completed; a guarded file's relocation gets no automated verdict any more than an in-place edit would |
| gh's files report was unreadable (not a list of named paths) | queue-for-human — the path sweep judged only what it could read and cannot claim to have checked every touched path; an unreadably-swept PR might be security-touching |
| gh's changed-files total exceeds the paths it enumerated (`gh pr list` caps the files list at 100 entries) | queue-for-human — an incomplete security sweep fails closed; a wide PR could hide a sensitive file past position 100 |
| Authored by the same GitHub identity this ritual reviews under | queue-for-human — GitHub refuses self-approval and self-request-changes (HTTP 422), so no other verdict could even be posted |
| Touches zero files | request-changes — an empty diff merges nothing, so no gate result can carry it |
| Diff carries binary content (when assessed) | queue-for-human — byte-review cannot read a binary payload, so no automated verdict is honest on it |
| Diff already present in the current tree (reverse-applies cleanly, when assessed — and only on a tree confirmed to stand in for the base: clean on tracked paths, and its history not already containing the PR's own head, so a PR you `gh pr checkout`ed locally never reads as "already fixed") | request-changes — merging adds nothing; likely already fixed elsewhere, rebase or close |
| No gating check reported on the head at all (an empty rollup, or only "(optional)" checks) | queue-for-human — no gate verdict exists to judge, and nothing may be running: CI triggers only for PRs into `main`, a fork's first workflow run waits on your approval, and optional checks never gate; none of that is the author's to fix, so the reasoning names those possibilities instead of claiming "still running", and the next pass re-judges once a gating check reports |
| Gate failed or still running (a gating check exists but has not concluded green) | request-changes — an agent's judgment never substitutes for the gate |
| Merge conflicts against the base branch | request-changes — nothing in this ritual resolves conflicts; when a local `git apply --check` can name the conflicting file(s), the posted reasoning names them (an uncomputed merge state says "not computed yet" instead of claiming conflicts nobody verified) |
| Branch is behind the base (`mergeStateStatus: BEHIND`) | request-changes — its green gate was computed against a base that has since moved, and strict branch protection would refuse the merge after the approve posted; update the branch so CI re-runs |
| Carries a human-applied hold label (`do-not-merge`, `hold`, `blocked`, `wip`, `work-in-progress`) | queue-for-human — a maintainer's explicit "not ready" signal, the same convention the draft exclusion honors; remove the label to let a later pass reconsider |
| gh's label report was unreadable (not a list of named labels) | queue-for-human — the hold sweep never ran, so a human's standing `do-not-merge` could be invisible; an unassessed fact fails closed |
| Standing `CHANGES_REQUESTED` review from a reviewer other than this ritual | queue-for-human — a human's explicit "not yet" outranks a green gate; the ritual's own stale reviews are excluded so it never stalls on itself. A comment-only follow-up from that reviewer does not clear it (GitHub keeps the request standing until they approve or it is dismissed), so the ritual reads the full review history by `submittedAt`, not just each reviewer's latest review, to see through that mask |
| Standing `CHANGES_REQUESTED` review whose reviewer could not be checked (the `gh api user` viewer lookup failed) | queue-for-human — nobody can say whether that review is a human's "not yet" or this ritual's own stale one; the next pass re-checks with a fresh lookup |
| gh's latest-reviews report was unreadable (not a list of reviews with readable states) | queue-for-human — the changes-requested sweep never ran, so a human's standing "not yet" could be invisible; fails closed like the label report |
| Targets a branch other than the canonical `main` | queue-for-human — epic 0007's "one canonical main" invariant; a squash-merge into any other branch is never automated |
| Diff never fetched, so the rename sweep above never ran | queue-for-human — a merge asserts a COMPLETE security sweep, and the diff's `rename from` headers are the only place a move out of a guarded path shows; the next pass re-fetches |
| gh reported no usable changed-line size (additions/deletions absent, negative, or fractional) | queue-for-human — a merge claims the diff was byte-reviewed within the size cap, so the size must be confirmed, never assumed to be 0 |
| Changed lines (additions + deletions) exceed 1000 | queue-for-human — an auto-merge implicitly claims byte-review, which is not honest at that scale; objective checks all passed, a human makes the call |
| GitHub's own auto-merge is armed on the PR | queue-for-human — this ritual's approve would itself trigger GitHub's merge with whatever method and head the arming chose, bypassing the pinned squash below; disarm it (or merge by hand) to settle it |
| No reviewed head SHA captured to pin the merge to | queue-for-human — an unpinned merge could let a commit pushed after review slip into the squash unreviewed |
| Carries a reviewer's unresolved review thread (a line-level comment nobody has resolved — read via one `gh api graphql` spend per pass, only when some PR would otherwise merge, since `gh pr list` exposes no thread state) | queue-for-human — a human's explicit "look at this" the ritual never squash-merges over; branch protection requires conversation resolution, so the merge would be refused AFTER the approve posted anyway (the approve → refused merge → dismissed approval churn this row ends); resolve the thread(s) to let a later pass reconsider |
| Review threads could not be read (the graphql read failed, or the PR was missing from it) | queue-for-human — a merge asserts every conversation is resolved; an unassessed fact fails closed, and the next pass re-reads |
| Everything above clear | merge — an approval carrying the policy-green reasoning, then a squash-merge pinned to the exact reviewed head (`gh pr merge --squash --match-head-commit`); the remote branch is deliberately left standing — `gh pr merge --delete-branch` also mutates the LOCAL checkout `gh` runs from (checks out the base branch and force-deletes a same-named local branch), and the canonical checkout this ritual runs from sits on a flight branch, so that flag is never passed; a human (or a future remote-only cleanup step) removes the branch by hand. A commit pushed after the re-derive makes GitHub refuse the merge instead of squashing unreviewed code |

**Preview vs execute:** `GET /api/pr-review` previews decisions with no `gh` mutation. The
preview is failure-honest: when the `gh pr list` read itself fails (a nonzero exit,
unparseable output, or a thrown read), the panel does not hide as if nothing were open to
review — it stays visible with an outage notice saying the open-PR list could not be read,
and renders zero Apply buttons until a later poll succeeds; only a read that SUCCEEDED with
an empty list counts as a confirmed empty queue. The
panel's confirm calls `POST /api/pr-review/execute` (CSRF-guarded, rate-limited), which
re-fetches the PR fresh and RE-DERIVES the decision at execute time — a client-supplied verdict
is never trusted. The panel also pins the execute to the decision KIND you actually confirmed:
if the fresh re-derive reaches a different verdict (the PR changed since the preview), nothing
runs — the panel shows the fresh verdict and asks you to review and apply again, so a confirm
that promised a comment can never turn into a merge. Re-runs are idempotent: a PR that stays
queued or held across passes never collects a duplicate copy of the identical comment/review —
the execute probes for a standing one first and reports an honest no-op. Every applied decision
carries its `reasoning` string into the PR comment/review, so the audit trail lives on GitHub
itself. When the PR you confirmed is missing from that fresh execute-time fetch, the ritual
does not guess why: a list miss is not proof the PR is gone (the fetch returns empty on a gh
outage too, drafts are deliberately excluded, and a PR past the 100-newest fetch window is open
but unlisted), so it probes `gh pr view --json state,isDraft` and only a CONFIRMED
`MERGED`/`CLOSED` earns the "PR is no longer open" answer. Every other miss shape surfaces an
honest error naming exactly what is known — still open but unlisted (transient gh failure or
past the fetch window: retry), an open draft (no verdict may be posted on it), or unverifiable
(gh unavailable, or the PR never existed) — and nothing executes on any miss path.

**Approval hygiene** (automatic): a merge whose approve landed but whose pinned merge was then
refused would leave a "policy-green" approval standing over bytes nobody re-reviewed, so the
execute path cleans up after itself — it first probes `gh pr view --json state` (a nonzero
merge exit does not prove the merge was refused; a CONFIRMED `MERGED` keeps the accurate
approval), then dismisses ONLY the ritual's own dangling approval with a message naming the
possible causes. Every NON-merge execute also sweeps the PR's reviews first and dismisses any
stale policy-green approval of the ritual's own that a crashed earlier run left standing —
otherwise it would keep satisfying branch protection while the fresh pass posts only a comment.
Both remediations touch nothing but the ritual's own reviews and fail soft.

**Operator lever** (env, no source edit): `AUTOPILOT_PR_AUTOMERGE=off` disables merge planning
entirely — a policy-green PR queues for your eyes (with its reasoning posted as a comment)
instead of merging; unset or any other value keeps the default. The lever only narrows: no
value widens what may auto-merge past policy-green, and the security-hard rule applies
identically in every mode.

**Verify necessity** (live): before judging gate/conflict state, each non-security PR's
diff is fetched (`gh pr diff`) and reverse-apply-checked against the current tree
(`git apply --reverse --check`, via a temp patch file); a clean reverse-apply means the
change is already present, and the decision policy above requests changes. A failed or
empty diff fetch leaves the check unassessed — it can only narrow toward request-changes,
never force a merge. Security-touching PRs skip the check entirely: the security-hard
rule outranks it, so no verdict could change their decision. The tree it judges is the
dashboard's own checkout, so before a clean reverse-apply becomes a verdict (or a forward
check names conflicting paths), the ritual confirms that tree can stand in for the base:
`git status --porcelain --untracked-files=no` must report nothing, and `git merge-base
--is-ancestor <head> HEAD` must say the PR's head is NOT in local history. A dirty tree,
or one that IS the PR (you ran `gh pr checkout`), leaves necessity unassessed instead of
telling the contributor their PR was "already fixed elsewhere" on the strength of your
own checkout.

**Still deferred** (the task stays open until these land): the epic's "does it genuinely
improve" judgment and conflict resolution — both fall through to
request-changes/queue-for-human, conservatively.

## 9. gh run babysitting (maintenance ritual slice 2)

Epic 0010 (`docs/epics/0010-maintenance-ritual.md`) inventoried the founder's manual
sweep and found five of its six named concerns already covered by existing machinery
(dependabot, `doc-freshness.ts`, `planRelease`) — but nothing watched CI runs on GitHub's
own infrastructure for a red run, a stuck run, or a workflow that never ran at all.
`pnpm dashboard:ci-status` (`control/ci-status.ts` — `ciRunReport`/`ciWorkflowStatus`,
injectable `gh` runner, never throws) closes that gap: for every workflow under
`.github/workflows/`, it fetches the single most recent run (`gh run list --workflow
<file> --limit 1`, GET only) and prints one line per workflow with its state and age.
Only a genuinely failing conclusion (`failure`/`cancelled`/`timed_out`/`action_required`/
`startup_failure`) is flagged as needing a look; an in-progress run is never flagged.
A "go look" signal for you or a KEEPER-style firing, never an auto-retry (this ritual
reports; it does not act). Requires the operator's own authenticated `gh` against the
live repo, so it is deliberately not wired into the CI gate.

## 10. OTLP span export (wiring an OTel collector)

Every firing already emits spans internally; setting one environment variable before
`dashboard:start` (or a CLI flight) exports them to any OpenTelemetry collector —
a local `otel-collector`, Honeycomb, Grafana Cloud, … Off by default: no endpoint
variable set means no export is attempted and nothing changes. The config is read once
per flight (`apps/dashboard/src/flight/otlp.ts`, the adoption of the engine's
`packages/engine/src/otlp.ts` mapping + transport), and the masthead's **OTLP** chip
shows whenever an endpoint is configured — chip visible means every flight is exporting.

The variables follow the [OpenTelemetry env var spec](https://opentelemetry.io/docs/specs/otel/protocol/exporter/)
(names and precedence), so a collector setup you already have works unchanged:

| Variable | Behavior |
|---|---|
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Wins outright; used AS-IS (no path appended). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL fallback; `/v1/traces` is appended unless already present. |
| `OTEL_EXPORTER_OTLP_HEADERS` | `key1=value1,key2=value2` list, values URL-decoded per spec. |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS` | Same format, layered OVER the generic headers (matching endpoint precedence). |

**Only HTTP/JSON is supported** — the engine's transport posts a JSON body, not
protobuf, so `OTEL_EXPORTER_OTLP_PROTOCOL` is intentionally not read. Point it at a
collector's HTTP receiver (conventionally `:4318`), not the gRPC one (`:4317` — which
on this project is also the dashboard's own default port; an endpoint mistakenly aimed
there hits the dashboard, not a collector).

## 11. Project-page surfaces for captured-but-quiet telemetry

The headless-surfacing sweep (board `web-msnqqjmd-9bx0wd`) closed a recurring gap:
signals the engine already captured but no dashboard surface ever showed. Each got a
small, on-demand expression on the project page — none of them polls, none of them acts
on its own. Where they live and what a signal means:

**🖥️ Flight console** — a collapsed panel; expanding it fetches
`GET /api/flightlog?project=<id>`, a read-only tail of this project's flight process
stdout+stderr. The endpoint existed with zero UI consumers before the sweep; it is
scoped per project, so two concurrently flying folders never share one interleaved,
unattributable log. Nothing is fetched until the first expand, and a failed fetch
allows a retry on the next one.

**🔍 Detected backlog** — the end-of-flight reconciliation sweep scores every open
board task's title against recent commit subjects and changed-file paths, catching work
shipped in an interactive session that never emitted a METRICS line (so its task never
flipped to done). This panel (`GET /api/backlog?project=<id>`) is where those candidates
land. Proposal-only: confirming one reuses the board's own "✓ done" action — nothing is
marked done without an explicit click — and a candidate matched only by shared file
paths gets no confirm button at all (that signal once produced 27 false confirm-done
proposals in a single screen), so it renders as an annotation.

**🛡️ N blocked** — on a flight-log row and its per-firing trace: the
containment/read-hygiene guard denied N tool calls during that firing — it tried to
step outside its boundary and was stopped. The firing still ran to completion; a
non-zero chip on a shipped firing is a near-miss worth a look. (§5 covers the worse
case where something actually landed outside the target.)

**🔧 auto-fixed** — same two surfaces: the gate failed a formatting check, mechanical
remediation fixed it automatically, and the firing shipped clean instead of reverting.

Every chip is keyboard-focusable and carries its full explanation as both tooltip and
`aria-label` — hover or focus for the sentence, no source-diving needed. The masthead's
**OTLP** chip (§10) shipped in the same sweep.

## 12. Fleet lane launcher (`dashboard fleet`)

Starting an N-way same-folder fleet used to mean POSTing `/api/fly` by hand once per
lane, remembering to stagger them, and hoping two lanes didn't both pull the same
board task and collide on the same files at commit time (the 3-lane ramp on
2026-08-27 paid for exactly that: two lanes claimed different tasks that both
touched `packages/engine/src/firing.ts`, and the sibling scan refused the second
commit — a paid round that shipped nothing). `dashboard fleet` is the in-repo
launcher that closes both gaps:

```
pnpm dashboard fleet <folder> <lanes> [firings] [budgetUsd]
```

- `folder` — the target repo to fly (same argument `dashboard start` takes).
- `lanes` — how many lanes to launch, default 3. Lane 1 is the base lane (no
  `instanceId`, exactly like a solo flight); lanes 2..N are named `fleet-2`,
  `fleet-3`, … to match the worktrees already on disk
  (`fly-autopilot`, `fly-autopilot--fleet-2`, …) — deliberately no `fleet-1`.
- `firings` / `budgetUsd` — per-lane, same meaning as `dashboard start`'s
  equivalents; default to 1 firing at the configured default budget.

Before launching, it partitions the open board across the lane count with
`buildFleetLaunchPlan` (`flight/fleet-launch.ts`) — the same cohesion-aware,
hub-rule partitioner `scope-partition.ts` was written for (§ Fleet scope
partitioner in `docs/FLEET-ORCHESTRATION.md`): same-area tasks stay on one lane,
so two lanes are never mid-flight on files the partition can see are related.
Each lane's slice rides as `taskScope` on its own `POST /api/fly`.

Lanes are **not** POSTed back-to-back. Every lane onboards against the same
target repo, and the git-lock-taking opening phase (`lockRepo` →
`ensureOnFlight` → `checkoutBranch`) is per-repo, not per-worktree — three
simultaneous POSTs raced `.git/index.lock` live on 2026-08-27 and the third
lane died before it ever reached its worktree. `AUTOPILOT_FLEET_STAGGER_MS`
(default `20000`) sets the delay between each lane's POST; the flights
themselves then run concurrently in their own worktrees as intended.

Requires a dashboard server already running against the target project
(`dashboard start` first) — the launcher POSTs to that server's own
`/api/fly`, it does not spawn one. Output is one line per lane
(`<lane>: <status> started|not started — N task(s) reserved`); a lane whose
POST couldn't even reach the dashboard is reported without aborting the rest,
and the command exits non-zero if any lane failed to reach the server (a
non-2xx the dashboard itself answered is still an exit-0 run — that's an
honest per-lane refusal, not a launcher failure).

The Fly bar has an in-app counterpart for the sizing decision the CLI leaves to
you: the **🍀 "I'm feeling lucky"** button (`GET /api/lucky`, rolled by
`flight/lucky-plan.ts`). It probes this machine — CPU load from a two-sample
`os.cpus()` delta (Windows has no loadavg), free RAM, logical cores — plus the
flight registry and the target folder's board, then fills Lanes/Firings/$ with
a launch sized to what the box can carry right now. Lanes are the minimum of
three bounds (about two idle cores per lane, about 1.5 GB free RAM per lane
above a 4 GB reserve, at least two queued tasks per lane), capped at 8; firings
are sized to drain each lane's shard, clamped to 2–4. It refuses outright, with
the reason painted in the bar, when a flight is already running, the board has
no queued tasks, free RAM is under the 4 GB floor, or CPU is above 85% — and a
broken probe answers that same refusal shape rather than a 5xx. Every bound is
printed as one reasoning line so the dice can be audited. Filling only: **Fly
it** stays your click and your quota spend, the same never-auto-launch stance
the bar has always had. Born of the 2026-09-03 incident where a blind 8-lane
launch pegged a 12-core box at 99% CPU, froze the operator's foreground work,
and starved the dashboard into its own BE-RIGHT-BACK overlay.

## 13. Quick reference

| Symptom | Section |
|---|---|
| `dashboard:start` fails, or an old server answers on 4317 | §2 |
| Dashboard/flight telemetry looks wrong or a write crashed mid-flight | §3 |
| "a flight is already running" but nothing is actually running | §4 |
| A flight committed somewhere it shouldn't have | §5 |
| A firing ran on an unexpected model, or you want to pin/tune the model | §6 |
| A `CLOSED-TASK AUDIT:` / `DOC-FRESHNESS:` task showed up asking for approval | §7 |
| A PR on the canonical repo got merged / bounced / held automatically | §8 |
| You want to check whether a GitHub Actions workflow is red or stuck | §9 |
| You want flight spans in your OTel collector, or wonder why the OTLP chip is showing | §10 |
| You want a flight's raw stdout/stderr, or a 🛡️/🔧 chip appeared on a firing | §11 |
| The Detected-backlog panel proposes a task is already done | §11 |
| You want to launch an N-way same-folder fleet without lanes colliding on files | §12 |
| Anything else | `pnpm dashboard:doctor`, then check `.autopilot-run/dashboard.log` / `.autopilot/flight.log` |
