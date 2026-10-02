// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from '@autopilot/engine';
import {
  NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES,
  firingConfigForEngine,
  firingEngineFromEnv,
  firingEngineLine,
} from '../../src/flight/firing-engine.js';

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

  it('refuses an engine no lane can fly on, Gemini included until its guard is wired', () => {
    for (const engine of ['gemini', 'copilot', 'ollama']) {
      const choice = firingEngineFromEnv({
        AUTOPILOT_ENGINE: engine,
        AUTOPILOT_ENGINE_MODEL: 'any',
      });
      expect(choice).toEqual({
        ok: false,
        reason: `AUTOPILOT_ENGINE=${engine} names no engine a lane can fly on (claude or codex).`,
      });
    }
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

  it('hands a Claude lane the flight config itself', () => {
    expect(firingConfigForEngine(config, { engine: 'claude' })).toBe(config);
  });

  it('puts every model slot of a codex lane on its model and keeps the rest', () => {
    const codex = firingConfigForEngine(config, { engine: 'codex', model: 'gpt-5-codex' });
    expect(codex).toEqual({
      ...config,
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
    expect(line).toContain(`${NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES} reverted firings in a row`);
  });

  it('demotes after the two reverts epic 0036 names', () => {
    expect(NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES).toBe(2);
  });
});
