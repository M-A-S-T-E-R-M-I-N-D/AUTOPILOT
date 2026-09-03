// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Versioned SQLite schema for AUTOPILOT (PATTERNS-AND-STANDARDS §7).
 *
 * Tables use SQLite STRICT typing + CHECK constraints so the persistence layer
 * enforces the domain invariants (severity/dimension/status allow-lists) rather
 * than trusting callers. Migrations are append-only and content-checksummed by
 * the runner (see migrate.ts) to detect schema drift.
 */

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: string;
}

const M1_INITIAL = `
CREATE TABLE projects (
  id           TEXT    PRIMARY KEY,
  slug         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  root_path    TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'registered'
                 CHECK (status IN ('registered','flying','paused','hibernating','needs_you')),
  soul         TEXT,
  gate_config  TEXT,
  metadata     TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
) STRICT;

CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  firing_id    TEXT,
  type         TEXT    NOT NULL,
  payload      TEXT,
  created_at   INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_events_project_created ON events(project_id, created_at);
CREATE INDEX idx_events_type            ON events(type);
CREATE INDEX idx_events_firing          ON events(firing_id);

CREATE TABLE metrics (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id         TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  firing_id          TEXT    NOT NULL UNIQUE,
  item               TEXT,
  kind               TEXT
                       CHECK (kind IS NULL OR kind IN
                         ('feat','fix','docs','test','refactor','chore','perf','ci','build','style','revert')),
  sha                TEXT,
  head_before        TEXT,
  head_after         TEXT,
  shipped            INTEGER NOT NULL DEFAULT 0 CHECK (shipped IN (0,1)),
  self_reported      INTEGER NOT NULL DEFAULT 0 CHECK (self_reported IN (0,1)),
  model              TEXT,
  cost_usd           REAL    NOT NULL DEFAULT 0,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  turns              INTEGER NOT NULL DEFAULT 0,
  duration_ms        INTEGER NOT NULL DEFAULT 0,
  gate_result        TEXT,
  created_at         INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_metrics_project_created ON metrics(project_id, created_at);
CREATE INDEX idx_metrics_kind            ON metrics(kind);

CREATE TABLE tasks (
  id           TEXT    PRIMARY KEY,
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  body         TEXT,
  status       TEXT    NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','in_progress','done','needs_approval','deferred')),
  severity     TEXT
                 CHECK (severity IS NULL OR severity IN ('critical','high','medium','low')),
  dimension    TEXT
                 CHECK (dimension IS NULL OR dimension IN
                   ('accessibility','cybersecurity','ux','human_interaction','learnings','information','data','priorities')),
  source       TEXT    NOT NULL DEFAULT 'self'
                 CHECK (source IN ('inbox','repo','backlog','chat','dashboard','self')),
  assignee     TEXT,
  artifacts    TEXT,
  created_by   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_severity       ON tasks(severity);
CREATE INDEX idx_tasks_dimension      ON tasks(dimension);

CREATE TABLE versions (
  id           TEXT    PRIMARY KEY,
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tier         TEXT    NOT NULL CHECK (tier IN ('myth','legacy','flight')),
  ref          TEXT    NOT NULL,
  label        TEXT,
  parent_ref   TEXT,
  metadata     TEXT,
  created_at   INTEGER NOT NULL
) STRICT;
CREATE INDEX        idx_versions_project     ON versions(project_id, created_at);
CREATE UNIQUE INDEX idx_versions_project_ref ON versions(project_id, ref);
`;

// v2: surface the un-fakeable git cross-checks (ENGINE-RESEARCH G2) in the
// queryable metrics projection, not only the events payload — so a "claimed
// shipped" firing can be audited via SQL (head_advanced / sha_verified).
const M2_METRICS_GROUND_TRUTH = `
ALTER TABLE metrics ADD COLUMN head_advanced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE metrics ADD COLUMN sha_verified  INTEGER NOT NULL DEFAULT 0;
`;

// v3: the incremental, content-hash-invalidated project index (M2 onboarding;
// ENGINE-RESEARCH I3). Per-file hashes + one summary row per project. The
// content_hash is the exact invalidation key M4's RAG will reuse.
const M3_PROJECT_INDEX = `
CREATE TABLE project_index (
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT    NOT NULL,
  content_hash TEXT    NOT NULL CHECK (length(content_hash) = 64),
  size         INTEGER NOT NULL CHECK (size >= 0),
  language     TEXT    NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (project_id, path)
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_project_index_lang ON project_index(project_id, language);

CREATE TABLE project_index_meta (
  project_id   TEXT    PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  tree_hash    TEXT    NOT NULL CHECK (length(tree_hash) = 64),
  file_count   INTEGER NOT NULL CHECK (file_count  >= 0),
  total_bytes  INTEGER NOT NULL CHECK (total_bytes >= 0),
  summary      TEXT    NOT NULL,
  hot_files    TEXT    NOT NULL,
  tool_version TEXT    NOT NULL,
  built_at     INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
) STRICT;
`;

// v4: the full-text content index for retrieval (M4 chat/RAG; REACTIVITY §1.1).
// An FTS5 virtual table with the `trigram` tokenizer so a query substring
// ("cart") matches inside a code identifier ("addToCart") — the right default
// for code search. project_id/language are UNINDEXED filters; path + content
// are searchable and bm25-ranked. Contentless upsert = delete-by-key + insert.
const M4_PROJECT_SEARCH = `
CREATE VIRTUAL TABLE project_search USING fts5(
  project_id UNINDEXED,
  path,
  content,
  language UNINDEXED,
  tokenize = 'trigram'
);
`;

// v5: operator steering for the board (M4 focus mode; the founder's spec).
// `focus` = the operator locked the autopilot onto this task (WIP-limit-1
// discipline: a flight works ONLY focused tasks until they are done).
// `priority` = the operator's explicit ordering when nothing is focused
// (lower = sooner; NULL = unordered, sorts after ordered work).
const M5_TASK_STEERING = `
ALTER TABLE tasks ADD COLUMN focus INTEGER NOT NULL DEFAULT 0 CHECK (focus IN (0, 1));
ALTER TABLE tasks ADD COLUMN priority INTEGER;
CREATE INDEX idx_tasks_focus ON tasks(project_id, focus);
`;

// v6: the raw HEAD commit subject (HONEST HEADLINES) — so a free-pick ship
// with no matching board task can still show its real commit title instead
// of an opaque item id like "inferred".
const M6_COMMIT_SUBJECT = `
ALTER TABLE metrics ADD COLUMN commit_subject TEXT;
`;

// v7: partial-slice claims must not close a whole board task (SYSTEMIC fix —
// a firing that only advances a task, not finishes it, self-reports
// "completion":"slice"; only "complete" (or NULL, for every pre-v7 firing)
// may auto-close the linked task). Queryable so reconcileShippedTasks
// (packages/store/src/mutate.ts) can filter it via plain SQL.
const M7_METRICS_COMPLETION = `
ALTER TABLE metrics ADD COLUMN completion TEXT CHECK (completion IS NULL OR completion IN ('slice','complete'));
`;

// v8: generalize the backlog convention (web-msmpjsp4-0vr15q) — onboarding
// detects each project's OWN backlog file (BACKLOG*.md / TODO.md), not just
// AUTOPILOT's own docs/BACKLOG-999.md, and records it here so the prompt and
// the dedupe backstop can point at the right file for whatever repo is flying.
const M8_BACKLOG_PATH = `
ALTER TABLE projects ADD COLUMN backlog_path TEXT;
`;

// v9: TDD-first compliance (backlog web-msnsxuep-ytwucr) — the firing prompt
// requires a FAILING test reproducing the bug BEFORE the fix on kind:"fix"
// tasks; the agent self-reports whether it followed that order. NULL means
// "not reported" (every non-fix firing, and every firing that predates this
// field) — never coerced to true/false, so compliance stays honest.
const M9_METRICS_TEST_FIRST = `
ALTER TABLE metrics ADD COLUMN test_first INTEGER CHECK (test_first IS NULL OR test_first IN (0,1));
`;

// v10: graceful PAUSE (backlog web-msnt50au-vcrgrp) — an operator-requested hold
// the flight loop honors BETWEEN firings (never mid-firing): the dashboard sets
// this on the running project, the flight's own stop-check (apps/dashboard/src/fly.ts)
// polls it after each firing completes, and clears it when it lands the project on
// `status = 'paused'`. Separate from `status` itself so "hold requested" (still
// flying, finishing the in-flight unit) and "held" (status='paused', child exited)
// stay distinguishable — the same requested-vs-done shape Stop already has in memory.
const M10_FLIGHT_PAUSE = `
ALTER TABLE projects ADD COLUMN pause_requested INTEGER NOT NULL DEFAULT 0 CHECK (pause_requested IN (0,1));
`;

// v11: PICK DISCIPLINE (Goodhart audit — backlog web-msu755l7-mhyvuy) — comfort-
// grinding evades triage order silently unless the deviation is recorded. Each
// firing self-reports `picked_rank` (the 1-based position, in the rendered
// BOARD, of the task it actually worked — NULL for a free pick with no board
// task) and `deviation_reason` (why it skipped the triage-TOP task, required by
// the prompt whenever picked_rank isn't 1). Queryable so an audit can flag
// firings that repeatedly rank > 1 with no reason — read.ts's
// pickDisciplineAudit reads this projection the same way testFirstCompliance
// (v9) reads test_first.
const M11_METRICS_PICK_DISCIPLINE = `
ALTER TABLE metrics ADD COLUMN picked_rank INTEGER CHECK (picked_rank IS NULL OR picked_rank >= 1);
ALTER TABLE metrics ADD COLUMN deviation_reason TEXT;
`;

// v12: KEEPER issue triage (epic 0007 slice 3, backlog web-mss50i9u-ldv513) —
// an accepted upstream GitHub issue becomes a board task with `source =
// 'github'`. SQLite has no ALTER TABLE for CHECK constraints, so the widened
// allow-list requires recreating `tasks` — copy is 1:1 since only the CHECK
// grows, every other column and index stays exactly as M1/M5 defined it.
const M12_TASK_SOURCE_GITHUB = `
CREATE TABLE tasks_v12 (
  id           TEXT    PRIMARY KEY,
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  body         TEXT,
  status       TEXT    NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','in_progress','done','needs_approval','deferred')),
  severity     TEXT
                 CHECK (severity IS NULL OR severity IN ('critical','high','medium','low')),
  dimension    TEXT
                 CHECK (dimension IS NULL OR dimension IN
                   ('accessibility','cybersecurity','ux','human_interaction','learnings','information','data','priorities')),
  source       TEXT    NOT NULL DEFAULT 'self'
                 CHECK (source IN ('inbox','repo','backlog','chat','dashboard','self','github')),
  assignee     TEXT,
  artifacts    TEXT,
  created_by   TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  focus        INTEGER NOT NULL DEFAULT 0 CHECK (focus IN (0, 1)),
  priority     INTEGER
) STRICT;

INSERT INTO tasks_v12 (id, project_id, title, body, status, severity, dimension, source,
                        assignee, artifacts, created_by, created_at, updated_at, focus, priority)
  SELECT id, project_id, title, body, status, severity, dimension, source,
         assignee, artifacts, created_by, created_at, updated_at, focus, priority
  FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_v12 RENAME TO tasks;

CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE INDEX idx_tasks_severity       ON tasks(severity);
CREATE INDEX idx_tasks_dimension      ON tasks(dimension);
CREATE INDEX idx_tasks_focus          ON tasks(project_id, focus);
`;

// v13: SOUL evolution loop (epic B5 closure, backlog web-msnsndir-k1xgnd) —
// the starter SOUL a project registers with is LLM-generated and unreviewed
// by construction; this flag lets the dashboard say so until the operator
// actually reads and ratifies it (or a future amendment). Defaults to 0
// (unreviewed) so every existing/newly-registered project starts honest.
const M13_SOUL_REVIEWED = `
ALTER TABLE projects ADD COLUMN soul_reviewed INTEGER NOT NULL DEFAULT 0 CHECK (soul_reviewed IN (0,1));
`;

// v14: SOUL evolution loop, continuing v13 (backlog web-msnsndir-k1xgnd) — the
// storage a future post-flight step needs to PROPOSE a SOUL amendment without
// touching the live `soul` text until the operator ratifies it. `soul_proposed`
// holds the pending replacement text (NULL = no proposal pending);
// `soul_proposed_at` records when it was proposed so the dashboard can surface
// it. Applying or dismissing a proposal clears both (see mutate.ts).
const M14_SOUL_PROPOSED = `
ALTER TABLE projects ADD COLUMN soul_proposed TEXT;
ALTER TABLE projects ADD COLUMN soul_proposed_at INTEGER;
`;

// v15 (renumbered from fleet-3's parallel v13 — fleet migration-number collision): WARM SESSIONS' measurable-win telemetry signal (epic 0009, board item
// web-msnt26so-0c6tje) — `ports.ts`'s `ModelResponse.resumed` threaded through
// `telemetry.ts`'s `FiringRecord`. Queryable (not only in the events payload)
// so the epic's still-open acceptance criterion — showing a resumed firing
// paying less than a cold one for the same repeated context — can be answered
// with SQL correlating this column against cache_read_tokens/input_tokens,
// the same way v9's test_first supports testFirstCompliance. NULL = no resume
// was requested this firing (ordinary cold spawn); never coerced to 0/1.
const M15_METRICS_RESUMED = `
ALTER TABLE metrics ADD COLUMN resumed INTEGER CHECK (resumed IS NULL OR resumed IN (0,1));
`;

// v16: TRIAGE vs OPERATOR contract (backlog web-mt1bwkrf-v5pnx2) — an operator
// reorder (drag/↑↓, `mutate.ts`'s `reorderTasks` called with `pin: true`) sets
// this so takeoff/post-flight triage (`fly.ts`'s `runBoardTriage`) can tell a
// deliberately-placed task apart from one it last sorted itself, and leave the
// former exactly where the operator put it instead of silently re-ranking it
// away. Cleared implicitly once a task leaves the open queue (done/deferred);
// re-pinned on the next explicit operator reorder.
const M16_TASK_PRIORITY_PINNED = `
ALTER TABLE tasks ADD COLUMN priority_pinned INTEGER NOT NULL DEFAULT 0 CHECK (priority_pinned IN (0,1));
`;

// v17: SOUL evolution loop, un-ratify affordance (board web-mswqemor-ab3jsu) —
// ratifySoulAmendment overwrote the live `soul` text with no way back short of
// a manual SQL edit (the incident that opened this board item: an operator
// ratified a proposal by mistake and had the flag "restored by hand").
// `soul_previous` snapshots the `soul` text ratify is about to overwrite;
// `soul_previous_at` records when. unratifySoulAmendment (mutate.ts) restores
// from it and clears both — one level of undo, not a full history.
const M17_SOUL_PREVIOUS = `
ALTER TABLE projects ADD COLUMN soul_previous TEXT;
ALTER TABLE projects ADD COLUMN soul_previous_at INTEGER;
`;

// v18: epic 0009's still-open slice — "re-measure both mechanisms once
// extension telemetry (record.extended) accumulates". `telemetry.ts`'s
// `FiringRecord.extended` (set true only when a firing died mid-unit and
// received a FINISH-LINE EXTENSION, founder policy 2026-08-20) was already
// captured in the raw `events` JSON payload but never projected into
// `metrics` — unqueryable, so it could never actually accumulate into the
// re-measurement the epic promised. Same NULL-means-"not applicable" shape
// as v15's `resumed`: `extended` is never coerced to 0, since an ordinary
// (non-extended) firing isn't "extension that didn't happen", it's a firing
// the concept never applied to.
const M18_METRICS_EXTENDED = `
ALTER TABLE metrics ADD COLUMN extended INTEGER CHECK (extended IS NULL OR extended IN (0,1));
`;

// v19: cost semantics v3 slice 3 (epic 0013, board web-msw01sww-869dqi) —
// `telemetry.ts`'s `FiringRecord.realCostUsd` (slice 2) was computed and
// captured in the raw `events` JSON payload but never projected into
// `metrics`, so the dashboard's read model (which queries `metrics`, not
// `events`, for the flight log) had no column to surface it from. NULL means
// "not computed for this firing" (unconfigured subscription price/usage-pool
// dirs, or a firing recorded before this column existed) — the dashboard
// falls back to showing only the existing list-price `cost_usd`, same
// null-is-not-zero discipline as v15's `resumed`/v18's `extended`.
const M19_METRICS_REAL_COST = `
ALTER TABLE metrics ADD COLUMN real_cost_usd REAL;
`;

// v20: FLEET WISDOM storage (board web-msnt26xe-pc4pzp) — the slot
// `flight/fleet-wisdom-mining.ts`'s pure `mineFleetWisdom` decision writes to
// once a learning has generalized across enough distinct projects, mirroring
// `projects.soul`/`soul_proposed` (M14) at fleet scope. A dedicated
// single-row table rather than a new projects column: this text is shared
// across every project, not owned by one, so it cannot live on any single
// project's row. The `id = 'fleet'` CHECK plus the seed INSERT below
// guarantee exactly one row exists for the lifetime of the database — every
// reader and writer can address it without a lookup. `wisdom_proposed`/
// `wisdom_proposed_at` are the pending-amendment pair a future post-flight
// step (mirroring `fly.ts`'s SOUL mining call) will write to; ratify/dismiss
// (`mutate.ts`) resolve them the same way `ratifySoulAmendment`/
// `dismissSoulProposal` do for a project's SOUL. The ratify/dismiss UI and
// the fly.ts wiring are follow-up slices — this lands the storage first,
// same staged rollout SOUL evolution itself used (M13 → M14 → the fly.ts
// call landed much later).
const M20_FLEET_WISDOM = `
CREATE TABLE fleet (
  id                 TEXT    PRIMARY KEY CHECK (id = 'fleet'),
  wisdom             TEXT    NOT NULL DEFAULT '',
  wisdom_proposed    TEXT,
  wisdom_proposed_at INTEGER
) STRICT;
INSERT INTO fleet (id, wisdom) VALUES ('fleet', '');
`;

// v21: completion tag REQUIRED slice 3/3 (board web-msnshawt-1yd7px) —
// `telemetry.ts`'s `FiringRecord.completionMissing` (d761e429) was already
// captured in the raw `events` JSON payload but never projected into
// `metrics`, so the study/dashboard couldn't filter for it via SQL. Unlike
// v15/v18's `resumed`/`extended`, this flag is ALWAYS computed (never
// "not applicable" for a shipped firing) — so it follows the non-nullable
// boolean shape of `shipped`/`self_reported` (M1) instead: NOT NULL DEFAULT 0.
const M21_METRICS_COMPLETION_MISSING = `
ALTER TABLE metrics ADD COLUMN completion_missing INTEGER NOT NULL DEFAULT 0 CHECK (completion_missing IN (0,1));
`;

// v22: FIRING NUMBER COLLISION fix (board web-mtbay6wd-hz0p0m) — loop.ts's
// firing number used to be `(await deps.firingCount()) + 1`, a plain read of
// `COUNT(*) FROM metrics`. Two fleet lanes racing that read before either had
// recorded a firing computed the identical next number — the live DB issued
// duplicate firing numbers for the same project. `firing_seq` gives every
// project a durable counter that `reserveNextFiring` (engine's
// adapters/store.ts) advances with a single INSERT..ON CONFLICT..RETURNING
// statement — atomic against concurrent writers the same way SQLite already
// serializes any other write, so two lanes calling it back-to-back always get
// distinct sequential numbers instead of colliding. Backfilled from each
// project's existing `metrics` row count so upgrading an already-flying
// project keeps its numbering continuous instead of restarting at 1.
const M22_FIRING_SEQ = `
CREATE TABLE firing_seq (
  project_id TEXT    PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  n          INTEGER NOT NULL CHECK (n >= 0)
) STRICT;

INSERT INTO firing_seq (project_id, n)
  SELECT project_id, COUNT(*) FROM metrics GROUP BY project_id;
`;

/**
 * Guards the exact failure mode FLEET INTENT CLAIMS reseed exists to catch:
 * two fleet siblings independently author a migration and both pick the same
 * next version number (M15's comment documents a real overnight collision,
 * silently renumbered by hand after the fact). Passive git-status awareness
 * (fleet-digest.ts's `touching:` line) can miss the window entirely — this
 * makes the collision impossible to ship silently: any consumer that imports
 * MIGRATIONS (the whole app, transitively) fails fast with a message naming
 * the exact duplicate, instead of surfacing later as a cryptic SQLite
 * PRIMARY KEY violation deep inside migrate()'s transaction.
 */
export function validateMigrations(migrations: readonly Migration[]): void {
  const seen = new Set<number>();
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Error(
        `duplicate migration version ${m.version}: two migrations both claim it (colliding entry is "${m.name}") — a fleet migration-number collision; renumber one of them`,
      );
    }
    seen.add(m.version);
    if (m.name.trim().length === 0) {
      throw new Error(`migration version ${m.version} has an empty name`);
    }
    if (m.up.trim().length === 0) {
      throw new Error(`migration ${m.version} ("${m.name}") has empty SQL`);
    }
  }
  const sorted = [...seen].sort((a, b) => a - b);
  sorted.forEach((v, i) => {
    if (v !== i + 1) {
      throw new Error(
        `migration versions must be contiguous and ascending from 1; got [${sorted.join(', ')}]`,
      );
    }
  });
}

/** Append-only, ascending, contiguous from version 1. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'initial_schema', up: M1_INITIAL },
  { version: 2, name: 'metrics_ground_truth', up: M2_METRICS_GROUND_TRUTH },
  { version: 3, name: 'project_index', up: M3_PROJECT_INDEX },
  { version: 4, name: 'project_search', up: M4_PROJECT_SEARCH },
  { version: 5, name: 'task_steering', up: M5_TASK_STEERING },
  { version: 6, name: 'commit_subject', up: M6_COMMIT_SUBJECT },
  { version: 7, name: 'metrics_completion', up: M7_METRICS_COMPLETION },
  { version: 8, name: 'backlog_path', up: M8_BACKLOG_PATH },
  { version: 9, name: 'metrics_test_first', up: M9_METRICS_TEST_FIRST },
  { version: 10, name: 'flight_pause', up: M10_FLIGHT_PAUSE },
  { version: 11, name: 'metrics_pick_discipline', up: M11_METRICS_PICK_DISCIPLINE },
  { version: 12, name: 'task_source_github', up: M12_TASK_SOURCE_GITHUB },
  { version: 13, name: 'soul_reviewed', up: M13_SOUL_REVIEWED },
  { version: 14, name: 'soul_proposed', up: M14_SOUL_PROPOSED },
  { version: 15, name: 'metrics_resumed', up: M15_METRICS_RESUMED },
  { version: 16, name: 'task_priority_pinned', up: M16_TASK_PRIORITY_PINNED },
  { version: 17, name: 'soul_previous', up: M17_SOUL_PREVIOUS },
  { version: 18, name: 'metrics_extended', up: M18_METRICS_EXTENDED },
  { version: 19, name: 'metrics_real_cost', up: M19_METRICS_REAL_COST },
  { version: 20, name: 'fleet_wisdom', up: M20_FLEET_WISDOM },
  { version: 21, name: 'metrics_completion_missing', up: M21_METRICS_COMPLETION_MISSING },
  { version: 22, name: 'firing_seq', up: M22_FIRING_SEQ },
];

validateMigrations(MIGRATIONS);

export const LATEST_VERSION: number = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

/** The core tables the migrations create (excludes runner-owned schema_migrations). */
export const CORE_TABLES = ['projects', 'events', 'metrics', 'tasks', 'versions'] as const;

/** The project-index tables added in v3 (kept separate so CORE_TABLES stays the M1 five). */
export const INDEX_TABLES = ['project_index', 'project_index_meta'] as const;

/** The full-text search table added in v4 (FTS5 virtual table). */
export const SEARCH_TABLES = ['project_search'] as const;

/** The fleet-wide singleton table added in v20 (kept separate — it holds no
 *  per-project data, so it doesn't belong in CORE_TABLES). */
export const FLEET_TABLES = ['fleet'] as const;

/** The atomic per-project firing-number counter added in v22 (kept separate —
 *  a utility table for `reserveNextFiring`, not per-project domain data in
 *  the CORE_TABLES sense). */
export const FIRING_SEQ_TABLES = ['firing_seq'] as const;
