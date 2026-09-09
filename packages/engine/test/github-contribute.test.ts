// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { planGithubIssue, InvalidIssueInputError } from '../src/github-contribute.js';

const V = '1.2.3';
const REPO_LINK = '[AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT)';

describe('planGithubIssue', () => {
  it('plans a "gh issue create --repo --title --body" against the given upstream repo', () => {
    const plan = planGithubIssue(
      'mastermind/autopilot',
      'copilot',
      'flights crash on empty SOUL',
      'steps to repro...',
      V,
    );
    expect(plan).toEqual({
      command: 'gh',
      args: [
        'issue',
        'create',
        '--repo',
        'mastermind/autopilot',
        '--title',
        'flights crash on empty SOUL',
        '--body',
        `steps to repro...\n\n🛩️ Flown by ${REPO_LINK} v${V}, on behalf of @copilot\n\nAutopilot-Agent: true`,
      ],
      details: 'opening an issue against mastermind/autopilot: "flights crash on empty SOUL"',
    });
  });

  it('trims the title before using it as both the --title arg and the details text', () => {
    const plan = planGithubIssue('mastermind/autopilot', 'copilot', '  a bug  ', 'body', V);
    expect(plan.args).toContain('a bug');
    expect(plan.details).toContain('"a bug"');
  });

  it('uses the disclosure footer alone as the body when the operator-typed body is empty', () => {
    const plan = planGithubIssue('mastermind/autopilot', 'copilot', 'title', '', V);
    expect(plan.args).toEqual([
      'issue',
      'create',
      '--repo',
      'mastermind/autopilot',
      '--title',
      'title',
      '--body',
      `🛩️ Flown by ${REPO_LINK} v${V}, on behalf of @copilot\n\nAutopilot-Agent: true`,
    ]);
  });

  it('throws InvalidIssueInputError up front for an empty or whitespace-only title', () => {
    expect(() => planGithubIssue('mastermind/autopilot', 'copilot', '', 'body', V)).toThrow(
      InvalidIssueInputError,
    );
    expect(() => planGithubIssue('mastermind/autopilot', 'copilot', '   ', 'body', V)).toThrow(
      InvalidIssueInputError,
    );
  });

  it('throws InvalidIssueInputError up front for an empty or whitespace-only operatorHandle', () => {
    expect(() => planGithubIssue('mastermind/autopilot', '', 'title', 'body', V)).toThrow(
      InvalidIssueInputError,
    );
    expect(() => planGithubIssue('mastermind/autopilot', '   ', 'title', 'body', V)).toThrow(
      InvalidIssueInputError,
    );
  });

  it('never plans a command for an empty title', () => {
    try {
      planGithubIssue('mastermind/autopilot', 'copilot', '', 'body', V);
      expect.unreachable('expected planGithubIssue to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidIssueInputError);
      expect((error as Error).name).toBe('InvalidIssueInputError');
      expect((error as Error).message).toBe('planGithubIssue: a non-empty title is required');
    }
  });

  describe('identity-law disclosure', () => {
    it('always carries the "Flown by AUTOPILOT" line naming the operator', () => {
      const plan = planGithubIssue('mastermind/autopilot', 'copilot', 'title', 'body', V);
      expect(plan.args).toContain(
        `body\n\n🛩️ Flown by ${REPO_LINK} v${V}, on behalf of @copilot\n\nAutopilot-Agent: true`,
      );
    });

    it('uses the trimmed operator handle in the disclosure line, not the raw untrimmed input', () => {
      const plan = planGithubIssue('mastermind/autopilot', '  copilot  ', 'title', 'body', V);
      const bodyArg = plan.args[plan.args.length - 1];
      expect(bodyArg).toContain('@copilot');
      expect(bodyArg).not.toContain('@  copilot');
    });

    it('is present even when the operator-typed body is absent', () => {
      const plan = planGithubIssue('mastermind/autopilot', 'copilot', 'title', '', V);
      const bodyArg = plan.args[plan.args.length - 1];
      expect(bodyArg).toBe(
        `🛩️ Flown by ${REPO_LINK} v${V}, on behalf of @copilot\n\nAutopilot-Agent: true`,
      );
    });

    it('names the AUTOPILOT repo and the flying version in the spread-line (ATTRIBUTION.md §2)', () => {
      const plan = planGithubIssue('mastermind/autopilot', 'copilot', 'title', 'body', '9.9.9');
      const bodyArg = plan.args[plan.args.length - 1];
      expect(bodyArg).toContain(
        '🛩️ Flown by [AUTOPILOT](https://github.com/M-A-S-T-E-R-M-I-N-D/AUTOPILOT) v9.9.9,',
      );
    });
  });
});
