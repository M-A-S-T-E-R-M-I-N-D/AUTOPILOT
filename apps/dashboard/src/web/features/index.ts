// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// AUTO-GENERATED — do not hand-edit. Regenerate with:
//   node scripts/codemod/generate-splice-manifest.mjs --emit-index <features-dir>
import { activityHeatmapJs } from './activity-heatmap.js';
import { activityJs } from './activity.js';
import { askSheetJs } from './ask-sheet.js';
import { backlogJs } from './backlog.js';
import { busyJs } from './busy.js';
import { ciStatusJs } from './ci-status.js';
import { connectJs } from './connect.js';
import { contributorIssueListJs } from './contributor-issue-list.js';
import { contributorStandingJs } from './contributor-standing.js';
import { coordinationJs } from './coordination.js';
import { discussionsTriageJs } from './discussions-triage.js';
import { docsViewerJs } from './docs-viewer.js';
import { evolutionJs } from './evolution.js';
import { firingTimelineJs } from './firing-timeline.js';
import { flightConsoleJs } from './flight-console.js';
import { flightSummaryJs } from './flight-summary.js';
import { flyJs } from './fly.js';
import { foundationJs } from './foundation.js';
import { issueTriageJs } from './issue-triage.js';
import { landingJs } from './landing.js';
import { localeDataJs } from './locale-data.js';
import { localeJs } from './locale.js';
import { metricsJs } from './metrics.js';
import { mirrorPassJs } from './mirror-pass.js';
import { notificationsJs } from './notifications.js';
import { officeMapJs } from './office-map.js';
import { pipelineJs } from './pipeline.js';
import { poolClientJs } from './pool-client.js';
import { popoversJs } from './popovers.js';
import { prReviewJs } from './pr-review.js';
import { prefsJs } from './prefs.js';
import { processHealthJs } from './process-health.js';
import { publicityJs } from './publicity.js';
import { releaseJs } from './release.js';
import { reportCaptureClientJs } from './report-capture-client.js';
import { reportMenuJs } from './report-menu.js';
import { roundPanelJs } from './round-panel.js';
import { searchJs } from './search.js';
import { snackbarJs } from './snackbar.js';
import { subjectNavJs } from './subject-nav.js';
import { switcherJs } from './switcher.js';
import { tourJs } from './tour.js';
import { updateJs } from './update.js';

/** Every discovered feature module's assembler function, in directory order. */
export const FEATURE_MODULE_FUNCTIONS: Array<() => string> = [
  activityHeatmapJs,
  activityJs,
  askSheetJs,
  backlogJs,
  busyJs,
  ciStatusJs,
  connectJs,
  contributorIssueListJs,
  contributorStandingJs,
  coordinationJs,
  discussionsTriageJs,
  docsViewerJs,
  evolutionJs,
  firingTimelineJs,
  flightConsoleJs,
  flightSummaryJs,
  flyJs,
  foundationJs,
  issueTriageJs,
  landingJs,
  localeDataJs,
  localeJs,
  metricsJs,
  mirrorPassJs,
  notificationsJs,
  officeMapJs,
  pipelineJs,
  poolClientJs,
  popoversJs,
  prReviewJs,
  prefsJs,
  processHealthJs,
  publicityJs,
  releaseJs,
  reportCaptureClientJs,
  reportMenuJs,
  roundPanelJs,
  searchJs,
  snackbarJs,
  subjectNavJs,
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
  'ask-sheet': askSheetJs,
  backlog: backlogJs,
  busy: busyJs,
  'ci-status': ciStatusJs,
  connect: connectJs,
  'contributor-issue-list': contributorIssueListJs,
  'contributor-standing': contributorStandingJs,
  coordination: coordinationJs,
  'discussions-triage': discussionsTriageJs,
  'docs-viewer': docsViewerJs,
  evolution: evolutionJs,
  'firing-timeline': firingTimelineJs,
  'flight-console': flightConsoleJs,
  'flight-summary': flightSummaryJs,
  fly: flyJs,
  foundation: foundationJs,
  'issue-triage': issueTriageJs,
  landing: landingJs,
  'locale-data': localeDataJs,
  locale: localeJs,
  metrics: metricsJs,
  'mirror-pass': mirrorPassJs,
  notifications: notificationsJs,
  'office-map': officeMapJs,
  pipeline: pipelineJs,
  'pool-client': poolClientJs,
  popovers: popoversJs,
  'pr-review': prReviewJs,
  prefs: prefsJs,
  'process-health': processHealthJs,
  publicity: publicityJs,
  release: releaseJs,
  'report-capture-client': reportCaptureClientJs,
  'report-menu': reportMenuJs,
  'round-panel': roundPanelJs,
  search: searchJs,
  snackbar: snackbarJs,
  'subject-nav': subjectNavJs,
  switcher: switcherJs,
  tour: tourJs,
  update: updateJs,
};
