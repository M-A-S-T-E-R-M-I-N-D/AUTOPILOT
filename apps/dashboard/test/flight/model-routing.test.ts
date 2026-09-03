// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  isModelSubstitution,
  modelFamily,
  budgetMultiplierForModel,
  classifyTaskModelTier,
  resolvePrimaryModelForTier,
  SLICE_STREAK_ESCALATION_THRESHOLD,
} from '../../src/flight/model-routing.js';

describe('classifyTaskModelTier', () => {
  it('escalates an EPIC-SPEC task only once it is ALSO grinding (streak >= 3) — the 93%-fable lesson', () => {
    const title = 'COCKPIT 3/6 - restyle. EPIC-SPEC: docs/epics/0005-cockpit-redesign.md';
    expect(classifyTaskModelTier({ title, sliceStreak: 0 })).toBe('default');
    expect(classifyTaskModelTier({ title, sliceStreak: 2 })).toBe('default');
    expect(classifyTaskModelTier({ title, sliceStreak: 3 })).toBe('escalated');
  });

  it('escalates a task at or above the slice-streak escalation threshold', () => {
    const tier = classifyTaskModelTier({
      title: 'Keeps advancing without finishing',
      sliceStreak: SLICE_STREAK_ESCALATION_THRESHOLD,
    });
    expect(tier).toBe('escalated');
  });

  it('does not escalate a task just below the slice-streak threshold', () => {
    const tier = classifyTaskModelTier({
      title: 'Advancing but not stuck yet',
      sliceStreak: SLICE_STREAK_ESCALATION_THRESHOLD - 1,
    });
    expect(tier).toBe('default');
  });

  it('escalates a task whose title calls for an architecture decision', () => {
    const tier = classifyTaskModelTier({
      title: 'Needs an architecture call on the extraction shape',
      sliceStreak: 0,
    });
    expect(tier).toBe('escalated');
  });

  it('escalates a task whose title calls for security review', () => {
    const tier = classifyTaskModelTier({
      title: 'Auth changes need a security review before merge',
      sliceStreak: 0,
    });
    expect(tier).toBe('escalated');
  });

  it('routes a self-mined DOC-FRESHNESS finding to the mechanical tier', () => {
    const tier = classifyTaskModelTier({
      title: 'DOC-FRESHNESS: README.md may be stale — src/foo.ts changed more recently',
      sliceStreak: 0,
    });
    expect(tier).toBe('mechanical');
  });

  it('routes a self-mined CLOSED-TASK AUDIT finding to the mechanical tier', () => {
    const tier = classifyTaskModelTier({
      title:
        'CLOSED-TASK AUDIT: "AP-1" claimed done but its DELIVERABLE clause no longer checks out',
      sliceStreak: 0,
    });
    expect(tier).toBe('mechanical');
  });

  it('defaults an ordinary build/test task to the default tier', () => {
    const tier = classifyTaskModelTier({
      title: 'Add pagination to the flight log',
      sliceStreak: 0,
    });
    expect(tier).toBe('default');
  });

  it('escalates a stuck task even when its title also carries a mechanical prefix', () => {
    const tier = classifyTaskModelTier({
      title: 'DOC-FRESHNESS: README.md may be stale — src/foo.ts changed more recently',
      sliceStreak: SLICE_STREAK_ESCALATION_THRESHOLD,
    });
    expect(tier).toBe('escalated');
  });
});

describe('resolvePrimaryModelForTier', () => {
  it('honors AUTOPILOT_MODEL as an outright override regardless of tier', () => {
    const env = { AUTOPILOT_MODEL: 'opus' } as NodeJS.ProcessEnv;
    expect(resolvePrimaryModelForTier('mechanical', env)).toBe('opus');
    expect(resolvePrimaryModelForTier('default', env)).toBe('opus');
    expect(resolvePrimaryModelForTier('escalated', env)).toBe('opus');
  });

  it('resolves the mechanical tier to haiku by default', () => {
    expect(resolvePrimaryModelForTier('mechanical', {} as NodeJS.ProcessEnv)).toBe('haiku');
  });

  it('resolves the mechanical tier via AUTOPILOT_MECHANICAL_MODEL, matching triage.ts', () => {
    const env = { AUTOPILOT_MECHANICAL_MODEL: 'local-llama' } as NodeJS.ProcessEnv;
    expect(resolvePrimaryModelForTier('mechanical', env)).toBe('local-llama');
  });

  it('resolves the default tier to sonnet', () => {
    expect(resolvePrimaryModelForTier('default', {} as NodeJS.ProcessEnv)).toBe('sonnet');
  });

  it('resolves the escalated tier to fable by default', () => {
    expect(resolvePrimaryModelForTier('escalated', {} as NodeJS.ProcessEnv)).toBe('fable');
  });

  it('resolves the escalated tier via AUTOPILOT_ESCALATED_MODEL', () => {
    const env = { AUTOPILOT_ESCALATED_MODEL: 'opus' } as NodeJS.ProcessEnv;
    expect(resolvePrimaryModelForTier('escalated', env)).toBe('opus');
  });
});

describe('budgetMultiplierForModel', () => {
  it('scales fable ~3.5x, opus ~1.7x, haiku 0.5x, unknown 1x', () => {
    expect(budgetMultiplierForModel('fable')).toBe(3.5);
    expect(budgetMultiplierForModel('claude-fable-5')).toBe(3.5);
    expect(budgetMultiplierForModel('opus')).toBe(1.7);
    expect(budgetMultiplierForModel('haiku')).toBe(0.5);
    expect(budgetMultiplierForModel('sonnet')).toBe(1);
    expect(budgetMultiplierForModel('anything-else')).toBe(1);
  });
});

describe('modelFamily / isModelSubstitution (silent-downgrade detection)', () => {
  it('maps concrete ids onto families', () => {
    expect(modelFamily('claude-fable-5')).toBe('fable');
    expect(modelFamily('claude-opus-4-8')).toBe('opus');
    expect(modelFamily('claude-sonnet-5')).toBe('sonnet');
    expect(modelFamily('haiku')).toBe('haiku');
  });

  it('flags a fable request served by opus (the drained-window downgrade)', () => {
    expect(isModelSubstitution('fable', 'claude-opus-4-8')).toBe(true);
  });

  it('does NOT flag the same family across id spellings', () => {
    expect(isModelSubstitution('fable', 'claude-fable-5')).toBe(false);
    expect(isModelSubstitution('claude-sonnet-5', 'sonnet')).toBe(false);
  });

  it('treats a missing served id as no evidence (a death before the envelope)', () => {
    expect(isModelSubstitution('fable', '')).toBe(false);
  });
});
