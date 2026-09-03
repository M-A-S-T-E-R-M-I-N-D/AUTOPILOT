// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/** Thrown by the safety guard when a repo is not yet backed up (MYTH+LEGACY). */
export class RepoNotBackedUpError extends Error {
  constructor(root: string) {
    super(`repo is not backed up (missing MYTH/LEGACY snapshot): ${root}`);
    this.name = 'RepoNotBackedUpError';
  }
}

/** Thrown when the baseline scan finds a likely secret before staging it. */
export class PossibleSecretsDetectedError extends Error {
  constructor(paths: readonly string[]) {
    super(
      `baseline aborted — possible secret(s) detected, remove or .gitignore them first: ${paths.join(', ')}`,
    );
    this.name = 'PossibleSecretsDetectedError';
  }
}

/** Thrown when the baseline scan finds a file too large to stage safely. */
export class HugeFileDetectedError extends Error {
  constructor(paths: readonly string[]) {
    super(
      `baseline aborted — file(s) too large to stage, remove or .gitignore them first: ${paths.join(', ')}`,
    );
    this.name = 'HugeFileDetectedError';
  }
}
