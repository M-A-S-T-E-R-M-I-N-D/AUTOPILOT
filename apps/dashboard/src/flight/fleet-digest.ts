// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Builds the FLEET digest spliced into every firing prompt
 * (packages/engine/src/prompt.ts's `fleetSection`) — coordination-before-
 * parallelism (RESEARCH-LIBRARY fleet anti-duplication: a shared awareness
 * substrate drops duplicated teammate work 78%->0%). Extracted from fly.ts
 * for direct unit-testability over real temp git worktrees.
 */

import { execFileSync } from 'node:child_process';
import { fenceTitle, GitVcs } from '@autopilot/engine';
import type { Store } from '@autopilot/store';
import { declaredIntent, INTENT_FILE_NAME, listWorktreePaths } from './intent-claims.js';

// The claims lifecycle (declare → retire → verify) lives in intent-claims.ts
// (ADR-0006); re-exported here so existing consumers keep one import site.
export {
  claimSurvivesFiring,
  clearDeclaredIntent,
  detectIntentCollisions,
  INTENT_FILE_NAME,
  likelyPrimaryPathFromTitle,
  parseIntentPrimaryFile,
  readSiblingIntentClaims,
  writeDeclaredIntent,
} from './intent-claims.js';

/** Cap on how many currently-dirty file paths a sibling's digest line lists. */
const MAX_TOUCHING_FILES = 5;

/** Cap on how many already-committed-but-unlanded file paths a sibling's digest line lists. */
const MAX_UNLANDED_FILES = 5;

/**
 * A sibling's CURRENTLY-touched files — its linked worktree's uncommitted
 * changes, read directly off disk with zero cooperation required from the
 * agent flying it. Widens fleet awareness past "what's claimed on the
 * board" and "what was last committed" to the drive-by/self-initiated work
 * in between: a primary-file work-intent signal for units no board task
 * names (RESEARCH-LIBRARY fleet anti-duplication, defense-stack item 2).
 */
function touchingFiles(worktreePath: string): string[] {
  let out: string;
  try {
    out = execFileSync('git', ['-C', worktreePath, 'status', '--porcelain=v1'], {
      encoding: 'utf8',
      windowsHide: true,
    });
  } catch {
    return []; // worktree gone, inaccessible, or mid-teardown — not fatal.
  }
  const files = out
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).trim())
    // The intent file is coordination metadata, not work-in-progress — it gets
    // its own `intent:` rendering; listing it under `touching:` would be noise
    // (and, before .gitignore catches up in a target repo, misleading).
    .filter((path) => path !== '' && path !== INTENT_FILE_NAME);
  return [...new Set(files)];
}

function formatFileList(label: string, files: readonly string[], max: number): string {
  if (files.length === 0) return '';
  const shown = files.slice(0, max);
  const rest = files.length - shown.length;
  return `; ${label}: ${shown.join(', ')}${rest > 0 ? ` +${rest} more` : ''}`;
}

/**
 * A sibling's OWN commits not yet landed onto the shared base branch — the
 * durable half of fleet awareness `touchingFiles` can't see: once a sibling
 * commits (fly.ts does this every firing) its working tree goes clean again,
 * so `touching:` shows nothing even though the commit sits unlanded on its
 * branch, fully able to collide with another sibling across MULTIPLE
 * firings until it's actually landed (RESEARCH-LIBRARY fleet
 * anti-duplication — the real overnight v13 migration collision was exactly
 * this: two siblings' unlanded commits, invisible to each other's digest).
 * Reuses `GitVcs.commitsAhead`'s `ref` parameter — refs are shared across a
 * repo's linked worktrees, so no worktree path is needed, unlike
 * `touchingFiles`. Degrades to `[]` when there's no discoverable base branch
 * or the sibling is already even with it.
 */
async function unlandedFiles(vcs: GitVcs, base: string, branch: string): Promise<string[]> {
  if (base === '' || base === branch) return [];
  const commits = await vcs.commitsAhead(base, branch);
  return [...new Set(commits.flatMap((c) => c.files))];
}

/** Unit separator (ASCII 0x1F) — never appears in a commit subject, so it's a safe `for-each-ref` field delimiter. */
const REF_SUBJECT_SEP = '\u001f';

/**
 * FLEET digest for the firing prompt (fly.ts, same-folder parallel
 * instances): what sibling instances have CLAIMED on the board, each
 * sibling worktree branch's last commit subject, its DECLARED intent
 * ({@link INTENT_FILE_NAME}), what its uncommitted tree is CURRENTLY
 * touching, and what it has already committed but not yet landed —
 * refreshed every firing, '' when flying solo so the prompt section
 * renders only for a real fleet.
 */
export async function buildFleetDigest(
  store: Store,
  projectId: string,
  instanceKey: string,
  target: string,
): Promise<string> {
  const claims = store.db
    .prepare(
      "SELECT id, assignee, substr(title, 1, 90) AS t FROM tasks WHERE project_id = ? AND assignee IS NOT NULL AND assignee != ? AND status IN ('queued','in_progress')",
    )
    .all(projectId, instanceKey) as { id: string; assignee: string; t: string }[];
  let branches: string[] = [];
  try {
    const out = execFileSync(
      'git',
      [
        '-C',
        target,
        'for-each-ref',
        `--format=%(refname:short)${REF_SUBJECT_SEP}%(subject)`,
        `refs/heads/autopilot/flight-worktree-${projectId}--*`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    const refLines = out.split('\n').filter((l) => l.includes(REF_SUBJECT_SEP));
    if (refLines.length > 0) {
      const worktreePaths = listWorktreePaths(target);
      const vcs = new GitVcs(target);
      const base = await vcs.defaultBranch();
      branches = await Promise.all(
        refLines.map(async (l) => {
          const [ref = '', subject = ''] = l.split(REF_SUBJECT_SEP);
          const worktreePath = worktreePaths.get(`refs/heads/${ref}`);
          const intentLine = worktreePath ? declaredIntent(worktreePath) : '';
          const intent = intentLine === '' ? '' : `; intent: ${intentLine}`;
          const touching = worktreePath
            ? formatFileList('touching', touchingFiles(worktreePath), MAX_TOUCHING_FILES)
            : '';
          const unlanded = formatFileList(
            'unlanded',
            await unlandedFiles(vcs, base, ref),
            MAX_UNLANDED_FILES,
          );
          return `- sibling ${ref}: last commit "${fenceTitle(subject)}"${intent}${touching}${unlanded}`;
        }),
      );
    }
  } catch {
    // not a repo / no sibling branches — awareness degrades to claims only.
  }
  // fenceTitle: same untrusted tasks.title column prompt.ts's board/FOCUS
  // rendering already fences (BOARD TITLE FENCING) — this CLAIMED-by line is
  // built in a different module and was never put through that sanitizer.
  const lines = [
    ...claims.map((c) => `- CLAIMED by ${c.assignee}: [${c.id}] ${fenceTitle(c.t)}`),
    ...branches,
  ];
  return lines.join('\n');
}
