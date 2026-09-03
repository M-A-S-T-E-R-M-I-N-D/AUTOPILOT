// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import {
  changelogVersionHeadingPattern,
  refreshModelCardEngineVersion,
  refreshReadmeStatusVersion,
} from '../../../../scripts/citation/generate-citation.mjs';

const README_FIXTURE = [
  '## Status',
  '',
  'Built milestone-by-milestone per [`docs/ACTION-PLAN.md`](docs/ACTION-PLAN.md) (M0→M9). Current version **0.16.0** — see',
  '[`CHANGELOG.md`](CHANGELOG.md).',
  '',
  '<!-- HOW-TO-CITE:START -->',
  '  version = {0.19.0},',
  '<!-- HOW-TO-CITE:END -->',
  '',
].join('\n');

describe('refreshReadmeStatusVersion', () => {
  it('rewrites a stale Status "Current version" line to the package version', () => {
    // Arrange: the citation block already says 0.19.0 while the hand-maintained
    // Status line still says 0.16.0 — the exact drift three 2026-09-02 releases
    // left behind because the generator only rewrote the HOW-TO-CITE block.
    const next = refreshReadmeStatusVersion(README_FIXTURE, '0.19.0');

    // Assert: only the Status line moved; everything else is byte-identical.
    expect(next).toContain('Current version **0.19.0** — see');
    expect(next).not.toContain('0.16.0');
    expect(next.replace('**0.19.0** — see', '**0.16.0** — see')).toBe(README_FIXTURE);
  });

  it('is a no-op when the Status line already names the package version', () => {
    expect(refreshReadmeStatusVersion(README_FIXTURE, '0.16.0')).toBe(README_FIXTURE);
  });

  it('accepts a version carrying semver build metadata verbatim', () => {
    const next = refreshReadmeStatusVersion(README_FIXTURE, '1.2.3+build.5');

    expect(next).toContain('Current version **1.2.3+build.5** — see');
  });

  it('fails loudly when the Status line is missing instead of silently disarming the check', () => {
    // Arrange: a README rewrite that dropped the anchor line. Returning the
    // source unchanged here would make `--check` pass forever on a README
    // that no longer states its version at all — the same stance
    // `replaceBlock` takes on missing HOW-TO-CITE markers.
    const withoutStatusLine = README_FIXTURE.replace('Current version **0.16.0** — see', 'see');

    expect(() => refreshReadmeStatusVersion(withoutStatusLine, '0.19.0')).toThrow(
      /Current version/,
    );
  });
});

const MODEL_CARD_FIXTURE = [
  '## 6. Evidence pointers',
  '',
  '| Pointer | Value |',
  '|---|---|',
  '| Engine/package version | `0.15.0` (`package.json`) |',
  '| Firing-Prompt-Version (current) | `firing-v12` |',
  '| This card last reviewed against the above | 2026-09-03 |',
  '',
].join('\n');

describe('refreshModelCardEngineVersion', () => {
  it('rewrites a stale §6 "Engine/package version" pointer to the package version', () => {
    // Arrange: the pointer still names the version the last hand edit left
    // there — the one freshness surface the 2026-08-28 and 2026-09-03 upkeep
    // passes each had to fix by hand because the generator never touched it.
    const next = refreshModelCardEngineVersion(MODEL_CARD_FIXTURE, '0.19.0');

    // Assert: only the version inside the pointer's code span moved.
    expect(next).toContain('| Engine/package version | `0.19.0` (`package.json`) |');
    expect(next).not.toContain('0.15.0');
    expect(next.replace('`0.19.0` (`package.json`)', '`0.15.0` (`package.json`)')).toBe(
      MODEL_CARD_FIXTURE,
    );
  });

  it('is a no-op when the pointer already names the package version', () => {
    expect(refreshModelCardEngineVersion(MODEL_CARD_FIXTURE, '0.15.0')).toBe(MODEL_CARD_FIXTURE);
  });

  it('leaves the Firing-Prompt-Version pointer alone — it versions independently', () => {
    const next = refreshModelCardEngineVersion(MODEL_CARD_FIXTURE, '0.19.0');

    expect(next).toContain('| Firing-Prompt-Version (current) | `firing-v12` |');
  });

  it('fails loudly when the pointer row is missing instead of silently disarming the check', () => {
    // Arrange: a §6 rewrite that dropped the engine-version row. Same stance
    // as `refreshReadmeStatusVersion`: an unchanged return would let
    // `--check` pass forever on a card that no longer states its version.
    const withoutPointer = MODEL_CARD_FIXTURE.replace(
      '| Engine/package version | `0.15.0` (`package.json`) |\n',
      '',
    );

    expect(() => refreshModelCardEngineVersion(withoutPointer, '0.19.0')).toThrow(
      /Engine\/package version/,
    );
  });
});

describe('changelogVersionHeadingPattern', () => {
  it('matches a plain semver release heading and captures its date', () => {
    const pattern = changelogVersionHeadingPattern('1.2.3');
    const changelog = '## [1.2.3] — 2026-01-15\n\nNotes.\n';

    expect(changelog.match(pattern)?.[1]).toBe('2026-01-15');
  });

  it('matches a release heading whose version carries semver build metadata', () => {
    // '+' is a regex quantifier when unescaped ("one or more of the
    // preceding atom") — a version like this is valid semver and must still
    // match its own CHANGELOG.md heading verbatim.
    const pattern = changelogVersionHeadingPattern('1.2.3+build.5');
    const changelog = '## [1.2.3+build.5] — 2026-01-15\n\nNotes.\n';

    expect(changelog.match(pattern)?.[1]).toBe('2026-01-15');
  });
});
