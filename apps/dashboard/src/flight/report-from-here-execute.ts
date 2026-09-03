// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Report-from-here's HTTP wiring (BOARD web-mss50ia8-nthtf3, "PLATFORM 5/7"
 * — the HTTP half; the pure decision core plus its own plan/apply wiring
 * shipped first, in `report-from-here.ts`). Binds {@link planReportFromHere}
 * and {@link runReportFromHereRitual} to the real store + real `gh`, the same
 * `createIssueTriagePreviewApi`/`createIssueTriageExecuteApi` shape
 * `issue-triage-execute.ts` established: a preview factory (pure, no store
 * needed — a capture arrives fully formed from the caller, unlike issue
 * triage's own fetch-then-plan) and an execute factory (opens the store
 * writable, runs the ritual, always closes). `server.ts`'s
 * `handleReportFromHere`/`handleReportFromHereExecute` are the CSRF-guarded
 * `POST /api/report-from-here` (preview) / `POST /api/report-from-here/execute`
 * pair this file's factories back. Deferred to later slices: the
 * screenshot/module-source capture wiring in the web shell and the operator
 * panel that calls these endpoints.
 */

import { openStore } from '@autopilot/store';
import { realCliExec, type CliExec } from '../connection/cli-probe.js';
import {
  planReportFromHere,
  runReportFromHereRitual,
  type ReportAction,
  type ReportFromHereResult,
  type ReportPlan,
  type ReportRegionCapture,
} from './report-from-here.js';

/** Pure — a capture arrives fully formed, so no store lookup is needed to
 *  preview it. Kept as an injectable factory (rather than exporting
 *  `planReportFromHere` directly) so `main.ts`'s wiring reads the same as
 *  every other `create*Api` the server injects. */
export type ReportFromHerePreviewApi = (
  capture: ReportRegionCapture,
  action: ReportAction,
  projectId: string,
) => ReportPlan;

/** Build the report-from-here preview API — the production wiring `main.ts`
 *  injects into the server. Stamps `Date.now()` as the plan's `createdAt`,
 *  the one piece of real-world state the pure core cannot supply itself. */
export function createReportFromHerePreviewApi(): ReportFromHerePreviewApi {
  return (capture, action, projectId) => planReportFromHere(capture, action, projectId, Date.now());
}

export type ReportFromHereExecuteApi = (
  capture: ReportRegionCapture,
  action: ReportAction,
  projectId: string,
) => Promise<ReportFromHereResult>;

/** Build the report-from-here execute API against the real store + real
 *  `gh` — the production wiring `main.ts` injects into the server. An
 *  unknown `projectId` on a local/quick-fix-pr action is not special-cased
 *  here: `applyReportTask` (via `createTask`'s FK check) already resolves it
 *  to `taskCreated: false` instead of throwing. */
export function createReportFromHereExecuteApi(
  dbPath: string,
  exec: CliExec = realCliExec,
): ReportFromHereExecuteApi {
  return async (capture, action, projectId) => {
    const store = openStore(dbPath);
    try {
      return await runReportFromHereRitual(exec, store, capture, action, projectId, Date.now());
    } finally {
      store.close();
    }
  };
}
