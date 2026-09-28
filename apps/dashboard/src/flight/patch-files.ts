// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

const HEADER = 'diff --git ';
// A header's a/ side, bare or quoted: the line must open with one to be a
// real header.
const A_SIDE = /^(?:"a\/(?:[^"\\]|\\.)*"|a\/)/;
// A quoted b/ side always closes the header line. An unquoted a/ side can't
// contain the `"` that would fake one, since git quotes any path with a `"`.
const QUOTED_B_SIDE = / "b\/((?:[^"\\]|\\.)*)"$/;
const MOVE_TARGET = /^(?:rename|copy) to (.+)$/m;
const LAST_B_SIDE = / b\/(.+)$/;

/**
 * File paths (`b/<path>` side of `diff --git`) touched by a git-show/git-diff
 * patch — the CURRENT, post-change path. A plain edit has an identical a/
 * and b/ path, but a rename does not: using b/ means a file renamed INTO a
 * directory is correctly seen as touching it, and a file renamed OUT of a
 * directory correctly is not, even though the diff header still names the
 * old a/ path too. Git quotes each side on its own, wrapping it in double
 * quotes (with non-ASCII/special bytes octal-escaped) whenever its path
 * isn't plain ASCII — the `"` sits outside the `a/`/`b/` prefix, not between
 * it and the path — and a quoted b/ side is returned with its escapes as
 * git wrote them. A SPACE is not special to git, so a path like
 * `docs/User Guide.md` stays bare in the header and can't be split at the
 * first space. An unquoted b/ side is read the way git's own apply.c reads
 * it: from the block's `rename to`/`copy to` line when there is one, else
 * as the two equal halves of an `a/X b/X` header. Only a header neither
 * rule fits, which git itself never writes, falls back to the text after
 * the last ` b/`. Shared by deliverable.ts's UX-EXPRESSION check
 * and mutation-scope.ts's patch-scoped mutation-script resolver — both need
 * "which files does this patch currently touch" from the same patch text.
 */
export function touchedFilesInPatch(patch: string): readonly string[] {
  return patch
    .split(/^(?=diff --git )/m)
    .map(currentPathOfBlock)
    .filter((path): path is string => path !== null);
}

/** The b/ path of one `diff --git` block, or null when it opens no header. */
function currentPathOfBlock(block: string): string | null {
  if (!block.startsWith(HEADER)) return null;
  const sides = block.split(/\r?\n/, 1)[0]!.slice(HEADER.length);
  if (!A_SIDE.test(sides)) return null;
  const quoted = QUOTED_B_SIDE.exec(sides);
  if (quoted) return quoted[1]!;
  const moved = MOVE_TARGET.exec(block);
  if (moved) return moved[1]!;
  return equalHalves(sides) ?? LAST_B_SIDE.exec(sides)?.[1] ?? null;
}

/** `X` when the header's sides read `a/X b/X`, as every non-rename header does. */
function equalHalves(sides: string): string | null {
  const length = (sides.length - 'a/ b/'.length) / 2;
  const path = sides.slice('a/'.length, 'a/'.length + length);
  return sides === `a/${path} b/${path}` ? path : null;
}
