// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, createTask, type Store } from '@autopilot/store';
import {
  MAX_PROPOSALS,
  firingIdOf,
  type FiringOutcome,
  type GitVcs,
  type TaskProposal,
} from '@autopilot/engine';
import {
  readBacklogTitles,
  readInboxEntries,
  reconcileMidFlightStragglers,
  harvestProposals,
  activityTrail,
  markTaskDoneIfShipped,
} from '../../src/flight/firing-hooks.js';

function proposal(title: string, overrides: Partial<TaskProposal> = {}): TaskProposal {
  return {
    title,
    dimension: null,
    severity: null,
    invalidTags: false,
    fromBacklog: false,
    ...overrides,
  };
}

function outcomeWithProposals(proposals: readonly TaskProposal[]): FiringOutcome {
  return { record: { proposals } } as unknown as FiringOutcome;
}

function outcomeWithRecord(
  record: Partial<{
    shipped: boolean;
    item: string | null;
    completion: 'slice' | 'complete' | null;
    sha: string | null;
  }>,
): FiringOutcome {
  return {
    record: { shipped: false, item: null, completion: null, sha: null, ...record },
  } as unknown as FiringOutcome;
}

function fakeVcs(
  overrides: Partial<{ patch: string; existingFiles: readonly string[] }> = {},
): GitVcs {
  const { patch = '', existingFiles = [] } = overrides;
  const existing = new Set(existingFiles);
  return {
    head: async () => 'headsha',
    showPatch: async () => patch,
    fileExists: async (path: string) => existing.has(path),
  } as unknown as GitVcs;
}

describe('readBacklogTitles', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-firing-hooks-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns an empty list when no backlog path is configured', () => {
    expect(readBacklogTitles(dir, null)).toEqual([]);
  });

  it('returns an empty list when the configured backlog file does not exist', () => {
    expect(readBacklogTitles(dir, 'BACKLOG-999.md')).toEqual([]);
  });

  it('parses the real backlog file relative to the target root', () => {
    writeFileSync(
      join(dir, 'BACKLOG-999.md'),
      ['# Backlog', '- [ ] First open item', '- [x] Done item'].join('\n'),
    );
    expect(readBacklogTitles(dir, 'BACKLOG-999.md')).toEqual(['First open item', 'Done item']);
  });

  it('degrades to an empty list instead of throwing when the path is unreadable', () => {
    // A directory at the configured path exists (passes existsSync) but
    // readFileSync on it throws (EISDIR) — the catch branch's contract.
    mkdirSync(join(dir, 'BACKLOG-999.md'));
    expect(() => readBacklogTitles(dir, 'BACKLOG-999.md')).not.toThrow();
    expect(readBacklogTitles(dir, 'BACKLOG-999.md')).toEqual([]);
  });
});

describe('readInboxEntries', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-firing-hooks-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns an empty list when the INBOX folder does not exist', () => {
    expect(readInboxEntries(dir)).toEqual([]);
  });

  it('reads every dropped note with its content, sorted for deterministic ordering', () => {
    mkdirSync(join(dir, 'INBOX'));
    writeFileSync(join(dir, 'INBOX', 'b.md'), 'second note');
    writeFileSync(join(dir, 'INBOX', 'a.md'), 'first note');
    expect(readInboxEntries(dir)).toEqual([
      { name: 'a.md', content: 'first note' },
      { name: 'b.md', content: 'second note' },
    ]);
  });

  it('excludes the convention README and dotfiles, same as selectInboxFiles', () => {
    mkdirSync(join(dir, 'INBOX'));
    writeFileSync(join(dir, 'INBOX', 'README.md'), 'instructions, not a note');
    writeFileSync(join(dir, 'INBOX', '.gitkeep'), '');
    writeFileSync(join(dir, 'INBOX', 'note.md'), 'a real note');
    expect(readInboxEntries(dir)).toEqual([{ name: 'note.md', content: 'a real note' }]);
  });

  it('caps at 10 files even when more are dropped, keeping the first 10 in sorted order', () => {
    mkdirSync(join(dir, 'INBOX'));
    for (let i = 0; i < 15; i++) {
      const name = `note-${String(i).padStart(2, '0')}.md`;
      writeFileSync(join(dir, 'INBOX', name), name);
    }
    const entries = readInboxEntries(dir);
    expect(entries).toHaveLength(10);
    expect(entries.map((e) => e.name)).toEqual([
      'note-00.md',
      'note-01.md',
      'note-02.md',
      'note-03.md',
      'note-04.md',
      'note-05.md',
      'note-06.md',
      'note-07.md',
      'note-08.md',
      'note-09.md',
    ]);
  });

  it('ignores a subdirectory dropped into INBOX instead of treating it as a note', () => {
    mkdirSync(join(dir, 'INBOX'));
    mkdirSync(join(dir, 'INBOX', 'subdir'));
    writeFileSync(join(dir, 'INBOX', 'note.md'), 'a real note');
    expect(readInboxEntries(dir)).toEqual([{ name: 'note.md', content: 'a real note' }]);
  });
});

describe('reconcileMidFlightStragglers', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
  });

  function shipMetric(item: string): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, shipped, created_at)
         VALUES ('p1', ?, ?, 1, 1)`,
      )
      .run(`p1-${item}`, item);
  }

  it('closes a task shipped by a SIBLING flight since the last call — the mid-flight gap ap-mt3d6qvs-2 fixes', () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Shipped elsewhere', createdAt: 1 });
    createTask(store, { id: 'web-b', projectId: 'p1', title: 'Still open', createdAt: 1 });
    shipMetric('web-a');

    const closed = reconcileMidFlightStragglers(store, 'p1', 9);

    expect(closed).toEqual([{ id: 'web-a', title: 'Shipped elsewhere' }]);
    expect(
      (store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('web-a') as { status: string })
        .status,
    ).toBe('done');
    expect(
      (store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('web-b') as { status: string })
        .status,
    ).toBe('queued');
  });

  it('is a no-op the second time — safe to call after every firing', () => {
    createTask(store, { id: 'web-c', projectId: 'p1', title: 'Closed once', createdAt: 1 });
    shipMetric('web-c');

    expect(reconcileMidFlightStragglers(store, 'p1', 9)).toHaveLength(1);
    expect(reconcileMidFlightStragglers(store, 'p1', 10)).toEqual([]);
  });
});

describe('markTaskDoneIfShipped', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
  });

  function taskStatus(id: string): string {
    return (store.db.prepare('SELECT status FROM tasks WHERE id = ?').get(id) as { status: string })
      .status;
  }

  it('does nothing when the firing did not ship', async () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Some task', createdAt: 1 });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: false, item: 'web-a' }),
      fakeVcs(),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('queued');
  });

  it('does nothing when shipped but no item was self-reported', async () => {
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: null }),
      fakeVcs(),
    );
    expect(result).toBeUndefined();
  });

  it('does nothing when the reported item matches no open task on the board', async () => {
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-missing' }),
      fakeVcs(),
    );
    expect(result).toBeUndefined();
  });

  it('does not close a task that is already done — only queued/in_progress tasks match', async () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Already done', createdAt: 1 });
    store.db.prepare("UPDATE tasks SET status = 'done' WHERE id = ?").run('web-a');
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a' }),
      fakeVcs(),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('done');
  });

  it('leaves a partial-slice task open instead of closing it', async () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Big feature', createdAt: 1 });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'slice' }),
      fakeVcs(),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('queued');
  });

  it('closes a task with no completion tag and no verification markers (pre-existing behavior)', async () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Plain task', createdAt: 1 });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: null }),
      fakeVcs(),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('done');
  });

  it('closes a "complete" task with no sha without running any verification', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'DELIVERABLE: adds a retry button',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: null }),
      fakeVcs({ patch: '' }),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('done');
  });

  it('closes a "complete" task with no DELIVERABLE/EPIC-SPEC/ADR markers in the title', async () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Fix the flaky test', createdAt: 1 });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs(),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('done');
  });

  it('closes a DELIVERABLE-carrying task whose shipping patch mentions the claimed vocabulary', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'Sync worker retries. DELIVERABLE: adds retry backoff to the sync worker',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs({ patch: 'diff --git a/src/sync-worker.ts\n+ added retry backoff logic' }),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('done');
  });

  it('demotes a DELIVERABLE claim whose vocabulary is absent from the shipping patch', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'DELIVERABLE: adds retry backoff to the sync worker',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs({ patch: 'diff --git a/src/unrelated.ts\n+ totally unrelated change' }),
    );
    expect(result).toContain('DELIVERABLE verifier found no trace of the claim');
    expect(taskStatus('web-a')).toBe('queued');
  });

  it('demotes a UX-promising DELIVERABLE whose patch never touches a web/ or docs/ surface', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'DELIVERABLE: renders a new retry button in the settings panel',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs({
        patch:
          'diff --git a/apps/dashboard/src/server/retry-button.ts b/apps/dashboard/src/server/retry-button.ts\n+ added a retry button panel',
      }),
    );
    expect(result).toContain('UX-EXPRESSION DOCTRINE');
    expect(taskStatus('web-a')).toBe('queued');
  });

  it('closes a UX-promising DELIVERABLE whose patch does touch a web/ surface', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'DELIVERABLE: renders a new retry button in the settings panel',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs({
        patch:
          'diff --git a/apps/dashboard/src/web/retry-button.ts b/apps/dashboard/src/web/retry-button.ts\n+ added a retry button panel',
      }),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('done');
  });

  it('demotes an EPIC-SPEC claim whose linked spec was never committed', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'EPIC-SPEC: docs/epics/9999-missing.md',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs({ existingFiles: [] }),
    );
    expect(result).toContain("EPIC SPEC convention: linked spec 'docs/epics/9999-missing.md'");
    expect(taskStatus('web-a')).toBe('queued');
  });

  it('closes an EPIC-SPEC claim whose linked spec is actually committed', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'EPIC-SPEC: docs/epics/0099-real.md',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs({ existingFiles: ['docs/epics/0099-real.md'] }),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('done');
  });

  it('demotes an ADR claim whose linked record was never committed', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'ADR: docs/adr/9999-missing.md',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs({ existingFiles: [] }),
    );
    expect(result).toContain("ADR convention: linked record 'docs/adr/9999-missing.md'");
    expect(taskStatus('web-a')).toBe('queued');
  });

  it('closes an ADR claim whose linked record is actually committed', async () => {
    createTask(store, {
      id: 'web-a',
      projectId: 'p1',
      title: 'ADR: docs/adr/0099-real.md',
      createdAt: 1,
    });
    const result = await markTaskDoneIfShipped(
      store,
      'p1',
      outcomeWithRecord({ shipped: true, item: 'web-a', completion: 'complete', sha: 'abc123' }),
      fakeVcs({ existingFiles: ['docs/adr/0099-real.md'] }),
    );
    expect(result).toBeUndefined();
    expect(taskStatus('web-a')).toBe('done');
  });
});

describe('harvestProposals', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
  });

  function taskTitles(): string[] {
    return (
      store.db.prepare('SELECT title FROM tasks WHERE project_id = ?').all('p1') as {
        title: string;
      }[]
    ).map((r) => r.title);
  }

  it('creates a needs_approval task per proposal and returns the advanced running total', () => {
    const outcome = outcomeWithProposals([proposal('Add a widget'), proposal('Fix a bug')]);

    const total = harvestProposals(store, 'p1', outcome, new Set(), 0);

    expect(total).toBe(2);
    expect(taskTitles().sort()).toEqual(['Add a widget', 'Fix a bug']);
    expect(
      (
        store.db.prepare('SELECT status FROM tasks WHERE title = ?').get('Add a widget') as {
          status: string;
        }
      ).status,
    ).toBe('needs_approval');
  });

  it('skips a proposal whose title already exists, case-insensitively', () => {
    const existingTitles = new Set(['add a widget']);
    const outcome = outcomeWithProposals([proposal('Add A Widget'), proposal('Fresh idea')]);

    const total = harvestProposals(store, 'p1', outcome, existingTitles, 0);

    expect(total).toBe(1);
    expect(taskTitles()).toEqual(['Fresh idea']);
  });

  it('skips a blank/whitespace-only title without consuming the running total', () => {
    const outcome = outcomeWithProposals([proposal('   '), proposal('Real proposal')]);

    const total = harvestProposals(store, 'p1', outcome, new Set(), 0);

    expect(total).toBe(1);
    expect(taskTitles()).toEqual(['Real proposal']);
  });

  it('stops creating once the running total reaches MAX_PROPOSALS, ignoring the rest', () => {
    const outcome = outcomeWithProposals([proposal('Over the cap'), proposal('Also over')]);

    const total = harvestProposals(store, 'p1', outcome, new Set(), MAX_PROPOSALS);

    expect(total).toBe(MAX_PROPOSALS);
    expect(taskTitles()).toEqual([]);
  });

  it('adds each newly created title to existingTitles so a later call in the same firing sees it', () => {
    const existingTitles = new Set<string>();
    const outcome = outcomeWithProposals([proposal('Dup me'), proposal('Dup me')]);

    const total = harvestProposals(store, 'p1', outcome, existingTitles, 0);

    expect(total).toBe(1);
    expect(taskTitles()).toEqual(['Dup me']);
    expect(existingTitles.has('dup me')).toBe(true);
  });
});

describe('activityTrail', () => {
  let store: Store;

  beforeEach(() => {
    store = openStore(':memory:');
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
         VALUES ('p1', 'p1', 'p1', '/tmp/p1', 'flying', 1, 1)`,
      )
      .run();
  });

  function activity(tool: string, target: string, at: number): void {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, 'activity', ?, ?)`,
      )
      .run('p1', firingIdOf('p1', 1), JSON.stringify({ tool, target }), at);
  }

  it('keeps a re-touched step at its FRESHEST position, not its first occurrence', () => {
    // "foo.ts" is read early (stale) then re-read again as the very last
    // action before the firing died (freshest). 12 other unique steps happen
    // in between — enough to push a first-occurrence-ordered "foo.ts" entry
    // out of the trailing TRAIL_MAX_LINES(12) window entirely.
    activity('Read', 'foo.ts', 1);
    for (let i = 0; i < 12; i += 1) activity('Read', `filler${i}.ts`, i + 2);
    activity('Read', 'foo.ts', 999);

    expect(activityTrail(store, 'p1', 1)).toContain('- Read foo.ts');
  });

  it('skips malformed payloads and rows missing a string tool/target', () => {
    store.db
      .prepare(
        `INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, 'activity', ?, ?)`,
      )
      .run('p1', firingIdOf('p1', 1), 'not json', 1);
    activity('Read', 'ok.ts', 2);

    expect(activityTrail(store, 'p1', 1)).toBe('- Read ok.ts');
  });
});
