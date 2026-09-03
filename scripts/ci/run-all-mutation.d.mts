// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface DiscoveredMutationConfig {
  readonly file: string;
  readonly mutate: readonly string[];
}

export declare function discoverConfigs(dir?: string): DiscoveredMutationConfig[];
export declare function parseDiffRef(argv: readonly string[]): string | null;
export declare function selectConfigFiles(
  configs: readonly DiscoveredMutationConfig[],
  diffRef: string | null,
  touchedFiles: readonly string[],
): string[];
