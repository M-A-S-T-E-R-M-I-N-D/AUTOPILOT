// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HugeFileDetectedError, PossibleSecretsDetectedError } from '../backup/errors.js';
import { scanForSecrets } from '../backup/secret-guard.js';
import { MAX_STAGED_FILE_BYTES, scanForHugeFiles } from '../backup/size-guard.js';
import type { BackupVcs, RepoStatus } from '../backup/types.js';

function git(
  repo: string,
  args: readonly string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repo, ...args],
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const code =
          // Stryker disable next-line ConditionalExpression,EqualityOperator,StringLiteral:
          // every caller in this file only ever compares the resolved
          // exitCode to zero — the exact numeric value execFile's err.code
          // carries through (vs. the bare `1` fallback) is never
          // independently observable once err itself is truthy.
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode: code });
      },
    );
  });
}

/** git's failure-path commands write their real reason to stderr with an
 *  empty stdout (board web-mss2y67i-3lmwzi) — stderr is preferred, stdout is
 *  the fallback in case a hook prints there instead. */
function gitFailureReason(result: { readonly stdout: string; readonly stderr: string }): string {
  return result.stderr.trim() || result.stdout.trim();
}

/** Writes `message` to a throwaway temp file and passes its path to `fn`,
 *  cleaning up unconditionally after. A long commit message passed as a
 *  single argv element can blow the OS command-line length limit
 *  (ENAMETOOLONG on Windows) — the same class of bug already fixed for
 *  `GitVcs.tag`/`notes` in packages/engine/src/adapters/git.ts. */
async function withMessageTempFile<T>(
  message: string,
  fn: (messageFilePath: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'autopilot-git-msg-'));
  const messageFilePath = join(dir, 'MSG');
  try {
    await writeFile(messageFilePath, message, 'utf8');
    return await fn(messageFilePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Git adapter for the backup ritual. Every write is additive (init/commit/tag/
 * branch/checkout) — never `reset --hard`, force-push, or history rewrite. A
 * self-supplied identity + `--no-gpg-sign` make the baseline commit work even on
 * a freshly-inited folder with no configured git user. `commitAll` runs
 * {@link scanForSecrets} and {@link scanForHugeFiles} before `git add -A`: an
 * onboarding target may have no .gitignore at all, so nothing else stops a
 * stray private key, credential file, or oversized blob from staging straight
 * into the baseline commit — history that can never be rewritten under the
 * additive-only rule above.
 */
export class GitBackup implements BackupVcs {
  constructor(
    private readonly repo: string,
    private readonly maxStagedFileBytes: number = MAX_STAGED_FILE_BYTES,
  ) {}

  async status(): Promise<RepoStatus> {
    const inside = await git(this.repo, ['rev-parse', '--is-inside-work-tree']);
    if (inside.exitCode !== 0 || inside.stdout.trim() !== 'true') {
      return { isRepo: false, head: null, branch: null, dirty: false };
    }
    const headRes = await git(this.repo, ['rev-parse', 'HEAD']);
    const head = headRes.exitCode === 0 ? headRes.stdout.trim() : null;
    const branchRes = await git(this.repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branchRaw = branchRes.exitCode === 0 ? branchRes.stdout.trim() : '';
    const branch = branchRaw === '' || branchRaw === 'HEAD' ? null : branchRaw;
    const statusRes = await git(this.repo, ['status', '--porcelain']);
    return { isRepo: true, head, branch, dirty: statusRes.stdout.trim() !== '' };
  }

  tagExists(tag: string): Promise<boolean> {
    return git(this.repo, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`]).then(
      (r) => r.exitCode === 0,
    );
  }

  branchExists(branch: string): Promise<boolean> {
    return git(this.repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).then(
      (r) => r.exitCode === 0,
    );
  }

  async initRepo(): Promise<void> {
    const r = await git(this.repo, ['init']);
    if (r.exitCode !== 0) throw new Error(`git init failed: ${gitFailureReason(r)}`);
  }

  async commitAll(message: string): Promise<string> {
    const secrets = scanForSecrets(this.repo);
    if (secrets.length > 0) throw new PossibleSecretsDetectedError(secrets);
    const huge = scanForHugeFiles(this.repo, this.maxStagedFileBytes);
    if (huge.length > 0) throw new HugeFileDetectedError(huge);

    const add = await git(this.repo, ['add', '-A']);
    if (add.exitCode !== 0) throw new Error(`git add failed: ${gitFailureReason(add)}`);
    const commit = await withMessageTempFile(message, (messageFilePath) =>
      git(this.repo, [
        '-c',
        'user.name=AUTOPILOT',
        '-c',
        'user.email=autopilot@localhost',
        'commit',
        '--no-gpg-sign',
        '-F',
        messageFilePath,
      ]),
    );
    if (commit.exitCode !== 0) throw new Error(`git commit failed: ${gitFailureReason(commit)}`);
    const head = await git(this.repo, ['rev-parse', 'HEAD']);
    return head.stdout.trim();
  }

  async createTag(tag: string): Promise<void> {
    const r = await git(this.repo, ['tag', tag]);
    if (r.exitCode !== 0) throw new Error(`git tag failed: ${gitFailureReason(r)}`);
  }

  async createBranch(branch: string): Promise<void> {
    const r = await git(this.repo, ['branch', branch]);
    if (r.exitCode !== 0) throw new Error(`git branch failed: ${gitFailureReason(r)}`);
  }

  async checkoutBranch(branch: string): Promise<void> {
    const r = await git(this.repo, ['checkout', branch]);
    if (r.exitCode !== 0) throw new Error(`git checkout failed: ${gitFailureReason(r)}`);
  }
}
