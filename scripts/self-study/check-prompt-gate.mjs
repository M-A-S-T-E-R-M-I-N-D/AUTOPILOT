// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * self-study/check-prompt-gate — blocks a `Firing-Prompt-Version` bump on a
 * regression against the pinned eval suite (SOTA-MAP H3): pass rate, cost per
 * solved task, and median turns, compared against the prior version with the
 * most pinned-suite data. Exits non-zero when `evaluatePromptVersionGate`
 * (`packages/store/src/read.ts`) reports a failure — this is the enforcement
 * half `evalRegressionOverPinnedSuite` never had: that function could report
 * the four numbers together, but nothing previously turned a regression into
 * a blocking decision (`docs/MODEL-CARD.md` §6).
 *
 * Reads the SAME local, git-ignored telemetry store as `self-study:update`
 * and `self-study:pin` (`.autopilot/autopilot.db` — `FLIGHT-CONTAINMENT.md`
 * says it never leaves the flying machine), so this is a check the
 * agent/operator runs LOCALLY before bumping `FIRING_PROMPT_VERSION`
 * (`packages/engine/src/prompt.ts`) — not a CI check, since a fresh checkout
 * has no store to read.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  openStore,
  listProjects,
  evalRegressionOverPinnedSuite,
  evaluatePromptVersionGate,
} from '../../packages/store/dist/index.js';
import { FIRING_PROMPT_VERSION } from '../../packages/engine/dist/index.js';

const DB_ENV_VAR = 'AUTOPILOT_DB';
const SUITE_PATH = join(process.cwd(), 'docs', 'SELF-STUDY', 'eval-suite.json');

function resolveDbPath(env = process.env, cwd = process.cwd()) {
  const override = env[DB_ENV_VAR];
  return override && override.length > 0 ? override : join(cwd, '.autopilot', 'autopilot.db');
}

function formatEval(row) {
  const turns = row.medianTurns === null ? 'n/a' : row.medianTurns;
  const cost = row.costPerSolved === null ? 'n/a' : `$${row.costPerSolved.toFixed(2)}`;
  return `${row.firings} firing(s), pass rate ${(row.passRate * 100).toFixed(1)}%, median turns ${turns}, cost/solved ${cost}`;
}

function main() {
  if (!existsSync(SUITE_PATH)) {
    console.log(
      `check-prompt-gate: no pinned suite at ${SUITE_PATH} yet — nothing to gate against. Run \`pnpm self-study:pin\` first.`,
    );
    return;
  }
  const suite = JSON.parse(readFileSync(SUITE_PATH, 'utf8'));
  const firingIds = (suite.tasks ?? []).map((t) => t.firingId);
  if (firingIds.length === 0) {
    console.log('check-prompt-gate: pinned suite has no tasks — nothing to gate against.');
    return;
  }

  const dbPath = resolveDbPath();
  if (!existsSync(dbPath)) {
    console.log(
      `check-prompt-gate: no local telemetry store at ${dbPath} — nothing to gate against.`,
    );
    return;
  }

  const store = openStore(dbPath, { readonly: true });
  try {
    const projects = listProjects(store.db);
    if (projects.length === 0) {
      console.log('check-prompt-gate: no projects recorded yet — nothing to gate against.');
      return;
    }
    const project = projects[0];
    const rows = evalRegressionOverPinnedSuite(store.db, project.id, firingIds);

    const candidate = rows.find((r) => r.promptVersion === FIRING_PROMPT_VERSION);
    if (!candidate) {
      console.log(
        `check-prompt-gate: no pinned-suite firings recorded yet under the current version "${FIRING_PROMPT_VERSION}" — nothing to gate yet.`,
      );
      return;
    }

    const baseline =
      rows
        .filter((r) => r.promptVersion !== FIRING_PROMPT_VERSION)
        .sort((a, b) => b.firings - a.firings)[0] ?? null;

    const result = evaluatePromptVersionGate(candidate, baseline);

    console.log(
      `check-prompt-gate: candidate="${result.candidate}" baseline="${result.baseline ?? '(none)'}"`,
    );
    console.log(`  candidate: ${formatEval(candidate)}`);
    if (baseline) console.log(`  baseline:  ${formatEval(baseline)}`);
    for (const reason of result.reasons) console.log(`  - ${reason}`);

    if (!result.ok) {
      console.error(
        `check-prompt-gate: FAILED — "${result.candidate}" regressed against "${result.baseline}".`,
      );
      process.exitCode = 1;
      return;
    }
    console.log('check-prompt-gate: OK.');
  } finally {
    store.close();
  }
}

main();
