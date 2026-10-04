// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the KEEPER triage
// flow × a repo that grew its own `area:`/`priority:` labels. Triage keeps a
// single house label a person set (handSetFamilyLabel), and a label outside the
// house set is "a typo, or a family this classifier does not own": the
// classifier still answers, "and the stray label is left where it is". The
// accept edit did not leave it. supersededFamilyLabels named every other label
// of a chosen family, so `area: backend` on a repo with its own scheme was
// removed by `--remove-label` in the same edit that added the classifier's
// guess. Epic 0019 S5 runs this steward on anyone's own repo, and law 2 puts
// the maintainer's labels above triage. A contradiction between two house
// labels is still the tie supersession breaks.

import { describe, it, expect } from 'vitest';
import {
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

const editCommand = (issue: IncomingIssue) => {
  const decision = planIssueTriage(issue, [], [], undefined, NOW);
  const edit = planIssueTriageCommands(issue, decision).find((c) => c.args[1] === 'edit');
  if (edit === undefined) throw new Error('expected an accept edit');
  return edit;
};

const removed = (args: readonly string[]): readonly string[] =>
  args.flatMap((arg, i) => (arg === '--remove-label' ? [args[i + 1] ?? ''] : []));

const seeded = HOUSE_TAXONOMY_LABELS.map((label) => label.name);
const houseOf = (family: string): readonly string[] =>
  seeded.filter((name) => name.startsWith(`${family}: `));

// A repo's own scheme, near misses of the house names, and a typo.
const OWN_AREAS = ['area: backend', 'Area: Docs', 'area: flight engine', 'Area: Comunity'];
const OWN_PRIORITIES = ['priority: p1', 'Priority: Urgent', 'priority:high'];

describe("triage × a repo's own area and priority labels (regression, epic 0019 additive-only law)", () => {
  it('reads labels the seeder does not stamp, so each one is a stray', () => {
    expect(houseOf('area')).toContain('area: flight-engine');
    expect(houseOf('priority')).toContain('priority: medium');
    for (const label of [...OWN_AREAS, ...OWN_PRIORITIES]) {
      expect(seeded.map((name) => name.toLowerCase())).not.toContain(label.toLowerCase());
    }
  });

  it.each(OWN_AREAS)('leaves "%s" on the issue while the classifier answers', (label) => {
    const { args } = editCommand(sample([label]));
    expect(args).toContain('area: flight-engine');
    expect(removed(args)).toEqual([]);
  });

  it.each(OWN_PRIORITIES)('leaves "%s" on the issue while the classifier answers', (label) => {
    const { args } = editCommand(sample([label]));
    expect(args).toContain('priority: medium');
    expect(removed(args)).toEqual([]);
  });

  it('says it replaces nothing when only strays share the families', () => {
    const { details } = editCommand(sample(['area: backend', 'priority: p1']));
    expect(details).not.toContain('replacing');
  });

  it('still clears two contradicting house areas, the tie supersession exists for', () => {
    const { args } = editCommand(sample(['area: community', 'Area: Dashboard']));
    expect(args).toContain('area: flight-engine');
    expect(removed(args)).toEqual(['area: community', 'Area: Dashboard']);
  });

  it('clears two contradicting house areas and keeps the stray beside them', () => {
    const { args, details } = editCommand(
      sample(['area: backend', 'area: community', 'Area: Dashboard']),
    );
    expect(args).toContain('area: flight-engine');
    expect(removed(args)).toEqual(['area: community', 'Area: Dashboard']);
    expect(details).toContain('(replacing "area: community", "Area: Dashboard")');
  });

  it('reads a stray beside one house label as no contradiction of it', () => {
    const issue = sample(['area: community', 'priority: high', 'area: backend']);
    expect(planIssueTriage(issue, [], [], undefined, NOW)).toMatchObject({
      decision: 'accept',
      area: 'area: community',
      priority: 'priority: high',
    });
    const { args } = editCommand(issue);
    expect(args).not.toContain('--remove-label');
    expect(args).not.toContain('area: flight-engine');
  });
});

describe('supersededFamilyLabels names only house labels', () => {
  it.each(houseOf('area').filter((name) => name !== 'area: i18n'))(
    'still names the house area "%s" in any casing when another is chosen',
    (name) => {
      const carried = name.toUpperCase();
      expect(supersededFamilyLabels([carried], ['area: i18n', 'priority: medium'])).toEqual([
        carried,
      ]);
    },
  );

  it.each(houseOf('priority').filter((name) => name !== 'priority: medium'))(
    'still names the house priority "%s" in any casing when another is chosen',
    (name) => {
      const carried = name.toUpperCase();
      expect(supersededFamilyLabels([carried], ['area: i18n', 'priority: medium'])).toEqual([
        carried,
      ]);
    },
  );

  it("never names a label of a family's own scheme", () => {
    expect(
      supersededFamilyLabels(
        [...OWN_AREAS, ...OWN_PRIORITIES, 'priority: high', 'pool: ux'],
        ['area: i18n', 'priority: medium'],
      ),
    ).toEqual(['priority: high']);
  });
});
