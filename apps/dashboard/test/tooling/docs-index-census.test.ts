// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Census guard for the promise docs/README.md opens with: "Every document
 * under `docs/`, one line each, grouped by who reads it."
 *
 * That line is load-bearing — it is the entry point the newcomer reading
 * order at the bottom of the same file starts from, and the map a firing
 * uses to find doctrine it has not read. It is also the exact claim that
 * rots silently: adding `docs/FOO.md` costs one commit, remembering to
 * index it costs a second, and nothing failed when the second never came.
 *
 * Found live by the docs staleness sweep (board web-mtncmhm9-j1byft) on
 * 2026-09-19: docs/MUTATION-DEBT.md had been an actively-maintained doc
 * since 2026-09-16 — edited in four separate commits, linked from
 * DEPENDENCY-POLICY.md — and was never in the index. The index had been
 * lying for three days, and would have kept lying.
 *
 * Deliberately a LINK census, not a text match: the index is free to
 * reword any entry, regroup it under a different heading, or reorder the
 * sections. It is not free to drop a document. The README itself is the
 * index, so it is the one file excluded from its own census.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DOCS = fileURLToPath(new URL('../../../../docs/', import.meta.url));

/** The index file, which cannot be expected to link to itself. */
const INDEX = 'README.md';

function indexedTargets(): ReadonlySet<string> {
  const markdown = readFileSync(`${DOCS}${INDEX}`, 'utf8');
  // Markdown inline links: [label](target). The capture stops at `#`, so
  // `[X](FOO.md#section)` still counts as coverage of FOO.md.
  const targets = new Set<string>();
  for (const match of markdown.matchAll(/\]\(([^)\s#]+)/g)) {
    const target = match[1];
    if (target !== undefined) targets.add(target);
  }
  return targets;
}

function topLevelDocs(): readonly string[] {
  return readdirSync(DOCS, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .filter((name) => name !== INDEX)
    .sort();
}

describe('docs/README.md index census', () => {
  it('finds documents to index (the census itself is not silently empty)', () => {
    expect(topLevelDocs().length).toBeGreaterThan(10);
  });

  it('links to every Markdown document at the top level of docs/', () => {
    const linked = indexedTargets();
    const missing = topLevelDocs().filter((name) => !linked.has(name));
    // Named, not counted: a failure should say WHICH doc fell out of the
    // index, so the fix is one line rather than a hunt.
    expect(missing).toEqual([]);
  });

  it('does not index documents that no longer exist', () => {
    const present = new Set(topLevelDocs());
    const dangling = [...indexedTargets()].filter(
      (target) =>
        target.endsWith('.md') && !target.includes('/') && target !== INDEX && !present.has(target),
    );
    expect(dangling).toEqual([]);
  });
});
