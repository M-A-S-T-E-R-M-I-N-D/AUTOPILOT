// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * self-study/pin-eval-suite — freezes a fixed, pre-registered eval suite into
 * `docs/SELF-STUDY/eval-suite.json` (SOTA-MAP: "20-50 real tasks from your own
 * repository with known-good outcomes"). Draws only from firings the harness
 * independently verified shipped — gate passed, SHA confirmed, HEAD advanced
 * (`verifiedKnownGoodFirings`, `packages/store/src/read.ts`) — not self-report.
 *
 * Deliberately a ONE-TIME action, not part of the regular `self-study:update`
 * refresh: once pinned, `docs/SELF-STUDY/eval-suite.json` is a committed,
 * immutable reference set. Re-running it would silently swap the benchmark out
 * from under any comparison already made against it, so this refuses to
 * overwrite an existing file unless `--force` is passed explicitly.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  openStore,
  listProjects,
  verifiedKnownGoodFirings,
} from '../../packages/store/dist/index.js';

const DB_ENV_VAR = 'AUTOPILOT_DB';
const SUITE_PATH = join(process.cwd(), 'docs', 'SELF-STUDY', 'eval-suite.json');
const SUITE_SIZE = 50;

function resolveDbPath(env = process.env, cwd = process.cwd()) {
  const override = env[DB_ENV_VAR];
  return override && override.length > 0 ? override : join(cwd, '.autopilot', 'autopilot.db');
}

function main() {
  const force = process.argv.includes('--force');
  if (existsSync(SUITE_PATH) && !force) {
    const existing = JSON.parse(readFileSync(SUITE_PATH, 'utf8'));
    console.log(
      `pin-eval-suite: ${SUITE_PATH} already exists (${existing.tasks?.length ?? 0} pinned` +
        ` ${existing.pinnedAt}) — refusing to overwrite a pre-registered suite. Pass --force to re-pin.`,
    );
    return;
  }

  const dbPath = resolveDbPath();
  const store = openStore(dbPath, { readonly: true });
  try {
    const projects = listProjects(store.db);
    if (projects.length === 0) {
      console.log('pin-eval-suite: no projects recorded yet — nothing to pin.');
      return;
    }
    const project = projects[0];
    const tasks = verifiedKnownGoodFirings(store.db, project.id, SUITE_SIZE);
    if (tasks.length === 0) {
      console.log('pin-eval-suite: no verified-good firings yet — nothing to pin.');
      return;
    }

    const suite = {
      pinnedAt: new Date().toISOString(),
      projectSlug: project.slug,
      criteria: "gate_result = 'passed' AND sha_verified = 1 AND head_advanced = 1, newest-first",
      tasks,
    };
    writeFileSync(SUITE_PATH, `${JSON.stringify(suite, null, 2)}\n`);
    console.log(`pin-eval-suite: pinned ${tasks.length} known-good firing(s) to ${SUITE_PATH}.`);
  } finally {
    store.close();
  }
}

main();
