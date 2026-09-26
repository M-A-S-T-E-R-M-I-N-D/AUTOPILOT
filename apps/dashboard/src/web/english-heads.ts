// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ADR 0012 option B ("English travels with its first caller"), slice 2a:
 * the generator that decides which served chunk carries each `STRINGS.en`
 * entry, derived from the chunks' own source text instead of a hand-kept
 * list (the ADR's "Generated, not hand-listed" rule), so a new key lands in
 * the right chunk without per-slice budget bookkeeping.
 *
 * A key counts as referenced by a chunk when its name appears as a whole
 * quoted literal (`'k'`, `"k"` or `` `k` ``) in that chunk's text. The
 * spliced tables themselves must be left out first — core's own
 * `STRINGS.en` JSON and `locale-data.ts`'s non-English JSON spell every key,
 * and would claim all of them — which is what `withoutSplice()` is for. A
 * key that happens to spell an unrelated literal counts too, which only keeps
 * English earlier than it needs to be. The scan's one blind spot runs the
 * other way: a key composed at runtime (`tr('x' + y)`) is invisible and would
 * fall to the `/panels.js` head. ADR 0012 found none; slice 2b's census
 * clause for non-literal `tr()` call sites is what keeps it that way.
 *
 * Placement follows the execution order `/app.js` (parser-blocking), then
 * `/project.js`, `/panels.js`, `/whats-new.js` (all `defer`, document order):
 * - core keeps every key core references, plus every key project code
 *   shares with a later every-page chunk — `/project.js` never loads on the
 *   home page, and a `/panels.js` head would race project code, which runs
 *   on the first `/api/state` response, possibly before panels executes;
 * - `/project.js`'s head gets the keys only project code references;
 * - `/panels.js`'s head gets everything else, including the keys only the
 *   server renders (the client needs their English solely to repaint after
 *   a Hebrew → English switch, and panels rides every page).
 *
 * Slice 2a moves no bytes: nothing serves these heads yet. Slice 2b wires
 * them into `coreClientJs()`/`projectClientJs()`/`panelsClientJs()` with the
 * split budgets; `test/web/english-heads.test.ts` is the census both share.
 */
import { STRINGS } from '@autopilot/tokens';

/** Each served chunk's text, spliced English tables already left out. */
export interface ChunkSources {
  readonly core: string;
  readonly project: string;
  readonly panels: string;
  readonly whatsNew: string;
}

/** Which chunk carries each English key, in `STRINGS.en` order. */
export interface EnglishPlacement {
  readonly core: readonly string[];
  readonly project: readonly string[];
  readonly panels: readonly string[];
}

const QUOTED_WORD = /(['"`])(\w+)\1/g;

/** Every whole quoted word-literal in `source`. */
export function quotedWords(source: string): ReadonlySet<string> {
  return new Set([...source.matchAll(QUOTED_WORD)].map((m) => m[2] as string));
}

/**
 * `text` with its one copy of `splice` left out. Throws when `splice` is
 * missing or repeated: a table that changed shape would otherwise stay in
 * the scanned text and silently claim every key for its chunk.
 */
export function withoutSplice(text: string, splice: string): string {
  const at = text.indexOf(splice);
  if (at < 0 || text.indexOf(splice, at + 1) >= 0) {
    throw new Error(`english-heads: expected exactly one splice of ${splice.length} chars`);
  }
  return text.slice(0, at) + text.slice(at + splice.length);
}

/** ADR 0012's placement invariant over the given chunk texts. */
export function placeEnglish(
  sources: ChunkSources,
  keys: readonly string[] = Object.keys(STRINGS.en),
): EnglishPlacement {
  const inCore = quotedWords(sources.core);
  const inProject = quotedWords(sources.project);
  const inPanels = quotedWords(sources.panels);
  const inWhatsNew = quotedWords(sources.whatsNew);
  const everyPageLater = (k: string): boolean => inPanels.has(k) || inWhatsNew.has(k);
  const core = keys.filter((k) => inCore.has(k) || (inProject.has(k) && everyPageLater(k)));
  const coreSet = new Set(core);
  const project = keys.filter((k) => !coreSet.has(k) && inProject.has(k));
  const projectSet = new Set(project);
  const panels = keys.filter((k) => !coreSet.has(k) && !projectSet.has(k));
  return { core, project, panels };
}

/** The English entries for `keys`, in the order given. */
export function englishTable(keys: readonly string[]): Record<string, string> {
  const en: Readonly<Record<string, string>> = STRINGS.en;
  return Object.fromEntries(keys.map((k) => [k, en[k] as string]));
}

/**
 * A deferred chunk's head: widens core's `STRINGS.en` in place — never a
 * reassignment, which would drop core's subset — before any module in the
 * chunk self-initializes and calls `tr()`.
 */
export function englishHeadJs(keys: readonly string[]): string {
  return `Object.assign(STRINGS.en, ${JSON.stringify(englishTable(keys))});`;
}
