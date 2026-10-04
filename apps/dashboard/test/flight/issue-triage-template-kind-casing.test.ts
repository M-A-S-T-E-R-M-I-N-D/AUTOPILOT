// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the template gate
// × a feature label in another casing. The repo's feature_request.yml form
// files with `labels: ['enhancement']`, and GitHub keeps one label per name in
// any casing, so on a repo whose label reads `Enhancement` that is the spelling
// a feature request carries. With no template heading in the body, the gate
// picks the template from a feature-ish label — matched in lowercase only, so
// a heading-less `Enhancement` issue was publicly asked for the BUG template's
// sections and pointed at bug_report.yml.

import { describe, it, expect } from 'vitest';
import {
  issueTemplateGaps,
  planIssueTriage,
  planIssueTriageCommands,
  TEMPLATE_FILES,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';

const FEATURE_MISSING = ['Problem / motivation', 'Proposed solution'] as const;
const BUG_MISSING = ['What happened?', 'Steps to reproduce', 'Expected behavior'] as const;

const variants = ['Enhancement', 'ENHANCEMENT', 'Feature', 'Feature request', 'FEATURE'] as const;
const nearMisses = ['Bug', 'not a feature', 'good first issue', 'Documentation'] as const;

// A title with none of the feature verbs, so only the label can make it one.
const bare = (labels: readonly string[]): IncomingIssue => ({
  number: 73,
  title: 'Dark mode for the fleet table',
  body: 'please',
  labels,
});

describe('the template gate × a feature label in any casing (regression, epic 0019 additive-only law)', () => {
  it('reads variants of the label the feature form writes, not the label itself', () => {
    for (const label of variants) expect(/^(enhancement|feature)/.test(label)).toBe(false);
    expect(issueTemplateGaps(bare(['enhancement']))).toEqual({
      kind: 'feature',
      missing: FEATURE_MISSING,
    });
  });

  it.each(variants)('holds a heading-less issue labeled "%s" to the feature template', (label) => {
    expect(issueTemplateGaps(bare([label]))).toEqual({ kind: 'feature', missing: FEATURE_MISSING });
  });

  it.each(variants)(
    'the one public reply for "%s" names the feature form, never the bug form',
    (label) => {
      const filed = bare([label]);
      const decision = planIssueTriage(filed, [], []);
      expect(decision).toMatchObject({ decision: 'needs-format', kind: 'feature' });

      const comment = planIssueTriageCommands(filed, decision).find((c) => c.args[1] === 'comment');
      const body = comment?.args[4] ?? '';
      expect(body).toContain(TEMPLATE_FILES.feature);
      expect(body).not.toContain(TEMPLATE_FILES.bug);
      for (const heading of FEATURE_MISSING) expect(body).toContain(`"${heading}"`);
    },
  );

  it.each(nearMisses)('still holds an issue labeled only "%s" to the bug template', (label) => {
    expect(issueTemplateGaps(bare([label]))).toEqual({ kind: 'bug', missing: BUG_MISSING });
  });
});
