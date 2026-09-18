// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Operator, 2026-09-18: "every run has these odd chips and I don't
 * understand what they say or what I can really do with them" — the
 * needs-you anomaly chips named a rule and hid the evidence in a hover tip;
 * nothing said what the rule MEANT or what to do about it. A chip is now
 * the summary of a <details> popover: press it and it says what it means,
 * why it fired, and what you can do. Every kind carries both sentences in
 * both locales, and the census here fails the moment a new kind lands
 * without them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import {
  ANOMALY_KINDS,
  ANOMALY_LABELS,
  anomalyKeySuffix,
  anomalyMeaningKeys,
} from '../../src/web/anomaly.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 6,
  shipped: 1,
  cost: 9,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.16,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  anomalies: [
    { kind: 'cost-spike', evidence: 'Firing cost $5.00 vs ~$1.00 average of the last 5 firings.' },
    { kind: 'e2e-land-block', evidence: 'A landing was refused: failure (46m ago)' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 1, firings: 6, shipped: 1, openFindings: 0, cost: 9 },
  projects: [PROJECT],
  empty: false,
};

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => STATE }) as Response);
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function pops(): HTMLDetailsElement[] {
  return Array.from(document.querySelectorAll('.card-head-badges details.chip-pop'));
}

describe('the key math (pure)', () => {
  it('turns a kebab kind into the two STRINGS keys its popover reads', () => {
    expect(anomalyKeySuffix('cost-spike')).toBe('CostSpike');
    expect(anomalyKeySuffix('e2e-land-block')).toBe('E2eLandBlock');
    expect(anomalyMeaningKeys('guard-denial')).toEqual({
      what: 'anomalyWhatGuardDenial',
      action: 'anomalyActionGuardDenial',
    });
  });

  it('the census: every kind has a label, and a what/action pair in BOTH locales', () => {
    expect(ANOMALY_KINDS.length).toBeGreaterThan(10);
    expect([...ANOMALY_KINDS].sort()).toEqual(Object.keys(ANOMALY_LABELS).sort());
    for (const kind of ANOMALY_KINDS) {
      const keys = anomalyMeaningKeys(kind);
      for (const locale of ['en', 'he'] as const) {
        const table = STRINGS[locale] as Readonly<Record<string, string>>;
        expect(table[keys.what], `${locale} ${keys.what}`).toBeTruthy();
        expect(table[keys.action], `${locale} ${keys.action}`).toBeTruthy();
      }
    }
    for (const key of ['anomalyPopEvidence', 'anomalyPopAction'] as const) {
      expect(STRINGS.en[key]).toBeTruthy();
      expect(STRINGS.he[key]).toBeTruthy();
    }
  });
});

describe('the chip popover (jsdom)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders each anomaly as a <details> whose summary is the chip — label, evidence tip, concise aria', async () => {
    await boot();
    const all = pops();
    expect(all).toHaveLength(2);
    const summary = all[0]!.querySelector('summary.chip.chip-anomaly')!;
    expect(summary).not.toBeNull();
    expect(summary.textContent).toContain('cost spike');
    expect(summary.getAttribute('data-tip')).toContain('$5.00');
    expect(summary.getAttribute('aria-label')).toBe('anomaly: cost spike');
    expect(all[0]!.open).toBe(false);
  });

  it('opening a chip shows what it means, why it fired, and what to do — in words from the catalog', async () => {
    await boot();
    const pop = pops()[1]!;
    pop.open = true;
    const body = pop.querySelector('.chip-pop-body')!;
    expect(body.querySelector('.chip-pop-what')?.textContent).toBe(
      STRINGS.en.anomalyWhatE2eLandBlock,
    );
    expect(body.querySelector('.chip-pop-evidence')?.textContent).toContain(
      'A landing was refused: failure (46m ago)',
    );
    expect(body.querySelector('.chip-pop-evidence')?.textContent).toContain(
      STRINGS.en.anomalyPopEvidence,
    );
    expect(body.querySelector('.chip-pop-action')?.textContent).toContain(
      STRINGS.en.anomalyActionE2eLandBlock,
    );
  });

  it('Escape closes an open popover, and so does a click anywhere outside it', async () => {
    await boot();
    const [first, second] = pops() as [HTMLDetailsElement, HTMLDetailsElement];
    first.open = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(first.open).toBe(false);

    second.open = true;
    document.body.click();
    expect(second.open).toBe(false);

    // A click INSIDE the open popover leaves it open.
    second.open = true;
    (second.querySelector('.chip-pop-body') as HTMLElement).click();
    expect(second.open).toBe(true);
  });

  it('the stylesheet floats the body under the chip and hides the native marker', () => {
    const css = layoutCss();
    expect(css).toContain('.chip-pop { display: inline-block; position: relative; }');
    expect(css).toContain('.chip-pop > summary { list-style: none; cursor: pointer; }');
    expect(css).toContain('.chip-pop-body { position: absolute;');
  });
});
