// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ADR 0012 slice 2: the per-chunk English placement generator
 * (`web/english-heads.ts`) and the census over the real served chunks. The
 * census reads the English each served chunk actually carries (core's
 * narrowed `STRINGS.en`, the `/project.js` and `/panels.js` heads) and holds
 * the ADR's fallback contract over it: the three cover `STRINGS.en` exactly
 * once, and no chunk references a key whose English only arrives in a later
 * chunk — or in one its page never loads (`/project.js` is absent from the
 * home page).
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import {
  englishHeadJs,
  headWithEnglish,
  narrowCoreEnglish,
  placeComposedEnglish,
  placeEnglish,
  quotedWords,
  replaceSplice,
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

describe('narrowCoreEnglish / headWithEnglish', () => {
  const FULL = JSON.stringify(STRINGS.en);

  it("narrows core's one whole STRINGS.en splice to the given keys", () => {
    const served = narrowCoreEnglish(`let STRINGS = { en: ${FULL} };`, ['startOver']);
    expect(served).toBe(
      `let STRINGS = { en: {"startOver":${JSON.stringify(STRINGS.en.startOver)}} };`,
    );
  });

  it('throws when core no longer carries the whole table — a reshaped splice must not ship whole', () => {
    expect(() => narrowCoreEnglish('let STRINGS = { en: {} };', ['startOver'])).toThrow(
      /exactly one splice/,
    );
  });

  it("keeps `$&`-style patterns in the replacement literal (String.replace would read $' as the tail)", () => {
    expect(replaceSplice('a-b', '-', "$'")).toBe("a$'b");
  });

  it('puts the head before the chunk, never after it', () => {
    expect(headWithEnglish('selfInit();', ['startOver'])).toBe(
      `${englishHeadJs(['startOver'])}\nselfInit();`,
    );
  });
});

/**
 * The English one served chunk carries, read off the line that starts with
 * `prefix` and ends with `suffix`. JSON.stringify never emits a raw newline,
 * so the table is always that whole line.
 */
function servedEnglish(chunk: string, prefix: string, suffix: string): Record<string, string> {
  const line = chunk.split('\n').find((l) => l.startsWith(prefix)) ?? '';
  expect(line.endsWith(suffix), `a line ${prefix}…${suffix}`).toBe(true);
  return JSON.parse(line.slice(prefix.length, line.length - suffix.length)) as Record<
    string,
    string
  >;
}

describe('census over the served chunks (ADR 0012 fallback contract)', () => {
  const served = {
    core: coreClientJs(),
    project: projectClientJs(),
    panels: panelsClientJs(),
    whatsNew: whatsNewChunkJs(),
  };
  const keys = Object.keys(STRINGS.en);
  const english = {
    core: servedEnglish(served.core, 'let STRINGS = { en: ', ' };'),
    project: servedEnglish(served.project, 'Object.assign(STRINGS.en, ', ');'),
    panels: servedEnglish(served.panels, 'Object.assign(STRINGS.en, ', ');'),
  };
  const coreKeys = Object.keys(english.core);
  const projectKeys = Object.keys(english.project);
  const panelsKeys = Object.keys(english.panels);

  it('every English key is word-shaped, so the literal scan can see it', () => {
    expect(keys.filter((k) => !/^\w+$/.test(k))).toEqual([]);
  });

  it('each deferred head is its chunk’s first line, before any module self-inits', () => {
    expect(served.project.startsWith('Object.assign(STRINGS.en, ')).toBe(true);
    expect(served.panels.startsWith('Object.assign(STRINGS.en, ')).toBe(true);
  });

  it('the core subset and the two heads cover STRINGS.en exactly once', () => {
    const all = [...coreKeys, ...projectKeys, ...panelsKeys];
    expect(all.length).toBe(keys.length);
    expect([...all].sort()).toEqual([...keys].sort());
  });

  it('assembled in load order, the served tables rebuild STRINGS.en', () => {
    expect({ ...english.core, ...english.project, ...english.panels }).toEqual(STRINGS.en);
  });

  it('serves exactly the placement scanned from the composed chunks', () => {
    // Undo the byte move to get the chunks as their modules compose them:
    // the whole table back into core, the heads off the deferred chunks.
    const composed: ChunkSources = {
      core: replaceSplice(served.core, JSON.stringify(english.core), JSON.stringify(STRINGS.en)),
      project: served.project.slice(served.project.indexOf('\n') + 1),
      panels: served.panels.slice(served.panels.indexOf('\n') + 1),
      whatsNew: served.whatsNew,
    };
    expect(placeComposedEnglish(composed)).toEqual({
      core: coreKeys,
      project: projectKeys,
      panels: panelsKeys,
    });
    expect(composed.panels).toContain(localeDataJs());
  });

  it('no chunk calls tr() on a key whose English lives later, or in a chunk its page lacks', () => {
    // Keys come from the call-shape parser client-tr-keys.test.ts uses, not
    // from quotedWords(): the placement's own scan would pass by construction,
    // while a call its scan failed to see shows up here.
    const own = (list: readonly string[]) => new Set(list);
    const core = own(coreKeys);
    const onProjectPages = own([...coreKeys, ...projectKeys]);
    const onEveryPage = own([...coreKeys, ...panelsKeys]);
    const misses = (chunk: string, reachable: ReadonlySet<string>) =>
      trCallKeys(chunk).filter((k) => !reachable.has(k));
    expect(trCallKeys(served.core)).toContain('startOverConfirm');
    expect(trCallKeys(served.panels)).toContain('connectLoginTip');
    expect(misses(served.core, core)).toEqual([]);
    expect(misses(served.project, onProjectPages)).toEqual([]);
    expect(misses(served.panels, onEveryPage)).toEqual([]);
    expect(misses(served.whatsNew, onEveryPage)).toEqual([]);
  });

  it('the bytes really moved: core keeps a minority, and both heads carry English', () => {
    expect(coreKeys.length).toBeLessThan(keys.length / 2);
    expect(projectKeys.length).toBeGreaterThan(0);
    expect(panelsKeys.length).toBeGreaterThan(0);
    // Witnesses: a fleet-card confirm core calls, a project-page panel title,
    // and a key only the server renders.
    expect(coreKeys).toContain('startOverConfirm');
    expect(projectKeys).toContain('coordinationTitle');
    expect(panelsKeys).toContain('skipToFleet');
  });
});
