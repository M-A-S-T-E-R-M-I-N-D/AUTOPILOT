// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { runLoop, type LoopDeps } from '../src/loop.js';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '../src/config.js';
import { INITIAL_RESILIENCE_STATE, type ResilienceState } from '../src/resilience.js';
import type { FiringInput, FiringOutcome } from '../src/firing.js';
import type { FiringRecord } from '../src/telemetry.js';

const RECORD: FiringRecord = {
  ts: '2026-07-07T00:00:00Z',
  firing: 1,
  promptVersion: 'v',
  model: 'fable',
  retro: false,
  attempts: 1,
  quotaFallback: false,
  startedOn: 'primary',
  quotaStreak: 0,
  globalExhaust: false,
  exitCode: 0,
  isError: false,
  stopReason: 'end_turn',
  maxTurnsHit: false,
  numTurns: 5,
  durationMs: 100,
  costUsd: 1,
  realCostUsd: null,
  tokensIn: 1,
  tokensOut: 1,
  cacheRead: 1,
  cacheCreate: 1,
  iterMetrics: 'ok',
  item: 'AP-1',
  outcome: 'shipped',
  shipped: true,
  completion: 'complete',
  completionMissing: false,
  gateResult: 'passed',
  gateChecks: [],
  guardDenials: 0,
  guardDenialDetails: [],
  resumed: null,
  sha: 'abc',
  shaVerified: true,
  headAdvanced: true,
  headBefore: 'h0',
  headAfter: 'h1',
  testsBefore: null,
  testsAfter: null,
  testsDelta: null,
  verifierUsed: null,
  kind: 'feat',
  area: null,
  deferredTo: null,
  testFirst: null,
  pickedRank: null,
  deviationReason: null,
  commitSubject: null,
  instanceId: null,
};

function outcome(over: Partial<FiringOutcome> = {}): FiringOutcome {
  return {
    record: RECORD,
    state: INITIAL_RESILIENCE_STATE,
    globalExhaust: false,
    bad: false,
    gateResult: 'passed',
    sessionId: null,
    guardDenials: 0,
    ...over,
  };
}

interface Harness {
  readonly deps: LoopDeps;
  readonly log: string[];
  readonly sleeps: number[];
  readonly saved: ResilienceState[];
  readonly promptCalls: { firing: number; retro: boolean }[];
  readonly firingInputs: FiringInput[];
  readonly firingConfigs: EngineConfig[];
  setStopAfter(n: number): void;
  setPromptModel(model: string | undefined): void;
  setPromptBudget(budget: number | undefined): void;
}

function harness(outcomes: FiringOutcome[], startCount = 0): Harness {
  const log: string[] = [];
  const sleeps: number[] = [];
  const saved: ResilienceState[] = [];
  const promptCalls: { firing: number; retro: boolean }[] = [];
  const firingInputs: FiringInput[] = [];
  const firingConfigs: EngineConfig[] = [];
  let count = startCount;
  let stopAfter = Number.POSITIVE_INFINITY;
  let stopChecks = 0;
  let promptModel: string | undefined;
  let promptBudget: number | undefined;
  const queue = [...outcomes];

  const deps: LoopDeps = {
    firing: {} as LoopDeps['firing'],
    stopRequested: () => {
      stopChecks++;
      return Promise.resolve(stopChecks > stopAfter);
    },
    loadState: () => Promise.resolve(INITIAL_RESILIENCE_STATE),
    saveState: (s) => {
      saved.push(s);
      return Promise.resolve();
    },
    nextFiring: () => Promise.resolve(count + 1),
    buildPrompt: (firing, retro) => {
      promptCalls.push({ firing, retro });
      return Promise.resolve({
        text: 't',
        version: 'v',
        ...(promptModel !== undefined ? { primaryModel: promptModel } : {}),
        ...(promptBudget !== undefined ? { maxBudgetUsd: promptBudget } : {}),
      });
    },
    sleep: (m) => {
      sleeps.push(m);
      return Promise.resolve();
    },
    nextPaceMin: () => Promise.resolve(5),
    log: (m) => log.push(m),
    runFiring: (_deps, config, input) => {
      firingInputs.push(input);
      firingConfigs.push(config);
      count++;
      const next = queue.shift();
      if (!next) throw new Error('harness: no queued outcome');
      return Promise.resolve(next);
    },
  };

  return {
    deps,
    log,
    sleeps,
    saved,
    promptCalls,
    firingInputs,
    firingConfigs,
    setStopAfter: (n) => {
      stopAfter = n;
    },
    setPromptModel: (m) => {
      promptModel = m;
    },
    setPromptBudget: (b) => {
      promptBudget = b;
    },
  };
}

describe('runLoop', () => {
  it('runs the requested number of firings then stops on maxIterations', async () => {
    const h = harness([outcome(), outcome(), outcome()]);
    const summary = await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 3 });
    expect(summary).toEqual({ firings: 3, stoppedBy: 'max-iterations' });
    expect(h.saved).toHaveLength(3);
    expect(h.sleeps).toEqual([5, 5, 5]); // adaptive pace between firings
  });

  it('exits immediately when a stop is already requested', async () => {
    const h = harness([]);
    h.setStopAfter(0); // stop from the first check
    const summary = await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 5 });
    expect(summary).toEqual({ firings: 0, stoppedBy: 'stop' });
  });

  it('marks every retroEvery-th firing a RETRO', async () => {
    const h = harness(
      Array.from({ length: 10 }, () => outcome()),
      8,
    );
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 2 });
    // nextFiring started at 8 → firings 9 and 10; only firing 10 is a retro.
    expect(h.promptCalls).toEqual([
      { firing: 9, retro: false },
      { firing: 10, retro: true },
    ]);
  });

  it('alerts after two consecutive bad firings', async () => {
    const h = harness([outcome({ bad: true }), outcome({ bad: true })]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 2 });
    expect(h.log.some((m) => m.includes('ALERT') && m.includes('2 consecutive'))).toBe(true);
  });

  it('does not alert after only one bad firing (below the consecutive-bad threshold)', async () => {
    const h = harness([outcome({ bad: true }), outcome({ bad: false })]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 2 });
    expect(h.log.some((m) => m.includes('ALERT'))).toBe(false);
  });

  it('logs a guard-denial line for a firing that hit PreToolUse guard denials', async () => {
    const h = harness([outcome({ guardDenials: 3 })]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
    expect(h.log.some((m) => m.includes('guard denied 3 tool call(s)'))).toBe(true);
  });

  it('logs why a firing ended without a result envelope — the death tail, or that stderr was empty', async () => {
    const h = harness([
      outcome({
        record: {
          ...RECORD,
          firing: 137,
          isError: null,
          exitCode: 1,
          deathTail: 'Error: overloaded',
        },
      }),
      outcome({ record: { ...RECORD, firing: 138, isError: null, exitCode: 0, deathTail: null } }),
      outcome({ record: { ...RECORD, firing: 139, isError: false, exitCode: 0 } }),
    ]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 3 });
    expect(h.log).toContain(
      'firing 137 ended without a result envelope (exit 1) — Error: overloaded',
    );
    expect(h.log).toContain(
      'firing 138 ended without a result envelope (exit 0) — nothing on stderr',
    );
    expect(h.log.filter((m) => m.includes('ended without a result envelope'))).toHaveLength(2);
  });

  it('logs the commit-time review (C5) of a firing that carried one, and nothing for one that did not', async () => {
    const h = harness([
      outcome({
        record: {
          ...RECORD,
          firing: 140,
          review: {
            status: 'reviewed',
            model: 'haiku',
            costUsd: 0.01,
            findings: [{ severity: 'high', file: 'src/a.ts', problem: 'inverted guard' }],
          },
        },
      }),
      outcome({ record: { ...RECORD, firing: 141 } }),
    ]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 2 });
    expect(h.log).toContain(
      'firing 140 commit review (haiku): 1 finding — top: [high] src/a.ts: inverted guard',
    );
    expect(h.log.filter((m) => m.includes('commit review'))).toHaveLength(1);
  });

  it('stays quiet about guard denials when a firing hit none', async () => {
    const h = harness([outcome({ guardDenials: 0 })]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
    expect(h.log.some((m) => m.includes('guard denied'))).toBe(false);
  });

  it('passes the constructed FiringInput (prompt, retro, state) to the firing runner', async () => {
    const h = harness([outcome()]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
    expect(h.firingInputs).toEqual([
      {
        firing: 1,
        promptText: 't',
        promptVersion: 'v',
        retro: false,
        state: INITIAL_RESILIENCE_STATE,
        machineWide30dListPriceUsd: null,
      },
    ]);
  });

  it('hibernates on global exhaustion instead of pacing', async () => {
    const exhausted: ResilienceState = {
      consecQuota: 3,
      reprobeAfterEpoch: 0,
      consecGlobalExhaust: 2,
    };
    const h = harness([outcome({ globalExhaust: true, state: exhausted })]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
    // hibernateMinutes(streak 2) = base 60 * 2^1 = 120
    expect(h.sleeps).toEqual([120]);
    expect(h.log.some((m) => m.includes('hibernating 120 min'))).toBe(true);
  });

  it('threads and persists the resilience state returned by each firing', async () => {
    const s1: ResilienceState = { consecQuota: 1, reprobeAfterEpoch: 10, consecGlobalExhaust: 0 };
    const h = harness([outcome({ state: s1 })]);
    await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
    expect(h.saved).toEqual([s1]);
  });

  it('honors a stop requested mid-loop (after a firing) with no iteration bound', async () => {
    const h = harness([outcome(), outcome()]);
    h.setStopAfter(1); // pass the start check, stop on the post-firing check
    const summary = await runLoop(h.deps, DEFAULT_ENGINE_CONFIG); // unbounded → relies on STOP
    expect(summary).toEqual({ firings: 1, stoppedBy: 'stop' });
    expect(h.sleeps).toEqual([]); // stopped before pacing/hibernating
  });

  it('fires onFiringComplete with each outcome BETWEEN firings, not just at the end', async () => {
    const events: string[] = [];
    const h = harness([
      outcome({ record: { ...RECORD, item: 'A' } }),
      outcome({ record: { ...RECORD, item: 'B' } }),
    ]);
    const deps: LoopDeps = {
      ...h.deps,
      buildPrompt: (firing, retro) => {
        events.push(`prompt:${firing}`);
        return h.deps.buildPrompt(firing, retro);
      },
      onFiringComplete: (o) => {
        events.push(`complete:${o.record.item}`);
      },
    };
    await runLoop(deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 2 });
    // the SECOND firing's prompt is only built after the FIRST firing's
    // outcome was already handled — proof this is a between-firings hook,
    // not a batch step that only runs once the whole flight is done.
    expect(events).toEqual(['prompt:1', 'complete:A', 'prompt:2', 'complete:B']);
  });

  it('omitting onFiringComplete does not affect the loop', async () => {
    const h = harness([outcome()]);
    const summary = await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
    expect(summary).toEqual({ firings: 1, stoppedBy: 'max-iterations' });
  });

  describe('MODEL ROUTING v1 (per-firing primaryModel override)', () => {
    it('uses the flight-wide config unchanged when buildPrompt omits a primaryModel', async () => {
      const h = harness([outcome()]);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs).toEqual([DEFAULT_ENGINE_CONFIG]);
    });

    it('swaps primaryModel AND resilience.primaryModel together when buildPrompt routes a firing', async () => {
      const h = harness([outcome()]);
      h.setPromptModel('haiku');
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs).toHaveLength(1);
      const firingConfig = h.firingConfigs.at(0);
      expect(firingConfig?.primaryModel).toBe('haiku');
      expect(firingConfig?.resilience.primaryModel).toBe('haiku');
      // Everything else (fallback, budget, tool lists) rides through unchanged.
      expect(firingConfig?.fallbackModel).toBe(DEFAULT_ENGINE_CONFIG.fallbackModel);
      expect(firingConfig?.resilience.fallbackModel).toBe(
        DEFAULT_ENGINE_CONFIG.resilience.fallbackModel,
      );
      // The budget rides through UNCHANGED when only a model is routed. Each
      // override is spread conditionally, and an unconditional budget spread
      // writes `maxBudgetUsd: undefined` over the flight-wide value — the
      // firing then runs with no budget at all, which is the failure this
      // lockstep was built to prevent, arriving from the other direction.
      expect(firingConfig?.maxBudgetUsd).toBe(DEFAULT_ENGINE_CONFIG.maxBudgetUsd);
    });

    it('routes each firing independently across one flight', async () => {
      const h = harness([outcome(), outcome()]);
      let call = 0;
      const deps: LoopDeps = {
        ...h.deps,
        buildPrompt: (_firing, _retro) => {
          call++;
          return Promise.resolve({
            text: 't',
            version: 'v',
            primaryModel: call === 1 ? 'haiku' : 'fable',
          });
        },
      };
      await runLoop(deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 2 });
      expect(h.firingConfigs.map((c) => c.primaryModel)).toEqual(['haiku', 'fable']);
    });

    it('is a no-op when buildPrompt routes back to the same model already configured', async () => {
      const h = harness([outcome()]);
      h.setPromptModel(DEFAULT_ENGINE_CONFIG.primaryModel);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs).toEqual([DEFAULT_ENGINE_CONFIG]);
    });
  });

  describe('routed budget lockstep (run-3 death-loop fix)', () => {
    it("scales this one firing's maxBudgetUsd when buildPrompt routes one", async () => {
      const h = harness([outcome()]);
      h.setPromptModel('fable');
      h.setPromptBudget(17.5);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs[0]?.maxBudgetUsd).toBe(17.5);
      expect(h.firingConfigs[0]?.primaryModel).toBe('fable');
    });

    it('keeps the flight-wide budget when buildPrompt omits maxBudgetUsd', async () => {
      const h = harness([outcome()]);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs[0]?.maxBudgetUsd).toBe(DEFAULT_ENGINE_CONFIG.maxBudgetUsd);
    });

    it('scales the budget on its own, with no model routed alongside it', async () => {
      // Every other budget test routes a model too, so the budget arm was
      // never exercised by itself — and the composition is the whole point of
      // the fix: an escalated model with an unscaled budget dies mid-firing,
      // and the two overrides have to be independent to compose.
      const h = harness([outcome()]);
      h.setPromptBudget(17.5);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs[0]?.maxBudgetUsd).toBe(17.5);
      expect(h.firingConfigs[0]?.primaryModel).toBe(DEFAULT_ENGINE_CONFIG.primaryModel);
      expect(h.firingConfigs[0]?.resilience.primaryModel).toBe(
        DEFAULT_ENGINE_CONFIG.resilience.primaryModel,
      );
    });

    it('is a no-op when buildPrompt repeats the budget already configured', async () => {
      const h = harness([outcome()]);
      h.setPromptBudget(DEFAULT_ENGINE_CONFIG.maxBudgetUsd);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs[0]).toBe(DEFAULT_ENGINE_CONFIG);
    });
  });

  describe('the unrouted firing gets the flight config ITSELF, not a copy of it', () => {
    // Deep equality cannot see this: a rebuilt config spreads to something
    // that toEqual()s the original, so every existing routing test passes
    // whether the override branch ran or not. Identity is the only observable
    // that distinguishes "nothing was routed" from "something was routed back
    // to the value it already had" — which is exactly the distinction the two
    // `!== config.*` halves of each guard exist to make.
    it('passes the very same config object through when nothing is routed', async () => {
      const h = harness([outcome()]);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs[0]).toBe(DEFAULT_ENGINE_CONFIG);
    });

    it('passes it through when the prompt names the model already configured', async () => {
      const h = harness([outcome()]);
      h.setPromptModel(DEFAULT_ENGINE_CONFIG.primaryModel);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs[0]).toBe(DEFAULT_ENGINE_CONFIG);
    });

    it('builds a NEW config — never mutating the flight-wide one — when it does route', async () => {
      const h = harness([outcome()]);
      h.setPromptModel('haiku');
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingConfigs[0]).not.toBe(DEFAULT_ENGINE_CONFIG);
      expect(DEFAULT_ENGINE_CONFIG.primaryModel).not.toBe('haiku');
    });
  });

  describe('WARM SESSIONS (docs/epics/0009-warm-sessions.md)', () => {
    // Resume scope narrowed 2026-08-20 (founder policy: "whoever started
    // should finish"): the confound-controlled measurement over 197 resumed
    // firings showed blanket resume COSTS money (-$1.28/firing, -$0.79/turn,
    // saving only ~312 fresh-input tokens) — the giant resumed context makes
    // every turn dearer than the ORIENT it saves. A session is now carried
    // forward ONLY out of a CHECKPOINTED firing, where the next firing must
    // continue a half-done unit and the context is the whole point.
    it('omits the resumeSessionId KEY entirely rather than setting it undefined', async () => {
      // FiringInput's `resumeSessionId?: string | null` accepts a missing key
      // or an explicit null/string — not `undefined`. Asserting the VALUE is
      // undefined cannot tell a missing key from a present one holding
      // undefined, so the conditional spread was unkillable through it.
      const h = harness([outcome()]);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingInputs[0] && 'resumeSessionId' in h.firingInputs[0]).toBe(false);
    });

    it('the first firing in a flight has no resumeSessionId (nothing to resume yet)', async () => {
      const h = harness([outcome()]);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 1 });
      expect(h.firingInputs[0]?.resumeSessionId).toBeUndefined();
    });

    it('a PASSED firing does NOT hand its session forward — the next firing cold-spawns', async () => {
      const h = harness([
        outcome({ sessionId: 'session-from-firing-1' }),
        outcome({ sessionId: 'session-from-firing-2' }),
      ]);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 2 });
      expect(h.firingInputs[0]?.resumeSessionId).toBeUndefined();
      expect(h.firingInputs[1]?.resumeSessionId).toBeUndefined();
    });

    it("a CHECKPOINTED firing's session IS carried forward — the next firing continues the unit warm", async () => {
      const h = harness([
        outcome({ sessionId: 'session-from-firing-1', gateResult: 'checkpointed' }),
        outcome({ sessionId: 'session-from-firing-2' }),
        outcome(),
      ]);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 3 });
      expect(h.firingInputs[1]?.resumeSessionId).toBe('session-from-firing-1');
      // firing 2 ended 'passed' — firing 3 cold-spawns again.
      expect(h.firingInputs[2]?.resumeSessionId).toBeUndefined();
    });

    it('a checkpointed firing with a null sessionId still cold-spawns the next one (nothing valid to resume)', async () => {
      const h = harness([outcome({ sessionId: null, gateResult: 'checkpointed' }), outcome()]);
      await runLoop(h.deps, DEFAULT_ENGINE_CONFIG, { maxIterations: 2 });
      expect(h.firingInputs[1]?.resumeSessionId).toBeUndefined();
    });
  });
});
