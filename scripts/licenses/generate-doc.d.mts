// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

export interface LicensedPackage {
  readonly name: string;
  readonly versions: readonly string[];
  readonly license: string;
}

export declare function licenseTerms(license: string): string[];
export declare function isAllowedLicense(license: string): boolean;
export declare function flattenLicenseData(
  data: Record<string, ReadonlyArray<{ name: string; versions: string[]; license?: string }>>,
): LicensedPackage[];
export declare function findDisallowed(packages: readonly LicensedPackage[]): LicensedPackage[];
export declare function renderDoc(packages: readonly LicensedPackage[]): string;
