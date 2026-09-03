// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/** The lifecycle states of the dashboard process. */
export type RunState = 'running' | 'stopped' | 'stale';

/** The persisted run record (never contains secrets — pid/port/time only). */
export interface DashboardState {
  readonly pid: number;
  readonly port: number;
  readonly startedAt: number;
}

export interface StatusResult {
  readonly state: RunState;
  readonly pid: number | null;
  readonly port: number | null;
  readonly url: string | null;
}

export interface ControlConfig {
  /** Directory for the run record + log (gitignored, loopback-local). */
  readonly stateDir: string;
  /** The built server entry to spawn (a local file — never a remote/URL). */
  readonly serverEntry: string;
  readonly port: number;
  /** The node binary (defaults to this process's own — no PATH lookup surprises). */
  readonly nodeBin: string;
}

export interface DoctorCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}
