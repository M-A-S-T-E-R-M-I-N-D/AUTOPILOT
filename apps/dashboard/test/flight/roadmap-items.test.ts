// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  isRoadmapItem,
  fetchRoadmapItems,
  ROADMAP_LABEL,
  type RoadmapItem,
} from '../../src/flight/roadmap-items.js';
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
});
