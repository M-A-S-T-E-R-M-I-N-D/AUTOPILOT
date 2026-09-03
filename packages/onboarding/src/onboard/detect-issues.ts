// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * TRIAGE mode's "detect+fix" slice (board web-msnioxgz-emkgca, "Generic-folder
 * competence", final slice): surface likely-duplicate files AND a concrete
 * remedy, both as a reviewable proposal — never an action. Pure over
 * {@link FsSnapshot}, same testability boundary as classification and
 * organization. Physically moving or deleting a file stays permanently out of
 * this module's scope, not merely deferred: the package's whole architecture
 * is built on a read-only snapshot so it can never touch the folder it
 * inspects (see folder-triage.ts), and the TRIAGE-mode SOUL's own operating
 * rule — "never move or delete files unasked" — means any real execution has
 * to be a human-triggered action outside this pure core, not something an
 * autonomous detector does on its own.
 */

import type { FsSnapshot } from '../gate/snapshot.js';

export interface FolderIssue {
  readonly kind: 'likely-duplicate';
  readonly description: string;
  /** The concrete remedy being proposed — never performed by this module. */
  readonly suggestion: string;
}

/**
 * Filename-copy markers that name a file a probable duplicate of some
 * canonical sibling — matched against the basename with its extension
 * stripped, so `$1` is always the candidate canonical stem.
 */
const COPY_MARKER_PATTERNS: readonly RegExp[] = [
  /^(.*) \(\d+\)$/, // "report (1)"
  /^(.*)[-_ ]copy$/i, // "report copy" / "report-copy" / "report_copy"
  /^copy of (.*)$/i, // "Copy of report"
];

function splitExt(base: string): { stem: string; ext: string } {
  const dot = base.lastIndexOf('.');
  return dot > 0 ? { stem: base.slice(0, dot), ext: base.slice(dot) } : { stem: base, ext: '' };
}

function canonicalStem(stem: string): string | undefined {
  for (const pattern of COPY_MARKER_PATTERNS) {
    const match = pattern.exec(stem);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Detect likely-duplicate files by filename-copy marker (`" (1)"`, `"copy
 * of "`, `"-copy"`, …), scoped to the same directory. Conservative by
 * design: a marked file only counts when its canonical sibling (same
 * directory, marker stripped) is also present — a lone `"photo (1).jpg"`
 * with no `"photo.jpg"` alongside it is not flagged, since that's no longer
 * evidence of an unresolved duplicate.
 */
export function detectIssues(snapshot: FsSnapshot): readonly FolderIssue[] {
  const fileSet = new Set(snapshot.files);
  const duplicates: string[] = [];
  for (const path of snapshot.files) {
    const slash = path.lastIndexOf('/');
    const dir = path.slice(0, slash + 1);
    const base = path.slice(slash + 1);
    const { stem, ext } = splitExt(base);
    const canonStem = canonicalStem(stem);
    if (canonStem === undefined) continue;
    const canonicalPath = `${dir}${canonStem}${ext}`;
    if (canonicalPath !== path && fileSet.has(canonicalPath)) duplicates.push(base);
  }
  if (duplicates.length === 0) return [];
  return [
    {
      kind: 'likely-duplicate',
      description: `${duplicates.length} likely-duplicate file(s) found (e.g. "${duplicates[0]}") — review before deleting.`,
      suggestion: `Move the likely-duplicate file(s) into a _duplicates/ folder for review — do not delete anything unasked.`,
    },
  ];
}
