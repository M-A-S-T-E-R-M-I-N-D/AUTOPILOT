// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { GateDetection, GateCommand } from '../gate/types.js';
import type { FsSnapshot } from '../gate/snapshot.js';
import type { FolderTriage, FolderInventoryEntry } from './folder-triage.js';
import { proposeOrganization } from './organize.js';
import { detectIssues } from './detect-issues.js';

/** URL/id-safe slug from a display name. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug === '' ? 'project' : slug;
}

function gateLine(kind: string, command: GateCommand | undefined): string {
  return `- ${kind}: ${command ? command.label : '—'}`;
}

/**
 * Interim curation guard against unreviewed starter-SOUL bloat (B5;
 * RESEARCH-LIBRARY "Starter SOUL is LLM-generated": generated context files
 * measurably hurt). The real fix is M5's human-ratified SOUL editor; until
 * that lands, `soul.test.ts` pins `generateStarterSoul`'s output to this line
 * budget so a new doctrine section can't be baked in silently — exceeding it
 * forces a deliberate bump here rather than an unreviewed drift.
 */
export const STARTER_SOUL_LINE_BUDGET = 30;

function inventoryLine(entry: FolderInventoryEntry): string {
  return `- ${entry.category}: ${entry.count}`;
}

/**
 * The "## Suggested organization" section — omitted entirely when
 * {@link proposeOrganization} has nothing to suggest, so a folder that is
 * already just one category (or too small to bother with) gets no empty
 * section.
 */
function organizationSection(triage: FolderTriage): string[] {
  const proposals = proposeOrganization(triage);
  if (proposals.length === 0) return [];
  return [
    '## Suggested organization (proposal only — review before acting)',
    ...proposals.map((p) => `- ${p.suggestion}`),
    '',
  ];
}

/**
 * The "## Detected issues" section — omitted when {@link detectIssues} has
 * nothing to report, or when no snapshot was supplied (older callers that
 * only pass name/triage keep working with no issues section).
 */
function issuesSection(snapshot: FsSnapshot | undefined): string[] {
  const issues = snapshot ? detectIssues(snapshot) : [];
  if (issues.length === 0) return [];
  return [
    '## Detected issues (proposal only — review before acting)',
    ...issues.flatMap((i) => [`- ${i.description}`, `  Suggested fix: ${i.suggestion}`]),
    '',
  ];
}

/**
 * Starter SOUL for a non-code folder (board web-msnioxgz-emkgca, "Generic-folder
 * competence"): no build/test/lint gate applies, so instead of the code-repo
 * doctrine sections this seeds the classification + inventory TRIAGE already
 * found, plus any grouping {@link proposeOrganization} suggests, any
 * likely-duplicate files {@link detectIssues} finds (each with its suggested
 * fix), and an operating rule against unasked file moves. Physically applying
 * a fix stays outside this pure core by design — see {@link detectIssues}.
 */
function generateFolderSoul(name: string, triage: FolderTriage, snapshot?: FsSnapshot): string {
  const inventoryLines =
    triage.inventory.length > 0 ? triage.inventory.map(inventoryLine) : ['- (empty)'];
  return [
    `# SOUL — ${name}`,
    '',
    `Kind: ${triage.kind} folder (${triage.totalFiles} files, no code gate)`,
    '',
    '## Inventory',
    ...inventoryLines,
    '',
    ...organizationSection(triage),
    ...issuesSection(snapshot),
    '## Operating rules (editable — locked by default)',
    '- TRIAGE mode: classify contents, do not run build/test/lint — there is no code gate.',
    '- Propose organization changes for review; never move or delete files unasked.',
    '',
  ].join('\n');
}

/**
 * Generate a starter SOUL — the project's persona/rules doc, editable later,
 * locked by default (MASTER-PLAN §3). M2 seeds the stack, the detected gate, and
 * the operating rules; conventions are learned as the engine flies. When `triage`
 * names a non-code folder, seeds the TRIAGE-mode variant instead (see
 * {@link generateFolderSoul}). `snapshot` is optional and only used to seed
 * that variant's "Detected issues" section.
 */
export function generateStarterSoul(
  name: string,
  gate: GateDetection,
  triage?: FolderTriage,
  snapshot?: FsSnapshot,
): string {
  if (triage && triage.kind !== 'code') return generateFolderSoul(name, triage, snapshot);
  const spec = gate.spec;
  const stack =
    gate.ambiguity === 'multi' ? `${spec.ecosystem} (multi-stack — confirm)` : spec.ecosystem;
  return [
    `# SOUL — ${name}`,
    '',
    `Stack: ${stack}`,
    '',
    '## Gate',
    gateLine('typecheck', spec.typecheck),
    gateLine('test', spec.test),
    gateLine('build', spec.build),
    gateLine('lint', spec.lint),
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
  ].join('\n');
}
