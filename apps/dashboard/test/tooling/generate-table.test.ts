// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for the pure render half of the TOOLGRANT:TABLE generator —
 * `scripts/threat-model/render-table.mjs`. It imports that module and NOT its
 * `generate-table.mjs` caller on purpose: the caller reads each agent's real
 * grant out of `packages/engine/dist`, a build artifact that does not exist
 * when `pnpm verify` reaches `test:coverage` (build runs after it). See
 * `tests-need-no-build.test.ts` for the gate that keeps it that way.
 *
 * What the split gives up — that the REAL constants render into the committed
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

const MAIN_AGENT = {
  name: 'Main flying agent',
  allowed: ['Bash', 'Read'],
  disallowed: ['WebSearch'],
  source: '`config.ts` `DEFAULT_ALLOWED_TOOLS`/`DEFAULT_DISALLOWED_TOOLS`',
};

const TOOL_LESS_AGENT = {
  name: 'Post-flight triage',
  allowed: [],
  disallowed: ['*'],
  source: '`config.ts` `TOOL_LESS_ALLOWED_TOOLS`/`TOOL_LESS_DISALLOWED_TOOLS`',
};

describe('renderTable', () => {
  it('wraps the table in the TOOLGRANT:TABLE markers', () => {
    const table = renderTable([MAIN_AGENT]);

    expect(table.startsWith('<!-- TOOLGRANT:TABLE:START -->')).toBe(true);
    expect(table.endsWith('<!-- TOOLGRANT:TABLE:END -->')).toBe(true);
  });

  it('renders one row per tool, carrying the agent name and the source that governs it', () => {
    const table = renderTable([MAIN_AGENT]);

    expect(table).toContain('| Agent | Tool | Grant | Source |');
    expect(table).toContain(
      '| Main flying agent | Bash | ✅ allowed | `config.ts` `DEFAULT_ALLOWED_TOOLS`/`DEFAULT_DISALLOWED_TOOLS` |',
    );
    expect(table).toContain(
      '| Main flying agent | WebSearch | ⛔ disallowed | `config.ts` `DEFAULT_ALLOWED_TOOLS`/`DEFAULT_DISALLOWED_TOOLS` |',
    );
  });

  it('keeps allowed rows ahead of disallowed ones', () => {
    const table = renderTable([MAIN_AGENT]);

    expect(table.indexOf('| Bash |')).toBeLessThan(table.indexOf('| WebSearch |'));
  });

  it('summarizes a tool-less agent as one denied-all row instead of an empty stretch of table', () => {
    // allowed: [] + disallowed: ['*'] is a real grant, not a missing one. Left
    // to the per-tool loops it would render NOTHING for that agent, and an
    // agent silently absent from a threat-model table reads as "not covered"
    // rather than "denied everything" — the opposite of the truth.
    const table = renderTable([TOOL_LESS_AGENT]);

    expect(table).toContain(
      '| Post-flight triage | _(none)_ | ⛔ all tools denied (tool-less) | `config.ts` `TOOL_LESS_ALLOWED_TOOLS`/`TOOL_LESS_DISALLOWED_TOOLS` |',
    );
    expect(table).not.toContain('| * |');
  });

  it('never lets an agent vanish from the table, whichever way its empty grant is written', () => {
    // An agent that renders zero rows reads as "not covered". In a threat model
    // that is the opposite of the truth, and it is the whole reason this
    // collapse exists — so it must hold for an empty/empty grant too, not only
    // for the one `disallowed: ['*']` shape the repo happens to use today.
    const nothingAtAll = {
      name: 'Auth probe',
      allowed: [],
      disallowed: [],
      source: '`auth.ts`',
    };

    const table = renderTable([nothingAtAll]);

    expect(table).toContain('| Auth probe | _(none)_ | ⛔ no tools granted | `auth.ts` |');
  });

  it('treats a `*` in the disallowed list as the wildcard it is, never as a tool named `*`', () => {
    // This document is meant to be read at face value. A literal `| * |` row
    // would claim a tool called `*` exists.
    const wildcardPlusNamed = {
      name: 'Mixed',
      allowed: [],
      disallowed: ['*', 'Bash'],
      source: '`somewhere.ts`',
    };

    const table = renderTable([wildcardPlusNamed]);

    expect(table).not.toContain('| * |');
    expect(table).toContain('⛔ all tools denied (tool-less)');
  });

  it('still names the carve-outs when a deny-all grant allows a few tools back', () => {
    const denyAllButRead = {
      name: 'Reader',
      allowed: ['Read', 'Grep'],
      disallowed: ['*'],
      source: '`somewhere.ts`',
    };

    const table = renderTable([denyAllButRead]);

    expect(table).toContain('⛔ all tools denied (tool-less) (except Read, Grep)');
  });

  it('covers several agents in one table, in the order given', () => {
    const table = renderTable([MAIN_AGENT, TOOL_LESS_AGENT]);

    expect(table.indexOf('Main flying agent')).toBeLessThan(table.indexOf('Post-flight triage'));
  });

  it('renders without touching the filesystem or any build output', () => {
    // The whole point of the split: this module must stay importable on a tree
    // that has never run `pnpm build`.
    expect(() => renderTable([])).not.toThrow();
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
      '<!-- TOOLGRANT:TABLE:START -->\n_Generated 2026-08-11T00:28:41.246Z by `pnpm threat-model:update`._\n\n| Agent | Tool |';
    const b =
      '<!-- TOOLGRANT:TABLE:START -->\n_Generated 2026-09-03T12:00:00.000Z by `pnpm threat-model:update`._\n\n| Agent | Tool |';

    expect(withoutTimestamp(a)).toBe(withoutTimestamp(b));
  });

  it('still distinguishes a real content change from timestamp-only drift', () => {
    const a = '_Generated 2026-08-11T00:28:41.246Z._\n\n| Bash | ✅ allowed |';
    const b = '_Generated 2026-09-03T12:00:00.000Z._\n\n| Bash | ⛔ disallowed |';

    expect(withoutTimestamp(a)).not.toBe(withoutTimestamp(b));
  });
});
