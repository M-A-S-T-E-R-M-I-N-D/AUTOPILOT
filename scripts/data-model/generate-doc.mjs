// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * data-model/generate-doc — regenerates docs/DATA-MODEL.md from the REAL
 * SQLite schema: `packages/store/src/schema.ts`'s `MIGRATIONS` applied to a
 * fresh `:memory:` database, then introspected via `PRAGMA table_info` /
 * `PRAGMA foreign_key_list` / `PRAGMA index_list` and `sqlite_master.sql` —
 * not a hand-maintained doc that can drift from what migrate() actually
 * creates. The whole file is generated (no hand-authored sections to
 * preserve), so unlike `architecture:update` there is no marker block.
 *
 * `--check` compares the freshly rendered doc (timestamp stripped) against
 * what's committed and fails without writing if it differs (the
 * `ci:data-model` gate, wired into `pnpm verify`); with no flag it writes
 * the refreshed doc in place (`pnpm data-model:update`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_TABLES,
  INDEX_TABLES,
  SEARCH_TABLES,
  FLEET_TABLES,
  FIRING_SEQ_TABLES,
  MIGRATIONS,
  migrate,
  openStore,
} from '../../packages/store/dist/index.js';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const DOC_PATH = join(repoRoot, 'docs', 'DATA-MODEL.md');

/** Created inline by `packages/store/src/migrate.ts` — not exported, since
 * it is runner infrastructure rather than an application table, but it is
 * real committed schema every store has and belongs in the doc. */
const RUNNER_TABLES = ['schema_migrations'];

// Every exported *_TABLES constant belongs here. `fleet` (v20) and
// `firing_seq` (v22) were both exported by the schema and both omitted from
// this list, so they shipped undocumented while `ci:data-model --check` stayed
// green — the check compares the doc against THIS generator's own output, so a
// table it never enumerates is invisible to it. The non-tautological half now
// lives in packages/store/test/migrate.test.ts, which asserts the constants
// against the real migrated schema.
const GROUPS = [
  { title: 'Core tables', tables: CORE_TABLES },
  { title: 'Project index tables', tables: INDEX_TABLES },
  { title: 'Full-text search tables', tables: SEARCH_TABLES },
  { title: 'Fleet table', tables: FLEET_TABLES },
  { title: 'Firing sequence table', tables: FIRING_SEQ_TABLES },
  { title: 'Migration runner table', tables: RUNNER_TABLES },
];

function buildSchema() {
  const store = openStore(':memory:');
  migrate(store);
  return store;
}

function tableInfo(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function foreignKeyList(db, table) {
  return db.prepare(`PRAGMA foreign_key_list(${table})`).all();
}

function indexList(db, table) {
  return db
    .prepare(`PRAGMA index_list(${table})`)
    .all()
    .filter((idx) => !idx.name.startsWith('sqlite_autoindex_'));
}

function indexColumns(db, indexName) {
  return db
    .prepare(`PRAGMA index_info(${indexName})`)
    .all()
    .map((c) => c.name);
}

function createSql(db, table) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table);
  return row ? row.sql.trim() : '';
}

function renderColumnsTable(columns) {
  const lines = ['| Column | Type | Not Null | Default | Primary Key |', '|---|---|---|---|---|'];
  for (const col of columns) {
    const type = col.type || '_(untyped — FTS5 column)_';
    const notNull = col.notnull ? 'yes' : '';
    const dflt = col.dflt_value === null ? '' : `\`${col.dflt_value}\``;
    const pk = col.pk ? String(col.pk) : '';
    lines.push(`| \`${col.name}\` | ${type} | ${notNull} | ${dflt} | ${pk} |`);
  }
  return lines.join('\n');
}

function renderForeignKeys(fks) {
  if (fks.length === 0) return '_None._';
  return fks
    .map(
      (fk) =>
        `- \`${fk.from}\` → \`${fk.table}.${fk.to}\`` +
        ` (ON DELETE ${fk.on_delete}, ON UPDATE ${fk.on_update})`,
    )
    .join('\n');
}

function renderIndexes(db, table) {
  const idxs = indexList(db, table);
  if (idxs.length === 0) return '_None beyond the primary key._';
  return idxs
    .map((idx) => {
      const cols = indexColumns(db, idx.name).join(', ');
      const unique = idx.unique ? ' UNIQUE' : '';
      return `- \`${idx.name}\`${unique} (${cols})`;
    })
    .join('\n');
}

function renderTable(db, table) {
  const columns = tableInfo(db, table);
  const fks = foreignKeyList(db, table);
  return [
    `### \`${table}\``,
    '',
    renderColumnsTable(columns),
    '',
    '**Relationships:**',
    '',
    renderForeignKeys(fks),
    '',
    '**Indexes:**',
    '',
    renderIndexes(db, table),
    '',
    '<details><summary>Raw <code>CREATE TABLE</code></summary>',
    '',
    '```sql',
    createSql(db, table),
    '```',
    '',
    '</details>',
  ].join('\n');
}

function renderMigrationHistory() {
  const lines = ['| Version | Name |', '|---|---|'];
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    lines.push(`| ${m.version} | \`${m.name}\` |`);
  }
  return lines.join('\n');
}

function renderDoc(db) {
  const generatedAt = new Date().toISOString();
  const sections = [
    '<!--',
    // REUSE-IgnoreStart
    'SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND',
    'SPDX-License-Identifier: Apache-2.0',
    // REUSE-IgnoreEnd
    '-->',
    '',
    '# AUTOPILOT data model',
    '',
    `_Generated ${generatedAt} by \`pnpm data-model:update\` from` +
      " `packages/store/src/schema.ts`'s `MIGRATIONS`, applied to a fresh" +
      ' `:memory:` database and introspected via `PRAGMA table_info` /' +
      ' `PRAGMA foreign_key_list` / `PRAGMA index_list` — the real schema' +
      ' `migrate()` creates, not a hand-maintained copy that can drift from it._',
    '',
    'Run `pnpm data-model:update` after adding a migration to' +
      ' `packages/store/src/schema.ts`; `pnpm run verify` fails' +
      ' (`ci:data-model`) if this file is stale.',
    '',
  ];

  for (const group of GROUPS) {
    sections.push(`## ${group.title}`, '');
    for (const table of group.tables) {
      sections.push(renderTable(db, table), '');
    }
  }

  sections.push('## Migration history', '', renderMigrationHistory(), '');

  return sections.join('\n');
}

/** The generated doc embeds a `_Generated <timestamp>_` line, which always
 *  differs run to run — strip it before comparing so `--check` only fails on
 *  a REAL drift (a migration added/changed), not on the clock. */
function withoutTimestamp(text) {
  return text.replace(/^_Generated .+$/m, '_Generated_');
}

function main() {
  const check = process.argv.includes('--check');
  const store = buildSchema();
  let next;
  try {
    next = renderDoc(store.db);
  } finally {
    store.close();
  }

  if (check) {
    const source = (() => {
      try {
        return readFileSync(DOC_PATH, 'utf8');
      } catch {
        return '';
      }
    })();
    if (withoutTimestamp(next) !== withoutTimestamp(source)) {
      console.error(
        'data-model-check FAILED: docs/DATA-MODEL.md is stale — run `pnpm data-model:update`' +
          ' and commit the result.',
      );
      process.exit(1);
    }
    console.log('data-model-check OK: docs/DATA-MODEL.md matches the real SQLite schema.');
    return;
  }

  writeFileSync(DOC_PATH, next);
  const tableCount = GROUPS.reduce((n, g) => n + g.tables.length, 0);
  console.log(`generate-doc: docs/DATA-MODEL.md refreshed (${tableCount} tables documented).`);
}

try {
  main();
} catch (err) {
  console.error(`generate-doc FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
