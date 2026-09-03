// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto';
import type { Store, ProjectStatus } from '@autopilot/store';
import type {
  ProjectStorePort,
  ProjectRecord,
  RegisterInput,
  BoardTask,
  BackupRefs,
} from '../onboard/types.js';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  root_path: string;
  status: ProjectStatus;
  soul: string | null;
  gate_config: string | null;
  backlog_path: string | null;
}

/** SQLite adapter for project registration + board seeding (the `projects` and
 *  `tasks` tables). Registration is one row; board seeding is one transaction. */
export class SqliteProjectStore implements ProjectStorePort {
  constructor(
    private readonly store: Store,
    private readonly newTaskId: () => string = () => randomUUID(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  findByRoot(rootPath: string): ProjectRecord | null {
    // Exact match first (the common case, and the only one that should ever
    // match off win32 — a differently-cased path is a genuinely different
    // directory on a case-sensitive filesystem). Falls back to a
    // case-insensitive lookup ONLY on win32, where NTFS paths are
    // case-insensitive: a bare `resolve()` upstream preserves whatever
    // drive-letter casing the caller passed, so `C:\\Users\\operator\\repo`
    // and `c:\\Users\\operator\\repo`
    // otherwise missed each other and onboard() minted a second project
    // whose slug collided with the existing row's UNIQUE constraint (found
    // live 08-27 at ramp launch, web-mtbaagfd-iylna0).
    const row =
      this.selectByRoot('root_path = ?', rootPath) ??
      (process.platform === 'win32'
        ? this.selectByRoot('LOWER(root_path) = LOWER(?)', rootPath)
        : undefined);
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      rootPath: row.root_path,
      status: row.status,
      soul: row.soul,
      gateConfig: row.gate_config,
      backlogPath: row.backlog_path,
    };
  }

  private selectByRoot(whereClause: string, rootPath: string): ProjectRow | undefined {
    return this.store.db
      .prepare(
        `SELECT id, slug, name, root_path, status, soul, gate_config, backlog_path FROM projects WHERE ${whereClause}`,
      )
      .get(rootPath) as ProjectRow | undefined;
  }

  register(input: RegisterInput): void {
    const now = this.now();
    this.store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, soul, gate_config, backlog_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'registered', ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.slug,
        input.name,
        input.rootPath,
        input.soul,
        input.gateConfig,
        input.backlogPath,
        now,
        now,
      );
  }

  recordBackup(projectId: string, refs: BackupRefs): void {
    const now = this.now();
    // INSERT OR IGNORE + a deterministic id ⇒ idempotent: re-locking a seen repo
    // (or backfilling an older project) never duplicates the version rows.
    const insert = this.store.db.prepare(
      `INSERT OR IGNORE INTO versions (id, project_id, tier, ref, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const tiers: readonly [string, string][] = [
      ['myth', refs.myth],
      ['legacy', refs.legacy],
      ['flight', refs.flight],
    ];
    const apply = this.store.db.transaction(() => {
      for (const [tier, ref] of tiers) {
        insert.run(`${projectId}:${tier}`, projectId, tier, ref, now);
      }
    });
    apply();
  }

  seedBoard(projectId: string, tasks: readonly BoardTask[]): void {
    const now = this.now();
    const insert = this.store.db.prepare(
      `INSERT INTO tasks (id, project_id, title, body, status, severity, dimension, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
    );
    const apply = this.store.db.transaction(() => {
      for (const task of tasks) {
        insert.run(
          this.newTaskId(),
          projectId,
          task.title,
          task.body ?? null,
          task.severity ?? null,
          task.dimension ?? null,
          task.source,
          now,
          now,
        );
      }
    });
    apply();
  }
}
