// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openStore, migrate, recentTasks, type Store } from '../src/index.js';
import {
  deleteProject,
  resetProjectTelemetry,
  requestFlightPause,
  isProjectPaused,
  markSoulReviewed,
  proposeSoulAmendment,
  ratifySoulAmendment,
  dismissSoulProposal,
  unratifySoulAmendment,
  createTask,
  deleteTask,
  setTaskStatus,
  setTaskFocus,
  reorderTasks,
  unpinTasks,
  reconcileShippedTasks,
  demoteMetricsCompletion,
  claimTask,
  releaseTaskClaim,
  releaseInstanceClaims,
  releaseStaleClaims,
} from '../src/mutate.js';
import { SqliteSearchStore } from '../src/search.js';
import { openVectorStore, EMBEDDING_DIM } from '../src/vector.js';

let store: Store;

function seedProject(id: string): void {
  store.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', 1, 1)`,
    )
    .run(id, id, id, `/tmp/${id}`);
  store.db
    .prepare(`INSERT INTO events (project_id, type, created_at) VALUES (?, 'firing', 1)`)
    .run(id);
  store.db
    .prepare(`INSERT INTO metrics (project_id, firing_id, shipped, created_at) VALUES (?, ?, 1, 1)`)
    .run(id, `${id}-f1`);
  new SqliteSearchStore(store).indexDocument(id, 'src/a.ts', 'export const a = 1;', 'ts');
}

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
});
afterEach(() => store.close());

describe('resetProjectTelemetry', () => {
  it('clears metrics + firing/activity events but KEEPS the project, tasks, and index', () => {
    seedProject('p1');
    store.db
      .prepare(`INSERT INTO events (project_id, type, created_at) VALUES ('p1', 'activity', 2)`)
      .run();
    createTask(store, { id: 't1', projectId: 'p1', title: 'keep me', createdAt: 3 });

    expect(resetProjectTelemetry(store, 'p1')).toBe(true);

    const metrics = store.db
      .prepare(`SELECT COUNT(*) AS c FROM metrics WHERE project_id = 'p1'`)
      .get() as { c: number };
    const events = store.db
      .prepare(`SELECT COUNT(*) AS c FROM events WHERE project_id = 'p1'`)
      .get() as { c: number };
    expect(metrics.c).toBe(0);
    expect(events.c).toBe(0);
    // The project itself, its board, and its search index survive untouched.
    expect(store.db.prepare(`SELECT id FROM projects WHERE id = 'p1'`).get()).toBeTruthy();
    expect(recentTasks(store.db, 'p1')).toHaveLength(1);
    expect(new SqliteSearchStore(store).documentCount('p1')).toBe(1);
  });

  it('restarts firing numbering at 1 — the "fresh round" this promises (regression: firing_seq outlived the reset)', () => {
    // Before migration v22 the next firing number was COUNT(*) + 1 over
    // metrics, so wiping metrics restarted numbering implicitly. v22 moved
    // allocation to the durable `firing_seq` table to stop concurrent lanes
    // racing the same number — but this reset never learned about it, so a
    // project that "started over" after 40 firings kept counting at 41,
    // silently breaking the 0/0 fresh-round contract stated above.
    seedProject('p1');
    store.db.prepare(`INSERT INTO firing_seq (project_id, n) VALUES ('p1', 40)`).run();

    expect(resetProjectTelemetry(store, 'p1')).toBe(true);

    const seq = store.db
      .prepare(`SELECT COUNT(*) AS c FROM firing_seq WHERE project_id = 'p1'`)
      .get() as { c: number };
    expect(seq.c).toBe(0); // next reserve starts the sequence over at 1
  });

  it('leaves ANOTHER project’s firing sequence alone', () => {
    seedProject('p1');
    seedProject('p2');
    store.db.prepare(`INSERT INTO firing_seq (project_id, n) VALUES ('p1', 7)`).run();
    store.db.prepare(`INSERT INTO firing_seq (project_id, n) VALUES ('p2', 9)`).run();

    resetProjectTelemetry(store, 'p1');

    const other = store.db.prepare(`SELECT n FROM firing_seq WHERE project_id = 'p2'`).get() as {
      n: number;
    };
    expect(other.n).toBe(9);
  });

  it('returns false for a missing project (nothing to reset)', () => {
    expect(resetProjectTelemetry(store, 'ghost')).toBe(false);
  });
});

describe('requestFlightPause / isProjectPaused', () => {
  it('sets pause_requested for the project at that root path, keyed by path not id', () => {
    seedProject('p1');

    expect(requestFlightPause(store, '/tmp/p1')).toBe(true);

    const row = store.db.prepare('SELECT pause_requested FROM projects WHERE id = ?').get('p1') as {
      pause_requested: number;
    };
    expect(row.pause_requested).toBe(1);
  });

  it('returns false for a root path with no matching project', () => {
    expect(requestFlightPause(store, '/tmp/ghost')).toBe(false);
  });

  it('isProjectPaused reflects status, not the transient pause_requested flag', () => {
    seedProject('p1');
    requestFlightPause(store, '/tmp/p1');
    // A pause was REQUESTED, but the flight hasn't honored it yet (still 'flying').
    expect(isProjectPaused(store, '/tmp/p1')).toBe(false);

    store.db.prepare("UPDATE projects SET status = 'paused' WHERE id = 'p1'").run();
    expect(isProjectPaused(store, '/tmp/p1')).toBe(true);
  });

  it('isProjectPaused is false for a root path with no matching project', () => {
    expect(isProjectPaused(store, '/tmp/ghost')).toBe(false);
  });
});

describe('markSoulReviewed', () => {
  it('starts unreviewed (schema default) and flips to reviewed once ratified', () => {
    seedProject('p1');
    const before = store.db
      .prepare('SELECT soul_reviewed FROM projects WHERE id = ?')
      .get('p1') as {
      soul_reviewed: number;
    };
    expect(before.soul_reviewed).toBe(0);

    expect(markSoulReviewed(store, 'p1', 5)).toBe(true);

    const after = store.db
      .prepare('SELECT soul_reviewed, updated_at FROM projects WHERE id = ?')
      .get('p1') as { soul_reviewed: number; updated_at: number };
    expect(after).toEqual({ soul_reviewed: 1, updated_at: 5 });
  });

  it('returns false for an unknown project', () => {
    expect(markSoulReviewed(store, 'ghost', 1)).toBe(false);
  });
});

describe('proposeSoulAmendment / ratifySoulAmendment / dismissSoulProposal / unratifySoulAmendment', () => {
  it('records a pending proposal without touching the live soul or reviewed flag', () => {
    seedProject('p1');
    store.db
      .prepare("UPDATE projects SET soul = 'old soul', soul_reviewed = 1 WHERE id = 'p1'")
      .run();

    expect(proposeSoulAmendment(store, 'p1', 'new soul text', 5)).toBe(true);

    const row = store.db
      .prepare(
        'SELECT soul, soul_reviewed, soul_proposed, soul_proposed_at FROM projects WHERE id = ?',
      )
      .get('p1') as {
      soul: string;
      soul_reviewed: number;
      soul_proposed: string;
      soul_proposed_at: number;
    };
    expect(row).toEqual({
      soul: 'old soul',
      soul_reviewed: 1,
      soul_proposed: 'new soul text',
      soul_proposed_at: 5,
    });
  });

  it('rejects a blank proposal and an unknown project', () => {
    seedProject('p1');
    expect(proposeSoulAmendment(store, 'p1', '   ', 5)).toBe(false);
    expect(proposeSoulAmendment(store, 'ghost', 'text', 5)).toBe(false);
  });

  it('a later proposal supersedes an earlier unresolved one', () => {
    seedProject('p1');
    proposeSoulAmendment(store, 'p1', 'first draft', 5);
    proposeSoulAmendment(store, 'p1', 'second draft', 6);

    const row = store.db.prepare('SELECT soul_proposed FROM projects WHERE id = ?').get('p1') as {
      soul_proposed: string;
    };
    expect(row.soul_proposed).toBe('second draft');
  });

  it('ratifySoulAmendment applies the pending text, marks reviewed, clears the slot, and snapshots the old text', () => {
    seedProject('p1');
    store.db.prepare("UPDATE projects SET soul = 'old soul' WHERE id = 'p1'").run();
    proposeSoulAmendment(store, 'p1', 'new soul text', 5);

    expect(ratifySoulAmendment(store, 'p1', 10)).toBe(true);

    const row = store.db
      .prepare(
        `SELECT soul, soul_reviewed, soul_proposed, soul_proposed_at, soul_previous,
                soul_previous_at, updated_at
           FROM projects WHERE id = ?`,
      )
      .get('p1') as {
      soul: string;
      soul_reviewed: number;
      soul_proposed: string | null;
      soul_proposed_at: number | null;
      soul_previous: string | null;
      soul_previous_at: number | null;
      updated_at: number;
    };
    expect(row).toEqual({
      soul: 'new soul text',
      soul_reviewed: 1,
      soul_proposed: null,
      soul_proposed_at: null,
      soul_previous: 'old soul',
      soul_previous_at: 10,
      updated_at: 10,
    });
  });

  it('ratifySoulAmendment is a no-op when nothing is pending', () => {
    seedProject('p1');
    expect(ratifySoulAmendment(store, 'p1', 10)).toBe(false);
  });

  it('dismissSoulProposal clears the pending slot without touching soul or reviewed', () => {
    seedProject('p1');
    store.db.prepare("UPDATE projects SET soul = 'old soul' WHERE id = 'p1'").run();
    proposeSoulAmendment(store, 'p1', 'new soul text', 5);

    expect(dismissSoulProposal(store, 'p1', 10)).toBe(true);

    const row = store.db
      .prepare(
        'SELECT soul, soul_reviewed, soul_proposed, soul_proposed_at FROM projects WHERE id = ?',
      )
      .get('p1') as {
      soul: string;
      soul_reviewed: number;
      soul_proposed: string | null;
      soul_proposed_at: number | null;
    };
    expect(row).toEqual({
      soul: 'old soul',
      soul_reviewed: 0,
      soul_proposed: null,
      soul_proposed_at: null,
    });
  });

  it('dismissSoulProposal is a no-op when nothing is pending', () => {
    seedProject('p1');
    expect(dismissSoulProposal(store, 'p1', 10)).toBe(false);
  });

  it("ratifySoulAmendment records an 'approved' evaluation label", () => {
    seedProject('p1');
    proposeSoulAmendment(store, 'p1', 'new soul text', 5);
    expect(ratifySoulAmendment(store, 'p1', 10)).toBe(true);
    const rows = store.db
      .prepare(`SELECT payload FROM events WHERE project_id = 'p1' AND type = 'evaluation-label'`)
      .all() as { payload: string }[];
    expect(rows.map((r) => JSON.parse(r.payload))).toEqual([
      { verdict: 'approved', taskId: 'soul:p1', title: 'SOUL proposal' },
    ]);
  });

  it("dismissSoulProposal records a 'rejected' evaluation label", () => {
    seedProject('p1');
    proposeSoulAmendment(store, 'p1', 'new soul text', 5);
    expect(dismissSoulProposal(store, 'p1', 10)).toBe(true);
    const rows = store.db
      .prepare(`SELECT payload FROM events WHERE project_id = 'p1' AND type = 'evaluation-label'`)
      .all() as { payload: string }[];
    expect(rows.map((r) => JSON.parse(r.payload))).toEqual([
      { verdict: 'rejected', taskId: 'soul:p1', title: 'SOUL proposal' },
    ]);
  });

  it('a no-op ratify/dismiss (nothing pending) records no evaluation label', () => {
    seedProject('p1');
    expect(ratifySoulAmendment(store, 'p1', 10)).toBe(false);
    expect(dismissSoulProposal(store, 'p1', 10)).toBe(false);
    const rows = store.db
      .prepare(`SELECT payload FROM events WHERE project_id = 'p1' AND type = 'evaluation-label'`)
      .all();
    expect(rows).toEqual([]);
  });

  it('unratifySoulAmendment restores the pre-ratify soul text and clears the snapshot', () => {
    seedProject('p1');
    store.db.prepare("UPDATE projects SET soul = 'old soul' WHERE id = 'p1'").run();
    proposeSoulAmendment(store, 'p1', 'new soul text', 5);
    ratifySoulAmendment(store, 'p1', 10);

    expect(unratifySoulAmendment(store, 'p1', 20)).toBe(true);

    const row = store.db
      .prepare(
        'SELECT soul, soul_previous, soul_previous_at, updated_at FROM projects WHERE id = ?',
      )
      .get('p1') as {
      soul: string;
      soul_previous: string | null;
      soul_previous_at: number | null;
      updated_at: number;
    };
    expect(row).toEqual({
      soul: 'old soul',
      soul_previous: null,
      soul_previous_at: null,
      updated_at: 20,
    });
  });

  it('unratifySoulAmendment is a no-op when there is nothing to undo (never ratified, or already undone)', () => {
    seedProject('p1');
    expect(unratifySoulAmendment(store, 'p1', 10)).toBe(false);

    proposeSoulAmendment(store, 'p1', 'new soul text', 5);
    ratifySoulAmendment(store, 'p1', 10);
    expect(unratifySoulAmendment(store, 'p1', 20)).toBe(true);
    expect(unratifySoulAmendment(store, 'p1', 30)).toBe(false);
  });

  it("unratifySoulAmendment records a 'rejected' evaluation label, reversing ratify's 'approved' one", () => {
    seedProject('p1');
    proposeSoulAmendment(store, 'p1', 'new soul text', 5);
    ratifySoulAmendment(store, 'p1', 10);
    expect(unratifySoulAmendment(store, 'p1', 20)).toBe(true);

    const rows = store.db
      .prepare(`SELECT payload FROM events WHERE project_id = 'p1' AND type = 'evaluation-label'`)
      .all() as { payload: string }[];
    expect(rows.map((r) => JSON.parse(r.payload))).toEqual([
      { verdict: 'approved', taskId: 'soul:p1', title: 'SOUL proposal' },
      { verdict: 'rejected', taskId: 'soul:p1', title: 'SOUL proposal' },
    ]);
  });
});

describe('createTask source', () => {
  it("defaults to 'dashboard' and accepts 'self' for autopilot-proposed tasks", () => {
    seedProject('p1');
    expect(
      createTask(store, { id: 'h1', projectId: 'p1', title: 'human task', createdAt: 1 }),
    ).toBe(true);
    expect(
      createTask(store, {
        id: 'a1',
        projectId: 'p1',
        title: 'proposed: add rate limiting',
        source: 'self',
        createdAt: 2,
      }),
    ).toBe(true);
    const rows = store.db
      .prepare(`SELECT id, source FROM tasks WHERE id IN ('h1','a1') ORDER BY id`)
      .all() as { id: string; source: string }[];
    expect(rows).toEqual([
      { id: 'a1', source: 'self' },
      { id: 'h1', source: 'dashboard' },
    ]);
  });

  it("accepts 'github' for a task the KEEPER triage ritual accepted from an upstream issue", () => {
    seedProject('p1');
    expect(
      createTask(store, {
        id: 'github-42',
        projectId: 'p1',
        title: 'accepted from issue #42',
        source: 'github',
        createdAt: 1,
      }),
    ).toBe(true);
    const row = store.db.prepare(`SELECT source FROM tasks WHERE id = 'github-42'`).get() as {
      source: string;
    };
    expect(row.source).toBe('github');
  });
});

describe('deleteTask + needs_approval', () => {
  it('creates a PROPOSED task as needs_approval, approves to queued, or deletes it', () => {
    seedProject('p1');
    expect(
      createTask(store, {
        id: 'prop-1',
        projectId: 'p1',
        title: 'proposed work',
        source: 'self',
        status: 'needs_approval',
        createdAt: 1,
      }),
    ).toBe(true);
    const row = store.db.prepare(`SELECT status FROM tasks WHERE id = 'prop-1'`).get() as {
      status: string;
    };
    expect(row.status).toBe('needs_approval');

    // Approve: back to the workable queue.
    expect(setTaskStatus(store, 'prop-1', 'queued', 2)).toBe(true);
    // Reject/remove: gone entirely.
    expect(deleteTask(store, 'prop-1')).toBe(true);
    expect(store.db.prepare(`SELECT 1 FROM tasks WHERE id = 'prop-1'`).get()).toBeUndefined();
    expect(deleteTask(store, 'prop-1')).toBe(false); // already gone
  });
});

describe('APPROVED-VERDICT CASCADE (board web-mt5g8l1w-p2dddo)', () => {
  it('approving a "VERDICT close" proposal retires it and closes the tasks it names', () => {
    seedProject('p1');
    createTask(store, { id: 'web-aaa-1', projectId: 'p1', title: 'stale idea', createdAt: 1 });
    createTask(store, { id: 'web-bbb-2', projectId: 'p1', title: 'dup idea', createdAt: 1 });
    setTaskStatus(store, 'web-aaa-1', 'deferred', 1);
    setTaskStatus(store, 'web-bbb-2', 'deferred', 1);
    createTask(store, {
      id: 'ap-verdict-1',
      projectId: 'p1',
      title: 'VERDICT close web-aaa-1, web-bbb-2: both superseded by the new onboarding flow',
      source: 'self',
      status: 'needs_approval',
      createdAt: 1,
    });

    expect(setTaskStatus(store, 'ap-verdict-1', 'queued', 2)).toBe(true);

    const rows = store.db
      .prepare(`SELECT id, status FROM tasks WHERE project_id = 'p1' ORDER BY id`)
      .all() as { id: string; status: string }[];
    expect(rows).toEqual([
      { id: 'ap-verdict-1', status: 'done' }, // retired, never queued as work
      { id: 'web-aaa-1', status: 'done' },
      { id: 'web-bbb-2', status: 'done' },
    ]);
  });

  it('cascades onto every id shape the board mints (ap-, inbox-, github-), not just web-', () => {
    // Mirrors flight/completion.ts's widened VERDICT_TASK_ID_RE (board
    // web-mtettjx9-57a9i5, part b): approval-time cascade and proposal-time
    // defer must agree on what a verdict NAMES, and verdicts do name
    // self-proposed (ap-), inbox-triaged and issue-triaged (github-) tasks.
    seedProject('p1');
    createTask(store, { id: 'ap-mss1abc-0', projectId: 'p1', title: 'self idea', createdAt: 1 });
    createTask(store, { id: 'inbox-old-note-md', projectId: 'p1', title: 'note', createdAt: 1 });
    createTask(store, { id: 'github-42', projectId: 'p1', title: 'issue idea', createdAt: 1 });
    createTask(store, {
      id: 'ap-verdict-1',
      projectId: 'p1',
      title: 'VERDICT close ap-mss1abc-0, inbox-old-note-md, github-42: all superseded',
      source: 'self',
      status: 'needs_approval',
      createdAt: 1,
    });

    expect(setTaskStatus(store, 'ap-verdict-1', 'queued', 2)).toBe(true);

    const rows = store.db
      .prepare(`SELECT id, status FROM tasks WHERE project_id = 'p1' ORDER BY id`)
      .all() as { id: string; status: string }[];
    expect(rows).toEqual([
      { id: 'ap-mss1abc-0', status: 'done' },
      { id: 'ap-verdict-1', status: 'done' },
      { id: 'github-42', status: 'done' },
      { id: 'inbox-old-note-md', status: 'done' },
    ]);
  });

  it('still records an approved evaluation label for a cascaded VERDICT close', () => {
    seedProject('p1');
    createTask(store, { id: 'web-aaa-1', projectId: 'p1', title: 'stale idea', createdAt: 1 });
    createTask(store, {
      id: 'ap-verdict-1',
      projectId: 'p1',
      title: 'VERDICT close web-aaa-1: superseded',
      source: 'self',
      status: 'needs_approval',
      createdAt: 1,
    });

    expect(setTaskStatus(store, 'ap-verdict-1', 'queued', 2)).toBe(true);

    const labels = store.db
      .prepare(
        `SELECT payload FROM events WHERE project_id = 'p1' AND type = 'evaluation-label' ORDER BY id`,
      )
      .all() as { payload: string }[];
    expect(labels.map((r) => JSON.parse(r.payload))).toEqual([
      { verdict: 'approved', taskId: 'ap-verdict-1', title: 'VERDICT close web-aaa-1: superseded' },
    ]);
  });

  it('does not cascade a "VERDICT blocked" proposal — approving it just queues normally', () => {
    seedProject('p1');
    createTask(store, { id: 'web-aaa-1', projectId: 'p1', title: 'landing risk', createdAt: 1 });
    setTaskStatus(store, 'web-aaa-1', 'deferred', 1);
    createTask(store, {
      id: 'ap-verdict-1',
      projectId: 'p1',
      title: 'VERDICT blocked web-aaa-1: needs a human to re-capture baselines',
      source: 'self',
      status: 'needs_approval',
      createdAt: 1,
    });

    expect(setTaskStatus(store, 'ap-verdict-1', 'queued', 2)).toBe(true);

    expect(
      (
        store.db.prepare(`SELECT status FROM tasks WHERE id = 'ap-verdict-1'`).get() as {
          status: string;
        }
      ).status,
    ).toBe('queued');
    expect(
      (
        store.db.prepare(`SELECT status FROM tasks WHERE id = 'web-aaa-1'`).get() as {
          status: string;
        }
      ).status,
    ).toBe('deferred'); // untouched — only "close" cascades
  });

  it('never resurrects a named task that is already done', () => {
    seedProject('p1');
    createTask(store, { id: 'web-aaa-1', projectId: 'p1', title: 'already fixed', createdAt: 1 });
    setTaskStatus(store, 'web-aaa-1', 'done', 1);
    createTask(store, {
      id: 'ap-verdict-1',
      projectId: 'p1',
      title: 'VERDICT close web-aaa-1: already shipped elsewhere',
      source: 'self',
      status: 'needs_approval',
      createdAt: 1,
    });
    const before = store.db
      .prepare(`SELECT updated_at FROM tasks WHERE id = 'web-aaa-1'`)
      .get() as { updated_at: number };

    expect(setTaskStatus(store, 'ap-verdict-1', 'queued', 99)).toBe(true);

    const after = store.db
      .prepare(`SELECT status, updated_at FROM tasks WHERE id = 'web-aaa-1'`)
      .get() as { status: string; updated_at: number };
    expect(after.status).toBe('done');
    expect(after.updated_at).toBe(before.updated_at); // untouched, not re-written
  });

  it('a human-authored task titled like a verdict never cascades (source must be self)', () => {
    seedProject('p1');
    createTask(store, { id: 'web-aaa-1', projectId: 'p1', title: 'unrelated task', createdAt: 1 });
    createTask(store, {
      id: 'human-verdict',
      projectId: 'p1',
      title: 'VERDICT close web-aaa-1: operator typed this by hand',
      status: 'needs_approval',
      createdAt: 1,
    });

    expect(setTaskStatus(store, 'human-verdict', 'queued', 2)).toBe(true);

    expect(
      (
        store.db.prepare(`SELECT status FROM tasks WHERE id = 'human-verdict'`).get() as {
          status: string;
        }
      ).status,
    ).toBe('queued');
    expect(
      (
        store.db.prepare(`SELECT status FROM tasks WHERE id = 'web-aaa-1'`).get() as {
          status: string;
        }
      ).status,
    ).toBe('queued'); // untouched
  });

  it('a "VERDICT close" proposal that names no task ids retires itself and touches nothing else', () => {
    seedProject('p1');
    createTask(store, { id: 'web-aaa-1', projectId: 'p1', title: 'unrelated task', createdAt: 1 });
    createTask(store, {
      id: 'ap-verdict-1',
      projectId: 'p1',
      title: 'VERDICT close: the whole idea is moot, nothing left to name',
      source: 'self',
      status: 'needs_approval',
      createdAt: 1,
    });

    expect(setTaskStatus(store, 'ap-verdict-1', 'queued', 2)).toBe(true);

    const rows = store.db
      .prepare(`SELECT id, status FROM tasks WHERE project_id = 'p1' ORDER BY id`)
      .all() as { id: string; status: string }[];
    expect(rows).toEqual([
      { id: 'ap-verdict-1', status: 'done' }, // retired, never queued as work
      { id: 'web-aaa-1', status: 'queued' }, // untouched — no id named in the title
    ]);
  });
});

describe('evaluation-label capture (human-vs-agent self-study slice)', () => {
  function labelEvents(projectId: string): { verdict: string; taskId: string; title: string }[] {
    const rows = store.db
      .prepare(
        `SELECT payload FROM events WHERE project_id = ? AND type = 'evaluation-label' ORDER BY id`,
      )
      .all(projectId) as { payload: string }[];
    return rows.map((r) => JSON.parse(r.payload));
  }

  it("approving a self-proposed task (needs_approval -> queued) records an 'approved' label", () => {
    seedProject('p1');
    createTask(store, {
      id: 'prop-1',
      projectId: 'p1',
      title: 'proposed work',
      source: 'self',
      status: 'needs_approval',
      createdAt: 1,
    });
    expect(setTaskStatus(store, 'prop-1', 'queued', 2)).toBe(true);
    expect(labelEvents('p1')).toEqual([
      { verdict: 'approved', taskId: 'prop-1', title: 'proposed work' },
    ]);
  });

  it("deleting a self-proposed task records a 'rejected' label", () => {
    seedProject('p1');
    createTask(store, {
      id: 'prop-2',
      projectId: 'p1',
      title: 'a worse proposal',
      source: 'self',
      status: 'needs_approval',
      createdAt: 1,
    });
    expect(deleteTask(store, 'prop-2', 5)).toBe(true);
    expect(labelEvents('p1')).toEqual([
      { verdict: 'rejected', taskId: 'prop-2', title: 'a worse proposal' },
    ]);
  });

  it('does not label a human-authored task on approve-shaped status changes or delete', () => {
    seedProject('p1');
    createTask(store, { id: 'human-1', projectId: 'p1', title: 'human task', createdAt: 1 });
    expect(setTaskStatus(store, 'human-1', 'queued', 2)).toBe(true);
    expect(deleteTask(store, 'human-1', 5)).toBe(true);
    expect(labelEvents('p1')).toEqual([]);
  });

  it('does not label a self-proposed task moving between non-approve statuses', () => {
    seedProject('p1');
    createTask(store, {
      id: 'prop-3',
      projectId: 'p1',
      title: 'in flight already',
      source: 'self',
      status: 'queued',
      createdAt: 1,
    });
    expect(setTaskStatus(store, 'prop-3', 'in_progress', 2)).toBe(true);
    expect(setTaskStatus(store, 'prop-3', 'done', 3)).toBe(true);
    expect(labelEvents('p1')).toEqual([]);
  });
});

describe('deleteProject', () => {
  it('removes the project and cascades all of its rows (incl. the FTS index)', () => {
    seedProject('p1');
    seedProject('p2');

    const removed = deleteProject(store, 'p1');
    expect(removed).toBe(true);

    // p1 is gone everywhere; p2 is untouched.
    const count = (t: string, id: string): number =>
      (
        store.db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE project_id = ?`).get(id) as {
          c: number;
        }
      ).c;
    expect(store.db.prepare('SELECT COUNT(*) AS c FROM projects WHERE id = ?').get('p1')).toEqual({
      c: 0,
    });
    expect(count('events', 'p1')).toBe(0);
    expect(count('metrics', 'p1')).toBe(0);
    expect(count('project_search', 'p1')).toBe(0);

    expect(store.db.prepare('SELECT COUNT(*) AS c FROM projects WHERE id = ?').get('p2')).toEqual({
      c: 1,
    });
    expect(count('project_search', 'p2')).toBe(1);
  });

  it('returns false when the project does not exist', () => {
    expect(deleteProject(store, 'missing')).toBe(false);
  });

  it('clears the sqlite-vec index too, so a re-onboarded project never inherits stale embeddings', () => {
    const vec = openVectorStore(store);
    if (vec === null) return; // extension unavailable on this platform — nothing to assert
    seedProject('p1');
    seedProject('p2');
    const embedding = new Float32Array(EMBEDDING_DIM);
    embedding[0] = 1;
    vec.upsert('p1', 'src/a.ts', embedding);
    vec.upsert('p2', 'src/a.ts', embedding);

    expect(deleteProject(store, 'p1')).toBe(true);

    expect(vec.count('p1')).toBe(0);
    expect(vec.count('p2')).toBe(1); // untouched
  });
});

describe('createTask + setTaskStatus', () => {
  beforeEach(() => seedProject('p1'));

  it('adds a dashboard-sourced queued task and moves it to done', () => {
    expect(
      createTask(store, {
        id: 'web-1',
        projectId: 'p1',
        title: '  Ship the login fix  ',
        createdAt: 5,
      }),
    ).toBe(true);

    const row = store.db.prepare('SELECT * FROM tasks WHERE id = ?').get('web-1') as {
      title: string;
      status: string;
      source: string;
      project_id: string;
    };
    expect(row).toMatchObject({
      title: 'Ship the login fix', // trimmed
      status: 'queued',
      source: 'dashboard',
      project_id: 'p1',
    });

    expect(setTaskStatus(store, 'web-1', 'done', 9)).toBe(true);
    const after = store.db
      .prepare('SELECT status, updated_at FROM tasks WHERE id = ?')
      .get('web-1') as {
      status: string;
      updated_at: number;
    };
    expect(after).toEqual({ status: 'done', updated_at: 9 });
  });

  it('accepts optional severity/dimension and rejects CHECK-invalid values', () => {
    expect(
      createTask(store, {
        id: 'web-2',
        projectId: 'p1',
        title: 'A11y sweep',
        severity: 'high',
        dimension: 'accessibility',
        createdAt: 1,
      }),
    ).toBe(true);
    expect(
      createTask(store, {
        id: 'web-3',
        projectId: 'p1',
        title: 'x',
        severity: 'nonsense',
        createdAt: 1,
      }),
    ).toBe(false);
  });

  it('locks and releases operator FOCUS on a task', () => {
    createTask(store, { id: 'web-f', projectId: 'p1', title: 'Focus me', createdAt: 1 });
    expect(setTaskFocus(store, 'web-f', true, 2)).toBe(true);
    let row = store.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('web-f') as {
      focus: number;
    };
    expect(row.focus).toBe(1);
    expect(setTaskFocus(store, 'web-f', false, 3)).toBe(true);
    row = store.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('web-f') as {
      focus: number;
    };
    expect(row.focus).toBe(0);
    expect(setTaskFocus(store, 'ghost', true, 1)).toBe(false);
  });

  it('refuses to (re-)lock FOCUS on a task already done or deferred', () => {
    createTask(store, {
      id: 'web-closed',
      projectId: 'p1',
      title: 'Already shipped',
      createdAt: 1,
    });
    expect(setTaskStatus(store, 'web-closed', 'done', 2)).toBe(true);

    // A stale focus POST racing the close (e.g. arriving just after the flight
    // that shipped it) must not re-stick focus on a task with no UI to clear it.
    setTaskFocus(store, 'web-closed', true, 3);
    expect(
      (
        store.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('web-closed') as {
          focus: number;
        }
      ).focus,
    ).toBe(0);
  });

  it('releases stale FOCUS when a focused task lands on done or deferred', () => {
    createTask(store, {
      id: 'web-done',
      projectId: 'p1',
      title: 'Focused, then ships',
      createdAt: 1,
    });
    setTaskFocus(store, 'web-done', true, 2);
    expect(setTaskStatus(store, 'web-done', 'done', 3)).toBe(true);
    expect(
      (
        store.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('web-done') as {
          focus: number;
        }
      ).focus,
    ).toBe(0);

    createTask(store, {
      id: 'web-deferred',
      projectId: 'p1',
      title: 'Focused, then deferred',
      createdAt: 1,
    });
    setTaskFocus(store, 'web-deferred', true, 2);
    expect(setTaskStatus(store, 'web-deferred', 'deferred', 3)).toBe(true);
    expect(
      (
        store.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('web-deferred') as {
          focus: number;
        }
      ).focus,
    ).toBe(0);

    // Non-terminal transitions leave an existing focus untouched.
    createTask(store, {
      id: 'web-progress',
      projectId: 'p1',
      title: 'Focused, still working',
      createdAt: 1,
    });
    setTaskFocus(store, 'web-progress', true, 2);
    expect(setTaskStatus(store, 'web-progress', 'in_progress', 3)).toBe(true);
    expect(
      (
        store.db.prepare('SELECT focus FROM tasks WHERE id = ?').get('web-progress') as {
          focus: number;
        }
      ).focus,
    ).toBe(1);
  });

  it('reorders tasks by the operator’s explicit order (priority = position)', () => {
    createTask(store, { id: 't-a', projectId: 'p1', title: 'A', createdAt: 1 });
    createTask(store, { id: 't-b', projectId: 'p1', title: 'B', createdAt: 2 });
    createTask(store, { id: 't-c', projectId: 'p1', title: 'C', createdAt: 3 });

    const changed = reorderTasks(store, 'p1', ['t-c', 't-a', 't-b'], 9);
    expect(changed).toBe(3);

    const rows = recentTasks(store.db, 'p1');
    expect(rows.map((r) => r.id)).toEqual(['t-c', 't-a', 't-b']);
    expect(rows.map((r) => r.priority)).toEqual([0, 1, 2]);

    // Ids outside the project are ignored, not applied.
    expect(reorderTasks(store, 'p1', ['ghost'], 10)).toBe(0);
  });

  it('does NOT set priority_pinned by default (triage’s own writes must never pin)', () => {
    createTask(store, { id: 't-a', projectId: 'p1', title: 'A', createdAt: 1 });
    createTask(store, { id: 't-b', projectId: 'p1', title: 'B', createdAt: 2 });

    reorderTasks(store, 'p1', ['t-b', 't-a'], 9);

    const rows = store.db
      .prepare('SELECT id, priority_pinned FROM tasks WHERE project_id = ? ORDER BY id')
      .all('p1') as { id: string; priority_pinned: number }[];
    expect(rows).toEqual([
      { id: 't-a', priority_pinned: 0 },
      { id: 't-b', priority_pinned: 0 },
    ]);
  });

  it('pin: true marks every reordered task priority_pinned (the operator’s own reorder — web-mt1bwkrf-v5pnx2)', () => {
    createTask(store, { id: 't-a', projectId: 'p1', title: 'A', createdAt: 1 });
    createTask(store, { id: 't-b', projectId: 'p1', title: 'B', createdAt: 2 });

    reorderTasks(store, 'p1', ['t-b', 't-a'], 9, true);

    const rows = store.db
      .prepare('SELECT id, priority_pinned FROM tasks WHERE project_id = ? ORDER BY id')
      .all('p1') as { id: string; priority_pinned: number }[];
    expect(rows).toEqual([
      { id: 't-a', priority_pinned: 1 },
      { id: 't-b', priority_pinned: 1 },
    ]);
  });

  it('a plain (unpinned) reorder call leaves an EXISTING pin untouched — triage renumbering priority must not silently un-pin', () => {
    createTask(store, { id: 't-a', projectId: 'p1', title: 'A', createdAt: 1 });
    createTask(store, { id: 't-b', projectId: 'p1', title: 'B', createdAt: 2 });

    reorderTasks(store, 'p1', ['t-a', 't-b'], 5, true); // operator pins both
    reorderTasks(store, 'p1', ['t-b', 't-a'], 9); // triage re-numbers, unpinned call

    const rows = store.db
      .prepare('SELECT id, priority_pinned FROM tasks WHERE project_id = ? ORDER BY id')
      .all('p1') as { id: string; priority_pinned: number }[];
    expect(rows).toEqual([
      { id: 't-a', priority_pinned: 1 },
      { id: 't-b', priority_pinned: 1 },
    ]);
  });

  it('unpinTasks clears the pin (and only the pin) so a stale operator priority can be released', () => {
    // 2026-08-23 live gap: pins were ONE-WAY — reorderTasks(pin:true) sets
    // priority_pinned but nothing could ever clear it, so a pinned-but-
    // speculative task re-taxed every future round (fleet-7 paid a deep
    // investigation on the pinned overlap-detector before deviating).
    createTask(store, { id: 't-a', projectId: 'p1', title: 'A', createdAt: 1 });
    createTask(store, { id: 't-b', projectId: 'p1', title: 'B', createdAt: 2 });
    reorderTasks(store, 'p1', ['t-a', 't-b'], 5, true);

    const changed = unpinTasks(store, 'p1', ['t-a'], 9);

    expect(changed).toBe(1);
    const rows = store.db
      .prepare('SELECT id, priority, priority_pinned FROM tasks WHERE project_id = ? ORDER BY id')
      .all('p1') as { id: string; priority: number; priority_pinned: number }[];
    // t-a released (priority itself untouched — the next triage re-ranks it);
    // t-b stays pinned exactly where the operator put it.
    expect(rows).toEqual([
      { id: 't-a', priority: 0, priority_pinned: 0 },
      { id: 't-b', priority: 1, priority_pinned: 1 },
    ]);
  });

  it('unpinTasks ignores ids outside the project and returns 0 when nothing was pinned', () => {
    createTask(store, { id: 't-a', projectId: 'p1', title: 'A', createdAt: 1 });
    expect(unpinTasks(store, 'p1', ['ghost'], 9)).toBe(0);
    expect(unpinTasks(store, 'p1', ['t-a'], 9)).toBe(0);
  });

  it('skips a sparse-array hole in orderedIds instead of updating an "undefined" id', () => {
    createTask(store, { id: 't-x', projectId: 'p1', title: 'X', createdAt: 1 });
    createTask(store, { id: 't-y', projectId: 'p1', title: 'Y', createdAt: 2 });

    // noUncheckedIndexedAccess models array holes as `undefined`; a sparse
    // array reaching this far (e.g. malformed request JSON) exercises that.
    const sparse: string[] = ['t-x'];
    sparse[2] = 't-y';
    expect(reorderTasks(store, 'p1', sparse, 9)).toBe(2); // the hole at index 1 is skipped

    const rows = recentTasks(store.db, 'p1');
    expect(rows.map((r) => r.id)).toEqual(['t-x', 't-y']);
    expect(rows.map((r) => r.priority)).toEqual([0, 2]);
  });

  it('focused tasks sort FIRST among open work (the flight pulls from the top)', () => {
    createTask(store, { id: 't-1', projectId: 'p1', title: 'ordered first', createdAt: 1 });
    createTask(store, { id: 't-2', projectId: 'p1', title: 'focused', createdAt: 2 });
    reorderTasks(store, 'p1', ['t-1', 't-2'], 3);
    setTaskFocus(store, 't-2', true, 4);

    const rows = recentTasks(store.db, 'p1');
    expect(rows[0]?.id).toBe('t-2'); // focus beats priority
    expect(rows[0]?.focus).toBe(1);
  });

  it('refuses a blank title, a missing project, and an unknown task/status', () => {
    expect(createTask(store, { id: 'w', projectId: 'p1', title: '   ', createdAt: 1 })).toBe(false);
    expect(createTask(store, { id: 'w', projectId: 'ghost', title: 'x', createdAt: 1 })).toBe(
      false,
    );
    expect(setTaskStatus(store, 'nope', 'done', 1)).toBe(false);
    createTask(store, { id: 'web-4', projectId: 'p1', title: 'x', createdAt: 1 });
    expect(setTaskStatus(store, 'web-4', 'exploded', 1)).toBe(false);
  });

  it('strips U+FFFD mojibake from a title, keeping the rest, and warns the caller', () => {
    const warn = vi.fn();
    expect(
      createTask(
        store,
        { id: 'web-5', projectId: 'p1', title: 'Ship the �login fix', createdAt: 1 },
        warn,
      ),
    ).toBe(true);
    const row = store.db.prepare('SELECT title FROM tasks WHERE id = ?').get('web-5') as {
      title: string;
    };
    expect(row.title).toBe('Ship the login fix');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('mojibake');
  });

  it('rejects a title that is nothing but mojibake once stripped', () => {
    const warn = vi.fn();
    expect(
      createTask(store, { id: 'web-6', projectId: 'p1', title: '���', createdAt: 1 }, warn),
    ).toBe(false);
    expect(store.db.prepare('SELECT 1 FROM tasks WHERE id = ?').get('web-6')).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not call warn when the title has no mojibake', () => {
    const warn = vi.fn();
    createTask(store, { id: 'web-7', projectId: 'p1', title: 'clean title', createdAt: 1 }, warn);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('reconcileShippedTasks', () => {
  beforeEach(() => seedProject('p1'));

  function shipMetric(item: string, completion: 'slice' | 'complete' | null = null): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, shipped, completion, created_at)
         VALUES (?, ?, ?, 1, ?, 1)`,
      )
      .run('p1', `p1-recon-${item}`, item, completion);
  }

  it('closes an open task whose id already has a gate-verified shipped metric — no matter how old', () => {
    createTask(store, { id: 'web-a', projectId: 'p1', title: 'Straggler', createdAt: 1 });
    createTask(store, { id: 'web-b', projectId: 'p1', title: 'Still open', createdAt: 1 });
    shipMetric('web-a');

    const closed = reconcileShippedTasks(store, 'p1', 9);

    expect(closed).toEqual([{ id: 'web-a', title: 'Straggler' }]);
    expect(
      (
        store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('web-a') as {
          status: string;
        }
      ).status,
    ).toBe('done');
    expect(
      (
        store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('web-b') as {
          status: string;
        }
      ).status,
    ).toBe('queued');
  });

  it('is idempotent — a second pass finds nothing left to close', () => {
    createTask(store, { id: 'web-c', projectId: 'p1', title: 'Closed once', createdAt: 1 });
    shipMetric('web-c');

    expect(reconcileShippedTasks(store, 'p1', 9)).toHaveLength(1);
    expect(reconcileShippedTasks(store, 'p1', 10)).toEqual([]);
  });

  it('returns [] without querying tasks when the project has no shipped-with-item metric at all', () => {
    // seedProject's own metric row has no `item` (excluded by `item IS NOT NULL`),
    // so with no shipMetric() call this project has zero qualifying rows —
    // the early-return path, distinct from "shipped items exist but match no task".
    createTask(store, { id: 'web-none', projectId: 'p1', title: 'Never shipped', createdAt: 1 });

    expect(reconcileShippedTasks(store, 'p1', 9)).toEqual([]);
    expect(
      (
        store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('web-none') as {
          status: string;
        }
      ).status,
    ).toBe('queued');
  });

  it('leaves an in_progress task queued if nothing shipped it, and ignores other projects', () => {
    seedProject('p2');
    createTask(store, { id: 'web-d', projectId: 'p1', title: 'Untouched', createdAt: 1 });
    createTask(store, { id: 'web-e', projectId: 'p2', title: 'Other project', createdAt: 1 });
    shipMetric('web-e'); // shipped under p1's metrics but no such task in p1

    expect(reconcileShippedTasks(store, 'p1', 9)).toEqual([]);
    expect(
      (
        store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('web-d') as {
          status: string;
        }
      ).status,
    ).toBe('queued');
  });

  it('does NOT close a task shipped only as a "slice" (partial-slice claims must not close the whole task)', () => {
    createTask(store, { id: 'web-f', projectId: 'p1', title: 'Multi-step task', createdAt: 1 });
    shipMetric('web-f', 'slice');

    expect(reconcileShippedTasks(store, 'p1', 9)).toEqual([]);
    expect(
      (store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('web-f') as { status: string })
        .status,
    ).toBe('queued');
  });

  it('closes a task shipped with an explicit "complete" completion', () => {
    createTask(store, { id: 'web-g', projectId: 'p1', title: 'Finished task', createdAt: 1 });
    shipMetric('web-g', 'complete');

    expect(reconcileShippedTasks(store, 'p1', 9)).toEqual([
      { id: 'web-g', title: 'Finished task' },
    ]);
  });
});

describe('claimTask / releaseTaskClaim', () => {
  beforeEach(() => seedProject('p1'));

  it('claims a queued task for an instance, flipping it to in_progress', () => {
    createTask(store, { id: 't-1', projectId: 'p1', title: 'Claim me', createdAt: 1 });

    expect(claimTask(store, 't-1', 'instance-a', 5)).toBe(true);

    const row = store.db
      .prepare('SELECT status, assignee, updated_at FROM tasks WHERE id = ?')
      .get('t-1') as { status: string; assignee: string | null; updated_at: number };
    expect(row).toEqual({ status: 'in_progress', assignee: 'instance-a', updated_at: 5 });
  });

  it("refuses to claim an OPERATOR task — a human's own action must never enter the autonomous path (observed live 2026-09-02: a lane burned two no-ship firings on the node-upgrade task, which only the operator's hands can do)", () => {
    createTask(store, {
      id: 't-op',
      projectId: 'p1',
      title: 'OPERATOR-ONLY (no lane can do this): upgrade Node.js on this machine',
      createdAt: 1,
    });
    createTask(store, {
      id: 't-op2',
      projectId: 'p1',
      title: 'OPERATOR DECISION: pick a path for the e2e landing gate',
      createdAt: 1,
    });

    expect(claimTask(store, 't-op', 'instance-a', 5)).toBe(false);
    expect(claimTask(store, 't-op2', 'instance-a', 5)).toBe(false);

    // Untouched: still queued, unassigned — visible to the operator, never a lane.
    const row = store.db.prepare('SELECT status, assignee FROM tasks WHERE id = ?').get('t-op') as {
      status: string;
      assignee: string | null;
    };
    expect(row).toEqual({ status: 'queued', assignee: null });
  });

  it('still claims a task that merely MENTIONS an operator mid-title — only the OPERATOR prefix marks ownership', () => {
    createTask(store, {
      id: 't-mention',
      projectId: 'p1',
      title: 'Document how the OPERATOR DECISION flow records choices',
      createdAt: 1,
    });
    expect(claimTask(store, 't-mention', 'instance-a', 5)).toBe(true);
  });

  it('refuses to claim a task another instance already holds', () => {
    createTask(store, { id: 't-2', projectId: 'p1', title: 'Contested', createdAt: 1 });
    expect(claimTask(store, 't-2', 'instance-a', 1)).toBe(true);

    expect(claimTask(store, 't-2', 'instance-b', 2)).toBe(false);

    const row = store.db.prepare('SELECT assignee FROM tasks WHERE id = ?').get('t-2') as {
      assignee: string | null;
    };
    expect(row.assignee).toBe('instance-a'); // untouched by the losing claim
  });

  it('re-claiming a task the SAME instance already holds is a no-op success', () => {
    createTask(store, { id: 't-3', projectId: 'p1', title: 'Mine already', createdAt: 1 });
    claimTask(store, 't-3', 'instance-a', 1);

    expect(claimTask(store, 't-3', 'instance-a', 2)).toBe(true);
    const row = store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('t-3') as {
      status: string;
    };
    expect(row.status).toBe('in_progress'); // stays in_progress, not reset
  });

  it('refuses a task that is not workable (done/deferred/needs_approval)', () => {
    createTask(store, { id: 't-4', projectId: 'p1', title: 'Finished', createdAt: 1 });
    setTaskStatus(store, 't-4', 'done', 2);

    expect(claimTask(store, 't-4', 'instance-a', 3)).toBe(false);
  });

  it('returns false for an unknown task', () => {
    expect(claimTask(store, 'ghost', 'instance-a', 1)).toBe(false);
  });

  it('releases a claim back to queued and unassigned', () => {
    createTask(store, { id: 't-5', projectId: 'p1', title: 'Abandoned', createdAt: 1 });
    claimTask(store, 't-5', 'instance-a', 1);

    expect(releaseTaskClaim(store, 't-5', 'instance-a', 9)).toBe(true);

    const row = store.db.prepare('SELECT status, assignee FROM tasks WHERE id = ?').get('t-5') as {
      status: string;
      assignee: string | null;
    };
    expect(row).toEqual({ status: 'queued', assignee: null });
  });

  it('refuses to release a claim held by a DIFFERENT instance', () => {
    createTask(store, { id: 't-6', projectId: 'p1', title: 'Not yours', createdAt: 1 });
    claimTask(store, 't-6', 'instance-a', 1);

    expect(releaseTaskClaim(store, 't-6', 'instance-b', 2)).toBe(false);
    const row = store.db.prepare('SELECT assignee FROM tasks WHERE id = ?').get('t-6') as {
      assignee: string | null;
    };
    expect(row.assignee).toBe('instance-a');
  });

  it('refuses to release a task that is not currently in_progress', () => {
    createTask(store, { id: 't-7', projectId: 'p1', title: 'Never claimed', createdAt: 1 });
    expect(releaseTaskClaim(store, 't-7', 'instance-a', 1)).toBe(false);
  });
});

describe('releaseInstanceClaims (flight-end sweep)', () => {
  // Why: a claim released per-firing only covers the "shipped something else /
  // nothing" endings — a firing that ships a SLICE of its claimed task keeps
  // the claim (sticky lease, by design), and when the FLIGHT then ends nothing
  // ever released it. Two BRAND tasks sat in_progress for 3 days assigned to
  // long-dead instances (observed 2026-08-20), reading as "still running" on
  // the board and inflating the openFindings gauge. The flight's finally
  // block now hands every claim this instance still holds back to the fleet.
  beforeEach(() => seedProject('p1'));

  it('releases every in_progress task the instance holds, back to queued + unassigned', () => {
    createTask(store, { id: 'c-1', projectId: 'p1', title: 'Slice one', createdAt: 1 });
    createTask(store, { id: 'c-2', projectId: 'p1', title: 'Slice two', createdAt: 1 });
    claimTask(store, 'c-1', 'fleet-3', 2);
    claimTask(store, 'c-2', 'fleet-3', 2);

    expect(releaseInstanceClaims(store, 'p1', 'fleet-3', 9)).toBe(2);

    const rows = store.db
      .prepare('SELECT id, status, assignee, updated_at FROM tasks WHERE id IN (?, ?) ORDER BY id')
      .all('c-1', 'c-2') as { id: string; status: string; assignee: string | null }[];
    for (const row of rows) {
      expect(row.status).toBe('queued');
      expect(row.assignee).toBeNull();
    }
  });

  it("never touches a SIBLING instance's live claims", () => {
    createTask(store, { id: 'c-3', projectId: 'p1', title: 'Mine', createdAt: 1 });
    createTask(store, { id: 'c-4', projectId: 'p1', title: 'Theirs', createdAt: 1 });
    claimTask(store, 'c-3', 'fleet-3', 2);
    claimTask(store, 'c-4', 'fleet-5', 2);

    expect(releaseInstanceClaims(store, 'p1', 'fleet-3', 9)).toBe(1);

    const sibling = store.db
      .prepare('SELECT status, assignee FROM tasks WHERE id = ?')
      .get('c-4') as {
      status: string;
      assignee: string | null;
    };
    expect(sibling).toEqual({ status: 'in_progress', assignee: 'fleet-5' });
  });

  it('never touches terminal statuses even when the assignee matches', () => {
    createTask(store, { id: 'c-5', projectId: 'p1', title: 'Done already', createdAt: 1 });
    claimTask(store, 'c-5', 'fleet-3', 2);
    setTaskStatus(store, 'c-5', 'done', 3);

    expect(releaseInstanceClaims(store, 'p1', 'fleet-3', 9)).toBe(0);
    const row = store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('c-5') as {
      status: string;
    };
    expect(row.status).toBe('done');
  });

  it('scopes to the given project only', () => {
    seedProject('p2');
    createTask(store, { id: 'c-6', projectId: 'p2', title: 'Other project', createdAt: 1 });
    claimTask(store, 'c-6', 'fleet-3', 2);

    expect(releaseInstanceClaims(store, 'p1', 'fleet-3', 9)).toBe(0);
    const row = store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('c-6') as {
      status: string;
    };
    expect(row.status).toBe('in_progress');
  });

  it('returns 0 when the instance holds nothing (a clean flight end)', () => {
    expect(releaseInstanceClaims(store, 'p1', 'fleet-3', 9)).toBe(0);
  });
});

describe('releaseStaleClaims (fleet stale-claim reaper)', () => {
  // Why: releaseInstanceClaims only fires from fly.ts's own `finally` — a
  // crashed instance (SIGKILL, power loss) skips it entirely, stranding its
  // claim with no live instanceKey left to hand it back through. Two BRAND
  // tasks sat in_progress, assigned to long-dead instances, for three days
  // (observed 2026-08-20) before this reaper existed. Board-wide by design:
  // a dead instance can't self-identify, so this ages out ANY stale claim.
  beforeEach(() => seedProject('p1'));

  it('releases a claim whose updated_at is older than the threshold', () => {
    createTask(store, { id: 'r-1', projectId: 'p1', title: 'Ghost claim', createdAt: 1 });
    claimTask(store, 'r-1', 'dead-instance', 100);

    const released = releaseStaleClaims(store, 'p1', 1000, 100 + 1000 + 1);

    expect(released).toEqual([{ id: 'r-1', title: 'Ghost claim' }]);
    const row = store.db.prepare('SELECT status, assignee FROM tasks WHERE id = ?').get('r-1') as {
      status: string;
      assignee: string | null;
    };
    expect(row).toEqual({ status: 'queued', assignee: null });
  });

  it('never touches a claim still within the threshold (a live instance)', () => {
    createTask(store, { id: 'r-2', projectId: 'p1', title: 'Live claim', createdAt: 1 });
    claimTask(store, 'r-2', 'live-instance', 100);

    expect(releaseStaleClaims(store, 'p1', 1000, 100 + 500)).toEqual([]);
    const row = store.db.prepare('SELECT status, assignee FROM tasks WHERE id = ?').get('r-2') as {
      status: string;
      assignee: string | null;
    };
    expect(row).toEqual({ status: 'in_progress', assignee: 'live-instance' });
  });

  it('never touches an unassigned queued task, however old', () => {
    createTask(store, { id: 'r-3', projectId: 'p1', title: 'Never claimed', createdAt: 1 });

    expect(releaseStaleClaims(store, 'p1', 1000, 1_000_000)).toEqual([]);
    const row = store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('r-3') as {
      status: string;
    };
    expect(row.status).toBe('queued');
  });

  it('never touches a terminal status even when stale and assigned', () => {
    createTask(store, { id: 'r-4', projectId: 'p1', title: 'Done already', createdAt: 1 });
    claimTask(store, 'r-4', 'dead-instance', 100);
    setTaskStatus(store, 'r-4', 'done', 101);

    expect(releaseStaleClaims(store, 'p1', 1000, 1_000_000)).toEqual([]);
    const row = store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('r-4') as {
      status: string;
    };
    expect(row.status).toBe('done');
  });

  it('scopes to the given project only', () => {
    seedProject('p2');
    createTask(store, { id: 'r-5', projectId: 'p2', title: 'Other project', createdAt: 1 });
    claimTask(store, 'r-5', 'dead-instance', 100);

    expect(releaseStaleClaims(store, 'p1', 1000, 1_000_000)).toEqual([]);
    const row = store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('r-5') as {
      status: string;
    };
    expect(row.status).toBe('in_progress');
  });

  it('returns [] when nothing is stale', () => {
    expect(releaseStaleClaims(store, 'p1', 1000, 1_000_000)).toEqual([]);
  });
});

describe('demoteMetricsCompletion', () => {
  beforeEach(() => seedProject('p1'));

  function shipMetricWithSha(
    item: string,
    sha: string,
    completion: 'slice' | 'complete' | null,
  ): void {
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, sha, shipped, completion, created_at)
         VALUES (?, ?, ?, ?, 1, ?, 1)`,
      )
      .run('p1', `p1-demote-${item}`, item, sha, completion);
  }

  it('demotes a "complete" row matched by sha to "slice"', () => {
    shipMetricWithSha('web-x', 'abc123', 'complete');

    expect(demoteMetricsCompletion(store, 'p1', 'abc123')).toBe(true);

    const row = store.db.prepare(`SELECT completion FROM metrics WHERE sha = 'abc123'`).get() as {
      completion: string;
    };
    expect(row.completion).toBe('slice');
  });

  it('keeps a demoted row from being re-closed by the reconciliation straggler safety net', () => {
    createTask(store, { id: 'web-y', projectId: 'p1', title: 'DELIVERABLE task', createdAt: 1 });
    shipMetricWithSha('web-y', 'def456', 'complete');

    demoteMetricsCompletion(store, 'p1', 'def456');

    expect(reconcileShippedTasks(store, 'p1', 9)).toEqual([]);
    expect(
      (store.db.prepare('SELECT status FROM tasks WHERE id = ?').get('web-y') as { status: string })
        .status,
    ).toBe('queued');
  });

  it('does not demote an already-"slice" row', () => {
    shipMetricWithSha('web-z', 'ghi789', 'slice');
    expect(demoteMetricsCompletion(store, 'p1', 'ghi789')).toBe(false);
  });

  it('returns false for an unmatched sha', () => {
    expect(demoteMetricsCompletion(store, 'p1', 'nope')).toBe(false);
  });

  it('does not demote a row from a different project sharing the same sha', () => {
    seedProject('p2');
    shipMetricWithSha('web-w', 'shared-sha', 'complete'); // p1's row
    store.db
      .prepare(
        `INSERT INTO metrics (project_id, firing_id, item, sha, shipped, completion, created_at)
         VALUES ('p2', 'p2-demote-web-w', 'web-w', 'shared-sha', 1, 'complete', 1)`,
      )
      .run();

    demoteMetricsCompletion(store, 'p1', 'shared-sha');

    const p2Row = store.db
      .prepare(`SELECT completion FROM metrics WHERE project_id = 'p2' AND sha = 'shared-sha'`)
      .get() as { completion: string };
    expect(p2Row.completion).toBe('complete'); // untouched
  });
});
