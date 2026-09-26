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
  TOOL_LESS_ALLOWED_TOOLS,
  TOOL_LESS_DISALLOWED_TOOLS,
  CliDescendantRegistry,
  type ModelResponse,
} from '@autopilot/engine';
import { runBoardTriage, type BoardTriageDeps } from '../../src/flight/board-triage.js';

const invokeMock = vi.fn<(model: string, prompt: string) => Promise<ModelResponse>>();

/** Which adapter board-triage.ts built and with what options — the local vs
 *  cloud routing decision is otherwise invisible behind the one shared fake. */
const constructed: { adapter: 'cloud' | 'ollama'; options: unknown }[] = [];

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
  class FakeCliModel extends FakeModel {
    constructor(options: unknown) {
      super();
      constructed.push({ adapter: 'cloud', options });
    }
  }
  class FakeOllamaModel extends FakeModel {
    constructor(options: unknown) {
      super();
      constructed.push({ adapter: 'ollama', options });
    }
  }
  return { ...actual, ClaudeCliModel: FakeCliModel, OllamaModel: FakeOllamaModel };
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
    constructed.length = 0;
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
    vi.unstubAllEnvs();
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

  it('exempts a pinned runaway from the demotion log while still logging an unpinned one (board-triage.ts:177)', async () => {
    createTask(store, { id: 'r', projectId: 'p1', title: 'Pinned runaway', createdAt: 1000 });
    createTask(store, { id: 'a', projectId: 'p1', title: 'Task A', createdAt: 1000 });
    createTask(store, { id: 'b', projectId: 'p1', title: 'Task B', createdAt: 1000 });
    createTask(store, { id: 's', projectId: 'p1', title: 'Unpinned runaway', createdAt: 1000 });
    // The operator pinned 'r' — applyOperatorPins exempts a pinned runaway
    // from demotion (triage-factors.ts:204-206); the log line must agree.
    reorderTasks(store, 'p1', ['r'], 999, true);
    seedRunawayStreak(store, 'p1', 'r');
    seedRunawayStreak(store, 'p1', 's');
    invokeMock.mockResolvedValue(triageEnvelope('TRIAGE:["s","b","a"]'));
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    try {
      await runBoardTriage(deps, 'post-flight');
      // Pinned 'r' leads untouched; the unpinned remainder keeps the
      // model's order with the unpinned runaway 's' sunk to the tail.
      expect(orderedIds(store, 'p1')).toEqual(['r', 'b', 'a', 's']);
      expect(writeSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('runaway task demoted for operator review: r'),
      );
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining('runaway task demoted for operator review: s'),
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

  const rankable = triageEnvelope('TRIAGE:["b","a"]');
  const rankableEnvelope = rankable.envelope as NonNullable<ModelResponse['envelope']>;
  it.each([
    ['an error envelope, even one carrying a TRIAGE line', { ...rankableEnvelope, isError: true }],
    ['no envelope at all (the CLI died before writing one)', null],
    ['a success envelope whose result is null', { ...rankableEnvelope, result: null }],
  ])(
    'never applies a ranking from %s — the order stays and the skip is logged',
    async (_, envelope) => {
      createTask(store, { id: 'a', projectId: 'p1', title: 'Task A', createdAt: 1000 });
      createTask(store, { id: 'b', projectId: 'p1', title: 'Task B', createdAt: 2000 });
      invokeMock.mockResolvedValue({ ...rankable, envelope });
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const before = orderedIds(store, 'p1');

      try {
        await runBoardTriage(deps, 'takeoff');
        expect(orderedIds(store, 'p1')).toEqual(before);
        expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('board triage skipped'));
      } finally {
        writeSpy.mockRestore();
      }
    },
  );

  it('never hands a proposal still awaiting approval to the model: only queued tasks are triaged', async () => {
    createTask(store, { id: 'a', projectId: 'p1', title: 'Task A', createdAt: 1000 });
    createTask(store, { id: 'b', projectId: 'p1', title: 'Task B', createdAt: 1000 });
    createTask(store, {
      id: 'p',
      projectId: 'p1',
      title: 'Proposal awaiting approval',
      status: 'needs_approval',
      createdAt: 1000,
    });
    invokeMock.mockResolvedValue(triageEnvelope('TRIAGE:["b","a"]'));

    await runBoardTriage(deps, 'takeoff');

    const [, prompt] = invokeMock.mock.calls[0] ?? [];
    expect(prompt).toContain('Task A');
    expect(prompt).not.toContain('Proposal awaiting approval');
  });

  it('records the model-free factors of every open task, pinned ones included, before a model call that fails', async () => {
    const threeDaysMs = 3 * 86_400_000;
    deps = { ...deps, now: () => 1000 + threeDaysMs };
    createTask(store, { id: 'c', projectId: 'p1', title: 'Pinned task', createdAt: 1000 });
    createTask(store, { id: 'a', projectId: 'p1', title: 'Task A', createdAt: 1000 });
    createTask(store, { id: 'r', projectId: 'p1', title: 'Runaway task', createdAt: 1000 });
    reorderTasks(store, 'p1', ['c'], 999, true);
    seedRunawayStreak(store, 'p1', 'r');
    invokeMock.mockRejectedValue(new Error('triage CLI spawn failed'));
    const before = orderedIds(store, 'p1');

    // Callers wrap runBoardTriage in try/catch; the throw itself is expected.
    await expect(runBoardTriage(deps, 'takeoff')).rejects.toThrow('triage CLI spawn failed');

    const rows = store.db
      .prepare("SELECT payload, created_at AS createdAt FROM events WHERE type = 'triage-factors'")
      .all() as { payload: string; createdAt: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.createdAt).toBe(1000 + threeDaysMs);
    const factors = JSON.parse(rows[0]?.payload ?? '[]') as { taskId: string }[];
    const byId = [...factors].sort((x, y) => x.taskId.localeCompare(y.taskId));
    expect(byId).toEqual([
      { taskId: 'a', stalenessDays: 3, cumulativeCostUsd: 0, firingCount: 0, isRunaway: false },
      { taskId: 'c', stalenessDays: 3, cumulativeCostUsd: 0, firingCount: 0, isRunaway: false },
      { taskId: 'r', stalenessDays: 3, cumulativeCostUsd: 55, firingCount: 11, isRunaway: true },
    ]);
    expect(orderedIds(store, 'p1')).toEqual(before);
  });

  describe('model routing: local Ollama offload vs the cloud CLI', () => {
    const localModel = DEFAULT_ENGINE_CONFIG.routing.localModel;

    function seedTwoQueued(): void {
      createTask(store, { id: 'a', projectId: 'p1', title: 'Task A', createdAt: 1000 });
      createTask(store, { id: 'b', projectId: 'p1', title: 'Task B', createdAt: 1000 });
      invokeMock.mockResolvedValue(triageEnvelope('TRIAGE:["b","a"]'));
    }

    it('runs a tool-less, two-turn, half-dollar cloud call on the mechanical model by default', async () => {
      vi.stubEnv('AUTOPILOT_MECHANICAL_MODEL', undefined);
      seedTwoQueued();

      await runBoardTriage(deps, 'takeoff');

      expect(constructed).toHaveLength(1);
      expect(constructed[0]?.adapter).toBe('cloud');
      expect(constructed[0]?.options).toMatchObject({
        repo: dir,
        auth: DEFAULT_AUTH,
        config: {
          primaryModel: 'haiku',
          fallbackModel: 'sonnet',
          maxTurns: 2,
          maxBudgetUsd: 0.5,
          allowedTools: TOOL_LESS_ALLOWED_TOOLS,
          disallowedTools: TOOL_LESS_DISALLOWED_TOOLS,
        },
      });
      expect(invokeMock.mock.calls[0]?.[0]).toBe('haiku');
      expect(orderedIds(store, 'p1')).toEqual(['b', 'a']);
    });

    it("offloads to Ollama at the operator's base URL, invoking their real tag rather than the tier sentinel", async () => {
      vi.stubEnv('AUTOPILOT_MECHANICAL_MODEL', localModel);
      vi.stubEnv('AUTOPILOT_OLLAMA_MODEL', 'qwen2.5:3b');
      vi.stubEnv('AUTOPILOT_OLLAMA_BASE_URL', 'http://gpu-box.lan:11434');
      seedTwoQueued();

      await runBoardTriage(deps, 'takeoff');

      expect(constructed).toEqual([
        { adapter: 'ollama', options: { baseUrl: 'http://gpu-box.lan:11434' } },
      ]);
      expect(invokeMock.mock.calls[0]?.[0]).toBe('qwen2.5:3b');
      expect(orderedIds(store, 'p1')).toEqual(['b', 'a']);
    });

    it('leaves Ollama on its own default base URL and the default pullable tag when neither is configured', async () => {
      vi.stubEnv('AUTOPILOT_MECHANICAL_MODEL', localModel);
      vi.stubEnv('AUTOPILOT_OLLAMA_MODEL', undefined);
      vi.stubEnv('AUTOPILOT_OLLAMA_BASE_URL', undefined);
      seedTwoQueued();

      await runBoardTriage(deps, 'takeoff');

      expect(constructed).toEqual([{ adapter: 'ollama', options: {} }]);
      // triage.ts's DEFAULT_OLLAMA_MODEL_TAG — a pullable tag, never the sentinel.
      expect(invokeMock.mock.calls[0]?.[0]).toBe('llama3.2');
    });

    it("reads the local tier from the flight's own routing config, not the engine default", async () => {
      deps = {
        ...deps,
        config: {
          ...DEFAULT_ENGINE_CONFIG,
          routing: { ...DEFAULT_ENGINE_CONFIG.routing, localModel: 'gpu-box-local' },
        },
      };
      vi.stubEnv('AUTOPILOT_MECHANICAL_MODEL', 'gpu-box-local');
      seedTwoQueued();

      await runBoardTriage(deps, 'takeoff');

      expect(constructed.map((c) => c.adapter)).toEqual(['ollama']);
    });
  });
});
