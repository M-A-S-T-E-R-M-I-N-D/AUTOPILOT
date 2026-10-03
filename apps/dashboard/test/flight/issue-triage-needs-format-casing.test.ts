// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the TEMPLATES flow
// × its own label in another casing. The protocol gate labels an off-template
// issue `status: needs-format` and replies ONCE; a later pass reads the label to
// stay quiet, and lifts it in the accepting edit once the body conforms.
// `gh issue edit --add-label` matches a label name in any casing (cli/cli
// api/queries_repo.go LabelsToIDs, strings.EqualFold), so on a repo whose label
// reads `Status: Needs-Format` the write lands in that spelling. Both reads
// matched the seeder's spelling exactly: every later pass asked the reporter
// again, and a fixed body was boarded with the label still on it. Triage
// already reads `duplicate` and the maintainer's marks in any casing.

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate } from '@autopilot/store';
import {
  NEEDS_FORMAT_LABEL,
  planIssueTriage,
  planIssueTriageCommands,
  runIssueTriageRitual,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const CONFORMANT_BUG =
  '### What happened?\nStuck\n\n### Steps to reproduce\n1. see above\n\n### Expected behavior\nIt works.\n';

const variants = ['Status: Needs-Format', 'STATUS: NEEDS-FORMAT', 'status: needs format'] as const;

const reported = (number: number, body: string, labels: readonly string[]): IncomingIssue => ({
  number,
  title: `The flight log scrolls past its last line (${number})`,
  body,
  labels,
  author: 'reporter',
});

/** Every `gh` call the ritual made, as argv. */
function calls(exec: CliExec): string[][] {
  return (exec as unknown as { mock: { calls: [string, string[]][] } }).mock.calls.map(
    ([, args]) => args,
  );
}

/** A `gh` stand-in serving `listed` as the open issues and an empty success
 *  for every other call. */
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
    return { code: 0, stdout: '' };
  }) as unknown as CliExec;
}

describe('the template gate × its needs-format label in any casing (regression, epic 0019 additive-only law)', () => {
  it('reads variants of the label the seeder stamps, not the label itself', () => {
    expect(HOUSE_TAXONOMY_LABELS.map((label) => label.name)).toContain(NEEDS_FORMAT_LABEL);
    for (const label of variants) expect(label).not.toBe(NEEDS_FORMAT_LABEL);
  });

  it.each(variants)(
    'waits silently on an off-template issue already labeled "%s" instead of asking again',
    (label) => {
      expect(planIssueTriage(reported(40, 'it is broken pls fix', []), [], []).decision).toBe(
        'needs-format',
      );

      const decision = planIssueTriage(reported(40, 'it is broken pls fix', [label]), [], []);
      expect(decision.decision).toBe('skip');
      expect(decision.reasoning).toContain('#40');
      expect(decision.reasoning).toContain(`"${label}" is already on it`);
      expect(planIssueTriageCommands(reported(40, 'x', [label]), decision)).toEqual([]);
    },
  );

  it.each(variants)(
    'accepts a fixed body labeled "%s" and lifts the label as the issue carries it, in the same edit',
    (label) => {
      const fixed = reported(41, CONFORMANT_BUG, [label]);
      const decision = planIssueTriage(fixed, [], []);
      expect(decision.decision).toBe('accept');

      const edits = planIssueTriageCommands(fixed, decision).filter((c) => c.args[1] === 'edit');
      expect(edits).toHaveLength(1);
      const removed = edits[0]!.args.flatMap((arg, i) =>
        arg === '--remove-label' ? [edits[0]!.args[i + 1]] : [],
      );
      expect(removed).toEqual([label]);
      expect(edits[0]!.details).toContain(`body now conforms, removing "${label}"`);
    },
  );

  it('still lifts the seeder spelling as before', () => {
    const fixed = reported(42, CONFORMANT_BUG, [NEEDS_FORMAT_LABEL]);
    const edit = planIssueTriageCommands(fixed, planIssueTriage(fixed, [], [])).find(
      (c) => c.args[1] === 'edit',
    )!;
    expect(edit.args.slice(-2)).toEqual(['--remove-label', NEEDS_FORMAT_LABEL]);
  });

  it('replies only on the unlabeled off-template issue when the repo spells the label "Status: Needs-Format"', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-needs-format-casing-db-'));
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
        reported(50, 'it is broken pls fix', ['Status: Needs-Format']),
        reported(51, 'also broken', []),
      ]);

      const result = await runIssueTriageRitual(exec, s, 'p1', [], [], undefined, () => 100);

      expect(result.plans.map((plan) => plan.decision.decision)).toEqual(['skip', 'needs-format']);
      expect(result.plans[0]?.commands).toEqual([]);
      const writes = calls(exec).filter((args) => args[0] === 'issue' && args[1] !== 'list');
      expect(writes.map((args) => args.slice(0, 3))).toEqual([
        ['issue', 'edit', '51'],
        ['issue', 'comment', '51'],
      ]);
      expect(result.tasksCreated).toBe(0);
    } finally {
      s.close();
      rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });

  it('still gates and leaves alone a label that only resembles it', () => {
    for (const label of ['needs-format', 'status: needs-format-review', 'status: format']) {
      expect(planIssueTriage(reported(43, 'it is broken pls fix', [label]), [], []).decision).toBe(
        'needs-format',
      );
      const fixed = reported(44, CONFORMANT_BUG, [label]);
      const edit = planIssueTriageCommands(fixed, planIssueTriage(fixed, [], [])).find(
        (c) => c.args[1] === 'edit',
      )!;
      expect(edit.args).not.toContain('--remove-label');
    }
  });
});
