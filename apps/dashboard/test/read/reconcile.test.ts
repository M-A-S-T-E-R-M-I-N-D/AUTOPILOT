// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  titleMatchScore,
  findReconciliationCandidates,
  filePathMatchesTitle,
  type CommitEntry,
} from '../../src/read/reconcile.js';
import type { TaskEntry } from '../../src/read/fleet.js';

function task(over: Partial<TaskEntry> = {}): Pick<TaskEntry, 'id' | 'title' | 'status'> {
  return {
    id: 't1',
    title: 'Add reuse lint (Python) as an optional CI job alongside the Node SPDX-header gate',
    status: 'open',
    ...over,
  };
}

function commit(over: Partial<CommitEntry> = {}): CommitEntry {
  return {
    sha: 'abc1234',
    subject: 'ci: add optional REUSE-3.3 compliance lint alongside the SPDX gate',
    ...over,
  };
}

describe('titleMatchScore', () => {
  it('scores a real title/commit-subject pair for the same shipped work as a strong match', () => {
    const score = titleMatchScore(
      'Add reuse lint (Python) as an optional CI job alongside the Node SPDX-header gate',
      'ci: add optional REUSE-3.3 compliance lint alongside the SPDX gate',
    );

    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it('scores unrelated strings low', () => {
    const score = titleMatchScore(
      'Wire a configurable OTLP endpoint into the firing loop (env-driven, off by default)',
      'fix(engine): defang forged fence markers inside ask source paths',
    );

    expect(score).toBeLessThan(0.3);
  });

  it('regression: a task shipped inside a WIP-checkpoint commit scores below the default threshold', () => {
    // ap-msksw1me-0's OTLP endpoint wiring actually landed in commit ce1aacf,
    // whose subject is the generic checkpoint boilerplate below — it never
    // mentions OTLP at all. Unlike the reuse-lint pairing above (a real
    // descriptive commit subject scores 0.615), this task's title-vs-subject
    // score is near zero, so `findReconciliationCandidates` will NOT surface
    // it as a proposal even though the work is genuinely shipped. Documented
    // here so this known gap is a proven fact, not an assumption — see the
    // BACKLOG-999.md "Board hygiene" note on checkpoint-commit blind spots.
    const score = titleMatchScore(
      'Wire a configurable OTLP endpoint into the firing loop (env-driven, off by default)',
      'wip(autopilot): checkpoint — firing 110 died mid-unit; next firing resumes it',
    );

    expect(score).toBeLessThan(0.5);
  });

  it('returns 0 when either string has no meaningful tokens', () => {
    expect(titleMatchScore('', 'anything')).toBe(0);
    expect(titleMatchScore('123 456', 'the a an')).toBe(0);
  });

  it('is case-insensitive and punctuation-insensitive', () => {
    expect(titleMatchScore('Fix the Widget', 'fix: the WIDGET!!')).toBe(1);
  });

  it('filters every configured stopword before scoring, so a shared stopword alone is not a match', () => {
    // Loops the full STOPWORDS list rather than one hardcoded case: each
    // word only shares meaning with its pair through the stopword itself, so
    // any single missing entry would leak that word through as a real token
    // and produce a nonzero score below.
    const stopwords = [
      'a',
      'an',
      'and',
      'as',
      'at',
      'be',
      'by',
      'for',
      'from',
      'in',
      'into',
      'is',
      'it',
      'of',
      'on',
      'or',
      'the',
      'to',
      'with',
    ];
    for (const word of stopwords) {
      expect(titleMatchScore(`${word} apple`, `${word} banana`)).toBe(0);
    }
  });

  it('treats a purely numeric token as meaningless, but keeps an alphanumeric token that merely contains digits', () => {
    // Distinguishes the anchored /^\d+$/ from an unanchored or single-digit
    // variant: 'bug123' and '3d' are NOT purely numeric and must survive.
    expect(titleMatchScore('fix bug123', 'resolve bug123')).toBeCloseTo(1 / 3);
    expect(titleMatchScore('3d printer parts', '3d printer accessories')).toBe(0.5);
    expect(titleMatchScore('order 12345 today', 'order 99999 today')).toBe(1);
  });
});

describe('filePathMatchesTitle', () => {
  it('a shared DIRECTORY segment is not evidence — only the file basename counts', () => {
    // 2026-08-24 live incident: every board task cites its spec as
    // "EPIC-SPEC: docs/epics/00xx-….md", so the directory token "epics"
    // matched EVERY commit that touched ANY spec file — 13 of 16 DETECTED
    // BACKLOG rows pointed at one unrelated extraction commit. A directory
    // says where a file LIVES; only its basename says what it IS.
    expect(
      filePathMatchesTitle('COCKPIT 3/6 — EPIC-SPEC: docs/epics/0005-cockpit-redesign.md', [
        'docs/epics/0002-shell-decomposition.md',
      ]),
    ).toBe(false);
    expect(
      filePathMatchesTitle('PLATFORM 4/7 — EPIC-SPEC: docs/epics/0007-platform-maintainer.md', [
        'apps/dashboard/src/web/features/evolution.ts',
      ]),
    ).toBe(false);
    // the SAME spec file still matches — basename tokens carry the signal
    expect(
      filePathMatchesTitle('COCKPIT 3/6 — EPIC-SPEC: docs/epics/0005-cockpit-redesign.md', [
        'docs/epics/0005-cockpit-redesign.md',
      ]),
    ).toBe(true);
  });

  it('matches when a distinctive token is shared between title and a changed file path', () => {
    expect(
      filePathMatchesTitle(
        'Wire a configurable OTLP endpoint into the firing loop (env-driven, off by default)',
        ['apps/dashboard/src/flight/otlp.ts'],
      ),
    ).toBe(true);
  });

  it('does not match on structural path noise alone (src/test/apps/ts/index, …)', () => {
    expect(
      filePathMatchesTitle('Improve the reliability of automated checks', [
        'apps/dashboard/test/index.ts',
      ]),
    ).toBe(false);
  });

  it('returns false when the commit has no file list', () => {
    expect(filePathMatchesTitle('Anything', [])).toBe(false);
  });

  it('filters every real path-noise token, so sharing only that token between title and path does not match', () => {
    // Loops the full (post-length-filter) PATH_NOISE_TOKENS list: wrapping
    // each in 'apps/<token>/handler.ts' keeps 'apps' itself correctly noise
    // (its own unmutated Set entry) while isolating the token under test.
    const noiseTokens = ['test', 'tests', 'apps', 'packages', 'dist', 'index', 'docs', 'json'];
    for (const token of noiseTokens) {
      expect(
        filePathMatchesTitle(`something about ${token} here`, [`apps/${token}/handler.ts`]),
      ).toBe(false);
    }
  });

  it('returns false when every path token is structural noise, leaving no distinctive evidence at all', () => {
    expect(
      filePathMatchesTitle('Something about apps test index json', ['apps/test/index.json']),
    ).toBe(false);
  });

  it('does not match on a short, non-noise token even when the same short string is present in the path', () => {
    // 'vs' is not a stopword or a noise token, so it does land in
    // distinctiveFileTokens — but it is still too short (< 4 chars) to trust
    // as evidence, and the title-side length gate must reject it too.
    expect(filePathMatchesTitle('Compare vs baseline', ['apps/vs/handler.ts'])).toBe(false);
  });
});

describe('findReconciliationCandidates', () => {
  it('proposes an open task whose title matches a commit subject', () => {
    const candidates = findReconciliationCandidates([task()], [commit()]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      taskId: 't1',
      commitSha: 'abc1234',
    });
  });

  it('never proposes a task that is already done', () => {
    const candidates = findReconciliationCandidates([task({ status: 'done' })], [commit()]);

    expect(candidates).toHaveLength(0);
  });

  it('omits a task with no commit clearing the threshold', () => {
    const candidates = findReconciliationCandidates(
      [task({ title: 'Totally unrelated backlog item about something else entirely' })],
      [commit()],
    );

    expect(candidates).toHaveLength(0);
  });

  it('picks the single best-scoring commit per task', () => {
    const weakMatch = commit({ sha: 'weak000', subject: 'chore: unrelated housekeeping' });
    const strongMatch = commit();

    const candidates = findReconciliationCandidates([task()], [weakMatch, strongMatch]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.commitSha).toBe('abc1234');
  });

  it('sorts multiple candidates strongest match first', () => {
    const exact = task({ id: 't-exact', title: 'Fix the widget renderer' });
    const partial = task({ id: 't-partial', title: 'Fix the widget renderer and its tests' });
    const exactCommit = commit({ sha: 'exact001', subject: 'fix: the widget renderer' });

    const candidates = findReconciliationCandidates([partial, exact], [exactCommit]);

    expect(candidates.map((c) => c.taskId)).toEqual(['t-exact', 't-partial']);
  });

  it('respects a custom threshold', () => {
    const looseTask = task({ title: 'gate' });
    const looseCommit = commit({
      subject: 'ci: add optional REUSE-3.3 compliance lint alongside the SPDX gate',
    });

    expect(findReconciliationCandidates([looseTask], [looseCommit], 0.99)).toHaveLength(0);
    expect(findReconciliationCandidates([looseTask], [looseCommit], 0.01)).toHaveLength(1);
  });

  it('regression: of the two real board fixtures, only the descriptively-committed one is proposed', () => {
    // The live AUTOPILOT board deliberately left ap-msksw1mf-4 (reuse lint)
    // and ap-msksw1me-0 (OTLP wiring) open as a real-world proof for this
    // matcher (BACKLOG-999.md "Board hygiene"). Both are actually shipped,
    // but only the reuse-lint task's real shipping commit has a descriptive
    // subject — the OTLP task shipped inside a generic WIP-checkpoint
    // commit. So the next flight's proposal list should contain exactly one
    // of the two, not both; asserting that here keeps BACKLOG-999.md's claim
    // honest instead of assumed.
    const reuseLintTask = task({
      id: 'ap-msksw1mf-4',
      title: 'Add reuse lint (Python) as an optional CI job alongside the Node SPDX-header gate',
    });
    const otlpTask = task({
      id: 'ap-msksw1me-0',
      title: 'Wire a configurable OTLP endpoint into the firing loop (env-driven, off by default)',
    });
    const reuseLintCommit = commit({
      sha: 'd3ced1b',
      subject: 'ci: add optional REUSE-3.3 compliance lint alongside the SPDX gate',
    });
    const otlpCheckpointCommit = commit({
      sha: 'ce1aacf',
      subject: 'wip(autopilot): checkpoint — firing 110 died mid-unit; next firing resumes it',
    });

    const candidates = findReconciliationCandidates(
      [reuseLintTask, otlpTask],
      [reuseLintCommit, otlpCheckpointCommit],
    );

    expect(candidates.map((c) => c.taskId)).toEqual(['ap-msksw1mf-4']);
  });

  it('regression: once commits carry their changed file paths, the checkpoint-shipped task is recovered too', () => {
    // Same two real board fixtures as above, but wired with the actual files
    // each commit touched (as GitVcs.recentCommits now returns) — the
    // file-path fallback signal recovers the OTLP task the subject-only
    // match above genuinely misses, closing the blind spot BACKLOG-999.md's
    // "Board hygiene" note left open.
    const reuseLintTask = task({
      id: 'ap-msksw1mf-4',
      title: 'Add reuse lint (Python) as an optional CI job alongside the Node SPDX-header gate',
    });
    const otlpTask = task({
      id: 'ap-msksw1me-0',
      title: 'Wire a configurable OTLP endpoint into the firing loop (env-driven, off by default)',
    });
    const reuseLintCommit = commit({
      sha: 'd3ced1b',
      subject: 'ci: add optional REUSE-3.3 compliance lint alongside the SPDX gate',
      files: ['.github/workflows/ci.yml', 'REUSE.toml'],
    });
    const otlpCheckpointCommit = commit({
      sha: 'ce1aacf',
      subject: 'wip(autopilot): checkpoint — firing 110 died mid-unit; next firing resumes it',
      files: [
        'apps/dashboard/src/flight/otlp.ts',
        'apps/dashboard/test/flight/otlp.test.ts',
        'apps/dashboard/src/fly.ts',
      ],
    });

    const candidates = findReconciliationCandidates(
      [reuseLintTask, otlpTask],
      [reuseLintCommit, otlpCheckpointCommit],
    );

    expect(candidates).toHaveLength(2);
    expect(candidates.find((c) => c.taskId === 'ap-msksw1mf-4')).toMatchObject({
      commitSha: 'd3ced1b',
      matchedVia: 'subject',
    });
    expect(candidates.find((c) => c.taskId === 'ap-msksw1me-0')).toMatchObject({
      commitSha: 'ce1aacf',
      matchedVia: 'path',
    });
  });

  it('includes a commit whose score lands exactly on the threshold boundary (not just strictly above it)', () => {
    // 'fix bug' vs 'fix bug extra typo' scores exactly 0.5 (2 shared of 4
    // union tokens) — precisely DEFAULT_MATCH_THRESHOLD, proving the
    // boundary comparison is `< threshold`, not `<= threshold`.
    const boundaryTask = task({ title: 'fix bug' });
    const boundaryCommit = commit({ sha: 'bound001', subject: 'fix bug extra typo' });

    const candidates = findReconciliationCandidates([boundaryTask], [boundaryCommit]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.score).toBe(0.5);
  });

  it('keeps the strictly higher-scoring commit as best, regardless of which one is seen first', () => {
    const t = task({ title: 'Fix the widget renderer completely' });
    const strongCommit = commit({ sha: 'strong01', subject: 'fix: widget renderer completely' });
    const weakerCommit = commit({ sha: 'weaker01', subject: 'fix: widget renderer' });

    const strongFirst = findReconciliationCandidates([t], [strongCommit, weakerCommit]);
    expect(strongFirst[0]!.commitSha).toBe('strong01');

    const weakerFirst = findReconciliationCandidates([t], [weakerCommit, strongCommit]);
    expect(weakerFirst[0]!.commitSha).toBe('strong01');
  });

  it('keeps the first commit seen when two clear the threshold with an identical score', () => {
    // Same token set both times (case/punctuation differ only), so both
    // commits score exactly 1.0 against the task title — a genuine tie.
    const t = task({ title: 'Fix the widget renderer' });
    const first = commit({ sha: 'first001', subject: 'fix: the widget renderer' });
    const second = commit({ sha: 'second01', subject: 'FIX: THE WIDGET RENDERER!!' });

    const candidates = findReconciliationCandidates([t], [first, second]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.score).toBe(1);
    expect(candidates[0]!.commitSha).toBe('first001');
  });
});
