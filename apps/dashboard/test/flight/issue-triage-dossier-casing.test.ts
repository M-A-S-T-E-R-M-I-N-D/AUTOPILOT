// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the KEEPER
// partner-application dossier × its two labels in another casing. A
// `partner-application` issue routes to a dossier and the maintainer, never
// to ordinary triage (epic 0019 S2), and the ritual stamps `dossier-posted`
// so later passes skip it. Both reads matched the seeder's spelling exactly.
// `gh issue edit --add-label` matches a label name in any casing, so on a
// repo whose labels read `Partner-Application` and `Dossier-Posted` an
// application went through ordinary triage (a template reply or a pool
// label: an autonomous verdict), and a posted dossier was posted again on
// every later pass. Triage already reads the maintainer's marks, `duplicate`,
// `epic` and its own needs-format label in any casing.

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate } from '@autopilot/store';
import {
  planIssueTriage,
  runIssueTriageRitual,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';
import {
  DOSSIER_POSTED_LABEL,
  PARTNER_APPLICATION_LABEL,
  isPartnerApplicationIssue,
} from '../../src/flight/contributor-dossier.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const applicationVariants = ['Partner-Application', 'PARTNER-APPLICATION', 'partner application'];
const postedVariants = ['Dossier-Posted', 'DOSSIER-POSTED', 'dossier posted'];

/** A standing application as its form files it: no bug or feature template
 *  sections, so ordinary triage would gate or board it. */
const application = (number: number, labels: readonly string[]): IncomingIssue => ({
  number,
  title: `partner application: applicant-${number}`,
  body: '### Why Active partner?\nApplying for Active-partner standing.',
  labels,
  author: `applicant-${number}`,
});

/** Every `gh` call the ritual made, as argv. */
function calls(exec: CliExec): string[][] {
  return (exec as unknown as { mock: { calls: [string, string[]][] } }).mock.calls.map(
    ([, args]) => args,
  );
}

/** A `gh` stand-in serving `listed` as the open issues, a user lookup and an
 *  empty merged-PR list for any applicant, and an empty success for writes. */
function ghServing(listed: readonly IncomingIssue[]): CliExec {
  return vi.fn(async (_bin: string, args: readonly string[]) => {
    if (args[0] === 'issue' && args[1] === 'list') {
      return {
        code: 0,
        stdout: JSON.stringify(
          listed.map((issue) => ({
            number: issue.number,
            title: issue.title,
            body: issue.body,
            labels: (issue.labels ?? []).map((name) => ({ name })),
            author: { login: issue.author },
          })),
        ),
      };
    }
    if (args[0] === 'api' && String(args[1]).startsWith('users/')) {
      return {
        code: 0,
        stdout: JSON.stringify({
          created_at: '2024-01-01T00:00:00Z',
          public_repos: 3,
          followers: 1,
        }),
      };
    }
    if (args[0] === 'pr' && args[1] === 'list') return { code: 0, stdout: '[]' };
    return { code: 0, stdout: '' };
  }) as unknown as CliExec;
}

describe('the partner-application dossier × its labels in any casing (regression, epic 0019 additive-only law)', () => {
  it('reads variants of the labels the seeder stamps, not the labels themselves', () => {
    const seeded = HOUSE_TAXONOMY_LABELS.map((label) => label.name);
    expect(seeded).toContain(PARTNER_APPLICATION_LABEL);
    expect(seeded).toContain(DOSSIER_POSTED_LABEL);
    for (const label of applicationVariants) expect(label).not.toBe(PARTNER_APPLICATION_LABEL);
    for (const label of postedVariants) expect(label).not.toBe(DOSSIER_POSTED_LABEL);
  });

  it('sends the same application to ordinary triage when it carries no application label', () => {
    expect(planIssueTriage(application(40, []), [], []).decision).toBe('needs-format');
  });

  it.each([PARTNER_APPLICATION_LABEL, ...applicationVariants])(
    'routes an application labeled "%s" to the dossier, never to ordinary triage',
    (label) => {
      expect(isPartnerApplicationIssue([label])).toBe(true);
      expect(planIssueTriage(application(41, [label]), [], []).decision).toBe('dossier');
    },
  );

  it.each(postedVariants)(
    'skips an application already carrying "%s" instead of posting its dossier again',
    (posted) => {
      expect(planIssueTriage(application(42, [PARTNER_APPLICATION_LABEL]), [], []).decision).toBe(
        'dossier',
      );

      const decision = planIssueTriage(
        application(42, [PARTNER_APPLICATION_LABEL, posted]),
        [],
        [],
      );
      expect(decision.decision).toBe('skip');
      expect(decision.reasoning).toContain('#42');
      expect(decision.reasoning).toContain(`"${posted}"`);
    },
  );

  it('writes only on the application with no dossier yet when the repo spells both labels its own way', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-dossier-casing-db-'));
    const s = openStore(join(dbDir, 'a.db'));
    try {
      migrate(s);
      s.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
           VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', NULL, 100, 100)`,
        )
        .run();
      const exec = ghServing([
        application(70, ['Partner-Application', 'Dossier-Posted']),
        application(71, [PARTNER_APPLICATION_LABEL, 'dossier posted']),
        application(72, ['Partner-Application']),
      ]);

      const result = await runIssueTriageRitual(exec, s, 'p1', [], [], undefined, () => 100);

      expect(result.plans.map((plan) => plan.decision.decision)).toEqual([
        'skip',
        'skip',
        'dossier',
      ]);
      const sent = calls(exec);
      const writes = sent.filter((args) => args[0] === 'issue' && args[1] !== 'list');
      expect(writes.map((args) => args.slice(0, 3))).toEqual([
        ['issue', 'edit', '72'],
        ['issue', 'comment', '72'],
      ]);
      for (const looked of ['applicant-70', 'applicant-71']) {
        expect(sent.filter((args) => args.some((arg) => arg.includes(looked)))).toEqual([]);
      }
      expect(result.tasksCreated).toBe(0);
    } finally {
      s.close();
      rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('still triages a label that only resembles either one', () => {
    for (const label of ['partner', 'partner-applications', 'application']) {
      expect(isPartnerApplicationIssue([label])).toBe(false);
      expect(planIssueTriage(application(43, [label]), [], []).decision).toBe('needs-format');
    }
    for (const label of ['dossier', 'dossier-posting', 'dossier-posted-draft']) {
      expect(
        planIssueTriage(application(44, [PARTNER_APPLICATION_LABEL, label]), [], []).decision,
      ).toBe('dossier');
    }
  });
});
