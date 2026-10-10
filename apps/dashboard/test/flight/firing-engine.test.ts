// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '@autopilot/engine';
import {
  NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES,
  firingConfigForEngine,
  firingEngineEnv,
  firingEngineFromEnv,
  firingEngineFromRequest,
  firingEngineBudgetLine,
  firingEngineLine,
  firingEngineRequestFields,
  firingEngineRequestFromEnv,
  firingEngineTurnCap,
  laneDemotionOf,
} from '../../src/flight/firing-engine.js';

// A demotion left a DEMOTED line in the flight log and no other trace, so the
// fleet report could not say which lane, engine or model the gate stopped.
describe('laneDemotionOf', () => {
  const codex = { engine: 'codex', model: 'gpt-5-codex' } as const;

  it('names the lane, the engine, the model, the reverts in a row and the firings flown', () => {
    expect(laneDemotionOf(codex, { firings: 3, stoppedBy: 'demoted' }, 'fleet-2')).toEqual({
      lane: 'fleet-2',
      engine: 'codex',
      model: 'gpt-5-codex',
      reverted: NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES,
      firings: 3,
    });
  });

  // Every lane records its events under the base project id; only its firing
  // ids carry the lane, so the event must name it or every lane reads `base`.
  it('names the base lane for a flight with no instance id', () => {
    expect(laneDemotionOf(codex, { firings: 2, stoppedBy: 'demoted' })?.lane).toBe('base');
  });

  it('records nothing for a flight that ended any other way', () => {
    expect(laneDemotionOf(codex, { firings: 3, stoppedBy: 'max-iterations' })).toBeNull();
    expect(laneDemotionOf(codex, { firings: 1, stoppedBy: 'stop' })).toBeNull();
  });

  it('records nothing for a Claude lane, which is never demoted', () => {
    expect(laneDemotionOf({ engine: 'claude' }, { firings: 2, stoppedBy: 'demoted' })).toBeNull();
  });
});

describe('firingEngineFromEnv', () => {
  it('flies Claude when AUTOPILOT_ENGINE is unset, blank or claude', () => {
    for (const engine of [undefined, '', '  ', 'claude', ' Claude ']) {
      const env = engine === undefined ? {} : { AUTOPILOT_ENGINE: engine };
      expect(firingEngineFromEnv(env)).toEqual({ ok: true, route: { engine: 'claude' } });
    }
  });

  it('ignores AUTOPILOT_ENGINE_MODEL on a Claude lane', () => {
    expect(firingEngineFromEnv({ AUTOPILOT_ENGINE_MODEL: 'gpt-5-codex' })).toEqual({
      ok: true,
      route: { engine: 'claude' },
    });
  });

  it('routes a codex lane to the model AUTOPILOT_ENGINE_MODEL names', () => {
    expect(
      firingEngineFromEnv({ AUTOPILOT_ENGINE: 'CODEX', AUTOPILOT_ENGINE_MODEL: ' gpt-5-codex ' }),
    ).toEqual({ ok: true, route: { engine: 'codex', model: 'gpt-5-codex' } });
  });

  it('refuses a codex lane with no model of its own', () => {
    // AUTOPILOT_MODEL names the Claude model the flight's other calls use; a
    // codex lane never borrows it.
    const choice = firingEngineFromEnv({ AUTOPILOT_ENGINE: 'codex', AUTOPILOT_MODEL: 'gpt-5' });
    expect(choice.ok).toBe(false);
    expect(choice.ok === false && choice.reason).toContain('needs AUTOPILOT_ENGINE_MODEL');
  });

  it('refuses a codex lane pointed at a Claude model', () => {
    for (const model of ['sonnet', 'claude-opus-5-5']) {
      const choice = firingEngineFromEnv({
        AUTOPILOT_ENGINE: 'codex',
        AUTOPILOT_ENGINE_MODEL: model,
      });
      expect(choice).toEqual({
        ok: false,
        reason: `AUTOPILOT_ENGINE_MODEL=${model} names a Claude model, which the Codex CLI cannot run.`,
      });
    }
  });

  it('routes a gemini lane to the model AUTOPILOT_ENGINE_MODEL names', () => {
    expect(
      firingEngineFromEnv({
        AUTOPILOT_ENGINE: ' Gemini ',
        AUTOPILOT_ENGINE_MODEL: 'gemini-2.5-pro',
      }),
    ).toEqual({ ok: true, route: { engine: 'gemini', model: 'gemini-2.5-pro' } });
  });

  it('refuses a gemini lane with no model of its own, naming a Gemini model', () => {
    const choice = firingEngineFromEnv({ AUTOPILOT_ENGINE: 'gemini' });
    expect(choice.ok).toBe(false);
    expect(choice.ok === false && choice.reason).toContain(
      'AUTOPILOT_ENGINE=gemini needs AUTOPILOT_ENGINE_MODEL to name the model Gemini runs',
    );
    expect(choice.ok === false && choice.reason).toContain('gemini-2.5-pro');
  });

  it('refuses a gemini lane pointed at a Claude model', () => {
    expect(
      firingEngineFromEnv({ AUTOPILOT_ENGINE: 'gemini', AUTOPILOT_ENGINE_MODEL: 'opus' }),
    ).toEqual({
      ok: false,
      reason: 'AUTOPILOT_ENGINE_MODEL=opus names a Claude model, which the Gemini CLI cannot run.',
    });
  });

  it("refuses a gemini lane pointed at another publisher's model", () => {
    // The Gemini CLI calls Google's API, so a model named as OpenAI's or
    // Meta's would fail every firing instead of refusing the flight once.
    for (const [model, publisher] of [
      ['gpt-5-codex', 'OpenAI'],
      ['o3', 'OpenAI'],
      ['llama-4-maverick', 'Meta'],
    ] as const) {
      expect(
        firingEngineFromEnv({ AUTOPILOT_ENGINE: 'gemini', AUTOPILOT_ENGINE_MODEL: model }),
      ).toEqual({
        ok: false,
        reason: `AUTOPILOT_ENGINE_MODEL=${model} names a model by ${publisher}, which the Gemini CLI cannot run.`,
      });
    }
  });

  it('refuses a gemini lane pointed at a locally served model, even a Google one', () => {
    // `ollama/gemma3` is published by Google but served by Ollama, which the
    // Gemini CLI never calls.
    for (const model of ['ollama/my-finetune', 'ollama/gemma3']) {
      expect(
        firingEngineFromEnv({ AUTOPILOT_ENGINE: 'gemini', AUTOPILOT_ENGINE_MODEL: model }),
      ).toEqual({
        ok: false,
        reason: `AUTOPILOT_ENGINE_MODEL=${model} names a locally served model, which the Gemini CLI cannot run.`,
      });
    }
  });

  it('flies a gemini lane on a Gemma model or on a name this build cannot place', () => {
    // Gemma is Google's, and an unrecognized name may be a Gemini model newer
    // than this build: the vendor table describes, it never refuses the unknown.
    for (const model of ['gemma-3-27b-it', 'nano-banana-9']) {
      expect(
        firingEngineFromEnv({ AUTOPILOT_ENGINE: 'gemini', AUTOPILOT_ENGINE_MODEL: model }),
      ).toEqual({ ok: true, route: { engine: 'gemini', model } });
    }
  });

  it("still flies a codex lane on another publisher's model, which Codex can be configured to reach", () => {
    expect(
      firingEngineFromEnv({
        AUTOPILOT_ENGINE: 'codex',
        AUTOPILOT_ENGINE_MODEL: 'llama-4-maverick',
      }),
    ).toEqual({ ok: true, route: { engine: 'codex', model: 'llama-4-maverick' } });
  });

  it('refuses an engine no lane can fly on', () => {
    for (const engine of ['copilot', 'ollama']) {
      const choice = firingEngineFromEnv({
        AUTOPILOT_ENGINE: engine,
        AUTOPILOT_ENGINE_MODEL: 'any',
      });
      expect(choice).toEqual({
        ok: false,
        reason: `AUTOPILOT_ENGINE=${engine} names no engine a lane can fly on (claude, codex or gemini).`,
      });
    }
  });
});

describe('firingEngineFromRequest', () => {
  it('leaves the flight on the inherited env when the request names no engine', () => {
    for (const [engine, model] of [
      [undefined, undefined],
      ['', ''],
      ['  ', undefined],
    ] as const) {
      expect(firingEngineFromRequest(engine, model)).toEqual({ ok: true, route: undefined });
    }
  });

  it('routes a requested codex or gemini lane to its model, trimmed', () => {
    expect(firingEngineFromRequest(' Codex ', ' gpt-5-codex ')).toEqual({
      ok: true,
      route: { engine: 'codex', model: 'gpt-5-codex' },
    });
    expect(firingEngineFromRequest('gemini', 'gemini-2.5-pro')).toEqual({
      ok: true,
      route: { engine: 'gemini', model: 'gemini-2.5-pro' },
    });
  });

  it('routes an explicit claude request to Claude, so it overrides an inherited engine', () => {
    expect(firingEngineFromRequest('claude', undefined)).toEqual({
      ok: true,
      route: { engine: 'claude' },
    });
  });

  it('holds a requested engine to every refusal the env levers get', () => {
    expect(firingEngineFromRequest('codex', '')).toMatchObject({ ok: false });
    expect(firingEngineFromRequest('codex', 'sonnet')).toEqual({
      ok: false,
      reason: 'AUTOPILOT_ENGINE_MODEL=sonnet names a Claude model, which the Codex CLI cannot run.',
    });
    expect(firingEngineFromRequest('gemini', 'gpt-5-codex')).toMatchObject({ ok: false });
    expect(firingEngineFromRequest('copilot', 'any')).toMatchObject({ ok: false });
  });

  it('refuses a model with no engine, rather than dropping it unread', () => {
    expect(firingEngineFromRequest(undefined, 'gpt-5-codex')).toEqual({
      ok: false,
      reason: 'engineModel names a model only together with engine (codex or gemini).',
    });
  });

  it('refuses fields that are not strings', () => {
    expect(firingEngineFromRequest(7, 'gpt-5-codex')).toEqual({
      ok: false,
      reason: 'engine must be a string: claude, codex or gemini.',
    });
    expect(firingEngineFromRequest('codex', ['gpt-5-codex'])).toEqual({
      ok: false,
      reason: 'engineModel must be a string.',
    });
  });

  it('refuses a model name a command line could read as syntax, or one past the length cap', () => {
    for (const model of ['gpt-5 & calc', 'gpt"5', 'gpt-5\nx', `g${'x'.repeat(128)}`]) {
      const choice = firingEngineFromRequest('codex', model);
      expect(choice.ok).toBe(false);
      expect(choice.ok === false && choice.reason).toContain('engineModel must be one model name');
    }
  });

  it('takes the characters model ids use: a provider prefix, a tag and a version pin', () => {
    for (const model of ['ollama/gemma3:27b', 'gpt-5@2026-01', 'my_model.v2', 'o4-mini']) {
      expect(firingEngineFromRequest('codex', model)).toEqual({
        ok: true,
        route: { engine: 'codex', model },
      });
    }
  });
});

describe('firingEngineRequestFields', () => {
  it('carries nothing when no engine was chosen', () => {
    expect(firingEngineRequestFields(undefined)).toEqual({});
  });

  it('carries no model beside Claude, and the model beside codex or gemini', () => {
    expect(firingEngineRequestFields({ engine: 'claude' })).toEqual({ engine: 'claude' });
    expect(firingEngineRequestFields({ engine: 'gemini', model: 'gemini-2.5-pro' })).toEqual({
      engine: 'gemini',
      engineModel: 'gemini-2.5-pro',
    });
  });

  it('reads back through firingEngineFromRequest as the route it was built from', () => {
    for (const route of [
      undefined,
      { engine: 'claude' },
      { engine: 'codex', model: 'gpt-5-codex' },
    ] as const) {
      const fields = firingEngineRequestFields(route);
      expect(firingEngineFromRequest(fields.engine, fields.engineModel)).toEqual({
        ok: true,
        route,
      });
    }
  });
});

describe('firingEngineRequestFromEnv', () => {
  it('chooses no engine when AUTOPILOT_ENGINE is unset or blank, so the dashboard env decides', () => {
    for (const env of [{}, { AUTOPILOT_ENGINE: '  ' }, { AUTOPILOT_ENGINE_MODEL: 'gpt-5-codex' }]) {
      expect(firingEngineRequestFromEnv(env)).toEqual({ ok: true, route: undefined });
    }
  });

  it('chooses the engine the env names, Claude included, so it beats the dashboard env', () => {
    expect(firingEngineRequestFromEnv({ AUTOPILOT_ENGINE: 'Claude' })).toEqual({
      ok: true,
      route: { engine: 'claude' },
    });
    expect(
      firingEngineRequestFromEnv({
        AUTOPILOT_ENGINE: 'codex',
        AUTOPILOT_ENGINE_MODEL: ' gpt-5-codex ',
      }),
    ).toEqual({ ok: true, route: { engine: 'codex', model: 'gpt-5-codex' } });
  });

  it('ignores a stray model beside Claude, as the flight itself would', () => {
    expect(
      firingEngineRequestFromEnv({ AUTOPILOT_ENGINE: 'claude', AUTOPILOT_ENGINE_MODEL: 'a & b' }),
    ).toEqual({ ok: true, route: { engine: 'claude' } });
  });

  it('refuses what the env levers refuse', () => {
    expect(firingEngineRequestFromEnv({ AUTOPILOT_ENGINE: 'gemini' })).toEqual({
      ok: false,
      reason:
        'AUTOPILOT_ENGINE=gemini needs AUTOPILOT_ENGINE_MODEL to name the model Gemini runs (e.g. gemini-2.5-pro).',
    });
    expect(firingEngineRequestFromEnv({ AUTOPILOT_ENGINE: 'copilot' })).toMatchObject({
      ok: false,
    });
  });

  it('refuses a model the launch request itself would refuse', () => {
    const choice = firingEngineRequestFromEnv({
      AUTOPILOT_ENGINE: 'codex',
      AUTOPILOT_ENGINE_MODEL: 'gpt-5 & calc',
    });
    expect(choice.ok).toBe(false);
    expect(choice.ok === false && choice.reason).toContain('engineModel must be one model name');
  });
});

describe('firingEngineEnv', () => {
  it('names Claude outright, so an inherited AUTOPILOT_ENGINE cannot win', () => {
    expect(firingEngineEnv({ engine: 'claude' })).toEqual({ AUTOPILOT_ENGINE: 'claude' });
  });

  it('names a non-Claude engine and its model', () => {
    expect(firingEngineEnv({ engine: 'gemini', model: 'gemini-2.5-pro' })).toEqual({
      AUTOPILOT_ENGINE: 'gemini',
      AUTOPILOT_ENGINE_MODEL: 'gemini-2.5-pro',
    });
  });

  it('reads back through firingEngineFromEnv as the route it was built from', () => {
    const route = { engine: 'codex', model: 'gpt-5-codex' } as const;
    expect(firingEngineFromEnv(firingEngineEnv(route))).toEqual({ ok: true, route });
  });
});

describe('firingConfigForEngine', () => {
  const config: EngineConfig = {
    ...DEFAULT_ENGINE_CONFIG,
    primaryModel: 'sonnet',
    fallbackModel: 'opus',
    resilience: {
      ...DEFAULT_ENGINE_CONFIG.resilience,
      primaryModel: 'sonnet',
      fallbackModel: 'opus',
    },
  };

  it("hands a Claude lane the flight config, naming the engine its firings' records carry", () => {
    expect(firingConfigForEngine(config, { engine: 'claude' })).toEqual({
      ...config,
      engine: 'claude',
    });
    expect(config.engine).toBeUndefined();
  });

  it('puts every model slot of a codex lane on its model and keeps the rest', () => {
    const codex = firingConfigForEngine(config, { engine: 'codex', model: 'gpt-5-codex' });
    expect(codex).toEqual({
      ...config,
      engine: 'codex',
      primaryModel: 'gpt-5-codex',
      fallbackModel: 'gpt-5-codex',
      resilience: {
        ...config.resilience,
        primaryModel: 'gpt-5-codex',
        fallbackModel: 'gpt-5-codex',
      },
    });
    // The Claude config the flight's other calls use is left as it was.
    expect(config.primaryModel).toBe('sonnet');
    expect(config.resilience.fallbackModel).toBe('opus');
  });

  it('puts every model slot of a gemini lane on its model', () => {
    const gemini = firingConfigForEngine(config, { engine: 'gemini', model: 'gemini-2.5-pro' });
    expect(gemini.engine).toBe('gemini');
    expect([
      gemini.primaryModel,
      gemini.fallbackModel,
      gemini.resilience.primaryModel,
      gemini.resilience.fallbackModel,
    ]).toEqual(['gemini-2.5-pro', 'gemini-2.5-pro', 'gemini-2.5-pro', 'gemini-2.5-pro']);
  });
});

describe('firingEngineTurnCap', () => {
  it('keeps the cap on Claude (--max-turns) and Gemini (model.maxSessionTurns)', () => {
    expect(firingEngineTurnCap({ engine: 'claude' }, 120)).toBe(120);
    expect(firingEngineTurnCap({ engine: 'gemini', model: 'gemini-2.5-pro' }, 120)).toBe(120);
  });

  it('drops it on Codex, whose CLI has no turn limit, so its prompt never names one', () => {
    expect(firingEngineTurnCap({ engine: 'codex', model: 'gpt-5-codex' }, 120)).toBeUndefined();
  });
});

describe('firingEngineLine', () => {
  it('adds nothing to a Claude flight log', () => {
    expect(firingEngineLine({ engine: 'claude' })).toBeNull();
  });

  it('names the engine, its model and what changes with it', () => {
    const line = firingEngineLine({ engine: 'codex', model: 'gpt-5-codex' });
    expect(line).toContain('Engine: Codex CLI on gpt-5-codex (AUTOPILOT_ENGINE)');
    expect(line).toContain('Model routing is off');
    expect(line).toContain('PreToolUse hook');
    expect(line).toContain('no cost is recorded');
    expect(line).toContain('no turn cap, since Codex has no turn limit');
    expect(line).toContain(`${NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES} reverted firings in a row`);
  });

  it('names a gemini lane, its BeforeTool guard and the trust it is flown with', () => {
    const line = firingEngineLine({ engine: 'gemini', model: 'gemini-2.5-pro' });
    expect(line).toContain('Engine: Gemini CLI on gemini-2.5-pro (AUTOPILOT_ENGINE)');
    expect(line).toContain('Model routing is off');
    expect(line).toContain('BeforeTool hook');
    expect(line).toContain('trusted for this session');
    expect(line).toContain('no cost is recorded, since Gemini reports no price');
    expect(line).not.toContain('no turn cap');
    expect(line).toContain(`${NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES} reverted firings in a row`);
  });

  it('demotes after the two reverts epic 0036 names', () => {
    expect(NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES).toBe(2);
  });
});

// The flight banner promises "$5 PER firing, up to $50 TOTAL", and a Codex or
// Gemini lane can keep neither: neither CLI takes a spend cap, and a firing with
// no price adds nothing to the total's tally (`costUsd ?? 0`), so the total
// never trips. The flight log said only "no cost is recorded".
describe('firingEngineBudgetLine', () => {
  const codex = { engine: 'codex', model: 'gpt-5-codex' } as const;

  it('adds nothing to a Claude flight log, whose caps hold', () => {
    expect(
      firingEngineBudgetLine({ engine: 'claude' }, { perFiringUsd: 5, totalUsd: 50 }),
    ).toBeNull();
  });

  it('tells a Codex lane its per-firing and total caps cannot hold', () => {
    const line = firingEngineBudgetLine(codex, { perFiringUsd: 5, totalUsd: 50 });
    expect(line).toContain('Codex reports no price');
    expect(line).toContain('$5 per-firing cap is not passed to it');
    expect(line).toContain('reads unpriced, not $0');
    expect(line).toContain('$50 total cap counts none of them and cannot stop this flight');
    expect(line).toContain('firing count, wall clock and the demotion rule');
  });

  it('names no total cap when the flight set none', () => {
    const line = firingEngineBudgetLine(codex, { perFiringUsd: 5, totalUsd: undefined });
    expect(line).toContain('$5 per-firing cap is not passed to it');
    expect(line).not.toContain('total cap');
    expect(line).toContain('firing count, wall clock and the demotion rule');
  });

  it('names a Gemini lane by its own CLI', () => {
    const line = firingEngineBudgetLine(
      { engine: 'gemini', model: 'gemini-2.5-pro' },
      { perFiringUsd: 2.5, totalUsd: 20 },
    );
    expect(line).toContain('Gemini reports no price');
    expect(line).toContain('$2.5 per-firing cap');
    expect(line).toContain('$20 total cap');
  });
});
