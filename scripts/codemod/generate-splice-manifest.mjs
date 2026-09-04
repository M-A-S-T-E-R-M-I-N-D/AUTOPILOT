// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * generate-splice-manifest — discovers the "splice registry" a client
 * assembler (`web/shell.ts`'s `clientJs()`) currently carries by hand: every
 * relative-module import that gets embedded into the assembled client bundle
 * string via `<binding>.toString()` (a function's real compiled source) or
 * `JSON.stringify(<binding>)` (a constant's real value), instead of a
 * hand-retyped copy (see docs/epics/0002-shell-decomposition.md).
 *
 * Today, wiring a new feature module into the bundle means editing shell.ts
 * twice by hand — once for the import, once for the splice line at the right
 * position — which makes shell.ts the one file every parallel feature slice
 * converges on. This tool proves that wiring is mechanically readable off the
 * AST rather than known only by convention: it does not change how splicing
 * happens (no shell.ts edit, zero behavior change), it only emits the
 * manifest a later "auto-discovery assembly" pass can have the client
 * assembler read instead of requiring a hand-written registry entry per
 * feature — the same "prove it's mechanical first" shape
 * split-top-level-regions.mjs used for PARALLEL UNLOCK A.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * @typedef {Object} SpliceEntry
 * @property {string} modulePath
 * @property {string} exportedName
 * @property {string} localName
 * @property {'toString' | 'jsonStringify' | 'templateLiteral' | 'jsonStringifySpread'} kind
 * @property {string} enclosingFunction
 * @property {number} position
 */

/** @param {ts.Node} node */
function enclosingTopLevelFunctionName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name && ts.isSourceFile(current.parent)) {
      return current.name.text;
    }
    current = current.parent;
  }
  return null;
}

/**
 * @param {ts.SourceFile} sourceFile
 * @returns {Map<string, {exportedName: string, modulePath: string}>}
 */
function collectRelativeImports(sourceFile) {
  const relativeImports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const modulePath = statement.moduleSpecifier.text;
    if (!modulePath.startsWith('.')) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const localName = element.name.text;
      const exportedName = (element.propertyName ?? element.name).text;
      relativeImports.set(localName, { exportedName, modulePath });
    }
  }
  return relativeImports;
}

/**
 * Whether a `ts.BindingName` (a parameter's or variable declaration's name —
 * a plain identifier, or a destructured `{ ... }`/`[ ... ]` pattern, possibly
 * nested) binds `name` anywhere within it. A destructured binding like
 * `{ sharedX }` or `{ sharedX } = f()` introduces the same shadowing local as
 * a plain identifier parameter/declaration does, just via a BindingElement
 * instead of a bare Identifier — `ts.isIdentifier(node.name)` alone misses it
 * entirely.
 * @param {ts.BindingName} bindingName
 * @param {string} name
 * @returns {boolean}
 */
function bindingNameDeclares(bindingName, name) {
  if (ts.isIdentifier(bindingName)) {
    return bindingName.text === name;
  }
  for (const element of bindingName.elements) {
    if (ts.isOmittedExpression(element)) continue;
    if (bindingNameDeclares(element.name, name)) return true;
  }
  return false;
}

/**
 * Whether any statement in `statements` — a Block's own statements, or a
 * switch's case/default clause's own statements — declares `name` via a
 * block-scoped `let`/`const` or a local `function`/`class` declaration.
 * Shared by the `ts.isBlock` and `ts.isCaseBlock` branches of
 * `isShadowedByLocalBinding` so both scope shapes agree on exactly what
 * counts as a block-scoped declaration.
 * @param {readonly ts.Statement[]} statements
 * @param {string} name
 * @returns {boolean}
 */
function statementsDeclare(statements, name) {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      if (!(statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) continue;
      for (const decl of statement.declarationList.declarations) {
        if (bindingNameDeclares(decl.name, name)) {
          return true;
        }
      }
    } else if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name?.text === name
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether `name` is declared by a `var` anywhere inside `body` — at any
 * nesting depth, including inside `if`/loop/switch bodies that are not
 * themselves function scopes — without descending into a nested function's
 * own body, which owns its own `var` scope. Unlike `let`/`const`, `var`
 * is not block-scoped: it hoists to the nearest enclosing function (or the
 * top level) regardless of how deeply nested the declaration textually is,
 * so `isShadowedByLocalBinding`'s block-by-block ancestor walk (correct for
 * `let`/`const`) misses a `var` declared in a sibling block of the same
 * function entirely.
 * @param {ts.Node} body
 * @param {string} name
 * @returns {boolean}
 */
function varDeclaredInBody(body, name) {
  let found = false;
  function visit(node) {
    if (found) return;
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      return;
    }
    if (
      ts.isVariableDeclarationList(node) &&
      !(node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))
    ) {
      for (const decl of node.declarations) {
        if (bindingNameDeclares(decl.name, name)) {
          found = true;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}

/**
 * Whether `identifier` sits inside a function parameter list, a
 * function-scoped `var` declared anywhere in the enclosing function's body, a
 * block-scoped `let`/`const`/`function`/`class` declaration, a `switch`
 * statement's own case/default clauses, a `catch` clause's own binding, or a
 * `for`/`for-of`/`for-in` loop's own declaration list that shadows it more
 * closely than the module-level relative import it might otherwise match.
 * `findSpliceManifest`'s splice checks compare identifier names only, with no
 * scope resolution — a nested helper like
 * `function helper(sharedX) { return sharedX.toString(); }`, one that instead
 * shadows via a local declaration like
 * `function helper() { const sharedX = f(); return sharedX.toString(); }`,
 * one that shadows via a caught error like
 * `try { ... } catch (sharedX) { return sharedX.toString(); }`, one that
 * shadows via a loop variable like
 * `for (const sharedX of items) { return sharedX.toString(); }`, one that
 * shadows via a local function/class declaration like
 * `function helper() { function sharedX() {} return sharedX.toString(); }`,
 * one that shadows via a switch case declared without its own `{ }` braces
 * like `switch (x) { case 1: const sharedX = f(); return sharedX.toString();
 * }` — the ECMAScript spec gives every clause of one switch statement a
 * single shared lexical scope (13.12.11's BlockDeclarationInstantiation runs
 * over all clauses combined), so the declaration shadows across the WHOLE
 * switch, not just the clause it sits in — or one that shadows via a `var`
 * declared in a sibling block of the same function like
 * `function helper() { if (x) { var sharedX = f(); } return
 * sharedX.toString(); }` — unlike `let`/`const`, `var` is not block-scoped:
 * it hoists to the nearest enclosing function regardless of nesting depth, so
 * the declaration shadows the whole function even from a block that is not
 * an ancestor of the usage site — would otherwise misattribute the shadowing
 * reference to the top-level `sharedX` import as a false splice entry, even
 * though this identifier never resolves to the import at all — including
 * when the parameter/declaration/catch/loop binding is itself a destructured
 * `{ sharedX }` binding rather than a plain identifier. Walking the ancestor
 * chain and checking each enclosing block's (or loop's, or switch's) own
 * declarations (not nested deeper blocks, which aren't in scope here) mirrors
 * how block scoping actually resolves the name, regardless of whether the
 * declaration textually precedes the usage; `var`'s own hoisting is checked
 * separately, over the whole enclosing function body, at the same point its
 * parameters are.
 * @param {ts.Node} identifier
 * @param {string} name
 * @returns {boolean}
 */
function isShadowedByLocalBinding(identifier, name) {
  let current = identifier.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isGetAccessorDeclaration(current) ||
      ts.isSetAccessorDeclaration(current) ||
      ts.isConstructorDeclaration(current)
    ) {
      for (const param of current.parameters) {
        if (bindingNameDeclares(param.name, name)) {
          return true;
        }
      }
      if (current.body && varDeclaredInBody(current.body, name)) {
        return true;
      }
    } else if (ts.isBlock(current)) {
      if (statementsDeclare(current.statements, name)) {
        return true;
      }
    } else if (ts.isCaseBlock(current)) {
      for (const clause of current.clauses) {
        if (statementsDeclare(clause.statements, name)) {
          return true;
        }
      }
    } else if (ts.isCatchClause(current)) {
      if (
        current.variableDeclaration &&
        bindingNameDeclares(current.variableDeclaration.name, name)
      ) {
        return true;
      }
    } else if (
      (ts.isForOfStatement(current) ||
        ts.isForInStatement(current) ||
        ts.isForStatement(current)) &&
      current.initializer &&
      ts.isVariableDeclarationList(current.initializer)
    ) {
      for (const decl of current.initializer.declarations) {
        if (bindingNameDeclares(decl.name, name)) {
          return true;
        }
      }
    }
    current = current.parent;
  }
  return false;
}

/**
 * @param {string} sourceText
 * @param {string} fileName
 * @returns {ts.SourceFile}
 */
function parseSource(sourceText, fileName) {
  return ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Every relative-module import binding `sourceText` declares, spliced or
 * not — the full registry `findSpliceManifest` is expected to account for
 * (see `verifySpliceManifestAgainstOutput`'s doc comment and
 * `generate-splice-manifest.test.ts`'s "never silently undercounts" guard).
 * A name missing from `findSpliceManifest`'s output that isn't a deliberate
 * server-side-only exception means a splice shape the detector doesn't know
 * about yet — the same "undercounts its own registry" bug class this
 * detector has already had to close three times (jsonStringify, then
 * templateLiteral, then jsonStringifySpread).
 * @param {string} sourceText
 * @param {string} [fileName]
 * @returns {string[]}
 */
export function allRelativeImportLocalNames(sourceText, fileName = 'source.ts') {
  return [...collectRelativeImports(parseSource(sourceText, fileName)).keys()];
}

/**
 * Finds every relative-module import binding in `sourceText` that is spliced
 * into the output via `<binding>.toString()` or `JSON.stringify(<binding>)`,
 * ordered by source position (the order they appear in the assembled
 * output — significant for `const`-bound splices that reference each other).
 * @param {string} sourceText
 * @param {string} [fileName]
 * @returns {SpliceEntry[]}
 */
export function findSpliceManifest(sourceText, fileName = 'source.ts') {
  const sourceFile = parseSource(sourceText, fileName);
  const relativeImports = collectRelativeImports(sourceFile);

  /** @type {SpliceEntry[]} */
  const entries = [];

  /**
   * @param {ts.Identifier} identifier
   * @returns {{exportedName: string, modulePath: string} | undefined}
   */
  function resolveImportBinding(identifier) {
    if (isShadowedByLocalBinding(identifier, identifier.text)) return undefined;
    return relativeImports.get(identifier.text);
  }

  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.name.text === 'toString' &&
        node.arguments.length === 0
      ) {
        const imp = resolveImportBinding(callee.expression);
        if (imp) {
          entries.push({
            modulePath: imp.modulePath,
            exportedName: imp.exportedName,
            localName: callee.expression.text,
            kind: 'toString',
            enclosingFunction: enclosingTopLevelFunctionName(node),
            position: node.getStart(sourceFile),
          });
        }
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'JSON' &&
        callee.name.text === 'stringify' &&
        node.arguments.length === 1 &&
        ts.isIdentifier(node.arguments[0])
      ) {
        const argIdentifier = /** @type {ts.Identifier} */ (node.arguments[0]);
        const argName = argIdentifier.text;
        const imp = resolveImportBinding(argIdentifier);
        if (imp) {
          entries.push({
            modulePath: imp.modulePath,
            exportedName: imp.exportedName,
            localName: argName,
            kind: 'jsonStringify',
            enclosingFunction: enclosingTopLevelFunctionName(node),
            position: node.getStart(sourceFile),
          });
        }
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'JSON' &&
        callee.name.text === 'stringify' &&
        node.arguments.length === 1 &&
        ts.isArrayLiteralExpression(node.arguments[0]) &&
        node.arguments[0].elements.length === 1 &&
        ts.isSpreadElement(node.arguments[0].elements[0]) &&
        ts.isIdentifier(node.arguments[0].elements[0].expression)
      ) {
        // A fourth splice shape: a shared iterable (e.g. a ReadonlySet) is
        // re-serialized as a plain array via `[...binding]` before
        // JSON.stringify() rather than stringifying the binding itself —
        // web/shell.ts's SUBAGENT_TOOLS
        // (`new Set(${JSON.stringify([...SUBAGENT_TOOLS])})`) splices this way.
        const argIdentifier = /** @type {ts.Identifier} */ (
          node.arguments[0].elements[0].expression
        );
        const argName = argIdentifier.text;
        const imp = resolveImportBinding(argIdentifier);
        if (imp) {
          entries.push({
            modulePath: imp.modulePath,
            exportedName: imp.exportedName,
            localName: argName,
            kind: 'jsonStringifySpread',
            enclosingFunction: enclosingTopLevelFunctionName(node),
            position: node.getStart(sourceFile),
          });
        }
      }
    } else if (ts.isTemplateSpan(node) && ts.isIdentifier(node.expression)) {
      // A third splice shape: a shared constant embedded directly as
      // `${WIDTH}` rather than wrapped in .toString()/JSON.stringify() —
      // web/office-map.ts's OFFICE_W/OFFICE_H/etc. splice into shell.ts's
      // clientJs() this way. relativeImports.get() already filters out any
      // other template-literal expression (locals, property accesses, ...).
      const imp = resolveImportBinding(node.expression);
      if (imp) {
        entries.push({
          modulePath: imp.modulePath,
          exportedName: imp.exportedName,
          localName: node.expression.text,
          kind: 'templateLiteral',
          enclosingFunction: enclosingTopLevelFunctionName(node),
          position: node.expression.getStart(sourceFile),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  entries.sort((a, b) => a.position - b.position);
  return entries;
}

/**
 * @param {string} sourceText
 * @param {string} sourceFile
 * @returns {{sourceFile: string, entries: SpliceEntry[]}}
 */
export function buildSpliceManifest(sourceText, sourceFile) {
  return { sourceFile, entries: findSpliceManifest(sourceText, sourceFile) };
}

/**
 * @typedef {Object} AssemblyManifest
 * @property {string} sourceFile
 * @property {SpliceEntry[]} entries
 * @property {Record<string, AssemblySegments>} functions
 */

/**
 * The full "recipe" a future auto-discovery assembler needs in one
 * serializable artifact: `buildSpliceManifest`'s splice registry (WHAT each
 * substitution resolves to) plus `captureAssemblySegments`' literal glue text
 * (the segments/slots AROUND every substitution) for each of
 * `functionNames`. `buildSpliceManifest` alone is not sufficient for
 * reconstruction — a manifest written to disk with only `entries` tells an
 * assembler which modules splice into which function, but not the literal
 * text to stitch them into; `functions` closes that gap so the written
 * manifest itself (not just the in-memory helpers `assembleFunctionFromManifest`
 * already composes) is a complete description of the assembled bundle (see
 * docs/epics/0002-shell-decomposition.md's PARALLEL UNLOCK B).
 * @param {string} sourceText
 * @param {string} sourceFile
 * @param {string[]} functionNames
 * @returns {AssemblyManifest}
 */
export function buildAssemblyManifest(sourceText, sourceFile, functionNames) {
  const entries = findSpliceManifest(sourceText, sourceFile);
  /** @type {Record<string, AssemblySegments>} */
  const functions = {};
  for (const functionName of functionNames) {
    functions[functionName] = captureAssemblySegments(sourceText, functionName, sourceFile);
  }
  return { sourceFile, entries, functions };
}

/**
 * Proves the manifest is not just AST shape that happens to be readable, but
 * an accurate description of a bundle that was ACTUALLY assembled this way:
 * for each entry, in manifest order, its real spliced content (the resolved
 * binding's compiled `.toString()` source, or its `JSON.stringify()`
 * serialization) must appear in `assembledOutput` at or after where the
 * previous entry's match ended. This is the necessary precondition before
 * any future automated assembler can rely on the manifest as ground truth
 * for what a client bundle contains, instead of re-deriving it from
 * shell.ts's AST by convention each time.
 * @param {string} assembledOutput
 * @param {SpliceEntry[]} entries
 * @param {(entry: SpliceEntry) => unknown} resolveBinding
 * @returns {SpliceEntry[]} entries whose expected content could not be found in order
 */
export function verifySpliceManifestAgainstOutput(assembledOutput, entries, resolveBinding) {
  const unmatched = [];
  let cursor = 0;
  for (const entry of entries) {
    const value = resolveBinding(entry);
    const expected =
      entry.kind === 'jsonStringify'
        ? JSON.stringify(value)
        : entry.kind === 'jsonStringifySpread'
          ? JSON.stringify([...value])
          : String(value);
    const idx = assembledOutput.indexOf(expected, cursor);
    if (idx === -1) {
      unmatched.push(entry);
      continue;
    }
    cursor = idx + expected.length;
  }
  return unmatched;
}

/**
 * @typedef {Object} AssemblySlot
 * @property {string} exprText
 * @property {number} position
 */

/**
 * @typedef {Object} AssemblySegments
 * @property {string[]} segments
 * @property {AssemblySlot[]} slots
 */

/**
 * Finds `functionName`'s single top-level `return \`...\`;` (optionally
 * `.trim()`-ed) template-literal expression within `functionBody`'s direct
 * control flow — shared by `captureAssemblySegments` (which needs the
 * segments/slots) and `discoverAssemblyFunctionNames` (which only needs to
 * know whether one exists), so both agree on exactly what shape counts as
 * "assembler-like" instead of drifting apart into two subtly different
 * definitions.
 * @param {ts.Block} functionBody
 * @param {string} functionName
 * @returns {ts.TemplateExpression | null}
 */
function topLevelReturnTemplate(functionBody, functionName) {
  /** @type {ts.TemplateExpression | null} */
  let templateExpr = null;

  /** @param {ts.Node} node */
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      // Don't descend into a nested function scope's own `return` statements
      // — only the named top-level function's direct control-flow counts. A
      // class's getter/setter/constructor is the same kind of nested scope as
      // a MethodDeclaration (already excluded above), just a distinct AST
      // node kind.
      return;
    }
    if (ts.isReturnStatement(node) && node.expression) {
      let expr = node.expression;
      if (
        ts.isCallExpression(expr) &&
        expr.arguments.length === 0 &&
        ts.isPropertyAccessExpression(expr.expression) &&
        expr.expression.name.text === 'trim'
      ) {
        expr = expr.expression.expression;
      }
      if (ts.isTemplateExpression(expr)) {
        if (templateExpr) {
          throw new Error(`${functionName} has more than one top-level template-literal return`);
        }
        templateExpr = expr;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(functionBody);
  return templateExpr;
}

/**
 * Discovers every top-level function declaration in `sourceText` shaped like
 * a client-bundle assembler — a single top-level `return \`...\`;`
 * (optionally `.trim()`-ed) template literal, the exact shape
 * `captureAssemblySegments` requires — instead of relying on a hand-maintained
 * list of function names (until now, every caller of `buildAssemblyManifest`/
 * `captureAssemblySegments` had to already know shell.ts's five bundle-
 * composing functions by name). This is what lets the CLI entry point emit a
 * complete manifest for ANY input file without also being told which
 * functions to capture — the last hand-maintained list PARALLEL UNLOCK B's
 * auto-discovery still depended on (see
 * docs/epics/0002-shell-decomposition.md).
 * @param {string} sourceText
 * @param {string} [fileName]
 * @returns {string[]}
 */
export function discoverAssemblyFunctionNames(sourceText, fileName = 'source.ts') {
  const sourceFile = parseSource(sourceText, fileName);
  /** @type {string[]} */
  const names = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.body) continue;
    // topLevelReturnTemplate throws for a function with more than one
    // top-level template-literal return — that shape simply is not
    // assembler-like, the same as a function with no template-literal return
    // at all, so it's excluded rather than allowed to abort discovery of
    // every function after it in the file.
    let template;
    try {
      template = topLevelReturnTemplate(statement.body, statement.name.text);
    } catch {
      continue;
    }
    if (template) {
      names.push(statement.name.text);
    }
  }
  return names;
}

/**
 * @typedef {Object} FeatureModule
 * @property {string} filePath
 * @property {string[]} functionNames
 */

/**
 * The top-level function declarations in `sourceText` that are exported —
 * inline (`export function foo() {}`, carrying an `export` modifier
 * directly), via a standalone `export { foo };`/`export { foo as bar };`
 * statement, or via a standalone `export default foo;` statement — each
 * exports an already-declared local function without ever touching its own
 * declaration node. `discoverAssemblyFunctionNames` deliberately checks shape
 * only — correct for its own use against `shell.ts`, where an assembler
 * function is called by name in the same file regardless of export status —
 * but `discoverFeatureModules` needs importability too: a future assembler
 * can only pull in a binding another module actually exports, so an
 * unexported match must not be reported as a discoverable feature. A
 * standalone `export { ... }` names the LOCAL declaration via `propertyName`
 * (falling back to `name` when unaliased) — `name` alone is the external
 * alias, which would not match the local function name
 * `discoverAssemblyFunctionNames` reports. A statement with a
 * `moduleSpecifier` (`export { foo } from './other.js'`) re-exports another
 * module's binding rather than declaring one here, so it's skipped — there is
 * no local `FunctionDeclaration` for it in this file at all. `export default
 * foo;` parses as a distinct node kind (`ExportAssignment`, not
 * `ExportDeclaration`) that the standalone-`export {}` branch never sees, and
 * the referenced `FunctionDeclaration` itself carries no modifier either
 * (only `export default function foo() {}` — already covered by the inline
 * check above — does); only the identifier form is handled, since any other
 * expression (`export default { ... }`, a call, ...) can't refer to a local
 * function declaration by name. `export = foo;` (`isExportEquals: true`, the
 * CommonJS-style form) is deliberately excluded — this repo's feature
 * modules are real ES modules, so it never legitimately appears. A type-only
 * export — a whole `export type { ... };` statement, or a single
 * `export { type name };` specifier within an otherwise-normal export list —
 * is elided entirely at compile time: the emitted JS carries no runtime
 * export under that name at all, so `import { name }` would resolve to
 * `undefined` rather than the function. Both `ExportDeclaration.isTypeOnly`
 * (the whole-statement form) and each `ExportSpecifier.isTypeOnly` (the
 * per-specifier form) are checked so neither shape is mistaken for a real
 * value export — the mirror image of the undercounting bug class fixed
 * above: this one over-reports rather than under-reports.
 * @param {string} sourceText
 * @param {string} fileName
 * @returns {Set<string>}
 */
function exportedFunctionNames(sourceText, fileName) {
  const sourceFile = parseSource(sourceText, fileName);
  const names = new Set();
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0
    ) {
      names.add(statement.name.text);
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        names.add((element.propertyName ?? element.name).text);
      }
    } else if (
      ts.isExportAssignment(statement) &&
      !statement.isExportEquals &&
      ts.isIdentifier(statement.expression)
    ) {
      names.add(statement.expression.text);
    }
  }
  return names;
}

/**
 * The directory-glob counterpart to `discoverAssemblyFunctionNames`: instead
 * of finding assembler-shaped functions by parsing ONE already-known file
 * (shell.ts), this scans every top-level `.ts`/`.mts` file in `directoryPath`
 * and reports which ones export at least one. This is the missing mechanical
 * piece docs/epics/0002-shell-decomposition.md's PARALLEL UNLOCK B analysis
 * names as the actual precondition for "a new feature is a new file, zero
 * shared-file edits": today discovery is anchored to a single hand-known
 * input file; a real auto-discovery assembler needs to find its feature
 * modules by walking a directory instead. It does not read `shell.ts`, write
 * anything, or change how any module is wired — a standalone, additively
 * tested primitive, the same "prove it's mechanical first" shape
 * `discoverAssemblyFunctionNames` itself started as before any file in this
 * repo depended on it. Declaration files (`.d.ts` and `.d.mts`) are excluded
 * since they carry type signatures, not template-literal bodies to discover.
 * Results are sorted by file name for a deterministic manifest order regardless of the
 * OS's directory-listing order; non-recursive, since a features directory is
 * expected to hold one module per file rather than nested subdirectories.
 * @param {string} directoryPath
 * @returns {FeatureModule[]}
 */
export function discoverFeatureModules(directoryPath) {
  const fileNames = readdirSync(directoryPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith('.ts') || entry.name.endsWith('.mts')) &&
        !entry.name.endsWith('.d.ts') &&
        !entry.name.endsWith('.d.mts'),
    )
    .map((entry) => entry.name)
    .sort();

  /** @type {FeatureModule[]} */
  const modules = [];
  for (const fileName of fileNames) {
    const filePath = path.join(directoryPath, fileName);
    const sourceText = readFileSync(filePath, 'utf8');
    const exported = exportedFunctionNames(sourceText, filePath);
    const functionNames = discoverAssemblyFunctionNames(sourceText, filePath).filter((name) =>
      exported.has(name),
    );
    if (functionNames.length > 0) {
      modules.push({ filePath, functionNames });
    }
  }
  return modules;
}

/**
 * @typedef {Object} FeatureModulesManifest
 * @property {string} directoryPath
 * @property {AssemblyManifest[]} modules
 */

/**
 * Composes `discoverFeatureModules` with `buildAssemblyManifest` into the one
 * artifact a real directory-glob auto-discovery assembler needs:
 * `discoverFeatureModules` alone reports only WHICH files export
 * assembler-shaped functions, not each one's splice registry or glue text —
 * the same gap `buildAssemblyManifest` itself closed for a single known file
 * by composing `discoverAssemblyFunctionNames` with `captureAssemblySegments`.
 * This performs that same composition per discovered file, so a features
 * directory yields one serializable manifest describing every module in it
 * (see docs/epics/0002-shell-decomposition.md's PARALLEL UNLOCK B). Does not
 * read or change shell.ts.
 * @param {string} directoryPath
 * @returns {FeatureModulesManifest}
 */
export function buildFeatureModulesManifest(directoryPath) {
  const modules = discoverFeatureModules(directoryPath).map(({ filePath, functionNames }) => {
    const sourceText = readFileSync(filePath, 'utf8');
    return buildAssemblyManifest(sourceText, filePath, functionNames);
  });
  return { directoryPath, modules };
}

/**
 * Generates the TypeScript source of a barrel file that statically imports
 * every discovered feature module's assembler function(s), re-exports them
 * as one ordered array, and wraps that array in `featureModulesJs()` — a
 * single plain function `clientJs()` can call as one `${featureModulesJs()}`
 * slot instead of one `${<name>Js()}` slot per feature module. The wrapper
 * exists because a bare `${FEATURE_MODULE_FUNCTIONS.map((fn) =>
 * fn()).join('\n')}` slot inline in `clientJs()` is a shape
 * generate-splice-manifest.test.ts's manifest-reconstruction resolver cannot
 * resolve (it only knows a same-file-text `<fnName>()` call); wrapping the
 * `.map().join()` in its own named function keeps every `clientJs()` slot a
 * bare call, the one shape the resolver already handles — real design work
 * the docs/epics/0002-shell-decomposition.md PARALLEL UNLOCK B write-up
 * flagged as the actual blocker, not a mechanical one. This is the missing
 * static-import counterpart to `discoverFeatureModules`'s dynamic discovery:
 * `clientJs()` used to need a `shell.ts` edit (an import line plus a
 * template-literal splice) to register each new feature module; regenerating
 * this ONE file from `discoverFeatureModules`'s own output — instead of
 * hand-typing it — mechanically produces the artifact `clientJs()` imports
 * instead of one hand-written name per feature module, the last piece
 * PARALLEL UNLOCK B's "auto-discovery assembly" needs before that
 * convergence point actually dissolves (see
 * docs/epics/0002-shell-decomposition.md). Import specifiers
 * are resolved relative to `directoryPath` itself (`./<basename>.js` for a
 * `.ts` module, `./<basename>.mjs` for a `.mts` one, matching what `tsc`
 * emits for a sibling source file) since a features directory is expected to
 * hold its modules flat, the same non-recursive assumption
 * `discoverFeatureModules` already makes. Does not read or change
 * `shell.ts`, and does not write anything to disk itself — a pure
 * string-in-string-out function, the same "prove it's mechanical first"
 * shape every primitive in this file started as before a real caller
 * depended on it.
 * @param {string} directoryPath
 * @returns {string}
 */
export function generateFeatureModulesIndexSource(directoryPath) {
  const modules = discoverFeatureModules(directoryPath);
  const basenames = modules.map(({ filePath }) => {
    const base = path.basename(filePath);
    return base.endsWith('.mts') ? base.slice(0, -4) : base.slice(0, -3);
  });
  const importLines = modules.map(({ filePath, functionNames }) => {
    const base = path.basename(filePath);
    const specifier = base.endsWith('.mts')
      ? `./${base.slice(0, -4)}.mjs`
      : `./${base.slice(0, -3)}.js`;
    return `import { ${functionNames.join(', ')} } from '${specifier}';`;
  });
  const allFunctionNames = modules.flatMap((featureModule) => featureModule.functionNames);
  // Every discovered module today exports exactly one assembler function
  // (verified against the real features/ directory — see
  // docs/epics/0002-shell-decomposition.md's REGISTRY DERIVATION VERDICT), so
  // functionNames[0] alone represents the whole module's output. A future
  // module exporting more than one would silently lose the rest here — but
  // chunks.test.ts's "three chunks together carry the same module text as
  // the old single bundle" check (which compares against
  // FEATURE_MODULE_FUNCTIONS, the complete flatMap above) already fails loud
  // in that case, so no extra guard is needed in this generator.
  const byBasenameLines = modules.map(
    ({ functionNames }, i) => `  '${basenames[i]}': ${functionNames[0]},`,
  );
  const lines = [
    // REUSE-IgnoreStart — these two lines are DATA (the header this function
    // writes into the generated barrel file), not a real header of THIS
    // source file; the reuse tool's naive text scan otherwise misreads the
    // string literal's trailing `',` as part of the SPDX license expression
    // ("Apache-2.0',", an invalid expression — reuse lint, CI job "reuse
    // lint (optional)", run 32005559138) and flags this file non-compliant.
    '// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND',
    '// SPDX-License-Identifier: Apache-2.0',
    // REUSE-IgnoreEnd
    '',
    '// AUTO-GENERATED — do not hand-edit. Regenerate with:',
    '//   node scripts/codemod/generate-splice-manifest.mjs --emit-index <features-dir>',
    ...importLines,
    '',
    "/** Every discovered feature module's assembler function, in directory order. */",
    `export const FEATURE_MODULE_FUNCTIONS: Array<() => string> = [${allFunctionNames.join(', ')}];`,
    '',
    "/** Every discovered feature module's assembled output, joined in directory order. */",
    'export function featureModulesJs(): string {',
    "  return FEATURE_MODULE_FUNCTIONS.map((fn) => fn()).join('\\n');",
    '}',
    '',
    "/** Every discovered feature module's assembler function, keyed by its file",
    " *  basename (no extension) — chunks.ts's FEATURE_JS_BY_NAME derives from",
    ' *  this instead of a hand-written import plus object literal entry per',
    ' *  module. */',
    'export const FEATURE_MODULE_FUNCTIONS_BY_BASENAME: Readonly<Record<string, () => string>> = {',
    ...byBasenameLines,
    '};',
    '',
  ];
  return lines.join('\n');
}

/**
 * Captures `functionName`'s single top-level `return \`...\`;` (optionally
 * `.trim()`-ed) template literal as ordered literal-text `segments` plus the
 * `slots` (source text + position) of every `${...}` substitution between
 * them — the "glue" half of the client-bundle assembly problem
 * `findSpliceManifest` doesn't cover (it only classifies WHAT a substitution
 * splices, not the literal text around it). `segments.length` is always
 * `slots.length + 1`; reassembling `segments[0] + resolve(slots[0]) +
 * segments[1] + ... + segments[n]` reproduces the function's real output
 * exactly (see `reassembleSegments` and the "captures the real assembly of
 * shell.ts's five bundle-composing functions" test) — the necessary other
 * half of PARALLEL UNLOCK B's "necessary precondition before a later cut can
 * have the client assembler walk a generated manifest directly instead of a
 * hand-written registry" (see generate-splice-manifest.mjs's own module
 * comment and docs/epics/0002-shell-decomposition.md).
 * @param {string} sourceText
 * @param {string} functionName
 * @param {string} [fileName]
 * @returns {AssemblySegments}
 */
export function captureAssemblySegments(sourceText, functionName, fileName = 'source.ts') {
  const sourceFile = parseSource(sourceText, fileName);

  /** @type {ts.TemplateExpression | null} */
  let templateExpr = null;
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName &&
      statement.body
    ) {
      templateExpr = topLevelReturnTemplate(statement.body, functionName);
    }
  }

  if (!templateExpr) {
    throw new Error(`${functionName}: no top-level template-literal return found`);
  }

  const segments = [templateExpr.head.text];
  /** @type {AssemblySlot[]} */
  const slots = [];
  for (const span of templateExpr.templateSpans) {
    slots.push({
      exprText: span.expression.getText(sourceFile),
      position: span.expression.getStart(sourceFile),
    });
    segments.push(span.literal.text);
  }
  return { segments, slots };
}

/**
 * Reassembles `captureAssemblySegments`' output given each slot's resolved
 * runtime value, in order — the inverse of the split, and the concrete proof
 * that `segments` + `slots` are sufficient to reconstruct the function's real
 * output without the hand-written interleaving.
 * @param {string[]} segments
 * @param {unknown[]} resolvedSlotValues
 * @returns {string}
 */
export function reassembleSegments(segments, resolvedSlotValues) {
  if (resolvedSlotValues.length !== segments.length - 1) {
    throw new Error(
      `expected ${segments.length - 1} resolved slot value(s), got ${resolvedSlotValues.length}`,
    );
  }
  let out = segments[0];
  for (let i = 0; i < resolvedSlotValues.length; i += 1) {
    out += String(resolvedSlotValues[i]) + segments[i + 1];
  }
  return out;
}

/**
 * Reads the literal value of a same-file top-level `const NAME = <literal>;`
 * declaration — a third source `clientJs()`'s assembler functions splice
 * directly (alongside relative-import splices and package-import values):
 * `fleetJs()`'s bare `${REFRESH_MS}` never goes through an import at all, so
 * `findSpliceManifest` (which only tracks relative-import bindings) cannot
 * resolve it. This reads the literal straight off the declaration's
 * initializer instead of hand-copying the value into a test.
 * @param {string} sourceText
 * @param {string} name
 * @param {string} [fileName]
 * @returns {string | number | boolean | undefined}
 */
export function localTopLevelConstLiteral(sourceText, name, fileName = 'source.ts') {
  const sourceFile = parseSource(sourceText, fileName);
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue;
      const init = decl.initializer;
      if (!init) return undefined;
      if (ts.isNumericLiteral(init)) return Number(init.text);
      if (ts.isStringLiteral(init)) return init.text;
      if (init.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (init.kind === ts.SyntaxKind.FalseKeyword) return false;
      return undefined;
    }
  }
  return undefined;
}

/**
 * Dynamically imports each manifest entry's real module and resolves its
 * exported binding, deduped by module+export — the on-disk-resolution half
 * `assembleFunctionFromManifest` needs before it can reconstruct real output,
 * factored out of what every "resolve the real binding" assertion in
 * generate-splice-manifest.test.ts used to duplicate as a local helper.
 * @param {{modulePath: string, exportedName: string}[]} entries
 * @param {string} baseDir - resolves each entry's modulePath relative to this
 * @returns {Promise<Map<string, unknown>>} keyed by `${modulePath}#${exportedName}`
 */
export async function resolveManifestBindings(entries, baseDir) {
  const resolved = new Map();
  for (const entry of entries) {
    const key = `${entry.modulePath}#${entry.exportedName}`;
    if (resolved.has(key)) continue;
    const moduleUrl = pathToFileURL(path.resolve(baseDir, entry.modulePath)).href;
    const mod = await import(moduleUrl);
    resolved.set(key, mod[entry.exportedName]);
  }
  return resolved;
}

/**
 * The reconstruction core shared by `assembleFunctionFromManifest` (works
 * from raw source, re-deriving segments/slots/entries via the AST each call)
 * and `assembleFromManifest` (works from an already-built `AssemblyManifest`,
 * no source or AST needed): given one function's captured glue segments,
 * ITS OWN splice entries, resolved bindings, and a resolver for the rare
 * non-splice slot, walk each slot in order and reassemble the real output.
 * @param {AssemblySegments} segmentsAndSlots
 * @param {SpliceEntry[]} spliceEntriesForFunction
 * @param {Map<string, unknown>} resolvedBindings
 * @param {(exprText: string) => unknown | Promise<unknown>} resolveOtherSlot
 * @returns {Promise<string>}
 */
async function assembleFromSegments(
  { segments, slots },
  spliceEntriesForFunction,
  resolvedBindings,
  resolveOtherSlot,
) {
  const spliceByPosition = new Map(spliceEntriesForFunction.map((e) => [e.position, e]));

  /** @type {unknown[]} */
  const resolvedSlotValues = [];
  for (const slot of slots) {
    const entry = spliceByPosition.get(slot.position);
    if (entry) {
      const value = resolvedBindings.get(`${entry.modulePath}#${entry.exportedName}`);
      resolvedSlotValues.push(
        entry.kind === 'jsonStringify'
          ? JSON.stringify(value)
          : entry.kind === 'jsonStringifySpread'
            ? JSON.stringify([...value])
            : String(value),
      );
      continue;
    }
    resolvedSlotValues.push(await resolveOtherSlot(slot.exprText));
  }

  return reassembleSegments(segments, resolvedSlotValues);
}

/**
 * Composes `findSpliceManifest` + `captureAssemblySegments` +
 * `reassembleSegments` into the single operation a future auto-discovery
 * assembler needs: given `functionName`'s source, resolved splice bindings
 * (e.g. `resolveManifestBindings`'s output), and a caller-supplied resolver
 * for the rare non-splice slot (a same-file local const, a package import —
 * see `localTopLevelConstLiteral`), reconstruct the function's real
 * assembled output directly from the manifest and glue text, with no
 * hand-written interleaving. This is the composed operation
 * generate-splice-manifest.test.ts's "reconstructing shell.ts's five
 * bundle-composing functions" suite used to re-derive by hand for every
 * function under test; it now exists once, as the thing a later build-time
 * or runtime assembler would actually call — `shell.ts`/`clientJs()` remain
 * untouched, zero behavior change (see
 * docs/epics/0002-shell-decomposition.md's PARALLEL UNLOCK B).
 * @param {string} sourceText
 * @param {string} functionName
 * @param {Map<string, unknown>} resolvedBindings
 * @param {(exprText: string) => unknown | Promise<unknown>} [resolveOtherSlot]
 * @param {string} [fileName]
 * @returns {Promise<string>}
 */
export async function assembleFunctionFromManifest(
  sourceText,
  functionName,
  resolvedBindings,
  resolveOtherSlot = (exprText) => {
    throw new Error(`${functionName}: no resolution for non-splice slot \`${exprText}\``);
  },
  fileName = 'source.ts',
) {
  const segmentsAndSlots = captureAssemblySegments(sourceText, functionName, fileName);
  const spliceEntries = findSpliceManifest(sourceText, fileName).filter(
    (e) => e.enclosingFunction === functionName,
  );
  return assembleFromSegments(segmentsAndSlots, spliceEntries, resolvedBindings, resolveOtherSlot);
}

/**
 * The manifest-native counterpart to `assembleFunctionFromManifest`: given an
 * already-built `AssemblyManifest` (`buildAssemblyManifest`'s output, exactly
 * as it would be read back from a written-to-disk JSON file) instead of raw
 * source text, reconstructs `functionName`'s real output. This is the
 * operation an actual runtime or build-time auto-discovery assembler needs —
 * it has the generated manifest available, not shell.ts's TypeScript source
 * or a fresh AST parse per call (see
 * docs/epics/0002-shell-decomposition.md's PARALLEL UNLOCK B).
 * @param {AssemblyManifest} manifest
 * @param {string} functionName
 * @param {Map<string, unknown>} resolvedBindings
 * @param {(exprText: string) => unknown | Promise<unknown>} [resolveOtherSlot]
 * @returns {Promise<string>}
 */
export async function assembleFromManifest(
  manifest,
  functionName,
  resolvedBindings,
  resolveOtherSlot = (exprText) => {
    throw new Error(`${functionName}: no resolution for non-splice slot \`${exprText}\``);
  },
) {
  const segmentsAndSlots = manifest.functions[functionName];
  if (!segmentsAndSlots) {
    throw new Error(`${functionName}: no captured glue segments in this manifest`);
  }
  const spliceEntries = manifest.entries.filter((e) => e.enclosingFunction === functionName);
  return assembleFromSegments(segmentsAndSlots, spliceEntries, resolvedBindings, resolveOtherSlot);
}

/**
 * Writes `content` to `outputFile`, reporting a clean stderr message and
 * exiting 1 (rather than a raw stack trace) if the path can't be written —
 * e.g. its parent directory doesn't exist. Returns `false` after exiting so a
 * caller can `if (!writeFileOrExit(...)) return;` without its own try/catch;
 * shared by every branch of `main()` below.
 * @param {string} outputFile
 * @param {string} content
 * @returns {boolean}
 */
function writeFileOrExit(outputFile, content) {
  try {
    writeFileSync(outputFile, content, 'utf8');
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`cannot write output file: ${outputFile} (${reason})`);
    process.exit(1);
    return false;
  }
}

/**
 * @param {string} outputFile
 * @param {unknown} manifest
 * @returns {boolean}
 */
function writeManifestOrExit(outputFile, manifest) {
  return writeFileOrExit(outputFile, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * `--emit-index <features-dir> [output-file]`: writes
 * `generateFeatureModulesIndexSource`'s barrel source to disk — the CLI
 * wiring PARALLEL UNLOCK B's own doc comment already names
 * (generate-splice-manifest.mjs's `generateFeatureModulesIndexSource`) but
 * left as an explicit follow-on (see docs/epics/0002-shell-decomposition.md).
 * Defaults `output-file` to `<features-dir>/index.ts`, the barrel a later cut
 * can have `clientJs()` import instead of a hand-written registry entry per
 * feature module.
 * @param {string | undefined} directoryArg
 * @param {string | undefined} outputArg
 */
function runEmitIndex(directoryArg, outputArg) {
  if (!directoryArg) {
    console.error(
      'Usage: node scripts/codemod/generate-splice-manifest.mjs --emit-index <features-dir> [output-file]',
    );
    process.exit(1);
    return;
  }

  const directoryPath = path.resolve(directoryArg);
  let dirStat;
  try {
    dirStat = statSync(directoryPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`cannot read input directory: ${directoryPath} (${reason})`);
    process.exit(1);
    return;
  }
  if (!dirStat.isDirectory()) {
    console.error(`--emit-index requires a directory, got a file: ${directoryPath}`);
    process.exit(1);
    return;
  }

  const outputFile = path.resolve(outputArg ?? path.join(directoryPath, 'index.ts'));
  const source = generateFeatureModulesIndexSource(directoryPath);
  if (!writeFileOrExit(outputFile, source)) return;

  const moduleCount = discoverFeatureModules(directoryPath).length;
  console.log(
    `generate-splice-manifest OK: emitted a ${moduleCount} feature module barrel from ${directoryPath}; written to ${outputFile}`,
  );
}

function main() {
  const [, , inputArg, outputArg, extraArg] = process.argv;
  if (inputArg === '--emit-index') {
    runEmitIndex(outputArg, extraArg);
    return;
  }

  if (!inputArg) {
    console.error(
      'Usage: node scripts/codemod/generate-splice-manifest.mjs <input-file-or-directory> [output-file]',
    );
    process.exit(1);
    return;
  }

  const inputPath = path.resolve(inputArg);

  let inputStat;
  try {
    inputStat = statSync(inputPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`cannot read input file: ${inputPath} (${reason})`);
    process.exit(1);
    return;
  }

  if (inputStat.isDirectory()) {
    const outputFile = path.resolve(outputArg ?? `${inputPath}.feature-modules-manifest.json`);
    const manifest = buildFeatureModulesManifest(inputPath);
    if (!writeManifestOrExit(outputFile, manifest)) return;
    const totalFunctions = manifest.modules.reduce(
      (sum, featureModule) => sum + Object.keys(featureModule.functions).length,
      0,
    );
    console.log(
      `generate-splice-manifest OK: ${manifest.modules.length} feature module(s), ${totalFunctions} assembler function(s) discovered in ${inputPath}; written to ${outputFile}`,
    );
    return;
  }

  let source;
  try {
    source = readFileSync(inputPath, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`cannot read input file: ${inputPath} (${reason})`);
    process.exit(1);
    return;
  }
  const functionNames = discoverAssemblyFunctionNames(source, inputPath);
  const manifest = buildAssemblyManifest(source, inputPath, functionNames);

  const outputFile = path.resolve(outputArg ?? `${inputPath}.splice-manifest.json`);
  if (!writeManifestOrExit(outputFile, manifest)) return;
  console.log(
    `generate-splice-manifest OK: ${manifest.entries.length} splice site(s) across ${functionNames.length} assembler function(s) discovered in ${inputPath}; written to ${outputFile}`,
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
