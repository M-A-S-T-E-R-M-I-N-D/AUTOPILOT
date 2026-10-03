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
import { DECLINED_LABEL, isMaintainerMarked } from '../../src/flight/pool-client.js';
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

// Epic 0019 additive-only law, issue triage × the maintainer's marks in
// another casing. The pool claim, the stale-claim reaper and the lists skip
// `declined`, `status: awaiting-human` and `status: blocked` in any casing or
// hyphenation (pool-client.ts isMaintainerMarked). Issue triage matched them
// exactly, so on a repo whose label reads `Declined` or `Status: Blocked` the
// claim refused the issue while triage still labeled it, answered it and
// boarded it for the fleet, and a held application still got its dossier.
describe("planIssueTriage × the maintainer's marks in any casing (regression, epic 0019 additive-only law)", () => {
  const answered = 'the maintainer has answered it';
  const held = 'the maintainer put it on hold by hand';
  const variants = [
    ['Declined', answered],
    ['DECLINED', answered],
    ['Status: Awaiting-Human', held],
    ['status: awaiting human', held],
    ['Status: Blocked', held],
  ] as const;
  /** A bug filed on the template, so triage would accept it unmarked. */
  const reported = (number: number, title: string, labels: readonly string[]): IncomingIssue => ({
    number,
    title,
    body: '### What happened?\nStuck\n\n### Steps to reproduce\n1. see above\n\n### Expected behavior\nIt works.\n',
    labels,
  });

  it('reads variants of the three marks triage skips, not the marks themselves', () => {
    for (const [mark] of variants) {
      expect([DECLINED_LABEL, ...HOLD_LABELS]).not.toContain(mark);
      expect(isMaintainerMarked([mark])).toBe(true);
    }
  });

  it.each(variants)('skips an issue marked "%s", as the pool claim does', (mark, why) => {
    const title = 'Keyboard nav is broken in the fleet table';
    expect(planIssueTriage(reported(60, title, []), [], []).decision).toBe('accept');

    const decision = planIssueTriage(reported(60, title, [mark]), [], []);
    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain('#60');
    expect(decision.reasoning).toContain(`"${mark}" — ${why}`);
  });

  it.each(variants)('plans no dossier for an application marked "%s"', (mark) => {
    const decision = planIssueTriage(application(61, [mark]), [], []);

    expect(decision.decision).toBe('skip');
    expect(decision.reasoning).toContain(`"${mark}"`);
  });

  it('writes on and boards only the unmarked issue of four', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-mark-casing-db-'));
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
        reported(80, 'Keyboard nav is broken in the fleet table', ['Declined']),
        reported(81, 'The cost chart loses its legend on resize', ['Status: Blocked']),
        application(82, ['Status: Awaiting-Human']),
        reported(83, 'The flight log scrolls past its last line', []),
      ]);

      const result = await runIssueTriageRitual(exec, s, 'p1', [], [], undefined, () => 100);

      expect(result.plans.map((plan) => plan.decision.decision)).toEqual([
        'skip',
        'skip',
        'skip',
        'accept',
      ]);
      const writes = calls(exec).filter((args) => args[0] === 'issue' && args[1] !== 'list');
      expect(writes.length).toBeGreaterThan(0);
      expect(writes.map((args) => args[2])).toEqual(writes.map(() => '83'));
      expect(
        calls(exec).filter((args) => args.some((arg) => arg.includes('applicant-82'))),
      ).toEqual([]);
      expect(result.tasksCreated).toBe(1);
    } finally {
      s.close();
      rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('still triages a label that only resembles a mark', () => {
    const title = 'Keyboard nav is broken in the fleet table';
    for (const label of ['declined-upstream', 'status: blocked on ci', 'awaiting-human']) {
      expect(planIssueTriage(reported(62, title, [label]), [], []).decision).toBe('accept');
    }
  });
});

// Epic 0019 additive-only law, issue triage × an issue already answered as a
// duplicate, in another casing. Triage labels a duplicate `duplicate` so later
// passes skip it, and it skips the maintainer's marks in any casing (above).
// `gh issue edit --add-label` matches a label name in any casing, so on a repo
// whose label reads `Duplicate` that write lands as `Duplicate`. The skip
// matched `duplicate` exactly, so every later pass scored the issue again and
// posted the same reply again, and a maintainer's own `Duplicate` mark was
// answered or boarded as if it were not there.
describe('planIssueTriage × an issue already answered as a duplicate, in any casing (regression, epic 0019 additive-only law)', () => {
  const tracked = { id: 'task-1', title: 'Keyboard nav is broken in the fleet table' };
  /** A bug filed on the template, so triage would answer or accept it unmarked. */
  const reported = (number: number, title: string, labels: readonly string[]): IncomingIssue => ({
    number,
    title,
    body: '### What happened?\nStuck\n\n### Steps to reproduce\n1. see above\n\n### Expected behavior\nIt works.\n',
    labels,
  });

  it.each(['Duplicate', 'DUPLICATE'])(
    'skips an issue labeled "%s" instead of answering it as a duplicate again',
    (label) => {
      expect(planIssueTriage(reported(63, tracked.title, []), [tracked], []).decision).toBe(
        'duplicate',
      );

      const decision = planIssueTriage(reported(63, tracked.title, [label]), [tracked], []);
      expect(decision.decision).toBe('skip');
      expect(decision.reasoning).toContain('#63');
      expect(decision.reasoning).toContain(`"${label}"`);
    },
  );

  it.each(['Duplicate', 'DUPLICATE'])(
    'never boards an issue the maintainer labeled "%s" by hand',
    (label) => {
      const title = 'The cost chart loses its legend on resize';
      expect(planIssueTriage(reported(64, title, []), [tracked], []).decision).toBe('accept');
      expect(planIssueTriage(reported(64, title, [label]), [tracked], []).decision).toBe('skip');
    },
  );

  it('writes only on the unanswered duplicate when the repo spells the label "Duplicate"', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-duplicate-casing-db-'));
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
        reported(90, tracked.title, ['Duplicate']),
        reported(91, tracked.title, []),
      ]);

      const result = await runIssueTriageRitual(exec, s, 'p1', [tracked], [], undefined, () => 100);

      expect(result.plans.map((plan) => plan.decision.decision)).toEqual(['skip', 'duplicate']);
      expect(result.plans[0]?.commands).toEqual([]);
      const writes = calls(exec).filter((args) => args[0] === 'issue' && args[1] !== 'list');
      expect(writes.map((args) => args.slice(0, 3))).toEqual([
        ['issue', 'edit', '91'],
        ['issue', 'comment', '91'],
      ]);
      expect(result.tasksCreated).toBe(0);
    } finally {
      s.close();
      rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('still triages a label that only resembles it', () => {
    for (const label of ['possible duplicate', 'duplicate?', 'duplicate-of-12']) {
      expect(planIssueTriage(reported(65, tracked.title, [label]), [tracked], []).decision).toBe(
        'duplicate',
      );
    }
  });
});
