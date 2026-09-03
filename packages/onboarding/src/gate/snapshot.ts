// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * A frozen, read-only view of a repo — the purity boundary for gate detection
 * (`docs/M2-ONBOARDING-PLAN.md`). Consuming it is 100% synchronous and
 * side-effect-free: the detector depends only on this abstraction, never on
 * `node:fs`, so it is fully unit-testable and CANNOT touch the repo (which is
 * exactly why detection never violates the "no touch before MYTH/LEGACY" rule).
 * The real filesystem walk lives in `../adapters/fs-snapshot.ts`.
 */

export interface FsSnapshot {
  /** Every file, as repo-root-relative POSIX paths. */
  readonly files: readonly string[];
  /** Exact-path presence. */
  has(path: string): boolean;
  /** True if any listed file ends with one of the given suffixes (e.g. '.rs'). */
  hasSuffix(...suffixes: readonly string[]): boolean;
  /** True if any file's basename (or full path) matches a simple glob (`*`, `?`). */
  hasGlob(pattern: string): boolean;
  /** Pre-loaded manifest text if captured, else null (never triggers I/O). */
  read(path: string): string | null;
}

export interface FsSnapshotData {
  readonly files: readonly string[];
  readonly contents: Readonly<Record<string, string>>;
}

function basename(path: string): string {
  // No ternary on `slash === -1`: when lastIndexOf finds no '/', slash is -1
  // and `path.slice(0)` already equals `path` — the same value the branch
  // would have returned.
  const slash = path.lastIndexOf('/');
  return path.slice(slash + 1);
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

/** Build an immutable {@link FsSnapshot} from plain data (pure — used everywhere in tests). */
export function makeFsSnapshot(data: FsSnapshotData): FsSnapshot {
  const fileSet = new Set(data.files);
  return {
    files: data.files,
    has: (path) => fileSet.has(path),
    hasSuffix: (...suffixes) => data.files.some((f) => suffixes.some((s) => f.endsWith(s))),
    hasGlob: (pattern) => {
      const re = globToRegExp(pattern);
      return data.files.some((f) => re.test(basename(f)) || re.test(f));
    },
    read: (path) => data.contents[path] ?? null,
  };
}
