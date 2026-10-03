// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the TEMPLATES flow
// × the epic exemption in another casing. Epics are tracking issues with their
// own protocol (docs/epics), so the template gate never asks one for the bug or
// feature template's sections. The exemption matched the seeder's `epic`
// exactly, so on a repo whose label reads `Epic` a tracking issue filed by a
// collaborator was labeled `status: needs-format` and publicly asked for
// "What happened?". The lucky roll already reads `Epic` as an epic, and
// triage reads the maintainer's marks, `duplicate` and its own needs-format
// label in any casing.

import { describe, it, expect } from 'vitest';
import {
  NEEDS_FORMAT_LABEL,
  planIssueTriage,
  planIssueTriageCommands,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';
import { luckyFitLine } from '../../src/flight/lucky-fit.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';

const SEEDED = 'epic';
const variants = ['Epic', 'EPIC', ' epic '] as const;

const tracking = (labels: readonly string[]): IncomingIssue => ({
  number: 52,
  title: 'Tracking: the flight log learns to page (12)',
  body: 'Slices:\n- [ ] paging\n- [ ] search',
  labels,
  author: 'collaborator',
});

describe('the template gate × the epic exemption in any casing (regression, epic 0019 additive-only law)', () => {
  it('reads variants of the label the seeder stamps, not the label itself', () => {
    expect(HOUSE_TAXONOMY_LABELS.map((label) => label.name)).toContain(SEEDED);
    for (const label of variants) expect(label).not.toBe(SEEDED);
  });

  it('still gates the same off-template body when it carries no epic label', () => {
    expect(planIssueTriage(tracking([]), [], []).decision).toBe('needs-format');
  });

  it.each([SEEDED, ...variants])(
    'never gates a tracking issue labeled "%s" on the bug or feature template',
    (label) => {
      const issue = tracking([label]);
      const decision = planIssueTriage(issue, [], []);
      expect(decision.decision).toBe('accept');

      // The one comment is the accept's own reasoning, never the template reply.
      const commands = planIssueTriageCommands(issue, decision);
      const comments = commands.filter((c) => c.args[1] === 'comment');
      expect(comments.map((c) => c.args.at(-1))).toEqual([decision.reasoning]);
      for (const command of commands) {
        expect(command.args).not.toContain(NEEDS_FORMAT_LABEL);
        expect(command.args).not.toContain(label);
      }
    },
  );

  it.each(variants)('agrees with the lucky roll, which reads "%s" as an epic', (label) => {
    const line = luckyFitLine(
      {
        number: 52,
        title: 'Tracking: the flight log learns to page',
        url: 'https://github.com/o/r/issues/52',
        labels: [label],
        assignees: [],
        source: 'pool',
      },
      { locale: 'en', attention: 'week', lanes: 1, firingsFlown: 12 },
    );
    expect(line?.reasoning).toContain('epic; est. multi-day');
    expect(planIssueTriage(tracking([label]), [], []).decision).not.toBe('needs-format');
  });
});
