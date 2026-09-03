// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openStore,
  migrate,
  createTask,
  recentTasks,
  reorderTasks,
  type Store,
} from '@autopilot/store';
import type * as AutopilotEngine from '@autopilot/engine';
import {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_AUTH,
  CliDescendantRegistry,
  type ModelResponse,
} from '@autopilot/engine';
import { runBoardTriage, type BoardTriageDeps } from '../../src/flight/board-triage.js';

const invokeMock = vi.fn<(model: string, prompt: string) => Promise<ModelResponse>>();

// board-triage.ts constructs its own ClaudeCliModel/OllamaModel internally
// (never injected) — a real one would spawn a CLI subprocess, so both are
// replaced with a fake whose `invoke` is this test's own controllable mock.
vi.mock('@autopilot/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof AutopilotEngine>();
  class FakeModel {
    invoke(model: string, prompt: string): Promise<ModelResponse> {
      return invokeMock(model, prompt);
    }
  }
  return { ...actual, ClaudeCliModel: FakeModel, OllamaModel: FakeModel };
});

function project(s: Store, id: string, rootPath: string): void {
  s.db
    .prepare(
      `INSERT INTO projects (id, slug, name, root_path, status, gate_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'flying', NULL, ?, ?)`,
    )
    .run(id, id, id, rootPath, 100, 100);
}

/** A trailing-streak of 'slice' metrics rows for `item`, enough to trip
 *  isRunaway's thresholds (streakSpendUsd > 50, sliceStreak > 10). */
function seedRunawayStreak(s: Store, projectId: string, item: string): void {
  const insert = s.db.prepare(
    `INSERT INTO metrics (project_id, firing_id, item, cost_usd, completion, created_at)
     VALUES (?, ?, ?, ?, 'slice', ?)`,
  );
  for (let i = 0; i < 11; i += 1) {
    insert.run(projectId, `${item}-firing-${i}`, item, 5, i);
  }
}

function triageEnvelope(result: string): ModelResponse {
  return {
    stdout: '',
    exitCode: 0,
    envelope: {
      result,
      isError: false,
      apiErrorStatus: null,
      costUsd: 0,
      numTurns: 1,
      durationMs: 10,
      stopReason: null,
      modelUsed: 'haiku',
      tokensIn: null,
      tokensOut: null,
      cacheRead: null,
      cacheCreate: null,
    },
  };
}

function orderedIds(store: Store, projectId: string): string[] {
  return recentTasks(store.db, projectId).map((t) => t.id);
}

describe('runBoardTriage', () => {
  let dir: string;
  let store: Store;
  let deps: BoardTriageDeps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ap-board-triage-'));
    store = openStore(':memory:');
    migrate(store);
    project(store, 'p1', dir);
    invokeMock.mockReset();
    deps = {
      store,
      projectId: 'p1',
      target: dir,
      config: DEFAULT_ENGINE_CONFIG,
      auth: DEFAULT_AUTH,
      pidRegistry: new CliDescendantRegistry(join(dir, 'pids')),
      now: () => 1_000_000,
    };
  });

  afterEach(() => {
    store.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('skips the model call and leaves the order untouched with fewer than 2 unpinned tasks', async () => {
    createTask(store, { id: 'a', projectId: 'p1', title: 'only one', createdAt: 1000 });

    await runBoardTriage(deps, 'takeoff');

    expect(invokeMock).not.toHaveBeenCalled();
    expect(orderedIds(store, 'p1')).toEqual(['a']);
  });

  it('applies the model ranking via reorderTasks while leaving an operator-pinned task in the lead', async () => {
    createTask(store, { id: 'a', projectId: 'p1', title: 'Task A', createdAt: 1000 });
    createTask(store, { id: 'b', projectId: 'p1', title: 'Task B', createdAt: 1000 });
    createTask(store, { id: 'c', projectId: 'p1', title: 'Task C', createdAt: 1000 });
    // The operator's own reorder (pin: true) — never handed to the model.
    reorderTasks(store, 'p1', ['c'], 999, true);
    invokeMock.mockResolvedValue(triageEnvelope('TRIAGE:["b","a"]'));

    await runBoardTriage(deps, 'takeoff — fresh sort');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [, prompt] = invokeMock.mock.calls[0] ?? [];
    expect(prompt).toContain('takeoff — fresh sort');
    expect(prompt).not.toContain('[c]'); // pinned task never entered the prompt's queue
    expect(orderedIds(store, 'p1')).toEqual(['c', 'b', 'a']);
  });

  it('sinks a runaway task to the tail of the model order and logs its demotion', async () => {
    createTask(store, { id: 'a', projectId: 'p1', title: 'Healthy task', createdAt: 1000 });
    createTask(store, { id: 'r', projectId: 'p1', title: 'Runaway task', createdAt: 1000 });
    seedRunawayStreak(store, 'p1', 'r');
    invokeMock.mockResolvedValue(triageEnvelope('TRIAGE:["r","a"]'));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      await runBoardTriage(deps, 'post-flight');
      expect(orderedIds(store, 'p1')).toEqual(['a', 'r']);
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('runaway task demoted for operator review: r'),
      );
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('leaves the order untouched and logs a skip when the model reply has no usable TRIAGE line', async () => {
    createTask(store, { id: 'a', projectId: 'p1', title: 'Task A', createdAt: 1000 });
    createTask(store, { id: 'b', projectId: 'p1', title: 'Task B', createdAt: 2000 });
    invokeMock.mockResolvedValue(triageEnvelope('not a triage reply'));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const before = orderedIds(store, 'p1');

    try {
      await runBoardTriage(deps, 'takeoff');
      expect(orderedIds(store, 'p1')).toEqual(before);
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('board triage skipped'));
    } finally {
      writeSpy.mockRestore();
    }
  });
});
