// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import {
  fetchHelpWantedItems,
  isHelpWantedItem,
  HELP_WANTED_LABEL,
} from '../../src/flight/help-wanted-items.js';
import { fetchCollaborationSnapshot } from '../../src/flight/collaboration.js';
import { ROADMAP_LABEL } from '../../src/flight/roadmap-items.js';
import {
  fetchContributorFacingIssues,
  planContributorIssueList,
} from '../../src/flight/contributor-issue-list.js';
import { MAX_ISSUE_LIST } from '../../src/flight/issue-triage.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

// Epic 0019 additive-only law, the Collaboration panel's help-wanted group ×
// the Good-first list beside it. `help wanted` is GitHub's default label, not
// one the taxonomy seeder stamps, and many repos spell it `help-wanted`.
// isHelpWantedItem folds a hyphen to a space for exactly that reason, but the
// read asked gh for `--label "help wanted"` only. That flag runs a GitHub
// search, which matches a label name in any casing and never across a hyphen,
// so on such a repo gh returned nothing to fold and the group read empty,
// while the Good-first list, which lists every open issue, showed the same
// issues as help wanted.
describe('fetchHelpWantedItems × a hyphenated help-wanted label (regression, epic 0019 additive-only law)', () => {
  const raw = (number: number, labels: readonly string[], assignees: readonly string[] = []) => ({
    number,
    title: `Issue ${number}`,
    url: `https://github.com/example/repo/issues/${number}`,
    labels: labels.map((name) => ({ name })),
    assignees: assignees.map((login) => ({ login })),
  });
  type Row = ReturnType<typeof raw>;

  /** A gh that filters `--label` as GitHub search does: the label's name in
   *  any casing, nothing else folded. With no `--label` it lists every row. */
  const searchingGh = (rows: readonly Row[]) =>
    vi.fn<CliExec>(async (_cmd, args) => {
      const at = args.indexOf('--label');
      const wanted = at === -1 ? undefined : args[at + 1]?.toLowerCase();
      const hits =
        wanted === undefined
          ? rows
          : rows.filter((row) => row.labels.some((label) => label.name.toLowerCase() === wanted));
      return { code: 0, stdout: JSON.stringify(hits) };
    });
  const listed = async (rows: readonly Row[]) =>
    (await fetchHelpWantedItems(searchingGh(rows))).map((item) => item.number);

  const hyphenated = ['help-wanted', 'Help-Wanted', 'HELP-WANTED'];

  it.each(hyphenated)('lists an issue whose label reads "%s"', async (spelling) => {
    expect(isHelpWantedItem([spelling])).toBe(true);
    expect(await listed([raw(1, [spelling])])).toEqual([1]);
  });

  it.each(['help wanted', 'Help Wanted', 'HELP WANTED'])(
    'still lists an issue whose label reads "%s"',
    async (spelling) => {
      expect(await listed([raw(1, [spelling])])).toEqual([1]);
    },
  );

  it('agrees with the Good-first list on a repo that spells it with a hyphen', async () => {
    const rows = [raw(5, ['help-wanted']), raw(6, ['Help-Wanted', 'bug'])];

    const goodFirst = planContributorIssueList(
      await fetchContributorFacingIssues(searchingGh(rows)),
    );

    expect(goodFirst.map((entry) => [entry.number, entry.tier])).toEqual([
      [5, 'help wanted'],
      [6, 'help wanted'],
    ]);
    expect(await listed(rows)).toEqual([5, 6]);
  });

  it("keeps the seeded spelling's read first, as it ran before, then the hyphenated issues", async () => {
    const items = await fetchHelpWantedItems(
      searchingGh([
        raw(5, [HELP_WANTED_LABEL]),
        raw(3, ['help-wanted'], ['hubot']),
        raw(4, ['Help Wanted', 'bug']),
      ]),
    );

    expect(items.map((item) => [item.number, item.labels, item.assignees])).toEqual([
      [5, [HELP_WANTED_LABEL], []],
      [4, ['Help Wanted', 'bug'], []],
      [3, ['help-wanted'], ['hubot']],
    ]);
  });

  it('lists an issue carrying both spellings once', async () => {
    expect(await listed([raw(1, [HELP_WANTED_LABEL, 'help-wanted'], ['octocat'])])).toEqual([1]);
  });

  it('runs the same gh read as before, plus one for the hyphenated spelling', async () => {
    const exec = searchingGh([]);

    await fetchHelpWantedItems(exec);

    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      HELP_WANTED_LABEL,
      '--limit',
      String(MAX_ISSUE_LIST),
      '--json',
      'number,title,url,labels,assignees,comments',
    ]);
    expect(exec).toHaveBeenCalledWith('gh', [
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      'help-wanted',
      '--limit',
      String(MAX_ISSUE_LIST),
      '--json',
      'number,title,url,labels,assignees,comments',
    ]);
  });

  it("keeps the seeded spelling's issues when the hyphenated read fails", async () => {
    const exec = vi.fn<CliExec>(async (_cmd, args) =>
      args.includes('help-wanted')
        ? { code: 1, stdout: '' }
        : { code: 0, stdout: JSON.stringify([raw(2, [HELP_WANTED_LABEL])]) },
    );

    expect((await fetchHelpWantedItems(exec)).map((item) => item.number)).toEqual([2]);
  });

  it('lists the hyphenated issues when the seeded read fails', async () => {
    const exec = vi.fn<CliExec>(async (_cmd, args) =>
      args.includes('help-wanted')
        ? { code: 0, stdout: JSON.stringify([raw(8, ['help-wanted'])]) }
        : { code: 1, stdout: '' },
    );

    expect((await fetchHelpWantedItems(exec)).map((item) => item.number)).toEqual([8]);
  });

  it("still drops an unclaimed issue the maintainer marked, whatever the label's spelling", async () => {
    expect(
      await listed([
        raw(1, ['Help-Wanted', 'Declined']),
        raw(2, ['help-wanted', 'declined'], ['octocat']),
      ]),
    ).toEqual([2]);
  });

  it('still reads no other spelling as help wanted', async () => {
    const others = ['help_wanted', 'helpwanted', 'help wanted: docs', 'help--wanted', 'wanted'];
    for (const other of others) expect(isHelpWantedItem([other])).toBe(false);

    expect(await listed(others.map((other, index) => raw(index + 1, [other])))).toEqual([]);
  });

  it("shows the hyphenated issue in the Collaboration panel's help-wanted group", async () => {
    const snapshot = await fetchCollaborationSnapshot(
      searchingGh([raw(16, [ROADMAP_LABEL, 'help-wanted'], ['octocat'])]),
    );

    expect(snapshot.roadmap.map((item) => item.number)).toEqual([16]);
    expect(snapshot.helpWanted.map((item) => [item.number, item.assignees])).toEqual([
      [16, ['octocat']],
    ]);
  });
});
