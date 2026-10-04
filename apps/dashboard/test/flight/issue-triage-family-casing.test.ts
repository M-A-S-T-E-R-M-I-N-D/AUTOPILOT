// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the KEEPER triage
// flow × a maintainer's `area:`/`priority:` label in another casing. Triage
// keeps a single family label a person set (handSetFamilyLabel) and clears a
// contradicting sibling in the same edit (supersededFamilyLabels). Both read
// the family by exact spelling. GitHub keeps one label per name in any casing,
// and the seeder's `gh label create --force` keeps an existing label's
// casing, so a repo's label may read `Area: Community`. That label was not
// seen as hand-set, so the classifier's guess was added beside it, and it was
// not seen as a sibling either, so it was never removed: the issue wore two
// areas, the #21/#27/#28 contradiction. The mirror pass already reads
// `Priority: High` as the maintainer's band (1ada0dad).

import { describe, it, expect } from 'vitest';
import {
  handSetFamilyLabel,
  planIssueTriage,
  planIssueTriageCommands,
  supersededFamilyLabels,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';

const NOW = Date.parse('2026-10-04T12:00:00Z');

// Issue #5's shape: the body's "static-site gate" scores the classifier's
// `area: flight-engine`, and no priority keyword leaves it at `medium`.
const sample = (labels: readonly string[]): IncomingIssue => ({
  number: 5,
  title: 'Add the planned static-site sample (samples/static-site)',
  body:
    '### Problem / motivation\n\nsamples/README lists it as planned, blocked on the ' +
    'static-site gate.\n\n### Proposed solution\n\nAdd the sample.\n',
  labels: ['enhancement', ...labels],
});

const editArgs = (issue: IncomingIssue): readonly string[] => {
  const decision = planIssueTriage(issue, [], [], undefined, NOW);
  return planIssueTriageCommands(issue, decision).find((c) => c.args[1] === 'edit')?.args ?? [];
};

const removed = (args: readonly string[]): readonly string[] =>
  args.flatMap((arg, i) => (arg === '--remove-label' ? [args[i + 1] ?? ''] : []));

const variants = [
  ['Area: Community', 'Priority: High'],
  ['AREA: COMMUNITY', 'PRIORITY: HIGH'],
  ['Area: community', 'Priority: high'],
] as const;

describe("triage × the maintainer's area and priority labels in any casing (regression, epic 0019 additive-only law)", () => {
  it('reads variants of the labels the seeder stamps, not the labels themselves', () => {
    const seeded = HOUSE_TAXONOMY_LABELS.map((label) => label.name);
    expect(seeded).toEqual(expect.arrayContaining(['area: community', 'priority: high']));
    for (const pair of variants) for (const label of pair) expect(seeded).not.toContain(label);
  });

  it('still classifies the sample when nobody labeled it, so the hand-set test means something', () => {
    expect(planIssueTriage(sample([]), [], [], undefined, NOW)).toMatchObject({
      decision: 'accept',
      area: 'area: flight-engine',
      priority: 'priority: medium',
    });
  });

  it.each(variants)('keeps "%s" and "%s" a person set, not the guesses', (area, priority) => {
    expect(planIssueTriage(sample([area, priority]), [], [], undefined, NOW)).toMatchObject({
      decision: 'accept',
      area: 'area: community',
      priority: 'priority: high',
    });
  });

  it.each(variants)('adds no second area or priority beside "%s" and "%s"', (area, priority) => {
    const args = editArgs(sample([area, priority]));
    expect(args).not.toContain('area: flight-engine');
    expect(args).not.toContain('priority: medium');
    expect(args).not.toContain('--remove-label');
  });

  it('clears re-cased contradicting siblings as the issue carries them', () => {
    const args = editArgs(sample(['Area: Community', 'AREA: DASHBOARD']));
    expect(args).toContain('area: flight-engine');
    expect(removed(args)).toEqual(['Area: Community', 'AREA: DASHBOARD']);
  });

  it('never removes a re-cased label the same edit adds back', () => {
    const args = editArgs(sample(['AREA: FLIGHT-ENGINE', 'Area: Community']));
    expect(args).toContain('area: flight-engine');
    expect(removed(args)).toEqual(['Area: Community']);
  });
});

describe('supersededFamilyLabels in any casing', () => {
  it('names a re-cased sibling the classification replaces, spelled as carried', () => {
    expect(
      supersededFamilyLabels(
        ['Priority: High', 'Area: I18n', 'Epic'],
        ['area: i18n', 'priority: medium'],
      ),
    ).toEqual(['Priority: High']);
  });

  it('keeps a re-cased label that is the chosen one', () => {
    expect(
      supersededFamilyLabels(['Priority: High', 'AREA: I18N'], ['area: i18n', 'priority: high']),
    ).toEqual([]);
  });

  it('still leaves a re-cased pool marker and unrelated labels alone', () => {
    expect(
      supersededFamilyLabels(
        ['Pool: Accessibility', 'Help Wanted', 'Epic'],
        ['area: i18n', 'priority: high'],
      ),
    ).toEqual([]);
  });
});

describe('handSetFamilyLabel in any casing', () => {
  const AREAS = ['area: dashboard', 'area: community', 'area: flight-engine'] as const;

  it.each(['Area: Community', 'AREA: COMMUNITY', 'Area: community', ' area: community '])(
    'reads "%s" as the known label, spelled as the board spells it',
    (label) => {
      expect(handSetFamilyLabel(['enhancement', label], 'area', AREAS)).toBe('area: community');
    },
  );

  it('still treats two re-cased labels of one family as a contradiction', () => {
    expect(
      handSetFamilyLabel(['Area: Community', 'AREA: DASHBOARD'], 'area', AREAS),
    ).toBeUndefined();
  });

  it.each(['Area: Nonsense', 'Priority: High', 'Areas: Community', 'Area:Community'])(
    'still ignores "%s", which is no known area',
    (label) => {
      expect(handSetFamilyLabel([label], 'area', AREAS)).toBeUndefined();
    },
  );
});
