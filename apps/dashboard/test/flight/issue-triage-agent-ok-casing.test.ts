// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the KEEPER triage
// flow × a maintainer's `agent-ok` in another casing. A "good first issue" is
// reserved for a human for 14 days unless it carries `agent-ok`, which the
// maintainer may also set by hand to open it to the fleet at once. The read
// matched the seeder's `agent-ok` exactly. So on a repo whose label reads
// `Agent-OK` the maintainer's opening was ignored. A fresh issue stayed
// reserved, and an old one got a public comment saying KEEPER opened it to
// the fleet, which the maintainer had already done. Triage already reads the
// maintainer's marks, `duplicate`, `epic` and its needs-format label in any
// casing.

import { describe, it, expect } from 'vitest';
import {
  AGENT_OK_LABEL,
  RESERVED_FOR_HUMANS_DAYS,
  planIssueTriage,
  planIssueTriageCommands,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-04T12:00:00Z');
const daysAgo = (n: number): string => new Date(NOW - n * DAY).toISOString();

const variants = ['Agent-OK', 'AGENT-OK', ' agent-ok ', 'agent ok'] as const;

const CONFORMANT_BUG =
  '### What happened?\n\nThe fleet table loses keyboard focus.\n\n' +
  '### Steps to reproduce\n\n1. Tab into the table\n2. Press ArrowDown\n\n' +
  '### Expected behavior\n\nFocus moves down one row.\n';

const goodFirst = (labels: readonly string[], ageDays: number): IncomingIssue => ({
  number: 61,
  title: 'Keyboard nav is broken in the fleet table',
  body: CONFORMANT_BUG,
  labels: ['good first issue', ...labels],
  createdAt: daysAgo(ageDays),
});

describe("triage × the maintainer's agent-ok in any casing (regression, epic 0019 additive-only law)", () => {
  it('reads variants of the label the seeder stamps, not the label itself', () => {
    expect(HOUSE_TAXONOMY_LABELS.map((label) => label.name)).toContain(AGENT_OK_LABEL);
    for (const label of variants) expect(label).not.toBe(AGENT_OK_LABEL);
  });

  it('still reserves a fresh good first issue that carries no agent-ok', () => {
    const decision = planIssueTriage(goodFirst([], 3), [], [], undefined, NOW);
    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('good first issue');
  });

  it.each([AGENT_OK_LABEL, ...variants])(
    'boards a fresh good first issue the maintainer opened with "%s", with no second release',
    (label) => {
      const issue = goodFirst([label], 3);
      const decision = planIssueTriage(issue, [], [], undefined, NOW);
      expect(decision.decision).toBe('accept');
      if (decision.decision !== 'accept') return;
      expect(decision.releasedFromHumansAfterDays).toBeUndefined();

      const edit = planIssueTriageCommands(issue, decision).find((c) => c.args[1] === 'edit')!;
      expect(edit.args).not.toContain(AGENT_OK_LABEL);
      expect(edit.details).not.toContain('reserved-for-humans expired');
    },
  );

  it.each(variants)(
    'never claims to open an old issue the maintainer already opened with "%s"',
    (label) => {
      const age = RESERVED_FOR_HUMANS_DAYS + 6;
      const issue = goodFirst([label], age);
      const decision = planIssueTriage(issue, [], [], undefined, NOW);
      expect(decision.decision).toBe('accept');
      expect(decision.reasoning).not.toContain('opened to the fleet');

      const commands = planIssueTriageCommands(issue, decision);
      const comments = commands.filter((c) => c.args[1] === 'comment');
      expect(comments).toHaveLength(1);
      expect(comments[0]!.args.at(-1)).not.toContain(`${age} days`);
      for (const command of commands) expect(command.args).not.toContain(AGENT_OK_LABEL);
    },
  );

  it.each(['agent', 'agent-ok-later', 'not agent-ok', 'agents-ok'])(
    'keeps the reservation for a label that only resembles it ("%s")',
    (label) => {
      expect(planIssueTriage(goodFirst([label], 3), [], [], undefined, NOW).decision).toBe('skip');
    },
  );
});
