// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { slugify, generateStarterSoul, STARTER_SOUL_LINE_BUDGET } from '../../src/onboard/soul.js';
import { detectGate } from '../../src/gate/detect.js';
import { makeFsSnapshot } from '../../src/gate/snapshot.js';
import { triageFolder } from '../../src/onboard/folder-triage.js';

describe('slugify', () => {
  it('produces url/id-safe slugs and never empties', () => {
    expect(slugify('My Cool Repo')).toBe('my-cool-repo');
    expect(slugify('  weird__Name!! ')).toBe('weird-name');
    expect(slugify('!!!')).toBe('project');
  });
});

describe('generateStarterSoul', () => {
  it('renders the exact starter SOUL for the name, stack, and detected gate', () => {
    const gate = detectGate(
      makeFsSnapshot({
        files: ['go.mod', 'main.go'],
        contents: {},
      }),
    );
    const soul = generateStarterSoul('svc', gate);
    expect(soul).toBe(
      [
        '# SOUL — svc',
        '',
        'Stack: go',
        '',
        '## Gate',
        '- typecheck: —',
        '- test: go test ./...',
        '- build: go build ./...',
        '- lint: go vet ./...',
        '',
        '## Operating rules (editable — locked by default)',
        '- Gate every change: typecheck + test + build pass, or revert cleanly.',
        '- Additive git only: never force-push / reset --hard / touch main.',
        '- Verify machine-checkable work autonomously; propose 🟣 human-required items.',
        '',
        '## Knowledge doctrine (editable — locked by default)',
        '- Research first: consult official docs and trusted sources before implementing.',
        '- Prefer battle-tested, actively-maintained open-source packages over hand-rolled',
        '  code — vet maintenance and adoption before pulling one in.',
        '',
        '## UX-expression doctrine (editable — locked by default)',
        '- A capability without a user-facing, accessible expression (a real UI element or a Docs',
        '  entry, keyboard-operable, correct ARIA, axe-clean) is NOT complete — it is a slice.',
        '',
        '## Delegation doctrine (editable — locked by default)',
        '- On 2-4 FILE-DISJOINT subtasks, delegate each to its own subagent (briefed like a new',
        '  collaborator); keep hub files, consolidation, and the single commit with the lead.',
        '',
      ].join('\n'),
    );
  });

  it('flags a multi-stack repo as needing confirmation', () => {
    const gate = detectGate(
      makeFsSnapshot({
        files: ['go.mod', 'package.json', 'pnpm-lock.yaml'],
        contents: { 'package.json': JSON.stringify({ scripts: { test: 'vitest' } }) },
      }),
    );
    expect(generateStarterSoul('poly', gate)).toContain('multi-stack');
  });

  it('stays within the interim minimal-starter line budget (B5 curation guard)', () => {
    const gate = detectGate(
      makeFsSnapshot({
        files: ['go.mod', 'main.go'],
        contents: {},
      }),
    );
    const lines = generateStarterSoul('svc', gate).split('\n');
    expect(lines.length).toBeLessThanOrEqual(STARTER_SOUL_LINE_BUDGET);
  });

  it('renders a TRIAGE-mode SOUL with an inventory when the folder triage is non-code', () => {
    const snapshot = makeFsSnapshot({ files: ['a.png', 'b.jpg', 'c.mp4'], contents: {} });
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    const soul = generateStarterSoul('photos', gate, triage);
    expect(soul).toBe(
      [
        '# SOUL — photos',
        '',
        'Kind: media folder (3 files, no code gate)',
        '',
        '## Inventory',
        '- media: 3',
        '',
        '## Operating rules (editable — locked by default)',
        '- TRIAGE mode: classify contents, do not run build/test/lint — there is no code gate.',
        '- Propose organization changes for review; never move or delete files unasked.',
        '',
      ].join('\n'),
    );
  });

  it('renders the empty-folder inventory placeholder', () => {
    const snapshot = makeFsSnapshot({ files: [], contents: {} });
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    const soul = generateStarterSoul('blank', gate, triage);
    expect(soul).toContain('Kind: empty folder (0 files, no code gate)');
    expect(soul).toContain('- (empty)');
  });

  it('still renders the code-gate SOUL when triage names the folder "code"', () => {
    const snapshot = makeFsSnapshot({ files: ['go.mod', 'main.go'], contents: {} });
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    expect(generateStarterSoul('svc', gate, triage)).toContain('## Gate');
  });

  it('adds a Suggested organization section when a folder has sizeable non-dominant categories', () => {
    const snapshot = makeFsSnapshot({
      files: ['a.md', 'b.md', 'c.png', 'd.jpg', 'e.json', 'f.csv'],
      contents: {},
    });
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    expect(triage.kind).toBe('mixed');

    const soul = generateStarterSoul('stuff', gate, triage);
    expect(soul).toContain('## Suggested organization (proposal only — review before acting)');
    expect(soul).toContain('- Group 2 docs files into a docs/ folder.');
    expect(soul).toContain('- Group 2 media files into a media/ folder.');
    expect(soul).toContain('- Group 2 data files into a data/ folder.');
  });

  it('omits the Suggested organization section when there is nothing to propose', () => {
    const snapshot = makeFsSnapshot({ files: ['a.png', 'b.jpg', 'c.mp4'], contents: {} });
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    expect(generateStarterSoul('photos', gate, triage)).not.toContain('Suggested organization');
  });

  it('adds a Detected issues section when a snapshot surfaces likely duplicates', () => {
    const snapshot = makeFsSnapshot({
      files: ['report.txt', 'report (1).txt', 'notes.md'],
      contents: {},
    });
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    const soul = generateStarterSoul('stuff', gate, triage, snapshot);
    expect(soul).toContain('## Detected issues (proposal only — review before acting)');
    expect(soul).toContain(
      '- 1 likely-duplicate file(s) found (e.g. "report (1).txt") — review before deleting.',
    );
    expect(soul).toContain(
      '  Suggested fix: Move the likely-duplicate file(s) into a _duplicates/ folder for review — do not delete anything unasked.',
    );
  });

  it('omits the Detected issues section when no snapshot is passed', () => {
    const snapshot = makeFsSnapshot({
      files: ['report.txt', 'report (1).txt'],
      contents: {},
    });
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    expect(generateStarterSoul('stuff', gate, triage)).not.toContain('Detected issues');
  });

  it('omits the Detected issues section when nothing is flagged', () => {
    const snapshot = makeFsSnapshot({ files: ['a.png', 'b.jpg', 'c.mp4'], contents: {} });
    const gate = detectGate(snapshot);
    const triage = triageFolder(snapshot);
    expect(generateStarterSoul('photos', gate, triage, snapshot)).not.toContain('Detected issues');
  });
});
