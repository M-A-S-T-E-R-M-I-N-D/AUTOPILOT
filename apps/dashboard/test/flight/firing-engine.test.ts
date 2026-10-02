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

  it('puts every model slot of a gemini lane on its model', () => {
    const gemini = firingConfigForEngine(config, { engine: 'gemini', model: 'gemini-2.5-pro' });
    expect([
      gemini.primaryModel,
      gemini.fallbackModel,
      gemini.resilience.primaryModel,
      gemini.resilience.fallbackModel,
    ]).toEqual(['gemini-2.5-pro', 'gemini-2.5-pro', 'gemini-2.5-pro', 'gemini-2.5-pro']);
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

  it('names a gemini lane, its BeforeTool guard and the trust it is flown with', () => {
    const line = firingEngineLine({ engine: 'gemini', model: 'gemini-2.5-pro' });
    expect(line).toContain('Engine: Gemini CLI on gemini-2.5-pro (AUTOPILOT_ENGINE)');
    expect(line).toContain('Model routing is off');
    expect(line).toContain('BeforeTool hook');
    expect(line).toContain('trusted for this session');
    expect(line).toContain('no cost is recorded, since Gemini reports no price');
    expect(line).toContain(`${NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES} reverted firings in a row`);
  });

  it('demotes after the two reverts epic 0036 names', () => {
    expect(NON_CLAUDE_DEMOTE_AFTER_GATE_FAILURES).toBe(2);
  });
});
