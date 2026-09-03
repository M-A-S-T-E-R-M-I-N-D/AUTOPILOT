// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hexagonal ports for the engine core (PATTERNS-AND-STANDARDS §1). The firing/
 * loop orchestrator depends only on these interfaces; concrete drivers (a
 * `claude -p` ModelPort, a git VcsPort, the SQLite StorePort, an fs ClockPort)
 * live in `./adapters` and are injected. This keeps the trust-critical
 * orchestration fully testable with fakes.
 */

import type { FiringRecord, GateCheckResult } from './telemetry.js';
import type { GuardDenialDetail } from './stream.js';

export type { GateCheckResult } from './telemetry.js';

export type EnginePhase = 'ORIENT' | 'PICK' | 'DO' | 'GATE' | 'COMMIT';

/** The parsed CLI JSON envelope (facts the agent cannot fake). */
export interface ModelEnvelope {
  readonly result: string | null;
  readonly isError: boolean;
  readonly apiErrorStatus: string | null;
  readonly costUsd: number | null;
  readonly numTurns: number | null;
  readonly durationMs: number | null;
  readonly stopReason: string | null;
  readonly modelUsed: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheRead: number | null;
  readonly cacheCreate: number | null;
  /**
   * The CLI's own conversation id for this invocation (`--resume <session_id>`
   * resumes it — docs/epics/0009-warm-sessions.md). Optional: existing
   * `ModelEnvelope` literals across the codebase predate this field and stay
   * valid without it; only `parseModelEnvelope` populates it today.
   */
  readonly sessionId?: string | null;
}

/**
 * The last-known usage snapshot observed on the wire before an abnormal exit
 * (the terminal `result` event never arrived) — DEATH-COST capture
 * (docs/EVALUATION-2026-08.md §3.6). A checkpoint-death firing that lost its
 * envelope still gets its real observed turns/tokens persisted instead of a
 * fabricated $0/0 row. Cost is never estimated from tokens (no pricing table
 * to trust), only what the CLI itself already reported.
 */
export interface PartialUsage {
  readonly modelUsed: string | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly turnsObserved: number | null;
}

/** One CLI attempt's raw result: stdout, exit code, and the parsed envelope (or null). */
export interface ModelResponse {
  readonly stdout: string;
  readonly exitCode: number;
  readonly envelope: ModelEnvelope | null;
  /** Set only when {@link envelope} is null and at least one assistant event
   *  streamed before the abnormal exit — see {@link PartialUsage}. */
  readonly partialUsage?: PartialUsage | null;
  /**
   * Whether THIS response actually came from a resumed CLI session
   * (docs/epics/0009-warm-sessions.md's "measurable win" telemetry signal):
   * `true` when a resume was requested and the CLI accepted it, `false` when
   * a resume was requested but failed at the CLI level and the driver fell
   * back to a cold retry ({@link isResumeFailure} in `adapters/claude-cli.ts`).
   * Absent when no resume was requested at all (an ordinary cold spawn) or
   * the driver has no notion of sessions (e.g. Ollama) — distinct from
   * `false` so telemetry never counts an untried cold spawn as a failed
   * resume attempt.
   */
  readonly resumed?: boolean;
  /**
   * Count of PreToolUse guard denials observed on the stream during this
   * attempt (Headless surfacing sweep, board web-msnqqjmd-9bx0wd) — see
   * `stream.ts`'s `guardDenialsFromEvent`. Only a streaming driver can see
   * this (it reads the per-event `tool_result` blocks the plain `-p
   * --output-format json` envelope never carries): absent for
   * {@link ClaudeCliModel} and any non-streaming/non-Claude-CLI driver,
   * `0` for a streaming attempt that saw none.
   */
  readonly guardDenials?: number;
  /**
   * Structured guard-denial rows observed on the stream during this attempt
   * (GUARD-DENIAL telemetry, board web-msr0ug27-hj1w27) — same wire data as
   * {@link guardDenials}, just kept as the individual `{kind, target}` shape
   * instead of collapsed to a count, so a caller can persist each denial as
   * its own events row. Same absent-for-non-streaming-drivers contract as
   * {@link guardDenials}; always in wire order.
   */
  readonly guardDenialDetails?: readonly GuardDenialDetail[];
  /**
   * True when THIS attempt was killed by the driver's own wall-clock cap
   * (THIRD CAP — `adapters/claude-cli.ts`'s `DEFAULT_CLI_TIMEOUT_MS` /
   * `timeoutMs`) rather than an ordinary crash or quota exhaustion: the
   * child was signal-killed after running at least as long as the
   * configured timeout. This is the failure mode that killed firings
   * envelope-less (cost 0, no METRICS) under contention before it was
   * distinguishable from a generic error. Absent/false for every ordinary exit.
   */
  readonly timedOut?: boolean;
}

/**
 * Per-invocation cap overrides (FINISH-LINE EXTENSION, founder policy
 * 2026-08-20): a bounded "more open tap" for one extra invocation — NOT a
 * fresh full budget. A driver whose config carries `maxTurns`/`maxBudgetUsd`
 * applies these over it for this one call; a driver with no notion of caps
 * (e.g. Ollama) ignores them.
 */
export interface InvokeCaps {
  readonly maxTurns?: number;
  readonly maxBudgetUsd?: number;
}

/** Drives a model (cloud `claude -p` or local Ollama) for one firing. */
export interface ModelPort {
  /**
   * `resumeSessionId`, when given, asks the driver to resume that prior
   * conversation instead of cold-spawning a new one (docs/epics/0009-warm-
   * sessions.md) — optional so every existing caller/fake stays valid
   * unchanged; a driver that has no notion of sessions (e.g. Ollama) simply
   * ignores it. `caps`, when given, bounds THIS invocation tighter than the
   * driver's own config (the finish-line extension's smaller tap).
   */
  invoke(
    model: string,
    prompt: string,
    resumeSessionId?: string,
    caps?: InvokeCaps,
  ): Promise<ModelResponse>;
}

/** The result of running the per-project verification gate. */
export interface GateResult {
  readonly ok: boolean;
  readonly details?: string;
  /** Per-command results (label + pass/fail + duration) — which checks ran. */
  readonly checks?: readonly GateCheckResult[];
  /**
   * True when the failure was a CRASH (missing dependency, OOM, spawn/tool
   * error) rather than the gate command itself running and reporting a real
   * failure. A crashed gate never verified the work either way — it is not
   * evidence the commit is bad, and must not be treated like a real failure.
   */
  readonly crashed?: boolean;
}

/** The per-project verifier of record — typecheck + test + build (detected at M2). */
export interface GatePort {
  run(): Promise<GateResult>;
}

/** A commit's identifying info (for un-fakeable telemetry cross-checks). */
export interface CommitRef {
  readonly subject: string;
  readonly shortSha: string;
}

/**
 * Version control — always additive and safety-branch aware. `revertLast` adds a
 * revert commit (never `reset --hard`); it undoes a firing whose commit failed
 * the gate while keeping history intact (MASTER-PLAN §7).
 */
export interface VcsPort {
  head(): Promise<string>;
  lastCommit(): Promise<CommitRef | null>;
  /**
   * True when `sha` names a commit that is reachable from `headAfter` but
   * NOT reachable from `headBefore` — one of the NEW commits THIS firing
   * itself produced, not merely any commit ever committed to the repo (GATE
   * HOLE 5, board web-mtb8hgj2-xhang0). A plain existence check is true for
   * any commit in the repo's entire history, which lets a hallucinated or
   * stale self-reported sha pass as "verified".
   */
  commitInFiringRange(sha: string, headBefore: string, headAfter: string): Promise<boolean>;
  /**
   * Repo-relative paths whose content differs between `fromRef` and `toRef`
   * (`git diff --name-only`) — the NET change a firing left in history, which
   * becomes `FiringRecord.filesTouched` → the exporter's `autopilot.files`
   * span attribute (epic 0015's D4 file lens). `[]` when either ref is the
   * unborn-HEAD sentinel `''` or the diff fails — the record honestly omits
   * the field rather than fabricating paths.
   */
  changedFiles(fromRef: string, toRef: string): Promise<readonly string[]>;
  /**
   * Additively revert commit(s) via `git revert` (never `reset --hard`). With
   * no `sinceRef`, reverts only HEAD (RemediatingGate's own autoformat
   * commit). With `sinceRef`, reverts the FULL range `sinceRef..HEAD` — a
   * firing's own model attempt can make more than one commit before the gate
   * judges it, and reverting only the tip would leave the earlier commit(s)
   * from that same firing un-reverted (GATE HOLE 3, board
   * web-mtb8hghd-72z52z).
   */
  revertLast(sinceRef?: string): Promise<void>;
  /** Any uncommitted changes in the working tree (staged or not)? */
  isDirty(): Promise<boolean>;
  /** Stage everything and commit — the WIP-checkpoint "pack up" move. */
  commitAll(message: string): Promise<void>;
}

/** Persistence boundary — the SQLite adapter implements this. */
export interface StorePort {
  recordFiring(record: FiringRecord): void | Promise<void>;
}

/** Injectable clock so time-dependent behavior is deterministic in tests. */
export interface ClockPort {
  nowEpochSec(): number;
  nowIso(): string;
}

/**
 * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) — the impure half
 * of the "MACHINE-WIDE 30d equiv" denominator: scans `dirs` (recursively, for
 * `*.jsonl` transcripts) and sums their trailing-window list-price cost,
 * deduplicated by message id (`usage-pool.ts`). `null` when NOT ONE of
 * `dirs` was readable at all — distinct from a readable-but-zero-usage pool,
 * which resolves to a real `0` (see `usage-pool-scan.ts`'s
 * `UsagePoolScanResult.totalUsd` contract, which this wraps).
 */
export interface UsagePoolPort {
  scanListPriceUsd(dirs: readonly string[], nowMs: number): Promise<number | null>;
}
