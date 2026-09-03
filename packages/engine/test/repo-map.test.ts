// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { buildRepoMapDigest, tallyRecentFocusDirs } from '../src/repo-map.js';

describe('buildRepoMapDigest', () => {
  it('renders top dirs, hot files, gate, and recent focus as a compact block', () => {
    const digest = buildRepoMapDigest({
      topDirs: [
        { dir: 'apps/dashboard', files: 412 },
        { dir: 'packages/engine', files: 89 },
      ],
      hotFiles: ['apps/dashboard/src/web/shell.ts', 'packages/engine/src/prompt.ts'],
      gateLabels: ['typecheck', 'test', 'build'],
      recentFocus: ['apps/dashboard/src', 'packages/engine/src'],
    });
    expect(digest).toBe(
      [
        '## REPO-MAP — auto-generated orientation digest',
        'Top dirs: apps/dashboard (412), packages/engine (89)',
        'Hot files: apps/dashboard/src/web/shell.ts, packages/engine/src/prompt.ts',
        'Gate: typecheck · test · build',
        'Recent focus: apps/dashboard/src, packages/engine/src',
      ].join('\n'),
    );
  });

  it('returns an empty string when there is nothing to show', () => {
    expect(buildRepoMapDigest({ topDirs: [], hotFiles: [], gateLabels: [], recentFocus: [] })).toBe(
      '',
    );
  });

  it('omits a section entirely when its data is empty, keeping the rest', () => {
    const digest = buildRepoMapDigest({
      topDirs: [],
      hotFiles: [],
      gateLabels: ['test'],
      recentFocus: [],
    });
    expect(digest).toContain('Gate: test');
    expect(digest).not.toContain('Top dirs:');
    expect(digest).not.toContain('Hot files:');
    expect(digest).not.toContain('Recent focus:');
  });

  it('bounds each section to its display limit rather than dumping everything', () => {
    const topDirs = Array.from({ length: 20 }, (_, i) => ({ dir: `dir${i}`, files: 20 - i }));
    const hotFiles = Array.from({ length: 20 }, (_, i) => `hotfile${i}.ts`);
    const recentFocus = Array.from({ length: 20 }, (_, i) => `focusarea${i}`);
    const digest = buildRepoMapDigest({
      topDirs,
      hotFiles,
      gateLabels: [],
      recentFocus,
    });
    expect(digest).toContain('dir0');
    expect(digest).not.toContain('dir6');
    expect(digest).toContain('hotfile0.ts');
    expect(digest).not.toContain('hotfile8.ts');
    expect(digest).toContain('focusarea0');
    expect(digest).not.toContain('focusarea5');
  });
});

describe('tallyRecentFocusDirs', () => {
  it('ranks top-level dirs by how often recent commits touched them', () => {
    const commits = [
      { files: ['apps/dashboard/src/a.ts', 'apps/dashboard/src/b.ts'] },
      { files: ['apps/dashboard/src/c.ts'] },
      { files: ['packages/engine/src/x.ts'] },
    ];
    expect(tallyRecentFocusDirs(commits)).toEqual(['apps', 'packages']);
  });

  it('breaks ties alphabetically for determinism', () => {
    const commits = [{ files: ['b/x.ts'] }, { files: ['a/y.ts'] }];
    expect(tallyRecentFocusDirs(commits)).toEqual(['a', 'b']);
  });

  it('ranks by total touch count even when it contradicts alphabetical order', () => {
    const commits = [
      { files: ['zebra/a.ts', 'zebra/b.ts', 'zebra/c.ts'] },
      { files: ['alpha/d.ts'] },
    ];
    expect(tallyRecentFocusDirs(commits)).toEqual(['zebra', 'alpha']);
  });

  it('treats a root-level file as its own "." bucket', () => {
    expect(tallyRecentFocusDirs([{ files: ['README.md'] }])).toEqual(['.']);
  });

  it('bounds to the given limit', () => {
    const commits = Array.from({ length: 10 }, (_, i) => ({ files: [`dir${i}/f.ts`] }));
    expect(tallyRecentFocusDirs(commits, 3)).toHaveLength(3);
  });

  it('returns an empty list for no commits', () => {
    expect(tallyRecentFocusDirs([])).toEqual([]);
  });
});
