// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The unifying triage surface (epic 0010 "maintenance ritual" slice 3, board
 * web-mstdokr6-qgxqz8): one read that reports dependabot's open PR backlog,
 * doc-freshness drift findings, the next release's plan verdict, and slice
 * 2's `gh run babysitting` report together — the founder's six-named-concern
 * routine sweep collapsed into a single `dashboard maintenance-sweep` read
 * instead of six separate checks. No section here re-implements a detector
 * that already exists (dependabot itself, `doc-freshness.ts`, `planRelease`) —
 * this module only triages their existing output. Every section is READ-ONLY
 * and independently degrade-safe: one section failing (`gh` absent, no tag
 * yet, an unreadable changelog) never blocks the others from reporting — the
 * same resilience stance `gh-doctor.ts`/`ci-status.ts` already established.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GitVcs, planRelease } from '@autopilot/engine';
import {
  DOC_SUBJECTS,
  collectDocFreshnessTimestamps,
  computeDocDrift,
  type DocFreshnessFinding,
} from '../flight/doc-freshness.js';
import { ciRunReport, type WorkflowRunStatus, type GhRun } from './ci-status.js';

export type { GhRun };

/** `gh pr list` may validate the token/hit the network — bounded, not open-ended. */
const GH_PROBE_TIMEOUT_MS = 10_000;

function defaultGhRun(args: readonly string[]): string {
  return execFileSync('gh', args as string[], {
    encoding: 'utf8',
    timeout: GH_PROBE_TIMEOUT_MS,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export interface DependabotBacklog {
  readonly ok: boolean;
  readonly detail: string;
}

interface RawDependabotPr {
  readonly number?: unknown;
}

/** Open dependabot PRs (`gh pr list --author app/dependabot`) — triage, not
 *  detection; dependabot itself already opens these, this only counts what's
 *  waiting for a look, same "is anything open right now" framing the epic
 *  spec names. `ok: false` means there is a backlog to look at, not that
 *  anything is broken. Never throws: `gh` absent/unauthenticated or malformed
 *  JSON both degrade to an "unknown" line, same as `ciWorkflowStatus`. */
export function dependabotPrBacklog(run: GhRun = defaultGhRun): DependabotBacklog {
  let raw: string;
  try {
    raw = run(['pr', 'list', '--author', 'app/dependabot', '--state', 'open', '--json', 'number']);
  } catch {
    return { ok: true, detail: 'gh unavailable or not authenticated — backlog unknown' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: true, detail: 'could not parse gh pr list output' };
  }
  if (!Array.isArray(parsed)) return { ok: true, detail: 'could not parse gh pr list output' };
  const prs = parsed as readonly RawDependabotPr[];
  if (prs.length === 0) return { ok: true, detail: 'no open dependabot PRs' };
  const numbers = prs
    .slice(0, 3)
    .map((p) => (typeof p.number === 'number' ? `#${p.number}` : '#?'))
    .join(', ');
  const more = prs.length > 3 ? ` (+${prs.length - 3} more)` : '';
  return { ok: false, detail: `${prs.length} open PR(s) waiting for a look: ${numbers}${more}` };
}

export interface DocFreshnessSweep {
  readonly ok: boolean;
  readonly detail: string;
  readonly findings: readonly DocFreshnessFinding[];
}

/** Runs the same `doc-freshness.ts` detector `fly.ts`'s flight-end sweep
 *  already proposes tasks from, but read-only — no task is created here. */
export function docFreshnessSweep(repo = process.cwd()): DocFreshnessSweep {
  try {
    const timestamps = collectDocFreshnessTimestamps(repo, DOC_SUBJECTS);
    const findings = computeDocDrift(DOC_SUBJECTS, timestamps);
    return {
      ok: findings.length === 0,
      detail:
        findings.length === 0
          ? 'no doc-freshness drift'
          : `${findings.length} doc(s) drifted behind their subjects`,
      findings,
    };
  } catch {
    return {
      ok: true,
      detail: 'doc-freshness sweep skipped (best-effort, non-fatal)',
      findings: [],
    };
  }
}

export interface ReleaseSweep {
  readonly ok: boolean;
  readonly detail: string;
}

/** The next release's plan verdict against THIS repo's own `package.json` /
 *  `CHANGELOG.md` / last tag — reuses `planRelease` (the same policy function
 *  `read/source.ts`'s store-backed, per-project `readReleaseInfo` calls), just
 *  without the project-registry lookup since the sweep always targets the
 *  repo it runs in. `ok: false` means a release is ready to cut, not that
 *  anything is broken. Degrades to an "unknown" line on any read/parse
 *  failure — malformed `package.json`, an unreadable `CHANGELOG.md`, or no
 *  tag yet — never throws. */
export async function releaseSweep(repo = process.cwd()): Promise<ReleaseSweep> {
  try {
    const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    const currentVersion = typeof pkg.version === 'string' ? pkg.version : '';
    if (!currentVersion) return { ok: true, detail: 'package.json has no version — unknown' };
    const vcs = new GitVcs(repo);
    const tag = await vcs.lastTag();
    if (!tag) return { ok: true, detail: 'no release tag yet — nothing to diff against' };
    const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');
    const commits = await vcs.commitsAhead(tag.name);
    const date = new Date().toISOString().slice(0, 10);
    const plan = planRelease(
      currentVersion,
      changelog,
      commits.map((c) => c.subject),
      date,
    );
    if (!plan.ok) return { ok: true, detail: plan.details };
    return {
      ok: false,
      detail: `${plan.bump} bump ready — v${plan.version} (since ${tag.name})`,
    };
  } catch {
    return {
      ok: true,
      detail: 'could not compute — package.json/CHANGELOG.md unreadable or malformed',
    };
  }
}

export interface MaintenanceSweepReport {
  readonly dependabot: DependabotBacklog;
  readonly docFreshness: DocFreshnessSweep;
  readonly release: ReleaseSweep;
  readonly ciRuns: readonly WorkflowRunStatus[];
}

/** The one-read triage surface the epic's acceptance criteria asks for: all
 *  four sections gathered together, each independently degrade-safe so a
 *  single missing tool or unreadable file never blanks the whole report. */
export async function maintenanceSweepReport(
  repo = process.cwd(),
  run: GhRun = defaultGhRun,
): Promise<MaintenanceSweepReport> {
  return {
    dependabot: dependabotPrBacklog(run),
    docFreshness: docFreshnessSweep(repo),
    release: await releaseSweep(repo),
    ciRuns: ciRunReport(undefined, run),
  };
}
