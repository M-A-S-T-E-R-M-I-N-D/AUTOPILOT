// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { fetchRoadmapItems, isRoadmapItem, ROADMAP_LABEL } from '../../src/flight/roadmap-items.js';
import { fetchCollaborationSnapshot } from '../../src/flight/collaboration.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

// Epic 0019 additive-only law, the Collaboration panel's roadmap group × the
// taxonomy seeder. `gh issue list --label roadmap` runs a GitHub search, which
// matches a label name in any casing, and `gh label create --force` keeps an
// existing label's casing (it sends no new name). So on a repo whose label
// reads `Roadmap`, gh returns the roadmap issues labeled `Roadmap`, and the
// read must not drop them by spelling. The help-wanted group beside it already
// reads its label in any casing (help-wanted-items.ts).
describe('fetchRoadmapItems × a roadmap label in any casing (regression, epic 0019 additive-only law)', () => {
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

  const spellings = ['Roadmap', 'ROADMAP', ' roadmap ', 'RoadMap'];

  it('reads the label the seeder stamps', () => {
    expect(HOUSE_TAXONOMY_LABELS.map((label) => label.name)).toContain(ROADMAP_LABEL);
    expect(isRoadmapItem([ROADMAP_LABEL])).toBe(true);
  });

  it.each(spellings)('keeps an issue whose roadmap label reads "%s"', async (spelling) => {
    expect(isRoadmapItem([spelling])).toBe(true);
    expect(await roadmap([raw(1, [spelling], ['octocat'])])).toEqual([1]);
  });

  it('keeps the issue as gh spelled its labels and keeps gh order', async () => {
    const items = await fetchRoadmapItems(
      execFor([
        raw(4, ['Roadmap', 'bug']),
        raw(2, [ROADMAP_LABEL]),
        raw(3, ['ROADMAP'], ['hubot']),
      ]),
    );

    expect(items.map((item) => [item.number, item.labels, item.assignees])).toEqual([
      [4, ['Roadmap', 'bug'], []],
      [2, [ROADMAP_LABEL], []],
      [3, ['ROADMAP'], ['hubot']],
    ]);
  });

  it('still drops an issue that carries no roadmap label', async () => {
    for (const other of ['roadmap: v2', 'roadmaps', 'road map', 'not roadmap', 'bug']) {
      expect(isRoadmapItem([other])).toBe(false);
    }
    expect(await roadmap([raw(1, ['roadmap: v2', 'bug']), raw(2, [])])).toEqual([]);
  });

  it("still drops an unclaimed issue the maintainer marked, whatever the roadmap label's casing", async () => {
    expect(
      await roadmap([
        raw(1, ['Roadmap', 'Declined']),
        raw(2, ['Roadmap', 'declined'], ['octocat']),
      ]),
    ).toEqual([2]);
  });

  it('runs the same gh read, with the seeded spelling', async () => {
    const exec = vi.fn<CliExec>().mockResolvedValue({ code: 0, stdout: '[]' });

    await fetchRoadmapItems(exec);

    const args = exec.mock.calls[0]?.[1] ?? [];
    expect(args[args.indexOf('--label') + 1]).toBe(ROADMAP_LABEL);
  });

  it("shows the issue in the Collaboration panel's roadmap group beside its help-wanted claim", async () => {
    const both = raw(16, ['Roadmap', 'Help Wanted'], ['octocat']);
    const exec: CliExec = vi.fn().mockResolvedValue({ code: 0, stdout: JSON.stringify([both]) });

    const snapshot = await fetchCollaborationSnapshot(exec);

    expect(snapshot.roadmap.map((item) => [item.number, item.assignees])).toEqual([
      [16, ['octocat']],
    ]);
    expect(snapshot.helpWanted.map((item) => [item.number, item.assignees])).toEqual([
      [16, ['octocat']],
    ]);
  });
});
