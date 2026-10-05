// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the template gate
// × a body that fills one form and borrows a heading from the other. The gate
// picked the form by asking the FEATURE form first: one heading matching
// /problem/ or /propos/ made the body a feature request. So a bug report that
// carried every section bug_report.yml asks for, plus a "Proposed fix", was
// labeled `status: needs-format` and publicly asked for "Problem / motivation".
// The fleet's own reports hit the same wall: report-from-here's safety net
// grafts the BUG sections onto a description the gate refuses, and a composed
// description that had opened with "### Problem / motivation" stayed refused
// after the graft, so the report went upstream already failing the gate.

import { describe, it, expect } from 'vitest';
import {
  issueTemplateGaps,
  planIssueTriage,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';
import { planReportFromHere, type ReportRegionCapture } from '../../src/flight/report-from-here.js';

const BUG_SECTIONS = [
  '### What happened?\n\nThe launch button stays disabled after a flight lands.',
  '### Steps to reproduce\n\n1. Land a flight.\n2. Watch the launch button.',
  '### Expected behavior\n\nIt re-enables once the flight lands.',
] as const;

const FEATURE_SECTIONS = [
  '### Problem / motivation\n\nThe fleet table has no dark mode.',
  '### Proposed solution\n\nFollow the OS theme.',
] as const;

// Headings a bug reporter writes that the feature form's tests also match.
const borrowedHeadings = ['Proposed fix', 'Possible problem', 'Problem', 'Proposal'] as const;

const filed = (body: string): IncomingIssue => ({
  number: 88,
  title: 'Launch button stays disabled',
  body,
  labels: ['bug'],
});

const capture = (description: string): ReportRegionCapture => ({
  regionId: 'fly-bar',
  regionLabel: 'Fly bar',
  description,
  moduleSources: ['apps/dashboard/src/web/features/fly.ts'],
  hasScreenshot: false,
});

describe('the template gate × a body that fills one form (regression, epic 0019 additive-only law)', () => {
  it('reads each borrowed heading as the feature form, so the bug form alone decided nothing', () => {
    for (const heading of borrowedHeadings) {
      expect(issueTemplateGaps(filed(`### ${heading}\n\nx`))?.kind).toBe('feature');
    }
  });

  it.each(borrowedHeadings)(
    'boards a bug report carrying every bug section plus "%s"',
    (heading) => {
      const issue = filed(
        [...BUG_SECTIONS, `### ${heading}\n\nGate the button on the landing.`].join('\n\n'),
      );
      expect(issueTemplateGaps(issue)).toBeNull();
      expect(planIssueTriage(issue, [], []).decision).toBe('accept');
    },
  );

  it('boards a feature request carrying both feature sections plus a bug heading, as before', () => {
    const issue = filed([...FEATURE_SECTIONS, '### Expected behavior\n\nDark rows.'].join('\n\n'));
    expect(issueTemplateGaps(issue)).toBeNull();
    expect(planIssueTriage(issue, [], []).decision).toBe('accept');
  });

  it('still holds a body that completes neither form, to the form it held it to before', () => {
    const mixed = filed(
      ['### Problem\n\nIt stays disabled.', BUG_SECTIONS[1], BUG_SECTIONS[2]].join('\n\n'),
    );
    expect(issueTemplateGaps(mixed)).toEqual({ kind: 'feature', missing: ['Proposed solution'] });
    expect(planIssueTriage(mixed, [], [])).toMatchObject({
      decision: 'needs-format',
      kind: 'feature',
    });

    const halfBug = filed([BUG_SECTIONS[0], '### Proposed fix\n\nGate it.'].join('\n\n'));
    expect(issueTemplateGaps(halfBug)).toEqual({
      kind: 'feature',
      missing: ['Problem / motivation'],
    });
    expect(issueTemplateGaps(filed(BUG_SECTIONS[0]))).toEqual({
      kind: 'bug',
      missing: ['Steps to reproduce', 'Expected behavior'],
    });
    expect(issueTemplateGaps(filed(FEATURE_SECTIONS[0]))).toEqual({
      kind: 'feature',
      missing: ['Proposed solution'],
    });
  });
});

describe("report-from-here's safety net × the gate it promises to pass", () => {
  // Judged the way triage judges the filed issue: its real title, body and label.
  const asFiled = (description: string): IncomingIssue => {
    const plan = planReportFromHere(capture(description), 'issue', 'p1', 1);
    if (!plan.ok || plan.action !== 'issue') throw new Error('expected an issue plan');
    return { number: 89, title: plan.title, body: plan.body, labels: ['bug'] };
  };

  it('files a composed bug report with a "Proposed fix" section as written, and it passes', () => {
    const description = [
      ...BUG_SECTIONS,
      '### Proposed fix\n\nGate the button on the landing.',
    ].join('\n\n');
    const issue = asFiled(description);
    expect(issue.body.startsWith(description)).toBe(true);
    expect(issue.body.match(/### What happened\?/g) ?? []).toHaveLength(1);
    expect(issueTemplateGaps(issue)).toBeNull();
    expect(planIssueTriage(issue, [], []).decision).toBe('accept');
  });

  it('a description that opened with "### Problem / motivation" passes once the bug sections are grafted on', () => {
    const issue = asFiled('### Problem / motivation\n\nThe launch button stays disabled.');
    expect(issue.body).toContain('### Steps to reproduce');
    expect(issueTemplateGaps(issue)).toBeNull();
    expect(planIssueTriage(issue, [], []).decision).toBe('accept');
  });

  it('still grafts the bug sections onto a plain description, which passes', () => {
    const issue = asFiled('The launch button stays disabled after a flight lands.');
    expect(issue.body.startsWith('### What happened?\n')).toBe(true);
    expect(issueTemplateGaps(issue)).toBeNull();
  });
});
