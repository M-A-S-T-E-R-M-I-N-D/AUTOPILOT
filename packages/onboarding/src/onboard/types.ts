// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { ProjectStatus, TaskSource, Severity, Dimension } from '@autopilot/store';
import type { FsSnapshot } from '../gate/snapshot.js';
import type { GateDetection } from '../gate/types.js';
import type { FileSource, IndexStorePort, ContentIndexPort } from '../index/ports.js';
import type { IndexDiff } from '../index/model.js';
import type { BackupVcs, LockResult } from '../backup/types.js';
import type { FolderTriage } from './folder-triage.js';

/** A registered project, as the onboarding layer sees it. */
export interface ProjectRecord {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly rootPath: string;
  readonly status: ProjectStatus;
  readonly soul: string | null;
  readonly gateConfig: string | null;
  /** Repo-root-relative path to this project's own backlog file (BACKLOG*.md /
   *  TODO.md), or null when it has none. See {@link detectBacklogPath}. */
  readonly backlogPath: string | null;
}

export interface RegisterInput {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly rootPath: string;
  readonly soul: string;
  readonly gateConfig: string;
  readonly backlogPath: string | null;
}

/** A seed task for the project's board. */
export interface BoardTask {
  readonly title: string;
  readonly body?: string;
  readonly source: TaskSource;
  readonly severity?: Severity;
  readonly dimension?: Dimension;
}

/** The backup refs a lock produces (MASTER-PLAN §7): MYTH / LEGACY / flight. */
export interface BackupRefs {
  readonly myth: string;
  readonly legacy: string;
  readonly flight: string;
}

/** Persistence boundary for projects + their board (the SQLite adapter implements it). */
export interface ProjectStorePort {
  findByRoot(rootPath: string): ProjectRecord | null;
  register(input: RegisterInput): void;
  seedBoard(projectId: string, tasks: readonly BoardTask[]): void;
  /** Record the MYTH/LEGACY/flight refs in the versions projection. Idempotent. */
  recordBackup(projectId: string, refs: BackupRefs): void;
}

export interface OnboardInput {
  readonly root: string;
  readonly name?: string;
  readonly slug?: string;
}

export interface OnboardDeps {
  readonly vcs: BackupVcs;
  readonly readSnapshot: (root: string) => FsSnapshot;
  readonly fileSource: FileSource;
  readonly indexStore: IndexStorePort;
  /** Optional full-text sink (M4 RAG). When present, onboarding makes the repo searchable. */
  readonly contentIndex?: ContentIndexPort;
  readonly projects: ProjectStorePort;
  readonly newId: () => string;
}

export interface OnboardResult {
  readonly projectId: string;
  readonly resumed: boolean;
  readonly lock: LockResult;
  readonly gate: GateDetection;
  readonly indexDiff: IndexDiff;
  /** Freshly detected this call (like {@link gate}) — not the stored value, so
   *  it reflects the repo as it is right now even for a resumed project. A
   *  `Backlog: <path>` line in a resumed project's SOUL overrides the filename
   *  heuristic (see {@link parseSoulBacklogPath}). */
  readonly backlogPath: string | null;
  /** Freshly detected this call (like {@link gate}) — what kind of folder this
   *  is (code, docs, media, data, mixed, empty). See {@link triageFolder}. */
  readonly triage: FolderTriage;
}
