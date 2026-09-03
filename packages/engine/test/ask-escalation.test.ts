// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  ASK_ESCALATION_ALLOWED_TOOLS,
  ASK_ESCALATION_DISALLOWED_TOOLS,
  ASK_ESCALATION_MAX_TURNS,
  ASK_ESCALATION_MAX_BUDGET_USD,
  buildAskEscalationConfig,
} from '../src/ask-escalation.js';
import {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISALLOWED_TOOLS,
} from '../src/config.js';

describe('ASK_ESCALATION_ALLOWED_TOOLS', () => {
  it('grants exactly Read, Grep, Glob — read-only, no exceptions', () => {
    expect([...ASK_ESCALATION_ALLOWED_TOOLS].sort()).toEqual(['Glob', 'Grep', 'Read']);
  });
});

describe('ASK_ESCALATION_DISALLOWED_TOOLS', () => {
  it('never uses a wildcard — a `disallowedTools: ["*"]` would blank the allow-list back to nothing (deny beats allow)', () => {
    expect(ASK_ESCALATION_DISALLOWED_TOOLS).not.toContain('*');
  });

  it('has no overlap with the allowed list — the jail must be internally consistent', () => {
    const overlap = ASK_ESCALATION_DISALLOWED_TOOLS.filter((tool) =>
      (ASK_ESCALATION_ALLOWED_TOOLS as readonly string[]).includes(tool),
    );
    expect(overlap).toEqual([]);
  });

  it('explicitly denies the write/execute/control tools the epic names as never reachable (Bash, Write, Edit, NotebookEdit)', () => {
    for (const tool of ['Bash', 'Write', 'Edit', 'NotebookEdit']) {
      expect(ASK_ESCALATION_DISALLOWED_TOOLS).toContain(tool);
    }
  });

  it('covers every tool the base engine config knows about, minus the three granted — nothing falls through the cracks', () => {
    const known = new Set<string>([...DEFAULT_ALLOWED_TOOLS, ...DEFAULT_DISALLOWED_TOOLS]);
    for (const tool of known) {
      if ((ASK_ESCALATION_ALLOWED_TOOLS as readonly string[]).includes(tool)) continue;
      expect(ASK_ESCALATION_DISALLOWED_TOOLS).toContain(tool);
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(ASK_ESCALATION_DISALLOWED_TOOLS).size).toBe(
      ASK_ESCALATION_DISALLOWED_TOOLS.length,
    );
  });
});

describe('ASK_ESCALATION_MAX_TURNS / ASK_ESCALATION_MAX_BUDGET_USD', () => {
  it('matches REACTIVITY.md’s Ask=Read/Glob/Grep·10 figure — genuinely iterative but bounded', () => {
    expect(ASK_ESCALATION_MAX_TURNS).toBe(10);
  });

  it('sets a budget distinct from and higher than tier 1’s 0.5 (one tool-less call costs less than an iterative session)', () => {
    expect(ASK_ESCALATION_MAX_BUDGET_USD).toBeGreaterThan(0.5);
  });
});

describe('buildAskEscalationConfig', () => {
  it('overlays the escalation tool grant + turn/budget caps onto the base config', () => {
    const config = buildAskEscalationConfig(DEFAULT_ENGINE_CONFIG);
    expect(config.allowedTools).toEqual(ASK_ESCALATION_ALLOWED_TOOLS);
    expect(config.disallowedTools).toEqual(ASK_ESCALATION_DISALLOWED_TOOLS);
    expect(config.maxTurns).toBe(ASK_ESCALATION_MAX_TURNS);
    expect(config.maxBudgetUsd).toBe(ASK_ESCALATION_MAX_BUDGET_USD);
  });

  it('passes every other field (model, fallback, effort, resilience, routing) through unchanged', () => {
    const config = buildAskEscalationConfig(DEFAULT_ENGINE_CONFIG);
    expect(config.primaryModel).toBe(DEFAULT_ENGINE_CONFIG.primaryModel);
    expect(config.fallbackModel).toBe(DEFAULT_ENGINE_CONFIG.fallbackModel);
    expect(config.effort).toBe(DEFAULT_ENGINE_CONFIG.effort);
    expect(config.resilience).toBe(DEFAULT_ENGINE_CONFIG.resilience);
    expect(config.routing).toBe(DEFAULT_ENGINE_CONFIG.routing);
  });

  it('overlays onto ANY base config, not just the default (e.g. tier 1’s own model/effort choice)', () => {
    const tier1Like = {
      ...DEFAULT_ENGINE_CONFIG,
      primaryModel: 'haiku',
      maxTurns: 2,
      maxBudgetUsd: 0.5,
    };
    const config = buildAskEscalationConfig(tier1Like);
    expect(config.primaryModel).toBe('haiku');
    expect(config.maxTurns).toBe(ASK_ESCALATION_MAX_TURNS);
    expect(config.maxBudgetUsd).toBe(ASK_ESCALATION_MAX_BUDGET_USD);
  });
});
