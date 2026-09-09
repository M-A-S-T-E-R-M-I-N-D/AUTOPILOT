// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE MODEL CATALOGUE (operator, 2026-09-09: "I don't see selectable
 * models like Fable 5.1 … make sure the software really knows how to use
 * the new models and updates them as they ship").
 *
 * The behaviour that matters most here is the NEGATIVE one: the catalogue
 * must never become the reason a model newer than this build cannot fly.
 * A registry that gates would turn every model launch into a release
 * blocker for us. These pin that promise.
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_CATALOGUE,
  MODEL_FAMILIES,
  modelFamilyOf,
  describeModel,
  tracksLatest,
} from '../src/models.js';
import { DEFAULT_ENGINE_CONFIG } from '../src/config.js';

describe('MODEL_CATALOGUE', () => {
  it('offers both an auto-tracking alias and a pinned version for every family', () => {
    for (const family of MODEL_FAMILIES) {
      const entries = MODEL_CATALOGUE.filter((e) => e.family === family);
      expect(entries.some((e) => e.selector === 'alias')).toBe(true);
      expect(entries.some((e) => e.selector === 'pinned')).toBe(true);
    }
  });

  it('lists the auto-tracking alias first in each family — a picker should land on it', () => {
    for (const family of MODEL_FAMILIES) {
      const first = MODEL_CATALOGUE.find((e) => e.family === family);
      expect(first?.selector).toBe('alias');
    }
  });

  it('carries no duplicate ids', () => {
    const ids = MODEL_CATALOGUE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry explains when to reach for it — a picker with unlabelled options is not a choice', () => {
    for (const entry of MODEL_CATALOGUE) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(10);
    }
  });

  it('contains the models the engine actually defaults to', () => {
    const ids = MODEL_CATALOGUE.map((e) => e.id);
    expect(ids).toContain(DEFAULT_ENGINE_CONFIG.primaryModel);
    expect(ids).toContain(DEFAULT_ENGINE_CONFIG.fallbackModel);
  });
});

describe('modelFamilyOf', () => {
  it('resolves every catalogued id to its family', () => {
    for (const entry of MODEL_CATALOGUE) {
      expect(modelFamilyOf(entry.id)).toBe(entry.family);
    }
  });

  it('recognizes a FUTURE version this build has never seen', () => {
    // The whole point: Fable 6 ships, nobody has updated this file yet,
    // and the fleet still knows what it is looking at.
    expect(modelFamilyOf('claude-fable-6')).toBe('fable');
    expect(modelFamilyOf('claude-opus-7-20270101')).toBe('opus');
  });

  it('returns null — never throws — for something with no family at all', () => {
    expect(modelFamilyOf('some-other-vendor-model')).toBeNull();
    expect(modelFamilyOf('')).toBeNull();
    expect(modelFamilyOf('   ')).toBeNull();
  });

  it('is case- and whitespace-tolerant', () => {
    expect(modelFamilyOf('  Claude-Fable-5-1  ')).toBe('fable');
  });
});

describe('describeModel', () => {
  it('gives a catalogued model its operator-facing label', () => {
    expect(describeModel('claude-fable-5-1')).toMatchObject({ label: 'Fable 5.1', known: true });
  });

  it('describes an unknown model honestly, and says it still flies', () => {
    const described = describeModel('claude-fable-6');

    expect(described.known).toBe(false);
    expect(described.label).toBe('claude-fable-6');
    expect(described.note).toContain('still flies');
    expect(described.note).toContain('fable');
  });

  it('handles a model with no recognizable family without pretending', () => {
    const described = describeModel('mystery-model');

    expect(described.known).toBe(false);
    expect(described.note).toContain('still flies');
  });
});

describe('tracksLatest', () => {
  it('is true for a bare family alias and false for a pinned version', () => {
    expect(tracksLatest('fable')).toBe(true);
    expect(tracksLatest('opus')).toBe(true);
    expect(tracksLatest('claude-fable-5-1')).toBe(false);
    expect(tracksLatest('claude-opus-5')).toBe(false);
  });

  it('says the shipped default tracks new releases on its own', () => {
    // This is why "we already fly the newest Fable" is true today without
    // anyone editing config: the default is an alias, not a pin.
    expect(tracksLatest(DEFAULT_ENGINE_CONFIG.primaryModel)).toBe(true);
  });
});
