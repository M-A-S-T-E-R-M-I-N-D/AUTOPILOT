// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface CodeRegion {
  index: number;
  name: string;
  kind: string;
  start: number;
  end: number;
  text: string;
}

export interface ManifestRegionEntry {
  file: string;
  index: number;
  kind: string;
  start: number;
  end: number;
}

export interface Manifest {
  regions: ManifestRegionEntry[];
}

export declare function splitTopLevelRegions(sourceText: string, fileName?: string): CodeRegion[];
export declare function reassembleRegions(
  regions: Array<Pick<CodeRegion, 'index' | 'text'>>,
): string;
export declare function sha256(text: string): string;
export declare function writeRegionsToDisk(regions: CodeRegion[], outputDir: string): Manifest;
export declare function readRegionsFromDisk(outputDir: string): string;
