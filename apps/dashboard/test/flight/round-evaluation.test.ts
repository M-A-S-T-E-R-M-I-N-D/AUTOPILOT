// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE ROUND EVALUATES ITSELF (operator, 2026-09-27): the lane that ends a
 * round records its evaluation, and — when the project wants it — commits it
 * to docs/evaluations/ with the round.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore, migrate, type Store } from '@autopilot/store';
import {
  ROUND_EVALUATION_EVENT,
  appendRoundSection,
  claimRoundEvaluation,
  endRound,
  endingPids,
  recordLaneEnding,
  evaluationDocPath,
  gitIn,
  isEvaluationDocsOn,
  renderRoundSection,
  repoDocHeader,
  roundCommitHeader,
  roundHeadline,
  setEvaluationDocs,
  writeRoundEvaluation,
  type RoundSummary,
} from '../../src/flight/round-evaluation.js';

const SUMMARY: RoundSummary = {
  startedAt: Date.UTC(2026, 8, 27, 1, 0),
  endedAt: Date.UTC(2026, 8, 27, 3, 45),
  firings: 10,
  shipped: 9,
  costUsd: 19.62,
  costPerShipUsd: 2.18,
  convergenceGreen: 15,
  convergenceRed: 0,
};

describe('the round section', () => {
  it('heads with the numbers and keeps the report verbatim in a fenced block', () => {
    const section = renderRoundSection(
      SUMMARY,
      ['fleet report — p', '  all  10 firings'],
      ['model scoreboard'],
    );
    expect(section).toContain('## Round ending 2026-09-27 03:45 UTC');
    expect(section).toContain('9/10 shipped (90%), $2.18 per ship, 0 convergence red');
    expect(section).toMatch(
      /```text\nfleet report — p\n {2}all {2}10 firings\n\nmodel scoreboard\n```/,
    );
  });

  it('files each month in its own document, and keeps the commit header under 100', () => {
    expect(evaluationDocPath(SUMMARY.endedAt)).toBe('docs/evaluations/ROUNDS-2026-09.md');
    expect(roundCommitHeader(SUMMARY)).toBe(
      'docs(evaluation): a round of 10 firings on 2026-09-27, 9 shipped, $2.18 per ship',
    );
    expect(roundCommitHeader(SUMMARY).length).toBeLessThanOrEqual(100);
    // No clock time: commitlint's no-operator-private-context flags one.
    expect(roundCommitHeader(SUMMARY)).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    // …and the check itself would catch one.
    expect('round ending 03:45').toMatch(/\b\d{1,2}:\d{2}\b/);
    expect(roundHeadline({ ...SUMMARY, shipped: 0, costPerShipUsd: null })).toContain('- per ship');
  });

  it("creates the month once with the repo's OWN licence header, then appends", () => {
    const root = mkdtempSync(join(tmpdir(), 'ap-round-doc-'));
    try {
      // REUSE-IgnoreStart — another repo's header, as fixture data.
      const theirs =
        '<!--\nSPDX-FileCopyrightText: 2026 Someone Else\nSPDX-License-Identifier: MIT\n-->';
      // REUSE-IgnoreEnd
      mkdirSync(join(root, 'docs'), { recursive: true });
      writeFileSync(join(root, 'docs/README.md'), `${theirs}\n\n# Their docs\n`);
      const rel = appendRoundSection(root, SUMMARY.endedAt, '## one\n');
      appendRoundSection(root, SUMMARY.endedAt, '## two\n');
      const text = readFileSync(join(root, rel), 'utf8');
      expect(text.startsWith(theirs)).toBe(true);
      expect(text).not.toContain('MΔSTERMIND');
      expect(text.match(/# Round evaluations, 2026-09/g)).toHaveLength(1);
      expect(text.indexOf('## one')).toBeLessThan(text.indexOf('## two'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes no licence header at all into a repo whose docs carry none', () => {
    const root = mkdtempSync(join(tmpdir(), 'ap-round-doc-'));
    try {
      writeFileSync(join(root, 'README.md'), '# plain\n');
      expect(repoDocHeader(root)).toBeNull();
      const text = readFileSync(
        join(root, appendRoundSection(root, SUMMARY.endedAt, '## one\n')),
        'utf8',
      );
      expect(text.startsWith('# Round evaluations, 2026-09')).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('writing a round', () => {
  let dir: string;
  let repo: string;
  let store: Store;
  const git = (args: string[]): string =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-round-'));
    repo = mkdtempSync(join(tmpdir(), 'ap-round-repo-'));
    git(['init', '-q', '-b', 'autopilot/flight']);
    git(['config', 'user.email', 'test@example.invalid']);
    git(['config', 'user.name', 'test']);
    git(['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(repo, 'README.md'), 'x\n');
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'chore: start']);
    store = openStore(join(dir, 'db.sqlite'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', ?, 'flying', NULL, 1, 1)`,
      )
      .run(repo);
    const insert = store.db.prepare(
      `INSERT INTO metrics (project_id, firing_id, item, kind, sha, shipped, gate_result, cost_usd, duration_ms, turns, model, created_at)
       VALUES ('p1', ?, 't', 'feat', NULL, ?, 'passed', ?, 600000, 20, 'claude-opus-5-5', ?)`,
    );
    insert.run('p1:firing-1', 1, 3, SUMMARY.startedAt + 1000);
    insert.run('p1:firing-2', 0, 1, SUMMARY.startedAt + 2000);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  function run(out = vi.fn()): RoundSummary | null {
    return writeRoundEvaluation({
      store,
      projectId: 'p1',
      target: repo,
      startedAt: SUMMARY.startedAt,
      endedAt: SUMMARY.endedAt,
      git: gitIn(repo),
      out,
    });
  }

  function events(): { docPath: string | null; firings: number; shipped: number }[] {
    return (
      store.db.prepare('SELECT payload FROM events WHERE type = ?').all(ROUND_EVALUATION_EVENT) as {
        payload: string;
      }[]
    ).map(
      (r) => JSON.parse(r.payload) as { docPath: string | null; firings: number; shipped: number },
    );
  }

  it('always records the round as an event, and writes no doc while the project has not asked', () => {
    const summary = run();
    expect(summary).toMatchObject({ firings: 2, shipped: 1, costPerShipUsd: 4 });
    expect(events()).toEqual([expect.objectContaining({ firings: 2, shipped: 1, docPath: null })]);
    expect(git(['log', '--oneline'])).not.toContain('docs(evaluation)');
  });

  it('commits the evaluation with the round once evaluation docs are on', () => {
    expect(isEvaluationDocsOn(store, 'p1')).toBe(false);
    setEvaluationDocs(store, 'p1', true, 1);
    expect(isEvaluationDocsOn(store, 'p1')).toBe(true);
    run();
    const log = git(['log', '-1', '--format=%s%n%b']);
    expect(log).toContain(
      'docs(evaluation): a round of 2 firings on 2026-09-27, 1 shipped, $4.00 per ship',
    );
    expect(log).toContain('Signed-off-by:');
    const doc = readFileSync(join(repo, 'docs/evaluations/ROUNDS-2026-09.md'), 'utf8');
    expect(doc).toContain('1/2 shipped (50%)');
    expect(doc).toContain('model scoreboard');
    expect(git(['status', '--porcelain'])).toBe('');
    expect(events()[0]!.docPath).toBe('docs/evaluations/ROUNDS-2026-09.md');
  });

  it('never commits over uncommitted work — it says so and still records the round', () => {
    setEvaluationDocs(store, 'p1', true, 1);
    writeFileSync(join(repo, 'wip.txt'), 'someone is mid-edit\n');
    const out = vi.fn();
    run(out);
    expect(out).toHaveBeenCalledWith(expect.stringContaining('uncommitted changes'));
    expect(git(['log', '--oneline'])).not.toContain('docs(evaluation)');
    expect(events()).toEqual([expect.objectContaining({ docPath: null })]);
  });
});

describe('who ends the round (2026-09-27)', () => {
  let dir: string;
  let repo: string;
  let store: Store;
  const START = Date.UTC(2026, 8, 27, 4, 0);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-round-end-'));
    repo = mkdtempSync(join(tmpdir(), 'ap-round-end-repo-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    store = openStore(join(dir, 'db.sqlite'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', ?, 'flying', NULL, 1, 1)`,
      )
      .run(repo);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  });

  function lane(pid: number, siblings: () => readonly number[], clock = { t: START + 1000 }) {
    return () =>
      endRound({
        store,
        projectId: 'p1',
        target: repo,
        pid,
        startedAt: START,
        now: () => clock.t,
        siblingPids: siblings,
        git: vi.fn(() => ''),
        out: vi.fn(),
        sleep: async () => {
          clock.t += 5000;
        },
        waitMs: 60_000,
      });
  }

  function evaluations(): number {
    return (
      store.db
        .prepare('SELECT COUNT(*) c FROM events WHERE type = ?')
        .get(ROUND_EVALUATION_EVENT) as {
        c: number;
      }
    ).c;
  }

  it('round 23: two lanes ending seconds apart — exactly one of them evaluates', async () => {
    // Lane 1 starts ending while lane 2 still holds its lock and has not
    // said it is finishing; lane 2 then finishes and sees lane 1 finishing.
    const locks = new Set([1, 2]);
    const first = await lane(1, () => [...locks].filter((p) => p !== 1))();
    expect(first).toBe('siblings-still-flying');
    const second = await lane(2, () => {
      locks.delete(1); // lane 1 releases its lock while lane 2 waits
      return [...locks].filter((p) => p !== 2);
    })();
    expect(second).toBe('evaluated');
    expect(evaluations()).toBe(1);
  });

  it('two lanes that both see everyone finishing: the atomic claim picks one', async () => {
    recordLaneEnding(store, 'p1', 1, START + 10);
    recordLaneEnding(store, 'p1', 2, START + 10);
    const outcomes = await Promise.all([lane(1, () => [])(), lane(2, () => [])()]);
    expect(outcomes.sort()).toEqual(['claimed-by-another-lane', 'evaluated']);
    expect(evaluations()).toBe(1);
  });

  it('a lane that ends while a sibling is still firing leaves the round to it', async () => {
    expect(await lane(1, () => [2])()).toBe('siblings-still-flying');
    expect(evaluations()).toBe(0);
  });

  it('a lone flight ends its own round', async () => {
    expect(await lane(1, () => [])()).toBe('evaluated');
    expect(evaluations()).toBe(1);
  });

  it('claims one round only once, and the next round afresh', () => {
    expect(claimRoundEvaluation(store, 'p1', START, START + 1, 1)).toBe(true);
    expect(claimRoundEvaluation(store, 'p1', START, START + 2, 2)).toBe(false);
    const next = START + 3 * 60 * 60 * 1000;
    expect(claimRoundEvaluation(store, 'p1', next, next + 1, 3)).toBe(true);
    expect(endingPids(store, 'p1', START)).toEqual(new Set());
  });
});
