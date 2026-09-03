<!--
SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
SPDX-License-Identifier: Apache-2.0
-->

# AUTOPILOT data model

_Generated 2026-08-27T15:17:57.866Z by `pnpm data-model:update` from `packages/store/src/schema.ts`'s `MIGRATIONS`, applied to a fresh `:memory:` database and introspected via `PRAGMA table_info` / `PRAGMA foreign_key_list` / `PRAGMA index_list` — the real schema `migrate()` creates, not a hand-maintained copy that can drift from it._

Run `pnpm data-model:update` after adding a migration to `packages/store/src/schema.ts`; `pnpm run verify` fails (`ci:data-model`) if this file is stale.

## Core tables

### `projects`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `id` | TEXT | yes |  | 1 |
| `slug` | TEXT | yes |  |  |
| `name` | TEXT | yes |  |  |
| `root_path` | TEXT | yes |  |  |
| `status` | TEXT | yes | `'registered'` |  |
| `soul` | TEXT |  |  |  |
| `gate_config` | TEXT |  |  |  |
| `metadata` | TEXT |  |  |  |
| `created_at` | INTEGER | yes |  |  |
| `updated_at` | INTEGER | yes |  |  |
| `backlog_path` | TEXT |  |  |  |
| `pause_requested` | INTEGER | yes | `0` |  |
| `soul_reviewed` | INTEGER | yes | `0` |  |
| `soul_proposed` | TEXT |  |  |  |
| `soul_proposed_at` | INTEGER |  |  |  |
| `soul_previous` | TEXT |  |  |  |
| `soul_previous_at` | INTEGER |  |  |  |

**Relationships:**

_None._

**Indexes:**

_None beyond the primary key._

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
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
, backlog_path TEXT, pause_requested INTEGER NOT NULL DEFAULT 0 CHECK (pause_requested IN (0,1)), soul_reviewed INTEGER NOT NULL DEFAULT 0 CHECK (soul_reviewed IN (0,1)), soul_proposed TEXT, soul_proposed_at INTEGER, soul_previous TEXT, soul_previous_at INTEGER) STRICT
```

</details>

### `events`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `id` | INTEGER |  |  | 1 |
| `project_id` | TEXT | yes |  |  |
| `firing_id` | TEXT |  |  |  |
| `type` | TEXT | yes |  |  |
| `payload` | TEXT |  |  |  |
| `created_at` | INTEGER | yes |  |  |

**Relationships:**

- `project_id` → `projects.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

**Indexes:**

- `idx_events_firing` (firing_id)
- `idx_events_type` (type)
- `idx_events_project_created` (project_id, created_at)

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  firing_id    TEXT,
  type         TEXT    NOT NULL,
  payload      TEXT,
  created_at   INTEGER NOT NULL
) STRICT
```

</details>

### `metrics`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `id` | INTEGER |  |  | 1 |
| `project_id` | TEXT | yes |  |  |
| `firing_id` | TEXT | yes |  |  |
| `item` | TEXT |  |  |  |
| `kind` | TEXT |  |  |  |
| `sha` | TEXT |  |  |  |
| `head_before` | TEXT |  |  |  |
| `head_after` | TEXT |  |  |  |
| `shipped` | INTEGER | yes | `0` |  |
| `self_reported` | INTEGER | yes | `0` |  |
| `model` | TEXT |  |  |  |
| `cost_usd` | REAL | yes | `0` |  |
| `input_tokens` | INTEGER | yes | `0` |  |
| `output_tokens` | INTEGER | yes | `0` |  |
| `cache_read_tokens` | INTEGER | yes | `0` |  |
| `cache_write_tokens` | INTEGER | yes | `0` |  |
| `turns` | INTEGER | yes | `0` |  |
| `duration_ms` | INTEGER | yes | `0` |  |
| `gate_result` | TEXT |  |  |  |
| `created_at` | INTEGER | yes |  |  |
| `head_advanced` | INTEGER | yes | `0` |  |
| `sha_verified` | INTEGER | yes | `0` |  |
| `commit_subject` | TEXT |  |  |  |
| `completion` | TEXT |  |  |  |
| `test_first` | INTEGER |  |  |  |
| `picked_rank` | INTEGER |  |  |  |
| `deviation_reason` | TEXT |  |  |  |
| `resumed` | INTEGER |  |  |  |
| `extended` | INTEGER |  |  |  |
| `real_cost_usd` | REAL |  |  |  |
| `completion_missing` | INTEGER | yes | `0` |  |

**Relationships:**

- `project_id` → `projects.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

**Indexes:**

- `idx_metrics_kind` (kind)
- `idx_metrics_project_created` (project_id, created_at)

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
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
, head_advanced INTEGER NOT NULL DEFAULT 0, sha_verified  INTEGER NOT NULL DEFAULT 0, commit_subject TEXT, completion TEXT CHECK (completion IS NULL OR completion IN ('slice','complete')), test_first INTEGER CHECK (test_first IS NULL OR test_first IN (0,1)), picked_rank INTEGER CHECK (picked_rank IS NULL OR picked_rank >= 1), deviation_reason TEXT, resumed INTEGER CHECK (resumed IS NULL OR resumed IN (0,1)), extended INTEGER CHECK (extended IS NULL OR extended IN (0,1)), real_cost_usd REAL, completion_missing INTEGER NOT NULL DEFAULT 0 CHECK (completion_missing IN (0,1))) STRICT
```

</details>

### `tasks`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `id` | TEXT | yes |  | 1 |
| `project_id` | TEXT | yes |  |  |
| `title` | TEXT | yes |  |  |
| `body` | TEXT |  |  |  |
| `status` | TEXT | yes | `'queued'` |  |
| `severity` | TEXT |  |  |  |
| `dimension` | TEXT |  |  |  |
| `source` | TEXT | yes | `'self'` |  |
| `assignee` | TEXT |  |  |  |
| `artifacts` | TEXT |  |  |  |
| `created_by` | TEXT |  |  |  |
| `created_at` | INTEGER | yes |  |  |
| `updated_at` | INTEGER | yes |  |  |
| `focus` | INTEGER | yes | `0` |  |
| `priority` | INTEGER |  |  |  |
| `priority_pinned` | INTEGER | yes | `0` |  |

**Relationships:**

- `project_id` → `projects.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

**Indexes:**

- `idx_tasks_focus` (project_id, focus)
- `idx_tasks_dimension` (dimension)
- `idx_tasks_severity` (severity)
- `idx_tasks_project_status` (project_id, status)

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
CREATE TABLE "tasks" (
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
, priority_pinned INTEGER NOT NULL DEFAULT 0 CHECK (priority_pinned IN (0,1))) STRICT
```

</details>

### `versions`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `id` | TEXT | yes |  | 1 |
| `project_id` | TEXT | yes |  |  |
| `tier` | TEXT | yes |  |  |
| `ref` | TEXT | yes |  |  |
| `label` | TEXT |  |  |  |
| `parent_ref` | TEXT |  |  |  |
| `metadata` | TEXT |  |  |  |
| `created_at` | INTEGER | yes |  |  |

**Relationships:**

- `project_id` → `projects.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

**Indexes:**

- `idx_versions_project_ref` UNIQUE (project_id, ref)
- `idx_versions_project` (project_id, created_at)

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
CREATE TABLE versions (
  id           TEXT    PRIMARY KEY,
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tier         TEXT    NOT NULL CHECK (tier IN ('myth','legacy','flight')),
  ref          TEXT    NOT NULL,
  label        TEXT,
  parent_ref   TEXT,
  metadata     TEXT,
  created_at   INTEGER NOT NULL
) STRICT
```

</details>

## Project index tables

### `project_index`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `project_id` | TEXT | yes |  | 1 |
| `path` | TEXT | yes |  | 2 |
| `content_hash` | TEXT | yes |  |  |
| `size` | INTEGER | yes |  |  |
| `language` | TEXT | yes |  |  |
| `updated_at` | INTEGER | yes |  |  |

**Relationships:**

- `project_id` → `projects.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

**Indexes:**

- `idx_project_index_lang` (project_id, language)

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
CREATE TABLE project_index (
  project_id   TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path         TEXT    NOT NULL,
  content_hash TEXT    NOT NULL CHECK (length(content_hash) = 64),
  size         INTEGER NOT NULL CHECK (size >= 0),
  language     TEXT    NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (project_id, path)
) STRICT, WITHOUT ROWID
```

</details>

### `project_index_meta`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `project_id` | TEXT | yes |  | 1 |
| `tree_hash` | TEXT | yes |  |  |
| `file_count` | INTEGER | yes |  |  |
| `total_bytes` | INTEGER | yes |  |  |
| `summary` | TEXT | yes |  |  |
| `hot_files` | TEXT | yes |  |  |
| `tool_version` | TEXT | yes |  |  |
| `built_at` | INTEGER | yes |  |  |
| `updated_at` | INTEGER | yes |  |  |

**Relationships:**

- `project_id` → `projects.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

**Indexes:**

_None beyond the primary key._

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
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
) STRICT
```

</details>

## Full-text search tables

### `project_search`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `project_id` | _(untyped — FTS5 column)_ |  |  |  |
| `path` | _(untyped — FTS5 column)_ |  |  |  |
| `content` | _(untyped — FTS5 column)_ |  |  |  |
| `language` | _(untyped — FTS5 column)_ |  |  |  |

**Relationships:**

_None._

**Indexes:**

_None beyond the primary key._

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
CREATE VIRTUAL TABLE project_search USING fts5(
  project_id UNINDEXED,
  path,
  content,
  language UNINDEXED,
  tokenize = 'trigram'
)
```

</details>

## Fleet table

### `fleet`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `id` | TEXT | yes |  | 1 |
| `wisdom` | TEXT | yes | `''` |  |
| `wisdom_proposed` | TEXT |  |  |  |
| `wisdom_proposed_at` | INTEGER |  |  |  |

**Relationships:**

_None._

**Indexes:**

_None beyond the primary key._

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
CREATE TABLE fleet (
  id                 TEXT    PRIMARY KEY CHECK (id = 'fleet'),
  wisdom             TEXT    NOT NULL DEFAULT '',
  wisdom_proposed    TEXT,
  wisdom_proposed_at INTEGER
) STRICT
```

</details>

## Firing sequence table

### `firing_seq`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `project_id` | TEXT | yes |  | 1 |
| `n` | INTEGER | yes |  |  |

**Relationships:**

- `project_id` → `projects.id` (ON DELETE CASCADE, ON UPDATE NO ACTION)

**Indexes:**

_None beyond the primary key._

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
CREATE TABLE firing_seq (
  project_id TEXT    PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  n          INTEGER NOT NULL CHECK (n >= 0)
) STRICT
```

</details>

## Migration runner table

### `schema_migrations`

| Column | Type | Not Null | Default | Primary Key |
|---|---|---|---|---|
| `version` | INTEGER |  |  | 1 |
| `name` | TEXT | yes |  |  |
| `checksum` | TEXT | yes |  |  |
| `applied_at` | INTEGER | yes |  |  |

**Relationships:**

_None._

**Indexes:**

_None beyond the primary key._

<details><summary>Raw <code>CREATE TABLE</code></summary>

```sql
CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  checksum   TEXT    NOT NULL,
  applied_at INTEGER NOT NULL
) STRICT
```

</details>

## Migration history

| Version | Name |
|---|---|
| 1 | `initial_schema` |
| 2 | `metrics_ground_truth` |
| 3 | `project_index` |
| 4 | `project_search` |
| 5 | `task_steering` |
| 6 | `commit_subject` |
| 7 | `metrics_completion` |
| 8 | `backlog_path` |
| 9 | `metrics_test_first` |
| 10 | `flight_pause` |
| 11 | `metrics_pick_discipline` |
| 12 | `task_source_github` |
| 13 | `soul_reviewed` |
| 14 | `soul_proposed` |
| 15 | `metrics_resumed` |
| 16 | `task_priority_pinned` |
| 17 | `soul_previous` |
| 18 | `metrics_extended` |
| 19 | `metrics_real_cost` |
| 20 | `fleet_wisdom` |
| 21 | `metrics_completion_missing` |
| 22 | `firing_seq` |
