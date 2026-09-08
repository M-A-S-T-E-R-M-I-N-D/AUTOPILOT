// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure render half of the TOOLGRANT:TABLE generator —
 * `scripts/threat-model/render-table.mjs`. It imports that module and NOT its
 * `generate-table.mjs` caller on purpose: the caller reads the real tool grant
 * out of `packages/engine/dist`, a build artifact that does not exist when
 * `pnpm verify` reaches `test:coverage` (build runs after it), so importing it
 * here would make the gate fail on any tree that has not been built — the same
 * dependency-free stance `self-study-history-guard.test.ts` takes towards its
 * own `generate-data.mjs` sibling.
 *
 * What that split gives up — that the REAL constants render into the committed
 * doc — is not lost: `ci:threat-model` re-renders from `dist` and diffs against
 * `docs/THREAT-MODEL.md` after the build, which is the only place that check
 * can honestly run.
 */
import { describe, it, expect } from 'vitest';
import {
  renderTable,
  replaceBlock,
  withoutTimestamp,
} from '../../../../scripts/threat-model/render-table.mjs';

const GRANT = { allowed: ['Bash', 'Read'], disallowed: ['WebSearch'] };

describe('renderTable', () => {
  it('wraps the table in the TOOLGRANT:TABLE markers', () => {
    const table = renderTable(GRANT);

    expect(table.startsWith('<!-- TOOLGRANT:TABLE:START -->')).toBe(true);
    expect(table.endsWith('<!-- TOOLGRANT:TABLE:END -->')).toBe(true);
  });

  it('renders one Tool/Grant row per tool, allowed before disallowed', () => {
    const table = renderTable(GRANT);

    expect(table).toContain('| Tool | Grant |');
    expect(table).toContain('| Bash | ✅ allowed |');
    expect(table).toContain('| Read | ✅ allowed |');
    expect(table).toContain('| WebSearch | ⛔ disallowed |');
    expect(table.indexOf('| Bash |')).toBeLessThan(table.indexOf('| WebSearch |'));
  });

  it('renders without touching the filesystem or any build output', () => {
    // The whole point of the split: this module must stay importable on a tree
    // that has never run `pnpm build`. A regression here (someone re-importing
    // the engine constants into the pure module) would surface as `pnpm verify`
    // failing at test:coverage on a fresh clone, long before CI's build.
    expect(() => renderTable({ allowed: [], disallowed: [] })).not.toThrow();
  });
});

describe('replaceBlock', () => {
  const SOURCE = [
    '# Doc',
    '',
    '<!-- TOOLGRANT:TABLE:START -->',
    'stale',
    '<!-- TOOLGRANT:TABLE:END -->',
    '',
  ].join('\n');

  it('replaces everything between the markers with the new block', () => {
    const next = replaceBlock(
      SOURCE,
      '<!-- TOOLGRANT:TABLE:START -->\nfresh\n<!-- TOOLGRANT:TABLE:END -->',
    );

    expect(next).toContain('fresh');
    expect(next).not.toContain('stale');
  });

  it('leaves content outside the markers untouched', () => {
    const next = replaceBlock(
      SOURCE,
      '<!-- TOOLGRANT:TABLE:START -->\nfresh\n<!-- TOOLGRANT:TABLE:END -->',
    );

    expect(next.startsWith('# Doc\n\n')).toBe(true);
  });

  it('fails loudly when the markers are missing instead of silently disarming the check', () => {
    // A doc rewrite that drops either marker must not make replaceBlock
    // quietly return the source unchanged — that would let `--check` pass
    // forever on a doc that no longer has anywhere to regenerate into.
    expect(() => replaceBlock('# Doc with no markers', 'block')).toThrow(/markers not found/);
  });

  it('names the document it could not find markers in, so the failure is actionable', () => {
    expect(() => replaceBlock('# Doc', 'block', 'docs/THREAT-MODEL.md')).toThrow(
      /docs\/THREAT-MODEL\.md/,
    );
  });
});

describe('withoutTimestamp', () => {
  it('collapses the "_Generated <ts>_" line so timestamp-only drift compares equal', () => {
    const a =
      '<!-- TOOLGRANT:TABLE:START -->\n_Generated 2026-08-11T00:28:41.246Z by `pnpm threat-model:update`._\n\n| Tool | Grant |';
    const b =
      '<!-- TOOLGRANT:TABLE:START -->\n_Generated 2026-09-03T12:00:00.000Z by `pnpm threat-model:update`._\n\n| Tool | Grant |';

    expect(withoutTimestamp(a)).toBe(withoutTimestamp(b));
  });

  it('still distinguishes a real content change from timestamp-only drift', () => {
    const a = '_Generated 2026-08-11T00:28:41.246Z._\n\n| Bash | ✅ allowed |';
    const b = '_Generated 2026-09-03T12:00:00.000Z._\n\n| Bash | ⛔ disallowed |';

    expect(withoutTimestamp(a)).not.toBe(withoutTimestamp(b));
  });
});
