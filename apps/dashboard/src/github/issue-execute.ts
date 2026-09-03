// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The CONNECT popover's "report to upstream" EXECUTE action (epic 0006
 * "GitHub connected mode", slice 5 "contribute upstream" — the issue-report
 * half; the pure policy, `planGithubIssue`, lives in
 * `packages/engine/src/github-contribute.ts`). Given an operator-typed
 * title + body, runs the one command `planGithubIssue` decides: `gh issue
 * create --repo <upstream> --title <title> --body <body>` against the
 * canonical upstream repo (`info.ts`'s `UPSTREAM_REPO`). Unlike GITHUB
 * SYNC's `createGithubSyncExecuteApi`, this is never scoped to a project —
 * reporting a bug is an operator-global act, not a per-project one — so
 * there is no store lookup and no `cwd` that matters to `gh issue create
 * --repo`; `process.cwd()` is passed through only because `CommandRunner`'s
 * shape requires one.
 *
 * The command runner is injectable (reusing `github/execute.ts`'s
 * `CommandRunner`/`realRunner`) so a test can assert WHICH command this
 * chose without ever spawning a real `gh` process or filing a real GitHub
 * issue — same reasoning `createGithubSyncExecuteApi` uses.
 */

import { planGithubIssue } from '@autopilot/engine';
import { UPSTREAM_REPO } from '../info.js';
import { realRunner, type CommandRunner } from './execute.js';

/** One `POST /api/github-issue/execute` attempt's outcome. `url` is the
 *  created issue's URL — `gh issue create`'s stdout on success — surfaced
 *  so the operator can click straight through; omitted on failure or if
 *  `gh` printed nothing. */
export interface GithubIssueExecuteResult {
  readonly ok: boolean;
  readonly details: string;
  readonly url?: string;
}

/** One "report to upstream" attempt — never resolves `null` (unlike
 *  `GithubSyncExecuteApi`, there is no project id to fail to find). */
export type GithubIssueExecuteApi = (
  title: string,
  body: string,
) => Promise<GithubIssueExecuteResult>;

/** Builds the GITHUB ISSUE execute API against the real upstream repo —
 *  the production wiring `main.ts` injects into the server. `runCommand`
 *  defaults to a real `execFile`-backed runner; tests inject a fake so no
 *  real `gh issue create` ever fires. `upstreamRepo` defaults to the
 *  canonical `UPSTREAM_REPO`; tests override it to assert the exact `--repo`
 *  argument without depending on that constant's live value. */
export function createGithubIssueExecuteApi(
  runCommand: CommandRunner = realRunner,
  upstreamRepo: string = UPSTREAM_REPO,
): GithubIssueExecuteApi {
  return async (title, body) => {
    const plan = planGithubIssue(upstreamRepo, title, body);
    const result = await runCommand(plan.command, plan.args, process.cwd());
    if (result.exitCode !== 0) {
      return {
        ok: false,
        details: result.stderr.trim() || `${plan.command} exited ${result.exitCode}`,
      };
    }
    const url = result.stdout.trim();
    return url.length > 0
      ? { ok: true, details: plan.details, url }
      : { ok: true, details: plan.details };
  };
}
