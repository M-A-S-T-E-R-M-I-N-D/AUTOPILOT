// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The CONNECT popover's "contribute upstream" EXECUTE action — the fork +
 * branch-push + `gh pr create` half of epic 0006 "GitHub connected mode"
 * slice 5 (the pure policy, `planGithubPr`, lives in
 * `packages/engine/src/github-pr-contribute.ts`; the issue-report half's
 * EXECUTE wiring, `github/issue-execute.ts`, is the sibling this mirrors).
 * Given a project id (whose `root_path` supplies both the branch to push
 * and the `cwd` every `gh`/`git` command runs in) plus an operator-typed
 * title/body, resolves the one real input `planGithubPr` needs beyond that
 * — the fork owner, read from the operator's own authenticated `gh auth
 * status` (`connection/gh-probe.ts`'s `getGhStatus`, reused rather than
 * re-parsed) — then runs the three planned commands in order via the
 * shared `CommandRunner`, stopping at the first non-zero exit (mirrors
 * `GithubPrPlan.steps`'s own "stop at first failure" contract: a failed
 * fork must never attempt a push against a fork that doesn't exist).
 */

import { GitVcs, planGithubPr } from '@autopilot/engine';
import { openStore, listProjects } from '@autopilot/store';
import { getGhStatus } from '../connection/gh-probe.js';
import { realCliExec, type CliExec } from '../connection/cli-probe.js';
import { UPSTREAM_REPO } from '../info.js';
import { realRunner, type CommandRunner, type CommandResult } from './execute.js';

/** One `POST /api/github-pr/execute` attempt's outcome. `url` is the
 *  created PR's URL — `gh pr create`'s stdout on success — surfaced so the
 *  operator can click straight through; omitted on failure or if `gh`
 *  printed nothing. */
export interface GithubPrExecuteResult {
  readonly ok: boolean;
  readonly details: string;
  readonly url?: string;
}

/** One project's "contribute upstream" attempt, or `null` when the project
 *  id is unknown (the HTTP handler turns that into a 404, same convention
 *  as `GithubSyncExecuteApi`). `issueNumber` is the epic 0007 pool-client
 *  round trip's delivery leg — when set, threads through to `planGithubPr`
 *  so the created PR references (and closes on merge) the pool issue it was
 *  flown for. */
export type GithubPrExecuteApi = (
  projectId: string,
  title: string,
  body: string,
  issueNumber?: number,
) => Promise<GithubPrExecuteResult | null>;

/** Builds the GITHUB PR execute API against the real store + real `gh`/
 *  `git` — the production wiring `main.ts` injects into the server.
 *  `runCommand` defaults to a real `execFile`-backed runner (shared with
 *  `github/execute.ts`); `ghExec` defaults to the real CLI probe exec;
 *  tests inject fakes for both so no real `gh repo fork`/`git push`/`gh pr
 *  create` ever fires. `upstreamRepo` defaults to the canonical
 *  `UPSTREAM_REPO`. */
export function createGithubPrExecuteApi(
  dbPath: string,
  runCommand: CommandRunner = realRunner,
  ghExec: CliExec = realCliExec,
  upstreamRepo: string = UPSTREAM_REPO,
): GithubPrExecuteApi {
  return async (projectId, title, body, issueNumber) => {
    const store = openStore(dbPath);
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;

      const status = await getGhStatus(ghExec);
      if (!status.authenticated || !status.login) {
        return {
          ok: false,
          details: 'gh is not authenticated — run `gh auth login` before contributing upstream.',
        };
      }

      const vcs = new GitVcs(project.root_path);
      const branch = await vcs.currentBranch();

      let plan;
      try {
        plan = planGithubPr(upstreamRepo, status.login, branch, title, body, issueNumber);
      } catch (error) {
        return {
          ok: false,
          details: error instanceof Error ? error.message : 'invalid contribute-upstream input',
        };
      }

      let last: CommandResult = { exitCode: 0, stdout: '', stderr: '' };
      for (const step of plan.steps) {
        last = await runCommand(step.command, step.args, project.root_path);
        if (last.exitCode !== 0) {
          return {
            ok: false,
            details: last.stderr.trim() || `${step.command} exited ${last.exitCode}`,
          };
        }
      }
      const url = last.stdout.trim();
      return url.length > 0
        ? { ok: true, details: plan.details, url }
        : { ok: true, details: plan.details };
    } finally {
      store.close();
    }
  };
}
