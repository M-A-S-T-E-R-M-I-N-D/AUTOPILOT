// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  SEVERITIES,
  DIMENSIONS,
  TASK_STATUSES,
  PROJECT_STATUSES,
  VERSION_TIERS,
  TASK_SOURCES,
  COMMIT_KINDS,
  type MetricRow,
  type ProjectRow,
  type TaskRow,
} from '../src/types.js';

describe('domain enums', () => {
  it('severities are the four gauge fill colors, criticals first', () => {
    expect(SEVERITIES).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('dimensions cover the eight gauge axes', () => {
    expect(DIMENSIONS).toHaveLength(8);
    expect(DIMENSIONS).toContain('accessibility');
    expect(DIMENSIONS).toContain('cybersecurity');
    expect(DIMENSIONS).toContain('human_interaction');
  });

  it('task lifecycle includes needs_approval and deferred', () => {
    expect(TASK_STATUSES).toContain('needs_approval');
    expect(TASK_STATUSES).toContain('deferred');
  });

  it('exposes project statuses, version tiers, sources, and commit kinds', () => {
    expect(PROJECT_STATUSES).toContain('flying');
    expect(PROJECT_STATUSES).toContain('hibernating');
    expect(VERSION_TIERS).toEqual(['myth', 'legacy', 'flight']);
    expect(TASK_SOURCES).toContain('inbox');
    expect(TASK_SOURCES).toContain('self');
    expect(COMMIT_KINDS).toContain('feat');
    expect(COMMIT_KINDS).toContain('fix');
  });
});

describe('MetricRow', () => {
  it('has every column the metrics table migrations add (v1 through v21)', () => {
    // A compile-time regression check: this object literal names every column
    // `schema.ts`'s M1/M2/M6/M7/M9/M11/M15/M18/M19/M21 migrations add to
    // `metrics`. If MetricRow is missing one, `tsc` rejects this literal as
    // specifying an unknown property — MetricRow drifted from the live schema
    // once before (unused by any reader, so nothing else caught it).
    const row: MetricRow = {
      id: 1,
      project_id: 'p',
      firing_id: 'f',
      item: null,
      kind: null,
      sha: null,
      head_before: null,
      head_after: null,
      head_advanced: 0,
      sha_verified: 0,
      shipped: 0,
      self_reported: 0,
      model: null,
      cost_usd: 0,
      real_cost_usd: null,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      turns: 0,
      duration_ms: 0,
      gate_result: null,
      commit_subject: null,
      completion: null,
      test_first: null,
      picked_rank: null,
      deviation_reason: null,
      resumed: null,
      extended: null,
      completion_missing: 0,
      created_at: 0,
    };
    expect(row.id).toBe(1);
  });
});

describe('ProjectRow', () => {
  it('has every column the projects table migrations add (v1 through v17)', () => {
    // Same compile-time regression check as MetricRow above, for `projects`:
    // this literal names every column M1/M8/M10/M13/M14/M17 add. ProjectRow
    // drifted the same way once — missing backlog_path (M8) and
    // pause_requested (M10) even though listProjects (read.ts) does
    // `SELECT * ... as ProjectRow[]`, so every row actually carries them at
    // runtime while the type hid them from every caller.
    const row: ProjectRow = {
      id: 'p',
      slug: 'p',
      name: 'p',
      root_path: '/repo',
      status: 'registered',
      soul: null,
      soul_reviewed: 0,
      soul_proposed: null,
      soul_proposed_at: null,
      soul_previous: null,
      soul_previous_at: null,
      gate_config: null,
      metadata: null,
      backlog_path: null,
      pause_requested: 0,
      created_at: 0,
      updated_at: 0,
    };
    expect(row.id).toBe('p');
  });
});

describe('TaskRow', () => {
  it('has every column the tasks table migrations add (v1 through v16)', () => {
    // Same compile-time regression check, for `tasks`: this literal names
    // every column M1/M5/M16 add (M12 only widened the `source` CHECK via a
    // table rebuild, adding no new column).
    const row: TaskRow = {
      id: 't',
      project_id: 'p',
      title: 'title',
      body: null,
      status: 'queued',
      severity: null,
      dimension: null,
      source: 'self',
      assignee: null,
      artifacts: null,
      created_by: null,
      created_at: 0,
      updated_at: 0,
      focus: 0,
      priority: null,
      priority_pinned: 0,
    };
    expect(row.id).toBe('t');
  });
});
