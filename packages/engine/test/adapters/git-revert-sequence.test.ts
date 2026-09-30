// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GitVcs,
  PUBLISHED_SIGNING_KEY_PATH,
  readPublishedSigningKey,
} from '../../src/adapters/git.js';

/**
 * Records every program and argv the adapter issues while still running the
 * REAL program — a pass-through spy on execFile. The revert sequence is only
 * observable this way: the `--abort` after a refused revert leaves no trace a
 * later `git status` could see (a dirty tree stops the revert before
 * anything is in progress), and the `-m 1` retry must NOT follow a plain
 * success. git.test.ts checks what the tree looks like afterwards; this file
 * checks which commands got there.
 *
 * A test can also answer one git subcommand itself through `canned`, for an
 * outcome real git cannot be driven to on demand — a diff past the 16MB
 * buffer, a signature that verifies. Every other call still runs for real.
 */
interface CannedAnswer {
  readonly error: Error | null;
  readonly stdout: string;
  readonly stderr: string;
}

const { callLog, canned } = vi.hoisted(() => ({
  callLog: [] as { file: string; argv: string[] }[],
  canned: new Map<string, CannedAnswer>(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  const spy = (...args: unknown[]): unknown => {
    const file = args[0] as string;
    const argv = args[1] as string[];
    callLog.push({ file, argv });
    // A git argv is ['-C', repo, subcommand, ...].
    const answer = file === 'git' ? canned.get(argv[2] ?? '') : undefined;
    if (answer) {
      const callback = args[3] as (error: Error | null, stdout: string, stderr: string) => void;
      callback(answer.error, answer.stdout, answer.stderr);
      return undefined;
    }
    return (actual.execFile as unknown as (...a: unknown[]) => unknown)(...args);
  };
  return { ...actual, execFile: spy as unknown as typeof actual.execFile };
});

function gitSync(repo: string, args: string[]): string {
  return childProcess
    .execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true })
    .trim();
}

/** A throwaway repo with two commits, the call log cleared after setting it up. */
function makeRepo(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'a.txt'), 'one');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: first']);
  writeFileSync(join(dir, 'a.txt'), 'two');
  gitSync(dir, ['add', '-A']);
  gitSync(dir, ['commit', '-q', '-m', 'feat: second']);
  callLog.length = 0;
  return dir;
}

/** The git subcommand text of every git call since the log was last cleared. */
function gitCalls(): string[] {
  // argv is ['-C', repo, ...args]; keep only the args after the repo.
  return callLog.filter(({ file }) => file === 'git').map(({ argv }) => argv.slice(2).join(' '));
}

afterEach(() => canned.clear());

describe('GitVcs.revertLast — the exact git sequence it issues', () => {
  let dir: string;
  let vcs: GitVcs;

  beforeEach(() => {
    dir = makeRepo('autopilot-git-revseq-');
    vcs = new GitVcs(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('a plain revert that succeeds is ONE git call — no abort, no -m 1 retry', async () => {
    await vcs.revertLast();
    expect(gitCalls()).toEqual(['revert --no-edit HEAD']);
  });

  it('a revert git refuses is aborted before the error is thrown, and never retried with -m 1', async () => {
    writeFileSync(join(dir, 'a.txt'), 'two\nuncommitted'); // blocks the merge
    await expect(vcs.revertLast()).rejects.toThrow(/git revert failed/);
    expect(gitCalls()).toEqual(['revert --no-edit HEAD', 'revert --abort']);
  });
});

describe('GitVcs.diffText — which git it runs, and which output it trusts', () => {
  let dir: string;
  let vcs: GitVcs;

  beforeEach(() => {
    dir = makeRepo('autopilot-git-diffseq-');
    vcs = new GitVcs(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('runs no git at all when either ref is empty (an unborn HEAD)', async () => {
    expect(await vcs.diffText('', 'HEAD')).toBe('');
    expect(await vcs.diffText('HEAD', '')).toBe('');
    expect(gitCalls()).toEqual([]);
  });

  it('drops what a failed diff printed — a diff past the 16MB buffer arrives cut off mid-hunk', async () => {
    canned.set('diff', {
      error: Object.assign(new RangeError('stdout maxBuffer length exceeded'), {
        code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
      }),
      stdout: 'diff --git a/a.txt b/a.txt\n@@ -1 +1 @@\n-one\n+tw',
      stderr: '',
    });

    expect(await vcs.diffText('HEAD~1', 'HEAD')).toBe('');
    expect(gitCalls()).toEqual(['diff --no-color --no-ext-diff HEAD~1 HEAD']);
  });
});

describe('GitVcs.verifyTag and readPublishedSigningKey — the key is read only for a signature that verified', () => {
  const PRIMARY = '1234567890ABCDEF1234567890ABCDEF12345678';
  let dir: string;
  let vcs: GitVcs;

  beforeEach(() => {
    dir = makeRepo('autopilot-git-verifyseq-');
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, PUBLISHED_SIGNING_KEY_PATH), 'published key\n');
    gitSync(dir, ['config', 'gpg.program', 'autopilot-no-such-gpg']);
    callLog.length = 0;
    vcs = new GitVcs(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('an unsigned tag is one `verify-tag --raw` call — there is no signer to hold to the key', async () => {
    gitSync(dir, ['tag', '-a', 'v0.13.0', '-m', 'release v0.13.0']);

    expect((await vcs.verifyTag('v0.13.0')).ok).toBe(false);
    expect(gitCalls()).toEqual(['verify-tag --raw v0.13.0']);
  });

  it('holds a signature that verified to the published key — here one gpg cannot list, so it refuses', async () => {
    canned.set('verify-tag', {
      error: null,
      stdout: '',
      stderr: `[GNUPG:] VALIDSIG ${PRIMARY} 2026-09-26 1758844800 0 4 0 22 8 00 ${PRIMARY}\n`,
    });

    expect(await vcs.verifyTag('v1.0.0')).toEqual({
      ok: false,
      details: `tag 'v1.0.0' is signed by ${PRIMARY}, but gpg could not list docs/SIGNING-KEY.asc (exit 1: no output — is autopilot-no-such-gpg on PATH?) — so it cannot be held to the published key`,
    });
    expect(gitCalls()).toEqual(['verify-tag --raw v1.0.0', 'config --get gpg.program']);
  });

  it('takes the gpg program only from a config read that succeeded, whatever a failed one printed', async () => {
    canned.set('config', {
      error: Object.assign(new Error('Command failed: git config'), { code: 1 }),
      stdout: 'autopilot-half-read-gpg\n',
      stderr: '',
    });

    await readPublishedSigningKey(dir);

    expect(callLog.map(({ file }) => file)).toEqual(['git', 'gpg']);
  });
});
