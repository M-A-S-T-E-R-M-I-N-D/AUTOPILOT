// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHICH GITHUB REPOSITORY A LOCAL PROJECT IS (2026-09-24).
 *
 * The pool panel offered every registered project as the place to queue a
 * claimed issue's board task — so an AUTOPILOT issue could be queued on the
 * calculator sample, which has no GitHub remote at all, or on a folder that is
 * not even a git repository. The operator's rule: a task is bound to the
 * project it belongs to, and which project that is is a FACT, not a choice.
 *
 * The fact is the project's git `origin` remote. An issue lives in a GitHub
 * repository (`owner/repo`, readable off its URL); a local project is
 * connected to that repository when its origin points there. Routing is then:
 * one connected project → that one, automatically; none → no local task, and
 * say why; several (two clones of one repo) → the operator picks, but only
 * among those.
 *
 * Pure except {@link projectRepoOf}, which asks git.
 */
import { execFileSync } from 'node:child_process';

/** `owner/repo` from a GitHub remote URL in any of the forms git accepts —
 *  https (with or without `.git`, with or without credentials), scp-like
 *  `git@github.com:owner/repo.git`, and `ssh://git@github.com/owner/repo`.
 *  Null for anything that is not a GitHub repository URL: a project on
 *  another host is not connected to GitHub, and a guess would route a task
 *  to the wrong place. */
export function repoFromRemoteUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  const match =
    /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/i.exec(
      trimmed,
    );
  if (match === null) return null;
  const [, owner, repo] = match;
  if (owner === undefined || repo === undefined || repo === '') return null;
  return `${owner}/${repo}`;
}

/** `owner/repo` from a GitHub issue or pull-request URL. */
export function repoFromIssueUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/(?:issues|pull)\/\d+/i.exec(
      url.trim(),
    );
  return match === null ? null : `${match[1]}/${match[2]}`;
}

/** GitHub names compare case-insensitively. */
export function sameRepo(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export interface ProjectRepoFact {
  readonly id: string;
  /** `owner/repo` the project's origin points at, or null when it has none. */
  readonly repo: string | null;
}

export type ClaimRoute =
  | { readonly ok: true; readonly projectId: string }
  | {
      readonly ok: false;
      readonly reason: 'no-connected-project' | 'ambiguous' | 'not-connected';
      readonly detail: string;
      /** The projects the operator may choose among, for `'ambiguous'`. */
      readonly candidates: readonly string[];
    };

/**
 * Where a claimed issue's board task goes. `requested` is what the caller
 * asked for, if anything; it is honoured only when that project is connected
 * to the issue's repository — a request for any other project is refused,
 * never silently redirected, because the caller's intent was wrong.
 */
export function routeClaimToProject(
  issueRepo: string | null,
  projects: readonly ProjectRepoFact[],
  requested?: string,
): ClaimRoute {
  const connected = projects.filter((p) => sameRepo(p.repo, issueRepo)).map((p) => p.id);
  if (requested !== undefined && requested !== '') {
    if (connected.includes(requested)) return { ok: true, projectId: requested };
    return {
      ok: false,
      reason: 'not-connected',
      detail: `project "${requested}" is not a checkout of ${issueRepo ?? 'the issue repository'}`,
      candidates: connected,
    };
  }
  const only = connected.length === 1 ? connected[0] : undefined;
  if (only !== undefined) return { ok: true, projectId: only };
  if (connected.length === 0) {
    return {
      ok: false,
      reason: 'no-connected-project',
      detail: `no registered project is a local checkout of ${issueRepo ?? 'the issue repository'}`,
      candidates: [],
    };
  }
  return {
    ok: false,
    reason: 'ambiguous',
    detail: `${connected.length} registered projects are checkouts of ${issueRepo ?? 'the issue repository'} — pick one`,
    candidates: connected,
  };
}

const REPO_CACHE_TTL_MS = 5 * 60_000;
const repoCache = new Map<string, { readonly repo: string | null; readonly at: number }>();

/**
 * The `owner/repo` a project folder's `origin` points at, asked of git and
 * cached for five minutes — the fleet state is read on every poll, and a
 * remote does not change under a running dashboard often enough to ask each
 * time. Null for a folder that is not a git repository, has no `origin`, or
 * whose origin is not GitHub.
 */
export function projectRepoOf(rootPath: string, now: number = Date.now()): string | null {
  const cached = repoCache.get(rootPath);
  if (cached !== undefined && now - cached.at < REPO_CACHE_TTL_MS) return cached.repo;
  let repo: string | null;
  try {
    const url = execFileSync('git', ['-C', rootPath, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    repo = repoFromRemoteUrl(url);
  } catch {
    repo = null;
  }
  repoCache.set(rootPath, { repo, at: now });
  return repo;
}
