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
          'steps to repro...\n\n🛩️ Flown by AUTOPILOT on behalf of @copilot\n\nAutopilot-Agent: true',
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

  it('uses the disclosure footer alone as the body when the operator-typed body is empty', () => {
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
      '🛩️ Flown by AUTOPILOT on behalf of @copilot\n\nAutopilot-Agent: true',
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
    const body = prStep.args[prStep.args.length - 1];
    expect(body).toContain('fixes it\n\nCloses #42');
  });

  it('uses "Closes #<n>" alone as the body when issueNumber is given and body is empty', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', '', 7);
    const prStep = plan.steps[2];
    const body = prStep.args[prStep.args.length - 1];
    expect(body).toContain('Closes #7');
  });

  it('leaves body unchanged (besides the disclosure footer) when issueNumber is omitted', () => {
    const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', 'fixes it');
    const prStep = plan.steps[2];
    const body = prStep.args[prStep.args.length - 1];
    expect(body).toContain('fixes it');
    expect(body).not.toContain('Closes #');
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

  describe('identity-law disclosure', () => {
    it('always carries the "Flown by AUTOPILOT" line naming the fork owner as the operator', () => {
      const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', 'body');
      const prStep = plan.steps[2];
      const body = prStep.args[prStep.args.length - 1];
      expect(body).toContain('🛩️ Flown by AUTOPILOT on behalf of @copilot');
    });

    it('always carries the machine-readable Autopilot-Agent marker', () => {
      const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', 'body');
      const prStep = plan.steps[2];
      const body = prStep.args[prStep.args.length - 1];
      expect(body).toContain('Autopilot-Agent: true');
    });

    it('uses the trimmed fork owner in the disclosure line, not the raw untrimmed input', () => {
      const plan = planGithubPr('mastermind/autopilot', '  copilot  ', 'fix/x', 'title', 'body');
      const prStep = plan.steps[2];
      const body = prStep.args[prStep.args.length - 1];
      expect(body).toContain('@copilot');
      expect(body).not.toContain('@  copilot');
    });

    it('is present even when the operator-typed body and issueNumber are both absent', () => {
      const plan = planGithubPr('mastermind/autopilot', 'copilot', 'fix/x', 'title', '');
      const prStep = plan.steps[2];
      const body = prStep.args[prStep.args.length - 1];
      expect(body).toBe('🛩️ Flown by AUTOPILOT on behalf of @copilot\n\nAutopilot-Agent: true');
    });

    it('appends after the "Closes #<n>" trailer, not before it', () => {
      const plan = planGithubPr(
        'mastermind/autopilot',
        'copilot',
        'fix/x',
        'title',
        'fixes it',
        42,
      );
      const prStep = plan.steps[2];
      const body = prStep.args[prStep.args.length - 1];
      expect(body).toBe(
        'fixes it\n\nCloses #42\n\n🛩️ Flown by AUTOPILOT on behalf of @copilot\n\nAutopilot-Agent: true',
      );
    });
  });
});
