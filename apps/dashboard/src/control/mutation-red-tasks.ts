// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE NIGHTLY MUTATION RUN REACHES THE BOARD (operator, 2026-09-27: "the
 * fault keeps coming back"). mutation.yml failed night after night — 15
 * configs, 184 surviving mutants — and nothing filed a task, so nothing fixed
 * it: the post-push watch read ci.yml only, and a scheduled run has no
 * landing to watch it. The same "red nobody watches" class as the REUSE job
 * and the code-scanning alerts.
 *
 * After every landing the watch now also reads the latest completed
 * mutation.yml run. A red one files one board task per failing Stryker
 * config, carrying its surviving mutants (location, mutator, the mutated
 * line) and the commit the run judged, deduplicated by config and auto-queued
 * like any proposal. A config the latest run no longer lists as red closes
 * its task. Read-only against GitHub.
 */

import { createTask, setTaskStatus, type Store } from '@autopilot/store';
import type { GhRun } from './ci-status.js';

/** One surviving mutant as Stryker's clear-text reporter prints it. */
export interface SurvivingMutant {
  readonly mutator: string;
  readonly location: string;
  readonly replacement: string;
}

export interface MutationRedConfig {
  readonly config: string;
  readonly survivors: readonly SurvivingMutant[];
  /**
   * The runner's reason when the config failed WITHOUT Stryker scoring it —
   * "No tests were executed", a failed initial test run, a killed process —
   * so there is no survivor to kill (2026-10-03: those were filed as survivor
   * tasks). Absent when the run scored below the break threshold, and for a
   * FAILED line that gives no reason at all.
   */
  readonly unscored?: string;
}

const TITLE_PREFIX = 'MUTATION RED: ';
/** Printed by run-all-mutation.mjs right after a config's own Stryker output
 *  ("FAILED — <config>: <reason> (continuing; …)"), and again in the
 *  end-of-shard summary ("FAILED <config> — <reason>"). */
const FAILED_RE = /^run-all-mutation: FAILED(?: —)? (stryker\.[a-z0-9-]+\.config\.mjs)(.*)$/;
const REASON_RE = /^(?::| —) (.+?)(?: \(continuing; summary at the end\))?$/;
/** The runner's words for the one failure that leaves survivors (its
 *  `mutationFailureReason`); every other reason it gives never scored. */
const SCORED_MARK = 'below the break threshold';
// Stryker's clear-text block: "[Survived] Mutator", then "path:line:col",
// then "-  original" and "+  mutated".
const SURVIVED_RE = /^\[Survived\] (\S+)/;
const LOCATION_RE = /^(\S+?):(\d+):\d+$/;
const TASK_TITLE_RE = /^MUTATION RED: (stryker\.[a-z0-9-]+\.config\.mjs):/;
/** A run's head as `gh run list` reports it; anything else is never put in a URL. */
const SHA_RE = /^[0-9a-f]{7,40}$/;
const OPEN_STATUSES = new Set(['queued', 'in_progress', 'needs_approval']);
/** How many survivors a task body lists before it says "and N more". */
const SHOWN_SURVIVORS = 40;
const SHOWN_LINE_CHARS = 140;
/** How much of the judged commit a task names: git's own short form here is
 *  8 digits, and two more keep it unambiguous as the history grows. */
const JUDGED_SHA_CHARS = 10;

/** An ANSI colour code: ESC, then `[`, digits and `;`, then `m`. Built from a
 *  string because a control character in a regex literal is a lint error. */
const ANSI_COLOUR_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** The timestamp gh prefixes each log line with, and ANSI colour codes. */
function clean(line: string): string {
  return line
    .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z /, '')
    .replace(ANSI_COLOUR_RE, '')
    .trimEnd();
}

/** The reason after a FAILED line's config when it says the run never
 *  scored; undefined for a survivor, and for a line that gives no reason. */
function unscoredReason(afterConfig: string): string | undefined {
  const reason = REASON_RE.exec(afterConfig)?.[1];
  return reason === undefined || reason.includes(SCORED_MARK) ? undefined : reason;
}

/**
 * The failing configs of one mutation job log, each with the survivors its
 * Stryker run printed. The runner runs configs one after another and prints
 * a config's FAILED line straight after that config's output, so every
 * survivor since the previous FAILED line belongs to this one.
 */
export function parseMutationLog(log: string): MutationRedConfig[] {
  const lines = log.split('\n').map(clean);
  const byConfig = new Map<string, MutationRedConfig>();
  let pending: SurvivingMutant[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const failed = FAILED_RE.exec(lines[i]!);
    if (failed) {
      const config = failed[1]!;
      const unscored = unscoredReason(failed[2]!);
      byConfig.set(config, {
        config,
        survivors: [...(byConfig.get(config)?.survivors ?? []), ...pending],
        ...(unscored === undefined ? {} : { unscored }),
      });
      pending = [];
      continue;
    }
    const survived = SURVIVED_RE.exec(lines[i]!);
    const location = survived ? LOCATION_RE.exec(lines[i + 1] ?? '') : null;
    if (!survived || !location) continue;
    pending = [
      ...pending,
      {
        mutator: survived[1]!,
        location: `${location[1]}:${location[2]}`,
        replacement: (lines[i + 3] ?? '').replace(/^\+\s*/, '').trim(),
      },
    ];
  }
  return [...byConfig.values()].sort((a, b) => a.config.localeCompare(b.config));
}

/**
 * The task's title; `judged` is the commit the run judged, when it named one.
 * THE TITLE SAYS WHICH HEAD WAS RED (2026-09-30): four tasks topped the board
 * after their fixes had landed, and a firing sees only the title — naming the
 * head makes "is this still red?" one git log instead of a firing's worth of
 * turns.
 */
export function mutationRedTaskTitle(red: MutationRedConfig, judged?: string): string {
  const run = judged === undefined ? 'the nightly run' : `the nightly run on ${judged}`;
  if (red.unscored !== undefined) {
    return `${TITLE_PREFIX}${red.config}: ${run} never scored it — no mutant was tested, so fix the run, not the tests`;
  }
  const n = red.survivors.length;
  const what = n === 0 ? 'mutants' : `${n} mutant(s)`;
  return `${TITLE_PREFIX}${red.config}: ${what} survived ${run} — make the tests kill them`;
}

/** The git log that lists what landed on the survivors' files since the
 *  judged head. Each file is matched by name wherever it sits, so the test
 *  that usually carries the fix is listed with its source. */
function staleCheckOf(red: MutationRedConfig, judged: string): string {
  const names = new Set(
    red.survivors.map((m) => {
      const path = m.location.replace(/:\d+$/, '');
      return path.slice(path.lastIndexOf('/') + 1).replace(/\..*$/, '');
    }),
  );
  const paths = [...names].map((name) => ` '*/${name}.*'`).join('');
  return `The run judged ${judged}. Check \`git log --oneline ${judged}..HEAD${paths === '' ? '' : ` --${paths}`}\` first: a fix listed there is newer than the run's evidence, and the task only waits for the next nightly run to close it. Park it then with a \`VERDICT close\` naming this task's id: the board holds it until a later run rules on it.`;
}

/** The body for a config Stryker never scored: the runner's reason, and how
 *  to debug the run, since no test can kill a mutant no run has tested. */
function unscoredBodyOf(
  red: MutationRedConfig,
  reason: string,
  judged: string | undefined,
): string {
  return [
    `The nightly mutation run (mutation.yml) is red on ${red.config}, but not because a mutant survived: Stryker stopped before it scored one. The runner's reason: ${reason}.`,
    ...(judged === undefined ? [] : ['', staleCheckOf(red, judged)]),
    '',
    'No test can kill a mutant no run has tested, so the work is the run itself. "No tests were executed" or a failed initial test run usually means a test file cannot load inside the Stryker sandbox (a workspace import with no alias, or `related: true` finding nothing); docs/MUTATION-DEBT.md, "Six configs were testing nothing at all", works those cases through. A killed process is the environment (memory), not the config.',
    `Run it locally and keep the sandbox to look inside: pnpm exec stryker run config/mutation/${red.config} --cleanTempDir false`,
    'This task closes by itself once the config passes the nightly run.',
  ].join('\n');
}

function bodyOf(red: MutationRedConfig, judged: string | undefined): string {
  if (red.unscored !== undefined) return unscoredBodyOf(red, red.unscored, judged);
  const shown = red.survivors.slice(0, SHOWN_SURVIVORS);
  const rest = red.survivors.length - shown.length;
  return [
    `The nightly mutation run (mutation.yml) is red on ${red.config}: a mutant the tests do not kill is a change to that line nobody would notice.`,
    ...(judged === undefined ? [] : ['', staleCheckOf(red, judged)]),
    '',
    ...(shown.length === 0
      ? ['The survivors are listed in the run log.']
      : shown.map(
          (m) => `- ${m.location} — ${m.mutator}: \`${m.replacement.slice(0, SHOWN_LINE_CHARS)}\``,
        )),
    ...(rest > 0 ? [`- …and ${rest} more`] : []),
    '',
    'Kill each one with a test that fails under the mutation. Where a survivor is glue only a subprocess exercises, export the pure logic and test that, or Stryker-disable the line with the reason, as the other scripts do.',
    `Run it locally: pnpm exec stryker run config/mutation/${red.config}`,
    'This task closes by itself once the config passes the nightly run.',
  ].join('\n');
}

/**
 * File a task for each red config that has none open; close the open task
 * of each config the latest run no longer lists as red.
 *
 * `evidenceAt` is when the evidence that run judged was cut (see
 * {@link MutationRun}). A config whose task was closed at or after it is not
 * filed again: the fix is newer than the evidence, so the next nightly run
 * decides (2026-09-30: every landing re-read the same pre-fix run and
 * re-filed nine configs the lanes had just fixed, which the next round could
 * have spent its firings redoing).
 *
 * A PARKED TASK WAITS FOR THE NEXT RUN (2026-10-03): a firing that finds the
 * fix landed after the judged head parks the task with a VERDICT, which
 * defers it. Read as neither open nor done, it was filed again under a new id
 * from the very run it was parked on, and three firings in a row re-checked
 * the same six tasks. A task parked at or after `evidenceAt` now holds its
 * config like a fixed one; a run that no longer lists the config closes it,
 * and a later run still red on it retires it for the fresh evidence task.
 *
 * `judged` is the commit that run judged ({@link MutationRun.judged}); a task
 * filed with it names it in its title and body.
 */
export function syncMutationRedTasks(
  store: Store,
  projectId: string,
  red: readonly MutationRedConfig[],
  now: number,
  evidenceAt = 0,
  judged?: string,
): { filed: number; closed: number } {
  const rows = store.db
    .prepare(
      `SELECT id, title, status, updated_at FROM tasks WHERE project_id = ? AND title LIKE ?`,
    )
    .all(projectId, `${TITLE_PREFIX}%`) as {
    id: string;
    title: string;
    status: string;
    updated_at: number;
  }[];
  const stillRed = new Set(red.map((r) => r.config));
  const tracked = new Map<string, string>();
  const settledSinceRun = new Set<string>();
  const ruledOn: string[] = [];
  for (const t of rows) {
    const config = TASK_TITLE_RE.exec(t.title)?.[1];
    if (config === undefined) continue;
    const sinceRun = t.updated_at >= evidenceAt;
    if (OPEN_STATUSES.has(t.status)) tracked.set(config, t.id);
    else if (t.status === 'deferred' && !(sinceRun && stillRed.has(config))) ruledOn.push(t.id);
    else if ((t.status === 'done' || t.status === 'deferred') && sinceRun) {
      settledSinceRun.add(config);
    }
  }
  let filed = 0;
  for (const r of red) {
    if (tracked.has(r.config) || settledSinceRun.has(r.config)) continue;
    const slug = r.config.replace(/^stryker\.|\.config\.mjs$/g, '');
    const created = createTask(store, {
      id: `mutred-${slug}-${now.toString(36)}`,
      projectId,
      title: mutationRedTaskTitle(r, judged),
      body: bodyOf(r, judged),
      severity: 'medium',
      source: 'self',
      status: 'needs_approval',
      createdAt: now,
    });
    if (created) filed += 1;
  }
  let closed = 0;
  for (const [config, id] of tracked) {
    if (!stillRed.has(config) && setTaskStatus(store, id, 'done', now)) closed += 1;
  }
  for (const id of ruledOn) {
    if (setTaskStatus(store, id, 'done', now)) closed += 1;
  }
  return { filed, closed };
}

/** One completed mutation.yml run: when the evidence it judged was cut, and
 *  its red configs (none when it passed). */
export interface MutationRun {
  /**
   * When the commit the run judged was committed — the bound a fix must be
   * newer than for the run to say nothing about it. The run's start is the
   * wrong bound (2026-09-30, a second re-file the day the guard was added):
   * a 14:59 dispatch judged a main head landed at 11:46, and a fix that had
   * closed its task at 12:02 read as older than the run when it was newer
   * than everything the run saw — the config was filed again and the next
   * nightly closed it. The start stands in when the head cannot be read (it
   * is never earlier than the head, so that only ever files more, never
   * less) and for a green run, which files nothing.
   */
  readonly evidenceAt: number;
  /** The commit a red run judged, abbreviated; absent when the run names no
   *  commit id, and for a green run, which files nothing. */
  readonly judged?: string;
  readonly red: readonly MutationRedConfig[];
}

/** An ISO timestamp as epoch milliseconds; null when it is not one. */
function epochMs(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** The run's head when it is a commit id; null otherwise, so nothing else is
 *  ever put in a URL or a task title. */
function commitIdOf(sha: unknown): string | null {
  return typeof sha === 'string' && SHA_RE.test(sha) ? sha : null;
}

/** When `sha` was committed, per the commits API; null when the run names no
 *  head or the read fails — the caller falls back to the run's start. */
function readCommittedAt(gh: GhRun, repo: string, sha: string | null): number | null {
  if (sha === null) return null;
  try {
    const commit = JSON.parse(gh(['api', `repos/${repo}/commits/${sha}`])) as {
      commit?: { committer?: { date?: unknown } };
    };
    return epochMs(commit.commit?.committer?.date);
  } catch {
    return null;
  }
}

/** The latest completed mutation.yml run; null when there is none to read. */
export function readLatestMutationRed(gh: GhRun, repo: string): MutationRun | null {
  const runs = JSON.parse(
    gh([
      'run',
      'list',
      '--repo',
      repo,
      '--workflow',
      'mutation.yml',
      '--status',
      'completed',
      '--limit',
      '1',
      '--json',
      'databaseId,conclusion,createdAt,headSha',
    ]),
  ) as { databaseId?: unknown; conclusion?: unknown; createdAt?: unknown; headSha?: unknown }[];
  const latest = runs[0];
  if (!latest || typeof latest.databaseId !== 'number') return null;
  // A run with no readable start is taken as the oldest possible: nothing
  // closed is ever held back on its account.
  const startedAt = epochMs(latest.createdAt) ?? 0;
  if (latest.conclusion === 'success') return { evidenceAt: startedAt, red: [] };
  const head = commitIdOf(latest.headSha);
  const evidenceAt = readCommittedAt(gh, repo, head) ?? startedAt;
  const jobs = JSON.parse(
    gh(['api', `repos/${repo}/actions/runs/${latest.databaseId}/jobs?per_page=50`]),
  ) as { jobs?: { id?: unknown; conclusion?: unknown }[] };
  const byConfig = new Map<string, MutationRedConfig>();
  for (const job of jobs.jobs ?? []) {
    if (job.conclusion !== 'failure' || typeof job.id !== 'number') continue;
    for (const red of parseMutationLog(gh(['api', `repos/${repo}/actions/jobs/${job.id}/logs`]))) {
      byConfig.set(red.config, red);
    }
  }
  return {
    evidenceAt,
    ...(head === null ? {} : { judged: head.slice(0, JUDGED_SHA_CHARS) }),
    red: [...byConfig.values()],
  };
}
