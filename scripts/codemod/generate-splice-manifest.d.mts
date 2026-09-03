// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface SpliceEntry {
  modulePath: string;
  exportedName: string;
  localName: string;
  kind: 'toString' | 'jsonStringify' | 'templateLiteral' | 'jsonStringifySpread';
  enclosingFunction: string | null;
  position: number;
}

export interface SpliceManifest {
  sourceFile: string;
  entries: SpliceEntry[];
}

export interface AssemblySlot {
  exprText: string;
  position: number;
}

export interface AssemblySegments {
  segments: string[];
  slots: AssemblySlot[];
}

export interface AssemblyManifest {
  sourceFile: string;
  entries: SpliceEntry[];
  functions: Record<string, AssemblySegments>;
}

export declare function allRelativeImportLocalNames(
  sourceText: string,
  fileName?: string,
): string[];
export declare function findSpliceManifest(sourceText: string, fileName?: string): SpliceEntry[];
export declare function buildSpliceManifest(sourceText: string, sourceFile: string): SpliceManifest;
export declare function buildAssemblyManifest(
  sourceText: string,
  sourceFile: string,
  functionNames: string[],
): AssemblyManifest;
export declare function verifySpliceManifestAgainstOutput(
  assembledOutput: string,
  entries: SpliceEntry[],
  resolveBinding: (entry: SpliceEntry) => unknown,
): SpliceEntry[];
export declare function discoverAssemblyFunctionNames(
  sourceText: string,
  fileName?: string,
): string[];
export interface FeatureModule {
  filePath: string;
  functionNames: string[];
}
export declare function discoverFeatureModules(directoryPath: string): FeatureModule[];
export interface FeatureModulesManifest {
  directoryPath: string;
  modules: AssemblyManifest[];
}
export declare function buildFeatureModulesManifest(directoryPath: string): FeatureModulesManifest;
export declare function generateFeatureModulesIndexSource(directoryPath: string): string;
export declare function captureAssemblySegments(
  sourceText: string,
  functionName: string,
  fileName?: string,
): AssemblySegments;
export declare function reassembleSegments(
  segments: string[],
  resolvedSlotValues: unknown[],
): string;
export declare function localTopLevelConstLiteral(
  sourceText: string,
  name: string,
  fileName?: string,
): string | number | boolean | undefined;
export declare function resolveManifestBindings(
  entries: { modulePath: string; exportedName: string }[],
  baseDir: string,
): Promise<Map<string, unknown>>;
export declare function assembleFunctionFromManifest(
  sourceText: string,
  functionName: string,
  resolvedBindings: Map<string, unknown>,
  resolveOtherSlot?: (exprText: string) => unknown | Promise<unknown>,
  fileName?: string,
): Promise<string>;
export declare function assembleFromManifest(
  manifest: AssemblyManifest,
  functionName: string,
  resolvedBindings: Map<string, unknown>,
  resolveOtherSlot?: (exprText: string) => unknown | Promise<unknown>,
): Promise<string>;
