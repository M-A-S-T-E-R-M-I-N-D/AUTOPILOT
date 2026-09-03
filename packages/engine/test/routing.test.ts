// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  tierForSubstepKind,
  modelForTier,
  selectModelForSubstepLabel,
  type RoutingConfig,
  type SubstepKind,
} from '../src/routing.js';

const CONFIG: RoutingConfig = {
  localModel: 'ollama-local',
  cheapModel: 'haiku',
  topModel: 'opus',
};

describe('tierForSubstepKind', () => {
  it('routes the mechanical examples ENGINE-RESEARCH names to local', () => {
    expect(tierForSubstepKind('remediation-formatting')).toBe('local');
    expect(tierForSubstepKind('commit-draft')).toBe('local');
    expect(tierForSubstepKind('summary')).toBe('local');
    expect(tierForSubstepKind('triage')).toBe('local');
  });

  it('routes routine work to cheap', () => {
    expect(tierForSubstepKind('docs-fix')).toBe('cheap');
    expect(tierForSubstepKind('code-review')).toBe('cheap');
    expect(tierForSubstepKind('ask')).toBe('cheap');
  });

  it('routes hard reasoning/security/architecture to top', () => {
    expect(tierForSubstepKind('bug-fix')).toBe('top');
    expect(tierForSubstepKind('feature-implementation')).toBe('top');
    expect(tierForSubstepKind('security-review')).toBe('top');
    expect(tierForSubstepKind('architecture-decision')).toBe('top');
  });
});

describe('modelForTier', () => {
  it('resolves each tier to its configured model string', () => {
    expect(modelForTier('local', CONFIG)).toBe('ollama-local');
    expect(modelForTier('cheap', CONFIG)).toBe('haiku');
    expect(modelForTier('top', CONFIG)).toBe('opus');
  });
});

describe('selectModelForSubstepLabel', () => {
  it('resolves a recognized label through its tier to the configured model', () => {
    expect(selectModelForSubstepLabel('summary', CONFIG)).toBe('ollama-local');
    expect(selectModelForSubstepLabel('code-review', CONFIG)).toBe('haiku');
    expect(selectModelForSubstepLabel('security-review', CONFIG)).toBe('opus');
  });

  it('fails safe: an unrecognized label escalates to the top tier, never local/cheap', () => {
    expect(selectModelForSubstepLabel('some-unknown-kind', CONFIG)).toBe('opus');
    expect(selectModelForSubstepLabel('', CONFIG)).toBe('opus');
    expect(selectModelForSubstepLabel('__proto__', CONFIG)).toBe('opus');
    expect(selectModelForSubstepLabel('constructor', CONFIG)).toBe('opus');
  });

  it('every SubstepKind round-trips through the label entry point identically to the typed one', () => {
    const kinds: readonly SubstepKind[] = [
      'remediation-formatting',
      'commit-draft',
      'summary',
      'triage',
      'docs-fix',
      'code-review',
      'ask',
      'bug-fix',
      'feature-implementation',
      'security-review',
      'architecture-decision',
    ];
    for (const kind of kinds) {
      expect(selectModelForSubstepLabel(kind, CONFIG)).toBe(
        modelForTier(tierForSubstepKind(kind), CONFIG),
      );
    }
  });
});
