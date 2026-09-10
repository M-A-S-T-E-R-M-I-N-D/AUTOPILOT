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
