// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Two operator directives (2026-09-12) on how KEEPER treats what people file:
 *
 * 1. RESERVED-FOR-HUMANS EXPIRY. A "good first issue" is reserved for a
 *    human, but not forever: unclaimed for 14 days it is opened to the fleet
 *    — the `agent-ok` label goes on, ONE comment says so and names the way
 *    to keep it (claim it), and the issue is accepted onto the board. Two
 *    issues had sat untouched for a week while the fleet could have shipped
 *    them in hours.
 * 2. ISSUE PROTOCOL GATE. The repo has templates and blank issues are off,
 *    yet nothing checked that a body actually carries the template's
 *    sections. Now an off-template issue is not boarded: it gets
 *    `status: needs-format` and ONE reply naming the template and the
 *    missing sections; once the body conforms the label comes off in the
 *    same edit that accepts it. Epics and partner applications are exempt.
 */
import { describe, it, expect } from 'vitest';
import {
  planIssueTriage,
  planIssueTriageCommands,
  issueTemplateGaps,
  AGENT_OK_LABEL,
  NEEDS_FORMAT_LABEL,
  RESERVED_FOR_HUMANS_DAYS,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-12T12:00:00Z');
const daysAgo = (n: number): string => new Date(NOW - n * DAY).toISOString();

const CONFORMANT_BUG =
  '### What happened?\n\nThe fleet table loses keyboard focus.\n\n' +
  '### Steps to reproduce\n\n1. Tab into the table\n2. Press ArrowDown\n\n' +
  '### Expected behavior\n\nFocus moves down one row.\n';

function issue(extra: Partial<IncomingIssue>): IncomingIssue {
  return {
    number: 5,
    title: 'Keyboard nav is broken in the fleet table',
    body: CONFORMANT_BUG,
    ...extra,
  };
}

describe('reserved-for-humans expiry', () => {
  it('still reserves a fresh good-first-issue for a human', () => {
    const decision = planIssueTriage(
      issue({ labels: ['good first issue'], createdAt: daysAgo(3) }),
      [],
      [],
      undefined,
      NOW,
    );
    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('good first issue');
  });

  it(`opens an unclaimed good-first-issue to the fleet after ${RESERVED_FOR_HUMANS_DAYS} days`, () => {
    const it20 = issue({ labels: ['good first issue'], createdAt: daysAgo(20) });
    const decision = planIssueTriage(it20, [], [], undefined, NOW);
    expect(decision).toMatchObject({ decision: 'accept', releasedFromHumansAfterDays: 20 });

    const commands = planIssueTriageCommands(it20, decision);
    const edit = commands.find((c) => c.args[1] === 'edit')!;
    expect(edit.args).toContain(AGENT_OK_LABEL);
    // ONE comment, carrying both the release and the acceptance.
    const comments = commands.filter((c) => c.args[1] === 'comment');
    expect(comments).toHaveLength(1);
    expect(comments[0]!.args[4]).toContain('20 days');
    expect(comments[0]!.args[4]).toContain('claim');
  });

  it('never releases an issue a human has claimed, however old', () => {
    const decision = planIssueTriage(
      issue({ labels: ['good first issue'], assignees: ['someone'], createdAt: daysAgo(40) }),
      [],
      [],
      undefined,
      NOW,
    );
    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('claimed');
  });

  it('treats agent-ok as the release already granted — accepted, no second release', () => {
    const decision = planIssueTriage(
      issue({ labels: ['good first issue', AGENT_OK_LABEL], createdAt: daysAgo(1) }),
      [],
      [],
      undefined,
      NOW,
    );
    expect(decision.decision).toBe('accept');
    expect(
      (decision as { releasedFromHumansAfterDays?: number }).releasedFromHumansAfterDays,
    ).toBeUndefined();
  });

  it('keeps the reservation when the age is unknown (no createdAt)', () => {
    expect(
      planIssueTriage(issue({ labels: ['good first issue'] }), [], [], undefined, NOW).decision,
    ).toBe('skip');
  });
});

describe('issue protocol gate', () => {
  it('reads the bug template at any heading level, with or without the question mark', () => {
    expect(issueTemplateGaps({ number: 1, title: 't', body: CONFORMANT_BUG })).toBeNull();
    const looser = CONFORMANT_BUG.replace(/### /g, '## ').replace(
      'What happened?',
      'What happened',
    );
    expect(issueTemplateGaps({ number: 1, title: 't', body: looser })).toBeNull();
  });

  it('names the missing sections of a bug report', () => {
    const gaps = issueTemplateGaps({
      number: 1,
      title: 'Crash',
      body: '## What happened\n\nIt crashed.\n',
    });
    expect(gaps).toEqual({
      kind: 'bug',
      missing: ['Steps to reproduce', 'Expected behavior'],
    });
  });

  it('recognises a feature request by its own sections', () => {
    const feature =
      '### Problem / motivation\n\nNo dark mode.\n\n### Proposed solution\n\nAdd one.\n';
    expect(issueTemplateGaps({ number: 1, title: 't', body: feature })).toBeNull();
    expect(
      issueTemplateGaps({ number: 1, title: 't', body: '### Problem / motivation\n\nx\n' }),
    ).toEqual({
      kind: 'feature',
      missing: ['Proposed solution'],
    });
  });

  it('refuses to board an off-template issue: one label, one reply naming the template', () => {
    const offTemplate = issue({ body: 'it is broken pls fix' });
    const decision = planIssueTriage(offTemplate, [], [], undefined, NOW);
    expect(decision).toMatchObject({ decision: 'needs-format', kind: 'bug' });

    const commands = planIssueTriageCommands(offTemplate, decision);
    expect(commands).toHaveLength(2);
    expect(commands[0]!.args).toEqual(['issue', 'edit', '5', '--add-label', NEEDS_FORMAT_LABEL]);
    expect(commands[1]!.args.slice(0, 3)).toEqual(['issue', 'comment', '5']);
    const reply = commands[1]!.args[4]!;
    expect(reply).toContain('Bug report');
    expect(reply).toContain('Steps to reproduce');
    expect(reply).toContain('Expected behavior');
    expect(reply).toContain('.github/ISSUE_TEMPLATE');
  });

  it('waits silently once the label is on and the body is still off-template', () => {
    const decision = planIssueTriage(
      issue({ body: 'still nothing', labels: [NEEDS_FORMAT_LABEL] }),
      [],
      [],
      undefined,
      NOW,
    );
    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain(NEEDS_FORMAT_LABEL);
  });

  it('accepts a fixed body and removes the label in the same edit', () => {
    const fixed = issue({ labels: [NEEDS_FORMAT_LABEL] });
    const decision = planIssueTriage(fixed, [], [], undefined, NOW);
    expect(decision.decision).toBe('accept');
    const edit = planIssueTriageCommands(fixed, decision).find((c) => c.args[1] === 'edit')!;
    const removeAt = edit.args.indexOf('--remove-label');
    expect(removeAt).toBeGreaterThan(-1);
    expect(edit.args.slice(removeAt)).toContain(NEEDS_FORMAT_LABEL);
  });

  it('exempts epics and partner applications — tracking issues follow their own protocol', () => {
    expect(
      planIssueTriage(issue({ body: 'tracking', labels: ['epic'] }), [], [], undefined, NOW)
        .decision,
    ).not.toBe('needs-format');
    expect(
      planIssueTriage(
        issue({ body: 'hi', labels: ['partner-application'] }),
        [],
        [],
        undefined,
        NOW,
      ).decision,
    ).toBe('dossier');
  });

  it('does not re-gate an issue a previous pass already accepted', () => {
    const decision = planIssueTriage(
      issue({ body: 'legacy', labels: ['pool: ux'] }),
      [],
      [],
      undefined,
      NOW,
    );
    expect(decision.decision).toBe('skip');
  });
});
