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
  isMaintainerAuthored,
  repoOwnerOf,
  handSetFamilyLabel,
  milestoneToSet,
  parseMilestoneTitle,
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

/**
 * THE GATE IS FOR REPORTERS, NOT FOR THE PERSON WHO WROTE IT (2026-09-22).
 * Issue #5 — the planned static-site sample, filed by the repo owner as a
 * `good first issue` for newcomers — was about to be labelled
 * `status: needs-format` and answered with "Thanks for filing this… edit the
 * description to add those sections". That is the maintainer being
 * template-nagged in public by their own bot, on the very issue meant to look
 * welcoming. Epics were already exempt for the same reason; the owner's own
 * issues are the other half of it.
 */
describe('repoOwnerOf', () => {
  it('takes the owner segment of a nameWithOwner', () => {
    expect(repoOwnerOf('M-A-S-T-E-R-M-I-N-D/AUTOPILOT')).toBe('M-A-S-T-E-R-M-I-N-D');
  });

  it('is undefined for anything that is not owner/repo, so a bad read cannot name a wrong owner', () => {
    expect(repoOwnerOf(undefined)).toBeUndefined();
    expect(repoOwnerOf('')).toBeUndefined();
    expect(repoOwnerOf('AUTOPILOT')).toBeUndefined();
    expect(repoOwnerOf('/AUTOPILOT')).toBeUndefined();
    expect(repoOwnerOf('owner/')).toBeUndefined();
  });
});

describe('isMaintainerAuthored', () => {
  it('matches the owner regardless of case, as GitHub logins do', () => {
    expect(isMaintainerAuthored({ author: 'm-a-s-t-e-r-m-i-n-d' }, 'M-A-S-T-E-R-M-I-N-D')).toBe(
      true,
    );
  });

  it('does not match a different author', () => {
    expect(isMaintainerAuthored({ author: 'gabibi555' }, 'M-A-S-T-E-R-M-I-N-D')).toBe(false);
  });

  it('exempts nobody when the author or the owner is unknown', () => {
    expect(isMaintainerAuthored({}, 'M-A-S-T-E-R-M-I-N-D')).toBe(false);
    expect(isMaintainerAuthored({ author: '' }, 'M-A-S-T-E-R-M-I-N-D')).toBe(false);
    expect(isMaintainerAuthored({ author: 'M-A-S-T-E-R-M-I-N-D' }, undefined)).toBe(false);
    expect(isMaintainerAuthored({ author: 'M-A-S-T-E-R-M-I-N-D' }, '')).toBe(false);
  });
});

describe('the template gate skips the maintainer own issues', () => {
  const offTemplate = issue({
    number: 5,
    title: 'Add the planned static-site sample (samples/static-site)',
    body: '`samples/README.md` lists a static-site sample as Planned.',
    labels: ['enhancement', 'help wanted'],
    author: 'M-A-S-T-E-R-M-I-N-D',
  });

  it('boards an off-template issue the owner filed instead of asking them to fill a form', () => {
    const decision = planIssueTriage(offTemplate, [], [], undefined, NOW, 'M-A-S-T-E-R-M-I-N-D');
    expect(decision.decision).not.toBe('needs-format');
  });

  it('posts no label and no reply for it — the commands are what reach the tracker', () => {
    const decision = planIssueTriage(offTemplate, [], [], undefined, NOW, 'M-A-S-T-E-R-M-I-N-D');
    const commands = planIssueTriageCommands(offTemplate, decision);
    const emitted = JSON.stringify(commands);
    expect(emitted).not.toContain(NEEDS_FORMAT_LABEL);
    expect(emitted).not.toContain('Thanks for filing this');
  });

  it('still gates the same body when somebody else filed it', () => {
    const decision = planIssueTriage(
      { ...offTemplate, author: 'gabibi555' },
      [],
      [],
      undefined,
      NOW,
      'M-A-S-T-E-R-M-I-N-D',
    );
    expect(decision.decision).toBe('needs-format');
  });

  it('still gates it when the owner cannot be resolved — an unknown identity exempts nobody', () => {
    const decision = planIssueTriage(offTemplate, [], [], undefined, NOW);
    expect(decision.decision).toBe('needs-format');
  });
});

/**
 * WHAT A HUMAN MARKED OUTRANKS THE CLASSIFIER (2026-09-22). The area/priority
 * classifier counts keywords, and keywords collide: issue #5 asks for a
 * static-site sample and mentions "the static-site gate", so "gate" scored it
 * `area: flight-engine` and the triage edit was about to remove the
 * maintainer's correct `area: community` to make room. Two labels of one
 * family is still a contradiction nobody sets on purpose, so the classifier
 * keeps breaking that tie.
 */
describe('handSetFamilyLabel', () => {
  const AREAS = ['area: dashboard', 'area: community', 'area: flight-engine'] as const;

  it('returns the single label a person put in that family', () => {
    expect(handSetFamilyLabel(['enhancement', 'area: community'], 'area', AREAS)).toBe(
      'area: community',
    );
  });

  it('returns nothing when the family is empty, so the classifier answers', () => {
    expect(handSetFamilyLabel(['enhancement'], 'area', AREAS)).toBeUndefined();
  });

  it('returns nothing when the family already contradicts itself', () => {
    expect(
      handSetFamilyLabel(['area: community', 'area: dashboard'], 'area', AREAS),
    ).toBeUndefined();
  });

  it('ignores a label outside the known set rather than putting it on the board', () => {
    expect(handSetFamilyLabel(['area: nonsense'], 'area', AREAS)).toBeUndefined();
  });

  it('does not confuse one family with another', () => {
    expect(handSetFamilyLabel(['priority: high'], 'area', AREAS)).toBeUndefined();
  });
});

describe('triage keeps a hand-set area and priority', () => {
  const sample = issue({
    number: 5,
    title: 'Add the planned static-site sample (samples/static-site)',
    body:
      '### Problem / motivation\n\nsamples/README lists it as planned, blocked on the ' +
      'static-site gate.\n\n### Proposed solution\n\nAdd the sample.\n',
    labels: ['enhancement', 'area: community', 'priority: medium'],
  });

  it('accepts with the labels already on the issue, not the ones it would have guessed', () => {
    const decision = planIssueTriage(sample, [], [], undefined, NOW);
    expect(decision).toMatchObject({
      decision: 'accept',
      area: 'area: community',
      priority: 'priority: medium',
    });
  });

  it('removes neither of them — nothing in the edit supersedes a human label', () => {
    const decision = planIssueTriage(sample, [], [], undefined, NOW);
    const args = planIssueTriageCommands(sample, decision)
      .filter((c) => c.args[1] === 'edit')
      .flatMap((c) => c.args);
    expect(args).not.toContain('--remove-label');
    expect(args).toContain('area: community');
  });

  it('still classifies a family nobody has decided', () => {
    const unlabelled = { ...sample, labels: ['enhancement'] };
    const decision = planIssueTriage(unlabelled, [], [], undefined, NOW);
    expect(decision).toMatchObject({ decision: 'accept' });
    if (decision.decision !== 'accept') return;
    expect(decision.area).toMatch(/^area: /);
    expect(decision.priority).toMatch(/^priority: /);
  });
});

/**
 * A FLAG THAT CANNOT WORK IS WORSE THAN NO FLAG (2026-09-22). The milestone
 * classifier picks from a fixed house set — Foundations / V1 / Hardening —
 * that a seeder creates on a fresh repo. This repo grew its own four
 * milestones instead and has none of those titles, so every accepted issue
 * carried `--milestone V1`, which did nothing and said nothing. Issue #5 also
 * showed the other half: it already had a milestone a person chose on
 * 2026-09-07, and the edit was about to replace it.
 */
describe('parseMilestoneTitle', () => {
  it('reads the title off gh milestone object', () => {
    expect(parseMilestoneTitle({ title: 'Foundation & community' })).toBe('Foundation & community');
  });

  it('is undefined for an issue with no milestone, or a payload without a title', () => {
    expect(parseMilestoneTitle(null)).toBeUndefined();
    expect(parseMilestoneTitle(undefined)).toBeUndefined();
    expect(parseMilestoneTitle({})).toBeUndefined();
    expect(parseMilestoneTitle({ title: '' })).toBeUndefined();
    expect(parseMilestoneTitle('Foundations')).toBeUndefined();
  });
});

describe('milestoneToSet', () => {
  const REPO = ['Foundations', 'V1', 'Hardening'];

  it('sets the classified milestone when the repo has it and the issue has none', () => {
    expect(milestoneToSet('V1', undefined, REPO)).toBe('V1');
  });

  it('leaves a milestone somebody already chose alone', () => {
    expect(milestoneToSet('V1', 'Foundation & community', REPO)).toBeUndefined();
  });

  it('sets nothing when the repo has no such milestone', () => {
    expect(milestoneToSet('V1', undefined, ['Foundation & community'])).toBeUndefined();
  });

  it('sets nothing when the repo milestones could not be read', () => {
    expect(milestoneToSet('V1', undefined, [])).toBeUndefined();
  });

  it('treats an empty existing title as no milestone at all', () => {
    expect(milestoneToSet('V1', '', REPO)).toBe('V1');
  });
});

describe('the triage edit omits a milestone it cannot set', () => {
  const fresh = issue({
    number: 90,
    title: 'Fleet table loses focus',
    labels: [],
  });

  it('emits no --milestone flag against a repo without the house milestones', () => {
    const decision = planIssueTriage(fresh, [], [], undefined, NOW, undefined, [
      'Foundation & community',
    ]);
    const args = planIssueTriageCommands(fresh, decision)
      .filter((c) => c.args[1] === 'edit')
      .flatMap((c) => c.args);
    expect(args).not.toContain('--milestone');
  });

  it('says nothing about a milestone in the comment either, so the two agree', () => {
    const decision = planIssueTriage(fresh, [], [], undefined, NOW, undefined, []);
    expect(decision.reasoning).not.toContain('milestone');
  });

  it('emits the flag when the repo does have the milestone', () => {
    const decision = planIssueTriage(fresh, [], [], undefined, NOW, undefined, [
      'Foundations',
      'V1',
      'Hardening',
    ]);
    const args = planIssueTriageCommands(fresh, decision)
      .filter((c) => c.args[1] === 'edit')
      .flatMap((c) => c.args);
    expect(args).toContain('--milestone');
    expect(args).toContain('V1');
  });

  it('leaves the flag off when the issue already carries a milestone', () => {
    const already = { ...fresh, milestone: 'Foundation & community' };
    const decision = planIssueTriage(already, [], [], undefined, NOW, undefined, [
      'Foundations',
      'V1',
      'Hardening',
    ]);
    const args = planIssueTriageCommands(already, decision)
      .filter((c) => c.args[1] === 'edit')
      .flatMap((c) => c.args);
    expect(args).not.toContain('--milestone');
  });
});
