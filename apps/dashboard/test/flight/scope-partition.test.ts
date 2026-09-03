// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  parseTaskScope,
  scopeFilterCandidates,
  areaKeyOf,
  partitionBoardScopes,
} from '../../src/flight/scope-partition.js';

describe('parseTaskScope', () => {
  it('splits a comma-separated id list, trimming whitespace', () => {
    expect(parseTaskScope('a-1, b-2 ,c-3')).toEqual(new Set(['a-1', 'b-2', 'c-3']));
  });

  it('returns null for undefined, empty, or whitespace-only input (no scope = ordinary pull)', () => {
    expect(parseTaskScope(undefined)).toBeNull();
    expect(parseTaskScope('')).toBeNull();
    expect(parseTaskScope('  ,  , ')).toBeNull();
  });
});

describe('scopeFilterCandidates (partition-then-pull hybrid)', () => {
  const tasks = [
    { id: 't-1', status: 'queued' },
    { id: 't-2', status: 'queued' },
    { id: 't-3', status: 'queued' },
  ];

  it('no scope → every candidate passes (solo flights unchanged)', () => {
    expect(scopeFilterCandidates(tasks, null)).toEqual(tasks);
  });

  it('while ANY scope task is still a candidate, only scope tasks pass', () => {
    const scope = new Set(['t-2']);
    expect(scopeFilterCandidates(tasks, scope)).toEqual([{ id: 't-2', status: 'queued' }]);
  });

  it('scope exhausted (no scope task among candidates) → falls back to the full pull', () => {
    // Co-Coder's greedy list scheduling rationale: a faster agent that finished
    // its partition proceeds to the next ready task instead of idling.
    const scope = new Set(['gone-1', 'gone-2']);
    expect(scopeFilterCandidates(tasks, scope)).toEqual(tasks);
  });
});

describe('areaKeyOf (cohesion signal)', () => {
  it('prefers the primary path from the title, truncated to two segments', () => {
    expect(areaKeyOf('fix the thing in apps/dashboard/src/flight/runner.ts now')).toBe(
      'apps/dashboard',
    );
    expect(areaKeyOf('DELIVERABLE: packages/store/src/mutate.ts exists')).toBe('packages/store');
  });

  it('falls back to the leading uppercase tag (the board naming convention)', () => {
    expect(areaKeyOf('SHELL DECOMP 2/5 - client ES-module split')).toBe('SHELL');
    expect(areaKeyOf('SLICE-RELAY DUP 2/3: pre-commit sibling scan')).toBe('SLICE-RELAY');
    expect(areaKeyOf('COCKPIT 3/6 - fleet home restyled')).toBe('COCKPIT');
  });

  it('falls back to the first word, lowercased, when no path and no tag', () => {
    expect(areaKeyOf('queue forecast for the board header')).toBe('queue');
  });

  it('a VERDICT title keys on its SUBJECT, never on the VERDICT message-type tag', () => {
    // 2026-08-24 live board: 8 unrelated blocked-verdict work items all
    // hub-grouped onto ONE instance under the shared "VERDICT" tag — but
    // VERDICT is a message TYPE, not an area. The real cohesion is with the
    // named task's subject (a COCKPIT verdict touches COCKPIT's files).
    expect(
      areaKeyOf('VERDICT blocked COCKPIT 5/6 gauge-label slice (web-msrrjyik-qb6ckg): built'),
    ).toBe('COCKPIT');
    expect(areaKeyOf('VERDICT split web-msnt26xe-pc4pzp: FLEET WISDOM needs a design firing')).toBe(
      'FLEET',
    );
    // path in the remainder wins the same way it does for plain titles
    expect(areaKeyOf('VERDICT blocked web-msnsndki-dz3vn1: shell.ts live-claimed by fleet-6')).toBe(
      'shell.ts',
    );
    // two verdicts about different subjects must NOT share a key
    expect(areaKeyOf('VERDICT blocked web-a1-b2: fleet-home restyle engineering done')).not.toBe(
      areaKeyOf('VERDICT blocked web-c3-d4: next i18n slice (guided tour dialog)'),
    );
    // a degenerate verdict with no remainder still gets a stable key
    expect(areaKeyOf('VERDICT close web-a1-b2:')).toBe('verdict');
  });

  it('a hub-file mention beats the leading tag — differently-tagged tasks touching the same file must group together', () => {
    // board web-mtbp0t95-ho38s4 "INTENT COLLISION SURVIVES AREA PARTITIONING":
    // REPORT-FROM-HERE, COCKPIT, and SHELL are three DIFFERENT area tags, but
    // all three named tasks edit shell.ts — the exact file the HUB RULE exists
    // to keep off two lanes at once. Tag-only grouping missed this because a
    // hub file crosses area boundaries; the fix keys on the shared file first.
    expect(areaKeyOf('SHELL DECOMP 2/5 - client module split, touches shell.ts directly')).toBe(
      'shell.ts',
    );
    expect(areaKeyOf('COCKPIT 3/6 - fleet home restyle wires into shell.ts')).toBe('shell.ts');
    expect(areaKeyOf('REPORT-FROM-HERE 1/2 - capture hook added to shell.ts')).toBe('shell.ts');
    // an untagged, path-qualified mention of the same hub file also unifies.
    expect(areaKeyOf('fix a leak in apps/dashboard/src/web/shell.ts render loop')).toBe('shell.ts');
    // a title that never mentions the hub file keeps its ordinary tag key.
    expect(areaKeyOf('SHELL DECOMP 2/5 - client ES-module split')).toBe('SHELL');
  });

  it('a docs/ path never beats a leading tag — epic-slice titles citing their spec must group per-EPIC', () => {
    // 2026-08-21 live-board incident: every epic slice cites its spec file
    // (docs/epics/00xx-*.md), so path-first grouping merged FOUR unrelated
    // epics (COCKPIT/GITHUB/PLATFORM/BRAND) into one unsplittable 13-task
    // mega-hub — one instance got 13 tasks, nine got 2-3. The doc path is
    // where the spec LIVES, not what the task TOUCHES; the tag is the real
    // cohesion signal there.
    expect(areaKeyOf('COCKPIT 5/6 - charts pass, spec in docs/epics/0009-cockpit.md')).toBe(
      'COCKPIT',
    );
    expect(areaKeyOf('BRAND 3/4 - avatar exports per docs/epics/0008-brand-mark.md')).toBe('BRAND');
    // no tag → the docs path itself is still better than a first-word guess
    expect(areaKeyOf('refresh docs/epics/0008-brand-mark.md status notes')).toBe('docs/epics');
  });
});

describe('partitionBoardScopes (hub-safe cohesion grouping + LPT balance)', () => {
  it('every task lands in EXACTLY one instance scope (disjoint by construction)', () => {
    const tasks = [
      { id: 'a1', title: 'SHELL DECOMP 2/5' },
      { id: 'a2', title: 'SHELL DECOMP 3/5' },
      { id: 'b1', title: 'COCKPIT 3/6' },
      { id: 'c1', title: 'PLATFORM 4/7' },
      { id: 'd1', title: 'queue forecast' },
    ];
    const scopes = partitionBoardScopes(tasks, ['i1', 'i2', 'i3']);
    const all = [...scopes.values()].flat();
    expect(all.sort()).toEqual(['a1', 'a2', 'b1', 'c1', 'd1']);
    expect(new Set(all).size).toBe(all.length); // no id in two scopes
  });

  it('an area group is NEVER split across instances (the hub rule)', () => {
    const tasks = [
      { id: 's1', title: 'SHELL DECOMP 2/5' },
      { id: 's2', title: 'SHELL DECOMP 3/5' },
      { id: 's3', title: 'SHELL DECOMP 4/5' },
      { id: 'x1', title: 'COCKPIT 1/6' },
    ];
    const scopes = partitionBoardScopes(tasks, ['i1', 'i2']);
    for (const ids of scopes.values()) {
      const hasShell = ids.some((id) => id.startsWith('s'));
      if (hasShell) expect(ids.filter((id) => id.startsWith('s'))).toHaveLength(3);
    }
  });

  it('balances group COUNT across instances greedily, biggest group first (LPT)', () => {
    const tasks = [
      { id: 'a1', title: 'AREA-A one' },
      { id: 'a2', title: 'AREA-A two' },
      { id: 'a3', title: 'AREA-A three' },
      { id: 'b1', title: 'AREA-B one' },
      { id: 'c1', title: 'AREA-C one' },
    ];
    const scopes = partitionBoardScopes(tasks, ['i1', 'i2']);
    const sizes = [...scopes.values()].map((v) => v.length).sort();
    // LPT: [3] vs [1,1] — never [3,1] vs [1]
    expect(sizes).toEqual([2, 3]);
  });

  it('more instances than groups: surplus instances get empty scopes (they fall back to pull)', () => {
    const tasks = [{ id: 'a1', title: 'AREA-A one' }];
    const scopes = partitionBoardScopes(tasks, ['i1', 'i2', 'i3']);
    expect([...scopes.values()].filter((v) => v.length > 0)).toHaveLength(1);
    expect(scopes.size).toBe(3);
  });

  it('merges known SHELL-monolith tags into ONE group (INTENT COLLISION SURVIVES AREA PARTITIONING, web-mtbp0t95-ho38s4): SHELL, COCKPIT, and REPORT-FROM-HERE are distinct areaKeyOf() tags but all wire through apps/dashboard/src/web/shell.ts, so splitting them across instances defeats the hub rule by construction', () => {
    const tasks = [
      { id: 's1', title: 'SHELL DECOMP 2/5' },
      { id: 'c1', title: 'COCKPIT 3/6' },
      { id: 'r1', title: 'REPORT-FROM-HERE 1/2' },
      { id: 'q1', title: 'queue forecast for the board header' },
    ];
    const scopes = partitionBoardScopes(tasks, ['i1', 'i2']);
    const hubIds = new Set(['s1', 'c1', 'r1']);
    for (const ids of scopes.values()) {
      const hubHits = ids.filter((id) => hubIds.has(id));
      if (hubHits.length > 0) expect(hubHits).toHaveLength(hubIds.size);
    }
  });

  it('a shared hub file keeps differently-tagged tasks on ONE lane (the live collision)', () => {
    // The exact shape of the 2026-08-27 incident this partitioner exists to
    // prevent: three DIFFERENT area tags, all editing shell.ts.
    const tasks = [
      { id: 's1', title: 'SHELL DECOMP 2/5 - client module split, touches shell.ts directly' },
      { id: 'c1', title: 'COCKPIT 3/6 - fleet home restyle wires into shell.ts' },
      { id: 'r1', title: 'REPORT-FROM-HERE 1/2 - capture hook added to shell.ts' },
      { id: 'x1', title: 'PLATFORM 4/7 - unrelated keeper ritual' },
    ];
    const scopes = partitionBoardScopes(tasks, ['i1', 'i2']);
    const laneOf = (id: string) => [...scopes.entries()].find(([, ids]) => ids.includes(id))?.[0];
    expect(laneOf('s1')).toBe(laneOf('c1'));
    expect(laneOf('s1')).toBe(laneOf('r1'));
  });
});
