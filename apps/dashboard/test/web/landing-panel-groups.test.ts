// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the LANDING commit-grouping math
 * (`web/landing-panel.ts`'s `landingCommitRuns`/`landingGroupHeadMeta`,
 * COCKPIT 2/6): folding runs of consecutive commits sharing the same BOARD
 * task-id or Conventional-Commits type into one collapsible group row —
 * RESEARCH-LIBRARY cost anatomy's "85 commits must read as a handful of
 * rows".
 */

import { describe, it, expect } from 'vitest';
import { landingCommitRuns, landingGroupHeadMeta } from '../../src/web/landing-panel.js';

describe('landingCommitRuns', () => {
  it('leaves a single commit ungrouped', () => {
    const rows = landingCommitRuns([{ subject: 'feat: add thing' }]);

    expect(rows).toEqual([{ isGroup: false, commit: { subject: 'feat: add thing' } }]);
  });

  it('folds 2+ consecutive commits sharing the same BOARD task-id into one group', () => {
    const commits = [
      { subject: 'feat: step one (BOARD web-abc123)' },
      { subject: 'fix: step two (BOARD web-abc123)' },
      { subject: 'feat: unrelated (BOARD web-xyz789)' },
    ];

    const rows = landingCommitRuns(commits);

    expect(rows).toEqual([
      { isGroup: true, kind: 'task', label: 'web-abc123', commits: commits.slice(0, 2) },
      { isGroup: false, commit: commits[2] },
    ]);
  });

  it('folds 2+ consecutive commits sharing the same Conventional-Commits type when no task-id is present', () => {
    const commits = [
      { subject: 'chore: bump a' },
      { subject: 'chore: bump b' },
      { subject: 'chore: bump c' },
      { subject: 'docs: update readme' },
    ];

    const rows = landingCommitRuns(commits);

    expect(rows).toEqual([
      { isGroup: true, kind: 'type', label: 'chore', commits: commits.slice(0, 3) },
      { isGroup: false, commit: commits[3] },
    ]);
  });

  it('prefers the task-id grouping over type when both are present, breaking the run on either changing', () => {
    const commits = [
      { subject: 'feat: a (BOARD web-abc123)' },
      { subject: 'feat: b (BOARD web-abc123)' },
      { subject: 'feat: c — no task id here' },
    ];

    const rows = landingCommitRuns(commits);

    expect(rows).toEqual([
      { isGroup: true, kind: 'task', label: 'web-abc123', commits: commits.slice(0, 2) },
      { isGroup: false, commit: commits[2] },
    ]);
  });

  it('does not group two non-conventional commits with no task-id, even if adjacent', () => {
    const commits = [{ subject: 'wip checkpoint one' }, { subject: 'wip checkpoint two' }];

    const rows = landingCommitRuns(commits);

    expect(rows).toEqual([
      { isGroup: false, commit: commits[0] },
      { isGroup: false, commit: commits[1] },
    ]);
  });

  it('returns an empty array for an empty commit list', () => {
    expect(landingCommitRuns([])).toEqual([]);
  });
});

describe('landingGroupHeadMeta', () => {
  it('pluralizes the commit count in the headline and toggle text', () => {
    const meta = landingGroupHeadMeta({
      kind: 'task',
      label: 'web-abc123',
      commits: [{ subject: 'a' }, { subject: 'b' }, { subject: 'c' }],
    });

    expect(meta.headline).toBe('web-abc123 — 3 commits');
    expect(meta.toggleClosedText).toBe('Show all (3)');
    expect(meta.toggleOpenText).toBe('Hide');
    expect(meta.ariaLabel).toBe('web-abc123 — 3 commits');
  });

  it("explains a task-id group's tip in terms of the shared board task (web-msm66jlc-gm4oom)", () => {
    const meta = landingGroupHeadMeta({
      kind: 'task',
      label: 'web-abc123',
      commits: [{ subject: 'a' }, { subject: 'b' }],
    });

    expect(meta.tip).toBe(
      '2 commits sharing the same board task, collapsed into one row — expand to see each individually',
    );
  });

  it("explains a type group's tip in terms of the shared commit type (web-msm66jlc-gm4oom)", () => {
    const meta = landingGroupHeadMeta({
      kind: 'type',
      label: 'chore',
      commits: [{ subject: 'a' }, { subject: 'b' }, { subject: 'c' }],
    });

    expect(meta.tip).toBe(
      '3 commits sharing the same commit type, collapsed into one row — expand to see each individually',
    );
  });
});
