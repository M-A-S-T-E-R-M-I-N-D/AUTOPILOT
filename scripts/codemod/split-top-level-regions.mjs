// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * split-top-level-regions — a deterministic codemod that cuts a TypeScript
 * source file at its top-level declaration boundaries into ordered "region"
 * files, reassembled by straight concatenation.
 *
 * Region boundaries are read straight off the TypeScript AST (each top-level
 * statement's `getFullStart()`, which includes its leading comments/blank
 * lines), so the regions are contiguous and non-overlapping by construction:
 * concatenating them in order reproduces the input byte-for-byte. This is
 * mechanical pre-split tooling — it does not rewrite imports/exports or turn
 * regions into real modules; it only proves a large file (e.g.
 * apps/dashboard/src/web/shell.ts) can be cut into independent, reassembled
 * chunks so a later pass can hand each chunk to a different agent.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const REGION_FILE_EXT = '.region';
const MANIFEST_FILE = 'manifest.json';

/** @param {string} text */
function slug(text) {
  const cleaned = text.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'anon';
}

/** @param {ts.Statement} statement */
function describeStatement(statement) {
  if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
    return 'import';
  }
  if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
    return 'export';
  }
  if (ts.isVariableStatement(statement)) {
    const names = statement.declarationList.declarations
      .map((decl) => (ts.isIdentifier(decl.name) ? decl.name.text : 'destructured'))
      .join('-');
    return `const-${slug(names)}`;
  }
  if (ts.isFunctionDeclaration(statement)) {
    return `function-${slug(statement.name?.text ?? 'anonymous')}`;
  }
  if (ts.isClassDeclaration(statement)) {
    return `class-${slug(statement.name?.text ?? 'anonymous')}`;
  }
  if (ts.isInterfaceDeclaration(statement)) {
    return `interface-${slug(statement.name.text)}`;
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    return `type-${slug(statement.name.text)}`;
  }
  if (ts.isEnumDeclaration(statement)) {
    return `enum-${slug(statement.name.text)}`;
  }
  if (ts.isModuleDeclaration(statement)) {
    return `module-${slug(statement.name.getText())}`;
  }
  return slug(ts.SyntaxKind[statement.kind]);
}

/**
 * Splits `sourceText` at top-level statement boundaries.
 * @param {string} sourceText
 * @param {string} [fileName]
 * @returns {Array<{index: number, name: string, kind: string, start: number, end: number, text: string}>}
 */
export function splitTopLevelRegions(sourceText, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const statements = Array.from(sourceFile.statements);

  if (statements.length === 0) {
    return [
      {
        index: 0,
        name: '0000-whole-file',
        kind: 'SourceFile',
        start: 0,
        end: sourceText.length,
        text: sourceText,
      },
    ];
  }

  // Boundary 0 is forced to 0 (not statements[0].getFullStart()) so any
  // leading bytes the parser doesn't attribute to a node — e.g. a stray BOM —
  // still land inside a region rather than being silently dropped.
  const boundaries = [0, ...statements.slice(1).map((s) => s.getFullStart()), sourceText.length];

  return statements.map((statement, index) => {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end < start) {
      throw new Error(
        `split-top-level-regions: non-monotonic boundary at statement ${index} in ${fileName}`,
      );
    }
    return {
      index,
      name: `${String(index).padStart(4, '0')}-${describeStatement(statement)}`,
      kind: ts.SyntaxKind[statement.kind],
      start,
      end,
      text: sourceText.slice(start, end),
    };
  });
}

/**
 * Reassembles regions back into a single string by concatenating their text
 * in ascending `index` order.
 * @param {Array<{index: number, text: string}>} regions
 * @returns {string}
 */
export function reassembleRegions(regions) {
  return regions
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((region) => region.text)
    .join('');
}

/** @param {string} text */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Writes each region to its own file plus an ordered `manifest.json`.
 * @param {ReturnType<typeof splitTopLevelRegions>} regions
 * @param {string} outputDir
 */
export function writeRegionsToDisk(regions, outputDir) {
  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  const manifest = {
    regions: regions.map((region) => ({
      file: `${region.name}${REGION_FILE_EXT}`,
      index: region.index,
      kind: region.kind,
      start: region.start,
      end: region.end,
    })),
  };

  for (const region of regions) {
    writeFileSync(path.join(outputDir, `${region.name}${REGION_FILE_EXT}`), region.text, 'utf8');
  }
  writeFileSync(
    path.join(outputDir, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
}

/**
 * Reads a manifest + its region files back off disk and reassembles them in
 * manifest order — the disk-round-trip counterpart to `reassembleRegions`.
 * @param {string} outputDir
 * @returns {string}
 */
export function readRegionsFromDisk(outputDir) {
  const manifest = JSON.parse(readFileSync(path.join(outputDir, MANIFEST_FILE), 'utf8'));
  return manifest.regions
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((entry) => readFileSync(path.join(outputDir, entry.file), 'utf8'))
    .join('');
}

function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg) {
    console.error(
      'Usage: node scripts/codemod/split-top-level-regions.mjs <input-file> [output-dir]',
    );
    process.exit(1);
    return;
  }

  const inputFile = path.resolve(inputArg);
  const outputDir = path.resolve(outputArg ?? `${inputFile}.regions`);
  const original = readFileSync(inputFile, 'utf8');
  const regions = splitTopLevelRegions(original, inputFile);
  writeRegionsToDisk(regions, outputDir);
  const reassembled = readRegionsFromDisk(outputDir);

  if (reassembled !== original) {
    console.error(
      `split-top-level-regions FAILED: reassembly is not byte-identical for ${inputFile}`,
    );
    process.exit(1);
    return;
  }

  console.log(
    `split-top-level-regions OK: ${regions.length} region(s) written to ${outputDir}; ` +
      `reassembly verified byte-identical (sha256 ${sha256(original)})`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
