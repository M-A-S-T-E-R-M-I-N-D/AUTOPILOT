// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE FLEET REPORT (2026-09-25): one repeatable evaluation of how a fleet
 * spends its firings, so every round is judged the same way instead of by a
 * script written for the occasion.
 *
 * It answers the questions the 2026-09-24/25 evaluations had to answer by
 * hand: what the firings worked on (product work, docs, tests, verdict
 * re-checks), how each ended, what a shipped commit cost, which lane carried
 * the spend, and — the finding those evaluations surfaced — what the
 * convergence gate said after each sync-back: a red on a fast-forward is a
 * lane's own commit failing a check its per-firing gate never ran, a red on
 * a merge is an interaction, and a crash is no verdict at all.
 *
 * Pure over rows; `control/cli.ts`'s `fleet-report` command reads the store.
 */

/** One firing, as the report needs it. */
export interface ReportFiring {
  readonly firingId: string;
  readonly title: string | null;
  readonly subject: string | null;
  readonly shipped: boolean;
  readonly died: string | null;
  readonly noopClass: string | null;
  readonly gateResult: string | null;
  /** `null` when the firing's record carries no priced cost: a Codex or
   *  Gemini run, whose CLI reports none, or a run killed before its envelope.
   *  Unknown, never $0 (epic 0036's cost rule). */
  readonly costUsd: number | null;
  readonly durationMs: number;
  readonly model: string | null;
  /** The CLI the firing flew on (`claude`, `codex`, `gemini`), or `null` for
   *  a record that names none: one written before the field existed. */
  readonly engine: string | null;
}

/** One convergence gate verdict after a sync-back. */
export interface ReportConvergence {
  readonly verdict: 'green' | 'red';
  readonly check: string | null;
  readonly merge: string | null;
  readonly queuedMs?: number | undefined;
}

export type TaskClass =
  | 'product'
  | 'test'
  | 'docs'
  | 'chore'
  | 'verdict'
  | 'meta-check'
  | 'convergence-red'
  | 'no commit';

/** What a firing worked on, from its board title and its commit subject. */
export function taskClass(title: string | null, subject: string | null): TaskClass {
  const t = (title ?? '').trim();
  const upper = t.toUpperCase();
  if (upper.startsWith('CONVERGENCE RED')) return 'convergence-red';
  if (upper.startsWith('VERDICT') || (subject ?? '').includes('(VERDICT ')) return 'verdict';
  if (upper.startsWith('VERIFY') || upper.startsWith('DOC-FRESHNESS')) return 'meta-check';
  if (subject === null || subject === '') return 'no commit';
  const kind = subject.split(/[(:!]/, 1)[0] ?? '';
  if (kind === 'feat' || kind === 'fix' || kind === 'perf' || kind === 'refactor') return 'product';
  if (kind === 'test') return 'test';
  if (kind === 'docs') return 'docs';
  return 'chore';
}

/** A firing's `died` when the account-wide quota killed it before it could
 *  work (2026-09-29: round 37's ten firings each died in a second at $0). */
export const QUOTA_DEATH = 'quota';

/** How a firing ended. */
export function firingOutcome(f: ReportFiring): string {
  if (f.died !== null) return `died (${f.died})`;
  if (f.shipped) return 'shipped';
  if (f.noopClass !== null) return `no commit (${f.noopClass})`;
  return `not shipped (${f.gateResult ?? 'unknown'})`;
}

/** The lane a firing flew in: `base`, or the `fleet-N` suffix of its id. */
export function laneOf(firingId: string): string {
  const head = firingId.split(':', 1)[0] ?? '';
  const at = head.indexOf('--');
  return at === -1 ? 'base' : head.slice(at + 2);
}

export interface FiringSummary {
  readonly firings: number;
  readonly shipped: number;
  readonly died: number;
  /** What the priced firings cost; an unpriced one adds nothing it never reported. */
  readonly costUsd: number;
  /** Firings whose cost is unknown, left out of both cost figures. */
  readonly unpriced: number;
  /** The priced firings' cost over their own ships, so a lane whose engine
   *  reports no price neither looks free nor cheapens the others' ships.
   *  `null` when no priced firing shipped — a cost per zero ships is not a number. */
  readonly costPerShipUsd: number | null;
  readonly medianMinutes: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function summarizeFirings(firings: readonly ReportFiring[]): FiringSummary {
  const priced = firings.filter((f) => f.costUsd !== null);
  const pricedShips = priced.filter((f) => f.shipped).length;
  const costUsd = priced.reduce((sum, f) => sum + f.costUsd!, 0);
  return {
    firings: firings.length,
    shipped: firings.filter((f) => f.shipped).length,
    died: firings.filter((f) => f.died !== null).length,
    costUsd,
    unpriced: firings.length - priced.length,
    costPerShipUsd: pricedShips === 0 ? null : costUsd / pricedShips,
    medianMinutes: median(firings.map((f) => f.durationMs / 60_000)),
  };
}

export interface ConvergenceSummary {
  readonly green: number;
  /** A red on a fast-forward: the lane's own commit, failing a check its
   *  per-firing gate does not run. */
  readonly redOwnCommit: number;
  /** A red on a real merge: either side, or the two together. */
  readonly redMerge: number;
  /** A gate that crashed or never ran: no verdict. */
  readonly unjudged: number;
  /** Failing checks among the reds that carried a verdict, most frequent first. */
  readonly failingChecks: readonly (readonly [string, number])[];
  /** Median seconds a gate waited for a slot, over the verdicts that recorded it. */
  readonly medianQueuedSeconds: number | null;
}

function isUnjudged(check: string | null): boolean {
  return check === null || check.includes('(crashed') || check.startsWith('lane fast-forward');
}

export function summarizeConvergence(rows: readonly ReportConvergence[]): ConvergenceSummary {
  const reds = rows.filter((r) => r.verdict === 'red');
  const judged = reds.filter((r) => !isUnjudged(r.check));
  const counts = new Map<string, number>();
  for (const r of judged) counts.set(r.check!, (counts.get(r.check!) ?? 0) + 1);
  const queued = rows.flatMap((r) => (r.queuedMs === undefined ? [] : [r.queuedMs / 1000]));
  return {
    green: rows.length - reds.length,
    redOwnCommit: judged.filter((r) => (r.merge ?? '').startsWith('fast-forwarded')).length,
    redMerge: judged.filter((r) => !(r.merge ?? '').startsWith('fast-forwarded')).length,
    unjudged: reds.length - judged.length,
    failingChecks: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    medianQueuedSeconds: queued.length === 0 ? null : median(queued),
  };
}

/** One attempt by the merge-escalation agent (rung 4 of the sync-back
 *  conflict ladder): the `{kind, details}` of a `merge-escalation` event,
 *  which `fly.ts` records for every attempt, resolved or not. */
export interface ReportEscalation {
  readonly kind: string;
  readonly details: string;
}

export interface EscalationSummary {
  readonly attempts: number;
  readonly resolved: number;
  /** Failed attempts by kind, most frequent first. The kind says which step
   *  stopped the agent: the invocation, an unresolved path, the gate or the
   *  commit. */
  readonly failures: readonly (readonly [string, number])[];
  /** The newest failed attempt, or `null` when none failed. */
  readonly latestFailure: ReportEscalation | null;
}

/** Rung 4's record over rows oldest first, as `readReportEscalations` reads them. */
export function summarizeEscalations(rows: readonly ReportEscalation[]): EscalationSummary {
  const failed = rows.filter((r) => r.kind !== 'resolved');
  const counts = new Map<string, number>();
  for (const r of failed) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
  return {
    attempts: rows.length,
    resolved: rows.length - failed.length,
    failures: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    latestFailure: failed.at(-1) ?? null,
  };
}

/** A failure's details fit one report line: the first non-blank line, capped. */
const FAILURE_LINE_MAX = 160;

function firstLineCapped(text: string): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l !== '') ?? '';
  return line.length > FAILURE_LINE_MAX ? `${line.slice(0, FAILURE_LINE_MAX - 1)}…` : line;
}

/** The label column's width when every label in a section fits it. */
const LABEL_WIDTH = 18;

/** `width` is the section's label column: its longest label, at least
 *  {@link LABEL_WIDTH} — a fixed column let "claude-opus-5-5 · meta-check"
 *  push its numbers out of line with the rows around it. */
function summaryLine(label: string, s: FiringSummary, width = LABEL_WIDTH): string {
  const pct = (n: number): string => `${Math.round((n / Math.max(1, s.firings)) * 100)}%`;
  const perShip = s.costPerShipUsd === null ? '-' : `$${s.costPerShipUsd.toFixed(2)}`;
  // A group no firing of which reported a price has no cost to print: a
  // $0.00 there would read as free.
  const cost =
    s.firings > 0 && s.unpriced === s.firings
      ? '-'.padStart(8)
      : `$${s.costUsd.toFixed(2).padStart(7)}`;
  return (
    `  ${label.padEnd(width)} ${String(s.firings).padStart(4)} firings  ` +
    `shipped ${pct(s.shipped).padStart(4)}  died ${pct(s.died).padStart(4)}  ` +
    `${cost}  per ship ${perShip.padStart(7)}  ` +
    `median ${s.medianMinutes.toFixed(1)} min` +
    (s.unpriced > 0 ? `  unpriced ${s.unpriced}` : '')
  );
}

function grouped(
  firings: readonly ReportFiring[],
  key: (f: ReportFiring) => string,
): [string, ReportFiring[]][] {
  const groups = new Map<string, ReportFiring[]>();
  for (const f of firings) {
    const k = key(f);
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  return [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
}

/** A lane branch holding commits the flight branch does not have. */
export interface ParkedLane {
  readonly branch: string;
  readonly commits: number;
}

/** The whole report as printable lines. `parked` lists lanes whose commits
 *  never reached the flight branch — work a firing record calls shipped
 *  that no landing can carry (2026-09-25: a whole flight of one lane's
 *  work sat parked behind an aborted sync-back). `escalations` is rung 4's
 *  record: how often the merge-escalation agent resolved a conflicting
 *  sync-back, and what stopped it when it did not. */
export function renderFleetReport(
  firings: readonly ReportFiring[],
  convergence: readonly ReportConvergence[],
  window: string,
  parked: readonly ParkedLane[] = [],
  escalations: readonly ReportEscalation[] = [],
): string[] {
  const lines = [`fleet report — ${window}`, summaryLine('all', summarizeFirings(firings))];
  const section = (title: string, key: (f: ReportFiring) => string, pool = firings): void => {
    lines.push('', `by ${title}`);
    const groups = grouped(pool, key);
    const width = Math.max(LABEL_WIDTH, ...groups.map(([k]) => k.length));
    for (const [k, g] of groups) lines.push(summaryLine(k, summarizeFirings(g), width));
    const left = firings.length - pool.length;
    if (left > 0) {
      lines.push(`  left out: ${left} firing${left === 1 ? '' : 's'} the account quota killed`);
    }
  };
  section('what it worked on', (f) => taskClass(f.title, f.subject));
  section('outcome', firingOutcome);
  section('lane', (f) => laneOf(f.firingId));
  // A firing the account-wide quota killed says nothing about the engine or
  // the model it was routed to, so the engine and model sections leave it
  // out — as the model scoreboard and the benchmark do.
  const judged = firings.filter((f) => f.died !== QUOTA_DEATH);
  // Epic 0036: lanes of one fleet can fly different CLIs, each judged on
  // its own firings. A record that names no engine stays unrecorded, never
  // taken for Claude's.
  section('engine', (f) => f.engine ?? 'unrecorded', judged);
  section('model', (f) => f.model ?? 'unrecorded', judged);
  // THE MODEL BENCHMARK (2026-09-25): arms compared on the same kind of work,
  // so a model is not credited for the easier tasks it happened to draw.
  section(
    'model and work',
    (f) => `${f.model ?? 'unrecorded'} · ${taskClass(f.title, f.subject)}`,
    judged,
  );
  const c = summarizeConvergence(convergence);
  lines.push(
    '',
    'convergence after sync-back',
    `  green ${c.green}  red on a lane's own commit ${c.redOwnCommit}  red on a merge ${c.redMerge}  no verdict ${c.unjudged}`,
  );
  for (const [check, n] of c.failingChecks) lines.push(`  ${String(n).padStart(3)}× ${check}`);
  if (c.medianQueuedSeconds !== null) {
    lines.push(`  median wait for a gate slot: ${Math.round(c.medianQueuedSeconds)}s`);
  }
  const e = summarizeEscalations(escalations);
  lines.push('', 'rung 4: the merge-escalation agent at a conflicting sync-back');
  if (e.attempts === 0) lines.push('  none');
  else lines.push(`  attempts ${e.attempts}  resolved ${e.resolved}`);
  for (const [kind, n] of e.failures) lines.push(`  ${String(n).padStart(3)}× ${kind}`);
  if (e.latestFailure !== null) {
    const { kind, details } = e.latestFailure;
    lines.push(`  latest failure (${kind}): ${firstLineCapped(details)}`);
  }
  const stuck = parked.filter((p) => p.commits > 0);
  lines.push('', 'commits parked on a lane, not on the flight branch');
  if (stuck.length === 0) lines.push('  none');
  for (const p of stuck) lines.push(`  ${String(p.commits).padStart(3)} on ${p.branch}`);
  return lines;
}
