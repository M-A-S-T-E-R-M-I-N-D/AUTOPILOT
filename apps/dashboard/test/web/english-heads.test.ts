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
 * home page). Its third clause (slice 2c) covers the calls the literal scan
 * cannot read: no `tr()` key is composed at runtime, and the keys the server
 * supplies resolve in every chunk that renders them.
 */

import { describe, it, expect } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { REPORT_COMPOSE_REASON_KEYS } from '../../src/flight/report-compose.js';
import { REPORT_REASON_KEYS } from '../../src/flight/report-from-here.js';
import {
  COMPOSED_KEY_STEMS,
  COMPOSED_KEY_SUFFIX,
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

/**
 * The first argument of every `tr(` call in `js`, as trimmed source text: read
 * up to the call's first top-level `,` or `)`, stepping over quoted strings
 * and nested brackets. Served chunks keep their comments, so a prose mention
 * reads too — "tr() here" as '' and "tr(key) now" as 'key' — and both pass
 * as named. A line break outside a template literal ends the read, so a
 * stray "tr(" in prose cannot swallow the rest of the chunk.
 */
function trFirstArgs(js: string): string[] {
  const args: string[] = [];
  for (const m of js.matchAll(/\btr\(/g)) {
    const start = (m.index ?? 0) + m[0].length;
    let depth = 0;
    let quote = '';
    let i = start;
    for (; i < js.length; i++) {
      const c = js[i];
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = '';
      } else if (c === "'" || c === '"' || c === '`') quote = c;
      else if (c === '(' || c === '[' || c === '{') depth++;
      else if (depth > 0 && (c === ')' || c === ']' || c === '}')) depth--;
      else if (depth === 0 && (c === ',' || c === ')')) break;
      if (c === '\n' && quote !== '`') break;
    }
    args.push(js.slice(start, i).trim());
  }
  return args;
}

const STRING_LITERAL = String.raw`(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|` + '`[^`$\\\\]*`)';
/**
 * A key the scan can read: a literal, or a ternary between two literals. The
 * condition is lazy, so it can hold a `?` of its own (`a?.kind`).
 */
const LITERAL_KEY = new RegExp(
  `^(?:${STRING_LITERAL}|.+?\\?\\s*${STRING_LITERAL}\\s*:\\s*${STRING_LITERAL})$`,
);
/** A key held in a variable or property (`key`, `step.titleKey`, `spec[1]`). */
const KEY_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\d+\])*$/;

/**
 * A `tr()` first argument whose key the literal scan can account for: a
 * literal, a ternary of literals, a variable or property path, or nothing (a
 * prose mention). Concatenation, interpolation and calls fail: they compose
 * the key at runtime, where no quoted literal spells it.
 */
function namesItsKey(arg: string): boolean {
  return arg === '' || LITERAL_KEY.test(arg) || KEY_PATH.test(arg);
}

/**
 * The camelCase stems and suffixes `js` joins to a runtime value with `+` or
 * `${…}`, among those that could start or end a STRINGS key: the
 * compositions that build a key no literal spells. A stem needs an inner
 * capital, and a suffix a leading capital and a second character. That
 * leaves out CSS classes (`'task' + …`) and units (`n + 'M'`), so a
 * lower-case one-word stem is this reader's blind spot.
 */
function composedKeyParts(
  js: string,
  keys: readonly string[],
): { stems: string[]; suffixes: string[] } {
  const isStem = (w: string) =>
    /^[a-z]\w*[A-Z]\w*$/.test(w) && keys.some((k) => k !== w && k.startsWith(w));
  const isSuffix = (w: string) =>
    /^[A-Z]\w+$/.test(w) && keys.some((k) => k !== w && k.endsWith(w));
  const heads = [...js.matchAll(/(['"])(\w+)\1\s*\+|`(\w+)\$\{/g)].map((m) => m[2] ?? m[3] ?? '');
  const tails = [...js.matchAll(/\+\s*(['"])(\w+)\1|\}(\w+)`/g)].map((m) => m[2] ?? m[3] ?? '');
  return {
    stems: [...new Set(heads.filter(isStem))].sort(),
    suffixes: [...new Set(tails.filter(isSuffix))].sort(),
  };
}

/** Keys the server sends for the client to render with `tr(<…>.reasonKey)`. */
const SERVER_REASON_KEYS: readonly string[] = [
  ...REPORT_REASON_KEYS,
  ...REPORT_COMPOSE_REASON_KEYS,
];

/** Whether `js` renders a server-supplied `reasonKey` through `tr()`. */
function rendersServerReasonKey(js: string): boolean {
  return trFirstArgs(js).some((a) => /(?:^|\.)reasonKey$/.test(a));
}

describe('quotedWords', () => {
  it('reads whole literals in all three quote styles, never a word inside a longer string', () => {
    const words = quotedWords("tr('alpha'); x = \"beta\"; y = `gamma`; z = 'delta epsilon';");
    expect([...words].sort()).toEqual(['alpha', 'beta', 'gamma']);
  });
});

describe('trFirstArgs / namesItsKey (the census’s runtime-key reader)', () => {
  it('reads each call’s first argument past nested brackets and quoted commas', () => {
    const js = "tr('a, b'); tr(x ? 'y' : 'z', n); tr(f(k, 1)); tr(s[1]) and tr() prose";
    expect(trFirstArgs(js)).toEqual(["'a, b'", "x ? 'y' : 'z'", 'f(k, 1)', 's[1]', '']);
  });

  it('stops at a line break, so an unclosed prose mention cannot swallow the chunk', () => {
    expect(trFirstArgs("// tr(isn't closed\ntr('k')")).toEqual(["isn't closed", "'k'"]);
  });

  it('passes literals, ternaries of literals and key paths, and fails composed keys', () => {
    const named = [
      "'k'",
      '"k"',
      '`k`',
      'a === 1 ? \'x\' : "y"',
      "a?.kind ? 'x' : 'y'",
      'key',
      'step.titleKey',
      'spec[1]',
      '',
    ];
    const composed = ["'x' + y", '`x${y}`', 'f(k)', "a ? 'x' : y", 'keys[i]'];
    expect(named.filter((a) => !namesItsKey(a))).toEqual([]);
    expect(composed.filter(namesItsKey)).toEqual([]);
  });

  it('reads camelCase stems and suffixes joined to a runtime value, never classes or units', () => {
    const js =
      'a = "anomalyWhat" + s; b = `orientFixationTip${k}`; c = labelKey + \'Tip\'; ' +
      'd = \'task\' + x; e = n + "M"; f = `${n}s`;';
    const keys = ['anomalyWhatX', 'orientFixationTipOne', 'statusTip', 'taskAdd', 'sizeM', 'bars'];
    expect(composedKeyParts(js, keys)).toEqual({
      stems: ['anomalyWhat', 'orientFixationTip'],
      suffixes: ['Tip'],
    });
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

  it('places a composed family member with the chunk that spells its stem', () => {
    const keys = ['anomalyWhatCostSpike', 'taskStatusDone', 'taskStatusDoneTip', 'orphanTip'];
    expect(place({ core: '"anomalyWhat" + s; m = { d: "taskStatusDone" }' }, keys)).toEqual({
      core: ['anomalyWhatCostSpike', 'taskStatusDone', 'taskStatusDoneTip'],
      project: [],
      panels: ['orphanTip'],
    });
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
  // The English each chunk can read once it runs: its own and every earlier
  // chunk's that its page loads (`/project.js` is absent from the home page).
  const onEveryPage = new Set([...coreKeys, ...panelsKeys]);
  const reachable: Record<keyof typeof served, ReadonlySet<string>> = {
    core: new Set(coreKeys),
    project: new Set([...coreKeys, ...projectKeys]),
    panels: onEveryPage,
    whatsNew: onEveryPage,
  };
  const chunkNames = Object.keys(served) as (keyof typeof served)[];

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
    expect(trCallKeys(served.core)).toContain('startOverConfirm');
    expect(trCallKeys(served.panels)).toContain('connectLoginTip');
    for (const name of chunkNames) {
      const misses = trCallKeys(served[name]).filter((k) => !reachable[name].has(k));
      expect(misses, name).toEqual([]);
    }
  });

  it('no tr() call composes its key inline, where no literal spells it for the scan', () => {
    // A key composed first and handed over in a variable is the next test's.
    const args = chunkNames.flatMap((name) => trFirstArgs(served[name]));
    expect(args).toContain('plan.reasonKey');
    expect(args).toContain("isLast ? 'tourClose' : 'tourSkip'");
    for (const name of chunkNames) {
      const composedInline = trFirstArgs(served[name]).filter((a) => !namesItsKey(a));
      expect(composedInline, name).toEqual([]);
    }
  });

  it('every key stem or suffix a chunk composes at runtime is a declared family', () => {
    const parts = chunkNames.map((name) => composedKeyParts(served[name], keys));
    const stems = parts.flatMap((p) => p.stems);
    const suffixes = parts.flatMap((p) => p.suffixes);
    expect(stems.filter((s) => !COMPOSED_KEY_STEMS.includes(s))).toEqual([]);
    expect(suffixes.filter((s) => s !== COMPOSED_KEY_SUFFIX)).toEqual([]);
    // No declared family is stale: each still composes somewhere.
    expect(new Set(stems)).toEqual(new Set(COMPOSED_KEY_STEMS));
    expect(suffixes).toContain(COMPOSED_KEY_SUFFIX);
  });

  it('a composed family resolves in full in every chunk that composes it', () => {
    // Core composes both kinds: the fleet card's status-pill tips and the
    // anomaly popover's words, which it can render before /panels.js runs.
    expect(composedKeyParts(served.core, keys)).toEqual({
      stems: [...COMPOSED_KEY_STEMS].sort(),
      suffixes: [COMPOSED_KEY_SUFFIX],
    });
    const tip = COMPOSED_KEY_SUFFIX;
    for (const name of chunkNames) {
      const { stems, suffixes } = composedKeyParts(served[name], keys);
      const pairsTips = suffixes.includes(tip);
      const members = keys.filter(
        (k) =>
          stems.some((s) => k !== s && k.startsWith(s)) ||
          (pairsTips && k.endsWith(tip) && reachable[name].has(k.slice(0, -tip.length))),
      );
      const unreachable = members.filter((k) => !reachable[name].has(k));
      expect(unreachable, name).toEqual([]);
    }
  });

  it('every reasonKey the server can send resolves in each chunk that renders one', () => {
    // These keys reach the client as data, so no client literal need spell
    // them, and the scan can leave them to the /panels.js head. That is safe
    // only while every chunk that renders them can read what they resolve to.
    const renderers = chunkNames.filter((name) => rendersServerReasonKey(served[name]));
    expect(renderers).toContain('panels');
    for (const name of renderers) {
      const unreachable = SERVER_REASON_KEYS.filter((k) => !reachable[name].has(k));
      expect(unreachable, name).toEqual([]);
    }
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
