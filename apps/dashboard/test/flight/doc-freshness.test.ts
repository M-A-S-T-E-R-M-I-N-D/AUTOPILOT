// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeDocDrift,
  collectDocFreshnessTimestamps,
  docFreshnessIdPrefix,
  docFreshnessTaskId,
  findStaleDocFreshnessProposalIds,
  DOC_SUBJECTS,
  type DocFreshnessFinding,
  type DocSubjectEntry,
} from '../../src/flight/doc-freshness.js';

function gitSync(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function initRepo(dir: string): void {
  gitSync(dir, ['init', '-q']);
  gitSync(dir, ['config', 'user.email', 'test@autopilot.dev']);
  gitSync(dir, ['config', 'user.name', 'Test']);
  gitSync(dir, ['config', 'commit.gpgsign', 'false']);
}

/** Commits at an explicit, whole-second epoch timestamp — real commits made
 *  back-to-back in a fast test run can otherwise land in the same second
 *  (`%ct` has 1-second resolution), making a "newer than" assertion flaky. */
function commitAt(dir: string, file: string, content: string, epochSeconds: number): void {
  writeFileSync(join(dir, file), content);
  gitSync(dir, ['add', '-A']);
  const date = `${epochSeconds} +0000`;
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', file], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

const ENTRY: DocSubjectEntry = { doc: 'docs/x.md', subjects: ['src/a.ts', 'src/b.ts'] };

describe('computeDocDrift', () => {
  it('returns no finding when the doc is newer than every subject', () => {
    const times = new Map([
      ['docs/x.md', 300],
      ['src/a.ts', 100],
      ['src/b.ts', 200],
    ]);
    expect(computeDocDrift([ENTRY], times)).toEqual([]);
  });

  it('flags a doc whose subject was touched after it, naming the newest stale subject', () => {
    const times = new Map([
      ['docs/x.md', 100],
      ['src/a.ts', 150],
      ['src/b.ts', 400],
    ]);
    expect(computeDocDrift([ENTRY], times)).toEqual([
      {
        doc: 'docs/x.md',
        docTouchedAt: 100,
        newestStaleSubject: 'src/b.ts',
        newestStaleSubjectTouchedAt: 400,
      },
    ]);
  });

  it('treats an exact tie as not stale (subject must be strictly newer)', () => {
    const times = new Map([
      ['docs/x.md', 200],
      ['src/a.ts', 200],
      ['src/b.ts', 200],
    ]);
    expect(computeDocDrift([ENTRY], times)).toEqual([]);
  });

  it('skips a doc missing from the timestamp map instead of guessing', () => {
    const times = new Map([['src/a.ts', 999]]);
    expect(computeDocDrift([ENTRY], times)).toEqual([]);
  });

  it('skips a subject missing from the timestamp map instead of guessing', () => {
    const times = new Map([
      ['docs/x.md', 100],
      ['src/a.ts', 500],
      // src/b.ts intentionally absent
    ]);
    expect(computeDocDrift([ENTRY], times)).toEqual([
      {
        doc: 'docs/x.md',
        docTouchedAt: 100,
        newestStaleSubject: 'src/a.ts',
        newestStaleSubjectTouchedAt: 500,
      },
    ]);
  });

  it('a doc with only a missing subject produces no finding, not a guessed one', () => {
    const entry: DocSubjectEntry = { doc: 'docs/x.md', subjects: ['src/only.ts'] };
    const times = new Map([['docs/x.md', 100]]); // src/only.ts intentionally absent
    expect(computeDocDrift([entry], times)).toEqual([]);
  });

  it('keeps the first-seen subject as newest over a later, strictly older one', () => {
    const entry: DocSubjectEntry = { doc: 'docs/x.md', subjects: ['src/big.ts', 'src/small.ts'] };
    const times = new Map([
      ['docs/x.md', 100],
      ['src/big.ts', 500],
      ['src/small.ts', 200],
    ]);
    expect(computeDocDrift([entry], times)).toEqual([
      {
        doc: 'docs/x.md',
        docTouchedAt: 100,
        newestStaleSubject: 'src/big.ts',
        newestStaleSubjectTouchedAt: 500,
      },
    ]);
  });

  it('keeps the first-seen subject as newest when a later one ties it exactly', () => {
    const entry: DocSubjectEntry = {
      doc: 'docs/x.md',
      subjects: ['src/first.ts', 'src/second.ts'],
    };
    const times = new Map([
      ['docs/x.md', 100],
      ['src/first.ts', 300],
      ['src/second.ts', 300],
    ]);
    expect(computeDocDrift([entry], times)).toEqual([
      {
        doc: 'docs/x.md',
        docTouchedAt: 100,
        newestStaleSubject: 'src/first.ts',
        newestStaleSubjectTouchedAt: 300,
      },
    ]);
  });

  it('evaluates multiple entries independently', () => {
    const entries: DocSubjectEntry[] = [
      { doc: 'docs/x.md', subjects: ['src/a.ts'] },
      { doc: 'docs/y.md', subjects: ['src/c.ts'] },
    ];
    const times = new Map([
      ['docs/x.md', 100],
      ['src/a.ts', 50],
      ['docs/y.md', 100],
      ['src/c.ts', 999],
    ]);
    const findings = computeDocDrift(entries, times);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.doc).toBe('docs/y.md');
  });

  it('DOC_SUBJECTS pins the exact tracked docs and their subject paths', () => {
    expect(DOC_SUBJECTS).toEqual([
      {
        doc: 'docs/epics/0001-parallel-flights.md',
        subjects: [
          'apps/dashboard/src/fly.ts',
          'apps/dashboard/src/flight/runner.ts',
          'apps/dashboard/src/flight/registry.ts',
        ],
      },
      {
        doc: 'docs/epics/0002-shell-decomposition.md',
        subjects: ['apps/dashboard/src/web/', 'apps/dashboard/src/shared/'],
      },
      {
        doc: 'docs/epics/0003-ring-0-fleet-watchdog.md',
        subjects: [
          'apps/dashboard/src/control/cli.ts',
          'apps/dashboard/src/control/flight-watchdog.ts',
          'apps/dashboard/src/control/land-watchdog.ts',
        ],
      },
      {
        doc: 'docs/epics/0004-bash-containment-worktree.md',
        subjects: ['apps/dashboard/src/flight/worktree.ts', 'apps/dashboard/src/fly.ts'],
      },
      {
        doc: 'docs/epics/0006-github-connected-mode.md',
        subjects: [
          'apps/dashboard/src/github/',
          'apps/dashboard/src/connection/',
          'apps/dashboard/src/web/connect-panel.ts',
        ],
      },
      {
        doc: 'docs/epics/0007-platform-maintainer-and-pool.md',
        subjects: [
          'apps/dashboard/src/flight/issue-triage.ts',
          'apps/dashboard/src/flight/issue-triage-execute.ts',
          'apps/dashboard/src/flight/pr-review.ts',
          'apps/dashboard/src/flight/pr-review-execute.ts',
          'apps/dashboard/src/flight/report-from-here.ts',
          'apps/dashboard/src/flight/report-from-here-execute.ts',
          'apps/dashboard/src/flight/pool-client.ts',
          'apps/dashboard/src/flight/pool-client-execute.ts',
          'apps/dashboard/src/flight/publicity.ts',
        ],
      },
      {
        doc: 'docs/epics/0008-brand-identity.md',
        subjects: [
          'apps/dashboard/src/assets/goggles-mark.ts',
          'apps/dashboard/src/assets/brandmark.ts',
        ],
      },
      {
        doc: 'docs/epics/0009-warm-sessions.md',
        subjects: [
          'packages/engine/src/adapters/claude-cli.ts',
          'packages/store/src/warm-sessions.ts',
        ],
      },
      {
        doc: 'docs/epics/0010-maintenance-ritual.md',
        subjects: [
          'apps/dashboard/src/control/ci-status.ts',
          'apps/dashboard/src/control/maintenance-sweep.ts',
        ],
      },
      {
        doc: 'docs/epics/0011-architect-chat-v2.md',
        subjects: [
          'apps/dashboard/src/flight/control-execute.ts',
          'apps/dashboard/src/ask/architect-proposal.ts',
        ],
      },
      {
        doc: 'docs/epics/0012-agentic-ask-escalation.md',
        subjects: ['packages/engine/src/ask-escalation.ts', 'apps/dashboard/src/ask/service.ts'],
      },
      {
        doc: 'docs/epics/0013-cost-semantics-v3.md',
        subjects: [
          'packages/engine/src/usage-pool.ts',
          'packages/engine/src/adapters/usage-pool-scan.ts',
        ],
      },
      {
        doc: 'docs/epics/0014-fleet-wisdom-generalization.md',
        subjects: [
          'apps/dashboard/src/flight/soul-mining.ts',
          'apps/dashboard/src/flight/fleet-wisdom-mining.ts',
        ],
      },
      {
        doc: 'docs/epics/0015-cockpit-supervisory-control.md',
        subjects: ['scripts/cockpit-metrics.mjs'],
      },
    ]);
  });

  it('the real registry names only docs/subjects that exist in this repo', async () => {
    const { existsSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const repoRoot = resolve(import.meta.dirname, '../../../..');
    for (const { doc, subjects } of DOC_SUBJECTS) {
      expect(existsSync(resolve(repoRoot, doc))).toBe(true);
      for (const subject of subjects) {
        expect(existsSync(resolve(repoRoot, subject))).toBe(true);
      }
    }
  });
});

describe('collectDocFreshnessTimestamps', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-doc-freshness-'));
    initRepo(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('looks up a real git last-touch time for every doc and subject, newest commit last', () => {
    commitAt(dir, 'doc.md', 'v1', 1_700_000_000);
    commitAt(dir, 'subject.ts', 'v1', 1_700_000_100);

    const entries: DocSubjectEntry[] = [{ doc: 'doc.md', subjects: ['subject.ts'] }];
    const timestamps = collectDocFreshnessTimestamps(dir, entries);
    expect(timestamps.get('doc.md')).toBe(1_700_000_000_000);
    expect(timestamps.get('subject.ts')).toBe(1_700_000_100_000);
  });

  it('a path with no git history is simply absent from the map', () => {
    commitAt(dir, 'unrelated.txt', 'v1', 1_700_000_000);

    const entries: DocSubjectEntry[] = [
      { doc: 'docs/does-not-exist.md', subjects: ['src/also-missing.ts'] },
    ];
    const timestamps = collectDocFreshnessTimestamps(dir, entries);
    expect(timestamps.has('docs/does-not-exist.md')).toBe(false);
    expect(timestamps.has('src/also-missing.ts')).toBe(false);
  });

  it('a repo path that is not a git repository degrades to an empty map instead of throwing', () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'autopilot-doc-freshness-nogit-'));
    try {
      const entries: DocSubjectEntry[] = [{ doc: 'doc.md', subjects: ['subject.ts'] }];
      expect(() => collectDocFreshnessTimestamps(nonGitDir, entries)).not.toThrow();
      expect(collectDocFreshnessTimestamps(nonGitDir, entries).size).toBe(0);
    } finally {
      rmSync(nonGitDir, { recursive: true, force: true });
    }
  });
});

describe('docFreshnessIdPrefix / docFreshnessTaskId (proposal dedup identity)', () => {
  // Why these exist: the sweep's task id folds in the newest-stale-subject's
  // touch time, so every LATER commit to a subject mints a NEW id while the
  // old, unresolved proposal stays open — the board accumulated 13 near-
  // identical DOC-FRESHNESS rows this way (observed 2026-08-20, amplified by
  // fleet runs where every instance's flight-end sweep fires). The PREFIX is
  // the doc's whole identity: fly.ts skips proposing while ANY open proposal
  // for the same doc exists, regardless of which subject touch minted it.
  it('prefix is the doc identity alone — every proposal for one doc shares it', () => {
    expect(docFreshnessIdPrefix('docs/epics/0001-parallel-flights.md')).toBe(
      'docfresh-docs-epics-0001-parallel-flights-md-',
    );
  });

  it('task id = prefix + newest-stale-subject touch time, byte-identical to the historical inline construction', () => {
    const finding: DocFreshnessFinding = {
      doc: 'docs/epics/0001-parallel-flights.md',
      docTouchedAt: 1_700_000_000_000,
      newestStaleSubject: 'apps/dashboard/src/fly.ts',
      newestStaleSubjectTouchedAt: 1_700_000_100_000,
    };
    expect(docFreshnessTaskId(finding)).toBe(
      'docfresh-docs-epics-0001-parallel-flights-md-1700000100000',
    );
    expect(docFreshnessTaskId(finding).startsWith(docFreshnessIdPrefix(finding.doc))).toBe(true);
  });
});

describe('findStaleDocFreshnessProposalIds', () => {
  // Same VERIFY-BY prune doctrine `findStaleVerifyByProposalIds` established:
  // once a doc catches up past a finding's subject-touch time, the OLD open
  // proposal — keyed to a touch time no current finding matches — must stop
  // being treated as live, or it sits `needs_approval` forever even after
  // the drift it named is already resolved (observed live: docs/epics/0001
  // and 0003 both hand-fixed while their original proposals stayed open).
  const finding: DocFreshnessFinding = {
    doc: 'docs/epics/0001-parallel-flights.md',
    docTouchedAt: 1_700_000_000_000,
    newestStaleSubject: 'apps/dashboard/src/fly.ts',
    newestStaleSubjectTouchedAt: 1_700_000_100_000,
  };
  const currentId = docFreshnessTaskId(finding);

  it('keeps an open proposal whose id matches a currently-reported finding', () => {
    expect(findStaleDocFreshnessProposalIds([currentId], [finding])).toEqual([]);
  });

  it('flags an open proposal as stale once the doc catches up past its subject-touch time', () => {
    const staleId = docFreshnessTaskId({
      ...finding,
      newestStaleSubjectTouchedAt: 1_600_000_000_000,
    });
    expect(findStaleDocFreshnessProposalIds([staleId], [finding])).toEqual([staleId]);
  });

  it('flags an open proposal as stale once the doc is no longer drifting at all', () => {
    expect(findStaleDocFreshnessProposalIds([currentId], [])).toEqual([currentId]);
  });

  it('returns an empty array when there are no open proposals', () => {
    expect(findStaleDocFreshnessProposalIds([], [finding])).toEqual([]);
  });

  it('only flags the stale ids, keeping current ones from a mixed batch', () => {
    const otherFinding: DocFreshnessFinding = {
      doc: 'docs/epics/0003-ring-0-fleet-watchdog.md',
      docTouchedAt: 1_600_000_000_000,
      newestStaleSubject: 'apps/dashboard/src/control/cli.ts',
      newestStaleSubjectTouchedAt: 1_600_000_100_000,
    };
    const staleId = docFreshnessTaskId({
      ...otherFinding,
      newestStaleSubjectTouchedAt: 1_500_000_000_000,
    });
    expect(findStaleDocFreshnessProposalIds([currentId, staleId], [finding, otherFinding])).toEqual(
      [staleId],
    );
  });
});
