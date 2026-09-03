// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Domain types for the AUTOPILOT store. The severity × dimension model mirrors
 * the progression gauge (MASTER-PLAN §16.1); the unified task entity mirrors
 * REACTIVITY §2. Enums are declared as `as const` tuples so they are both the
 * runtime allow-list (used in SQLite CHECK constraints) and the static type.
 */

export const PROJECT_STATUSES = [
  'registered',
  'flying',
  'paused',
  'hibernating',
  'needs_you',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = [
  'queued',
  'in_progress',
  'done',
  'needs_approval',
  'deferred',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Severity — the color that fills the gauge, cleared reds-first (§16.1 Axis 1). */
export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Dimension — the area a finding lives in (§16.1 Axis 2). */
export const DIMENSIONS = [
  'accessibility',
  'cybersecurity',
  'ux',
  'human_interaction',
  'learnings',
  'information',
  'data',
  'priorities',
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** Where a task originated (REACTIVITY §2). 'github' = accepted by the KEEPER
 *  triage ritual from an upstream issue (epic 0007 slice 3). */
export const TASK_SOURCES = [
  'inbox',
  'repo',
  'backlog',
  'chat',
  'dashboard',
  'self',
  'github',
] as const;
export type TaskSource = (typeof TASK_SOURCES)[number];

/** Version tiers — MYTH / LEGACY / FLIGHT (MASTER-PLAN §7). */
export const VERSION_TIERS = ['myth', 'legacy', 'flight'] as const;
export type VersionTier = (typeof VERSION_TIERS)[number];

/** Conventional-commit kinds tracked in telemetry (ENGINE-RESEARCH §1). */
export const COMMIT_KINDS = [
  'feat',
  'fix',
  'docs',
  'test',
  'refactor',
  'chore',
  'perf',
  'ci',
  'build',
  'style',
  'revert',
] as const;
export type CommitKind = (typeof COMMIT_KINDS)[number];

// ---- Row shapes (as persisted; JSON columns are serialized strings) ---------

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  root_path: string;
  status: ProjectStatus;
  soul: string | null;
  /** Has the operator read/ratified the current `soul` text (M13, B5 closure)?
   *  0 = unreviewed (every newly-registered project's LLM-generated starter
   *  SOUL starts here), 1 = reviewed. */
  soul_reviewed: 0 | 1;
  /** Pending SOUL amendment text a post-flight step proposed (M14, B5
   *  closure); null when nothing is pending. Never applied automatically —
   *  ratifySoulAmendment/dismissSoulProposal (mutate.ts) resolve it. */
  soul_proposed: string | null;
  /** When `soul_proposed` was written; null while nothing is pending. */
  soul_proposed_at: number | null;
  /** The `soul` text ratifySoulAmendment last overwrote (schema v17, un-ratify
   *  affordance); null when there is nothing to undo. unratifySoulAmendment
   *  (mutate.ts) restores it and clears this back to null. */
  soul_previous: string | null;
  /** When `soul_previous` was captured; null when there is nothing to undo. */
  soul_previous_at: number | null;
  gate_config: string | null;
  metadata: string | null;
  /** This project's own backlog file (BACKLOG*.md / TODO.md), detected at
   *  onboarding (M8); null for a project with none. */
  backlog_path: string | null;
  /** Operator-requested graceful PAUSE, honored between firings, never
   *  mid-firing (M10). 0 = not requested (the default; also cleared once the
   *  flight actually lands on `status = 'paused'`), 1 = hold requested. */
  pause_requested: 0 | 1;
  created_at: number;
  updated_at: number;
}

/** The single fleet-wide row (schema v20, board web-msnt26xe-pc4pzp) — the
 *  shared text every project's SOUL is layered on top of. Exactly one row
 *  exists for the database's lifetime (`id` is CHECK-constrained to
 *  `'fleet'`, seeded by the v20 migration). Mirrors
 *  `ProjectRow.soul`/`soul_proposed`/`soul_proposed_at` at fleet scope. */
export interface FleetRow {
  id: 'fleet';
  wisdom: string;
  /** Pending fleet wisdom amendment awaiting operator ratify/dismiss
   *  (`mutate.ts`'s `ratifyFleetWisdomAmendment`/`dismissFleetWisdomProposal`);
   *  null when nothing is pending. */
  wisdom_proposed: string | null;
  /** When `wisdom_proposed` was written; null while nothing is pending. */
  wisdom_proposed_at: number | null;
}

export interface EventRow {
  id: number;
  project_id: string;
  firing_id: string | null;
  type: string;
  payload: string | null;
  created_at: number;
}

export interface MetricRow {
  id: number;
  project_id: string;
  firing_id: string;
  item: string | null;
  kind: CommitKind | null;
  sha: string | null;
  head_before: string | null;
  head_after: string | null;
  /** Un-fakeable git cross-check: HEAD actually moved (M2). */
  head_advanced: 0 | 1;
  /** Un-fakeable git cross-check: `sha` was found on HEAD's ancestry (M2). */
  sha_verified: 0 | 1;
  shipped: 0 | 1;
  self_reported: 0 | 1;
  model: string | null;
  cost_usd: number;
  /** List-price cost adjusted for subscription/usage-pool pricing; null when
   *  unconfigured or predating M19 (cost semantics v3, epic 0013). */
  real_cost_usd: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  turns: number;
  duration_ms: number;
  gate_result: string | null;
  commit_subject: string | null;
  /** Self-reported `'slice'` (task only advanced) vs `'complete'` (task
   *  finished); null for firings predating M7 or naming no board task. */
  completion: 'slice' | 'complete' | null;
  /** Self-reported TDD-first compliance on a `kind:"fix"` firing; null for
   *  non-fix firings and ones predating M9. */
  test_first: 0 | 1 | null;
  /** 1-based triage-board rank of the task actually worked; null for a free
   *  pick with no board task, or a firing predating M11. */
  picked_rank: number | null;
  /** Required whenever `picked_rank` isn't 1 (M11 PICK DISCIPLINE). */
  deviation_reason: string | null;
  /** Ran on a resumed CLI session; null when no resume was requested (M15). */
  resumed: 0 | 1 | null;
  /** Received a bounded FINISH-LINE EXTENSION self-resume; null when the
   *  concept didn't apply to this firing (M18). */
  extended: 0 | 1 | null;
  /** Required-completion-tag compliance, always computed (M21). */
  completion_missing: 0 | 1;
  created_at: number;
}

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  body: string | null;
  status: TaskStatus;
  severity: Severity | null;
  dimension: Dimension | null;
  source: TaskSource;
  assignee: string | null;
  artifacts: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  /** Operator FOCUS lock (M5, WIP-limit-1 discipline) — 1 = the only task a
   *  flight will work until done or un-focused. */
  focus: 0 | 1;
  /** Explicit ordering position (M5, lower = sooner); null for an
   *  unprioritized task. */
  priority: number | null;
  /** Marks `priority` as an operator-set pin (M16) that triage must leave
   *  alone rather than re-numbering. */
  priority_pinned: 0 | 1;
}

export interface VersionRow {
  id: string;
  project_id: string;
  tier: VersionTier;
  ref: string;
  label: string | null;
  parent_ref: string | null;
  metadata: string | null;
  created_at: number;
}

/** Languages the project index classifies files into (M2). `'other'` guarantees
 *  no file is ever rejected — a weird extension degrades, never crashes. */
export const LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'kotlin',
  'swift',
  'ruby',
  'php',
  'csharp',
  'cpp',
  'c',
  'shell',
  'html',
  'css',
  'sql',
  'json',
  'yaml',
  'toml',
  'markdown',
  'other',
] as const;
export type Language = (typeof LANGUAGES)[number];

export interface ProjectIndexRow {
  project_id: string;
  path: string;
  content_hash: string;
  size: number;
  language: Language;
  updated_at: number;
}

export interface ProjectIndexMetaRow {
  project_id: string;
  tree_hash: string;
  file_count: number;
  total_bytes: number;
  summary: string;
  hot_files: string;
  tool_version: string;
  built_at: number;
  updated_at: number;
}
