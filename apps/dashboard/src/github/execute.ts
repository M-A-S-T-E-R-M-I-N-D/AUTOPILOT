// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's "Sync to GitHub" EXECUTE action (BOARD web-mss4lpwi-p0w1d0,
 * "GITHUB 2/5 - sync any project" — the HTTP half; the pure policy,
 * `planGithubSync`, shipped first in `packages/engine/src/github-sync.ts`).
 * Given a known project id and a caller-chosen `visibility`, detects whether
 * its root already carries a git remote (`GitVcs.hasRemote`) and runs the
 * ONE command `planGithubSync` decides: `gh repo create <slug>
 * --private|--public --source=. --push` for a first-time sync, or a plain
 * `git push` re-sync when a remote already exists. `visibility` is the
 * caller's — the HTTP handler defaults it to `'private'` and only accepts
 * `'public'` from the project page's explicit, confirm-guarded checkbox
 * (epic 0006 slice "GITHUB 2/5"'s "public = second confirm-guarded choice");
 * this function itself trusts whatever it is given, same as `planGithubSync`.
 *
 * The command runner is injectable so a test can assert WHICH command this
 * chose without ever spawning a real `gh`/`git` process against a live
 * GitHub account — same reasoning `release/execute.ts`'s `ReleaseWriter`
 * injection uses for file writes.
 */

import { execFile } from 'node:child_process';
import { openStore, listProjects } from '@autopilot/store';
import { GitVcs, planGithubSync, type RepoVisibility } from '@autopilot/engine';
import { scanForSecrets } from '@autopilot/onboarding';

/** One command's outcome — never thrown, always resolved (mirrors the
 *  `git()` helper's own exit-code-not-exception convention in `adapters/git.ts`). */
export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one command in `cwd` — an argv array only, never a shell string (no injection surface). */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<CommandResult>;

/** The real `execFile`-backed runner — exported so other EXECUTE APIs that
 *  shell to `gh`/`git` (e.g. `release/execute.ts`'s optional `gh release
 *  create` step) reuse the exact same process-spawning/exit-code handling
 *  instead of a second hand-rolled copy. */
export const realRunner: CommandRunner = (command, args, cwd) =>
  new Promise((resolve) => {
    execFile(
      command,
      args as string[],
      { cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
            ? (err as unknown as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ exitCode: code, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
  });

/** One `POST /api/github-sync/execute` attempt's outcome. */
export interface GithubSyncExecuteResult {
  readonly ok: boolean;
  /** `'create'` for a first-time sync, `'push'` for a re-sync — mirrors `GithubSyncPlan.action`. */
  readonly action: 'create' | 'push';
  readonly details: string;
}

/** One project's GITHUB SYNC EXECUTE attempt, or `null` when the project id
 *  is unknown (the HTTP handler turns that into a 404, same convention as
 *  `release/execute.ts`'s `ReleaseExecuteApi`). */
export type GithubSyncExecuteApi = (
  projectId: string,
  visibility: RepoVisibility,
) => Promise<GithubSyncExecuteResult | null>;

/** Scans a project root for likely secrets — injectable so tests never walk
 *  a real filesystem tree; defaults to the real scanner (epic 0006's
 *  "before any PUBLIC sync ... run the secret-scan against the tree and warn
 *  on findings", reusing the same scanner the onboarding baseline ritual
 *  already gates staging on). */
export type SecretScanner = (root: string) => readonly string[];

/** Build the GITHUB SYNC execute API against the real store + real git/gh —
 *  the production wiring `main.ts` injects into the server. `runCommand`
 *  defaults to a real `execFile`-backed runner; tests inject a fake so no
 *  real `gh repo create`/`git push` ever fires. `scan` defaults to the real
 *  secret scanner and only ever runs for a `'public'` sync — a private repo
 *  carries the same risk profile as the operator's own local clone, so
 *  scanning it on every sync would be pure overhead with no safety payoff. */
export function createGithubSyncExecuteApi(
  dbPath: string,
  runCommand: CommandRunner = realRunner,
  scan: SecretScanner = scanForSecrets,
): GithubSyncExecuteApi {
  return async (projectId, visibility) => {
    const store = openStore(dbPath);
    try {
      const project = listProjects(store.db).find((p) => p.id === projectId);
      if (!project) return null;

      const vcs = new GitVcs(project.root_path);
      const hasRemote = await vcs.hasRemote();
      const plan = planGithubSync(project.slug, visibility, hasRemote);

      if (visibility === 'public') {
        const flagged = scan(project.root_path);
        if (flagged.length > 0) {
          return {
            ok: false,
            action: plan.action,
            details: `Public sync blocked — possible secrets found: ${flagged.join(', ')}. Resolve these before syncing publicly.`,
          };
        }
      }

      const result = await runCommand(plan.command, plan.args, project.root_path);
      return {
        ok: result.exitCode === 0,
        action: plan.action,
        details:
          result.exitCode === 0
            ? plan.details
            : result.stderr.trim() || `${plan.command} exited ${result.exitCode}`,
      };
    } finally {
      store.close();
    }
  };
}
