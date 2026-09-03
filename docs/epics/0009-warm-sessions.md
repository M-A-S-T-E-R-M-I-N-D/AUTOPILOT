<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# 0009. Warm sessions — resume a flight's CLI session instead of cold-spawning every firing

Status: Active — session-resume is LIVE in the loop (landed 2026-08-16: engine
`--resume` threading + migration v15 `metrics.resumed`); 24 of the 41 firings in the
2026-08-20 ramp rounds ran resumed.

**MEASURED VERDICT (2026-08-20, n=197 resumed firings, confound-controlled
`packages/store/src/warm-sessions.ts`): blanket resume LOSES money** — cost
saved/firing **-$1.28**, cost saved/turn **-$0.79**, fresh input saved only ~312
tokens/firing. The giant resumed context makes every turn dearer than the ORIENT
it skips. Founder policy in response ("whoever started, finishes"): resume scope
narrowed to CHECKPOINT CONTINUATION ONLY (`loop.ts` — a session is carried
forward only out of a checkpointed firing), and the cheaper mechanism for
mid-unit deaths is now the engine's FINISH-LINE EXTENSION (`firing.ts`
`finishLineCaps`/`finishLinePrompt`): the SAME worker gets one bounded resume of
its own session — told explicitly it is happening, told to cut a gate-green
slice if the unit is too big — before any checkpoint hand-off. `record.extended`
(`telemetry.ts`'s `FiringRecord.extended`) was already being computed but was
silently dropped at the store boundary — captured in the raw `events` JSON but
never projected into queryable `metrics`, so it could never actually
"accumulate" for the re-measurement this slice needs. Migration v17
(`metrics.extended`, `SqliteFiringStore.recordFiring`) fixes that gap. The
correlation instrument has since landed as well: `extendedFiringSavings`
(`packages/store/src/warm-sessions.ts` — unit-tested, exported through the
store index) groups firings by extension disposition with the same
confound-controlled $/turn rule as the resumed-vs-cold comparison, so do NOT
rebuild it. Its verdict reader is wired too: the flight-end PAPER refresh
(`scripts/self-study/generate-data.mjs`'s `renderExtendedFiringSavings`)
publishes a one-line pending status (with the extended-group count) while the
group is empty and the full extended-vs-ordinary table once it is not — so the
deferral condition is now observable at every refresh instead of requiring a
manual live-store query. What actually remains open: (1) let extended firings
accumulate since v17, then read the verdict off the PAPER table — is
FINISH-LINE EXTENSION actually cheaper than a checkpoint hand-off?; (2) the
fleet-home tile, still deferred until that table shows a non-empty extended
group — wiring a tile for an always-empty group would be premature.

Original problem statement (historical, pre-2026-08-16): every firing spawned a
brand-new `claude` process (`ClaudeCliModel`/`StreamingClaudeCliModel`
in `packages/engine/src/adapters/claude-cli.ts`, via `buildClaudeArgs`) with no continuity from the
previous firing — `docs/EVALUATION-2026-08.md` §3.1 names the resulting cost anatomy directly:
"2.08B cache-read tokens vs 144K fresh input — context re-reading dominates; WARM SESSIONS (queued)
attacks the cold-spawn tax directly." Board item `web-msnt26so-0c6tje` names the same gap: "firings
within a flight cold-spawn the CLI and re-pay ORIENT every time." This epic scopes the fix.

## What exists today (the building blocks this epic reuses)

- `docs/CLAUDE-CLI-INTEGRATION.md` already researched the primitive: `claude -p --output-format json`
  returns a `session_id` in its envelope, and `--continue`/`--resume <session_id>` resumes a prior
  session in headless `-p` mode. Confirmed against the current official docs (code.claude.com/docs,
  `sessions.md`/`headless.md`): resume works together with `-p`/`--output-format json`, tool
  permissions carry over (except `plan`/`bypassPermissions`, which reset), and the session file lives
  at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`.
- `parseModelEnvelope` (`claude-cli.ts`) now extracts `session_id` onto `ModelEnvelope.sessionId`
  (optional field — every pre-existing `ModelEnvelope` literal across the codebase stays valid
  without it). That was slice zero.
- Slice one landed the threading + the flag: `loop.ts` carries the just-finished firing's
  `sessionId` forward, in-memory, as the next firing's `FiringInput.resumeSessionId` (flight-scoped
  for free — the loop's own process IS one flight, so a new flight starts from a fresh `undefined`
  and nothing ever crosses a worktree boundary). `firing.ts` passes it to `ModelPort.invoke`'s new
  optional third parameter; `buildClaudeArgs` appends `--resume <id>` for both `ClaudeCliModel` and
  `StreamingClaudeCliModel`, placed AFTER every containment flag (`--settings`/`--add-dir`/
  `--fallback-model`/…) so a resumed invocation still carries them explicitly — proven by a test
  building args with both a `settingsPath` and a `resumeSessionId` and asserting `--settings`
  survives. A missing/null session id omits `--resume` entirely (the free/default cold-spawn
  fallback for "no session on hand").
  Slice two landed the CLI-level fallback: `ClaudeCliModel`/`StreamingClaudeCliModel.invoke` now
  detect a resumed attempt that failed AT THE CLI LEVEL — `isResumeFailure` (`claude-cli.ts`) is
  true only when a `resumeSessionId` was actually given, the response's envelope never parsed
  (no valid JSON — the CLI printed a plain-text error instead, the shape an unknown/expired/moved
  session id produces), and the exit code is non-zero. A real quota/API failure still returns a
  parseable envelope (`is_error`/`api_error_status`), so it is never misdetected as a resume
  failure and never retried — only the resume-specific case triggers a single cold retry (same
  prompt, `--resume` simply omitted the second time). No resumeSessionId ever given means the
  condition can't fire at all — an ordinary cold spawn's behavior is completely unchanged.
  Slice three landed the measurable-win instrument: `warmSessionSavings`
  (`packages/store/src/warm-sessions.ts`) groups every recorded firing by resume disposition
  (`metrics.resumed`: resumed / cold-fallback / never-requested) and compares per-firing fresh
  input tokens, cache reads/writes, cost, and turns — the SQL correlation the v15 migration
  comment promised. Slice four wired its UX-EXPRESSION end-to-end: `read/source.ts` attaches it
  to project state, `ae729d1` renders it as a fleet-home dashboard tile (`web/shell.ts`'s
  `warmSessionsSection`, hidden until a project has at least one resumed firing, same precedent
  as `gateParallelSection`), and `a296bb2` publishes the same table into
  `docs/SELF-STUDY/PAPER.md`'s "Warm-session savings" section (`renderWarmSessionSavings`,
  `scripts/self-study/generate-data.mjs`).
  Run over real flight data (112 resumed firings, 2026-08-17 snapshot), the raw result was
  MIXED, not a clean win: resumed firings pay 337 fewer fresh-input tokens on average but cost
  $1.48 MORE per firing than cold — confounded by avg turns (11.6 resumed vs. 52.0 cold), so the
  raw per-firing comparison isn't apples-to-apples. Slice five landed the confound-controlled
  counterpart that finding demanded: `avgCostPerTurn` per disposition group plus
  `costPerTurnDeltaPerFiring` (`warm-sessions.ts` — the mean of each firing's OWN `cost/turns`
  ratio, zero-turn firings excluded rather than divided by), rendered on both surfaces (the
  tile's fourth "cost saved / turn" stat via `stat-tiles.ts`'s `warmSessionTileItems`, and the
  PAPER table's `$/turn` column + delta line). Still open: the VERDICT — the 2026-08-17 snapshot
  predates the per-turn metric, so the epic's "measurable win" acceptance criterion stays
  unanswered until the analysis is re-read off a live store with the per-turn delta populated —
  `Status: Draft` stands until then.
- The Claude Agent SDK exposes the same idea more directly for a Node orchestrator: TypeScript's
  `query()` accepts `continue: true` / `resume: "<session-id>"`, and Python's `ClaudeSDKClient`
  tracks the session across calls automatically within one live process — a persistent-process path,
  distinct from the current spawn-a-CLI-per-firing shape.
- The checkpoint/RESUME CHECK convention (`wip(autopilot): checkpoint` commits, read by
  `firing.ts`/`prompt.ts`) already gives cross-firing continuity today, but at the **git** level (a
  human-readable note the next fresh context reads), not the CLI's own conversational state. That
  mechanism must keep working unmodified — this epic is additive to it, not a replacement.

## Acceptance criteria

- Firing N+1 within the same flight resumes firing N's CLI session (`--resume <session_id>` or
  `--continue`) instead of an unrelated cold spawn, whenever a valid session ID for the current
  flight/worktree is on hand.
- The session ID returned in a firing's envelope is captured and persisted somewhere the *next*
  firing in the same flight can read it back (flight-scoped, not global — a stale ID from a
  different flight/worktree must never be resumed).
- Every containment-relevant flag is still passed explicitly on a resumed invocation, not assumed
  carried over: `sessions.md` documents that `--settings` (the PreToolUse Bash containment hook),
  `--add-dir`, `--fallback-model`, `--mcp-config`, and `--plugin-dir` are **not** restored by resume.
  A resumed firing with a dropped `--settings` flag would silently fly without the containment guard
  — the acceptance bar is a test proving the guard flag is present on a resumed invocation's argv,
  not just a cold one's.
- Resume is an optimization, never a hard dependency: if the prior session ID is missing, the CLI
  errors resuming it (expired, moved worktree, cross-project lookup miss), or resume is simply
  unavailable, the firing falls back to today's cold spawn automatically — a flight must never fail
  or stall because a resume attempt didn't work.
- A measurable win is demonstrated, not assumed: an existing telemetry signal (cache-read vs fresh
  input tokens, or ORIENT-phase turns-before-first-edit) shows a resumed firing paying less than a
  cold one for the same repeated context, for at least one real flight.
- The flight's own state (repo-map digest, BOARD, FLEET list) is still delivered fresh to the model
  every firing — resume buys conversational/tool continuity and a warm prompt cache, not a frozen
  view of a board that has since changed.

## Constraints

- Session validity is scoped to the worktree it was created in (`~/.claude/projects/<encoded-cwd>/…`,
  epic 0004's per-flight worktree is the `cwd`) — a session ID captured under one flight's worktree
  is not assumed resumable once that worktree is reused or removed for a different flight.
- Prompt cache lifetime is ~1 hour (per `sessions.md`): resume still functions past that window, but
  the win is a cache-warmth property, not a hard guarantee — firings spaced further apart than that
  pay a full reprocess on the first post-gap request, same as a cold spawn would.
- Additive-only fallback, matching SOUL's git discipline in spirit: no change here may make a firing
  MORE likely to fail — a resume attempt that errors must degrade to the existing cold path, silently
  from the flight's perspective (logged, not fatal).
- Must not weaken or bypass the containment guard (`buildFlightSettings`/`guardedPathsFor`) — see the
  acceptance criterion above; this is the one place a "just resume, it'll carry over" assumption would
  quietly regress security.

## Out of scope

- Cross-flight resume (starting a brand-new flight warm from a previous, unrelated flight's session)
  — this epic covers only firing-to-firing continuity **within** one live flight.
- The MdViewer/project-chat "warm session" idea in `docs/REACTIVITY.md` §4 — a different feature
  (interactive doc-chat persona), not the autonomous firing loop this epic targets.
- Migrating the spawn mechanism itself from `execFile`/`spawn` over the CLI to the Agent SDK's
  persistent `ClaudeSDKClient`/`query()` process — worth a future look (the SDK path avoids
  per-firing process spawn entirely), but a materially larger architecture change than adding resume
  flags to the existing adapter; this epic ships the CLI-flag version first.
- Cross-host session mirroring (the SDK's `SessionStore` adapter) — irrelevant to a single-machine
  fleet.

## Related

- `docs/EVALUATION-2026-08.md` §3.1 — the cache-economics finding this epic answers.
- `docs/CLAUDE-CLI-INTEGRATION.md` — the `--continue`/`--resume <session_id>` flag research this
  epic's design is grounded in.
- `docs/REACTIVITY.md` §4 — the adjacent-but-distinct MdViewer warm-session idea (out of scope here).
- `docs/epics/0004-bash-containment-worktree.md` — the per-flight worktree whose `cwd` scopes session
  validity.
- Board item `web-msnt26so-0c6tje` ("WARM SESSIONS").
