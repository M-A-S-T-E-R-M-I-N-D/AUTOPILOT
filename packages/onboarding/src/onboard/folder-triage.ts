// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * TRIAGE mode's pure classification core (board web-msnioxgz-emkgca,
 * "Generic-folder competence", slice 1): classify ANY folder's contents —
 * not only code repos — and build a category inventory, so onboarding can
 * meet a photos dump, a docs archive, or a data folder with the right mode
 * instead of assuming git+gate. Same purity boundary as gate detection:
 * consumes a read-only {@link FsSnapshot}, never `node:fs`, so it is fully
 * unit-testable and cannot touch the folder. Wiring into the onboarding
 * flow (mode selection, propose-organization, detect+fix) is follow-up
 * slices — this module only answers "what IS this folder?".
 */

import type { FsSnapshot } from '../gate/snapshot.js';

/** What a folder predominantly holds — 'mixed' when nothing dominates. */
export type FolderKind = 'empty' | 'code' | 'docs' | 'media' | 'data' | 'mixed';

/** One inventory line: a category and how many files fell into it. */
export interface FolderInventoryEntry {
  readonly category: 'code' | 'docs' | 'media' | 'data' | 'other';
  readonly count: number;
}

export interface FolderTriage {
  readonly kind: FolderKind;
  /** Non-empty categories, largest first (ties break by category name). */
  readonly inventory: readonly FolderInventoryEntry[];
  readonly totalFiles: number;
}

/** A category must hold at least this share of all files to name the folder's kind. */
export const DOMINANCE_RATIO = 0.6;

/** Manifest basenames that mark a code project regardless of file-count dominance. */
const CODE_MARKERS = new Set([
  'package.json',
  'pyproject.toml',
  'cargo.toml',
  'go.mod',
  'gemfile',
  'pom.xml',
  'build.gradle',
  'makefile',
  'cmakelists.txt',
]);

const CODE_EXT = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'rs',
  'go',
  'java',
  'kt',
  'c',
  'cc',
  'cpp',
  'h',
  'hpp',
  'cs',
  'rb',
  'php',
  'swift',
  'sh',
  'sql',
  'css',
  'html',
]);
const DOCS_EXT = new Set(['md', 'txt', 'rst', 'rtf', 'pdf', 'doc', 'docx', 'odt', 'epub']);
const MEDIA_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'heic',
  'raw',
  'mp3',
  'wav',
  'flac',
  'ogg',
  'mp4',
  'mov',
  'avi',
  'mkv',
  'webm',
]);
const DATA_EXT = new Set([
  'json',
  'csv',
  'tsv',
  'xml',
  'yaml',
  'yml',
  'toml',
  'sqlite',
  'db',
  'parquet',
  'xlsx',
  'xls',
]);

type Category = FolderInventoryEntry['category'];

function categorize(path: string): Category {
  const slash = path.lastIndexOf('/');
  const base = path.slice(slash + 1).toLowerCase();
  const dot = base.lastIndexOf('.');
  // A leading dot (`.gitignore`) is a hidden-file marker, not an extension.
  const ext = dot > 0 ? base.slice(dot + 1) : '';
  if (CODE_EXT.has(ext)) return 'code';
  if (DOCS_EXT.has(ext)) return 'docs';
  if (MEDIA_EXT.has(ext)) return 'media';
  if (DATA_EXT.has(ext)) return 'data';
  return 'other';
}

function hasCodeMarker(files: readonly string[]): boolean {
  return files.some((path) => {
    const slash = path.lastIndexOf('/');
    return CODE_MARKERS.has(path.slice(slash + 1).toLowerCase());
  });
}

/**
 * Classify a folder from its file listing alone. A code-manifest marker
 * (package.json, Cargo.toml, …) names the folder 'code' outright — a repo
 * full of images is still a repo; otherwise the largest category wins only
 * when it holds ≥ {@link DOMINANCE_RATIO} of all files, else 'mixed'.
 * 'other' files count toward the total (diluting dominance) but never name
 * the kind — a folder of unrecognized extensions is 'mixed', not falsely
 * confident.
 */
export function triageFolder(snapshot: FsSnapshot): FolderTriage {
  const { files } = snapshot;
  if (files.length === 0) return { kind: 'empty', inventory: [], totalFiles: 0 };

  const counts = new Map<Category, number>();
  for (const path of files) {
    const category = categorize(path);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const inventory = [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  if (hasCodeMarker(files)) return { kind: 'code', inventory, totalFiles: files.length };

  const top = inventory[0];
  const dominant =
    top !== undefined && top.category !== 'other' && top.count >= files.length * DOMINANCE_RATIO
      ? top.category
      : undefined;
  return { kind: dominant ?? 'mixed', inventory, totalFiles: files.length };
}
