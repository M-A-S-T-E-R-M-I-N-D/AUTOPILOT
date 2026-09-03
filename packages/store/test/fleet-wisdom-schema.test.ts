// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, migrate, FLEET_TABLES, type Store } from '../src/index.js';
import {
  proposeFleetWisdomAmendment,
  ratifyFleetWisdomAmendment,
  dismissFleetWisdomProposal,
} from '../src/mutate.js';
import { getFleetWisdom } from '../src/read.js';

function fleetRow(store: Store): {
  wisdom: string;
  wisdom_proposed: string | null;
  wisdom_proposed_at: number | null;
} {
  return store.db
    .prepare(`SELECT wisdom, wisdom_proposed, wisdom_proposed_at FROM fleet WHERE id = 'fleet'`)
    .get() as { wisdom: string; wisdom_proposed: string | null; wisdom_proposed_at: number | null };
}

let store: Store;

beforeEach(() => {
  store = openStore(':memory:');
  migrate(store);
});
afterEach(() => store.close());

describe('fleet wisdom schema (v20)', () => {
  it('exposes the single fleet-wide table', () => {
    expect(FLEET_TABLES).toEqual(['fleet']);
  });

  it('seeds exactly one row on migrate, with empty wisdom and nothing pending', () => {
    const count = store.db.prepare('SELECT COUNT(*) AS c FROM fleet').get() as { c: number };
    expect(count.c).toBe(1);
    expect(fleetRow(store)).toEqual({
      wisdom: '',
      wisdom_proposed: null,
      wisdom_proposed_at: null,
    });
  });

  it('rejects any id other than the seeded singleton (CHECK)', () => {
    expect(() =>
      store.db.prepare(`INSERT INTO fleet (id, wisdom) VALUES ('not-fleet', '')`).run(),
    ).toThrow();
  });

  it('rejects a second row sharing the same id (PRIMARY KEY)', () => {
    expect(() =>
      store.db.prepare(`INSERT INTO fleet (id, wisdom) VALUES ('fleet', 'dup')`).run(),
    ).toThrow();
  });
});

describe('proposeFleetWisdomAmendment / ratifyFleetWisdomAmendment / dismissFleetWisdomProposal', () => {
  it('proposeFleetWisdomAmendment writes the pending text and timestamp without touching wisdom', () => {
    expect(proposeFleetWisdomAmendment(store, 'a fleet-wide note', 5)).toBe(true);
    expect(fleetRow(store)).toEqual({
      wisdom: '',
      wisdom_proposed: 'a fleet-wide note',
      wisdom_proposed_at: 5,
    });
  });

  it('proposeFleetWisdomAmendment rejects a blank proposal', () => {
    expect(proposeFleetWisdomAmendment(store, '   ', 5)).toBe(false);
    expect(fleetRow(store).wisdom_proposed).toBeNull();
  });

  it('a second proposal overwrites the first pending one', () => {
    proposeFleetWisdomAmendment(store, 'first draft', 5);
    proposeFleetWisdomAmendment(store, 'second draft', 6);
    expect(fleetRow(store)).toEqual({
      wisdom: '',
      wisdom_proposed: 'second draft',
      wisdom_proposed_at: 6,
    });
  });

  it('ratifyFleetWisdomAmendment applies the pending text and clears the slot', () => {
    proposeFleetWisdomAmendment(store, 'a fleet-wide note', 5);
    expect(ratifyFleetWisdomAmendment(store)).toBe(true);
    expect(fleetRow(store)).toEqual({
      wisdom: 'a fleet-wide note',
      wisdom_proposed: null,
      wisdom_proposed_at: null,
    });
  });

  it('ratifyFleetWisdomAmendment is a no-op when nothing is pending', () => {
    expect(ratifyFleetWisdomAmendment(store)).toBe(false);
  });

  it('dismissFleetWisdomProposal clears the pending slot without touching wisdom', () => {
    proposeFleetWisdomAmendment(store, 'a fleet-wide note', 5);
    expect(dismissFleetWisdomProposal(store)).toBe(true);
    expect(fleetRow(store)).toEqual({
      wisdom: '',
      wisdom_proposed: null,
      wisdom_proposed_at: null,
    });
  });

  it('dismissFleetWisdomProposal is a no-op when nothing is pending', () => {
    expect(dismissFleetWisdomProposal(store)).toBe(false);
  });
});

describe('getFleetWisdom', () => {
  it('returns the seeded row with nothing pending on a fresh migrated store', () => {
    expect(getFleetWisdom(store.db)).toEqual({
      id: 'fleet',
      wisdom: '',
      wisdom_proposed: null,
      wisdom_proposed_at: null,
    });
  });

  it('reflects a pending proposal after proposeFleetWisdomAmendment', () => {
    proposeFleetWisdomAmendment(store, 'a fleet-wide note', 5);
    expect(getFleetWisdom(store.db)).toEqual({
      id: 'fleet',
      wisdom: '',
      wisdom_proposed: 'a fleet-wide note',
      wisdom_proposed_at: 5,
    });
  });

  it('returns null on a pre-v20 store (no fleet table yet)', () => {
    const unmigrated = openStore(':memory:');
    try {
      expect(() => getFleetWisdom(unmigrated.db)).toThrow();
    } finally {
      unmigrated.close();
    }
  });
});
