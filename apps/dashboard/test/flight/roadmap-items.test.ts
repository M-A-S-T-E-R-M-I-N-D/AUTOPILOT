// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  isRoadmapItem,
  fetchRoadmapItems,
  ROADMAP_LABEL,
  type RoadmapItem,
} from '../../src/flight/roadmap-items.js';
import { HOLD_LABELS, MAX_ISSUE_LIST } from '../../src/flight/issue-triage.js';
import { DECLINED_LABEL, planClaimPoolIssue } from '../../src/flight/pool-client.js';
import { fetchHelpWantedItems, HELP_WANTED_LABEL } from '../../src/flight/help-wanted-items.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

describe('isRoadmapItem', () => {
  it('is true when labels carry the roadmap label', () => {
    expect(isRoadmapItem(['roadmap', 'bug'])).toBe(true);
  });

  it('is false when labels carry no roadmap label', () => {
    expect(isRoadmapItem(['duplicate', 'bug'])).toBe(false);
  });

  it('is false for an empty label list', () => {
    expect(isRoadmapItem([])).toBe(false);
  });

  it('matches the seeded spelling exactly — unlike the GitHub-default help wanted label, roadmap is ours', () => {
    expect(isRoadmapItem(['Roadmap', 'roadmap: v2', ' roadmap'])).toBe(false);
  });
});

describe('fetchRoadmapItems', () => {
  it('calls gh issue list with the expected argv', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchRoadmapItems(exec);

    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      ROADMAP_LABEL,
      '--limit',
      String(MAX_ISSUE_LIST),
      '--json',
      'number,title,url,labels,assignees',
    ]);
  });

  it('parses a roadmap issue into a RoadmapItem', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 16,
          title: 'Full dashboard i18n',
          url: 'https://github.com/example/repo/issues/16',
          labels: [{ name: 'roadmap' }, { name: 'i18n' }],
          assignees: [{ login: 'octocat' }],
        },
      ]),
    });

    const items = await fetchRoadmapItems(exec);

    expect(items).toEqual<RoadmapItem[]>([
      {
        number: 16,
        title: 'Full dashboard i18n',
        url: 'https://github.com/example/repo/issues/16',
        labels: ['roadmap', 'i18n'],
        assignees: ['octocat'],
      },
    ]);
  });

  it('drops issues that (unexpectedly) carry no roadmap label', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Not actually a roadmap item',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'bug' }],
        },
      ]),
    });

    expect(await fetchRoadmapItems(exec)).toEqual([]);
  });

  it('parses assignee logins, dropping malformed entries', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Roadmap item',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'roadmap' }],
          assignees: [{ login: 'octocat' }, { id: 3 }, 'nope'],
        },
      ]),
    });

    const items = await fetchRoadmapItems(exec);

    expect(items[0]?.assignees).toEqual(['octocat']);
  });

  it('drops entries missing a numeric number, string title, or string url', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          title: 'Valid',
          url: 'https://github.com/example/repo/issues/1',
          labels: [{ name: 'roadmap' }],
        },
        {
          number: 'not-a-number',
          title: 'Bad number',
          url: 'https://github.com/example/repo/issues/2',
          labels: [{ name: 'roadmap' }],
        },
        { title: 'Missing number', url: 'x', labels: [{ name: 'roadmap' }] },
        {
          number: 3,
          title: 'Missing url',
          labels: [{ name: 'roadmap' }],
        },
      ]),
    });

    const items = await fetchRoadmapItems(exec);

    expect(items).toEqual([
      {
        number: 1,
        title: 'Valid',
        url: 'https://github.com/example/repo/issues/1',
        labels: ['roadmap'],
        assignees: [],
      },
    ]);
  });

  it('returns an empty array on a non-zero exit', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 1, stdout: '' });

    expect(await fetchRoadmapItems(exec)).toEqual([]);
  });

  it('returns an empty array on unparseable stdout', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: 'not json' });

    expect(await fetchRoadmapItems(exec)).toEqual([]);
  });

  it('returns an empty array when stdout parses to a non-array', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: '{"not":"an array"}' });

    expect(await fetchRoadmapItems(exec)).toEqual([]);
  });

  it('skips null and non-object rows instead of throwing, keeping the valid neighbor', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        null,
        4,
        'row',
        {
          number: 16,
          title: 'Still listed',
          url: 'https://github.com/example/repo/issues/16',
          labels: [{ name: 'roadmap' }],
        },
      ]),
    });

    const items = await fetchRoadmapItems(exec);

    expect(items.map((item) => item.number)).toEqual([16]);
  });

  it('reads a non-array assignees field as unclaimed rather than dropping the issue', async () => {
    const exec: CliExec = vi.fn().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 17,
          title: 'Assignees as a string',
          url: 'https://github.com/example/repo/issues/17',
          labels: [{ name: 'roadmap' }],
          assignees: 'octocat',
        },
      ]),
    });

    expect(await fetchRoadmapItems(exec)).toEqual<RoadmapItem[]>([
      {
        number: 17,
        title: 'Assignees as a string',
        url: 'https://github.com/example/repo/issues/17',
        labels: ['roadmap'],
        assignees: [],
      },
    ]);
  });
});

// Epic 0019 additive-only law, the Collaboration panel's roadmap group × the
// maintainer's marks. The help-wanted group in the same panel already drops an
// unclaimed issue the maintainer declined or put on hold (help-wanted-items.ts,
// 986cf9ed), as do the pool claim and the Good-first list. This read only
// checked the `roadmap` label, so an issue carrying both labels and a mark
// left the help-wanted group yet still showed as "Unclaimed" under Roadmap.
describe("fetchRoadmapItems × the maintainer's declined and held issues (regression, epic 0019 additive-only law)", () => {
  const seeded = (name: string) =>
    HOUSE_TAXONOMY_LABELS.find((label) => label.name === name)?.name ?? '';
  const marks = [seeded('declined'), seeded('status: awaiting-human'), seeded('status: blocked')];
  const raw = (number: number, labels: readonly string[], assignees: readonly string[] = []) => ({
    number,
    title: `Issue ${number}`,
    url: `https://github.com/example/repo/issues/${number}`,
    labels: labels.map((name) => ({ name })),
    assignees: assignees.map((login) => ({ login })),
  });
  const execFor = (rows: readonly ReturnType<typeof raw>[]): CliExec =>
    vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify(rows) });
  const roadmap = async (rows: readonly ReturnType<typeof raw>[]) =>
    (await fetchRoadmapItems(execFor(rows))).map((item) => item.number);
  const helpWanted = async (rows: readonly ReturnType<typeof raw>[]) =>
    (await fetchHelpWantedItems(execFor(rows))).map((item) => item.number);

  it('reads the labels the pool claim skips on, as the seeder stamps them', () => {
    expect(seeded(ROADMAP_LABEL)).toBe(ROADMAP_LABEL);
    expect([DECLINED_LABEL, ...HOLD_LABELS]).toEqual(marks);
  });

  it.each(marks)(
    'agrees with the help-wanted group and the claim on an unclaimed issue marked "%s"',
    async (mark) => {
      const open = ['pool: ux', ROADMAP_LABEL, HELP_WANTED_LABEL];
      const marked = [...open, mark];
      const issue = (labels: readonly string[]) => ({
        number: 1,
        title: 'Issue 1',
        url: 'https://github.com/example/repo/issues/1',
        labels,
        assignees: [],
      });

      expect(planClaimPoolIssue(issue(open), 'octocat').decision).toBe('claim');
      expect(await helpWanted([raw(1, open)])).toEqual([1]);
      expect(await roadmap([raw(1, open)])).toEqual([1]);

      expect(planClaimPoolIssue(issue(marked), 'octocat').decision).toBe('skip');
      expect(await helpWanted([raw(1, marked)])).toEqual([]);
      expect(await roadmap([raw(1, marked)])).toEqual([]);
    },
  );

  it('matches a mark in any casing, as the help-wanted group does', async () => {
    const rows = [raw(1, [ROADMAP_LABEL, HELP_WANTED_LABEL, 'Status: Blocked'])];

    expect(await helpWanted(rows)).toEqual([]);
    expect(await roadmap(rows)).toEqual([]);
  });

  it('keeps a marked issue someone already holds, so "Claimed by" and My claims still show it', async () => {
    expect(await roadmap([raw(7, [ROADMAP_LABEL, DECLINED_LABEL], ['octocat'])])).toEqual([7]);
  });

  it('drops only the unclaimed marked issue and keeps the rest in gh order', async () => {
    const rows = [
      raw(4, [ROADMAP_LABEL]),
      raw(2, [ROADMAP_LABEL, 'status: awaiting-human']),
      raw(3, [ROADMAP_LABEL], ['hubot']),
    ];

    expect(await roadmap(rows)).toEqual([4, 3]);
  });
});
