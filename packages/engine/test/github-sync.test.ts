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
