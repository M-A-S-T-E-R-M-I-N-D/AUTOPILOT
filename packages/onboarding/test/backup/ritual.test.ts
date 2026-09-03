// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lockRepo } from '../../src/backup/ritual.js';
import { GitBackup } from '../../src/adapters/git-backup.js';
import { MYTH_TAG, LEGACY_TAG, FLIGHT_BRANCH } from '../../src/backup/refs.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}
function tagSha(repo: string, tag: string): string {
  return gitSync(repo, ['rev-parse', `refs/tags/${tag}`]);
}
function currentBranch(repo: string): string {
  return gitSync(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
}
function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 't@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'T']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
}

describe('lockRepo (real git)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-lock-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('backs up a clean repo: MYTH+LEGACY at HEAD, flight branch, main preserved', async () => {
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'seed']);
    const main = currentBranch(dir);
    const head = gitSync(dir, ['rev-parse', 'HEAD']);

    const result = await lockRepo(new GitBackup(dir));

    expect(result).toMatchObject({
      resumed: false,
      myth: MYTH_TAG,
      legacy: LEGACY_TAG,
      flight: FLIGHT_BRANCH,
    });
    expect(tagSha(dir, MYTH_TAG)).toBe(head);
    expect(tagSha(dir, LEGACY_TAG)).toBe(head);
    expect(currentBranch(dir)).toBe(FLIGHT_BRANCH);
    expect(gitSync(dir, ['rev-parse', main])).toBe(head); // main untouched
  });

  it('backs up a NON-repo folder: the baseline commit captures the pristine files as MYTH', async () => {
    writeFileSync(join(dir, 'hello.txt'), 'pristine');

    const result = await lockRepo(new GitBackup(dir));

    expect(result.resumed).toBe(false);
    // The pristine file is committed and reachable from the MYTH tag.
    expect(gitSync(dir, ['ls-tree', '--name-only', MYTH_TAG])).toContain('hello.txt');
    expect(currentBranch(dir)).toBe(FLIGHT_BRANCH);
    // The default baseline message is used when the caller supplies none.
    expect(gitSync(dir, ['log', '-1', '--format=%s', MYTH_TAG])).toBe(
      'chore(autopilot): baseline snapshot',
    );
  });

  it('does not re-init an already-existing repo when locking a clean repo', async () => {
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'seed']);

    const vcs = new GitBackup(dir);
    const initSpy = vi.spyOn(vcs, 'initRepo');

    await lockRepo(vcs);

    expect(initSpy).not.toHaveBeenCalled();
  });

  it('preserves uncommitted work when locking a dirty repo (never reset --hard)', async () => {
    initRepo(dir);
    writeFileSync(join(dir, 'committed.txt'), 'c');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'seed']);
    writeFileSync(join(dir, 'wip.txt'), 'uncommitted'); // dirty

    await lockRepo(new GitBackup(dir));

    expect(currentBranch(dir)).toBe(FLIGHT_BRANCH);
    expect(existsSync(join(dir, 'wip.txt'))).toBe(true); // work preserved
    expect(gitSync(dir, ['status', '--porcelain'])).toContain('wip.txt');
  });

  it('refuses to baseline a folder containing a private key, and leaves it uncommitted', async () => {
    writeFileSync(join(dir, 'id_rsa'), 'not a real key, but named like one');

    await expect(lockRepo(new GitBackup(dir))).rejects.toThrow(/possible secret/i);

    // git init may have run (unborn repo), but no baseline commit or tag ever landed.
    expect(gitSync(dir, ['tag'])).toBe('');
  });

  it('refuses to baseline a folder containing an oversized file, and leaves it uncommitted', async () => {
    writeFileSync(join(dir, 'huge.bin'), Buffer.alloc(1024));

    await expect(lockRepo(new GitBackup(dir, 512))).rejects.toThrow(/too large to stage/i);

    // git init may have run (unborn repo), but no baseline commit or tag ever landed.
    expect(gitSync(dir, ['tag'])).toBe('');
  });

  it('resumes a seen repo without re-backing-up', async () => {
    initRepo(dir);
    writeFileSync(join(dir, 'a.txt'), 'one');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'seed']);

    const first = await lockRepo(new GitBackup(dir));
    const mythAfterFirst = tagSha(dir, MYTH_TAG);
    const second = await lockRepo(new GitBackup(dir));

    expect(first.resumed).toBe(false);
    expect(second.resumed).toBe(true);
    expect(tagSha(dir, MYTH_TAG)).toBe(mythAfterFirst); // tag not moved/duplicated
    expect(currentBranch(dir)).toBe(FLIGHT_BRANCH);
  });
});
