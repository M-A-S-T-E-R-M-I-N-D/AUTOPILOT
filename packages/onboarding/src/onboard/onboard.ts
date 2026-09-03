// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { basename } from 'node:path';
import { lockRepo } from '../backup/ritual.js';
import { detectGate } from '../gate/detect.js';
import { refreshProjectIndex } from '../index/indexer.js';
import { generateStarterSoul, slugify } from './soul.js';
import { detectBacklogPath, parseSoulBacklogPath } from './backlog.js';
import { triageFolder } from './folder-triage.js';
import type { OnboardDeps, OnboardInput, OnboardResult, BoardTask } from './types.js';

function starterBoard(name: string): BoardTask[] {
  return [
    {
      title: `Orient — first pass over ${name}`,
      body: 'Read the index + detected gate; pick the highest-value verifiable work.',
      source: 'self',
    },
  ];
}

/**
 * The onboarding ritual (docs/M2-ONBOARDING-PLAN.md). Runs the load-bearing order:
 *   1. BACK UP FIRST (MYTH/LEGACY/flight) — nothing below ever writes to the repo;
 *   2. detect the gate (read-only);
 *   3. register the project (or resume a seen one — same root ⇒ never re-register);
 *   4. build/refresh the content-hash index.
 * Detection + indexing are read-only, so by the time they run the MYTH/LEGACY
 * snapshot already exists — the DoD invariant holds by construction.
 */
export async function onboard(deps: OnboardDeps, input: OnboardInput): Promise<OnboardResult> {
  const lock = await lockRepo(deps.vcs);

  const snapshot = deps.readSnapshot(input.root);
  const gate = detectGate(snapshot);
  const triage = triageFolder(snapshot);
  const detectedBacklogPath = detectBacklogPath(snapshot);

  const existing = deps.projects.findByRoot(input.root);
  let projectId: string;
  let resumed: boolean;
  let backlogPath: string | null;
  if (existing) {
    projectId = existing.id;
    resumed = true;
    // An operator can hand-edit a resumed project's SOUL to declare a `Backlog:
    // <path>` line for a file the filename heuristic can't find — that always
    // wins over re-detection (see parseSoulBacklogPath).
    backlogPath = parseSoulBacklogPath(existing.soul ?? '') ?? detectedBacklogPath;
  } else {
    projectId = deps.newId();
    const name = input.name ?? basename(input.root);
    const slug = input.slug ?? slugify(name);
    backlogPath = detectedBacklogPath;
    deps.projects.register({
      id: projectId,
      slug,
      name,
      rootPath: input.root,
      soul: generateStarterSoul(name, gate, triage, snapshot),
      gateConfig: JSON.stringify(gate.spec),
      backlogPath,
    });
    deps.projects.seedBoard(projectId, starterBoard(name));
    resumed = false;
  }

  // Mirror the just-created (or pre-existing) backup refs into the versions
  // projection. Idempotent, so it also backfills a project locked before this.
  deps.projects.recordBackup(projectId, {
    myth: lock.myth,
    legacy: lock.legacy,
    flight: lock.flight,
  });

  const indexDiff = await refreshProjectIndex(
    deps.fileSource,
    deps.indexStore,
    projectId,
    deps.contentIndex,
  );

  return { projectId, resumed, lock, gate, indexDiff, backlogPath, triage };
}
