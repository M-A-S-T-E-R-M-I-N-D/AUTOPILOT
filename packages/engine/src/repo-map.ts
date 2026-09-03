// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * REPO-MAP digest — a tiny, auto-generated orientation summary spliced into
 * the firing prompt (packages/engine/src/prompt.ts) so ORIENT reads less: the
 * agent gets top dirs, hot files, the gate, and recent focus areas up front
 * instead of re-discovering them via README + `git log` every firing. Pure +
 * stack-agnostic (the caller supplies already-computed data — onboarding's
 * index summary, the detected gate, recent commit file lists) so this stays
 * unit-testable without touching disk or git, mirroring buildFiringPrompt.
 */

/** One directory's share of the tree, already ranked by the caller (most files first). */
export interface RepoMapDirStat {
  readonly dir: string;
  readonly files: number;
}

export interface RepoMapDigestInput {
  readonly topDirs: readonly RepoMapDirStat[];
  /** Repo-relative paths, already ranked by the caller (e.g. largest first). */
  readonly hotFiles: readonly string[];
  /** Detected gate command labels, in run order (e.g. "typecheck", "test"). */
  readonly gateLabels: readonly string[];
  /** Top-level dirs touched most across recent commits, most-touched first. */
  readonly recentFocus: readonly string[];
}

const TOP_DIRS_LIMIT = 6;
const HOT_FILES_LIMIT = 8;
const RECENT_FOCUS_LIMIT = 5;

/** Render the digest as a compact block, or '' when there is nothing to show. */
export function buildRepoMapDigest(input: RepoMapDigestInput): string {
  const lines: string[] = [];
  if (input.topDirs.length > 0) {
    lines.push(
      `Top dirs: ${input.topDirs
        .slice(0, TOP_DIRS_LIMIT)
        .map((d) => `${d.dir} (${d.files})`)
        .join(', ')}`,
    );
  }
  if (input.hotFiles.length > 0) {
    lines.push(`Hot files: ${input.hotFiles.slice(0, HOT_FILES_LIMIT).join(', ')}`);
  }
  if (input.gateLabels.length > 0) {
    lines.push(`Gate: ${input.gateLabels.join(' · ')}`);
  }
  if (input.recentFocus.length > 0) {
    lines.push(`Recent focus: ${input.recentFocus.slice(0, RECENT_FOCUS_LIMIT).join(', ')}`);
  }
  if (lines.length === 0) return '';
  return ['## REPO-MAP — auto-generated orientation digest', ...lines].join('\n');
}

function topDir(path: string): string {
  const slash = path.indexOf('/');
  return slash === -1 ? '.' : path.slice(0, slash);
}

/**
 * Tally the top-level dirs touched across recent commits, most-frequent
 * first (ties broken alphabetically for determinism). Feeds `recentFocus` —
 * the caller supplies `GitVcs.recentCommits(count)`'s file lists.
 */
export function tallyRecentFocusDirs(
  commits: readonly { readonly files: readonly string[] }[],
  limit = RECENT_FOCUS_LIMIT,
): string[] {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    for (const file of commit.files) {
      const dir = topDir(file);
      counts.set(dir, (counts.get(dir) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([dir]) => dir);
}
