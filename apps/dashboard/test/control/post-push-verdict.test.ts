// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * POST-PUSH VERDICT RITUAL, slice 1 (board web-mtpbmay4-94ii65): the pure
 * green/red decision plus the best-effort evidence-task filing, exercised
 * against a real temp SQLite store the same way `board-triage.test.ts` does.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, migrate, recentTasks, type Store } from '@autopilot/store';
import type { WorkflowRunStatus } from '../../src/control/ci-status.js';
import {
  ciRemediationMode,
  decidePostPushVerdict,
  filePostPushVerdictTask,
  shouldSpawnRemediationFlight,
  type PostPushVerdictContext,
} from '../../src/control/post-push-verdict.js';

const NOW = Date.parse('2026-09-07T12:00:00Z');

function greenStatus(workflow = 'ci.yml'): WorkflowRunStatus {
  return {
    workflow,
    conclusion: 'success',
    ageLabel: '1m ago',
    createdAtMs: NOW,
    ok: true,
    detail: 'success (1m ago)',
  };
}

function redStatus(workflow = 'ci.yml'): WorkflowRunStatus {
  return {
    workflow,
    conclusion: 'failure',
    ageLabel: '1m ago',
    createdAtMs: NOW,
    ok: false,
    detail: 'failure (1m ago)',
  };
}

const CONTEXT: PostPushVerdictContext = {
  projectId: 'proj-1',
  branch: 'main',
  sha: 'abcdef1234567890',
};

describe('decidePostPushVerdict', () => {
  it('records a green conclusion without filing a task', () => {
    const verdict = decidePostPushVerdict(greenStatus(), CONTEXT, NOW);
    expect(verdict).toEqual({ kind: 'recorded', workflow: 'ci.yml', detail: 'success (1m ago)' });
  });

  it('records a still-running conclusion (ok: true) the same as a green one', () => {
    const running: WorkflowRunStatus = {
      workflow: 'ci.yml',
      conclusion: null,
      ageLabel: '30s ago',
      createdAtMs: NOW,
      ok: true,
      detail: 'in_progress (30s ago)',
    };
    expect(decidePostPushVerdict(running, CONTEXT, NOW).kind).toBe('recorded');
  });

  it('builds a high-severity remediation task for a red conclusion', () => {
    const verdict = decidePostPushVerdict(redStatus(), CONTEXT, NOW);
    expect(verdict.kind).toBe('remediate');
    if (verdict.kind !== 'remediate') throw new Error('unreachable');
    expect(verdict.branch).toBe('main');
    expect(verdict.task.projectId).toBe('proj-1');
    expect(verdict.task.severity).toBe('high');
    expect(verdict.task.dimension).toBeUndefined();
    expect(verdict.task.source).toBe('self');
    expect(verdict.task.title).toContain('CI RED after landing main →');
    expect(verdict.task.title).toContain('abcdef1');
    expect(verdict.task.title).toContain('ci.yml');
    expect(verdict.task.body).toContain('abcdef1');
  });

  it('truncates a very long detail so the title never exceeds 300 characters', () => {
    const longDetail = 'x'.repeat(500);
    const status: WorkflowRunStatus = {
      workflow: 'ci.yml',
      conclusion: 'failure',
      ageLabel: null,
      createdAtMs: null,
      ok: false,
      detail: longDetail,
    };
    const verdict = decidePostPushVerdict(status, CONTEXT, NOW);
    if (verdict.kind !== 'remediate') throw new Error('unreachable');
    expect(verdict.task.title.length).toBeLessThanOrEqual(300);
  });
});

describe('filePostPushVerdictTask', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autopilot-post-push-verdict-'));
    store = openStore(join(dir, 'store.db'));
    migrate(store);
    store.db
      .prepare(
        `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'registered', NULL, ?, ?)`,
      )
      .run('proj-1', 'proj-1', 'proj-1', dir, NOW, NOW);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('is a no-op for a recorded (green) verdict', () => {
    const verdict = decidePostPushVerdict(greenStatus(), CONTEXT, NOW);
    expect(filePostPushVerdictTask(store, verdict)).toBe(false);
    expect(recentTasks(store.db, 'proj-1', 10)).toHaveLength(0);
  });

  it('files an evidence task for a remediate (red) verdict', () => {
    const verdict = decidePostPushVerdict(redStatus(), CONTEXT, NOW);
    expect(filePostPushVerdictTask(store, verdict)).toBe(true);
    const tasks = recentTasks(store.db, 'proj-1', 10);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toContain('CI RED after landing main →');
    expect(tasks[0]?.severity).toBe('high');
  });

  it('dedups: a second red verdict for the same branch while one is still open files nothing new', () => {
    const first = decidePostPushVerdict(redStatus(), CONTEXT, NOW);
    const second = decidePostPushVerdict(redStatus(), CONTEXT, NOW + 60_000);
    expect(filePostPushVerdictTask(store, first)).toBe(true);
    expect(filePostPushVerdictTask(store, second)).toBe(false);
    expect(recentTasks(store.db, 'proj-1', 10)).toHaveLength(1);
  });

  it('does not dedup across different branches', () => {
    const onMain = decidePostPushVerdict(redStatus(), CONTEXT, NOW);
    const onOther = decidePostPushVerdict(
      redStatus(),
      { ...CONTEXT, branch: 'release/1.0' },
      NOW + 60_000,
    );
    expect(filePostPushVerdictTask(store, onMain)).toBe(true);
    expect(filePostPushVerdictTask(store, onOther)).toBe(true);
    expect(recentTasks(store.db, 'proj-1', 10)).toHaveLength(2);
  });
});

describe('ciRemediationMode', () => {
  it('defaults to board when unset', () => {
    expect(ciRemediationMode({})).toBe('board');
  });

  it('reads fly only from an exact match', () => {
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: 'fly' })).toBe('fly');
  });

  it('falls back to board on any other value — fail closed against a typo', () => {
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: 'Fly' })).toBe('board');
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: 'FLY' })).toBe('board');
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: 'yes' })).toBe('board');
    expect(ciRemediationMode({ AUTOPILOT_CI_REMEDIATION: '' })).toBe('board');
  });
});

describe('shouldSpawnRemediationFlight', () => {
  it('never spawns in board mode, even with a fresh task and an idle folder', () => {
    expect(shouldSpawnRemediationFlight('board', true, 'registered')).toBe(false);
    expect(shouldSpawnRemediationFlight('board', true, null)).toBe(false);
  });

  it('never spawns when nothing new was filed (dedup no-op — nothing to fix)', () => {
    expect(shouldSpawnRemediationFlight('fly', false, 'registered')).toBe(false);
    expect(shouldSpawnRemediationFlight('fly', false, null)).toBe(false);
  });

  it('never spawns while the folder is already flying — a live flight owns it', () => {
    expect(shouldSpawnRemediationFlight('fly', true, 'flying')).toBe(false);
  });

  it('never spawns over an explicit operator pause', () => {
    expect(shouldSpawnRemediationFlight('fly', true, 'paused')).toBe(false);
  });

  it('spawns in fly mode when a new task was filed and the folder is idle', () => {
    expect(shouldSpawnRemediationFlight('fly', true, 'registered')).toBe(true);
    expect(shouldSpawnRemediationFlight('fly', true, null)).toBe(true);
  });
});
