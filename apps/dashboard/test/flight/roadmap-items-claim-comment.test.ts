// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { fetchRoadmapItems, ROADMAP_LABEL } from '../../src/flight/roadmap-items.js';
import { fetchCollaborationSnapshot } from '../../src/flight/collaboration.js';
import {
  DECLINED_LABEL,
  fetchPoolIssues,
  planClaimPoolIssue,
  planClaimPoolIssueCommands,
  type PoolIssue,
} from '../../src/flight/pool-client.js';
import {
  collaborationClaimStateLabel,
  isMyCollaborationClaim,
} from '../../src/web/collaboration-panel.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

// Epic 0019 additive-only law, the Collaboration panel's roadmap group × the
// claims ledger. The pool client posts a claim as a comment and then assigns
// the claimant; for an outside contributor without triage rights the assign
// fails and only the comment lands (claim-ledger.ts, #27). The pool reads
// that comment as a claim and warns the next claimant, and so do the
// Good-first list (7e82791a), the routing console (7f3aedc3) and the
// help-wanted group beside this one (06c5f4ed). The roadmap read asked gh for
// assignees only, so the panel showed a pooled roadmap issue as "Unclaimed",
// and the claimant's own My claims filter never found it.
describe('roadmap group × a claim held only by its comment (regression, epic 0019 additive-only law)', () => {
  const NOW = Date.parse('2026-10-04T12:00:00Z');
  const CLAIMANT = 'gabibi555';
  const LABELS = ['pool: ux', ROADMAP_LABEL];

  interface Said {
    readonly login: string;
    readonly at: string;
    readonly body: string;
  }
  const row = (
    number: number,
    said: readonly Said[] = [],
    assignees: readonly string[] = [],
    labels: readonly string[] = LABELS,
  ) => ({
    number,
    title: `issue ${number}`,
    body: '',
    url: `https://github.com/o/r/issues/${number}`,
    labels: labels.map((name) => ({ name })),
    assignees: assignees.map((login) => ({ login })),
    comments: said.map(({ login, at, body }) => ({ author: { login }, createdAt: at, body })),
  });
  type Row = ReturnType<typeof row>;

  /** A gh that answers `gh issue list` with only the fields `--json` asked
   *  for, as gh does. `--label` is not filtered: every row carries the label. */
  const projectingGh = (rows: readonly Row[]) =>
    vi.fn<CliExec>(async (_cmd, args) => {
      const fields = (args[args.indexOf('--json') + 1] ?? '').split(',');
      const projected = rows.map((r) =>
        Object.fromEntries(Object.entries(r).filter(([key]) => fields.includes(key))),
      );
      return { code: 0, stdout: JSON.stringify(projected) };
    });

  /** The claim comment the pool client posts for CLAIMANT, from its own plan. */
  const claimComment = (number: number): string => {
    const free: PoolIssue = {
      number,
      title: `issue ${number}`,
      url: `https://github.com/o/r/issues/${number}`,
      labels: LABELS,
      assignees: [],
    };
    const decision = planClaimPoolIssue(free, CLAIMANT, NOW);
    const comment = planClaimPoolIssueCommands(free, CLAIMANT, decision).find(
      (command) => command.args[1] === 'comment',
    );
    return comment?.args[comment.args.indexOf('--body') + 1] ?? '';
  };
  const claimSaid = (number: number): Said => ({
    login: CLAIMANT,
    at: '2026-10-03T09:00:00Z',
    body: claimComment(number),
  });

  it('reads the comment-only claim the pool warns about', async () => {
    const rows = [row(5, [claimSaid(5)])];

    const [pooled] = await fetchPoolIssues(projectingGh(rows));
    expect(pooled && planClaimPoolIssue(pooled, 'octocat', NOW).decision).toBe('contest');

    const [item] = await fetchRoadmapItems(projectingGh(rows));
    expect(item?.assignees).toEqual([]);
    expect(item?.claimedByComment).toEqual([CLAIMANT]);
  });

  it('shows the issue as claimed by its claimant, and in their My claims', async () => {
    const snapshot = await fetchCollaborationSnapshot(projectingGh([row(5, [claimSaid(5)])]));
    const [entry] = snapshot.roadmap;

    expect(entry && collaborationClaimStateLabel(entry)).toBe('Claimed by @gabibi555');
    expect(entry && isMyCollaborationClaim(entry, CLAIMANT)).toBe(true);
    expect(entry && isMyCollaborationClaim(entry, 'octocat')).toBe(false);
  });

  it('reads the issue as unclaimed again once its claimant hands it back', async () => {
    const handBack: Said = { login: CLAIMANT, at: '2026-10-03T10:00:00Z', body: '/unclaim' };
    const [item] = await fetchRoadmapItems(projectingGh([row(5, [claimSaid(5), handBack])]));

    expect(item).not.toHaveProperty('claimedByComment');
    expect(item && collaborationClaimStateLabel(item)).toBe('Unclaimed');
  });

  it('keeps an issue whose comments carry no claim unclaimed, shaped as before', async () => {
    const asked: Said = {
      login: 'octocat',
      at: '2026-10-03T09:00:00Z',
      body: 'Is anyone on this?',
    };
    const items = await fetchRoadmapItems(projectingGh([row(3, [asked])]));

    expect(items).toEqual([
      {
        number: 3,
        title: 'issue 3',
        url: 'https://github.com/o/r/issues/3',
        labels: LABELS,
        assignees: [],
      },
    ]);
  });

  it('leaves an assigned claimant to the assignee list alone, as before', async () => {
    const items = await fetchRoadmapItems(projectingGh([row(5, [claimSaid(5)], [CLAIMANT])]));

    expect(items).toEqual([
      {
        number: 5,
        title: 'issue 5',
        url: 'https://github.com/o/r/issues/5',
        labels: LABELS,
        assignees: [CLAIMANT],
      },
    ]);
    expect(items[0] && collaborationClaimStateLabel(items[0])).toBe('Claimed by @gabibi555');
  });

  it('still shows every assignee next to a comment-only claimant', async () => {
    const [item] = await fetchRoadmapItems(projectingGh([row(5, [claimSaid(5)], ['hubot'])]));

    expect(item?.assignees).toEqual(['hubot']);
    expect(item?.claimedByComment).toEqual([CLAIMANT]);
    expect(item && collaborationClaimStateLabel(item)).toBe('Claimed by @hubot, @gabibi555');
  });

  it('keeps a marked issue its comment-only claimant holds, as it keeps an assigned one', async () => {
    const marked = [...LABELS, DECLINED_LABEL];
    const listed = async (rows: readonly Row[]) =>
      (await fetchRoadmapItems(projectingGh(rows))).map((item) => item.number);

    expect(await listed([row(7, [], [], marked)])).toEqual([]);
    expect(await listed([row(7, [], [CLAIMANT], marked)])).toEqual([7]);
    expect(await listed([row(7, [claimSaid(7)], [], marked)])).toEqual([7]);
  });

  it('asks gh for the comments the pool reads', async () => {
    const exec = projectingGh([]);

    await fetchRoadmapItems(exec);

    expect(exec).toHaveBeenCalledTimes(1);
    const args = exec.mock.calls[0]?.[1] ?? [];
    expect(args[args.indexOf('--json') + 1]).toBe('number,title,url,labels,assignees,comments');
  });
});
