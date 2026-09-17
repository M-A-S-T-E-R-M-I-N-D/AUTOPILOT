// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitVcs } from '../../src/adapters/git.js';

/**
 * Records every git argv the adapter issues while still running the REAL
 * git — a pass-through spy on execFile. The revert sequence is only
 * observable this way: the `--abort` after a refused revert leaves no trace a
 * later `git status` could see (a dirty tree stops the revert before
 * anything is in progress), and the `-m 1` retry must NOT follow a plain
 * success. git.test.ts checks what the tree looks like afterwards; this file
 * checks which commands got there.
 */
const { argvLog } = vi.hoisted(() => ({ argvLog: [] as string[][] }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  const spy = (...args: unknown[]): unknown => {
    argvLog.push(args[1] as string[]);
    return (actual.execFile as unknown as (...a: unknown[]) => unknown)(...args);
  };
  return { ...actual, execFile: spy as unknown as typeof actual.execFile };
});

function gitSync(repo: string, args: string[]): string {
  return childProcess
    .execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', windowsHide: true })
    .trim();
}

/** The git subcommand text of every call since the log was last cleared. */
function gitCalls(): string[] {
  // argv is ['-C', repo, ...args]; keep only the args after the repo.
  return argvLog.map((argv) => argv.slice(2).join(' '));
}

describe('GitVcs.revertLast — the exact git sequence it issues', () => {
  let dir: string;
  let vcs: GitVcs;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-git-revseq-'));
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
    vcs = new GitVcs(dir);
    argvLog.length = 0;
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
