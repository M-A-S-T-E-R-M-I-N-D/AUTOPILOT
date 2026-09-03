// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * `gh run babysitting` — the one genuinely greenfield concern named by the
 * maintenance-ritual board task (docs/epics/0010-maintenance-ritual.md slice 2,
 * board web-mstdokr6-qgxqz8): a read-only report of the latest CI run per
 * workflow file under `.github/workflows/`, sourced from `gh run list`. Never
 * mutates a run (no retry, no cancel, no re-dispatch) — surfacing what needs a
 * look is the entire job; a human or a separately-scoped KEEPER slice acts.
 * Mirrors `gh-doctor.ts`'s shape: injectable runner, never throws, degrades to
 * an "unknown" line rather than failing the whole report when `gh` is absent,
 * unauthenticated, or a single workflow has no runs yet — a report that can't
 * SEE a run is not the same claim as "the run failed".
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

export interface WorkflowRunStatus {
  readonly workflow: string;
  readonly conclusion: string | null;
  readonly ageLabel: string | null;
  /** Epoch ms of the run's creation, when gh reported a parseable createdAt —
   *  `null` otherwise. Lets a caller judge STALENESS numerically (the e2e
   *  land guard treats an old failure as no-data, not as a live red) without
   *  re-parsing the human `ageLabel`. */
  readonly createdAtMs: number | null;
  readonly ok: boolean;
  readonly detail: string;
}

export type GhRun = (args: readonly string[]) => string;

/** `gh run list` may validate the token/hit the network — bounded, not open-ended. */
const GH_PROBE_TIMEOUT_MS = 10_000;

/** Builds a `GhRun` bound to `cwd` — `gh run list` resolves which GitHub
 *  repo it's talking to from the working directory's git remote, so a
 *  caller checking a project OTHER than this dashboard's own repo (e.g. the
 *  pre-land e2e guard in `landing/execute.ts`, run against `project.root_path`)
 *  must pass its cwd explicitly rather than inherit the dashboard process's own. */
export function createGhRun(cwd?: string): GhRun {
  return (args) =>
    execFileSync('gh', args as string[], {
      encoding: 'utf8',
      timeout: GH_PROBE_TIMEOUT_MS,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    });
}

const defaultGhRun = createGhRun();

/** Conclusions that mean "this needs a look" — success/skipped/neutral, and a
 *  still-running run (conclusion null), are fine. */
const FAILING_CONCLUSIONS = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'startup_failure',
]);

/** `.github/workflows/*.yml`/`.yaml`, sorted — the exact set the report covers.
 *  A missing/unreadable directory degrades to an empty report, not a throw. */
export function listWorkflowFiles(dir = '.github/workflows'): readonly string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .sort();
  } catch {
    return [];
  }
}

/** Minutes-granularity relative age; `nowMs` is injected so callers (and tests)
 *  never depend on the wall clock. */
export function formatRunAge(createdAtIso: string, nowMs: number): string {
  const then = Date.parse(createdAtIso);
  if (Number.isNaN(then)) return 'unknown age';
  const diffMinutes = Math.floor(Math.max(0, nowMs - then) / 60_000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

interface RawGhRun {
  readonly status?: unknown;
  readonly conclusion?: unknown;
  readonly createdAt?: unknown;
}

/** The latest run for ONE workflow file, optionally narrowed to `branch`
 *  (the run's head branch — `push` events set this to the pushed branch,
 *  `pull_request` events to the PR's source branch, so filtering by the
 *  base/converged branch excludes PR-triggered runs that would otherwise
 *  outrank it as "the latest run"). Never throws: `gh` missing or
 *  unauthenticated, malformed JSON, and a workflow with zero runs all degrade
 *  to an "unknown"-flavored line instead of raising. */
export function ciWorkflowStatus(
  workflow: string,
  run: GhRun = defaultGhRun,
  nowMs: number = Date.now(),
  branch?: string,
): WorkflowRunStatus {
  let raw: string;
  try {
    raw = run([
      'run',
      'list',
      '--workflow',
      workflow,
      '--limit',
      '1',
      '--json',
      'status,conclusion,createdAt',
      ...(branch ? ['--branch', branch] : []),
    ]);
  } catch {
    return {
      workflow,
      conclusion: null,
      ageLabel: null,
      createdAtMs: null,
      ok: true,
      detail: 'gh unavailable or not authenticated — run status unknown',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      workflow,
      conclusion: null,
      ageLabel: null,
      createdAtMs: null,
      ok: true,
      detail: 'could not parse gh run list output',
    };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      workflow,
      conclusion: null,
      ageLabel: null,
      createdAtMs: null,
      ok: true,
      detail: 'no runs yet',
    };
  }
  const latest = parsed[0] as RawGhRun;
  const status = typeof latest.status === 'string' ? latest.status : null;
  const conclusion = typeof latest.conclusion === 'string' ? latest.conclusion : null;
  const createdAt = typeof latest.createdAt === 'string' ? latest.createdAt : null;
  const ageLabel = createdAt ? formatRunAge(createdAt, nowMs) : null;
  const parsedMs = createdAt ? Date.parse(createdAt) : NaN;
  const createdAtMs = Number.isFinite(parsedMs) ? parsedMs : null;
  const ok = conclusion === null || !FAILING_CONCLUSIONS.has(conclusion);
  const statusLabel = conclusion ?? status ?? 'unknown';
  const detail = ageLabel ? `${statusLabel} (${ageLabel})` : statusLabel;
  return { workflow, conclusion, ageLabel, createdAtMs, ok, detail };
}

/** One line per workflow file — the report `dashboard ci-status` prints. */
export function ciRunReport(
  workflows: readonly string[] = listWorkflowFiles(),
  run: GhRun = defaultGhRun,
  nowMs: number = Date.now(),
): readonly WorkflowRunStatus[] {
  return workflows.map((workflow) => ciWorkflowStatus(workflow, run, nowMs));
}
