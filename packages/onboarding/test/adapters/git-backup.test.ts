// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitBackup } from '../../src/adapters/git-backup.js';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));

// execFile is heavily overloaded (options shape picks the callback signature);
// fighting that overload set from a test double buys nothing, so the mock is
// driven through its untyped vi.fn() surface instead — same pattern as
// apps/dashboard/test/connection/cli-probe.test.ts.
const execFileMock = vi.mocked(execFile) as unknown as {
  mockReset(): void;
  mockImplementation(impl: (...args: unknown[]) => unknown): void;
  mock: { calls: unknown[][] };
};

type ExecFileCallback = (
  error: (Error & { code?: unknown }) | null,
  stdout: string | null,
  stderr?: string | null,
) => void;

function mockGitResult(
  error: (Error & { code?: unknown }) | null,
  stdout: string | null,
  stderr: string | null = null,
): void {
  execFileMock.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as ExecFileCallback;
    cb(error, stdout, stderr);
    return {};
  });
}

function mockGitSequence(
  results: Array<[(Error & { code?: unknown }) | null, string | null]>,
): void {
  let call = 0;
  execFileMock.mockImplementation((...args: unknown[]) => {
    const cb = args[args.length - 1] as ExecFileCallback;
    const [error, stdout] = results[call] ?? [null, ''];
    call += 1;
    cb(error, stdout);
    return {};
  });
}

/** The `args` array (2nd positional) execFile was called with, for call `index`. */
function callArgs(index: number): unknown {
  return (execFileMock.mock.calls[index] as unknown[])[1];
}

/** The options object (3rd positional) execFile was called with, for call `index`. */
function callOptions(index: number): unknown {
  return (execFileMock.mock.calls[index] as unknown[])[2];
}

describe('GitBackup', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('runs git with -C <repo> plus the given args, and the fixed maxBuffer/windowsHide options', async () => {
    mockGitResult(null, 'true\n');

    const backup = new GitBackup('/repo');
    await backup.status();

    const [binary] = execFileMock.mock.calls[0] as [string, string[]];
    expect(binary).toBe('git');
    expect(callArgs(0)).toEqual(['-C', '/repo', 'rev-parse', '--is-inside-work-tree']);
    expect(callOptions(0)).toEqual({ maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  });

  it('maps a numeric err.code straight through as the exit code', async () => {
    mockGitResult(Object.assign(new Error('boom'), { code: 128 }), '');

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    // rev-parse --is-inside-work-tree failed (exit 128) -> not a repo.
    expect(status).toEqual({ isRepo: false, head: null, branch: null, dirty: false });
  });

  it('falls back to exit code 1 when the error carries no numeric code (e.g. ENOENT)', async () => {
    mockGitResult(Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }), null);

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status).toEqual({ isRepo: false, head: null, branch: null, dirty: false });
  });

  it('treats a null stdout as an empty string', async () => {
    mockGitResult(null, null);

    const backup = new GitBackup('/repo');
    const exists = await backup.tagExists('v1');

    // exitCode 0 with empty stdout still resolves true (--quiet suppresses output).
    expect(exists).toBe(true);
  });

  it('treats a null HEAD stdout as an empty string, not the literal word "null"', async () => {
    mockGitSequence([
      [null, 'true\n'],
      [null, null],
      [null, 'main\n'],
      [null, ''],
    ]);

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status.head).toBe('');
  });

  it('reports a clean, non-detached repo status', async () => {
    mockGitSequence([
      [null, 'true\n'],
      [null, 'abc123\n'],
      [null, 'main\n'],
      [null, ''],
    ]);

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status).toEqual({ isRepo: true, head: 'abc123', branch: 'main', dirty: false });
  });

  it('reports a dirty, detached-HEAD repo as branch: null', async () => {
    mockGitSequence([
      [null, 'true\n'],
      [null, 'abc123\n'],
      [null, 'HEAD\n'],
      [null, ' M file.txt\n'],
    ]);

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status).toEqual({ isRepo: true, head: 'abc123', branch: null, dirty: true });
  });

  it('treats a whitespace-only porcelain status as clean, not dirty', async () => {
    mockGitSequence([
      [null, 'true\n'],
      [null, 'abc123\n'],
      [null, 'main\n'],
      [null, '  \n'],
    ]);

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status.dirty).toBe(false);
  });

  it('reports not-a-repo when is-inside-work-tree fails even though its stdout says true', async () => {
    mockGitResult(Object.assign(new Error('fail'), { code: 1 }), 'true\n');

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status).toEqual({ isRepo: false, head: null, branch: null, dirty: false });
    expect(execFileMock.mock.calls).toHaveLength(1);
  });

  it('reports not-a-repo when is-inside-work-tree succeeds but its stdout is not exactly "true"', async () => {
    mockGitResult(null, 'false\n');

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status).toEqual({ isRepo: false, head: null, branch: null, dirty: false });
    expect(execFileMock.mock.calls).toHaveLength(1);
  });

  it('reports head: null (not a stale value) when the HEAD rev-parse fails', async () => {
    mockGitSequence([
      [null, 'true\n'],
      [Object.assign(new Error('fail'), { code: 1 }), ''],
      [null, 'main\n'],
      [null, ''],
    ]);

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status).toEqual({ isRepo: true, head: null, branch: 'main', dirty: false });
    expect(callArgs(1)).toEqual(['-C', '/repo', 'rev-parse', 'HEAD']);
  });

  it('reports branch: null (not empty string) when the abbrev-ref rev-parse fails', async () => {
    mockGitSequence([
      [null, 'true\n'],
      [null, 'abc123\n'],
      // Non-empty stdout on a nonzero exit proves the exitCode check itself
      // gates branchRaw — not just that stdout happens to be empty too.
      [Object.assign(new Error('fail'), { code: 1 }), 'stale-value\n'],
      [null, ''],
    ]);

    const backup = new GitBackup('/repo');
    const status = await backup.status();

    expect(status).toEqual({ isRepo: true, head: 'abc123', branch: null, dirty: false });
    expect(callArgs(2)).toEqual(['-C', '/repo', 'rev-parse', '--abbrev-ref', 'HEAD']);
    expect(callArgs(3)).toEqual(['-C', '/repo', 'status', '--porcelain']);
  });

  it('resolves tagExists/branchExists false on a non-zero exit', async () => {
    mockGitResult(Object.assign(new Error('not found'), { code: 1 }), '');

    const backup = new GitBackup('/repo');

    expect(await backup.tagExists('missing')).toBe(false);
    expect(await backup.branchExists('missing')).toBe(false);
  });

  it('tagExists/branchExists resolve true on a zero exit, with the exact ref args', async () => {
    mockGitResult(null, '');
    const backup = new GitBackup('/repo');

    expect(await backup.tagExists('v1')).toBe(true);
    expect(callArgs(0)).toEqual([
      '-C',
      '/repo',
      'rev-parse',
      '--verify',
      '--quiet',
      'refs/tags/v1',
    ]);

    expect(await backup.branchExists('MYTH')).toBe(true);
    expect(callArgs(1)).toEqual([
      '-C',
      '/repo',
      'rev-parse',
      '--verify',
      '--quiet',
      'refs/heads/MYTH',
    ]);
  });

  it('initRepo resolves on success and throws with trimmed git output on failure', async () => {
    mockGitResult(null, '');
    await expect(new GitBackup('/repo').initRepo()).resolves.toBeUndefined();
    expect(callArgs(0)).toEqual(['-C', '/repo', 'init']);

    mockGitResult(Object.assign(new Error('fail'), { code: 128 }), '  fatal: not a git repo  \n');
    await expect(new GitBackup('/repo').initRepo()).rejects.toThrow(
      'git init failed: fatal: not a git repo',
    );
  });

  it('commitAll stages, commits with a self-supplied identity via a -F message file, and returns the new HEAD sha', async () => {
    let messageFileContentAtCommitTime: string | undefined;
    let call = 0;
    const results: Array<[(Error & { code?: unknown }) | null, string]> = [
      [null, ''],
      [null, ''],
      [null, 'deadbeef\n'],
    ];
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      if (call === 1) {
        const commitArgs = args[1] as string[];
        const messageFilePath = commitArgs[commitArgs.indexOf('-F') + 1] as string;
        messageFileContentAtCommitTime = readFileSync(messageFilePath, 'utf8');
      }
      const [error, stdout] = results[call] ?? [null, ''];
      call += 1;
      cb(error, stdout);
      return {};
    });

    const backup = new GitBackup('/repo');
    const sha = await backup.commitAll('baseline');

    expect(sha).toBe('deadbeef');
    expect(callArgs(0)).toEqual(['-C', '/repo', 'add', '-A']);
    // The message travels via a temp file (`-F <path>`), not a raw argv
    // element (`-m <message>`) — a long message passed as a single argv
    // element can blow the OS command-line length limit (ENAMETOOLONG on
    // Windows), the same defect class already fixed for GitVcs.tag/notes in
    // packages/engine/src/adapters/git.ts.
    expect(callArgs(1)).toEqual([
      '-C',
      '/repo',
      '-c',
      'user.name=AUTOPILOT',
      '-c',
      'user.email=autopilot@localhost',
      'commit',
      '--no-gpg-sign',
      '-F',
      expect.any(String),
    ]);
    expect(messageFileContentAtCommitTime).toBe('baseline');
    expect(callArgs(2)).toEqual(['-C', '/repo', 'rev-parse', 'HEAD']);
  });

  it('commitAll writes a very long commit message to the temp file instead of argv, avoiding ENAMETOOLONG', async () => {
    const longMessage = 'x'.repeat(200_000);
    let messageFileContentAtCommitTime: string | undefined;
    let call = 0;
    const results: Array<[(Error & { code?: unknown }) | null, string]> = [
      [null, ''],
      [null, ''],
      [null, 'deadbeef\n'],
    ];
    execFileMock.mockImplementation((...args: unknown[]) => {
      const cb = args[args.length - 1] as ExecFileCallback;
      if (call === 1) {
        const commitArgs = args[1] as string[];
        const messageFilePath = commitArgs[commitArgs.indexOf('-F') + 1] as string;
        messageFileContentAtCommitTime = readFileSync(messageFilePath, 'utf8');
        // The 200k-char message never appears in argv itself.
        expect(commitArgs.join(' ')).not.toContain(longMessage);
      }
      const [error, stdout] = results[call] ?? [null, ''];
      call += 1;
      cb(error, stdout);
      return {};
    });

    const backup = new GitBackup('/repo');
    await backup.commitAll(longMessage);

    expect(messageFileContentAtCommitTime).toBe(longMessage);
  });

  it('commitAll throws when a secret-shaped file is staged, without ever calling git', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-git-backup-'));
    try {
      writeFileSync(join(dir, '.env'), 'SECRET=1\n');

      await expect(new GitBackup(dir).commitAll('baseline')).rejects.toThrow(/possible secret/i);
      expect(execFileMock.mock.calls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('commitAll throws on a file above the configured max size, without ever calling git', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'autopilot-git-backup-'));
    try {
      writeFileSync(join(dir, 'huge.bin'), Buffer.alloc(1024));

      await expect(new GitBackup(dir, 512).commitAll('baseline')).rejects.toThrow(
        /too large to stage/i,
      );
      expect(execFileMock.mock.calls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('commitAll throws when git add fails, without attempting the commit', async () => {
    mockGitResult(Object.assign(new Error('fail'), { code: 1 }), '  add failed  \n');

    await expect(new GitBackup('/repo').commitAll('baseline')).rejects.toThrow(
      'git add failed: add failed',
    );
    expect(execFileMock.mock.calls).toHaveLength(1);
  });

  it('prefers stderr over stdout for the failure reason (board web-mss2y67i-3lmwzi — real git writes failures to stderr, leaving stdout empty)', async () => {
    mockGitResult(
      Object.assign(new Error('fail'), { code: 1 }),
      '',
      '  fatal: not a git repository  \n',
    );

    await expect(new GitBackup('/repo').commitAll('baseline')).rejects.toThrow(
      'git add failed: fatal: not a git repository',
    );
  });

  it('commitAll throws when the commit itself fails', async () => {
    mockGitSequence([
      [null, ''],
      [Object.assign(new Error('fail'), { code: 1 }), '  nothing to commit  \n'],
    ]);

    await expect(new GitBackup('/repo').commitAll('baseline')).rejects.toThrow(
      'git commit failed: nothing to commit',
    );
  });

  it('createTag/createBranch/checkoutBranch resolve on success with the exact ref args', async () => {
    mockGitResult(null, '');
    const ok = new GitBackup('/repo');

    await expect(ok.createTag('v1')).resolves.toBeUndefined();
    expect(callArgs(0)).toEqual(['-C', '/repo', 'tag', 'v1']);

    await expect(ok.createBranch('MYTH')).resolves.toBeUndefined();
    expect(callArgs(1)).toEqual(['-C', '/repo', 'branch', 'MYTH']);

    await expect(ok.checkoutBranch('MYTH')).resolves.toBeUndefined();
    expect(callArgs(2)).toEqual(['-C', '/repo', 'checkout', 'MYTH']);
  });

  it('createTag/createBranch/checkoutBranch throw with trimmed git output on failure', async () => {
    mockGitResult(Object.assign(new Error('fail'), { code: 1 }), '  fatal: bad ref  \n');
    const failing = new GitBackup('/repo');

    await expect(failing.createTag('v1')).rejects.toThrow('git tag failed: fatal: bad ref');
    await expect(failing.createBranch('MYTH')).rejects.toThrow('git branch failed: fatal: bad ref');
    await expect(failing.checkoutBranch('MYTH')).rejects.toThrow(
      'git checkout failed: fatal: bad ref',
    );
  });
});
