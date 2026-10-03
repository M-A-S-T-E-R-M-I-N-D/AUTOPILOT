// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/** cockpit-baseline-doc (2026-10-03): a cockpit-metrics run folds into the living
 *  docs/COCKPIT-BASELINE.md instead of a new dated EVALUATION file folded in by hand. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASELINE_DOC,
  NOISY_BLOCKS,
  readBlock,
  renderBaselineBlocks,
  staleBlocks,
  updateBaseline,
  upsertTrendRows,
} from '../../../../scripts/cockpit-baseline-doc.mjs';
import type { CockpitRunResults } from '../../../../scripts/cockpit-baseline-doc.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

const AXIS_TABLE = [
  '| axis | date | fixture size | total DOM nodes | nodes per added unit |',
  '| --- | --- | --- | --- | --- |',
  '| row | 2026-08-28 | 1 → 8 | 246 → 764 | 74.0 |',
  '| task | 2026-08-28 | 1 → 20 | 439 → 554 | 6.1 |',
].join('\n');

/** One run's measurements, shaped like scripts/cockpit-metrics.mjs's results. */
function results(rowNodes = 769): CockpitRunResults {
  const sizes = (label: string) => ({ label, smallN: 1, largeN: label === 'task' ? 20 : 8 });
  const labels = ['row', 'task', 'lane'];
  const zeroAxe = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const shape = { critical: 1, high: 3, needsYou: 0, medium: 1, low: 1 };
  const i18n = {
    text: { tagged: 1, untagged: 3 },
    aria: { tagged: 0, untagged: 0 },
    placeholder: { tagged: 2, untagged: 0 },
  };
  const timing = { interactions: 77, inpP75: 1.31, inpMax: 6.89, longestTask: 15.96 };
  return {
    axes: labels.map((l) => ({ ...sizes(l), smallNodes: 251, largeNodes: rowNodes, perUnit: 74 })),
    axeAxes: labels.map((l) => ({ ...sizes(l), small: zeroAxe, large: zeroAxe })),
    tabAxes: labels.map((l) => ({ ...sizes(l), smallStops: 77, largeStops: 238, perUnit: 23 })),
    attrAxes: labels.map((l) => ({ ...sizes(l), smallBytes: 10, largeBytes: 80, perUnit: 10 })),
    dupAxes: labels.map((l) => ({ ...sizes(l), smallMutations: 0, largeMutations: 0, perUnit: 0 })),
    longestTaskAxes: labels.map((l) => ({ ...sizes(l), smallMs: 0, largeMs: 55 })),
    cssCensus: {
      properties: 97,
      declarations: 2875,
      uniqueValues: 379,
      custom: { declarations: 193, unique: 135 },
      top: [{ property: 'padding', declarations: 147, unique: 25 }],
    },
    specificity: { selectors: 891, styleRules: 738, max: { a: 1, b: 2, c: 0 }, idSelectors: 34 },
    contrast: [
      {
        name: 'dark',
        cells: new Array(52).fill({}),
        min: { ratio: 1.3, fg: 'border', bg: 'surfaceRaised' },
        belowNonText: 6,
        nonTextOnly: 0,
        textReady: 46,
      },
    ],
    alarmIndex: { critical: ['.a'], high: ['.b', '.c'] },
    alarmAxes: labels.map((l) => ({
      ...sizes(l),
      small: { alarmed: 4, total: 250, shape },
      large: { alarmed: 18, total: 768, shape },
    })),
    i18nAxes: labels.map((l) => ({ ...sizes(l), small: i18n, large: i18n })),
    tokenColorCensus: {
      covered: 491,
      drifted: [],
      uncovered: ['.tour-overlay', '.browse-overlay', '.report-dialog-overlay'].map((selector) => ({
        property: 'background',
        value: 'rgba(0, 0, 0, 0.5)',
        selector,
      })),
      keyword: 41,
      unparsed: 0,
    },
    interactionAxes: labels.map((l) => ({ ...sizes(l), small: timing, large: timing })),
  };
}

/** A doc carrying every block one run writes, each holding only a table header. */
function skeleton(): string {
  const { trends, current } = renderBaselineBlocks('2026-01-01', results());
  const trendBlocks = Object.keys(trends).map((name) => {
    const header = readBlock(readFileSync(join(ROOT, BASELINE_DOC), 'utf8'), name)!
      .split('\n')
      .slice(0, 2)
      .join('\n');
    return `<!-- COCKPIT:${name}:START -->\n${header}\n<!-- COCKPIT:${name}:END -->`;
  });
  const currentBlocks = [...Object.keys(current), 'runs'].map(
    (name) => `<!-- COCKPIT:${name}:START -->\n<!-- COCKPIT:${name}:END -->`,
  );
  return `# doc\n\nprose stays\n\n${[...trendBlocks, ...currentBlocks].join('\n\nprose\n\n')}\n`;
}

describe('upsertTrendRows', () => {
  it('lands a new date after the last row of its own axis', () => {
    const next = upsertTrendRows(AXIS_TABLE, ['| row | 2026-09-03 | 1 → 8 | 251 → 769 | 74.0 |']);
    expect(next.split('\n').slice(2)).toEqual([
      '| row | 2026-08-28 | 1 → 8 | 246 → 764 | 74.0 |',
      '| row | 2026-09-03 | 1 → 8 | 251 → 769 | 74.0 |',
      '| task | 2026-08-28 | 1 → 20 | 439 → 554 | 6.1 |',
    ]);
  });

  it('replaces the row a second run on the same day already wrote', () => {
    const next = upsertTrendRows(AXIS_TABLE, ['| task | 2026-08-28 | 1 → 20 | 1 → 2 | 0.1 |']);
    expect(next.split('\n')).toHaveLength(4);
    expect(next).toContain('| task | 2026-08-28 | 1 → 20 | 1 → 2 | 0.1 |');
    expect(next).not.toContain('439 → 554');
  });

  it('appends an axis the table has never seen, and dates a once-per-run table', () => {
    expect(
      upsertTrendRows(AXIS_TABLE, ['| lane | 2026-09-03 | 1 → 8 | 1 → 2 | 0.1 |'])
        .split('\n')
        .at(-1),
    ).toBe('| lane | 2026-09-03 | 1 → 8 | 1 → 2 | 0.1 |');
    const once = '| date | selectors |\n| --- | --- |\n| 2026-08-28 | 813 |';
    expect(upsertTrendRows(once, ['| 2026-09-03 | 891 |'])).toBe(`${once}\n| 2026-09-03 | 891 |`);
  });

  it('refuses a table with no date column rather than guessing a key', () => {
    expect(() => upsertTrendRows('| axis | n |\n| --- | --- |', ['| row | 1 |'])).toThrow(
      /no date column/,
    );
  });
});

describe('updateBaseline', () => {
  it('writes every block, keeps the prose, and names each run date once', () => {
    const doc = updateBaseline(
      updateBaseline(skeleton(), renderBaselineBlocks('2026-09-03', results())),
      renderBaselineBlocks('2026-10-03', results(800)),
    );
    expect(doc.startsWith('# doc\n\nprose stays\n')).toBe(true);
    expect(readBlock(doc, 'dom-growth')!.split('\n').slice(2, 4)).toEqual([
      '| row | 2026-09-03 | 1 → 8 | 251 → 769 | 74.0 |',
      '| row | 2026-10-03 | 1 → 8 | 251 → 800 | 74.0 |',
    ]);
    expect(readBlock(doc, 'unique-values')).toContain(
      '| 2026-10-03 | 97 | 2875 | 379 | 193 | 135 |',
    );
    expect(readBlock(doc, 'alarm')).toContain(
      '| row | 2026-10-03 | 1 → 8 | 4 → 18 (1.6% → 2.3%) | 1 → 1 | 3 → 3 | 0 → 0 | 1 → 1 | 1 → 1 |',
    );
    expect(readBlock(doc, 'i18n')).toContain(
      '| 1/4 (25.0%) → 1/4 (25.0%) | 0/0 (n/a) → 0/0 (n/a) |',
    );
    expect(readBlock(doc, 'contrast')).toContain(
      '| dark | 1.30 (`border` on `surfaceRaised`) | 6 | 0 | 46 |',
    );
    expect(readBlock(doc, 'contrast')).toContain('(of 52 cells)');
    expect(readBlock(doc, 'color-literals')).toBe(
      'Latest run — drifted: none. Uncovered: `.tour-overlay` (`background: rgba(0, 0, 0, 0.5)`); ' +
        '`.browse-overlay` (`background: rgba(0, 0, 0, 0.5)`); ' +
        '`.report-dialog-overlay` (`background: rgba(0, 0, 0, 0.5)`).',
    );
    expect(readBlock(doc, 'alarm-selectors')).toBe(
      'Derived resting alarm selectors in the latest run: critical 1, high 2.',
    );
    expect(readBlock(doc, 'runs')).toBe('Runs so far: **2026-09-03**, **2026-10-03**.');
  });

  it('names at most twelve literals and counts the rest — the trend table has the totals', () => {
    const run = results();
    const many = Array.from({ length: 15 }, (_, i) => ({
      property: 'color',
      value: 'red',
      selector: `.s${i}`,
    }));
    const line = renderBaselineBlocks('2026-10-03', {
      ...run,
      tokenColorCensus: { ...run.tokenColorCensus, uncovered: many },
    }).current['color-literals']!;
    expect(line).toContain('`.s11` (`color: red`); 3 more.');
    expect(line).not.toContain('.s12');
  });

  it('is idempotent — the same run folded twice writes the same doc', () => {
    const fresh = renderBaselineBlocks('2026-10-03', results());
    const once = updateBaseline(skeleton(), fresh);
    expect(updateBaseline(once, fresh)).toBe(once);
  });

  it('throws instead of silently dropping a figure the doc has no block for', () => {
    expect(() =>
      updateBaseline('# no blocks\n', renderBaselineBlocks('2026-10-03', results())),
    ).toThrow(/has no dom-growth block/);
  });
});

describe('staleBlocks', () => {
  const recorded = updateBaseline(skeleton(), renderBaselineBlocks('2026-09-03', results()));

  it('is empty when a later run measured the same figures — the date alone is not drift', () => {
    expect(staleBlocks(recorded, renderBaselineBlocks('2026-10-03', results()))).toEqual([]);
  });

  it('names the axis whose latest row a fresh run disagrees with', () => {
    expect(staleBlocks(recorded, renderBaselineBlocks('2026-10-03', results(800)))).toEqual([
      'dom-growth:row',
      'dom-growth:task',
      'dom-growth:lane',
    ]);
  });

  it('leaves the wall-clock axes out — their noise is the machine, not the tree', () => {
    const fresh = renderBaselineBlocks('2026-10-03', results());
    const noisy = {
      ...fresh,
      trends: {
        ...fresh.trends,
        interaction: ['| row | 2026-10-03 | 1 → 8 | 1 → 1 | 9.99 → 9.99 | 9 → 9 | 9 → 9 |'],
      },
    };
    expect(NOISY_BLOCKS.has('interaction')).toBe(true);
    expect(staleBlocks(recorded, noisy)).toEqual([]);
  });

  it('names a current block whose figures moved', () => {
    const fresh = renderBaselineBlocks('2026-10-03', results());
    const moved = { ...fresh, current: { ...fresh.current, 'alarm-selectors': 'changed' } };
    expect(staleBlocks(recorded, moved)).toEqual(['alarm-selectors']);
  });
});

describe(BASELINE_DOC, () => {
  it('carries every block a cockpit-metrics run writes, plus the runs line', () => {
    const doc = readFileSync(join(ROOT, BASELINE_DOC), 'utf8');
    const { trends, current } = renderBaselineBlocks('2026-10-03', results());
    const missing = [...Object.keys(trends), ...Object.keys(current), 'runs'].filter(
      (name) => readBlock(doc, name) === null,
    );
    expect(missing).toEqual([]);
  });

  it('records rows a run would write byte for byte — the generator and the hand-kept history agree', () => {
    const doc = readFileSync(join(ROOT, BASELINE_DOC), 'utf8');
    const fresh = renderBaselineBlocks('2026-09-03', results());
    // The fixture's row-axis figures are the 2026-09-03 run's real ones.
    expect(readBlock(doc, 'dom-growth')).toContain(fresh.trends['dom-growth']![0]);
    expect(readBlock(doc, 'specificity')).toContain(fresh.trends['specificity']![0]);
    expect(readBlock(doc, 'token-coverage')).toContain(fresh.trends['token-coverage']![0]);
  });
});
