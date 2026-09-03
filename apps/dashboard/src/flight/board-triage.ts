// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The self-sorting brain (founder directive: "the pilot knows what to focus on
 * at every moment, on every run"): factor-fed board triage, run by `fly.ts` at
 * TAKEOFF — so the flight starts on the right work — and again post-flight, so
 * the next run inherits a fresh sort. Judgment (leverage, unblocking,
 * diminishing returns) comes from the cheap model over measured per-task
 * evidence; the runaway guard stays in CODE (flight/triage-factors.ts) and
 * demotes regardless of model opinion. Split out of `fly.ts` (SHELL DECOMP) —
 * pure move, no behavior change.
 */

import { recentTasks, reorderTasks, type Store } from '@autopilot/store';
import {
  DEFAULT_ENGINE_CONFIG,
  ClaudeCliModel,
  OllamaModel,
  tierForSubstepKind,
  modelForTier,
  type AuthConfig,
  type CliDescendantRegistry,
  type EngineConfig,
  type ModelPort,
} from '@autopilot/engine';
import {
  buildTriagePrompt,
  parseTriageOrder,
  resolveMechanicalModel,
  resolveOllamaBaseUrl,
  resolveTriageInvokeModel,
  computeTriageFactors,
} from './triage.js';
import {
  taskEconomicsFromRows,
  isRunaway,
  factorSuffix,
  applyOperatorPins,
} from './triage-factors.js';
import { out } from './firing-hooks.js';

/** Everything `runBoardTriage` needs from the flight that invokes it. */
export interface BoardTriageDeps {
  store: Store;
  projectId: string;
  /** The flown folder — the cheap triage model call runs against it. */
  target: string;
  config: EngineConfig;
  auth: AuthConfig;
  pidRegistry: CliDescendantRegistry;
  now: () => number;
}

/**
 * One factor-fed board triage pass: rank the unpinned open queue with a cheap
 * tool-less model call and apply the result via the SAME `reorderTasks` the
 * operator's ↑/↓ use (so the operator can always override). Operator-pinned
 * tasks are never re-ranked; runaway tasks are demoted in code regardless of
 * model opinion. Callers wrap this in try/catch — a model hiccup must never
 * fail the flight itself.
 */
export async function runBoardTriage(deps: BoardTriageDeps, context: string): Promise<void> {
  const { store, projectId, target, config, auth, pidRegistry, now } = deps;
  const open = recentTasks(store.db, projectId).filter((t) => t.status === 'queued');
  // TRIAGE vs OPERATOR (web-mt1bwkrf-v5pnx2): a task the operator
  // explicitly reordered (priority_pinned, set only by the operator's own
  // `/api/task/reorder` — see `read/source.ts`'s `reorderTasksInStore`)
  // is never handed to the model for re-ranking; only the unpinned
  // remainder is triaged below. `pinnedIdsInOrder` preserves `open`'s
  // existing relative order, which already reflects each pinned task's
  // own `priority` value.
  const pinnedIdsInOrder = open.filter((t) => t.priority_pinned === 1).map((t) => t.id);
  const unpinned = open.filter((t) => t.priority_pinned !== 1);
  if (unpinned.length < 2) return;
  const econRows = store.db
    .prepare(
      'SELECT item, cost_usd AS costUsd, completion FROM metrics WHERE project_id = ? ORDER BY created_at',
    )
    .all(projectId) as { item: string | null; costUsd: number; completion: string | null }[];
  const economics = taskEconomicsFromRows(econRows);
  const nowMs = now();
  const queue = unpinned.map((t) => ({
    id: t.id,
    title: t.title,
    evidence: factorSuffix(economics.get(t.id), (nowMs - t.created_at) / 86_400_000, t.severity),
  }));
  const runaways = new Set(
    open
      .filter((t) => {
        const e = economics.get(t.id);
        return e ? isRunaway(e) : false;
      })
      .map((t) => t.id),
  );
  // TRIAGE V2 (web-mssnofje-bboigi): persist the objective, model-free
  // factor scores behind this run BEFORE the model call, so the "why" is
  // on record (and the board staleness chip has data) even if the call
  // below fails or returns junk.
  store.db
    .prepare(
      'INSERT INTO events (project_id, firing_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      projectId,
      null,
      'triage-factors',
      JSON.stringify(
        computeTriageFactors(
          open.map((t) => {
            const e = economics.get(t.id);
            return {
              id: t.id,
              createdAt: t.created_at,
              ...(e ? { cumulativeCostUsd: e.spendUsd, firingCount: e.firings } : {}),
              isRunaway: runaways.has(t.id),
            };
          }),
          nowMs,
        ),
      ),
      nowMs,
    );
  const mechanicalModel = resolveMechanicalModel(process.env);
  // Local offload (ENGINE-RESEARCH I1/I2): when the operator points
  // AUTOPILOT_MECHANICAL_MODEL at the model the routing tier table
  // resolves 'triage' to, this tool-less single-turn substep runs free
  // on the local Ollama server instead of spending cloud quota — never
  // the primary work-unit call, which needs full agentic tool use (see
  // ollama.ts's docstring). Routed through tierForSubstepKind/
  // modelForTier rather than a raw comparison against
  // config.routing.localModel, so TRIAGE actually consults the tier
  // table (ENGINE-RESEARCH I2) instead of duplicating its answer.
  const ollamaBaseUrl = resolveOllamaBaseUrl(process.env);
  const localTierModel = modelForTier(tierForSubstepKind('triage'), config.routing);
  const triageModel: ModelPort =
    mechanicalModel === localTierModel
      ? new OllamaModel(ollamaBaseUrl !== undefined ? { baseUrl: ollamaBaseUrl } : {})
      : new ClaudeCliModel({
          repo: target,
          config: {
            ...DEFAULT_ENGINE_CONFIG,
            primaryModel: mechanicalModel,
            fallbackModel: 'sonnet',
            maxTurns: 2,
            maxBudgetUsd: 0.5,
            allowedTools: [],
            disallowedTools: ['*'],
          },
          auth,
          pidRegistry,
        });
  // Local offload's routing DECISION (above) compares mechanicalModel
  // against the tier table's sentinel, but that sentinel is never a real
  // Ollama-pullable model tag — resolveTriageInvokeModel swaps it for the
  // operator's configured real local tag (AUTOPILOT_OLLAMA_MODEL) on the
  // local branch only; the cloud branch is unaffected.
  const triageInvokeModel = resolveTriageInvokeModel(mechanicalModel, localTierModel, process.env);
  const triageResp = await triageModel.invoke(triageInvokeModel, buildTriagePrompt(queue, context));
  const triageText = triageResp.envelope?.isError === false ? triageResp.envelope.result : '';
  const order = parseTriageOrder(
    triageText ?? '',
    queue.map((t) => t.id),
  );
  if (!order) {
    out('  ⇅ board triage skipped (no usable ranking returned)');
    return;
  }
  const finalOrder = applyOperatorPins(pinnedIdsInOrder, order, runaways);
  reorderTasks(store, projectId, finalOrder, now());
  const pinnedSet = new Set(pinnedIdsInOrder);
  for (const id of runaways) {
    // A pinned runaway was NOT demoted (applyOperatorPins exempts it) —
    // logging "demoted" for it would be a lie.
    if (pinnedSet.has(id)) continue;
    const e = economics.get(id);
    out(
      `  ⚠ runaway task demoted for operator review: ${id} ` +
        `($${e ? e.spendUsd.toFixed(0) : '?'} across ${e ? e.firings : '?'} firings, all slices)`,
    );
  }
  out(`  ⇅ board triaged (${context}): ${finalOrder.join(' → ')}`);
}
