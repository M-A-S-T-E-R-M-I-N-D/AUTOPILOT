// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT'S NEW (operator, 2026-09-24): every new version opens once with a
 * message of the day — what changed, what is now possible, and where the
 * project and its GitHub repository stand. This module reads the facts that
 * message shows: the running version's own CHANGELOG section, the current
 * round's totals, the repository's open issues and pull requests, and the
 * latest CI run per workflow. Every part degrades to `null` on its own, so a
 * missing `gh` or an unreleased build still gets the rest.
 */

import type { WorkflowRunStatus, GhRun } from '../control/ci-status.js';
import type { RoundInfo } from './project-detail.js';

/** One CHANGELOG bullet, split into its Conventional Commit parts. */
export interface ChangelogItem {
  /** `feat`, `fix`, `perf`… — `null` for a bullet that is not a commit subject. */
  readonly kind: string | null;
  readonly scope: string | null;
  readonly text: string;
}

export interface ChangelogGroup {
  /** The `###` heading as written: Added, Fixed, Also in this release… */
  readonly title: string;
  readonly items: readonly ChangelogItem[];
}

export interface ChangelogRelease {
  readonly version: string;
  readonly date: string | null;
  readonly groups: readonly ChangelogGroup[];
}

/** Splits `feat(dashboard): the thing` into kind, scope and text. */
export function parseChangelogItem(line: string): ChangelogItem {
  const colon = line.indexOf(': ');
  if (colon > 0) {
    const head = line.slice(0, colon);
    const open = head.indexOf('(');
    const kind = open === -1 ? head : head.slice(0, open);
    const scope = open !== -1 && head.endsWith(')') ? head.slice(open + 1, -1) : null;
    if (/^[a-z]+!?$/.test(kind) && (open === -1 || scope !== null)) {
      return { kind: kind.replace('!', ''), scope, text: line.slice(colon + 2) };
    }
  }
  return { kind: null, scope: null, text: line };
}

/**
 * The `## [version]` section of a Keep a Changelog file, or `null` when the
 * file has no section for that version — a build between releases has
 * nothing to announce yet, and inventing it from `[Unreleased]` would promise
 * what has not shipped.
 */
export function changelogRelease(markdown: string, version: string): ChangelogRelease | null {
  const lines = markdown.split(/\r?\n/);
  const head = `## [${version}]`;
  const start = lines.findIndex((l) => l === head || l.startsWith(`${head} `));
  if (start === -1) return null;
  const dateMatch = /\d{4}-\d{2}-\d{2}/.exec(lines[start]!.slice(head.length));
  const groups: { title: string; items: ChangelogItem[] }[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.startsWith('## ')) break;
    if (line.startsWith('### ')) {
      groups.push({ title: line.slice(4).trim(), items: [] });
    } else if (line.startsWith('- ') && groups.length > 0) {
      groups[groups.length - 1]!.items.push(parseChangelogItem(line.slice(2).trim()));
    }
  }
  return {
    version,
    date: dateMatch ? dateMatch[0] : null,
    groups: groups.filter((g) => g.items.length > 0),
  };
}

/** The repository's open work, as GitHub counts it. */
export interface GithubPulse {
  readonly repo: string;
  readonly openIssues: number | null;
  readonly openPrs: number | null;
}

function countFrom(run: GhRun, args: readonly string[]): number | null {
  try {
    const n = Number(run(args).trim());
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Open issues and open pull requests. GitHub's `open_issues_count` counts
 * both, so the pull requests are counted separately and subtracted; when
 * either read fails the split is unknown and both say so.
 */
export function githubPulse(repo: string, run: GhRun): GithubPulse {
  const both = countFrom(run, ['api', `repos/${repo}`, '--jq', '.open_issues_count']);
  const prs = countFrom(run, [
    'api',
    `search/issues?q=repo:${repo}+is:pr+is:open`,
    '--jq',
    '.total_count',
  ]);
  if (both === null || prs === null) return { repo, openIssues: null, openPrs: null };
  return { repo, openIssues: Math.max(0, both - prs), openPrs: prs };
}

/** The latest run per workflow, reduced to what a glance needs. */
export interface CiPulse {
  readonly passing: number;
  readonly failing: number;
  readonly workflows: readonly { readonly workflow: string; readonly ok: boolean }[];
}

export function ciPulse(runs: readonly WorkflowRunStatus[]): CiPulse {
  const seen = runs.filter((r) => r.conclusion !== null);
  return {
    passing: seen.filter((r) => r.ok).length,
    failing: seen.filter((r) => !r.ok).length,
    workflows: seen.map((r) => ({ workflow: r.workflow, ok: r.ok })),
  };
}

export interface WhatsNewPayload {
  readonly version: string;
  readonly release: ChangelogRelease | null;
  readonly round: RoundInfo | null;
  readonly github: GithubPulse | null;
  readonly ci: CiPulse | null;
}

export type WhatsNewApi = () => Promise<WhatsNewPayload>;

export interface WhatsNewDeps {
  readonly version: string;
  /** The CHANGELOG text, or `null` when there is none to read. */
  readonly readChangelog: () => string | null;
  readonly round: () => Promise<RoundInfo | null> | RoundInfo | null;
  readonly github: () => GithubPulse | null;
  readonly ciStatus: () => Promise<readonly WorkflowRunStatus[]>;
  /** How long a GitHub read is reused — the message is opened rarely, but
   *  reopened from the menu it must not shell to `gh` on every click. */
  readonly githubTtlMs?: number;
  readonly now?: () => number;
}

const GITHUB_TTL_MS = 5 * 60_000;

function orNull<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

async function orNullAsync<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export function createWhatsNewApi(deps: WhatsNewDeps): WhatsNewApi {
  const ttl = deps.githubTtlMs ?? GITHUB_TTL_MS;
  const now = deps.now ?? Date.now;
  let github: GithubPulse | null = null;
  let githubAt = -Infinity;
  return async () => {
    const at = now();
    if (at - githubAt >= ttl) {
      github = orNull(deps.github);
      githubAt = at;
    }
    const ci = await orNullAsync(async () => ciPulse(await deps.ciStatus()));
    const round = await orNullAsync(async () => deps.round());
    const text = orNull(deps.readChangelog);
    return {
      version: deps.version,
      release: text === null ? null : changelogRelease(text, deps.version),
      round,
      github,
      ci,
    };
  };
}
