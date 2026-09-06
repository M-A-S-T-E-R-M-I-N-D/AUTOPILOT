// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// AUTO-GENERATED — do not hand-edit. Regenerate with:
//   node scripts/codemod/generate-splice-manifest.mjs --emit-index <features-dir>
import { activityHeatmapJs } from './activity-heatmap.js';
import { activityJs } from './activity.js';
import { backlogJs } from './backlog.js';
import { connectJs } from './connect.js';
import { coordinationJs } from './coordination.js';
import { docsViewerJs } from './docs-viewer.js';
import { evolutionJs } from './evolution.js';
import { firingTimelineJs } from './firing-timeline.js';
import { flightConsoleJs } from './flight-console.js';
import { flightSummaryJs } from './flight-summary.js';
import { flyJs } from './fly.js';
import { issueTriageJs } from './issue-triage.js';
import { landingJs } from './landing.js';
import { localeDataJs } from './locale-data.js';
import { localeJs } from './locale.js';
import { metricsJs } from './metrics.js';
import { notificationsJs } from './notifications.js';
import { officeMapJs } from './office-map.js';
import { pipelineJs } from './pipeline.js';
import { poolClientJs } from './pool-client.js';
import { prReviewJs } from './pr-review.js';
import { processHealthJs } from './process-health.js';
import { publicityJs } from './publicity.js';
import { releaseJs } from './release.js';
import { reportCaptureClientJs } from './report-capture-client.js';
import { reportMenuJs } from './report-menu.js';
import { roundPanelJs } from './round-panel.js';
import { searchJs } from './search.js';
import { switcherJs } from './switcher.js';
import { tourJs } from './tour.js';
import { updateJs } from './update.js';

/** Every discovered feature module's assembler function, in directory order. */
export const FEATURE_MODULE_FUNCTIONS: Array<() => string> = [
  activityHeatmapJs,
  activityJs,
  backlogJs,
  connectJs,
  coordinationJs,
  docsViewerJs,
  evolutionJs,
  firingTimelineJs,
  flightConsoleJs,
  flightSummaryJs,
  flyJs,
  issueTriageJs,
  landingJs,
  localeDataJs,
  localeJs,
  metricsJs,
  notificationsJs,
  officeMapJs,
  pipelineJs,
  poolClientJs,
  prReviewJs,
  processHealthJs,
  publicityJs,
  releaseJs,
  reportCaptureClientJs,
  reportMenuJs,
  roundPanelJs,
  searchJs,
  switcherJs,
  tourJs,
  updateJs,
];

/** Every discovered feature module's assembled output, joined in directory order. */
export function featureModulesJs(): string {
  return FEATURE_MODULE_FUNCTIONS.map((fn) => fn()).join('\n');
}

/** Every discovered feature module's assembler function, keyed by its file
 *  basename (no extension) — chunks.ts's FEATURE_JS_BY_NAME derives from
 *  this instead of a hand-written registration per module. */
export const FEATURE_MODULE_FUNCTIONS_BY_BASENAME: Readonly<Record<string, () => string>> = {
  'activity-heatmap': activityHeatmapJs,
  activity: activityJs,
  backlog: backlogJs,
  connect: connectJs,
  coordination: coordinationJs,
  'docs-viewer': docsViewerJs,
  evolution: evolutionJs,
  'firing-timeline': firingTimelineJs,
  'flight-console': flightConsoleJs,
  'flight-summary': flightSummaryJs,
  fly: flyJs,
  'issue-triage': issueTriageJs,
  landing: landingJs,
  'locale-data': localeDataJs,
  locale: localeJs,
  metrics: metricsJs,
  notifications: notificationsJs,
  'office-map': officeMapJs,
  pipeline: pipelineJs,
  'pool-client': poolClientJs,
  'pr-review': prReviewJs,
  'process-health': processHealthJs,
  publicity: publicityJs,
  release: releaseJs,
  'report-capture-client': reportCaptureClientJs,
  'report-menu': reportMenuJs,
  'round-panel': roundPanelJs,
  search: searchJs,
  switcher: switcherJs,
  tour: tourJs,
  update: updateJs,
};
