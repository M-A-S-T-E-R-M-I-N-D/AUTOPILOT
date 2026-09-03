// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISALLOWED_TOOLS,
  DEFAULT_ENGINE_CONFIG,
} from '../src/config.js';

describe('DEFAULT_ALLOWED_TOOLS / DEFAULT_DISALLOWED_TOOLS', () => {
  it('never lists the same tool as both allowed and disallowed', () => {
    const overlap = DEFAULT_ALLOWED_TOOLS.filter((tool) =>
      (DEFAULT_DISALLOWED_TOOLS as readonly string[]).includes(tool),
    );
    expect(overlap).toEqual([]);
  });

  it('has no duplicate entries within either list', () => {
    expect(new Set(DEFAULT_ALLOWED_TOOLS).size).toBe(DEFAULT_ALLOWED_TOOLS.length);
    expect(new Set(DEFAULT_DISALLOWED_TOOLS).size).toBe(DEFAULT_DISALLOWED_TOOLS.length);
  });

  it('disallows the interactive/scheduling/control tools an unattended firing must never touch', () => {
    for (const tool of ['AskUserQuestion', 'SendMessage', 'TaskStop']) {
      expect(DEFAULT_DISALLOWED_TOOLS).toContain(tool);
    }
  });
});

describe('DEFAULT_ENGINE_CONFIG', () => {
  it('wires allowedTools/disallowedTools to the exported lists', () => {
    expect(DEFAULT_ENGINE_CONFIG.allowedTools).toBe(DEFAULT_ALLOWED_TOOLS);
    expect(DEFAULT_ENGINE_CONFIG.disallowedTools).toBe(DEFAULT_DISALLOWED_TOOLS);
  });

  it('keeps the resilience model pair in sync with the top-level model pair', () => {
    // The resilience sub-config duplicates primary/fallback so it can be tested
    // standalone (pure, clock-free) — but a drift here would silently start
    // firings on the wrong model tier.
    expect(DEFAULT_ENGINE_CONFIG.resilience.primaryModel).toBe(DEFAULT_ENGINE_CONFIG.primaryModel);
    expect(DEFAULT_ENGINE_CONFIG.resilience.fallbackModel).toBe(
      DEFAULT_ENGINE_CONFIG.fallbackModel,
    );
  });

  it('defaults effort to xhigh', () => {
    expect(DEFAULT_ENGINE_CONFIG.effort).toBe('xhigh');
  });

  it('sets the reprobe cooldown to 45 minutes, in seconds', () => {
    expect(DEFAULT_ENGINE_CONFIG.resilience.reprobeCooldownSec).toBe(45 * 60);
  });

  it('keeps hibernation backoff bounds sane (base <= max)', () => {
    expect(DEFAULT_ENGINE_CONFIG.resilience.hibernateBaseMin).toBeLessThanOrEqual(
      DEFAULT_ENGINE_CONFIG.resilience.hibernateMaxMin,
    );
  });

  it('keeps the hourly spend cap within the weekly spend cap', () => {
    expect(DEFAULT_ENGINE_CONFIG.hourlyCapUsd).toBeLessThanOrEqual(
      DEFAULT_ENGINE_CONFIG.weeklyCapUsd,
    );
  });

  it('keeps every budget/turn/timing knob positive', () => {
    expect(DEFAULT_ENGINE_CONFIG.maxTurns).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.maxBudgetUsd).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.retroEvery).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.baseSleepMin).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.hourlyCapUsd).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_CONFIG.weeklyCapUsd).toBeGreaterThan(0);
  });

  it('defaults the routing top tier to the same model as the resilience fallback', () => {
    // Same rationale as the resilience sync test above: the router's "escalate
    // to top on any doubt" promise (ENGINE-RESEARCH §7) is only as safe as the
    // model it escalates to — it should be the strongest configured model, not
    // an accidentally-weaker one left to drift out of sync.
    expect(DEFAULT_ENGINE_CONFIG.routing.topModel).toBe(DEFAULT_ENGINE_CONFIG.fallbackModel);
  });

  it('gives every routing tier a distinct, non-empty model string', () => {
    const { localModel, cheapModel, topModel } = DEFAULT_ENGINE_CONFIG.routing;
    for (const model of [localModel, cheapModel, topModel]) {
      expect(model.length).toBeGreaterThan(0);
    }
    expect(new Set([localModel, cheapModel, topModel]).size).toBe(3);
  });

  it('defaults cost semantics v3 fields to fully unconfigured (never a guessed price/scope)', () => {
    expect(DEFAULT_ENGINE_CONFIG.subscriptionPriceUsd).toBeNull();
    expect(DEFAULT_ENGINE_CONFIG.usagePoolDirs).toEqual([]);
  });
});
