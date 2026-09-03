// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Un-fakeable telemetry — the faithful pure-logic port of the v2.4 firing
 * record (ENGINE-RESEARCH G2/G3/G4; `docs/M1-ENGINE-PLAN.md`).
 *
 * The agent self-reports a `METRICS:{…}` line, but git is the ground truth: the
 * orchestrator cross-checks the reported `sha` and whether HEAD advanced. When
 * the self-report is missing yet HEAD advanced, fields are DERIVED from the
 * actual commit (`iterMetrics = 'inferred'`) so the scoreboard is never blinded.
 * Every function here is pure so this trust-critical logic is fully testable.
 */

import { SEVERITIES, DIMENSIONS, type Severity, type Dimension } from '@autopilot/store';
import type { StartedOn } from './resilience.js';
import { computeRealCostUsd } from './usage-pool.js';
import type { GuardDenialDetail } from './stream.js';

// ---- self-report parsing ----------------------------------------------------

export interface SelfReport {
  readonly item: string | null;
  readonly outcome: string | null;
  readonly sha: string | null;
  readonly kind: string | null;
  readonly area: string | null;
  readonly verifierUsed: string | null;
  readonly deferredTo: string | null;
  readonly testsBefore: number | null;
  readonly testsAfter: number | null;
  readonly completion: Completion | null;
  /**
   * Self-reported TDD-first compliance on a `kind:"fix"` firing (backlog
   * web-msnsxuep-ytwucr): `true` when a failing test reproducing the bug was
   * written and confirmed red BEFORE the fix landed, `false` when it wasn't.
   * `null` for every non-fix firing, and for pre-existing firings that predate
   * this field — absence is never treated as either compliance or violation.
   */
  readonly testFirst: boolean | null;
  /**
   * PICK DISCIPLINE (Goodhart audit — backlog web-msu755l7-mhyvuy): the
   * 1-based position, in the firing's rendered BOARD, of the task actually
   * worked. `null` for a free pick (no linked board task) or a pre-existing
   * firing that predates this field — never coerced to a number.
   */
  readonly pickedRank: number | null;
  /**
   * Why the firing worked a task other than the triage-TOP one (picked_rank
   * isn't 1). The prompt requires this whenever picked_rank isn't 1; `null`
   * when the top task was picked, no board task was linked, or the firing
   * predates this field.
   */
  readonly deviationReason: string | null;
}

export type MetricsStatus = 'ok' | 'malformed' | 'missing';

/**
 * Whether a shipped firing finished its linked board task or only advanced it.
 * `null` means the agent didn't say (treated as 'complete' downstream — the
 * pre-existing behavior for every firing before this field existed).
 */
export type Completion = 'slice' | 'complete';

export interface ParsedMetrics {
  readonly status: MetricsStatus;
  readonly report: SelfReport | null;
}

// `g` (not just `m`) is load-bearing: parseMetricsLine walks every match to
// keep the LAST one (its documented contract) — a non-global regex's `.exec`
// returns only the first, which would record a preliminary/illustrative
// METRICS line over the real final self-report.
const METRICS_RE = /^METRICS:(\{.*\})\s*$/gm;

function pickStr(o: Record<string, unknown>, key: string): string | null {
  const v = o[key];
  return typeof v === 'string' ? v : null;
}

function pickNum(o: Record<string, unknown>, key: string): number | null {
  const v = o[key];
  // Stryker disable next-line ConditionalExpression: `Number.isFinite` (unlike
  // global `isFinite`) never coerces, so it already returns `false` for any
  // non-number `v` — the `typeof v === 'number'` operand can never
  // independently change the `&&`'s result. It stays for the same
  // narrowing-clarity reason as pickCompletion's analogous guard above.
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function pickBool(o: Record<string, unknown>, key: string): boolean | null {
  const v = o[key];
  return typeof v === 'boolean' ? v : null;
}

const COMPLETION_VALUES: readonly Completion[] = ['slice', 'complete'];

/** Same defensive contract as pickEnum below: an out-of-enum value drops to null, never throws. */
function pickCompletion(o: Record<string, unknown>): Completion | null {
  const v = o['completion'];
  // Stryker disable next-line ConditionalExpression: `.includes(v)` already uses
  // strict `===` internally, so it can only be true when `v` really IS a string
  // equal to one of the two enum values — the `typeof` guard can never change the
  // outcome. It stays for the same narrowing-clarity reason as pickEnum below, not
  // for distinguishable behavior.
  return typeof v === 'string' && (COMPLETION_VALUES as readonly string[]).includes(v)
    ? (v as Completion)
    : null;
}

/**
 * Schema-validate a tag against its canonical enum at the parse boundary. A
 * present-but-out-of-enum value is dropped (the parse stays defensive — never
 * throws) but `rejected` stays true so the caller can surface it instead of
 * the tag silently vanishing (fail-loud telemetry).
 */
function pickEnum<T extends string>(
  o: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): { readonly value: T | null; readonly rejected: boolean } {
  const v = o[key];
  if (typeof v !== 'string') return { value: null, rejected: false };
  return (allowed as readonly string[]).includes(v)
    ? { value: v as T, rejected: false }
    : { value: null, rejected: true };
}

function toSelfReport(o: Record<string, unknown>): SelfReport {
  return {
    item: pickStr(o, 'item'),
    outcome: pickStr(o, 'outcome'),
    sha: pickStr(o, 'sha'),
    kind: pickStr(o, 'kind'),
    area: pickStr(o, 'area'),
    verifierUsed: pickStr(o, 'verifierUsed'),
    deferredTo: pickStr(o, 'deferredTo'),
    testsBefore: pickNum(o, 'testsBefore'),
    testsAfter: pickNum(o, 'testsAfter'),
    completion: pickCompletion(o),
    testFirst: pickBool(o, 'testFirst'),
    pickedRank: pickNum(o, 'picked_rank'),
    deviationReason: pickStr(o, 'deviation_reason'),
  };
}

/** Extract the last `METRICS:{…}` self-report line from the agent's output. */
export function parseMetricsLine(resultText: string): ParsedMetrics {
  // Walk to the LAST match. `METRICS_RE` is global, so `.exec` advances through
  // `lastIndex`; the loop settles on the final METRICS line and leaves
  // `lastIndex` at 0 (a null result resets it), keeping the module-level regex
  // safe to reuse on the next call.
  let match: RegExpExecArray | null = null;
  for (let m = METRICS_RE.exec(resultText); m !== null; m = METRICS_RE.exec(resultText)) {
    match = m;
  }
  if (!match) return { status: 'missing', report: null };
  let raw: unknown;
  try {
    // Stryker disable next-line StringLiteral: `match[1]` is always defined once
    // METRICS_RE matches — its capture group `(\{.*\})` is not optional — so the
    // `?? ''` fallback only exists to satisfy noUncheckedIndexedAccess and is
    // unreachable in practice.
    raw = JSON.parse(match[1] ?? '');
  } catch {
    return { status: 'malformed', report: null };
  }
  // The object-only pattern guarantees `{…}`, which JSON.parse yields as an
  // object (or throws, caught above), so a defensive non-object check is dead.
  return { status: 'ok', report: toSelfReport(raw as Record<string, unknown>) };
}

// ---- task proposals (the agent OFFERS work; the operator approves) ----------

/** One task the agent proposes for the operator's board (never self-approved). */
export interface TaskProposal {
  readonly title: string;
  readonly dimension: Dimension | null;
  readonly severity: Severity | null;
  /** True when the raw dimension/severity was present but outside the
   * canonical enum (dropped to null) — so an operator-facing caller can
   * report it instead of it disappearing silently. */
  readonly invalidTags: boolean;
  /** True when the agent tagged this proposal `"source":"backlog"` — lifted
   * from an open docs/BACKLOG-999.md item rather than freshly mined from the
   * repo (SOTA-MAP C2). Anything else (absent, misspelled) is self-mined. */
  readonly fromBacklog: boolean;
}

const PROPOSALS_RE = /^PROPOSALS:(\[.*\])\s*$/m;
export const MAX_PROPOSALS = 5;
const MAX_PROPOSAL_TITLE_CHARS = 200;

/**
 * Extract the agent's `PROPOSALS:[…]` line (emitted when the operator's board
 * is empty): suggested next tasks across quality lenses, surfaced on the
 * dashboard for APPROVAL — the agent never enacts its own proposals. Defensive
 * like the METRICS parser: anything malformed yields [] and never throws.
 */
export function parseProposalsLine(resultText: string): readonly TaskProposal[] {
  const match = PROPOSALS_RE.exec(resultText);
  // Stryker disable next-line ConditionalExpression: when `match` is null,
  // skipping this early return just defers to the `catch` below — `match[1]`
  // throws immediately on a null `match`, and that catch also returns `[]` — so
  // the two paths are behaviorally identical (this exists to skip the throw, not
  // to reach a different result).
  if (!match) return [];
  let raw: unknown;
  // Stryker disable BlockStatement: `raw` stays `undefined` after a caught
  // parse failure below (the assignment never completes), and
  // `Array.isArray(undefined)` is false, so the check further down returns
  // `[]` anyway — emptying the catch block is behaviorally identical via that
  // fallthrough. (Not `next-line`: prettier always joins `} catch {` onto one
  // line with the try block's closing brace, which is the mutant's actual
  // target line, so a next-line comment placed inside the block never lines
  // up with it.)
  try {
    // Stryker disable next-line StringLiteral: same reasoning as
    // parseMetricsLine's identical fallback — `match[1]` is always defined once
    // PROPOSALS_RE matches.
    raw = JSON.parse(match[1] ?? '');
  } catch {
    return [];
  }
  // Stryker restore BlockStatement
  // Stryker disable next-line ConditionalExpression, ArrayDeclaration:
  // PROPOSALS_RE's capture group `(\[.*\])` guarantees `match[1]` starts with `[`
  // and ends with `]`; a JSON.parse of such a string either throws (caught above)
  // or yields an actual array per the JSON grammar — a successful parse can never
  // produce a non-array here, so this check is unreachable for any input the
  // regex lets through.
  if (!Array.isArray(raw)) return [];
  const proposals: TaskProposal[] = [];
  for (const entry of raw) {
    if (proposals.length >= MAX_PROPOSALS) break;
    // Stryker disable next-line ConditionalExpression: for any entry reachable
    // via JSON.parse (null, boolean, number, string, array, or object), a
    // non-object entry has no own `.title` property, so `o['title']` below is
    // always `undefined` regardless of this half of the guard — the
    // `title.length === 0` skip a few lines down already filters every such
    // value out identically.
    if (entry === null || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    const title = typeof o['title'] === 'string' ? o['title'].trim() : '';
    if (title.length === 0) continue;
    const dimension = pickEnum(o, 'dimension', DIMENSIONS);
    const severity = pickEnum(o, 'severity', SEVERITIES);
    proposals.push({
      title: title.slice(0, MAX_PROPOSAL_TITLE_CHARS),
      dimension: dimension.value,
      severity: severity.value,
      invalidTags: dimension.rejected || severity.rejected,
      fromBacklog: o['source'] === 'backlog',
    });
  }
  return proposals;
}

// ---- iteration resolution (self-report, else derive-from-commit) ------------

export type IterMetrics = MetricsStatus | 'inferred' | 'envelope-error';

export interface CommitInfo {
  readonly subject: string;
  readonly shortSha: string;
}

export interface ResolvedIteration {
  readonly item: string | null;
  readonly outcome: string | null;
  readonly sha: string | null;
  readonly kind: string | null;
  readonly area: string | null;
  readonly verifierUsed: string | null;
  readonly deferredTo: string | null;
  readonly testsBefore: number | null;
  readonly testsAfter: number | null;
  readonly iterMetrics: IterMetrics;
  readonly completion: Completion | null;
  readonly testFirst: boolean | null;
  readonly pickedRank: number | null;
  readonly deviationReason: string | null;
}

function firstWord(subject: string): string | null {
  const m = /^([a-z]+)/.exec(subject);
  return m ? (m[1] ?? null) : null;
}

function ticketId(subject: string): string | null {
  const jira = /([A-Z]{2,}-\d+)/.exec(subject);
  if (jira?.[1] !== undefined) return jira[1];
  // Board task ids (web-<time36>-<nonce36>, the taskIdSource shape) — a firing
  // that omits METRICS but names its task in the commit subject must still
  // attribute; the JIRA-only shape left such ships item='inferred' and their
  // board tasks open forever (2026-08-22 live gap, web-msnsndlk-exw3t9).
  const board = /\b(web-[a-z0-9]+-[a-z0-9]+)\b/.exec(subject);
  return board?.[1] ?? null;
}

/**
 * Resolve the iteration's reported fields. Prefers the self-report; if absent but
 * HEAD advanced, derives item/kind/sha from the commit (status → 'inferred'). A
 * missing envelope forces 'envelope-error' regardless of the self-report.
 */
export function resolveIteration(
  parsed: ParsedMetrics,
  opts: {
    readonly envelopeOk: boolean;
    readonly headAdvanced: boolean;
    readonly commit: CommitInfo | null;
  },
): ResolvedIteration {
  const status: IterMetrics = opts.envelopeOk ? parsed.status : 'envelope-error';

  if (parsed.report) {
    return { ...parsed.report, iterMetrics: status };
  }

  if (opts.headAdvanced && opts.commit) {
    return {
      item: ticketId(opts.commit.subject) ?? 'inferred',
      outcome: 'shipped',
      sha: opts.commit.shortSha,
      kind: firstWord(opts.commit.subject),
      area: null,
      verifierUsed: null,
      deferredTo: null,
      testsBefore: null,
      testsAfter: null,
      // No self-report exists to say otherwise, so a derived ship is trusted
      // whole (matches every firing's behavior before this field existed).
      completion: 'complete',
      testFirst: null,
      // A derived-from-commit ship has no self-report to read a rank/reason
      // from — nothing to derive either from a commit subject alone.
      pickedRank: null,
      deviationReason: null,
      iterMetrics: status === 'missing' ? 'inferred' : status,
    };
  }

  return {
    item: null,
    outcome: null,
    sha: null,
    kind: null,
    area: null,
    verifierUsed: null,
    deferredTo: null,
    testsBefore: null,
    testsAfter: null,
    completion: null,
    testFirst: null,
    pickedRank: null,
    deviationReason: null,
    iterMetrics: status,
  };
}

// ---- firing record assembly -------------------------------------------------

export interface EnvelopeFacts {
  readonly model: string;
  readonly exitCode: number;
  readonly isError: boolean | null;
  readonly stopReason: string | null;
  readonly numTurns: number | null;
  readonly durationMs: number | null;
  readonly costUsd: number | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheRead: number | null;
  readonly cacheCreate: number | null;
}

/**
 * What the engine's post-commit gate did to this firing's commit. 'unverifiable'
 * is the third gate verdict (distinct from a real 'reverted' failure): the gate
 * itself crashed (missing dep/OOM/tool error) before it could judge the work, so
 * the commit is left in place rather than reverted — a crash is not proof the
 * work is bad.
 */
export type GateResultKind =
  'passed' | 'reverted' | 'no-commit' | 'checkpointed' | 'skipped' | 'unverifiable';

/** One gate command's outcome (GATE TRANSPARENCY) — which check, pass/fail, how long. */
export interface GateCheckResult {
  readonly label: string;
  readonly pass: boolean;
  readonly durationMs: number;
}

export interface FiringContext {
  readonly ts: string;
  readonly firing: number;
  readonly promptVersion: string;
  readonly retro: boolean;
  readonly attempts: number;
  readonly quotaFallback: boolean;
  readonly startedOn: StartedOn;
  readonly quotaStreak: number;
  readonly globalExhaust: boolean;
  readonly headAdvanced: boolean;
  /**
   * `vcs.head()` captured before the firing's model attempt ran — the
   * un-fakeable revert-range anchor (GATE HOLE 3, board web-mtb8hghd-72z52z):
   * persisted alongside `headAfter` so a multi-commit firing's revert is
   * auditable via SQL instead of only inferable from `headAdvanced`.
   */
  readonly headBefore: string;
  /** `vcs.head()` captured after the firing's (possibly extended) model attempt — see {@link headBefore}. */
  readonly headAfter: string;
  readonly shaVerified: boolean;
  readonly gateResult: GateResultKind;
  /** Per-command gate results — empty when the gate never ran (e.g. no commit). */
  readonly gateChecks: readonly GateCheckResult[];
  /**
   * Whether the final model attempt actually ran on a resumed CLI session
   * (docs/epics/0009-warm-sessions.md, `ports.ts`'s `ModelResponse.resumed`).
   * `null` when no resume was requested this firing (ordinary cold spawn).
   */
  readonly resumed: boolean | null;
  /**
   * Count of PreToolUse guard denials (containment / read-hygiene) observed
   * on the wire during this firing's final model attempt (headless surfacing
   * sweep, board web-msnqqjmd-9bx0wd) — `ports.ts`'s
   * `ModelResponse.guardDenials`, defaulted to 0 by the caller since only a
   * streaming driver can see it.
   */
  readonly guardDenials: number;
  /**
   * Structured guard-denial rows (kind + target) this firing's final model
   * attempt saw (GUARD-DENIAL telemetry, board web-msr0ug27-hj1w27) — same
   * wire data as {@link guardDenials}, kept structured so `buildFiringRecord`
   * can thread it onto {@link FiringRecord.guardDenialDetails} for the
   * orchestrator to persist as events rows. `[]` whenever {@link guardDenials}
   * is `0`.
   */
  readonly guardDenialDetails: readonly GuardDenialDetail[];
  /**
   * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) —
   * `config.ts`'s `subscriptionPriceUsd`, threaded through so
   * `buildFiringRecord` can derive `realCostUsd` without importing config
   * itself (this module stays pure/config-agnostic). `null` when unconfigured.
   */
  readonly subscriptionPriceUsd: number | null;
  /**
   * Cost semantics v3 — this FLIGHT's machine-wide trailing-30-day
   * list-price-equivalent usage pool total (`usage-pool-scan.ts`'s
   * `scanUsagePoolListPriceUsd`), computed ONCE per flight by `loop.ts` and
   * threaded to every firing rather than rescanned per firing (a filesystem
   * scan is comparatively expensive and the pool barely moves within one
   * flight). `null` when unconfigured or the pool was entirely unreadable.
   */
  readonly machineWide30dListPriceUsd: number | null;
}

export interface FiringRecord {
  readonly ts: string;
  readonly firing: number;
  readonly promptVersion: string;
  readonly model: string;
  readonly retro: boolean;
  readonly attempts: number;
  readonly quotaFallback: boolean;
  readonly startedOn: StartedOn;
  readonly quotaStreak: number;
  readonly globalExhaust: boolean;
  readonly exitCode: number;
  readonly isError: boolean | null;
  readonly stopReason: string | null;
  readonly maxTurnsHit: boolean;
  readonly numTurns: number | null;
  readonly durationMs: number | null;
  readonly costUsd: number | null;
  /**
   * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) — `costUsd`
   * scaled by the subscription's real fixed price over the machine-wide
   * trailing-30-day usage pool it was drawn from (`usage-pool.ts`'s
   * `computeRealCostUsd`). Additive alongside `costUsd`, never a
   * replacement — `null` whenever `subscriptionPriceUsd` or the pool total
   * is unconfigured/unreadable, never a fabricated number.
   */
  readonly realCostUsd: number | null;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheRead: number | null;
  readonly cacheCreate: number | null;
  readonly iterMetrics: IterMetrics;
  readonly item: string | null;
  readonly outcome: string | null;
  readonly shipped: boolean;
  /**
   * Whether a shipped firing finished its linked board task ('complete') or
   * only advanced it ('slice' — the board task must stay open). Null when
   * unknown (no self-report and nothing was inferred, or the firing didn't
   * ship at all) — callers that gate task-closing on this treat null as
   * 'complete' to preserve every firing's behavior before this field existed.
   */
  readonly completion: Completion | null;
  /**
   * True when this firing SHIPPED (the un-fakeable, gate-verified `shipped`
   * verdict above — not the raw self-report) but the self-report omitted the
   * completion tag the prompt now REQUIRES on every shipped METRICS line
   * (board web-msnshawt-1yd7px; prompt contract landed in a43f088d). A
   * derived/inferred ship (no self-report at all) is never flagged — there
   * was no self-report to omit the tag from, and `completion` is trusted
   * 'complete' for that path already. Lets the study/dashboard separate a
   * genuine prompt-compliance gap from `completion`'s own null-means-complete
   * fallback instead of the violation silently vanishing into it.
   */
  readonly completionMissing: boolean;
  readonly gateResult: GateResultKind;
  /** Per-command gate results (label + pass/fail + duration) — which checks ran. */
  readonly gateChecks: readonly GateCheckResult[];
  /**
   * Whether this firing's final model attempt ran on a resumed CLI session
   * (docs/epics/0009-warm-sessions.md's "measurable win" signal): `true`
   * resumed, `false` a resume was requested but fell back to cold, `null`
   * no resume was requested at all. Correlate against `cacheRead`/`tokensIn`
   * across firings to demonstrate the win the epic still owes.
   */
  readonly resumed: boolean | null;
  /**
   * Count of PreToolUse guard denials (containment / read-hygiene) this
   * firing's final model attempt saw — see {@link FiringContext.guardDenials}.
   * `0` when none were observed or the driver can't see them (non-streaming).
   */
  readonly guardDenials: number;
  /**
   * Structured guard-denial rows (kind + target) this firing's final model
   * attempt saw — see {@link FiringContext.guardDenialDetails}. `[]` when
   * none were observed or the driver can't see them (non-streaming); the
   * orchestrator persists each as its own `events` row (`type:
   * 'guard-denial'`) so the anomalies panel and activity log can surface them.
   */
  readonly guardDenialDetails: readonly GuardDenialDetail[];
  readonly sha: string | null;
  readonly shaVerified: boolean;
  readonly headAdvanced: boolean;
  /** See {@link FiringContext.headBefore} — the un-fakeable revert-range anchor. */
  readonly headBefore: string;
  /** See {@link FiringContext.headAfter}. */
  readonly headAfter: string;
  readonly testsBefore: number | null;
  readonly testsAfter: number | null;
  readonly testsDelta: number | null;
  readonly verifierUsed: string | null;
  readonly kind: string | null;
  readonly area: string | null;
  readonly deferredTo: string | null;
  /** Self-reported TDD-first compliance on a `kind:"fix"` firing — see {@link SelfReport.testFirst}. */
  readonly testFirst: boolean | null;
  /** PICK DISCIPLINE — see {@link SelfReport.pickedRank}. */
  readonly pickedRank: number | null;
  /** PICK DISCIPLINE — see {@link SelfReport.deviationReason}. */
  readonly deviationReason: string | null;
  /**
   * The raw HEAD commit subject line (git log -1 --format=%s), independent of
   * `item`/`kind` derivation — so a free-pick ship with no board task can still
   * show its real commit title instead of an opaque id (HONEST HEADLINES).
   */
  readonly commitSubject: string | null;
  /**
   * Repo-relative paths the firing's shipped work touched — the D4 pipeline
   * view's file-lens grouping key (epic 0015's "span-attribute task in the
   * engine"), exported as the newline-joined `autopilot.files` span attribute.
   * The orchestrator computes it for gate-PASSED firings only, as the net
   * `headBefore`→`headAfter` diff (`VcsPort.changedFiles`); absent on every
   * other gate outcome — never a fabricated empty list.
   */
  readonly filesTouched?: readonly string[];
  /** Tasks the agent OFFERED for the operator's board (approval-only, never enacted). */
  readonly proposals?: readonly TaskProposal[];
  /**
   * Set when the zero-work-loss checkpoint commit itself failed (e.g. an
   * un-committable tree) — the firing stays honestly 'no-commit' rather than
   * 'checkpointed', but the reason is preserved here instead of swallowed.
   */
  readonly checkpointError?: string;
  /**
   * Set when the gate PORT itself threw (e.g. RemediatingGate's autoformat
   * commit/revert hit a git failure) instead of returning a crashed
   * GateResult — the firing records 'unverifiable' rather than propagating
   * the exception, but the reason is preserved here instead of swallowed.
   */
  readonly gateError?: string;
  /**
   * Set (true) when this firing died mid-unit and received a FINISH-LINE
   * EXTENSION — one bounded resume of its OWN session to close the unit or
   * cut a slice (founder policy 2026-08-20: whoever started, finishes; a
   * checkpoint hand-off makes a fresh firing re-pay orientation). Cost/turns/
   * token fields on this record are the SUM of both invocations. Absent for
   * every ordinary firing.
   */
  readonly extended?: boolean;
  /**
   * Set (true) when this firing's model attempt was killed by the CLI
   * driver's own wall-clock cap (THIRD CAP — `adapters/claude-cli.ts`'s
   * `DEFAULT_CLI_TIMEOUT_MS` / `AUTOPILOT_CLI_TIMEOUT_MS`) rather than an
   * ordinary crash or quota exhaustion — the failure mode that killed
   * firings envelope-less (cost 0, no METRICS) under contention before it
   * was distinguishable from a generic error. Absent for every ordinary firing.
   */
  readonly timedOut?: boolean;
}

/**
 * Merge two attempts' envelope facts into ONE honest record (FINISH-LINE
 * EXTENSION): resource fields (cost/turns/duration/tokens/cache) SUM
 * null-safely — both present adds, one present carries, both absent stays
 * null (never a fabricated 0) — while status-ish fields (model/exitCode/
 * isError/stopReason) come from the FINAL attempt: the extension's ending is
 * the firing's ending.
 */
export function mergeEnvelopeFacts(first: EnvelopeFacts, last: EnvelopeFacts): EnvelopeFacts {
  const add = (a: number | null, b: number | null): number | null =>
    a !== null && b !== null ? a + b : (a ?? b);
  return {
    model: last.model,
    exitCode: last.exitCode,
    isError: last.isError,
    stopReason: last.stopReason,
    numTurns: add(first.numTurns, last.numTurns),
    durationMs: add(first.durationMs, last.durationMs),
    costUsd: add(first.costUsd, last.costUsd),
    tokensIn: add(first.tokensIn, last.tokensIn),
    tokensOut: add(first.tokensOut, last.tokensOut),
    cacheRead: add(first.cacheRead, last.cacheRead),
    cacheCreate: add(first.cacheCreate, last.cacheCreate),
  };
}

/** True when the firing hit its turn ceiling (explicit stop reason or turn count). */
export function computeMaxTurnsHit(
  stopReason: string | null,
  numTurns: number | null,
  maxTurns: number,
): boolean {
  if (stopReason === 'max_turns') return true;
  return numTurns !== null && numTurns >= maxTurns;
}

/** Assemble the one immutable telemetry record persisted per firing. */
export function buildFiringRecord(
  ctx: FiringContext,
  env: EnvelopeFacts,
  iter: ResolvedIteration,
  maxTurns: number,
  commitSubject: string | null = null,
): FiringRecord {
  const maxTurnsHit = computeMaxTurnsHit(env.stopReason, env.numTurns, maxTurns);
  const testsDelta =
    iter.testsBefore !== null && iter.testsAfter !== null
      ? iter.testsAfter - iter.testsBefore
      : null;
  // Un-fakeable (G2): git is ground truth either way. A self-report of "shipped"
  // with no commit, or a reverted commit, both record shipped=false regardless of
  // what the agent said (nothing to fake by claiming success). Symmetrically —
  // telemetry fairness — a gate-passed, sha-verified commit (real work, actually
  // gated, actually in history) records shipped=true even when the agent
  // mislabels it (e.g. "noop"), so an honest firing is never undercounted.
  const reverted = ctx.gateResult === 'reverted';
  const gateVerifiedShip = ctx.gateResult === 'passed' && ctx.shaVerified;
  const shipped = gateVerifiedShip || (ctx.gateResult === 'passed' && iter.outcome === 'shipped');
  const outcome = reverted ? 'reverted' : shipped ? 'shipped' : iter.outcome;
  const item = shipped ? (iter.item ?? 'inferred') : iter.item;
  return {
    ts: ctx.ts,
    firing: ctx.firing,
    promptVersion: ctx.promptVersion,
    model: env.model,
    retro: ctx.retro,
    attempts: ctx.attempts,
    quotaFallback: ctx.quotaFallback,
    startedOn: ctx.startedOn,
    quotaStreak: ctx.quotaStreak,
    globalExhaust: ctx.globalExhaust,
    exitCode: env.exitCode,
    isError: env.isError,
    stopReason: env.stopReason,
    maxTurnsHit,
    numTurns: env.numTurns,
    durationMs: env.durationMs,
    costUsd: env.costUsd,
    realCostUsd: computeRealCostUsd(
      env.costUsd,
      ctx.subscriptionPriceUsd,
      ctx.machineWide30dListPriceUsd,
    ),
    tokensIn: env.tokensIn,
    tokensOut: env.tokensOut,
    cacheRead: env.cacheRead,
    cacheCreate: env.cacheCreate,
    iterMetrics: iter.iterMetrics,
    item,
    outcome,
    shipped,
    completion: iter.completion,
    completionMissing: shipped && iter.completion === null,
    gateResult: ctx.gateResult,
    gateChecks: ctx.gateChecks,
    resumed: ctx.resumed,
    guardDenials: ctx.guardDenials,
    guardDenialDetails: ctx.guardDenialDetails,
    sha: iter.sha,
    shaVerified: ctx.shaVerified,
    headAdvanced: ctx.headAdvanced,
    headBefore: ctx.headBefore,
    headAfter: ctx.headAfter,
    testsBefore: iter.testsBefore,
    testsAfter: iter.testsAfter,
    testsDelta,
    verifierUsed: iter.verifierUsed,
    kind: iter.kind,
    area: iter.area,
    deferredTo: iter.deferredTo,
    testFirst: iter.testFirst,
    pickedRank: iter.pickedRank,
    deviationReason: iter.deviationReason,
    commitSubject,
  };
}

/** Cost/churn guard: a firing that errored, truncated, or lost its envelope. */
export function isBadFiring(
  env: EnvelopeFacts,
  iterMetrics: IterMetrics,
  maxTurnsHit: boolean,
): boolean {
  return (
    env.isError === true || maxTurnsHit || iterMetrics === 'envelope-error' || env.exitCode !== 0
  );
}

/**
 * How a true no-commit firing contributed (EVALUATION-2026-08-20-sota.md
 * §3.2/§4 lever 6, NOOP→VERDICT): 'verdict-carrying' when it emitted at least
 * one PROPOSALS entry (a split/close/deprioritize/blocked verdict on the work
 * it considered, via the same channel the empty-board flow already uses —
 * see `prompt.ts`'s NOOP→VERDICT section) — real, telemetry-countable
 * information. 'silent' when it emitted none — the waste this lever targets.
 */
export type NoopClass = 'verdict-carrying' | 'silent';

/**
 * Classify a firing's no-commit ending, or `null` when `gateResult` isn't
 * 'no-commit' at all (something shipped, reverted, or was checkpointed —
 * verdict classification only applies to a TRUE no-commit ending).
 */
export function classifyNoop(
  gateResult: GateResultKind,
  proposals: readonly TaskProposal[] | undefined,
): NoopClass | null {
  if (gateResult !== 'no-commit') return null;
  return proposals !== undefined && proposals.length > 0 ? 'verdict-carrying' : 'silent';
}
