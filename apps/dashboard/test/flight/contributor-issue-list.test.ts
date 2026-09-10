// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  planContributorIssueList,
  fetchContributorFacingIssues,
  createContributorIssueListPreviewApi,
  type ContributorFacingIssue,
} from '../../src/flight/contributor-issue-list.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

function issue(overrides: Partial<ContributorFacingIssue> = {}): ContributorFacingIssue {
  return {
    number: 1,
    title: 'Fix the thing',
    url: 'https://github.com/org/repo/issues/1',
    labels: [],
    assignees: [],
    ...overrides,
  };
}

describe('planContributorIssueList', () => {
  it('returns an empty list for no issues', () => {
    expect(planContributorIssueList([])).toEqual([]);
  });

  it('includes an unassigned good-first-issue-labeled issue', () => {
    const result = planContributorIssueList([issue({ number: 1, labels: ['good first issue'] })]);
    expect(result).toEqual([
      {
        number: 1,
        title: 'Fix the thing',
        url: 'https://github.com/org/repo/issues/1',
        tier: 'good first issue',
      },
    ]);
  });

  it('includes an unassigned help-wanted-labeled issue', () => {
    const result = planContributorIssueList([issue({ number: 2, labels: ['help wanted'] })]);
    expect(result).toEqual([
      {
        number: 2,
        title: 'Fix the thing',
        url: 'https://github.com/org/repo/issues/1',
        tier: 'help wanted',
      },
    ]);
  });

  it('excludes an issue carrying neither label', () => {
    const result = planContributorIssueList([issue({ labels: ['bug'] })]);
    expect(result).toEqual([]);
  });

  it('excludes an already-assigned issue even when labeled', () => {
    const result = planContributorIssueList([
      issue({ labels: ['good first issue'], assignees: ['octocat'] }),
    ]);
    expect(result).toEqual([]);
  });

  it('normalizes hyphenated and mixed-case label spellings', () => {
    const result = planContributorIssueList([issue({ labels: ['Good-First-Issue'] })]);
    expect(result).toHaveLength(1);
    expect(result[0]?.tier).toBe('good first issue');
  });

  it('treats an issue carrying both labels as good-first-issue tier', () => {
    const result = planContributorIssueList([
      issue({ labels: ['good first issue', 'help wanted'] }),
    ]);
    expect(result).toEqual([expect.objectContaining({ tier: 'good first issue' })]);
  });

  it('ranks good-first-issue entries before help-wanted entries', () => {
    const result = planContributorIssueList([
      issue({ number: 1, labels: ['help wanted'] }),
      issue({ number: 2, labels: ['good first issue'] }),
    ]);
    expect(result.map((e) => e.number)).toEqual([2, 1]);
  });

  it('breaks ties within the same tier by ascending issue number', () => {
    const result = planContributorIssueList([
      issue({ number: 9, labels: ['good first issue'] }),
      issue({ number: 3, labels: ['good first issue'] }),
    ]);
    expect(result.map((e) => e.number)).toEqual([3, 9]);
  });
});

describe('fetchContributorFacingIssues', () => {
  it('calls gh issue list with the expected argv', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchContributorFacingIssues(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--json',
      'number,title,url,labels,assignees',
    ]);
  });

  it('parses labels and assignees off gh issue list output', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'good first issue' }, { name: 'bug' }],
          assignees: [{ login: 'octocat' }],
        },
      ]),
    });

    const issues = await fetchContributorFacingIssues(exec);

    expect(issues).toEqual([
      {
        number: 1,
        title: 'Fix the thing',
        url: 'https://github.com/example/repo/issues/1',
        labels: ['good first issue', 'bug'],
        assignees: ['octocat'],
      },
    ]);
  });

  it('does not filter by label — every open issue is returned for the caller to classify', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Unlabeled',
          url: 'https://github.com/example/repo/issues/1',
          labels: [],
          assignees: [],
        },
      ]),
    });

    const issues = await fetchContributorFacingIssues(exec);

    expect(issues).toHaveLength(1);
  });

  it('drops entries missing a numeric number, string title, or string url', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Valid',
          url: 'https://github.com/example/repo/issues/1',
        },
        {
          number: 'not-a-number',
          title: 'Bad number',
          url: 'https://github.com/example/repo/issues/2',
        },
        { title: 'Missing number', url: 'x' },
        { number: 3, title: 'Missing url' },
      ]),
    });

    const issues = await fetchContributorFacingIssues(exec);

    expect(issues).toEqual([
      {
        number: 1,
        title: 'Valid',
        url: 'https://github.com/example/repo/issues/1',
        labels: [],
        assignees: [],
      },
    ]);
  });

  it('returns an empty list on a non-zero exit code', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await fetchContributorFacingIssues(exec)).toEqual([]);
  });

  it('returns an empty list on unparseable stdout', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    expect(await fetchContributorFacingIssues(exec)).toEqual([]);
  });

  it('returns an empty list when stdout is valid JSON but not an array', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{}' });

    expect(await fetchContributorFacingIssues(exec)).toEqual([]);
  });
});

describe('createContributorIssueListPreviewApi', () => {
  it('composes fetch + plan into the GET /api/contributor-issues preview read', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Fix the thing',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'good first issue' }],
          assignees: [],
        },
      ]),
    });

    const entries = await createContributorIssueListPreviewApi(exec)();

    expect(entries).toEqual([
      {
        number: 1,
        title: 'Fix the thing',
        url: 'https://github.com/example/repo/issues/1',
        tier: 'good first issue',
      },
    ]);
  });

  it('degrades to an empty list rather than rejecting when exec throws', async () => {
    const exec: CliExec = vi.fn().mockRejectedValue(new Error('gh unavailable'));

    await expect(createContributorIssueListPreviewApi(exec)()).resolves.toEqual([]);
  });
});
