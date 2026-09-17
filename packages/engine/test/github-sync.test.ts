// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { planGithubSync, InvalidRepoNameError } from '../src/github-sync.js';

describe('planGithubSync', () => {
  it('plans a "gh repo create --private --source=. --push" when no remote exists', () => {
    expect(planGithubSync('my-project', 'private', false)).toEqual({
      action: 'create',
      command: 'gh',
      args: ['repo', 'create', 'my-project', '--private', '--source=.', '--push'],
      details: 'no remote configured — creating a new private GitHub repo "my-project" and pushing',
    });
  });

  it('plans a "gh repo create --public ..." when the caller chooses public visibility', () => {
    expect(planGithubSync('my-project', 'public', false)).toEqual({
      action: 'create',
      command: 'gh',
      args: ['repo', 'create', 'my-project', '--public', '--source=.', '--push'],
      details: 'no remote configured — creating a new public GitHub repo "my-project" and pushing',
    });
  });

  it('plans a plain "git push" re-sync when a remote already exists, regardless of visibility', () => {
    expect(planGithubSync('my-project', 'private', true)).toEqual({
      action: 'push',
      command: 'git',
      args: ['push'],
      details: 're-sync: remote already configured — pushing to it',
    });
    expect(planGithubSync('my-project', 'public', true)).toEqual({
      action: 'push',
      command: 'git',
      args: ['push'],
      details: 're-sync: remote already configured — pushing to it',
    });
  });

  // The branch-naming arm existed with no test at all. It is the fix for a
  // real operator-visible failure (2026-09-09): a bare `git push` only works
  // when the current branch already TRACKS a remote one, which a locally
  // created branch — every flight branch this fleet makes — does not, so the
  // panel showed git's own raw "fatal: The current branch autopilot/flight has
  // no upstream branch" instead of a sync. Untested, every part of that fix
  // was free to rot: the -u flag, the remote name, the ref, even whether the
  // branch arm was entered at all.
  it('names the branch with -u so a never-pushed local branch gets its upstream set', () => {
    expect(planGithubSync('my-project', 'private', true, 'autopilot/flight')).toEqual({
      action: 'push',
      command: 'git',
      args: ['push', '-u', 'origin', 'autopilot/flight'],
      details:
        're-sync: pushing "autopilot/flight" to the configured remote (setting upstream if unset)',
    });
  });

  it('trims the branch it was handed, in the args and in the details alike', () => {
    expect(planGithubSync('my-project', 'private', true, '  main  ')).toEqual({
      action: 'push',
      command: 'git',
      args: ['push', '-u', 'origin', 'main'],
      details: 're-sync: pushing "main" to the configured remote (setting upstream if unset)',
    });
  });

  it('falls back to a bare push for a branch that is absent or only whitespace', () => {
    const bare = {
      action: 'push',
      command: 'git',
      args: ['push'],
      details: 're-sync: remote already configured — pushing to it',
    };
    expect(planGithubSync('my-project', 'private', true, undefined)).toEqual(bare);
    expect(planGithubSync('my-project', 'private', true, '')).toEqual(bare);
    expect(planGithubSync('my-project', 'private', true, '   ')).toEqual(bare);
  });

  it('still creates rather than pushes when a branch is named but no remote exists', () => {
    // hasRemote is the earlier decision: naming a branch must not turn a
    // first-time create into a push at a remote that does not exist yet.
    expect(planGithubSync('my-project', 'private', false, 'main')).toEqual({
      action: 'create',
      command: 'gh',
      args: ['repo', 'create', 'my-project', '--private', '--source=.', '--push'],
      details: 'no remote configured — creating a new private GitHub repo "my-project" and pushing',
    });
  });

  it('never force-pushes, whichever arm plans the push', () => {
    // The board task's standing constraint: an existing remote is never
    // recreated or force-pushed. Asserted on both push arms at once.
    for (const branch of [undefined, 'autopilot/flight']) {
      const plan = planGithubSync('my-project', 'private', true, branch);
      expect(plan.args).not.toContain('--force');
      expect(plan.args).not.toContain('-f');
      expect(plan.args).not.toContain('--force-with-lease');
    }
  });

  it('accepts repo names built only from letters, digits, ".", "-", and "_"', () => {
    expect(() => planGithubSync('my_project.v2-final', 'private', false)).not.toThrow();
  });

  it('throws InvalidRepoNameError up front for a repo name with disallowed characters', () => {
    expect(() => planGithubSync('my project', 'private', false)).toThrow(InvalidRepoNameError);
    expect(() => planGithubSync('../escape', 'private', false)).toThrow(InvalidRepoNameError);
    expect(() => planGithubSync('', 'private', false)).toThrow(InvalidRepoNameError);
  });

  it('names both the offending repo name and the allowed character set in the thrown error', () => {
    try {
      planGithubSync('my project', 'private', false);
      expect.unreachable('expected planGithubSync to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe('InvalidRepoNameError');
      expect((error as Error).message).toBe(
        'planGithubSync: repo name "my project" contains characters GitHub does not allow ' +
          '(letters, digits, ".", "-", "_" only)',
      );
    }
  });

  it('never plans a command for a malformed repo name', () => {
    try {
      planGithubSync('rm -rf /', 'private', false);
      expect.unreachable('expected planGithubSync to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRepoNameError);
    }
  });
});
