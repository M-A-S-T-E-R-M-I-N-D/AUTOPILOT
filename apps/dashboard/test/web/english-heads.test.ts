// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ADR 0012 slice 2a: the per-chunk English placement generator
 * (`web/english-heads.ts`) and the census over the real served chunks. The
 * census holds the ADR's fallback contract before any byte moves (slice 2b):
 * the heads cover `STRINGS.en` exactly once, and no chunk references a key
 * whose English would only arrive in a later chunk — or in one its page
 * never loads (`/project.js` is absent from the home page).
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import {
  englishHeadJs,
  englishTable,
  placeEnglish,
  quotedWords,
  withoutSplice,
  type ChunkSources,
} from '../../src/web/english-heads.js';
import { localeDataJs } from '../../src/web/features/locale-data.js';
import {
  coreClientJs,
  panelsClientJs,
  projectClientJs,
  whatsNewChunkJs,
} from '../../src/web/shell.js';

const EMPTY: ChunkSources = { core: '', project: '', panels: '', whatsNew: '' };

/** Keys passed to a literal `tr('k'…)` or `setTip(el, 'k')` call. */
function trCallKeys(js: string): string[] {
  const direct = [...js.matchAll(/\btr\(["']([^"']+)["']/g)].map((m) => m[1] ?? '');
  const viaSetTip = [...js.matchAll(/\bsetTip\([^,()]+, '([^']+)'\)/g)].map((m) => m[1] ?? '');
  return [...direct, ...viaSetTip];
}

describe('quotedWords', () => {
  it('reads whole literals in all three quote styles, never a word inside a longer string', () => {
    const words = quotedWords("tr('alpha'); x = \"beta\"; y = `gamma`; z = 'delta epsilon';");
    expect([...words].sort()).toEqual(['alpha', 'beta', 'gamma']);
  });
});

describe('withoutSplice', () => {
  it('leaves out the one copy of the splice', () => {
    expect(withoutSplice('a{"k":"v"}b', '{"k":"v"}')).toBe('ab');
  });

  it('throws when the splice is missing — a reshaped table must not be scanned as code', () => {
    expect(() => withoutSplice('abc', '{"k":"v"}')).toThrow(/exactly one splice/);
  });

  it('throws when the splice repeats', () => {
    expect(() => withoutSplice('xyx', 'x')).toThrow(/exactly one splice/);
  });
});

describe('placeEnglish', () => {
  const place = (sources: Partial<ChunkSources>, keys: string[]) =>
    placeEnglish({ ...EMPTY, ...sources }, keys);

  it('keeps a core-referenced key in core, even when a deferred chunk also names it', () => {
    expect(place({ core: "tr('k')", panels: "tr('k')" }, ['k']).core).toEqual(['k']);
  });

  it('heads /project.js with a key only project code references', () => {
    expect(place({ project: "tr('k')" }, ['k'])).toEqual({ core: [], project: ['k'], panels: [] });
  });

  it('keeps a key project shares with /panels.js or /whats-new.js in core — project is absent on the home page', () => {
    expect(place({ project: "'k'", panels: "'k'" }, ['k']).core).toEqual(['k']);
    expect(place({ project: "'k'", whatsNew: '"k"' }, ['k']).core).toEqual(['k']);
  });

  it('heads /panels.js with panel-only and unreferenced (server-rendered) keys, in table order', () => {
    expect(place({ panels: "tr('b')" }, ['b', 'a'])).toEqual({
      core: [],
      project: [],
      panels: ['b', 'a'],
    });
  });
});

describe('englishHeadJs', () => {
  it('widens STRINGS.en in place, keeping the object core captured', () => {
    const run = new Function(
      `let STRINGS = { en: { a: 'x' } }; const before = STRINGS.en;\n${englishHeadJs(['startOver'])}\nreturn { en: STRINGS.en, same: before === STRINGS.en };`,
    );
    expect(run()).toEqual({ en: { a: 'x', startOver: STRINGS.en.startOver }, same: true });
  });
});

describe('census over the served chunks (ADR 0012 fallback contract)', () => {
  const sources: ChunkSources = {
    core: withoutSplice(coreClientJs(), JSON.stringify(STRINGS.en)),
    project: projectClientJs(),
    panels: withoutSplice(panelsClientJs(), localeDataJs()),
    whatsNew: whatsNewChunkJs(),
  };
  const keys = Object.keys(STRINGS.en);
  const placement = placeEnglish(sources);

  it('every English key is word-shaped, so the literal scan can see it', () => {
    expect(keys.filter((k) => !/^\w+$/.test(k))).toEqual([]);
  });

  it('the core subset and the two heads cover STRINGS.en exactly once', () => {
    const all = [...placement.core, ...placement.project, ...placement.panels];
    expect(all.length).toBe(keys.length);
    expect([...all].sort()).toEqual([...keys].sort());
  });

  it('assembled in load order, the core subset and the heads rebuild STRINGS.en', () => {
    const rebuilt = new Function(
      `let STRINGS = { en: ${JSON.stringify(englishTable(placement.core))} };\n` +
        `${englishHeadJs(placement.project)}\n${englishHeadJs(placement.panels)}\nreturn STRINGS.en;`,
    )();
    expect(rebuilt).toEqual(STRINGS.en);
  });

  it('no chunk calls tr() on a key whose English lives later, or in a chunk its page lacks', () => {
    // Keys come from the call-shape parser client-tr-keys.test.ts uses, not
    // from quotedWords(): the placement's own scan would pass by construction,
    // while a call its scan failed to see shows up here.
    const own = (list: readonly string[]) => new Set(list);
    const core = own(placement.core);
    const onProjectPages = own([...placement.core, ...placement.project]);
    const onEveryPage = own([...placement.core, ...placement.panels]);
    const misses = (chunk: string, reachable: ReadonlySet<string>) =>
      trCallKeys(chunk).filter((k) => !reachable.has(k));
    expect(trCallKeys(sources.core)).toContain('startOverConfirm');
    expect(trCallKeys(sources.panels)).toContain('connectLoginTip');
    expect(misses(sources.core, core)).toEqual([]);
    expect(misses(sources.project, onProjectPages)).toEqual([]);
    expect(misses(sources.panels, onEveryPage)).toEqual([]);
    expect(misses(sources.whatsNew, onEveryPage)).toEqual([]);
  });

  it('the splices really are left out: core keeps a minority, and both heads carry English', () => {
    expect(placement.core.length).toBeLessThan(keys.length / 2);
    expect(placement.project.length).toBeGreaterThan(0);
    expect(placement.panels.length).toBeGreaterThan(0);
    // Witnesses: a fleet-card confirm core calls, a project-page panel title,
    // and a key only the server renders.
    expect(placement.core).toContain('startOverConfirm');
    expect(placement.project).toContain('coordinationTitle');
    expect(placement.panels).toContain('skipToFleet');
  });
});
