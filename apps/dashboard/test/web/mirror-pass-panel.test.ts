// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  mirrorPassReconcileItems,
  mirrorPassLandingNoteItems,
  mirrorPassStaleClaimItems,
  mirrorPassDriftItems,
  mirrorPassItems,
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

describe('mirrorPassItems', () => {
  it('is empty when every preview is null (nothing loaded) or clean', () => {
    expect(
      mirrorPassItems({ reconcile: null, landingNote: null, drift: null, staleClaims: null }),
    ).toEqual([]);
  });

  it('composes every derivation in reconcile → landing-note → drift → stale-claim order', () => {
    const items = mirrorPassItems({
      reconcile: [{ finding: { issueNumber: 1, comment: 'reconcile note' } }],
      landingNote: [{ finding: { issueNumber: 2, comment: 'landing-note note' } }],
      drift: {
        versionDrift: { source: 'README.md', claimedVersion: '1', actualVersion: '2' },
        countsDrift: null,
        linkDrift: null,
      },
      staleClaims: [{ finding: { issueNumber: 3, comment: 'stale-claim note' } }],
    });
    expect(items.map((i) => i.text)).toEqual([
      '#1 — reconcile note',
      '#2 — landing-note note',
      'README.md claims v1, but the tree is actually at v2',
      '#3 — stale-claim note',
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
