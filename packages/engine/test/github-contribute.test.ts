// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { planGithubIssue, InvalidIssueInputError } from '../src/github-contribute.js';

describe('planGithubIssue', () => {
  it('plans a "gh issue create --repo --title --body" against the given upstream repo', () => {
    expect(
      planGithubIssue('mastermind/autopilot', 'flights crash on empty SOUL', 'steps to repro...'),
    ).toEqual({
      command: 'gh',
      args: [
        'issue',
        'create',
        '--repo',
        'mastermind/autopilot',
        '--title',
        'flights crash on empty SOUL',
        '--body',
        'steps to repro...',
      ],
      details: 'opening an issue against mastermind/autopilot: "flights crash on empty SOUL"',
    });
  });

  it('trims the title before using it as both the --title arg and the details text', () => {
    const plan = planGithubIssue('mastermind/autopilot', '  a bug  ', 'body');
    expect(plan.args).toContain('a bug');
    expect(plan.details).toContain('"a bug"');
  });

  it('passes an empty body through unchanged — gh accepts an empty --body', () => {
    const plan = planGithubIssue('mastermind/autopilot', 'title', '');
    expect(plan.args).toEqual([
      'issue',
      'create',
      '--repo',
      'mastermind/autopilot',
      '--title',
      'title',
      '--body',
      '',
    ]);
  });

  it('throws InvalidIssueInputError up front for an empty or whitespace-only title', () => {
    expect(() => planGithubIssue('mastermind/autopilot', '', 'body')).toThrow(
      InvalidIssueInputError,
    );
    expect(() => planGithubIssue('mastermind/autopilot', '   ', 'body')).toThrow(
      InvalidIssueInputError,
    );
  });

  it('never plans a command for an empty title', () => {
    try {
      planGithubIssue('mastermind/autopilot', '', 'body');
      expect.unreachable('expected planGithubIssue to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidIssueInputError);
      expect((error as Error).name).toBe('InvalidIssueInputError');
      expect((error as Error).message).toBe('planGithubIssue: a non-empty title is required');
    }
  });
});
