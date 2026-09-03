// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure renderTable()/replaceBlock()/withoutTimestamp()
 * helpers of scripts/threat-model/generate-table.mjs — the generator that
 * regenerates docs/THREAT-MODEL.md's TOOLGRANT:TABLE block. `main()` itself
 * stays unimported — it writes docs/THREAT-MODEL.md in place, same stance
 * apps/dashboard/test/tooling/verify-branch-protection.test.ts takes for its
 * sibling script's `main()`.
 */
import { describe, it, expect } from 'vitest';
import {
  renderTable,
  replaceBlock,
  withoutTimestamp,
} from '../../../../scripts/threat-model/generate-table.mjs';

describe('renderTable', () => {
  it('wraps the table in the TOOLGRANT:TABLE markers', () => {
    const table = renderTable();

    expect(table.startsWith('<!-- TOOLGRANT:TABLE:START -->')).toBe(true);
    expect(table.endsWith('<!-- TOOLGRANT:TABLE:END -->')).toBe(true);
  });

  it('renders a Tool/Grant table with at least one allowed and one disallowed row', () => {
    const table = renderTable();

    expect(table).toContain('| Tool | Grant |');
    expect(table).toContain('✅ allowed');
    expect(table).toContain('⛔ disallowed');
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
