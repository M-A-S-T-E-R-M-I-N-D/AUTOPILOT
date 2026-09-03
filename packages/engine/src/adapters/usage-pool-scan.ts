// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cost semantics v3 (docs/epics/0013-cost-semantics-v3.md) slice 1 — the
 * impure half: recursively reads `*.jsonl` transcript files under a set of
 * caller-supplied directories (each a `~/.claude`-style projects root, or
 * any tree of session transcript files — the pool's real scope is an
 * operator-supplied composition-root concern, not this module's) and sums
 * their list-price cost via ../usage-pool.js. Read-only, never throws: a
 * missing or unreadable directory contributes nothing rather than failing
 * the whole scan (the epic's "graceful absence" constraint).
 */

import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import {
  parseTranscriptJsonl,
  sumListPriceCostUsd,
  type TranscriptCostEntry,
} from '../usage-pool.js';
import type { UsagePoolPort } from '../ports.js';

const DEFAULT_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface UsagePoolScanResult {
  /**
   * Summed list-price cost across every readable directory, or `null` when
   * NOT ONE of `dirs` was readable at all (the pool is entirely
   * inaccessible — e.g. no `~/.claude` on this machine — distinct from a
   * readable-but-genuinely-zero-usage pool, which sums to `0`).
   */
  readonly totalUsd: number | null;
  readonly dirsScanned: number;
  readonly filesScanned: number;
}

/** Every `.jsonl` file under `dir`, recursively, or `null` if `dir` itself can't be listed. */
function collectJsonlFiles(dir: string): string[] | null {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // A nested subdirectory that fails to list (e.g. a permissions gap on
      // one session folder) contributes nothing rather than losing the rest
      // of this directory's otherwise-readable files.
      files.push(...(collectJsonlFiles(full) ?? []));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Sum this machine's trailing-`windowDays` list-price-equivalent Claude
 * usage across `dirs`, deduplicated by message id (see usage-pool.ts).
 */
export function scanUsagePoolListPriceUsd(
  dirs: readonly string[],
  nowMs: number,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): UsagePoolScanResult {
  let dirsScanned = 0;
  let filesScanned = 0;
  const allEntries: TranscriptCostEntry[] = [];
  for (const dir of dirs) {
    const files = collectJsonlFiles(dir);
    if (files === null) continue; // missing/unreadable — contributes nothing
    dirsScanned += 1;
    for (const file of files) {
      let raw: string;
      try {
        raw = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      filesScanned += 1;
      allEntries.push(...parseTranscriptJsonl(raw));
    }
  }
  if (dirsScanned === 0) return { totalUsd: null, dirsScanned: 0, filesScanned: 0 };
  const windowStartMs = nowMs - windowDays * MS_PER_DAY;
  return {
    totalUsd: sumListPriceCostUsd(allEntries, windowStartMs, nowMs),
    dirsScanned,
    filesScanned,
  };
}

/**
 * Real {@link UsagePoolPort} — the composition-root adapter `firing.ts`
 * calls through instead of touching the filesystem itself, so the pure
 * business logic stays testable without real directories (this module's own
 * exports are unit-tested against temp-dir fixtures; `firing.ts`'s tests use
 * a fake of this port instead).
 */
export class RealUsagePool implements UsagePoolPort {
  scanListPriceUsd(dirs: readonly string[], nowMs: number): Promise<number | null> {
    return Promise.resolve(scanUsagePoolListPriceUsd(dirs, nowMs).totalUsd);
  }
}
