// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/** A read-only view of a repo's git state (never mutates). */
export interface RepoStatus {
  readonly isRepo: boolean;
  /** HEAD commit sha, or null when the repo is unborn (no commits) / not a repo. */
  readonly head: string | null;
  /** Current branch, or null when detached / unborn. */
  readonly branch: string | null;
  /** Whether the working tree has uncommitted changes. */
  readonly dirty: boolean;
}

/**
 * Version-control operations the folder-lock ritual needs. Every state-changing
 * op is additive (tags/branches/commits) — never `reset --hard`, force-push, or a
 * history rewrite (MASTER-PLAN §7).
 */
export interface BackupVcs {
  status(): Promise<RepoStatus>;
  tagExists(tag: string): Promise<boolean>;
  branchExists(branch: string): Promise<boolean>;
  /** `git init` a non-repo folder. */
  initRepo(): Promise<void>;
  /** Stage everything and commit (with a self-supplied identity), returning the sha. */
  commitAll(message: string): Promise<string>;
  /** Create a lightweight tag at HEAD. */
  createTag(tag: string): Promise<void>;
  /** Create a branch at HEAD (no checkout). */
  createBranch(branch: string): Promise<void>;
  /** Switch to a branch (working-tree changes are preserved, never discarded). */
  checkoutBranch(branch: string): Promise<void>;
}

export interface LockInput {
  /** Commit message used when a baseline commit must be created (unborn/non-repo). */
  readonly baselineMessage?: string;
}

export interface LockResult {
  /** True when the repo was already locked (a prior MYTH/LEGACY exists) — resumed, not re-backed-up. */
  readonly resumed: boolean;
  readonly myth: string;
  readonly legacy: string;
  readonly flight: string;
}
