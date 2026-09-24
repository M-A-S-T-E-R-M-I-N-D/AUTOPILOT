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
  readonly costUsd: number;
  readonly durationMs: number;
  readonly model: string | null;
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
  readonly costUsd: number;
  /** `null` when nothing shipped — a cost per zero ships is not a number. */
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
  const shipped = firings.filter((f) => f.shipped).length;
  const costUsd = firings.reduce((sum, f) => sum + f.costUsd, 0);
  return {
    firings: firings.length,
    shipped,
    died: firings.filter((f) => f.died !== null).length,
    costUsd,
    costPerShipUsd: shipped === 0 ? null : costUsd / shipped,
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

function summaryLine(label: string, s: FiringSummary): string {
  const pct = (n: number): string => `${Math.round((n / Math.max(1, s.firings)) * 100)}%`;
  const perShip = s.costPerShipUsd === null ? '-' : `$${s.costPerShipUsd.toFixed(2)}`;
  return (
    `  ${label.padEnd(18)} ${String(s.firings).padStart(4)} firings  ` +
    `shipped ${pct(s.shipped).padStart(4)}  died ${pct(s.died).padStart(4)}  ` +
    `$${s.costUsd.toFixed(2).padStart(7)}  per ship ${perShip.padStart(7)}  ` +
    `median ${s.medianMinutes.toFixed(1)} min`
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

/** The whole report as printable lines. */
export function renderFleetReport(
  firings: readonly ReportFiring[],
  convergence: readonly ReportConvergence[],
  window: string,
): string[] {
  const lines = [`fleet report — ${window}`, summaryLine('all', summarizeFirings(firings))];
  const section = (title: string, key: (f: ReportFiring) => string): void => {
    lines.push('', `by ${title}`);
    for (const [k, g] of grouped(firings, key)) lines.push(summaryLine(k, summarizeFirings(g)));
  };
  section('what it worked on', (f) => taskClass(f.title, f.subject));
  section('outcome', firingOutcome);
  section('lane', (f) => laneOf(f.firingId));
  section('model', (f) => f.model ?? 'unrecorded');
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
  return lines;
}
