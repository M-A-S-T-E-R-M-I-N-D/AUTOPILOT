// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { Language } from '@autopilot/store';

export type { Language };

/** One indexed file — the atom of the content-hash index. */
export interface IndexEntry {
  readonly path: string; // repo-relative, POSIX
  readonly contentHash: string; // sha256 hex (64)
  readonly size: number; // bytes
  readonly language: Language;
}

export interface LanguageStat {
  readonly language: Language;
  readonly files: number;
  readonly bytes: number;
}

export interface DirStat {
  readonly dir: string;
  readonly files: number;
}

export interface StructureSummary {
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly languages: readonly LanguageStat[]; // desc by bytes
  readonly topDirs: readonly DirStat[]; // desc by files
  readonly maxDepth: number;
}

export interface HotFile {
  readonly path: string;
  readonly size: number;
  readonly language: Language;
}

/** The full built index (entries sorted by path). */
export interface ProjectIndex {
  readonly entries: readonly IndexEntry[];
  readonly treeHash: string;
  readonly summary: StructureSummary;
  readonly hotFiles: readonly HotFile[];
}

/** The delta between a stored index and the current working tree. */
export interface IndexDiff {
  readonly added: readonly IndexEntry[];
  readonly changed: readonly IndexEntry[]; // same path, new hash
  readonly removed: readonly string[]; // paths gone
  readonly unchanged: readonly IndexEntry[];
}
