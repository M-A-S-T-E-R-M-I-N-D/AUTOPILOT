// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * File paths (`b/<path>` side of `diff --git`) touched by a git-show/git-diff
 * patch — the CURRENT, post-change path. A plain edit has an identical a/
 * and b/ path, but a rename does not: using b/ means a file renamed INTO a
 * directory is correctly seen as touching it, and a file renamed OUT of a
 * directory correctly is not, even though the diff header still names the
 * old a/ path too. Git wraps BOTH sides in double quotes (with non-ASCII/
 * special bytes octal-escaped) whenever a path isn't plain ASCII — the `"`
 * sits outside the `a/`/`b/` prefix, not between it and the path — so the b/
 * side is matched as either a bare `\S+` run or a quoted, escape-aware run;
 * one of the two alternatives always populates its capture group on a
 * match, so the `!` is safe even though TypeScript can't prove that from the
 * regex shape alone. Shared by deliverable.ts's UX-EXPRESSION check and
 * mutation-scope.ts's patch-scoped mutation-script resolver — both need
 * "which files does this patch currently touch" from the same patch text.
 */
export function touchedFilesInPatch(patch: string): readonly string[] {
  const re = /^diff --git (?:"a\/(?:[^"\\]|\\.)*"|a\/\S+) (?:"b\/((?:[^"\\]|\\.)*)"|b\/(\S+))/gm;
  return Array.from(patch.matchAll(re), (m) => (m[1] ?? m[2])!);
}
