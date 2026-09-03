// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { planGithubPr, InvalidPrInputError, FORK_REMOTE } from '../src/github-pr-contribute.js';

describe('planGithubPr', () => {
  it('plans fork, push, and pr-create as three ordered steps', () => {
    const plan = planGithubPr(
      'mastermind/autopilot',
      'copilot',
      'fix/flight-crash',
      'fix: flight crash on empty SOUL',
      'steps to repro...',
    );
    expect(plan.steps).toEqual([
      {
        command: 'gh',
        args: ['repo', 'fork', 'mastermind/autopilot', '--remote', '--remote-name', FORK_REMOTE],
      },
      { command: 'git', args: ['push', FORK_REMOTE, 'fix/flight-crash'] },
      {
        command: 'gh',
        args: [
          'pr',
          'create',
          '--repo',
          'mastermind/autopilot',
          '--head',
          'copilot:fix/flight-crash',
          '--title',
          'fix: flight crash on empty SOUL',
          '--body',
          'steps to repro...',
        ],
      },
    ]);
  });

  it('describes the plan in details, naming the upstream repo and branch', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', 'body');
    expect(plan.details).toContain('mastermind/autopilot');
    expect(plan.details).toContain('fix/x');
  });

  it('trims the title before using it as both the --title arg and the details text', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', '  a fix  ', 'body');
    const prStep = plan.steps[2];
    expect(prStep.args).toContain('a fix');
  });

  it('trims branch before using it in the push and pr-create args — untrimmed input never reaches argv', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', '  fix/x  ', 'title', 'body');
    const [, pushStep, prStep] = plan.steps;
    expect(pushStep.args).toEqual(['push', FORK_REMOTE, 'fix/x']);
    expect(prStep.args).toContain('copilot:fix/x');
    expect(plan.details).toContain('"fix/x"');
  });

  it('trims forkOwner before using it in the pr-create --head arg — untrimmed input never reaches argv', () => {
    const plan = planGithubPr('mastermind/autopilot', '  copilot  ', 'fix/x', 'title', 'body');
    const prStep = plan.steps[2];
    expect(prStep.args).toContain('copilot:fix/x');
  });

  it('passes an empty body through unchanged — gh accepts an empty --body', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', '');
    const prStep = plan.steps[2];
    expect(prStep.args).toEqual([
      'pr',
      'create',
      '--repo',
      'mastermind/autopilot',
      '--head',
      'copilot:fix/x',
      '--title',
      'title',
      '--body',
      '',
    ]);
  });

  it('throws InvalidPrInputError up front for an empty or whitespace-only title', () => {
    expect(() => planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', '', 'body')).toThrow(
      InvalidPrInputError,
    );
    expect(() => planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', '   ', 'body')).toThrow(
      InvalidPrInputError,
    );
  });

  it('throws InvalidPrInputError up front for an empty or whitespace-only branch', () => {
    expect(() => planGithubPr('mastermind/autopilot', 'copilot', '', 'title', 'body')).toThrow(
      InvalidPrInputError,
    );
    expect(() => planGithubPr('mastermind/autopilot', 'copilot', '  ', 'title', 'body')).toThrow(
      InvalidPrInputError,
    );
  });

  it('throws InvalidPrInputError up front for an empty or whitespace-only fork owner', () => {
    expect(() => planGithubPr('mastermind/autopilot', '', 'fix/x', 'title', 'body')).toThrow(
      InvalidPrInputError,
    );
  });

  it('never plans a command for an empty title', () => {
    try {
      planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', '', 'body');
      expect.unreachable('expected planGithubPr to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPrInputError);
      expect((error as Error).name).toBe('InvalidPrInputError');
    }
  });

  it('appends a "Closes #<n>" trailer on its own line when issueNumber is given and body is non-empty', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', 'fixes it', 42);
    const prStep = plan.steps[2];
    expect(prStep.args).toContain('fixes it\n\nCloses #42');
  });

  it('uses "Closes #<n>" alone as the body when issueNumber is given and body is empty', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', '', 7);
    const prStep = plan.steps[2];
    expect(prStep.args).toContain('Closes #7');
  });

  it('leaves body unchanged when issueNumber is omitted', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', 'fixes it');
    const prStep = plan.steps[2];
    expect(prStep.args).toContain('fixes it');
  });

  it('names the closed issue in details when issueNumber is given', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', 'body', 42);
    expect(plan.details).toContain('closing #42');
  });

  it('throws InvalidPrInputError for a zero, negative, or fractional issueNumber, touching nothing', () => {
    for (const bad of [0, -1, 1.5]) {
      expect(() =>
        planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', 'body', bad),
      ).toThrow(InvalidPrInputError);
    }
  });
});
