// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-folder flight-list filtering + diff-signature math for the fly
 * bar's per-flight rows (epic slice 4/6's multi-flight registry) — client-
 * only (no server counterpart, unlike `shared/*.ts`), so it lives in `web/`
 * rather than `shared/` (epic 0002 "shell decomposition", slice 2: feature-
 * module split of `shell.ts`), following the same diff-signature pattern
 * `card-sections.ts`/`detail-sections.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `flyJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The fields {@link activeFlights}/{@link flightsSig} read off each entry
 *  in the fly bar's `s.flights` list (`FlightRunnerRegistry.statusAll()`). */
export interface FlightsListItem {
  readonly folder: string;
  readonly running?: boolean;
  readonly paused?: boolean;
  readonly queued?: boolean;
}

/** Every folder the registry has something live to report — running,
 *  paused, or queued — dropped otherwise (a folder that never flew or has
 *  already fully stopped has nothing to render a row for). */
export function activeFlights(
  list: readonly FlightsListItem[] | null | undefined,
): FlightsListItem[] {
  const active: FlightsListItem[] = [];
  for (const f of list || []) {
    if (f && (f.running || f.paused || f.queued)) active.push(f);
  }
  return active;
}

/** A diff signature for the active-flights list — changes only when a
 *  folder enters/leaves the active set or crosses a running/paused/queued
 *  state boundary, so a re-render mid-poll that changes nothing else never
 *  tears out a Stop/Pause button an operator's cursor is over. */
export function flightsSig(active: readonly FlightsListItem[]): string {
  return active
    .map((f) => f.folder + String.fromCharCode(1) + (f.running ? 'r' : f.queued ? 'q' : 'p'))
    .join(String.fromCharCode(2));
}

/** What the fly bar's launch controls need to know about the TYPED folder
 *  (never globally locked by some other folder's flight) plus the full set
 *  of currently-running flights (used to decide whether exactly one is live,
 *  the only case with an unambiguous total-progress bar to show). */
export interface TypedFolderFlightStatus {
  readonly activeHere: boolean;
  readonly queuedHere: boolean;
  readonly runningFlights: FlightsListItem[];
}

/** Reduces the registry's full flight list against the folder currently
 *  typed into the launch form: is IT flying, is IT queued, and which
 *  entries (regardless of folder) are running right now. */
export function typedFolderFlightStatus(
  flights: readonly FlightsListItem[],
  typedFolder: string,
): TypedFolderFlightStatus {
  let activeHere = false;
  let queuedHere = false;
  const runningFlights: FlightsListItem[] = [];
  for (const f of flights) {
    if (f && f.folder === typedFolder) {
      if (f.running) activeHere = true;
      if (f.queued) queuedHere = true;
    }
    if (f && f.running) runningFlights.push(f);
  }
  return { activeHere, queuedHere, runningFlights };
}

/** The field {@link folderOptionsSig} reads off each entry in the fly bar's
 *  registered-project list — used to build the "known folders" datalist
 *  (FLY-BAR folder UX, board web-msrhr2d9-xxwa3a). */
export interface FolderOption {
  readonly rootPath: string;
}

/** A diff signature for the registered-projects folder list — changes only
 *  when the SET of known root paths changes, so a live SSE tick that hasn't
 *  actually onboarded/removed a project never rebuilds the datalist and
 *  clobbers an in-progress typed value (same reasoning as {@link flightsSig}/
 *  `searchProjectsSig`). */
export function folderOptionsSig(projects: readonly FolderOption[]): string {
  return projects.map((p) => p.rootPath).join(String.fromCharCode(1));
}

/** The extra fields {@link flightRowStatusText} reads off one fly-bar row
 *  beyond the base {@link FlightsListItem} shape. */
export interface FlightRowStatusItem extends FlightsListItem {
  readonly totalBudgetUsd?: number;
  readonly firings?: number;
  readonly initiatedBy?: string;
}

/** The fly bar's per-folder status sentence for one live/paused/queued flight
 *  row — running (budget-mode-aware, with a fleet-watchdog suffix when RING-0
 *  FLEET WATCHDOG (web-msqhh7kh-ptjodv) started it unattended), queued
 *  (waiting for a flight slot), or paused (won't fly until resumed).
 *  Since the i18n slice (board web-msnsndki-dz3vn1) this is the tested
 *  English SOURCE the `flightRow*` STRINGS keys mirror
 *  (fly-rows-i18n.test.ts) — the served bundle reads those keys via `tr()`
 *  rather than splicing this function, same as `card-actions.ts`'s
 *  `githubSyncConfirmMessage` before it. */
export function flightRowStatusText(f: FlightRowStatusItem): string {
  if (f.running) {
    const budget = f.totalBudgetUsd
      ? `up to $${f.totalBudgetUsd} total`
      : `${f.firings || 1} firing(s)`;
    const watchdog = f.initiatedBy === 'fleet-watchdog' ? ' (fleet-watchdog)' : '';
    return `Flying ${f.folder} — ${budget}${watchdog}`;
  }
  if (f.queued) return `Queued: ${f.folder} — waiting for a flight slot`;
  return `Paused ${f.folder} — will not fly until resumed.`;
}

/** The fly-bar row action a {@link flightActionAriaLabel} caption describes —
 *  one per branch `flightRow` renders (running: pause/stop; queued: cancel;
 *  paused: resume). */
export type FlightActionKind = 'pause' | 'stop' | 'cancel' | 'resume';

/** The shared aria-label (also used as the visible hover/focus tip) for one
 *  fly-bar row's Pause/Stop/Cancel/Resume button — folder-specific so a
 *  screen reader user with several rows open can tell them apart, unlike the
 *  buttons' own bare "Pause"/"Stop"/"Cancel"/"Resume" text.
 *  Like {@link flightRowStatusText}, the tested English source the
 *  `pauseFlightOn`/`stopFlightOn`/`cancelQueuedFlightOn`/`resumeFlightOn`
 *  STRINGS keys mirror — no longer spliced into the served bundle. */
export function flightActionAriaLabel(kind: FlightActionKind, folder: string): string {
  if (kind === 'pause') return `Pause the flight on ${folder}`;
  if (kind === 'stop') return `Stop the flight on ${folder}`;
  if (kind === 'cancel') return `Cancel the queued flight on ${folder}`;
  return `Resume the flight on ${folder}`;
}

/** One folder's remembered fly-bar settings — mode/firings/total/budget as
 *  last submitted (FLY-BAR STATE PERSISTENCE, board web-mss4ie59-mwlogo).
 *  `total` only matters in `'total'` mode; both numeric fields stay optional
 *  so a partially-saved settings object (an older schema, a manual edit)
 *  degrades to the form's own defaults rather than a wrong value. */
export interface FlySettings {
  readonly mode?: 'firings' | 'total';
  readonly firings?: number;
  readonly total?: number;
  readonly budget?: number;
  /** Lanes field (board web-mtdcfel4-0bxf4h): >1 launches a hub-aware
   *  partitioned multi-lane fleet (`POST /api/fleet`) instead of a single
   *  flight — omitted/1 is the ordinary single-lane launch, unchanged. */
  readonly lanes?: number;
}

/** The full remembered-settings blob: one {@link FlySettings} per folder the
 *  operator has flown before, keyed by that folder's exact typed path. */
export type FlySettingsStore = Readonly<Record<string, FlySettings>>;

/** Safely parses the fly-bar settings blob read from localStorage — missing,
 *  malformed JSON, or a non-object payload (an array, a stray primitive)
 *  degrades to an empty store rather than throwing, mirroring the fly-bar
 *  folder history's own defensive parse. */
export function parseFlySettingsStore(raw: string | null): FlySettingsStore {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as FlySettingsStore;
  } catch {
    return {};
  }
}

/** This folder's remembered settings, or `undefined` when it has never been
 *  flown (or its settings were never saved) before. */
export function flySettingsFor(store: FlySettingsStore, folder: string): FlySettings | undefined {
  return store[folder];
}

/** A new store with `folder`'s settings replaced by `settings` — every other
 *  folder's remembered settings pass through untouched; does not mutate
 *  `store`. */
export function withFlySettings(
  store: FlySettingsStore,
  folder: string,
  settings: FlySettings,
): FlySettingsStore {
  return { ...store, [folder]: settings };
}
