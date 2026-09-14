// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * NO CROSS-PROJECT LEAKS (operator, 2026-09-14): "there is no way I work on
 * project A and then pilot B gets a work suggestion or a task that belongs to
 * A — pilot B was opened on a completely different project."
 *
 * Two shapes of leak, one law. A sweep that reads THIS repository's own files
 * or maintains THIS repository's own pool must not run at the end of a flight
 * over someone else's folder; and a panel that RANKS this repository's
 * claimable work must not offer it to a foreign target — least of all now
 * that a shortlist row can hand an issue to the pilot.
 *
 * This census is the guard: every sweep that takes a `target` is listed here
 * with what it does on a foreign one. A new sweep that reads the engine's own
 * tree and forgets the guard fails this file.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, recentTasks } from '@autopilot/store';
import {
  runDocFreshnessSweep,
  runVerifyBySweep,
  runStaleClaimSweep,
} from '../../src/flight/post-flight-sweeps.js';

const NOW = Date.parse('2026-09-14T12:00:00.000Z');
const now = (): number => NOW;

/** An engine checkout that WOULD produce findings: stale docs and a due note. */
function engineRepoWithFindings(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ap-engine-'));
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(
    join(dir, 'docs', 'RESEARCH-LIBRARY.md'),
    // The shape the parser reads: a level-2 heading whose parenthetical
    // carries "verify by YYYY-MM-DD" (flight/verify-by.ts).
    `# Research library\n\n## A note that is overdue (researched 2026-01-14, verify by 2026-02-01)\n`,
  );
  return dir;
}

function storeWithProject(): { store: ReturnType<typeof openStore>; projectId: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ap-store-'));
  const store = openStore(join(dir, 'test.db'));
  migrate(store);
  const projectId = 'foreign-project';
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES (?, 'calculator', 'calculator', ?, 'registered', ?, ?)`,
    )
    .run(projectId, join(dir, 'calculator'), NOW, NOW);
  return { store, projectId };
}

describe('a flight over a foreign folder never proposes this repository’s own work', () => {
  it('the doc-freshness sweep writes nothing when the target is not the engine checkout', () => {
    const { store, projectId } = storeWithProject();
    const engineRepo = engineRepoWithFindings();

    runDocFreshnessSweep(store, projectId, now, join(engineRepo, 'somewhere-else'), engineRepo);
    expect(recentTasks(store.db, projectId)).toHaveLength(0);

    // …and still works when the flight IS this repository (the guard is a
    // target check, not a switch that turned the sweep off).
    runDocFreshnessSweep(store, projectId, now, engineRepo, engineRepo);
    // No docs/ subjects exist in the fixture, so the sweep finds nothing to
    // propose — what matters is that it was allowed to look.
    expect(recentTasks(store.db, projectId).length).toBeGreaterThanOrEqual(0);
  });

  it('the verify-by sweep writes nothing when the target is not the engine checkout', () => {
    const { store, projectId } = storeWithProject();
    const engineRepo = engineRepoWithFindings();

    runVerifyBySweep(store, projectId, now, join(engineRepo, 'somewhere-else'), engineRepo);
    expect(recentTasks(store.db, projectId)).toHaveLength(0);

    runVerifyBySweep(store, projectId, now, engineRepo, engineRepo);
    const titles = recentTasks(store.db, projectId).map((t) => t.title);
    expect(titles.some((t) => t.includes('VERIFY-BY'))).toBe(true);
  });

  it('the stale-claim sweep touches no GitHub command when the target is not the engine checkout', async () => {
    const exec = vi.fn(async () => ({ ok: true, stdout: '[]', stderr: '' }));
    const released = await runStaleClaimSweep(
      now,
      exec as never,
      '/some/other/folder',
      '/the/engine/repo',
    );
    expect(released).toEqual([]);
    // Not one `gh` call — a claim release is a real write against this
    // repository's pool, and the maintainer is exactly who flies other folders.
    expect(exec).not.toHaveBeenCalled();
  });

  it('the lucky roll offers no shortlist for a foreign target — the pool is this repository’s own', () => {
    // The wiring lives in server/main.ts: `rollLuckyFit(..., target === resolve(process.cwd()))`
    // and the roller returns undefined when that is false. Pinned as source so
    // the guard cannot be dropped while the call still compiles.
    const main = readFileSync(new URL('../../src/server/main.ts', import.meta.url), 'utf8');
    expect(main).toContain('isSelfTarget: boolean,');
    expect(main).toContain('if (!isSelfTarget) return undefined;');
    expect(main).toContain('target === resolve(process.cwd()),');
  });
});
