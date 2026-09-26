// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure alias-matching logic of
 * scripts/ci/check-model-freshness.mjs (board web-mtqumz0u-j39av4, guard
 * precision doctrine): the check's own history is the negative-corpus
 * case study — an earlier, looser version matched every quoted word in
 * `claude --help` and flagged `'agent'` from an unrelated flag on its
 * first run (FAILURE-DOCTRINE row 6). `main()` itself stays unimported —
 * it shells out to the `claude` CLI, same stance
 * apps/dashboard/test/tooling/secret-scan.test.ts takes for its sibling
 * script.
 */
import { describe, it, expect } from 'vitest';
import {
  extractAdvertisedAliases,
  findUnknownFamilyAliases,
  catalogueIds,
  catalogueFamilies,
  cataloguePinnedIds,
  resolveAliasFromUsage,
  findStalePins,
} from '../../../../scripts/ci/check-model-freshness.mjs';

/** A `claude --help` shape close enough to the real CLI's: the alias
 *  sentence plus unrelated flags that also quote single words — the exact
 *  kind of noise that tripped the pre-fix version. */
function helpText(aliasSentence: string): string {
  return [
    'Usage: claude [options] [command]',
    '',
    'Claude Code - starts an interactive session by default',
    '',
    'Options:',
    "  --agent <name>            Use a custom agent configuration (e.g. 'agent')",
    `  --model <model>           ${aliasSentence}`,
    "  --permission-mode <mode>  Permission mode (e.g. 'plan')",
  ].join('\n');
}

describe('extractAdvertisedAliases', () => {
  it('reads the alias words out of the "alias for the latest model" sentence', () => {
    const text = helpText(
      "Provide an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet')",
    );
    expect(extractAdvertisedAliases(text)).toEqual(['fable', 'opus', 'sonnet']);
  });

  it('ignores quoted words outside the alias sentence — the false-positive this check once shipped', () => {
    const text = helpText("Provide an alias for the latest model (e.g. 'fable' or 'opus')");
    const aliases = extractAdvertisedAliases(text);
    expect(aliases).not.toContain('agent');
    expect(aliases).not.toContain('plan');
    expect(aliases).toEqual(['fable', 'opus']);
  });

  it('returns an empty list when the CLI help has no alias sentence at all', () => {
    expect(
      extractAdvertisedAliases('Usage: claude [options]\n\nOptions:\n  --help  Show help'),
    ).toEqual([]);
  });

  it('dedups a word repeated within the alias sentence', () => {
    const text = helpText(
      "Provide an alias for the latest model (e.g. 'opus', 'opus', or 'sonnet')",
    );
    expect(extractAdvertisedAliases(text)).toEqual(['opus', 'sonnet']);
  });
});

describe('findUnknownFamilyAliases', () => {
  const KNOWN_FAMILIES = ['fable', 'opus', 'sonnet', 'haiku'];

  it('returns no findings — the negative corpus — when every advertised alias is already catalogued', () => {
    const text = helpText(
      "Provide an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet')",
    );
    expect(findUnknownFamilyAliases(text, KNOWN_FAMILIES)).toEqual([]);
  });

  it('never flags unrelated quoted flag words as unknown families, even though they are not catalogued', () => {
    const text = helpText("Provide an alias for the latest model (e.g. 'fable' or 'opus')");
    // 'agent' and 'plan' both appear quoted in the fixture's unrelated
    // flags and are deliberately absent from KNOWN_FAMILIES — a scanner
    // that scoped to the whole help text would misreport them here.
    expect(findUnknownFamilyAliases(text, KNOWN_FAMILIES)).toEqual([]);
  });

  it('flags a genuinely new family, carrying the matched word as evidence', () => {
    const text = helpText(
      "Provide an alias for the latest model (e.g. 'fable', 'opus', or 'nova')",
    );
    expect(findUnknownFamilyAliases(text, KNOWN_FAMILIES)).toEqual(['nova']);
  });

  it('returns an empty list against an empty families catalogue plus no alias sentence', () => {
    expect(findUnknownFamilyAliases('Usage: claude [options]', [])).toEqual([]);
  });
});

describe('catalogueIds', () => {
  it('reads every line-leading id at any indentation and spacing, and nothing else', () => {
    const src = [
      'export const MODEL_CATALOGUE = [',
      '  {',
      "    id: 'fable',",
      "    label: 'Fable (latest)',",
      '  },',
      '  {',
      "id:'claude-fable-5-1',",
      '  },',
      "  // the old pin id: 'claude-opus-5' went stale the day Opus 5.5 shipped",
      '];',
    ].join('\n');
    expect(catalogueIds(src)).toEqual(['fable', 'claude-fable-5-1']);
  });

  it('reads the real catalogue', () => {
    expect(catalogueIds()).toEqual(expect.arrayContaining(['opus', 'claude-opus-5-5']));
  });
});

describe('catalogueFamilies', () => {
  it('reads the declared family list', () => {
    const src = "export const MODEL_FAMILIES: readonly ModelFamily[] = ['fable', 'opus', 'nova'];";
    expect(catalogueFamilies(src)).toEqual(['fable', 'opus', 'nova']);
  });

  it('reads a declaration written without spaces', () => {
    expect(catalogueFamilies("MODEL_FAMILIES:readonly ModelFamily[]=['fable']")).toEqual(['fable']);
  });

  it('is empty when the declaration is missing, which makes every advertised alias a finding', () => {
    const families = catalogueFamilies('export const MODELS = [];');
    expect(families).toEqual([]);
    const text = helpText("Provide an alias for the latest model (e.g. 'fable' or 'opus')");
    expect(findUnknownFamilyAliases(text, families)).toEqual(['fable', 'opus']);
  });

  it('reads the real catalogue', () => {
    expect(catalogueFamilies()).toEqual(['fable', 'opus', 'sonnet', 'haiku']);
  });
});

/**
 * CASE 1 FINALLY HAS CODE BEHIND IT (2026-09-24). The header of this check
 * promised two kinds of staleness for two weeks and implemented one. The day
 * Opus 5.5 shipped, the catalogue still pinned `claude-opus-5`, the `opus`
 * alias already resolved to `claude-opus-5-5`, and the check said OK. These
 * are the pure halves of the fix; the paid probe itself stays unimported for
 * the same reason `main()` does.
 */
describe('cataloguePinnedIds', () => {
  const src = [
    "const MODEL_FAMILIES: readonly ModelFamily[] = ['fable', 'opus'];",
    'export const MODEL_CATALOGUE = [',
    "  { id: 'fable', label: 'Fable (latest)', selector: 'alias', family: 'fable' },",
    "  { id: 'claude-fable-5-1', label: 'Fable 5.1', selector: 'pinned', family: 'fable' },",
    "  { id: 'opus', label: 'Opus (latest)', selector: 'alias', family: 'opus' },",
    "  { id: 'claude-opus-5-5', label: 'Opus 5.5', selector: 'pinned', family: 'opus' },",
    '];',
  ].join('\n');

  it('reads the pinned id per family and ignores the aliases', () => {
    expect(cataloguePinnedIds(src)).toEqual({
      fable: 'claude-fable-5-1',
      opus: 'claude-opus-5-5',
    });
  });

  it('is empty when nothing is pinned', () => {
    expect(cataloguePinnedIds("[{ id: 'opus', selector: 'alias', family: 'opus' }]")).toEqual({});
  });

  it('reads a pinned entry written without spaces', () => {
    expect(
      cataloguePinnedIds("[{ id:'claude-nova-1', selector:'pinned', family:'nova' }]"),
    ).toStrictEqual({ nova: 'claude-nova-1' });
  });

  it('skips a pinned entry missing its id or its family instead of recording undefined', () => {
    expect(cataloguePinnedIds("[{ selector: 'pinned', family: 'opus' }]")).toStrictEqual({});
    expect(cataloguePinnedIds("[{ id: 'claude-opus-5-5', selector: 'pinned' }]")).toStrictEqual({});
  });

  it('reads the real catalogue and finds a pin for every family it declares', () => {
    const pinned = cataloguePinnedIds();
    expect(Object.keys(pinned).sort()).toEqual(['fable', 'haiku', 'opus', 'sonnet']);
    expect(pinned['opus']).toBe('claude-opus-5-5');
  });
});

describe('resolveAliasFromUsage', () => {
  it('picks the id of the asked-for family, not the Haiku side-call the CLI bills on every run', () => {
    const usage = { 'claude-haiku-4-5-20251001': {}, 'claude-opus-5-5': {} };
    expect(resolveAliasFromUsage(usage, 'opus')).toBe('claude-opus-5-5');
    expect(resolveAliasFromUsage(usage, 'haiku')).toBe('claude-haiku-4-5-20251001');
  });

  it('is null when the reply names nothing in that family, or is not a usage object at all', () => {
    expect(resolveAliasFromUsage({ 'claude-haiku-4-5-20251001': {} }, 'opus')).toBeNull();
    expect(resolveAliasFromUsage(undefined, 'opus')).toBeNull();
    expect(resolveAliasFromUsage(null, 'opus')).toBeNull();
    expect(resolveAliasFromUsage('claude-opus-5-5', 'opus')).toBeNull();
  });
});

describe('findStalePins', () => {
  it('names the pin and what the alias resolves to when they differ — the Opus 5.5 morning', () => {
    const findings = findStalePins({ opus: 'claude-opus-5' }, { opus: 'claude-opus-5-5' });
    expect(findings).toEqual([
      "the catalogue pins 'claude-opus-5' for opus, but 'opus' resolves to 'claude-opus-5-5' today",
    ]);
  });

  it('is silent when every pin is current', () => {
    expect(
      findStalePins(
        { fable: 'claude-fable-5-1', opus: 'claude-opus-5-5' },
        { fable: 'claude-fable-5-1', opus: 'claude-opus-5-5' },
      ),
    ).toEqual([]);
  });

  it('reports a family the probe could not resolve rather than passing it silently', () => {
    const unresolved = ["could not resolve what 'opus' points at today (pinned: claude-opus-5-5)"];
    expect(findStalePins({ opus: 'claude-opus-5-5' }, { opus: null })).toEqual(unresolved);
    expect(findStalePins({ opus: 'claude-opus-5-5' }, {})).toEqual(unresolved);
  });
});
