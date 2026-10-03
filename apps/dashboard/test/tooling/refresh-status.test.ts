// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * refresh-status (2026-10-03): the living facts the status pages used to
 * carry by hand — nine of them had drifted (a version two releases behind,
 * "11 anomaly kinds" against fifteen, "110 Stryker configs" against 130).
 * The generator reads each count from its source of truth and rewrites one
 * STATUS:FACTS block per page; `ci:docs-status` fails when a block drifts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STATUS_TARGETS,
  collectFacts,
  epicBucket,
  renderFacts,
  rewriteBlock,
} from '../../../../scripts/docs/refresh-status.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

describe('epicBucket', () => {
  it('buckets the Status: vocabulary the epics actually use', () => {
    expect(epicBucket('Done')).toBe('shipped');
    expect(epicBucket('Shipped — slices 1-4 landed')).toBe('shipped');
    expect(epicBucket('All five slices SHIPPED (2026-09-12)')).toBe('shipped');
    expect(epicBucket('Draft (2026-09-13)')).toBe('draft');
    expect(epicBucket('Specified, not started')).toBe('draft');
    expect(epicBucket('Active')).toBe('active');
    expect(epicBucket('In progress — research spec landed')).toBe('active');
    // Anything unrecognised stays in the total rather than vanishing.
    expect(epicBucket('Paused for the operator')).toBe('active');
  });
});

describe('rewriteBlock', () => {
  it('replaces only what sits between the markers', () => {
    const text =
      'before\n<!-- STATUS:FACTS:START -->\nold line\n<!-- STATUS:FACTS:END -->\nafter\n';
    expect(rewriteBlock(text, 'new line')).toBe(
      'before\n<!-- STATUS:FACTS:START -->\nnew line\n<!-- STATUS:FACTS:END -->\nafter\n',
    );
  });

  it('returns null for a file with no block, so the caller can name it', () => {
    expect(rewriteBlock('no markers here', 'x')).toBeNull();
    expect(
      rewriteBlock('<!-- STATUS:FACTS:END --> then <!-- STATUS:FACTS:START -->', 'x'),
    ).toBeNull();
  });

  it('keeps the blank lines Prettier puts inside the block, so a rewrite is stable', () => {
    // CONTRIBUTING.md's block follows a list; Prettier separates the opening
    // marker from the paragraph with a blank line, and a generator that
    // removed it would flip the file on every run.
    const text = '- item\n\n<!-- STATUS:FACTS:START -->\n\nold line\n<!-- STATUS:FACTS:END -->\n';
    expect(rewriteBlock(text, 'new line')).toBe(
      '- item\n\n<!-- STATUS:FACTS:START -->\n\nnew line\n<!-- STATUS:FACTS:END -->\n',
    );
    // A freshly inserted block (markers on consecutive lines) gets one newline each side.
    expect(rewriteBlock('<!-- STATUS:FACTS:START -->\n<!-- STATUS:FACTS:END -->', 'l')).toBe(
      '<!-- STATUS:FACTS:START -->\nl\n<!-- STATUS:FACTS:END -->',
    );
  });
});

describe('collectFacts on this tree', () => {
  const facts = collectFacts(ROOT);

  it('reads the version, release date and Node floor from their sources', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      version: string;
      engines: { node: string };
    };
    expect(facts.version).toBe(pkg.version);
    expect(facts.released).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(`>=${facts.nodeFloor}`).toBe(pkg.engines.node);
  });

  it('counts what the tree holds today, within sane bounds', () => {
    expect(facts.promptVersion).toMatch(/^firing-v\d+$/);
    expect(facts.testFilesRounded % 10).toBe(0);
    expect(facts.testFilesRounded).toBeGreaterThan(500);
    expect(facts.mutationConfigs).toBeGreaterThan(100);
    expect(facts.anomalyKinds).toBeGreaterThanOrEqual(15);
    expect(facts.doctrineRows).toBeGreaterThanOrEqual(87);
    expect(facts.epics.shipped + facts.epics.active + facts.epics.draft).toBeGreaterThan(20);
  });

  it('renders one line that names every fact', () => {
    const line = renderFacts(facts);
    expect(line).toContain(`v${facts.version}`);
    expect(line).toContain(`${facts.mutationConfigs} mutation configs`);
    expect(line).toContain(`${facts.anomalyKinds} anomaly kinds`);
    expect(line).toContain(`${facts.doctrineRows} rows in the failure doctrine`);
    expect(line).toContain(`Node ≥ ${facts.nodeFloor}`);
    expect(line).toContain('pnpm docs:status');
  });

  it('every target page carries exactly one STATUS:FACTS block', () => {
    for (const rel of STATUS_TARGETS) {
      const text = readFileSync(join(ROOT, rel), 'utf8');
      expect(text.split('<!-- STATUS:FACTS:START -->').length, rel).toBe(2);
      expect(text.split('<!-- STATUS:FACTS:END -->').length, rel).toBe(2);
    }
  });
});
