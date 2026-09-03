// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertBackedUp } from '../../src/backup/guard.js';
import { RepoNotBackedUpError } from '../../src/backup/errors.js';
import { isBackedUp, MYTH_TAG, LEGACY_TAG, FLIGHT_BRANCH } from '../../src/backup/refs.js';
import { lockRepo } from '../../src/backup/ritual.js';
import { GitBackup } from '../../src/adapters/git-backup.js';

function gitSync(repo: string, args: string[]): void {
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
}

describe('assertBackedUp + isBackedUp', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-guard-'));
    gitSync(dir, ['init', '-q']);
    gitSync(dir, ['config', 'user.email', 't@autopilot.dev']);
    gitSync(dir, ['config', 'user.name', 'T']);
    gitSync(dir, ['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(dir, 'a.txt'), 'x');
    gitSync(dir, ['add', '-A']);
    gitSync(dir, ['commit', '-q', '-m', 'seed']);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('rejects a repo with no MYTH/LEGACY snapshot', async () => {
    const vcs = new GitBackup(dir);
    expect(await isBackedUp(vcs)).toBe(false);
    await expect(assertBackedUp(vcs, dir)).rejects.toBeInstanceOf(RepoNotBackedUpError);
  });

  it('passes once the repo is locked', async () => {
    const vcs = new GitBackup(dir);
    await lockRepo(vcs);
    expect(await isBackedUp(vcs)).toBe(true);
    await expect(assertBackedUp(vcs, dir)).resolves.toBeUndefined();
  });

  it('exposes the AUTOPILOT ref names', () => {
    expect(MYTH_TAG).toBe('autopilot/myth');
    expect(LEGACY_TAG).toBe('autopilot/legacy');
    expect(FLIGHT_BRANCH).toBe('autopilot/flight');
  });

  it('rejects a repo with only the MYTH snapshot (LEGACY missing)', async () => {
    const vcs = new GitBackup(dir);
    await vcs.createTag(MYTH_TAG);
    expect(await isBackedUp(vcs)).toBe(false);
    await expect(assertBackedUp(vcs, dir)).rejects.toBeInstanceOf(RepoNotBackedUpError);
  });

  it('rejects a repo with only the LEGACY snapshot (MYTH missing)', async () => {
    const vcs = new GitBackup(dir);
    await vcs.createTag(LEGACY_TAG);
    expect(await isBackedUp(vcs)).toBe(false);
    await expect(assertBackedUp(vcs, dir)).rejects.toBeInstanceOf(RepoNotBackedUpError);
  });
});
