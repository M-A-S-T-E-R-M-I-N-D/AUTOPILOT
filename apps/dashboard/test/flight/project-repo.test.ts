// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE TASK GOES WHERE THE ISSUE LIVES (2026-09-24). The pool panel offered
 * every registered project as the home for a claimed issue's board task, so
 * an AUTOPILOT issue could be queued on a calculator sample with no GitHub
 * remote. Routing is now a fact read off each project's git origin.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  repoFromRemoteUrl,
  repoFromIssueUrl,
  sameRepo,
  routeClaimToProject,
  projectRepoOf,
} from '../../src/flight/project-repo.js';

describe('repoFromRemoteUrl', () => {
  it('reads owner/repo from every remote form git accepts for GitHub', () => {
    for (const url of [
      'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT.git',
      'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT',
      'https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT/',
      'http://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT.git',
      'https://token@github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT.git',
      'git@github.com:M-A-S-T-E-R-M-I-N-D/AUTOPILOT.git',
      'ssh://git@github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT.git',
      '  https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT.git\n',
    ]) {
      expect(repoFromRemoteUrl(url)).toBe('M-A-S-T-E-R-M-I-N-D/AUTOPILOT');
    }
  });

  it('keeps dots and underscores in a repository name, stripping only a trailing .git', () => {
    expect(repoFromRemoteUrl('https://github.com/a_b/my.repo.git')).toBe('a_b/my.repo');
  });

  it('is null for another host, a local path, or nothing — a guess would misroute', () => {
    for (const url of [
      'https://gitlab.com/o/r.git',
      'https://github.com.evil.example/o/r.git',
      'C:/repos/thing',
      'https://github.com/only-owner',
      '',
      null,
      undefined,
    ]) {
      expect(repoFromRemoteUrl(url as string | null | undefined)).toBeNull();
    }
  });
});

describe('repoFromIssueUrl', () => {
  it('reads owner/repo off an issue or pull request URL', () => {
    expect(repoFromIssueUrl('https://github.com/o/r/issues/42')).toBe('o/r');
    expect(repoFromIssueUrl('https://github.com/o/r/pull/7')).toBe('o/r');
  });

  it('is null for anything else', () => {
    expect(repoFromIssueUrl('https://github.com/o/r')).toBeNull();
    expect(repoFromIssueUrl('https://github.com/o/r/discussions/3')).toBeNull();
    expect(repoFromIssueUrl(undefined)).toBeNull();
  });
});

describe('sameRepo', () => {
  it('compares case-insensitively, as GitHub names do, and never matches an absent side', () => {
    expect(sameRepo('O/R', 'o/r')).toBe(true);
    expect(sameRepo('o/r', 'o/x')).toBe(false);
    expect(sameRepo(null, 'o/r')).toBe(false);
    expect(sameRepo('o/r', '')).toBe(false);
  });
});

describe('routeClaimToProject', () => {
  const projects = [
    { id: 'fly-autopilot', repo: 'M-A-S-T-E-R-M-I-N-D/AUTOPILOT' },
    { id: 'calc', repo: null },
    { id: 'other', repo: 'someone/else' },
  ];

  it('routes to the one project that is a checkout of the issue repository, with nothing asked', () => {
    expect(routeClaimToProject('m-a-s-t-e-r-m-i-n-d/autopilot', projects)).toEqual({
      ok: true,
      projectId: 'fly-autopilot',
    });
  });

  it('honours a request only for a connected project', () => {
    expect(routeClaimToProject('M-A-S-T-E-R-M-I-N-D/AUTOPILOT', projects, 'fly-autopilot')).toEqual(
      {
        ok: true,
        projectId: 'fly-autopilot',
      },
    );
  });

  it('refuses a request for a project with no remote — the calculator case — and names the right one', () => {
    const route = routeClaimToProject('M-A-S-T-E-R-M-I-N-D/AUTOPILOT', projects, 'calc');
    expect(route).toMatchObject({
      ok: false,
      reason: 'not-connected',
      candidates: ['fly-autopilot'],
    });
    if (!route.ok) expect(route.detail).toContain('calc');
  });

  it('says so when no registered project is a checkout of the repository', () => {
    const route = routeClaimToProject('nobody/nothing', projects);
    expect(route).toMatchObject({ ok: false, reason: 'no-connected-project', candidates: [] });
    if (!route.ok) expect(route.detail).toContain('nobody/nothing');
  });

  it('asks rather than guesses when two projects are checkouts of the same repository', () => {
    const twins = [...projects, { id: 'fly-autopilot-2', repo: 'M-A-S-T-E-R-M-I-N-D/AUTOPILOT' }];
    const route = routeClaimToProject('M-A-S-T-E-R-M-I-N-D/AUTOPILOT', twins);
    expect(route).toMatchObject({
      ok: false,
      reason: 'ambiguous',
      candidates: ['fly-autopilot', 'fly-autopilot-2'],
    });
    if (!route.ok) expect(route.detail).toContain('2 registered projects');
    expect(routeClaimToProject('M-A-S-T-E-R-M-I-N-D/AUTOPILOT', twins, 'fly-autopilot-2')).toEqual({
      ok: true,
      projectId: 'fly-autopilot-2',
    });
  });

  it('treats an empty request as no request', () => {
    expect(routeClaimToProject('M-A-S-T-E-R-M-I-N-D/AUTOPILOT', projects, '')).toEqual({
      ok: true,
      projectId: 'fly-autopilot',
    });
  });

  it('routes nothing when the issue repository itself is unknown', () => {
    expect(routeClaimToProject(null, projects)).toMatchObject({
      ok: false,
      reason: 'no-connected-project',
    });
  });
});

describe('projectRepoOf', () => {
  it('reads a real checkout origin, and is null for a folder that is not a git repository', () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'ap-project-repo-'));
    const plainDir = mkdtempSync(join(tmpdir(), 'ap-project-plain-'));
    try {
      execFileSync('git', ['init', '-q', repoDir], { windowsHide: true });
      execFileSync('git', ['-C', repoDir, 'remote', 'add', 'origin', 'git@github.com:o/r.git'], {
        windowsHide: true,
      });
      expect(projectRepoOf(repoDir, 1)).toBe('o/r');
      expect(projectRepoOf(plainDir, 1)).toBeNull();
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
      rmSync(plainDir, { recursive: true, force: true });
    }
  });

  it('serves a cached answer within five minutes and asks git again after', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ap-project-cache-'));
    try {
      execFileSync('git', ['init', '-q', dir], { windowsHide: true });
      expect(projectRepoOf(dir, 1_000)).toBeNull();
      execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/o/late.git'], {
        windowsHide: true,
      });
      expect(projectRepoOf(dir, 1_000 + 4 * 60_000)).toBeNull();
      expect(projectRepoOf(dir, 1_000 + 5 * 60_000)).toBe('o/late');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
