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
 * line), deduplicated by config and auto-queued like any proposal. A config
 * the latest run no longer lists as red closes its task. Read-only against
 * GitHub.
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
}

const TITLE_PREFIX = 'MUTATION RED: ';
/** Printed by run-all-mutation.mjs right after a config's own Stryker output
 *  ("FAILED — <config>: …"), and again in the end-of-shard summary
 *  ("FAILED <config> — …"). */
const FAILED_RE = /^run-all-mutation: FAILED(?: —)? (stryker\.[a-z0-9-]+\.config\.mjs)/;
// Stryker's clear-text block: "[Survived] Mutator", then "path:line:col",
// then "-  original" and "+  mutated".
const SURVIVED_RE = /^\[Survived\] (\S+)/;
const LOCATION_RE = /^(\S+?):(\d+):\d+$/;
const TASK_TITLE_RE = /^MUTATION RED: (stryker\.[a-z0-9-]+\.config\.mjs):/;
const OPEN_STATUSES = new Set(['queued', 'in_progress', 'needs_approval']);
/** How many survivors a task body lists before it says "and N more". */
const SHOWN_SURVIVORS = 40;
const SHOWN_LINE_CHARS = 140;

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

/**
 * The failing configs of one mutation job log, each with the survivors its
 * Stryker run printed. The runner runs configs one after another and prints
 * a config's FAILED line straight after that config's output, so every
 * survivor since the previous FAILED line belongs to this one.
 */
export function parseMutationLog(log: string): MutationRedConfig[] {
  const lines = log.split('\n').map(clean);
  const byConfig = new Map<string, SurvivingMutant[]>();
  let pending: SurvivingMutant[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const failed = FAILED_RE.exec(lines[i]!);
    if (failed) {
      const config = failed[1]!;
      byConfig.set(config, [...(byConfig.get(config) ?? []), ...pending]);
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
  return [...byConfig.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([config, survivors]) => ({ config, survivors }));
}

export function mutationRedTaskTitle(red: MutationRedConfig): string {
  const n = red.survivors.length;
  const what = n === 0 ? 'mutants' : `${n} mutant(s)`;
  return `${TITLE_PREFIX}${red.config}: ${what} survived the nightly run — make the tests kill them`;
}

function bodyOf(red: MutationRedConfig): string {
  const shown = red.survivors.slice(0, SHOWN_SURVIVORS);
  const rest = red.survivors.length - shown.length;
  return [
    `The nightly mutation run (mutation.yml) is red on ${red.config}: a mutant the tests do not kill is a change to that line nobody would notice.`,
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
 * `runStartedAt` is when that run began. A config whose task was closed at
 * or after it is not filed again: the fix is newer than the evidence, so
 * the next nightly run decides (2026-09-30: every landing re-read the same
 * pre-fix run and re-filed nine configs the lanes had just fixed, which the
 * next round could have spent its firings redoing).
 */
export function syncMutationRedTasks(
  store: Store,
  projectId: string,
  red: readonly MutationRedConfig[],
  now: number,
  runStartedAt = 0,
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
  const tracked = new Map<string, string>();
  const fixedSinceRun = new Set<string>();
  for (const t of rows) {
    const config = TASK_TITLE_RE.exec(t.title)?.[1];
    if (config === undefined) continue;
    if (OPEN_STATUSES.has(t.status)) tracked.set(config, t.id);
    else if (t.status === 'done' && t.updated_at >= runStartedAt) fixedSinceRun.add(config);
  }
  let filed = 0;
  for (const r of red) {
    if (tracked.has(r.config) || fixedSinceRun.has(r.config)) continue;
    const slug = r.config.replace(/^stryker\.|\.config\.mjs$/g, '');
    const created = createTask(store, {
      id: `mutred-${slug}-${now.toString(36)}`,
      projectId,
      title: mutationRedTaskTitle(r),
      body: bodyOf(r),
      severity: 'medium',
      source: 'self',
      status: 'needs_approval',
      createdAt: now,
    });
    if (created) filed += 1;
  }
  const stillRed = new Set(red.map((r) => r.config));
  let closed = 0;
  for (const [config, id] of tracked) {
    if (!stillRed.has(config) && setTaskStatus(store, id, 'done', now)) closed += 1;
  }
  return { filed, closed };
}

/** One completed mutation.yml run: when it started, and its red configs
 *  (none when it passed). */
export interface MutationRun {
  readonly startedAt: number;
  readonly red: readonly MutationRedConfig[];
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
      'databaseId,conclusion,createdAt',
    ]),
  ) as { databaseId?: unknown; conclusion?: unknown; createdAt?: unknown }[];
  const latest = runs[0];
  if (!latest || typeof latest.databaseId !== 'number') return null;
  const parsed = typeof latest.createdAt === 'string' ? Date.parse(latest.createdAt) : NaN;
  // A run with no readable start is taken as the oldest possible: nothing
  // closed is ever held back on its account.
  const startedAt = Number.isFinite(parsed) ? parsed : 0;
  if (latest.conclusion === 'success') return { startedAt, red: [] };
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
  return { startedAt, red: [...byConfig.values()] };
}
