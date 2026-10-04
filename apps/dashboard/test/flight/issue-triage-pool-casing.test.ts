// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// EPIC 0019 additive-only law (board web-mtsylqbd-q2rg8k), the KEEPER triage
// flow × its own pool label in another casing. Triage accepts an issue with
// `gh issue edit --add-label "pool: ux"`, which matches a label name in any
// casing, so on a repo whose label reads `Pool: UX` that is the spelling an
// accepted issue carries. The idempotency skip read the `pool: ` prefix
// exactly, so a later pass triaged the same issue again: a second public
// "accepting it" comment, and a re-pool when the classifier now picks another
// dimension. The pool itself (pool-client.ts carriedPoolLabel) and the
// Discussions skip already read the prefix in any casing.

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate } from '@autopilot/store';
import {
  POOL_LABEL_PREFIX,
  planIssueTriage,
  planIssueTriageCommands,
  planIssueTriageTask,
  runIssueTriageRitual,
  type IncomingIssue,
} from '../../src/flight/issue-triage.js';
import { isPoolIssue } from '../../src/flight/pool-client.js';
import type { CliExec } from '../../src/connection/cli-probe.js';

const variants = ['Pool: Accessibility', 'POOL: ACCESSIBILITY', 'Pool: accessibility'] as const;
const nearMisses = ['pool:accessibility', 'no pool: accessibility', 'carpool: ux'] as const;

const CONFORMANT_BUG =
  '### What happened?\n\nThe fleet table loses keyboard focus.\n\n' +
  '### Steps to reproduce\n\n1. Tab into the table\n2. Press ArrowDown\n\n' +
  '### Expected behavior\n\nFocus moves down one row.\n';

const issue = (labels: readonly string[], number = 61): IncomingIssue => ({
  number,
  title: 'Keyboard nav is broken in the fleet table',
  body: CONFORMANT_BUG,
  labels,
});

describe('triage × its pool label in any casing (regression, epic 0019 additive-only law)', () => {
  it('reads variants of the prefix triage writes, not the prefix itself', () => {
    for (const label of variants) expect(label.startsWith(POOL_LABEL_PREFIX)).toBe(false);
    expect(planIssueTriage(issue([]), [], []).decision).toBe('accept');
  });

  it.each(variants)(
    'skips an issue an earlier pass labeled "%s", naming it as carried',
    (label) => {
      const labeled = issue([label]);
      const decision = planIssueTriage(labeled, [], []);

      expect(decision.decision).toBe('skip');
      expect(decision.reasoning).toContain(`"${label}"`);
      expect(planIssueTriageCommands(labeled, decision)).toEqual([]);
      expect(planIssueTriageTask(labeled, decision, 'p1', 100)).toBeNull();
    },
  );

  it.each([...variants, ...nearMisses, `${POOL_LABEL_PREFIX}ux`])(
    'skips "%s" exactly when the pool reads it as pooled',
    (label) => {
      const skipped = planIssueTriage(issue([label]), [], []).decision === 'skip';
      expect(skipped).toBe(isPoolIssue([label]));
    },
  );

  it.each(nearMisses)('still triages an issue whose label only resembles it ("%s")', (label) => {
    expect(planIssueTriage(issue([label]), [], []).decision).toBe('accept');
  });

  it('a ritual pass writes only to the issue that carries no pool label in any casing', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'ap-dash-issue-triage-pool-casing-db-'));
    const s = openStore(join(dbDir, 'a.db'));
    try {
      migrate(s);
      s.db
        .prepare(
          `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
           VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', NULL, 100, 100)`,
        )
        .run();
      const exec: CliExec = vi.fn(async (_bin, args) => {
        if (args[0] === 'issue' && args[1] === 'list') {
          return {
            code: 0,
            stdout: JSON.stringify([
              { ...issue([], 11), labels: [{ name: 'Pool: UX' }] },
              { ...issue([], 12), title: 'Fleet table drops focus after a sort' },
            ]),
          };
        }
        return { code: 0, stdout: '' };
      });

      const result = await runIssueTriageRitual(exec, s, 'p1', [], [], undefined, () => 100);

      expect(result.plans.map((p) => p.decision.decision)).toEqual(['skip', 'accept']);
      const calls = (exec as unknown as { mock: { calls: [string, string[]][] } }).mock.calls;
      const writes = calls
        .map(([, args]) => args)
        .filter((args) => args[1] === 'edit' || args[1] === 'comment' || args[1] === 'create');
      expect(writes.length).toBeGreaterThan(0);
      for (const args of writes) expect(args[2]).toBe('12');
      expect(result.tasksCreated).toBe(1);
      const ids = s.db.prepare('SELECT id FROM tasks WHERE project_id = ?').all('p1');
      expect(ids).toEqual([{ id: 'github-12' }]);
    } finally {
      s.close();
      rmSync(dbDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});
