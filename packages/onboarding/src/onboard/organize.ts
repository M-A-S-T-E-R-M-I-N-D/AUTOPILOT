// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * TRIAGE mode's "propose organization" slice (board web-msnioxgz-emkgca,
 * "Generic-folder competence", slice 2): turn a folder's category inventory
 * into concrete, reviewable grouping suggestions — never an action. Pure
 * over {@link FolderTriage}, same testability boundary as classification.
 * "detect+fix" (actually touching files) stays a follow-up slice — this
 * module only proposes, per the TRIAGE-mode SOUL's own operating rule:
 * "never move or delete files unasked".
 */

import type { FolderInventoryEntry, FolderTriage } from './folder-triage.js';

export interface OrganizationProposal {
  readonly category: FolderInventoryEntry['category'];
  readonly count: number;
  readonly suggestion: string;
}

/** A category needs at least this many loose files before grouping is worth proposing. */
export const ORGANIZE_MIN_COUNT = 2;

/**
 * Propose grouping each sizeable, non-dominant category into its own
 * subfolder. Empty and code folders get no proposals — an empty folder has
 * nothing to organize, and a code folder is a project (its layout is a build
 * concern, not a TRIAGE one). A folder's dominant category (e.g. an
 * all-media folder) already IS what the folder is for, so it is skipped too;
 * 'other' never gets a proposal — it names no real category to group by.
 */
export function proposeOrganization(triage: FolderTriage): readonly OrganizationProposal[] {
  if (triage.kind === 'code' || triage.kind === 'empty') return [];
  return triage.inventory
    .filter((entry) => entry.category !== 'other' && entry.category !== triage.kind)
    .filter((entry) => entry.count >= ORGANIZE_MIN_COUNT)
    .map((entry) => ({
      category: entry.category,
      count: entry.count,
      suggestion: `Group ${entry.count} ${entry.category} files into a ${entry.category}/ folder.`,
    }));
}
