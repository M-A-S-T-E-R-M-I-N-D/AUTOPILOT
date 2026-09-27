// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ROUND EVALUATION, BY ITSELF (operator, 2026-09-27: "make sure the
 * system does the evaluation automatically, as part of the documentation").
 *
 * Every round used to be evaluated by hand: someone ran `dashboard
 * fleet-report` after the last lane landed and read the numbers into a
 * conversation, where they stayed. Now the lane that ends a round — elected,
 * see {@link endRound} — writes the evaluation itself:
 *
 *   - always, as a `round-evaluation` event: firings, ships, cost per ship,
 *     convergence reds, the window it covers — the record the dashboard and
 *     later rounds read;
 *   - when the project has evaluation docs on (`dashboard evaluation-docs
 *     on`), also as a section appended to `docs/evaluations/ROUNDS-YYYY-MM.md`
 *     and committed on the flight branch with the round, so the evaluation
 *     lands with the work it judges and is read where the docs are read.
 *
 * The section is the same report the CLI prints — outcomes by class, lane,
 * model and work, convergence, parked lanes — and the model scoreboard, in
 * fenced blocks so no formatter rewrites a number. It never names a commit
 * or links anywhere, so the doc checks have nothing to trip on. A dirty
 * checkout skips the commit and says so; the event is written regardless.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Store } from '@autopilot/store';
import { renderFleetReport, summarizeConvergence, summarizeFirings } from '../read/fleet-report.js';
import {
  readParkedLanes,
  readReportConvergence,
  readReportFirings,
} from '../read/fleet-report-source.js';
import { readRoutedFirings, renderScoreboard } from './model-scoreboard.js';

export const ROUND_EVALUATION_EVENT = 'round-evaluation';
const DOCS_SETTING_EVENT = 'evaluation-docs-setting';

/** How far before this lane's own start the round is read from: the lanes of
 *  one fleet start within seconds of each other, so a few minutes of slack
 *  covers every sibling without reaching into the previous round. */
export const ROUND_START_SLACK_MS = 5 * 60 * 1000;

/** Whether this project's round evaluations are written into its docs. */
export function isEvaluationDocsOn(store: Store, projectId: string): boolean {
  const row = store.db
    .prepare(
      `SELECT payload FROM events WHERE project_id = ? AND type = ?
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(projectId, DOCS_SETTING_EVENT) as { payload: string | null } | undefined;
  if (!row?.payload) return false;
  try {
    return (JSON.parse(row.payload) as { enabled?: unknown }).enabled === true;
  } catch {
    return false;
  }
}

/** Turn the written evaluation on or off for one project. */
export function setEvaluationDocs(
  store: Store,
  projectId: string,
  enabled: boolean,
  at: number,
): boolean {
  try {
    return (
      store.db
        .prepare(
          'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
        )
        .run(projectId, DOCS_SETTING_EVENT, JSON.stringify({ enabled }), at).changes > 0
    );
  } catch {
    return false;
  }
}

/** The numbers a round is remembered by. */
export interface RoundSummary {
  readonly startedAt: number;
  readonly endedAt: number;
  readonly firings: number;
  readonly shipped: number;
  readonly costUsd: number;
  readonly costPerShipUsd: number | null;
  readonly convergenceGreen: number;
  readonly convergenceRed: number;
}

/** The report text and the numbers for one round, read from the store. */
export function evaluateRound(
  store: Store,
  projectId: string,
  target: string,
  startedAt: number,
  endedAt: number,
): { summary: RoundSummary; reportLines: string[]; scoreboardLines: string[] } {
  const firings = readReportFirings(store.db, projectId, startedAt);
  const convergence = readReportConvergence(store.db, projectId, startedAt);
  const window = `${projectId}, round from ${isoMinute(startedAt)} to ${isoMinute(endedAt)} UTC`;
  const reportLines = renderFleetReport(
    firings,
    convergence,
    window,
    parkedLanesOrNone(target, projectId),
  );
  const scoreboardLines = renderScoreboard(readRoutedFirings(store, projectId, endedAt));
  const f = summarizeFirings(firings);
  const c = summarizeConvergence(convergence);
  return {
    summary: {
      startedAt,
      endedAt,
      firings: f.firings,
      shipped: f.shipped,
      costUsd: f.costUsd,
      costPerShipUsd: f.costPerShipUsd,
      convergenceGreen: c.green,
      convergenceRed: c.redOwnCommit + c.redMerge,
    },
    reportLines,
    scoreboardLines,
  };
}

/** Lanes holding commits the flight branch lacks; none when git cannot say. */
function parkedLanesOrNone(target: string, projectId: string): ReturnType<typeof readParkedLanes> {
  try {
    return readParkedLanes(target, projectId);
  } catch {
    return [];
  }
}

function isoMinute(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
}

/** The one-line headline a round is listed under. */
export function roundHeadline(s: RoundSummary): string {
  const rate = s.firings === 0 ? '-' : `${Math.round((s.shipped / s.firings) * 100)}%`;
  const per = s.costPerShipUsd === null ? '-' : `$${s.costPerShipUsd.toFixed(2)}`;
  return `${s.shipped}/${s.firings} shipped (${rate}), ${per} per ship, ${s.convergenceRed} convergence red`;
}

/** The evaluation commit's header — short enough for commitlint's 100. */
export function roundCommitHeader(s: RoundSummary): string {
  // A date, never a clock time: the commit log is public, and a wall-clock
  // time is session detail the commitlint rule no-operator-private-context
  // flags. The evaluation document itself keeps the times — it is the record.
  const day = new Date(s.endedAt).toISOString().slice(0, 10);
  const per = s.costPerShipUsd === null ? 'no ship' : `$${s.costPerShipUsd.toFixed(2)} per ship`;
  return `docs(evaluation): a round of ${s.firings} firings on ${day}, ${s.shipped} shipped, ${per}`;
}

/** One round as a markdown section: headline, then the report and the
 *  scoreboard verbatim in fenced blocks. */
export function renderRoundSection(
  s: RoundSummary,
  reportLines: readonly string[],
  scoreboardLines: readonly string[],
): string {
  return [
    `## Round ending ${isoMinute(s.endedAt)} UTC`,
    '',
    `${roundHeadline(s)}. Written by the lane that ended the round.`,
    '',
    '```text',
    ...reportLines,
    '',
    ...scoreboardLines,
    '```',
    '',
  ].join('\n');
}

/** Where a round ending at `endedAt` is written, relative to the repo. */
export function evaluationDocPath(endedAt: number): string {
  return `docs/evaluations/ROUNDS-${new Date(endedAt).toISOString().slice(0, 7)}.md`;
}

/**
 * The repo's OWN licence header, when its docs carry one: the leading
 * `<!-- … SPDX- … -->` comment of `docs/README.md` or `README.md`, copied
 * verbatim. This writes into whatever repo the fleet flies — it must never
 * stamp AUTOPILOT's copyright onto someone else's documentation.
 */
export function repoDocHeader(root: string): string | null {
  for (const rel of ['docs/README.md', 'README.md']) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    const match = /^<!--[\s\S]*?-->/.exec(text);
    if (match && match[0].includes('SPDX-')) return match[0];
  }
  return null;
}

function monthHeader(root: string, endedAt: number): string {
  const month = new Date(endedAt).toISOString().slice(0, 7);
  const licence = repoDocHeader(root);
  return [
    ...(licence === null ? [] : [licence, '']),
    `# Round evaluations, ${month}`,
    '',
    'Every round of the fleet, evaluated by the fleet itself when its last lane',
    'ends: what shipped, what it cost, which model flew which work, and how the',
    'merged head fared. See README.md in this folder for how it is made.',
    '',
  ].join('\n');
}

/** Append the section to its month's file under `root`, creating the file
 *  with its header the first time. Returns the repo-relative path. */
export function appendRoundSection(root: string, endedAt: number, section: string): string {
  const rel = evaluationDocPath(endedAt);
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${monthHeader(root, endedAt)}\n${section}`);
  } else {
    appendFileSync(abs, `\n${section}`);
  }
  return rel;
}

/** Record the round as an event, whatever happens to the doc. */
export function recordRoundEvaluation(
  store: Store,
  projectId: string,
  summary: RoundSummary,
  docPath: string | null,
): void {
  store.db
    .prepare(
      'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
    )
    .run(
      projectId,
      ROUND_EVALUATION_EVENT,
      JSON.stringify({ ...summary, docPath }),
      summary.endedAt,
    );
}

/** Git as the round's writer needs it: run in the primary checkout. */
export type RoundGit = (args: readonly string[]) => string;

export function gitIn(root: string): RoundGit {
  return (args) =>
    execFileSync('git', [...args], { cwd: root, encoding: 'utf8', windowsHide: true });
}

/**
 * The whole step, as the round's last lane runs it: evaluate, write the doc
 * when the project wants it and the checkout is clean, commit it, and record
 * the event. Never throws — an evaluation that cannot be written is said,
 * not allowed to fail the flight.
 */
export function writeRoundEvaluation(deps: {
  readonly store: Store;
  readonly projectId: string;
  readonly target: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly git: RoundGit;
  readonly out: (line: string) => void;
}): RoundSummary | null {
  const { store, projectId, target, startedAt, endedAt, git, out } = deps;
  let evaluation: ReturnType<typeof evaluateRound>;
  try {
    evaluation = evaluateRound(store, projectId, target, startedAt, endedAt);
  } catch (err) {
    out(`  ⚠ round evaluation could not be read: ${String(err)}`);
    return null;
  }
  const { summary, reportLines, scoreboardLines } = evaluation;
  let docPath: string | null = null;
  if (isEvaluationDocsOn(store, projectId)) {
    try {
      if (git(['status', '--porcelain']).trim() !== '') {
        out('  ⚠ round evaluation doc skipped: the checkout has uncommitted changes');
      } else {
        docPath = appendRoundSection(
          target,
          endedAt,
          renderRoundSection(summary, reportLines, scoreboardLines),
        );
        git(['add', '--', docPath]);
        git(['commit', '-q', '-s', '-m', roundCommitHeader(summary)]);
      }
    } catch (err) {
      out(`  ⚠ round evaluation doc not committed: ${String(err).split('\n')[0]}`);
      docPath = null;
    }
  }
  try {
    recordRoundEvaluation(store, projectId, summary, docPath);
  } catch {
    /* the event is best-effort — never fail the flight over it */
  }
  out(
    `  📊 round evaluated: ${roundHeadline(summary)}${docPath ? ` — written to ${docPath}` : ''}`,
  );
  return summary;
}

/**
 * WHO ENDS THE ROUND (2026-09-27). The first cut let "no sibling still
 * flying" decide, and round 23 lost its evaluation to it: its last two lanes
 * ended eleven seconds apart, each saw the other's lock, each left the round
 * to the other, and neither wrote it. A lock cannot tell a sibling still
 * firing from one that is only finishing up — so a lane now says it is
 * finishing (a `lane-ending` event) BEFORE it looks at its siblings, and may
 * end the round only when every live sibling has said the same. The last
 * lane to say it therefore always sees everyone else finishing, so some lane
 * always qualifies; when two qualify at once, an atomic claim picks one.
 * The winner then waits for the others' locks to go — never committing into
 * a checkout a sibling is still syncing into — and writes the evaluation.
 */
const LANE_ENDING_EVENT = 'lane-ending';
const ROUND_CLAIM_EVENT = 'round-evaluation-claim';

/** How long the round's winner waits for its finishing siblings. */
export const ROUND_END_WAIT_MS = 15 * 60 * 1000;
const ROUND_END_POLL_MS = 5000;

/** Say this lane is finishing, before it looks at anyone else. */
export function recordLaneEnding(store: Store, projectId: string, pid: number, at: number): void {
  store.db
    .prepare(
      'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, NULL, ?, ?, ?)',
    )
    .run(projectId, LANE_ENDING_EVENT, JSON.stringify({ pid }), at);
}

/** The pids that have said they are finishing since `since`. */
export function endingPids(store: Store, projectId: string, since: number): Set<number> {
  const rows = store.db
    .prepare('SELECT payload FROM events WHERE project_id = ? AND type = ? AND created_at >= ?')
    .all(projectId, LANE_ENDING_EVENT, since) as { payload: string }[];
  const pids = new Set<number>();
  for (const r of rows) {
    try {
      const pid = (JSON.parse(r.payload) as { pid?: unknown }).pid;
      if (typeof pid === 'number') pids.add(pid);
    } catch {
      // a malformed row names no one
    }
  }
  return pids;
}

/** Claim the round's evaluation; true for exactly one caller per round.
 *  One INSERT … WHERE NOT EXISTS statement: SQLite runs it as a single write
 *  transaction, and under WAL a second claimer's stale snapshot fails with
 *  a busy error that the store's retry re-runs against the committed claim
 *  — so two lanes claiming in the same instant cannot both win. */
export function claimRoundEvaluation(
  store: Store,
  projectId: string,
  since: number,
  at: number,
  pid: number,
): boolean {
  const info = store.db
    .prepare(
      `INSERT INTO events (project_id, firing_id, type, payload, created_at)
       SELECT ?, NULL, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM events WHERE project_id = ? AND type = ? AND created_at >= ?
        )`,
    )
    .run(
      projectId,
      ROUND_CLAIM_EVENT,
      JSON.stringify({ pid }),
      at,
      projectId,
      ROUND_CLAIM_EVENT,
      since,
    );
  return info.changes === 1;
}

/** What the election came to, for the flight log and the tests. */
export type RoundEndOutcome = 'evaluated' | 'siblings-still-flying' | 'claimed-by-another-lane';

/** The whole ending: say so, see whether this lane ends the round, win the
 *  claim, wait for the finishing siblings, write the evaluation. */
export async function endRound(deps: {
  readonly store: Store;
  readonly projectId: string;
  readonly target: string;
  readonly pid: number;
  readonly startedAt: number;
  readonly now: () => number;
  /** Live sibling lock pids, this lane's own left out. */
  readonly siblingPids: () => readonly number[];
  readonly git: RoundGit;
  readonly out: (line: string) => void;
  readonly sleep: (ms: number) => Promise<void>;
  readonly waitMs?: number;
}): Promise<RoundEndOutcome> {
  const { store, projectId, pid, startedAt, now, siblingPids, out, sleep } = deps;
  recordLaneEnding(store, projectId, pid, now());
  const finishing = endingPids(store, projectId, startedAt);
  if (siblingPids().some((p) => !finishing.has(p))) return 'siblings-still-flying';
  if (!claimRoundEvaluation(store, projectId, startedAt, now(), pid)) {
    return 'claimed-by-another-lane';
  }
  const deadline = now() + (deps.waitMs ?? ROUND_END_WAIT_MS);
  while (siblingPids().length > 0 && now() < deadline) await sleep(ROUND_END_POLL_MS);
  if (siblingPids().length > 0) {
    out('  ⚠ round evaluation: a finishing sibling is still holding its lock — evaluating anyway');
  }
  writeRoundEvaluation({
    store,
    projectId,
    target: deps.target,
    startedAt,
    endedAt: now(),
    git: deps.git,
    out,
  });
  return 'evaluated';
}
