// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the KEEPER
// partner-application dossier × the maintainer's marks. Issue triage never
// scores, labels or answers an issue the maintainer has declined or put on
// hold (issue-triage.ts planIssueTriage, law 2: the maintainer's mark
// outranks triage), and the pool claim refuses one (pool-client.ts
// planClaimPoolIssue). The partner-application path runs ahead of both
// checks, so a declined or held application still got the `dossier-posted`
// label and a public dossier of its applicant's account facts.

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate } from '@autopilot/store';
import {
  HOLD_LABELS,
  planIssueTriage,
  runIssueTriageRitual,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';
import {
  DOSSIER_POSTED_LABEL,
  PARTNER_APPLICATION_LABEL,
} from '../../src/flight/contributor-dossier.js';
import { DECLINED_LABEL } from '../../src/flight/pool-client.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const seeded = (name: string): string =>
  HOUSE_TAXONOMY_LABELS.find((label) => label.name === name)?.name ?? '';
const marks = [seeded('declined'), seeded('status: awaiting-human'), seeded('status: blocked')];

const application = (number: number, labels: readonly string[]): IncomingIssue => ({
  number,
  title: `partner application: applicant-${number}`,
  body: 'Applying for Active-partner standing.',
  labels: [PARTNER_APPLICATION_LABEL, ...labels],
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

describe("the partner-application dossier × the maintainer's declined and held applications (regression, epic 0019 additive-only law)", () => {
  it('reads the labels issue triage and the pool claim hold on, as the seeder stamps them', () => {
    expect([DECLINED_LABEL, ...HOLD_LABELS]).toEqual(marks);
  });

  it.each(marks)(
    'plans no dossier for an application marked "%s", as triage skips such an issue',
    (mark) => {
      const issue = { number: 9, title: 'Keyboard nav is broken', body: 'Stuck', labels: [mark] };
      expect(planIssueTriage(issue, [], []).decision).toBe('skip');
      expect(planIssueTriage(application(50, []), [], []).decision).toBe('dossier');

      const decision = planIssueTriage(application(50, [mark]), [], []);
      expect(decision.decision).toBe('skip');
      expect(decision.reasoning).toContain('#50');
      expect(decision.reasoning).toContain(`"${mark}"`);
    },
  );

  it.each(marks)(
    'still skips an application marked "%s" when someone is assigned to it',
    (mark) => {
      const assigned = { ...application(51, [mark]), assignees: ['applicant-51'] };
      expect(planIssueTriage(assigned, [], []).decision).toBe('skip');
    },
  );

  it.each(marks)(
    'writes nothing and looks up no one for an application marked "%s", while the unmarked one beside it gets its dossier',
    async (mark) => {
      const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-dossier-marks-db-'));
      const s = openStore(join(dbDir, 'a.db'));
      try {
        migrate(s);
        s.db
          .prepare(
            `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
             VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', NULL, 100, 100)`,
          )
          .run();
        const exec = ghServing([application(70, [mark]), application(71, [])]);

        const result = await runIssueTriageRitual(exec, s, 'p1', [], [], undefined, () => 100);

        expect(result.plans.map((plan) => plan.decision.decision)).toEqual(['skip', 'dossier']);
        expect(result.plans[0]?.commands).toEqual([]);
        const sent = calls(exec);
        const writes = sent.filter((args) => args[0] === 'issue' && args[1] !== 'list');
        expect(writes.map((args) => args.slice(0, 3))).toEqual([
          ['issue', 'edit', '71'],
          ['issue', 'comment', '71'],
        ]);
        expect(sent.filter((args) => args.some((arg) => arg.includes('applicant-70')))).toEqual([]);
        expect(result.commandResults.map((r) => r.command.args.slice(0, 3))).toEqual([
          ['issue', 'edit', '71'],
          ['issue', 'comment', '71'],
        ]);
        expect(result.tasksCreated).toBe(0);
      } finally {
        s.close();
        rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      }
    },
  );

  it('still names the posted dossier first on a marked application an earlier pass handled', () => {
    const decision = planIssueTriage(application(52, [DOSSIER_POSTED_LABEL, 'declined']), [], []);

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain(DOSSIER_POSTED_LABEL);
  });

  it('plans the dossier again once the maintainer lifts the mark', () => {
    expect(planIssueTriage(application(53, ['status: awaiting-human']), [], []).decision).toBe(
      'skip',
    );
    expect(planIssueTriage(application(53, []), [], []).decision).toBe('dossier');
  });
});
