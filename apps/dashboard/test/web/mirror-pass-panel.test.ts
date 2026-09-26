// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  mirrorPassReconcileItems,
  mirrorPassLandingNoteItems,
  mirrorPassStaleClaimItems,
  mirrorPassDriftItems,
  mirrorPassPriorityFollowItems,
  mirrorPassItems,
  mirrorPassCanExecute,
  mirrorPassExecuteResultMessage,
  mirrorPassCanExecuteDrift,
  mirrorPassDriftExecuteResultMessage,
  mirrorPassCanExecuteLandingNote,
  mirrorPassCanExecuteStaleClaim,
  mirrorPassCanExecutePriorityFollow,
} from '../../src/web/mirror-pass-panel.js';

describe('mirrorPassReconcileItems / mirrorPassLandingNoteItems / mirrorPassStaleClaimItems', () => {
  it('drops plans with no finding — already in sync', () => {
    expect(mirrorPassReconcileItems([{ finding: null }])).toEqual([]);
  });

  it('renders an actionable finding as "#<n> — <comment>"', () => {
    const items = mirrorPassReconcileItems([
      { finding: { issueNumber: 42, comment: 'Landed in abc123 — closing.' } },
    ]);
    expect(items).toEqual([{ text: '#42 — Landed in abc123 — closing.' }]);
  });

  it('mirrorPassLandingNoteItems and mirrorPassStaleClaimItems share the same rendering', () => {
    const plans = [
      { finding: { issueNumber: 7, comment: 'Unassigning @rel — quiet for 20 days.' } },
    ];
    expect(mirrorPassLandingNoteItems(plans)).toEqual([
      { text: '#7 — Unassigning @rel — quiet for 20 days.' },
    ]);
    expect(mirrorPassStaleClaimItems(plans)).toEqual([
      { text: '#7 — Unassigning @rel — quiet for 20 days.' },
    ]);
  });
});

describe('mirrorPassDriftItems', () => {
  it('returns nothing for a null preview (unavailable) or an all-clean one', () => {
    expect(mirrorPassDriftItems(null)).toEqual([]);
    expect(
      mirrorPassDriftItems({ versionDrift: null, countsDrift: null, linkDrift: null }),
    ).toEqual([]);
  });

  it('formats a version-drift finding', () => {
    const items = mirrorPassDriftItems({
      versionDrift: { source: 'README.md', claimedVersion: '0.30.0', actualVersion: '0.32.0' },
      countsDrift: null,
      linkDrift: null,
    });
    expect(items).toEqual([
      { text: 'README.md claims v0.30.0, but the tree is actually at v0.32.0' },
    ]);
  });

  it('formats a counts-drift finding', () => {
    const items = mirrorPassDriftItems({
      versionDrift: null,
      countsDrift: { source: 'docs/THIRD-PARTY-LICENSES.md', claimedCount: 10, actualCount: 12 },
      linkDrift: null,
    });
    expect(items).toEqual([
      {
        text: 'docs/THIRD-PARTY-LICENSES.md claims 10 third-party packages, but the tree has 12',
      },
    ]);
  });

  it('formats a broken-link finding, joining every dead path', () => {
    const items = mirrorPassDriftItems({
      versionDrift: null,
      countsDrift: null,
      linkDrift: { source: 'README.md', brokenLinks: ['docs/GONE.md', 'docs/OTHER.md'] },
    });
    expect(items).toEqual([
      {
        text: 'README.md links to 2 path(s) that no longer resolve: docs/GONE.md, docs/OTHER.md',
      },
    ]);
  });

  it('composes all three drift findings when every check fires at once', () => {
    const items = mirrorPassDriftItems({
      versionDrift: { source: 'README.md', claimedVersion: '0.30.0', actualVersion: '0.32.0' },
      countsDrift: { source: 'README.md', claimedCount: 10, actualCount: 12 },
      linkDrift: { source: 'README.md', brokenLinks: ['docs/GONE.md'] },
    });
    expect(items).toHaveLength(3);
  });
});

describe('mirrorPassPriorityFollowItems', () => {
  it('drops plans with no finding — already pinned to that band', () => {
    expect(mirrorPassPriorityFollowItems([{ finding: null }])).toEqual([]);
  });

  it('renders an actionable finding as "#<n> — <taskId> will be pinned to follow \\"<label>\\""', () => {
    const items = mirrorPassPriorityFollowItems([
      { finding: { taskId: 'github-42', issueNumber: 42, label: 'priority: high' } },
    ]);
    expect(items).toEqual([{ text: '#42 — github-42 will be pinned to follow "priority: high"' }]);
  });
});

describe('mirrorPassItems', () => {
  it('is empty when every preview is null (nothing loaded) or clean', () => {
    expect(
      mirrorPassItems({
        reconcile: null,
        landingNote: null,
        drift: null,
        staleClaims: null,
        priorityFollow: null,
      }),
    ).toEqual([]);
  });

  it('composes every derivation in reconcile → landing-note → drift → stale-claim → priority-follow order', () => {
    const items = mirrorPassItems({
      reconcile: [{ finding: { issueNumber: 1, comment: 'reconcile note' } }],
      landingNote: [{ finding: { issueNumber: 2, comment: 'landing-note note' } }],
      drift: {
        versionDrift: { source: 'README.md', claimedVersion: '1', actualVersion: '2' },
        countsDrift: null,
        linkDrift: null,
      },
      staleClaims: [{ finding: { issueNumber: 3, comment: 'stale-claim note' } }],
      priorityFollow: [
        { finding: { taskId: 'github-4', issueNumber: 4, label: 'priority: critical' } },
      ],
    });
    expect(items.map((i) => i.text)).toEqual([
      '#1 — reconcile note',
      '#2 — landing-note note',
      'README.md claims v1, but the tree is actually at v2',
      '#3 — stale-claim note',
      '#4 — github-4 will be pinned to follow "priority: critical"',
    ]);
  });

  it('a preview missing from the response (undefined key) behaves the same as null', () => {
    const items = mirrorPassItems({
      reconcile: [{ finding: { issueNumber: 1, comment: 'x' } }],
      landingNote: null,
      drift: null,
      staleClaims: null,
    });
    expect(items).toEqual([{ text: '#1 — x' }]);
  });
});

describe('mirrorPassCanExecute', () => {
  const oneFinding = [{ finding: { issueNumber: 1, comment: 'x' } }];

  it('hides the execute button for a confirmed non-maintainer, even with a real finding', () => {
    expect(mirrorPassCanExecute({ role: 'user' }, oneFinding)).toBe(false);
  });

  it('shows the execute button for a confirmed maintainer with a real finding', () => {
    expect(mirrorPassCanExecute({ role: 'maintainer' }, oneFinding)).toBe(true);
  });

  it('shows the execute button when identity is unresolved — not a known guest', () => {
    expect(mirrorPassCanExecute(undefined, oneFinding)).toBe(true);
    expect(mirrorPassCanExecute(null, oneFinding)).toBe(true);
  });

  it('hides the execute button when there is nothing to execute, even for the maintainer', () => {
    expect(mirrorPassCanExecute({ role: 'maintainer' }, [])).toBe(false);
    expect(mirrorPassCanExecute({ role: 'maintainer' }, null)).toBe(false);
    expect(mirrorPassCanExecute({ role: 'maintainer' }, [{ finding: null }])).toBe(false);
  });
});

describe('mirrorPassExecuteResultMessage', () => {
  it('reports a generic failure for a non-200 response', () => {
    expect(mirrorPassExecuteResultMessage(500, { outcomes: [] })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Mirror pass failed to run.',
    });
    expect(mirrorPassExecuteResultMessage(200, null)).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Mirror pass failed to run.',
    });
  });

  it('reports the guest skip reason', () => {
    expect(mirrorPassExecuteResultMessage(200, { skippedReason: 'guest' })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: "Not run — you are not this repo's maintainer.",
    });
  });

  it('reports the identity-unresolved skip reason', () => {
    expect(mirrorPassExecuteResultMessage(200, { skippedReason: 'identity-unresolved' })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Not run — could not resolve your GitHub identity.',
    });
  });

  it('reports the repo-mismatch skip reason, never as already in sync', () => {
    expect(mirrorPassExecuteResultMessage(200, { skippedReason: 'repo-mismatch' })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: "Not run — this project's origin is not the GitHub repo gh is acting on.",
    });
  });

  it('reports a clean run with real outcomes as ok', () => {
    expect(mirrorPassExecuteResultMessage(200, { outcomes: [{}, {}] })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-ok',
      text: 'Applied 2 finding(s).',
    });
  });

  it('reports a clean run with zero outcomes as ok but empty', () => {
    expect(mirrorPassExecuteResultMessage(200, { outcomes: [] })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-ok',
      text: 'Nothing to apply — already in sync.',
    });
  });
});

describe('mirrorPassCanExecuteDrift', () => {
  const oneDrift = {
    versionDrift: { source: 'README.md', claimedVersion: '1', actualVersion: '2' },
    countsDrift: null,
    linkDrift: null,
  };

  it('hides the drift-fix button for a confirmed non-maintainer, even with a real finding', () => {
    expect(mirrorPassCanExecuteDrift({ role: 'user' }, oneDrift)).toBe(false);
  });

  it('shows the drift-fix button for a confirmed maintainer with a real finding', () => {
    expect(mirrorPassCanExecuteDrift({ role: 'maintainer' }, oneDrift)).toBe(true);
  });

  it('shows the drift-fix button when identity is unresolved — not a known guest', () => {
    expect(mirrorPassCanExecuteDrift(undefined, oneDrift)).toBe(true);
    expect(mirrorPassCanExecuteDrift(null, oneDrift)).toBe(true);
  });

  it('hides the drift-fix button when there is nothing to fix, even for the maintainer', () => {
    expect(mirrorPassCanExecuteDrift({ role: 'maintainer' }, null)).toBe(false);
    expect(
      mirrorPassCanExecuteDrift(
        { role: 'maintainer' },
        { versionDrift: null, countsDrift: null, linkDrift: null },
      ),
    ).toBe(false);
  });
});

describe('mirrorPassCanExecuteLandingNote', () => {
  const oneLandingNote = [{ finding: { issueNumber: 7, comment: 'x' } }];

  it('hides the landing-note button for a confirmed non-maintainer, even with a real finding', () => {
    expect(mirrorPassCanExecuteLandingNote({ role: 'user' }, oneLandingNote)).toBe(false);
  });

  it('shows the landing-note button for a confirmed maintainer with a real finding', () => {
    expect(mirrorPassCanExecuteLandingNote({ role: 'maintainer' }, oneLandingNote)).toBe(true);
  });

  it('shows the landing-note button when identity is unresolved — not a known guest', () => {
    expect(mirrorPassCanExecuteLandingNote(undefined, oneLandingNote)).toBe(true);
    expect(mirrorPassCanExecuteLandingNote(null, oneLandingNote)).toBe(true);
  });

  it('hides the landing-note button when there is nothing to note, even for the maintainer', () => {
    expect(mirrorPassCanExecuteLandingNote({ role: 'maintainer' }, [])).toBe(false);
    expect(mirrorPassCanExecuteLandingNote({ role: 'maintainer' }, null)).toBe(false);
    expect(mirrorPassCanExecuteLandingNote({ role: 'maintainer' }, [{ finding: null }])).toBe(
      false,
    );
  });
});

describe('mirrorPassCanExecuteStaleClaim', () => {
  const oneStaleClaim = [{ finding: { issueNumber: 7, comment: 'x' } }];

  it('hides the stale-claim button for a confirmed non-maintainer, even with a real finding', () => {
    expect(mirrorPassCanExecuteStaleClaim({ role: 'user' }, oneStaleClaim)).toBe(false);
  });

  it('shows the stale-claim button for a confirmed maintainer with a real finding', () => {
    expect(mirrorPassCanExecuteStaleClaim({ role: 'maintainer' }, oneStaleClaim)).toBe(true);
  });

  it('shows the stale-claim button when identity is unresolved — not a known guest', () => {
    expect(mirrorPassCanExecuteStaleClaim(undefined, oneStaleClaim)).toBe(true);
    expect(mirrorPassCanExecuteStaleClaim(null, oneStaleClaim)).toBe(true);
  });

  it('hides the stale-claim button when there is nothing to free, even for the maintainer', () => {
    expect(mirrorPassCanExecuteStaleClaim({ role: 'maintainer' }, [])).toBe(false);
    expect(mirrorPassCanExecuteStaleClaim({ role: 'maintainer' }, null)).toBe(false);
    expect(mirrorPassCanExecuteStaleClaim({ role: 'maintainer' }, [{ finding: null }])).toBe(false);
  });
});

describe('mirrorPassCanExecutePriorityFollow', () => {
  const onePriorityFollow = [
    { finding: { taskId: 'github-7', issueNumber: 7, label: 'priority: high' } },
  ];

  it('hides the priority-follow button for a confirmed non-maintainer, even with a real finding', () => {
    expect(mirrorPassCanExecutePriorityFollow({ role: 'user' }, onePriorityFollow)).toBe(false);
  });

  it('shows the priority-follow button for a confirmed maintainer with a real finding', () => {
    expect(mirrorPassCanExecutePriorityFollow({ role: 'maintainer' }, onePriorityFollow)).toBe(
      true,
    );
  });

  it('shows the priority-follow button when identity is unresolved — not a known guest', () => {
    expect(mirrorPassCanExecutePriorityFollow(undefined, onePriorityFollow)).toBe(true);
    expect(mirrorPassCanExecutePriorityFollow(null, onePriorityFollow)).toBe(true);
  });

  it('hides the priority-follow button when there is nothing to follow, even for the maintainer', () => {
    expect(mirrorPassCanExecutePriorityFollow({ role: 'maintainer' }, [])).toBe(false);
    expect(mirrorPassCanExecutePriorityFollow({ role: 'maintainer' }, null)).toBe(false);
    expect(mirrorPassCanExecutePriorityFollow({ role: 'maintainer' }, [{ finding: null }])).toBe(
      false,
    );
  });
});

describe('mirrorPassDriftExecuteResultMessage', () => {
  it('reports a generic failure for a non-200 response', () => {
    expect(mirrorPassDriftExecuteResultMessage(500, { outcomes: [] })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Mirror pass drift fix failed to run.',
    });
    expect(mirrorPassDriftExecuteResultMessage(200, null)).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Mirror pass drift fix failed to run.',
    });
  });

  it('reports the guest skip reason', () => {
    expect(mirrorPassDriftExecuteResultMessage(200, { skippedReason: 'guest' })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: "Not run — you are not this repo's maintainer.",
    });
  });

  it('reports the identity-unresolved skip reason', () => {
    expect(
      mirrorPassDriftExecuteResultMessage(200, { skippedReason: 'identity-unresolved' }),
    ).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: 'Not run — could not resolve your GitHub identity.',
    });
  });

  it('reports the repo-mismatch skip reason, never as nothing to file', () => {
    expect(mirrorPassDriftExecuteResultMessage(200, { skippedReason: 'repo-mismatch' })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-fail',
      text: "Not run — this project's origin is not the GitHub repo gh is acting on.",
    });
  });

  it('reports a clean run with real outcomes as ok', () => {
    expect(mirrorPassDriftExecuteResultMessage(200, { outcomes: [{}, {}] })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-ok',
      text: 'Filed 2 issue(s).',
    });
  });

  it('reports a clean run with zero outcomes and zero duplicates as ok but empty', () => {
    expect(mirrorPassDriftExecuteResultMessage(200, { outcomes: [], duplicates: [] })).toEqual({
      className: 'mirror-pass-result mirror-pass-result-ok',
      text: 'Nothing to file — already in sync.',
    });
  });

  it('reports zero outcomes with real duplicates as ok — real drift, but already tracked', () => {
    expect(
      mirrorPassDriftExecuteResultMessage(200, { outcomes: [], duplicates: ['Title A'] }),
    ).toEqual({
      className: 'mirror-pass-result mirror-pass-result-ok',
      text: 'Nothing new to file — 1 already tracked as duplicate(s).',
    });
  });

  it('reports filed outcomes alongside skipped duplicates', () => {
    expect(
      mirrorPassDriftExecuteResultMessage(200, { outcomes: [{}], duplicates: ['Title A'] }),
    ).toEqual({
      className: 'mirror-pass-result mirror-pass-result-ok',
      text: 'Filed 1 issue(s). (1 duplicate(s) skipped)',
    });
  });
});
