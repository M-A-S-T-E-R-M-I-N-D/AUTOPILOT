// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach } from 'vitest';
import ts from 'typescript';
import prettier from 'prettier';
import {
  findSpliceManifest,
  buildSpliceManifest,
  buildAssemblyManifest,
  verifySpliceManifestAgainstOutput,
  allRelativeImportLocalNames,
  discoverAssemblyFunctionNames,
  discoverFeatureModules,
  buildFeatureModulesManifest,
  generateFeatureModulesIndexSource,
  captureAssemblySegments,
  reassembleSegments,
  localTopLevelConstLiteral,
  resolveManifestBindings,
  assembleFunctionFromManifest,
  assembleFromManifest,
} from '../../../../scripts/codemod/generate-splice-manifest.mjs';
import type {
  AssemblyManifest,
  FeatureModulesManifest,
} from '../../../../scripts/codemod/generate-splice-manifest.mjs';
import { clientJs, fleetJs, renderShell, assetVersion } from '../../src/web/shell.js';
import {
  FEATURE_JS_BY_NAME,
  PROJECT_PAGE_FEATURES,
  DEFERRED_OPERATOR_FEATURES,
} from '../../src/web/chunks.js';
import { switcherJs } from '../../src/web/features/switcher.js';
import { activityHeatmapJs } from '../../src/web/features/activity-heatmap.js';
import { activityJs } from '../../src/web/features/activity.js';
import { backlogJs } from '../../src/web/features/backlog.js';
import { connectJs } from '../../src/web/features/connect.js';
import { coordinationJs } from '../../src/web/features/coordination.js';
import { docsViewerJs } from '../../src/web/features/docs-viewer.js';
import { evolutionJs } from '../../src/web/features/evolution.js';
import { firingTimelineJs } from '../../src/web/features/firing-timeline.js';
import { flightConsoleJs } from '../../src/web/features/flight-console.js';
import { flightSummaryJs } from '../../src/web/features/flight-summary.js';
import { flyJs } from '../../src/web/features/fly.js';
import { issueTriageJs } from '../../src/web/features/issue-triage.js';
import { landingJs } from '../../src/web/features/landing.js';
import { localeDataJs } from '../../src/web/features/locale-data.js';
import { localeJs } from '../../src/web/features/locale.js';
import { metricsJs } from '../../src/web/features/metrics.js';
import { officeMapJs } from '../../src/web/features/office-map.js';
import { pipelineJs } from '../../src/web/features/pipeline.js';
import { poolClientJs } from '../../src/web/features/pool-client.js';
import { prReviewJs } from '../../src/web/features/pr-review.js';
import { processHealthJs } from '../../src/web/features/process-health.js';
import { publicityJs } from '../../src/web/features/publicity.js';
import { releaseJs } from '../../src/web/features/release.js';
import { reportCaptureClientJs } from '../../src/web/features/report-capture-client.js';
import { reportMenuJs } from '../../src/web/features/report-menu.js';
import { roundPanelJs } from '../../src/web/features/round-panel.js';
import { searchJs } from '../../src/web/features/search.js';
import { tourJs } from '../../src/web/features/tour.js';
import { PRELOAD_FONT_PATHS } from '../../src/assets/fonts.js';
import { themeButtons, langButtons, escapeAttr } from '../../src/web/shell-html.js';
import { gogglesMarkInlineSvg } from '../../src/assets/goggles-mark.js';

const SHELL_TS = fileURLToPath(new URL('../../src/web/shell.ts', import.meta.url));
const SHELL_DIR = path.dirname(SHELL_TS);
const FEATURES_DIR = path.join(SHELL_DIR, 'features');
const ACTIVITY_HEATMAP_TS = path.join(FEATURES_DIR, 'activity-heatmap.ts');
const ACTIVITY_TS = path.join(FEATURES_DIR, 'activity.ts');
const BACKLOG_TS = path.join(FEATURES_DIR, 'backlog.ts');
const SWITCHER_TS = path.join(FEATURES_DIR, 'switcher.ts');
const CONNECT_TS = path.join(FEATURES_DIR, 'connect.ts');
const COORDINATION_TS = path.join(FEATURES_DIR, 'coordination.ts');
const DOCS_VIEWER_TS = path.join(FEATURES_DIR, 'docs-viewer.ts');
const EVOLUTION_TS = path.join(FEATURES_DIR, 'evolution.ts');
const FIRING_TIMELINE_TS = path.join(FEATURES_DIR, 'firing-timeline.ts');
const FLIGHT_CONSOLE_TS = path.join(FEATURES_DIR, 'flight-console.ts');
const FLIGHT_SUMMARY_TS = path.join(FEATURES_DIR, 'flight-summary.ts');
const FLY_TS = path.join(FEATURES_DIR, 'fly.ts');
const ISSUE_TRIAGE_TS = path.join(FEATURES_DIR, 'issue-triage.ts');
const LANDING_TS = path.join(FEATURES_DIR, 'landing.ts');
const LOCALE_DATA_TS = path.join(FEATURES_DIR, 'locale-data.ts');
const LOCALE_TS = path.join(FEATURES_DIR, 'locale.ts');
const METRICS_TS = path.join(FEATURES_DIR, 'metrics.ts');
const NOTIFICATIONS_TS = path.join(FEATURES_DIR, 'notifications.ts');
const OFFICE_MAP_TS = path.join(FEATURES_DIR, 'office-map.ts');
const PIPELINE_TS = path.join(FEATURES_DIR, 'pipeline.ts');
const POOL_CLIENT_TS = path.join(FEATURES_DIR, 'pool-client.ts');
const PR_REVIEW_TS = path.join(FEATURES_DIR, 'pr-review.ts');
const PROCESS_HEALTH_TS = path.join(FEATURES_DIR, 'process-health.ts');
const PUBLICITY_TS = path.join(FEATURES_DIR, 'publicity.ts');
const RELEASE_TS = path.join(FEATURES_DIR, 'release.ts');
const REPORT_CAPTURE_CLIENT_TS = path.join(FEATURES_DIR, 'report-capture-client.ts');
const REPORT_MENU_TS = path.join(FEATURES_DIR, 'report-menu.ts');
const ROUND_PANEL_TS = path.join(FEATURES_DIR, 'round-panel.ts');
const SEARCH_TS = path.join(FEATURES_DIR, 'search.ts');
const TOUR_TS = path.join(FEATURES_DIR, 'tour.ts');

const FIXTURE = `import { helperA as sharedHelperA } from './helper-a.js';
import { CONST_B } from './const-b.js';
import { helperC } from './helper-c.js';
import { fmtDate } from '@autopilot/tokens';

export function featureOne(): string {
  const a = sharedHelperA.toString();
  const b = JSON.stringify(CONST_B);
  return a + b;
}

export function featureTwo(): string {
  return helperC.toString();
}
`;

describe('findSpliceManifest', () => {
  it('finds toString() splices tied to their relative-import binding', () => {
    const entries = findSpliceManifest(FIXTURE, 'fixture.ts');
    const helperA = entries.find((e) => e.localName === 'sharedHelperA');
    expect(helperA).toEqual({
      modulePath: './helper-a.js',
      exportedName: 'helperA',
      localName: 'sharedHelperA',
      kind: 'toString',
      enclosingFunction: 'featureOne',
      position: expect.any(Number),
    });
  });

  it('finds JSON.stringify(binding) splices', () => {
    const entries = findSpliceManifest(FIXTURE, 'fixture.ts');
    const constB = entries.find((e) => e.localName === 'CONST_B');
    expect(constB).toMatchObject({
      modulePath: './const-b.js',
      exportedName: 'CONST_B',
      kind: 'jsonStringify',
      enclosingFunction: 'featureOne',
    });
  });

  it('resolves the exported name through an import alias', () => {
    const entries = findSpliceManifest(FIXTURE, 'fixture.ts');
    const helperA = entries.find((e) => e.localName === 'sharedHelperA');
    expect(helperA?.exportedName).toBe('helperA');
  });

  it('attributes each splice to its enclosing top-level exported function', () => {
    const entries = findSpliceManifest(FIXTURE, 'fixture.ts');
    const helperC = entries.find((e) => e.localName === 'helperC');
    expect(helperC?.enclosingFunction).toBe('featureTwo');
  });

  it('attributes a splice with no enclosing top-level function to a null enclosingFunction', () => {
    // A splice call at the module's own top level, not inside any function
    // declaration at all — no real shell.ts splice takes this shape today,
    // but downstream consumers (assembleFunctionFromManifest/
    // assembleFromManifest filter entries by `enclosingFunction ===
    // functionName`) depend on this falling back to null rather than
    // throwing or misattributing to an unrelated function.
    const fixture = `import { helperA } from './helper-a.js';
export const compiled = helperA.toString();
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.enclosingFunction).toBeNull();
  });

  it('ignores package imports (non-relative specifiers)', () => {
    const fixture = `import { fmtDate } from '@autopilot/tokens';
export function f(): string {
  return \`\${fmtDate.toString()}\`;
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('ignores JSON.stringify() calls on bindings that are not relative imports', () => {
    const fixture = `export function f(payload: unknown): string {
  return JSON.stringify(payload);
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('orders entries by source position', () => {
    const entries = findSpliceManifest(FIXTURE, 'fixture.ts');
    const positions = entries.map((e) => e.position);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('returns an empty manifest for a file with no relative-import splices', () => {
    const entries = findSpliceManifest('export const A = 1;\n', 'fixture.ts');
    expect(entries).toEqual([]);
  });

  it('finds bare-identifier template-literal splices of relative-import constants', () => {
    // A third splice shape alongside .toString()/JSON.stringify(): a numeric
    // shared constant embedded directly as `${WIDTH}` rather than wrapped —
    // web/shell.ts's OFFICE_W/OFFICE_H/etc. use exactly this shape.
    const fixture = `import { WIDTH } from './dims.js';
export function f(): string {
  return \`var WIDTH = \${WIDTH};\`;
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    const width = entries.find((e) => e.localName === 'WIDTH');
    expect(width).toEqual({
      modulePath: './dims.js',
      exportedName: 'WIDTH',
      localName: 'WIDTH',
      kind: 'templateLiteral',
      enclosingFunction: 'f',
      position: expect.any(Number),
    });
  });

  it('does not mistake a property access or a non-import identifier in a template literal for a splice', () => {
    const fixture = `import { WIDTH } from './dims.js';
export function f(rows: { length: number }): string {
  return \`\${rows.length} of \${WIDTH}\`;
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.localName).toBe('WIDTH');
  });

  it('finds JSON.stringify([...binding]) spread splices of relative-import Sets', () => {
    // A fourth splice shape alongside .toString()/JSON.stringify(ident)/
    // template-literal: a shared ReadonlySet re-serialized as a plain array
    // via `[...binding]` before JSON.stringify() — web/shell.ts's
    // SUBAGENT_TOOLS (`new Set(${JSON.stringify([...SUBAGENT_TOOLS])})`)
    // uses exactly this shape and JSON.stringify(CONST_B) (a bare-identifier
    // argument) does not match it.
    const fixture = `import { TOOLS } from './tools.js';
export function f(): string {
  return \`var TOOLS = new Set(\${JSON.stringify([...TOOLS])});\`;
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    const tools = entries.find((e) => e.localName === 'TOOLS');
    expect(tools).toEqual({
      modulePath: './tools.js',
      exportedName: 'TOOLS',
      localName: 'TOOLS',
      kind: 'jsonStringifySpread',
      enclosingFunction: 'f',
      position: expect.any(Number),
    });
  });

  it('does not mistake a multi-element or non-spread array literal for a spread splice', () => {
    const fixture = `import { TOOLS } from './tools.js';
export function f(other: string): string {
  return JSON.stringify([TOOLS, other]);
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a same-named function parameter for the module-level import it shadows (toString shape)', () => {
    // findSpliceManifest matches identifiers by name only, with no scope
    // resolution — a nested helper whose own parameter happens to share an
    // import's local name would otherwise be misattributed as a splice of
    // the import, even though the parameter shadows it and this identifier
    // never actually resolves to the import.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(sharedHelperA: string): string {
    return sharedHelperA.toString();
  }
  return helper('local value');
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a same-named function parameter for the module-level import it shadows (template-literal shape)', () => {
    const fixture = `import { WIDTH } from './dims.js';
export function f(): string {
  function helper(WIDTH: number): string {
    return \`local width \${WIDTH}\`;
  }
  return helper(1);
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a same-named local const declaration for the module-level import it shadows (toString shape)', () => {
    // The same false-positive class as the parameter case above, but for a
    // local `let`/`const` declaration shadowing the import instead of a
    // function parameter — the "narrower, rarer follow-on" isShadowedByParameter's
    // own doc comment had left open.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(): string {
    const sharedHelperA = computeLocal();
    return sharedHelperA.toString();
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a same-named local let declaration for the module-level import it shadows (template-literal shape)', () => {
    const fixture = `import { WIDTH } from './dims.js';
export function f(): string {
  function helper(): string {
    let WIDTH = 42;
    return \`local width \${WIDTH}\`;
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('still splices an import whose local const shadow lives in a sibling block, not an enclosing one', () => {
    // A local declaration in a *different* block (not an ancestor of the
    // usage site) must not suppress the splice — only a declaration that
    // actually scopes over the identifier counts as shadowing.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  if (Math.random() > 2) {
    const sharedHelperA = 'unrelated';
    return sharedHelperA;
  }
  return sharedHelperA.toString();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ localName: 'sharedHelperA', kind: 'toString' });
  });

  it('does not mistake a destructured function parameter for the module-level import it shadows', () => {
    // isShadowedByLocalBinding only checked ts.isIdentifier(param.name) — a
    // destructured parameter's binding name is an ObjectBindingPattern (or
    // ArrayBindingPattern), not an Identifier, so this shadow went
    // undetected entirely, the same false-positive class the plain-parameter
    // and local-const fixes above already closed for their own shapes.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper({ sharedHelperA }: { sharedHelperA: string }): string {
    return sharedHelperA.toString();
  }
  return helper({ sharedHelperA: 'local value' });
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a destructured local const declaration for the module-level import it shadows', () => {
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(): string {
    const { sharedHelperA } = computeLocal();
    return sharedHelperA.toString();
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a catch-clause binding for the module-level import it shadows', () => {
    // isShadowedByLocalBinding only ever walked function parameters and
    // block-level let/const statements — a catch clause introduces its own
    // scoped binding (`ts.CatchClause.variableDeclaration`) that is neither,
    // so `catch (sharedHelperA) { ... }` went undetected entirely, the same
    // false-positive class the parameter/local-const/destructured fixes
    // above already closed for their own shapes.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(): string {
    try {
      return riskyCall();
    } catch (sharedHelperA) {
      return sharedHelperA.toString();
    }
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a for-of loop variable for the module-level import it shadows', () => {
    // isShadowedByLocalBinding only ever walked function parameters,
    // block-level let/const statements, and catch-clause bindings — a
    // for-of loop's own declaration list sits directly on the
    // ForOfStatement, not wrapped in a VariableStatement inside a Block, so
    // `for (const sharedHelperA of items) { ... }` went undetected
    // entirely, the same false-positive class the parameter/local-const/
    // destructured/catch-clause fixes above already closed for their own
    // shapes.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(items: string[]): string {
    for (const sharedHelperA of items) {
      return sharedHelperA.toString();
    }
    return '';
  }
  return helper(['a']);
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a for-in loop variable for the module-level import it shadows', () => {
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(obj: Record<string, string>): string {
    for (const sharedHelperA in obj) {
      return sharedHelperA.toString();
    }
    return '';
  }
  return helper({ a: 'b' });
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a plain for loop variable for the module-level import it shadows', () => {
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(): string {
    for (let sharedHelperA = 0; sharedHelperA < 1; sharedHelperA += 1) {
      return sharedHelperA.toString();
    }
    return '';
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a destructured for-of loop variable for the module-level import it shadows', () => {
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(items: Array<{ sharedHelperA: string }>): string {
    for (const { sharedHelperA } of items) {
      return sharedHelperA.toString();
    }
    return '';
  }
  return helper([{ sharedHelperA: 'a' }]);
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('still splices an import whose for-of loop variable lives in a sibling block, not an enclosing one', () => {
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  if (Math.random() > 2) {
    for (const sharedHelperA of ['unrelated']) {
      return sharedHelperA;
    }
  }
  return sharedHelperA.toString();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ localName: 'sharedHelperA', kind: 'toString' });
  });

  it('does not mistake a same-named local function declaration for the module-level import it shadows', () => {
    // isShadowedByLocalBinding's block-scoped check only recognized
    // VariableStatement (let/const) — a local function declaration
    // introduces its own block-scoped binding the same way, so
    // `function sharedHelperA() {...}` inside an enclosing block went
    // undetected entirely, the same false-positive class the parameter/
    // local-const/destructured/catch-clause/loop fixes above already closed
    // for their own shapes.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(): string {
    function sharedHelperA(): string {
      return 'local';
    }
    return sharedHelperA.toString();
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('does not mistake a same-named local class declaration for the module-level import it shadows', () => {
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  function helper(): string {
    class sharedHelperA {
      static toString(): string {
        return 'local';
      }
    }
    return sharedHelperA.toString();
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('still splices an import whose local function declaration shadow lives in a sibling block, not an enclosing one', () => {
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(): string {
  if (Math.random() > 2) {
    function sharedHelperA(): string {
      return 'unrelated';
    }
    return sharedHelperA();
  }
  return sharedHelperA.toString();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ localName: 'sharedHelperA', kind: 'toString' });
  });

  it('does not mistake a same-named switch-case declaration for the module-level import it shadows', () => {
    // isShadowedByLocalBinding only ever walked a Block's own statements —
    // a switch statement's case/default clauses hold their own statements
    // directly on the CaseClause/DefaultClause node, never wrapped in a
    // Block, yet the ECMAScript spec gives every clause of one switch
    // statement a single shared lexical scope (13.12.11's
    // BlockDeclarationInstantiation runs over all clauses combined), so a
    // `const`/`let` declared in one case shadows the import across the
    // entire switch, including earlier/later cases. `case 1: const
    // sharedHelperA = 5; return sharedHelperA.toString();` went undetected
    // entirely, the same false-positive class the parameter/local-const/
    // destructured/catch-clause/loop/local-declaration fixes above already
    // closed for their own shapes.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(x: number): string {
  function helper(): string {
    switch (x) {
      case 1:
        const sharedHelperA = 5;
        return sharedHelperA.toString();
      default:
        return '';
    }
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('still splices an import whose switch-case declaration shadow lives in a sibling switch, not an enclosing one', () => {
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(x: number): string {
  switch (x) {
    case 1:
      const sharedHelperA = 5;
      return String(sharedHelperA);
  }
  return sharedHelperA.toString();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ localName: 'sharedHelperA', kind: 'toString' });
  });

  it('does not mistake a var declaration hoisted out of a nested block for the module-level import it shadows', () => {
    // Every binding-site fix above (parameter/local-const/destructured/
    // catch/loop/local-function-or-class/switch-case) checked whether a
    // declaration textually scopes over the identifier by walking enclosing
    // Blocks/CaseBlocks and matching each one's OWN statements — correct for
    // `let`/`const`, which are genuinely block-scoped. `var` is not: it hoists
    // to the nearest enclosing function (or the top level) regardless of how
    // deeply nested the declaration is, so `if (x) { var sharedHelperA = 1; }
    // return sharedHelperA.toString();` shadows the import for the whole
    // function even though the `var` sits in a sibling block the identifier
    // never descends from — the same false-positive class every fix above
    // already closed for its own shape, just via hoisting instead of block
    // scoping.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(x: number): string {
  function helper(): string {
    if (x > 0) {
      var sharedHelperA = 'unrelated';
      return sharedHelperA;
    }
    return sharedHelperA.toString();
  }
  return helper();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(0);
  });

  it('still splices an import whose var shadow lives in a nested function, not the enclosing one', () => {
    // A `var` declared inside a *nested* function hoists only to that
    // function's own scope, never out to an enclosing one — the mirror image
    // of the sibling-block/sibling-switch negative cases above, proving the
    // hoisting fix doesn't overreach past real function boundaries.
    const fixture = `import { sharedHelperA } from './helper-a.js';
export function featureOne(x: number): string {
  function helper(): string {
    if (x > 0) {
      var sharedHelperA = 'unrelated';
      return sharedHelperA;
    }
    return '';
  }
  helper();
  return sharedHelperA.toString();
}
`;
    const entries = findSpliceManifest(fixture, 'fixture.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ localName: 'sharedHelperA', kind: 'toString' });
  });
});

describe('buildSpliceManifest', () => {
  it('wraps findSpliceManifest with the source file path', () => {
    const manifest = buildSpliceManifest(FIXTURE, 'fixture.ts');
    expect(manifest.sourceFile).toBe('fixture.ts');
    expect(manifest.entries.length).toBeGreaterThan(0);
  });
});

describe('discovering the real web/shell.ts splice registry', () => {
  const original = readFileSync(SHELL_TS, 'utf8');
  const manifest = buildSpliceManifest(original, SHELL_TS);

  it('discovers a substantial number of splice sites', () => {
    // web/shell.ts's clientJs() assembler currently splices dozens of
    // extracted web/*.ts and shared/*.ts modules in by hand (see
    // docs/epics/0002-shell-decomposition.md) — this floor guards against the
    // detector silently regressing to near-zero if shell.ts's import/splice
    // shape ever changes underneath it.
    expect(manifest.entries.length).toBeGreaterThan(100);
  });

  it('resolves every discovered module path to a real file on disk', () => {
    for (const entry of manifest.entries) {
      const resolved = path.resolve(SHELL_DIR, entry.modulePath.replace(/\.js$/, '.ts'));
      expect(existsSync(resolved), `${entry.modulePath} -> ${resolved}`).toBe(true);
    }
  });

  it("attributes every splice site to one of shell.ts's known top-level functions", () => {
    // switcherJs/connectJs/flyJs/searchJs moved out to web/features/
    // (switcher.ts carries no relative-import splices of its own;
    // connectJs's three, flyJs's eight, and searchJs's twelve splices now
    // resolve relative to their own web/features/ files instead — see the
    // "discoverFeatureModules against the real src/web/features directory"
    // suite below) — none is a real member of this set anymore.
    const KNOWN_FUNCTIONS = new Set(['fleetJs']);
    for (const entry of manifest.entries) {
      expect(entry.enclosingFunction, JSON.stringify(entry)).not.toBeNull();
      expect(KNOWN_FUNCTIONS.has(entry.enclosingFunction as string), JSON.stringify(entry)).toBe(
        true,
      );
    }
  });

  it('never discovers the same module export spliced in twice', () => {
    const seen = new Set<string>();
    for (const entry of manifest.entries) {
      const key = `${entry.modulePath}#${entry.exportedName}`;
      expect(seen.has(key), `duplicate splice: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("discovers OFFICE_TIPS as the only web/office-map.ts splice left in shell.ts's own registry — its numeric constants (OFFICE_W/OFFICE_H/OFFICE_ANIM_MS/OFFICE_SATELLITE_ORBIT/etc.) moved to web/features/office-map.ts's own splice registry with officeMapSection/officeSatellites/prefersReducedMotion (SHELL HUB RELIEF, web-mt69bego-etc8te)", () => {
    const officeConstants = manifest.entries.filter((e) => e.modulePath === './office-map.js');
    expect(officeConstants.map((e) => e.localName)).toEqual(['OFFICE_TIPS']);
    expect(officeConstants[0]!.kind).toBe('jsonStringify');
  });

  it('discovers SUBAGENT_TOOLS, spliced as `JSON.stringify([...SUBAGENT_TOOLS])` rather than a bare-identifier JSON.stringify()', () => {
    const subagentTools = manifest.entries.find((e) => e.localName === 'SUBAGENT_TOOLS');
    expect(subagentTools).toMatchObject({
      modulePath: '../shared/live-firing.js',
      exportedName: 'SUBAGENT_TOOLS',
      kind: 'jsonStringifySpread',
    });
  });
});

describe('discoverAssemblyFunctionNames', () => {
  const DISCOVERY_FIXTURE = `export function assembler(): string {
  return \`head-\${1}-tail\`;
}

export function trimmedAssembler(): string {
  return \`head-\${1}-tail\`.trim();
}

export function plainReturn(): string {
  return 'not a template literal';
}

export function noSubstitutions(): string {
  return \`static text, no interpolation\`;
}

function outer(): string {
  function inner(): string {
    return \`nested-\${1}\`;
  }
  return inner();
}
`;

  it('discovers a top-level function whose top-level return is a template literal', () => {
    expect(discoverAssemblyFunctionNames(DISCOVERY_FIXTURE, 'fixture.ts')).toContain('assembler');
  });

  it('discovers a top-level function whose template-literal return is wrapped in .trim()', () => {
    expect(discoverAssemblyFunctionNames(DISCOVERY_FIXTURE, 'fixture.ts')).toContain(
      'trimmedAssembler',
    );
  });

  it('excludes a function that does not return a template literal at all', () => {
    expect(discoverAssemblyFunctionNames(DISCOVERY_FIXTURE, 'fixture.ts')).not.toContain(
      'plainReturn',
    );
  });

  it('excludes a function whose template literal has no `${...}` substitutions (a NoSubstitutionTemplateLiteral, not a TemplateExpression)', () => {
    expect(discoverAssemblyFunctionNames(DISCOVERY_FIXTURE, 'fixture.ts')).not.toContain(
      'noSubstitutions',
    );
  });

  it('does not attribute a nested function’s own template-literal return to its enclosing top-level function', () => {
    expect(discoverAssemblyFunctionNames(DISCOVERY_FIXTURE, 'fixture.ts')).not.toContain('outer');
    expect(discoverAssemblyFunctionNames(DISCOVERY_FIXTURE, 'fixture.ts')).not.toContain('inner');
  });

  it('excludes (rather than crashes discovery for) a function with more than one top-level template-literal return, and still finds the rest of the file', () => {
    // topLevelReturnTemplate throws when a function has two top-level
    // template-literal returns (see captureAssemblySegments's own coverage of
    // that error below) — a function shaped like this is simply not
    // assembler-shaped and should be excluded, the same as `plainReturn`/
    // `noSubstitutions` above. Before this test, discoverAssemblyFunctionNames
    // let that throw propagate uncaught: one unrelated multi-branch function
    // anywhere in a scanned file would abort discovery of every function
    // after it, not just skip the offending one.
    const fixture = `export function twoReturns(flag: boolean): string {
  if (flag) {
    return \`a-\${1}\`;
  }
  return \`b-\${2}\`;
}

export function assembler(): string {
  return \`head-\${1}-tail\`;
}
`;
    const discovered = discoverAssemblyFunctionNames(fixture, 'fixture.ts');
    expect(discovered).not.toContain('twoReturns');
    expect(discovered).toContain('assembler');
  });

  it("does not mistake a nested class getter/setter/constructor's own template-literal return for a second top-level one", () => {
    // topLevelReturnTemplate already skips descending into a nested
    // FunctionDeclaration/FunctionExpression/ArrowFunction/MethodDeclaration's
    // own return statements — a class's GetAccessorDeclaration/
    // SetAccessorDeclaration/ConstructorDeclaration are the same kind of
    // nested scope but were missing from that skip list, so a class defined
    // inside an otherwise assembler-shaped function whose accessor/
    // constructor also returns a template literal with a substitution would
    // falsely trip the "more than one top-level template-literal return"
    // guard and get silently excluded from discovery.
    const fixture = `export function assembler(): string {
  class Widget {
    get label() {
      return \`nested-get-\${1}\`;
    }
    set label(v: string) {
      return \`nested-set-\${v}\`;
    }
    constructor() {
      return \`nested-ctor-\${2}\`;
    }
  }
  return \`right-\${3}\`;
}
`;
    const discovered = discoverAssemblyFunctionNames(fixture, 'fixture.ts');
    expect(discovered).toContain('assembler');
  });

  it('every discovered function is successfully captured by captureAssemblySegments — discovery and capture never disagree', () => {
    for (const name of discoverAssemblyFunctionNames(DISCOVERY_FIXTURE, 'fixture.ts')) {
      expect(() => captureAssemblySegments(DISCOVERY_FIXTURE, name, 'fixture.ts')).not.toThrow();
    }
  });

  it('discovers every assembler-shaped top-level function in the real web/shell.ts', () => {
    // Locks in the real set so a future addition/removal of an
    // assembler-shaped function in shell.ts is a deliberate, visible change
    // rather than a silent shift in what the CLI's generated manifest
    // covers — the same "never silently undercounts" guard this file's other
    // real-shell.ts regression tests already enforce for the splice registry.
    // switcherJs/connectJs/flyJs/searchJs no longer appear here — they moved
    // to web/features/switcher.ts, web/features/connect.ts,
    // web/features/fly.ts, and web/features/search.ts (epic 0002's first
    // four real extractions); shell.ts still calls all four, just via an
    // import instead of a local declaration.
    const original = readFileSync(SHELL_TS, 'utf8');
    const discovered = discoverAssemblyFunctionNames(original, SHELL_TS);
    expect(discovered).toEqual(['fleetJs', 'clientJs', 'coreClientJs', 'renderShell']);
  });

  it('every function discovered in the real shell.ts is captured by captureAssemblySegments without throwing', () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    for (const name of discoverAssemblyFunctionNames(original, SHELL_TS)) {
      expect(() => captureAssemblySegments(original, name, SHELL_TS), name).not.toThrow();
    }
  });

  it('feeds buildAssemblyManifest a complete function list with no hand-maintained names, capturing glue segments for every one of them', () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    const functionNames = discoverAssemblyFunctionNames(original, SHELL_TS);
    const manifest = buildAssemblyManifest(original, SHELL_TS, functionNames);
    expect(Object.keys(manifest.functions).sort()).toEqual([...functionNames].sort());
  });
});

describe('discoverFeatureModules', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('discovers assembler-shaped functions across every file in a directory, sorted by file name', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'zebra.ts'),
      `export function zebraJs(): string {\n  return \`z-\${1}\`;\n}\n`,
      'utf8',
    );
    writeFileSync(
      path.join(dir, 'alpha.ts'),
      `export function alphaJs(): string {\n  return \`a-\${1}\`;\n}\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules.map((m) => path.basename(m.filePath))).toEqual(['alpha.ts', 'zebra.ts']);
    expect(modules.map((m) => m.functionNames)).toEqual([['alphaJs'], ['zebraJs']]);
  });

  it('reports every assembler-shaped function a single file exports, not just the first', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'multi.ts'),
      `export function firstJs(): string {\n  return \`first-\${1}\`;\n}\n\nexport function secondJs(): string {\n  return \`second-\${2}\`;\n}\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules).toHaveLength(1);
    expect(modules[0]!.functionNames).toEqual(['firstJs', 'secondJs']);
  });

  it('omits a file with no assembler-shaped function at all', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'not-a-feature.ts'),
      `export function helper(): number {\n  return 1;\n}\n`,
      'utf8',
    );

    expect(discoverFeatureModules(dir)).toEqual([]);
  });

  it('ignores declaration files and non-TypeScript files', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'types.d.ts'),
      `export function fakeJs(): string;\n`, // not a real body — would throw if parsed as a function decl
      'utf8',
    );
    writeFileSync(path.join(dir, 'notes.md'), '# not typescript\n', 'utf8');
    writeFileSync(
      path.join(dir, 'real.ts'),
      `export function realJs(): string {\n  return \`real-\${1}\`;\n}\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules.map((m) => path.basename(m.filePath))).toEqual(['real.ts']);
  });

  it('ignores .d.mts declaration files, not just .d.ts ones', () => {
    // The exclusion only ever checked `entry.name.endsWith('.d.ts')`, but the
    // inclusion filter explicitly scans `.mts` files too — 'types.d.mts'.endsWith('.d.ts')
    // is false, so a .mts declaration file slipped past the exclusion meant for
    // it, the same "excludes less than its own doc comment promises" gap this
    // detector's sibling checks have already closed for other shapes.
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'types.d.mts'),
      `export function fakeJs(): string {\n  return \`fake-\${1}\`;\n}\n`,
      'utf8',
    );
    writeFileSync(
      path.join(dir, 'real.ts'),
      `export function realJs(): string {\n  return \`real-\${1}\`;\n}\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules.map((m) => path.basename(m.filePath))).toEqual(['real.ts']);
  });

  it('returns an empty list for a directory with no source files', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    expect(discoverFeatureModules(dir)).toEqual([]);
  });

  it('omits an assembler-shaped function that is not exported, even alongside one that is', () => {
    // discoverAssemblyFunctionNames only checks shape (a top-level
    // template-literal return), not export status — correct for its own
    // contract, since shell.ts's local functions are called by name in the
    // same file regardless of export. But this function's own doc comment
    // promises to report which files "export at least one" assembler-shaped
    // function: a future assembler can only `import` an exported binding, so
    // a non-exported match must not be reported as an importable feature.
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'mixed.ts'),
      `function privateJs(): string {\n  return \`p-\${1}\`;\n}\n\nexport function publicJs(): string {\n  return \`q-\${1}\`;\n}\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules).toHaveLength(1);
    expect(modules[0]!.functionNames).toEqual(['publicJs']);
  });

  it('omits a file whose only assembler-shaped function is not exported', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'private-only.ts'),
      `function privateJs(): string {\n  return \`p-\${1}\`;\n}\n`,
      'utf8',
    );

    expect(discoverFeatureModules(dir)).toEqual([]);
  });

  it('recognizes a function exported via a standalone `export { name };` statement, not just inline `export function`', () => {
    // exportedFunctionNames only checked for an Export modifier on the
    // FunctionDeclaration node itself via ts.getCombinedModifierFlags — a
    // function declared without `export` and exported later via a separate
    // `export { name };` statement (a real, if less common, TypeScript export
    // shape) carries no such modifier, so it was reported as non-exported and
    // silently dropped even though a future assembler could import it just
    // fine — the same "excludes less than it delivers" undercounting bug
    // class this detector's other checks have already closed for `.d.mts`
    // files and non-exported functions.
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'reexported.ts'),
      `function switcherJs(): string {\n  return \`s-\${1}\`;\n}\n\nexport { switcherJs };\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules).toHaveLength(1);
    expect(modules[0]!.functionNames).toEqual(['switcherJs']);
  });

  it('resolves the local declared name (not the external alias) for an aliased `export { name as alias };` statement', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'aliased.ts'),
      `function fleetJs(): string {\n  return \`f-\${1}\`;\n}\n\nexport { fleetJs as renderFleet };\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules).toHaveLength(1);
    expect(modules[0]!.functionNames).toEqual(['fleetJs']);
  });

  it('recognizes a function exported via a standalone `export default name;` statement, not just inline `export function`/`export { name }`', () => {
    // A function declared without `export` and exported later via
    // `export default name;` parses as an ExportAssignment node, not an
    // ExportDeclaration — a genuinely different AST shape from the standalone
    // `export { name };` case fixed above, so that fix's NamedExports walk
    // never sees it, and the FunctionDeclaration itself carries no Export
    // modifier either. It fell through both checks and was silently reported
    // as non-exported even though a future assembler could `import` it as the
    // module's default binding — the same "excludes less than it delivers"
    // undercounting bug class every export-shape fix in this file has closed.
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'default-export.ts'),
      `function connectJs(): string {\n  return \`c-\${1}\`;\n}\n\nexport default connectJs;\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules).toHaveLength(1);
    expect(modules[0]!.functionNames).toEqual(['connectJs']);
  });

  it('does not treat a re-export from another module as a local declaration', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'reexport-only.ts'),
      `export { helperJs } from './other.js';\n`,
      'utf8',
    );

    expect(discoverFeatureModules(dir)).toEqual([]);
  });

  it('does not treat a standalone `export type { name };` statement as exporting a runtime binding', () => {
    // A type-only export statement is elided entirely at compile time — the
    // emitted JS carries no runtime export named `switcherJs` at all, so
    // `import { switcherJs } from './typeonly.ts'` would resolve to
    // `undefined`. exportedFunctionNames' NamedExports walk didn't check
    // `statement.isTypeOnly`, so it counted this the same as a real
    // `export { switcherJs };` — a false positive reporting a function as an
    // importable feature module when no future assembler could actually
    // import it, the mirror image of the "excludes less than it delivers"
    // bug class this detector's other checks have already closed.
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'typeonly.ts'),
      `function switcherJs(): string {\n  return \`s-\${1}\`;\n}\n\nexport type { switcherJs };\n`,
      'utf8',
    );

    expect(discoverFeatureModules(dir)).toEqual([]);
  });

  it('does not treat a per-specifier `export { type name };` as exporting a runtime binding, even alongside a real value export in the same statement', () => {
    // A per-specifier `type` modifier (isolatedModules-safe combined export
    // syntax) is just as elided at compile time as a whole-statement
    // `export type { ... }` — `switcherJs` here carries no runtime export
    // either, but the NamedExports walk added it to the set regardless of the
    // specifier's own `isTypeOnly` flag, the same false-positive bug one
    // level down.
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'mixed-type-and-value.ts'),
      `function switcherJs(): string {\n  return \`s-\${1}\`;\n}\nfunction fleetJs(): string {\n  return \`f-\${1}\`;\n}\n\nexport { type switcherJs, fleetJs };\n`,
      'utf8',
    );

    const modules = discoverFeatureModules(dir);

    expect(modules).toHaveLength(1);
    expect(modules[0]!.functionNames).toEqual(['fleetJs']);
  });
});

describe('buildFeatureModulesManifest', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('builds a per-file AssemblyManifest for every discovered module, in discovery order, with real splice entries captured', () => {
    // discoverFeatureModules reports WHICH files export assembler-shaped
    // functions but nothing composes that into buildAssemblyManifest's
    // {sourceFile, entries, functions} shape per file — the same
    // discoverAssemblyFunctionNames + captureAssemblySegments composition
    // buildAssemblyManifest itself performs for one already-known file,
    // applied across a whole features directory instead.
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'zebra.ts'),
      `import { CONST_Z } from './const-z.js';\n\nexport function zebraJs(): string {\n  return \`z-\${JSON.stringify(CONST_Z)}\`;\n}\n`,
      'utf8',
    );
    writeFileSync(
      path.join(dir, 'alpha.ts'),
      `export function alphaJs(): string {\n  return \`a-\${1}\`;\n}\n`,
      'utf8',
    );

    const manifest = buildFeatureModulesManifest(dir);

    expect(manifest.directoryPath).toBe(dir);
    expect(manifest.modules.map((m) => path.basename(m.sourceFile))).toEqual([
      'alpha.ts',
      'zebra.ts',
    ]);
    expect(manifest.modules[0]!.entries).toEqual([]);
    expect(manifest.modules[1]!.entries).toHaveLength(1);
    expect(manifest.modules[1]!.entries[0]).toMatchObject({
      modulePath: './const-z.js',
      exportedName: 'CONST_Z',
      kind: 'jsonStringify',
    });
  });

  it('captures exactly the functions each file itself discovered, keyed by function name', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'multi.ts'),
      `export function firstJs(): string {\n  return \`first-\${1}\`;\n}\n\nexport function secondJs(): string {\n  return \`second-\${2}\`;\n}\n`,
      'utf8',
    );

    const manifest = buildFeatureModulesManifest(dir);

    expect(manifest.modules).toHaveLength(1);
    expect(Object.keys(manifest.modules[0]!.functions)).toEqual(['firstJs', 'secondJs']);
  });

  it('returns an empty modules list for a directory with no feature files', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    expect(buildFeatureModulesManifest(dir)).toEqual({ directoryPath: dir, modules: [] });
  });
});

describe('discoverFeatureModules + buildFeatureModulesManifest against the real src/web directory — regression guard', () => {
  // Every discoverFeatureModules/buildFeatureModulesManifest test above runs
  // against a synthetic tmpdir fixture — the same "only ever fixture-tested"
  // gap that let the splice registry itself silently undercount three times
  // before the "real shell.ts" cross-checks earlier in this file caught it.
  // src/web/ is today's only real DIRECT-file features candidate — non-recursive
  // discoverFeatureModules doesn't descend into web/features/, where
  // switcherJs now lives (see the "discoverFeatureModules against the real
  // src/web/features directory" suite below) — shell.ts is still the sole
  // top-level file there exporting assembler-shaped functions (see "discovers
  // every assembler-shaped top-level function in the real web/shell.ts"
  // above), so this anchors the directory-scan path to that same real-file
  // ground truth instead of only ever exercising it against hand-written
  // fixtures.
  const original = readFileSync(SHELL_TS, 'utf8');
  const KNOWN_FUNCTIONS = ['fleetJs', 'clientJs', 'coreClientJs', 'renderShell'];

  it('discovers exactly shell.ts as the sole feature module in src/web/, with its full known function list', () => {
    const modules = discoverFeatureModules(SHELL_DIR);
    expect(modules).toHaveLength(1);
    expect(modules[0]!.filePath).toBe(SHELL_TS);
    expect(modules[0]!.functionNames).toEqual(KNOWN_FUNCTIONS);
  });

  it('builds a FeatureModulesManifest for src/web/ that matches buildAssemblyManifest called directly on shell.ts', () => {
    const manifest = buildFeatureModulesManifest(SHELL_DIR);
    const directManifest = buildAssemblyManifest(original, SHELL_TS, KNOWN_FUNCTIONS);
    expect(manifest.directoryPath).toBe(SHELL_DIR);
    expect(manifest.modules).toEqual([directManifest]);
  });
});

describe('discoverFeatureModules against the real src/web/features directory — the first five real extractions', () => {
  // switcherJs, connectJs, flyJs, and searchJs are the first four assembler
  // functions actually moved out of shell.ts into their own files under a
  // features directory (epic 0002's PARALLEL UNLOCK B) rather than a
  // synthetic tmpdir fixture — this proves the already-built discovery tool
  // finds all four there, the concrete wiring the epic doc names as "the
  // point where the convergence point actually dissolves" for any FUTURE
  // feature module dropped into this directory. localeJs (i18n foundation,
  // board web-msnsndki-dz3vn1) is the first NEW feature module dropped in
  // since, proving that claim for real rather than only in principle.
  // flightConsoleJs (SHELL HUB RELIEF, web-mt69bego-etc8te) is the first
  // whole-region move out of fleetJs() itself since tourJs; docsViewerJs
  // (SHELL HUB RELIEF, web-mt69bego-etc8te) is the second; roundPanelJs
  // (SHELL HUB RELIEF, web-mt69bego-etc8te) is the third; issueTriageJs
  // (SHELL HUB RELIEF, web-mt69bego-etc8te) is the fourth; backlogJs (SHELL
  // HUB RELIEF, web-mt69bego-etc8te) is the fifth; processHealthJs (SHELL HUB
  // RELIEF, web-mt69bego-etc8te) is the sixth — the first cut to move THREE
  // sibling section functions (doraSection/gateParallelSection/
  // warmSessionsSection) as one coherent cluster; evolutionJs (SHELL HUB
  // RELIEF, web-mt69bego-etc8te) is the seventh — a second two-function
  // coherent cluster (evaluationTrendPanel/evolutionSection), the
  // process-health cut's own deferred follow-on; metricsJs (SHELL HUB
  // RELIEF, web-mt69bego-etc8te) is the eighth — the Metrics detail-panel
  // cluster (costSparkline/flightTimelineStrip/metricsSection), the two
  // sparkline builders existing solely to be assembled into metricsSection's
  // panel; landingJs (SHELL HUB RELIEF, web-mt69bego-etc8te) is the ninth —
  // the post-flight LANDING card cluster (landingCommitRow/
  // landingCommitGroupNode/flightDebriefSection/renderLandingBody/
  // landingSection), the FIRST whole-region move to carry its own EXECUTE
  // click handler; releaseJs (SHELL HUB RELIEF, web-mt69bego-etc8te) is the
  // tenth — the RELEASE panel cluster (renderReleaseBody/releaseSection),
  // the SECOND whole-region move to carry its own EXECUTE click handler,
  // closing the two-item list the metrics cut's own epic note flagged;
  // activityJs (SHELL HUB RELIEF, web-mt69bego-etc8te) is the eleventh — the
  // Activity feed panel cluster (phaseRail/phaseDetail/flightMap/
  // activitySection). Unlike every prior cut, `activity.ts` sorts BEFORE
  // every other module (`a` < `b`), so it becomes the FIRST discovered
  // module rather than appended after an existing one — the same
  // front-of-directory reshuffle `backlog.ts` (the fifth whole-region move)
  // already exercised, shifting every other module's index up by one;
  // officeMapJs (SHELL HUB RELIEF, web-mt69bego-etc8te) is the twelfth — the
  // agent office map panel cluster (officeSatellites/officeMapSection/
  // prefersReducedMotion). `office-map.ts` sorts between `notifications.ts`
  // and `process-health.ts`, so it lands as a mid-alphabet insertion (index
  // shifted from `process-health.ts` onward), the same reshuffle
  // `issue-triage.ts`/`process-health.ts` already exercised. `OFFICE_TIPS`
  // — the one constant from `web/office-map.ts` this cluster ALSO reads —
  // stays inline in `fleetJs()` instead of moving with it, because
  // `liveWorkerCard`, `renderStatTiles`, and `activity.ts`'s own `phaseRail`
  // (already moved) all read it too — the same "shared value stays behind"
  // shape the `OFFICE_TIPS`-stays-inline call already established for
  // `activity.ts`, just now proven for a second cluster reading the same
  // constant. `pr-review.ts` (SHELL HUB RELIEF, web-mt69bego-etc8te) joined
  // next — the fourteenth whole-region move and the KEEPER PR review panel
  // cluster (renderPrReviewPanel/loadPrReviewPanel), the FIRST cluster
  // independent of any flown project: it self-initializes on its own 30s
  // poll timer rather than being called from renderProjectPage(). It sorts
  // between `office-map.ts` and `process-health.ts`, a mid-alphabet
  // insertion shifting every index from `process-health.ts` onward, the same
  // reshuffle `office-map.ts` itself already exercised. `flight-summary.ts`
  // (SHELL HUB RELIEF, web-mt69bego-etc8te) joined next — the fifteenth
  // whole-region move: the project page's "Recently shipped" flight summary
  // panel (`flightSummarySection`), the simplest cluster since
  // `round-panel.ts`'s own — no module-level state and no click handler of
  // its own. It sorts between `flight-console.ts` and `fly.ts`, a
  // mid-alphabet insertion shifting every index from `fly.ts` onward, the
  // same reshuffle `office-map.ts`/`pr-review.ts` already exercised.
  // `pool-client.ts` (SHELL HUB RELIEF) joined next — the sixteenth
  // whole-region move: the operator-facing POOL CLIENT browse/claim panel
  // (`refreshPoolClientProjectOptions`/`syncPoolClientProjects`/
  // `renderPoolClientPanel`/`loadPoolClientPanel`), the SECOND cluster
  // independent of any flown project (after `pr-review.ts`): it
  // self-initializes on its own 30s poll timer rather than being called from
  // renderProjectPage(), and keeps its own module-level state
  // (`poolClientEntriesByNumber`/`lastPoolClientProjects`) the same way
  // `pr-review.ts` keeps `prReviewPlansByNumber`. It sorts between
  // `office-map.ts` and `pr-review.ts`, a mid-alphabet insertion shifting
  // every index from `pr-review.ts` onward, the same reshuffle
  // `office-map.ts`/`pr-review.ts`/`flight-summary.ts` already exercised.
  // `publicity.ts` (SHELL HUB RELIEF) joined next — the Publicity
  // affordances panel (`renderPublicityPanel`/`loadPublicityPanel`), the
  // THIRD cluster independent of any flown project (after `pr-review.ts`/
  // `pool-client.ts`): unlike those two, it is a slow-changing fact (flips
  // once, on the public-day) so it self-initializes once rather than riding
  // a poll timer, the same single-shot self-init `notifications.ts`'s
  // `notifyInit()` already established. It sorts between
  // `process-health.ts` and `release.ts`, a mid-alphabet insertion shifting
  // every index from `release.ts` onward.
  // `firing-timeline.ts` (SHELL HUB RELIEF) joined next — the "Per-firing
  // trace" panel cluster (`firingTimelineSection` plus its own Firing Replay
  // viewer: trace drill-down, diff view, step-through playback). Unlike
  // every prior cut, it keeps its OWN five click handlers and one keydown
  // handler (event-delegated on document) alongside its module-level state
  // maps, the same self-contained-state shape `landing.ts`'s own
  // `landingRestarting` cluster already proved extractable, just with more
  // state and more handlers. It sorts between `evolution.ts` and
  // `flight-console.ts`, a mid-alphabet insertion shifting every index from
  // `flight-console.ts` onward, the same reshuffle `office-map.ts`/
  // `pr-review.ts`/`flight-summary.ts`/`publicity.ts` already exercised.
  // `pipeline.ts` (D4, board web-mtdc6wq3-5wuc6i) joined next — the PIPELINE
  // VIEW panel's fetch-and-inject client, same web/features/ assembler shape
  // as coordination.ts. It sorts between `office-map.ts` and
  // `pool-client.ts`, a mid-alphabet insertion shifting every index from
  // `pool-client.ts` onward.
  // REGISTRY DERIVATION (web-mteostss-7u5oaq): the comment chronicle above
  // narrates a real design flaw — every module insertion "shifted every
  // index from X onward", so the old modules[0..29] assertions below turned
  // an unrelated alphabetically-earlier addition into a diff touching every
  // later assertion, the exact collision shape behind 4 prior landing
  // refusals in this file. Keying the comparison by basename instead of
  // array position means a new module costs exactly one new entry here, in
  // sorted order or not — no renumbering, no shifted-index diff noise.
  const EXPECTED_FEATURE_MODULES: Record<string, string[]> = {
    'activity-heatmap.ts': ['activityHeatmapJs'],
    'activity.ts': ['activityJs'],
    'backlog.ts': ['backlogJs'],
    'connect.ts': ['connectJs'],
    'coordination.ts': ['coordinationJs'],
    'docs-viewer.ts': ['docsViewerJs'],
    'evolution.ts': ['evolutionJs'],
    'firing-timeline.ts': ['firingTimelineJs'],
    'flight-console.ts': ['flightConsoleJs'],
    'flight-summary.ts': ['flightSummaryJs'],
    'fly.ts': ['flyJs'],
    'issue-triage.ts': ['issueTriageJs'],
    'landing.ts': ['landingJs'],
    'locale-data.ts': ['localeDataJs'],
    'locale.ts': ['localeJs'],
    'metrics.ts': ['metricsJs'],
    'notifications.ts': ['notificationsJs'],
    'office-map.ts': ['officeMapJs'],
    'pipeline.ts': ['pipelineJs'],
    'pool-client.ts': ['poolClientJs'],
    'pr-review.ts': ['prReviewJs'],
    'process-health.ts': ['processHealthJs'],
    'publicity.ts': ['publicityJs'],
    'release.ts': ['releaseJs'],
    'report-capture-client.ts': ['reportCaptureClientJs'],
    'report-menu.ts': ['reportMenuJs'],
    'round-panel.ts': ['roundPanelJs'],
    'search.ts': ['searchJs'],
    'switcher.ts': ['switcherJs'],
    'tour.ts': ['tourJs'],
  };

  it('discovers every web/features module by name, with no shell.ts edit and no index renumbering needed when a new module is inserted', () => {
    const modules = discoverFeatureModules(FEATURES_DIR);
    const byBasename = new Map(modules.map((m) => [path.basename(m.filePath), m.functionNames]));

    expect([...byBasename.keys()].sort()).toEqual(Object.keys(EXPECTED_FEATURE_MODULES).sort());
    for (const [basename, functionNames] of Object.entries(EXPECTED_FEATURE_MODULES)) {
      expect(byBasename.get(basename), basename).toEqual(functionNames);
    }

    // discoverFeatureModules sorts by file name (byte-wise) — locking that
    // invariant in here means the EXPECTED_FEATURE_MODULES map above never
    // needs to track order, only membership.
    const discoveredBasenames = modules.map((m) => path.basename(m.filePath));
    expect(discoveredBasenames).toEqual([...discoveredBasenames].sort());
  });

  it('builds a FeatureModulesManifest for src/web/features/ that matches buildAssemblyManifest called directly on each file', () => {
    const activitySource = readFileSync(ACTIVITY_TS, 'utf8');
    const backlogSource = readFileSync(BACKLOG_TS, 'utf8');
    const connectSource = readFileSync(CONNECT_TS, 'utf8');
    const coordinationSource = readFileSync(COORDINATION_TS, 'utf8');
    const docsViewerSource = readFileSync(DOCS_VIEWER_TS, 'utf8');
    const evolutionSource = readFileSync(EVOLUTION_TS, 'utf8');
    const firingTimelineSource = readFileSync(FIRING_TIMELINE_TS, 'utf8');
    const flightConsoleSource = readFileSync(FLIGHT_CONSOLE_TS, 'utf8');
    const flightSummarySource = readFileSync(FLIGHT_SUMMARY_TS, 'utf8');
    const flySource = readFileSync(FLY_TS, 'utf8');
    const issueTriageSource = readFileSync(ISSUE_TRIAGE_TS, 'utf8');
    const landingSource = readFileSync(LANDING_TS, 'utf8');
    const localeDataSource = readFileSync(LOCALE_DATA_TS, 'utf8');
    const localeSource = readFileSync(LOCALE_TS, 'utf8');
    const metricsSource = readFileSync(METRICS_TS, 'utf8');
    const notificationsSource = readFileSync(NOTIFICATIONS_TS, 'utf8');
    const officeMapSource = readFileSync(OFFICE_MAP_TS, 'utf8');
    const pipelineSource = readFileSync(PIPELINE_TS, 'utf8');
    const poolClientSource = readFileSync(POOL_CLIENT_TS, 'utf8');
    const prReviewSource = readFileSync(PR_REVIEW_TS, 'utf8');
    const processHealthSource = readFileSync(PROCESS_HEALTH_TS, 'utf8');
    const publicitySource = readFileSync(PUBLICITY_TS, 'utf8');
    const releaseSource = readFileSync(RELEASE_TS, 'utf8');
    const reportCaptureClientSource = readFileSync(REPORT_CAPTURE_CLIENT_TS, 'utf8');
    const reportMenuSource = readFileSync(REPORT_MENU_TS, 'utf8');
    const roundPanelSource = readFileSync(ROUND_PANEL_TS, 'utf8');
    const searchSource = readFileSync(SEARCH_TS, 'utf8');
    const switcherSource = readFileSync(SWITCHER_TS, 'utf8');
    const tourSource = readFileSync(TOUR_TS, 'utf8');
    const manifest = buildFeatureModulesManifest(FEATURES_DIR);
    const activityHeatmapSource = readFileSync(ACTIVITY_HEATMAP_TS, 'utf8');
    const directActivityHeatmapManifest = buildAssemblyManifest(
      activityHeatmapSource,
      ACTIVITY_HEATMAP_TS,
      ['activityHeatmapJs'],
    );
    const directActivityManifest = buildAssemblyManifest(activitySource, ACTIVITY_TS, [
      'activityJs',
    ]);
    const directBacklogManifest = buildAssemblyManifest(backlogSource, BACKLOG_TS, ['backlogJs']);
    const directConnectManifest = buildAssemblyManifest(connectSource, CONNECT_TS, ['connectJs']);
    const directCoordinationManifest = buildAssemblyManifest(coordinationSource, COORDINATION_TS, [
      'coordinationJs',
    ]);
    const directDocsViewerManifest = buildAssemblyManifest(docsViewerSource, DOCS_VIEWER_TS, [
      'docsViewerJs',
    ]);
    const directEvolutionManifest = buildAssemblyManifest(evolutionSource, EVOLUTION_TS, [
      'evolutionJs',
    ]);
    const directFiringTimelineManifest = buildAssemblyManifest(
      firingTimelineSource,
      FIRING_TIMELINE_TS,
      ['firingTimelineJs'],
    );
    const directFlightConsoleManifest = buildAssemblyManifest(
      flightConsoleSource,
      FLIGHT_CONSOLE_TS,
      ['flightConsoleJs'],
    );
    const directFlightSummaryManifest = buildAssemblyManifest(
      flightSummarySource,
      FLIGHT_SUMMARY_TS,
      ['flightSummaryJs'],
    );
    const directFlyManifest = buildAssemblyManifest(flySource, FLY_TS, ['flyJs']);
    const directIssueTriageManifest = buildAssemblyManifest(issueTriageSource, ISSUE_TRIAGE_TS, [
      'issueTriageJs',
    ]);
    const directLandingManifest = buildAssemblyManifest(landingSource, LANDING_TS, ['landingJs']);
    const directLocaleDataManifest = buildAssemblyManifest(localeDataSource, LOCALE_DATA_TS, [
      'localeDataJs',
    ]);
    const directLocaleManifest = buildAssemblyManifest(localeSource, LOCALE_TS, ['localeJs']);
    const directMetricsManifest = buildAssemblyManifest(metricsSource, METRICS_TS, ['metricsJs']);
    const directNotificationsManifest = buildAssemblyManifest(
      notificationsSource,
      NOTIFICATIONS_TS,
      ['notificationsJs'],
    );
    const directOfficeMapManifest = buildAssemblyManifest(officeMapSource, OFFICE_MAP_TS, [
      'officeMapJs',
    ]);
    const directPipelineManifest = buildAssemblyManifest(pipelineSource, PIPELINE_TS, [
      'pipelineJs',
    ]);
    const directPoolClientManifest = buildAssemblyManifest(poolClientSource, POOL_CLIENT_TS, [
      'poolClientJs',
    ]);
    const directPrReviewManifest = buildAssemblyManifest(prReviewSource, PR_REVIEW_TS, [
      'prReviewJs',
    ]);
    const directProcessHealthManifest = buildAssemblyManifest(
      processHealthSource,
      PROCESS_HEALTH_TS,
      ['processHealthJs'],
    );
    const directPublicityManifest = buildAssemblyManifest(publicitySource, PUBLICITY_TS, [
      'publicityJs',
    ]);
    const directReleaseManifest = buildAssemblyManifest(releaseSource, RELEASE_TS, ['releaseJs']);
    const directReportCaptureClientManifest = buildAssemblyManifest(
      reportCaptureClientSource,
      REPORT_CAPTURE_CLIENT_TS,
      ['reportCaptureClientJs'],
    );
    const directReportMenuManifest = buildAssemblyManifest(reportMenuSource, REPORT_MENU_TS, [
      'reportMenuJs',
    ]);
    const directRoundPanelManifest = buildAssemblyManifest(roundPanelSource, ROUND_PANEL_TS, [
      'roundPanelJs',
    ]);
    const directSearchManifest = buildAssemblyManifest(searchSource, SEARCH_TS, ['searchJs']);
    const directSwitcherManifest = buildAssemblyManifest(switcherSource, SWITCHER_TS, [
      'switcherJs',
    ]);
    const directTourManifest = buildAssemblyManifest(tourSource, TOUR_TS, ['tourJs']);
    expect(manifest.directoryPath).toBe(FEATURES_DIR);
    expect(manifest.modules).toEqual([
      directActivityHeatmapManifest,
      directActivityManifest,
      directBacklogManifest,
      directConnectManifest,
      directCoordinationManifest,
      directDocsViewerManifest,
      directEvolutionManifest,
      directFiringTimelineManifest,
      directFlightConsoleManifest,
      directFlightSummaryManifest,
      directFlyManifest,
      directIssueTriageManifest,
      directLandingManifest,
      directLocaleDataManifest,
      directLocaleManifest,
      directMetricsManifest,
      directNotificationsManifest,
      directOfficeMapManifest,
      directPipelineManifest,
      directPoolClientManifest,
      directPrReviewManifest,
      directProcessHealthManifest,
      directPublicityManifest,
      directReleaseManifest,
      directReportCaptureClientManifest,
      directReportMenuManifest,
      directRoundPanelManifest,
      directSearchManifest,
      directSwitcherManifest,
      directTourManifest,
    ]);
  });

  it('switcher.ts carries no relative-import splices — its only substitution is the @autopilot/tokens package import', () => {
    const switcherSource = readFileSync(SWITCHER_TS, 'utf8');
    expect(findSpliceManifest(switcherSource, SWITCHER_TS)).toEqual([]);
  });

  it('locale.ts carries no relative-import splices — its only substitutions are @autopilot/tokens package imports', () => {
    const localeSource = readFileSync(LOCALE_TS, 'utf8');
    expect(findSpliceManifest(localeSource, LOCALE_TS)).toEqual([]);
  });

  it('connect.ts carries seven relative-import splices, resolved against its own directory (connect-panel.js one level up)', () => {
    // four since the extraction; +2 (githubIssueConfirmMessage/
    // githubIssueExecuteResult) with contribute-upstream's report-a-bug flow
    // (epic 0006 slice 5, 2026-08-23 round); +1 (ghLtsMeta) with the LTS
    // chip's UX-EXPRESSION (epic 0006 slice 4, board web-mss4lpwr-gptuk4).
    const connectSource = readFileSync(CONNECT_TS, 'utf8');
    const entries = findSpliceManifest(connectSource, CONNECT_TS);
    expect(entries.map((e) => e.exportedName).sort()).toEqual([
      'connectModeMeta',
      'connectStatusMeta',
      'connectTestResultMeta',
      'ghLtsMeta',
      'ghStatusMeta',
      'githubIssueConfirmMessage',
      'githubIssueExecuteResult',
    ]);
    for (const entry of entries) {
      expect(entry.modulePath).toBe('../connect-panel.js');
      const resolved = path.resolve(FEATURES_DIR, entry.modulePath.replace(/\.js$/, '.ts'));
      expect(existsSync(resolved), `${entry.modulePath} -> ${resolved}`).toBe(true);
    }
  });

  it('fly.ts carries eleven relative-import splices across four modules, resolved against its own directory', () => {
    // flightRowStatusText/flightActionAriaLabel left this list with the i18n
    // fly-rows slice (board web-msnsndki-dz3vn1): the rows read their STRINGS
    // keys via tr() instead of splicing the English helpers
    // (fly-rows-i18n.test.ts holds the mirror contract).
    const flySource = readFileSync(FLY_TS, 'utf8');
    const entries = findSpliceManifest(flySource, FLY_TS);
    expect(entries.map((e) => e.exportedName).sort()).toEqual([
      'activeFlights',
      'flightProgressOf',
      'flightsSig',
      'flyHintText',
      'flySettingsFor',
      'folderOptionsSig',
      'parseFlySettingsStore',
      'rememberedHistory',
      'sessionFlightDataFor',
      'typedFolderFlightStatus',
      'withFlySettings',
    ]);
    const modulePaths = new Map(entries.map((e) => [e.exportedName, e.modulePath]));
    expect(modulePaths.get('flyHintText')).toBe('../fly-hint.js');
    expect(modulePaths.get('activeFlights')).toBe('../flights.js');
    expect(modulePaths.get('flightsSig')).toBe('../flights.js');
    expect(modulePaths.get('typedFolderFlightStatus')).toBe('../flights.js');
    expect(modulePaths.get('folderOptionsSig')).toBe('../flights.js');
    expect(modulePaths.get('parseFlySettingsStore')).toBe('../flights.js');
    expect(modulePaths.get('flySettingsFor')).toBe('../flights.js');
    expect(modulePaths.get('withFlySettings')).toBe('../flights.js');
    expect(modulePaths.get('flightProgressOf')).toBe('../flight-progress.js');
    expect(modulePaths.get('sessionFlightDataFor')).toBe('../flight-progress.js');
    for (const entry of entries) {
      const resolved = path.resolve(FEATURES_DIR, entry.modulePath.replace(/\.js$/, '.ts'));
      expect(existsSync(resolved), `${entry.modulePath} -> ${resolved}`).toBe(true);
    }
  });

  it('search.ts carries eleven relative-import splices across three modules, resolved against its own directory', () => {
    const searchSource = readFileSync(SEARCH_TS, 'utf8');
    const entries = findSpliceManifest(searchSource, SEARCH_TS);
    expect(entries.map((e) => e.exportedName).sort()).toEqual([
      'applyAskStreamFrame',
      'isBlockStart',
      'isFence',
      'isHeading',
      'isListItem',
      'isSvgStart',
      'isTableStart',
      'searchHitMeta',
      'searchProjectsSig',
      'splitSseFrames',
      'splitTableRow',
    ]);
    const modulePaths = new Map(entries.map((e) => [e.exportedName, e.modulePath]));
    expect(modulePaths.get('searchProjectsSig')).toBe('../search-history.js');
    expect(modulePaths.get('searchHitMeta')).toBe('../search-history.js');
    expect(modulePaths.get('splitTableRow')).toBe('../markdown.js');
    expect(modulePaths.get('isFence')).toBe('../markdown.js');
    expect(modulePaths.get('isHeading')).toBe('../markdown.js');
    expect(modulePaths.get('isListItem')).toBe('../markdown.js');
    expect(modulePaths.get('isSvgStart')).toBe('../markdown.js');
    expect(modulePaths.get('isTableStart')).toBe('../markdown.js');
    expect(modulePaths.get('isBlockStart')).toBe('../markdown.js');
    expect(modulePaths.get('splitSseFrames')).toBe('../ask-stream.js');
    expect(modulePaths.get('applyAskStreamFrame')).toBe('../ask-stream.js');
    for (const entry of entries) {
      const resolved = path.resolve(FEATURES_DIR, entry.modulePath.replace(/\.js$/, '.ts'));
      expect(existsSync(resolved), `${entry.modulePath} -> ${resolved}`).toBe(true);
    }
  });

  it('process-health.ts carries three relative-import splices, all resolved against ../stat-tiles.js one level up', () => {
    // The three process-health panels' tile-item math (doraTileItems/
    // gateParallelTileItems/warmSessionTileItems) moved out with them from
    // shell.ts's own splice block; now resolved against web/features/ instead.
    const processHealthSource = readFileSync(PROCESS_HEALTH_TS, 'utf8');
    const entries = findSpliceManifest(processHealthSource, PROCESS_HEALTH_TS);
    expect(entries.map((e) => e.exportedName).sort()).toEqual([
      'doraTileItems',
      'gateParallelTileItems',
      'warmSessionTileItems',
    ]);
    for (const entry of entries) {
      expect(entry.modulePath).toBe('../stat-tiles.js');
      const resolved = path.resolve(FEATURES_DIR, entry.modulePath.replace(/\.js$/, '.ts'));
      expect(existsSync(resolved), `${entry.modulePath} -> ${resolved}`).toBe(true);
    }
  });

  it('office-map.ts carries seventeen relative-import splices against ../office-map.js one level up, with its numeric constants spliced as bare `${WIDTH}` template literals rather than .toString()/JSON.stringify()', () => {
    // The office map's OFFICE_PHASES/OFFICE_LABELS/geometry constants +
    // officeZoneX/officeTargetFor/officeEase/officeSatellitePos/
    // officeTweenPos moved out with officeSatellites/officeMapSection/
    // prefersReducedMotion from shell.ts's own splice block; now resolved
    // against web/features/ instead. OFFICE_TIPS itself stays behind in
    // shell.ts's own registry (see "discovering the real web/shell.ts
    // splice registry" above), so it is NOT one of this file's splices.
    const officeMapSource = readFileSync(OFFICE_MAP_TS, 'utf8');
    const entries = findSpliceManifest(officeMapSource, OFFICE_MAP_TS);
    expect(entries.map((e) => e.exportedName).sort()).toEqual([
      'OFFICE_ANIM_MS',
      'OFFICE_GAP',
      'OFFICE_H',
      'OFFICE_IDLE_X',
      'OFFICE_IDLE_Y',
      'OFFICE_LABELS',
      'OFFICE_PHASES',
      'OFFICE_SATELLITE_ORBIT',
      'OFFICE_SATELLITE_R',
      'OFFICE_W',
      'OFFICE_ZONE_H',
      'OFFICE_ZONE_W',
      'OFFICE_ZONE_Y',
      'officeEase',
      'officeSatellitePos',
      'officeTargetFor',
      'officeTweenPos',
      'officeZoneX',
    ]);
    for (const entry of entries) {
      expect(entry.modulePath).toBe('../office-map.js');
      const resolved = path.resolve(FEATURES_DIR, entry.modulePath.replace(/\.js$/, '.ts'));
      expect(existsSync(resolved), `${entry.modulePath} -> ${resolved}`).toBe(true);
      if (entry.exportedName === 'OFFICE_PHASES' || entry.exportedName === 'OFFICE_LABELS') {
        expect(entry.kind, entry.exportedName).toBe('jsonStringify');
      } else if (entry.exportedName.startsWith('OFFICE_')) {
        expect(entry.kind, entry.exportedName).toBe('templateLiteral');
      } else {
        expect(entry.kind, entry.exportedName).toBe('toString');
      }
    }
  });
});

describe('generateFeatureModulesIndexSource', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('generates one import line per module plus an array listing every discovered function, sorted by file name', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'zebra.ts'),
      `export function zebraJs(): string {\n  return \`z-\${1}\`;\n}\n`,
      'utf8',
    );
    writeFileSync(
      path.join(dir, 'alpha.ts'),
      `export function alphaJs(): string {\n  return \`a-\${1}\`;\n}\n`,
      'utf8',
    );

    const source = generateFeatureModulesIndexSource(dir);

    expect(source).toContain("import { alphaJs } from './alpha.js';");
    expect(source).toContain("import { zebraJs } from './zebra.js';");
    expect(source.indexOf("'./alpha.js'")).toBeLessThan(source.indexOf("'./zebra.js'"));
    expect(source).toContain(
      'export const FEATURE_MODULE_FUNCTIONS: Array<() => string> = [alphaJs, zebraJs];',
    );
  });

  it('imports every function a single file exports on one import line, not one per function', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'multi.ts'),
      `export function firstJs(): string {\n  return \`first-\${1}\`;\n}\n\nexport function secondJs(): string {\n  return \`second-\${2}\`;\n}\n`,
      'utf8',
    );

    const source = generateFeatureModulesIndexSource(dir);

    expect(source).toContain("import { firstJs, secondJs } from './multi.js';");
    expect(source).toContain(
      'export const FEATURE_MODULE_FUNCTIONS: Array<() => string> = [firstJs, secondJs];',
    );
  });

  it('maps a .mts module to a .mjs import specifier, not .mts or .js', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'mjs-module.mts'),
      `export function mjsJs(): string {\n  return \`m-\${1}\`;\n}\n`,
      'utf8',
    );

    const source = generateFeatureModulesIndexSource(dir);

    expect(source).toContain("import { mjsJs } from './mjs-module.mjs';");
  });

  it('generates an empty array with no import lines for a directory with no feature modules', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));

    const source = generateFeatureModulesIndexSource(dir);

    expect(source).not.toContain('import');
    expect(source).toContain('export const FEATURE_MODULE_FUNCTIONS: Array<() => string> = [];');
  });

  it('generates syntactically valid TypeScript (no parse errors) for a real multi-module directory', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'feature-modules-'));
    writeFileSync(
      path.join(dir, 'a.ts'),
      `export function aJs(): string {\n  return \`a-\${1}\`;\n}\n`,
      'utf8',
    );
    writeFileSync(
      path.join(dir, 'b.ts'),
      `export function bJs(): string {\n  return \`b-\${1}\`;\n}\n`,
      'utf8',
    );

    const source = generateFeatureModulesIndexSource(dir);
    const result = ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.ESNext },
    });

    expect(result.diagnostics ?? []).toEqual([]);
  });

  it('generates the real barrel for src/web/features/, importing activity-heatmap.ts, activity.ts, backlog.ts, connect.ts, coordination.ts, docs-viewer.ts, evolution.ts, firing-timeline.ts, flight-console.ts, flight-summary.ts, fly.ts, issue-triage.ts, landing.ts, locale-data.ts, locale.ts, metrics.ts, notifications.ts, office-map.ts, pipeline.ts, pool-client.ts, pr-review.ts, process-health.ts, publicity.ts, release.ts, report-capture-client.ts, report-menu.ts, round-panel.ts, search.ts, switcher.ts, and tour.ts in that order with no shell.ts edit needed', () => {
    const source = generateFeatureModulesIndexSource(FEATURES_DIR);

    expect(source).toContain("import { activityHeatmapJs } from './activity-heatmap.js';");
    expect(source).toContain("import { activityJs } from './activity.js';");
    expect(source).toContain("import { backlogJs } from './backlog.js';");
    expect(source).toContain("import { connectJs } from './connect.js';");
    expect(source).toContain("import { coordinationJs } from './coordination.js';");
    expect(source).toContain("import { docsViewerJs } from './docs-viewer.js';");
    expect(source).toContain("import { evolutionJs } from './evolution.js';");
    expect(source).toContain("import { firingTimelineJs } from './firing-timeline.js';");
    expect(source).toContain("import { flightConsoleJs } from './flight-console.js';");
    expect(source).toContain("import { flightSummaryJs } from './flight-summary.js';");
    expect(source).toContain("import { flyJs } from './fly.js';");
    expect(source).toContain("import { issueTriageJs } from './issue-triage.js';");
    expect(source).toContain("import { landingJs } from './landing.js';");
    expect(source).toContain("import { localeDataJs } from './locale-data.js';");
    expect(source).toContain("import { localeJs } from './locale.js';");
    expect(source).toContain("import { metricsJs } from './metrics.js';");
    expect(source).toContain("import { notificationsJs } from './notifications.js';");
    expect(source).toContain("import { officeMapJs } from './office-map.js';");
    expect(source).toContain("import { pipelineJs } from './pipeline.js';");
    expect(source).toContain("import { poolClientJs } from './pool-client.js';");
    expect(source).toContain("import { prReviewJs } from './pr-review.js';");
    expect(source).toContain("import { processHealthJs } from './process-health.js';");
    expect(source).toContain("import { publicityJs } from './publicity.js';");
    expect(source).toContain("import { releaseJs } from './release.js';");
    expect(source).toContain("import { reportCaptureClientJs } from './report-capture-client.js';");
    expect(source).toContain("import { reportMenuJs } from './report-menu.js';");
    expect(source).toContain("import { roundPanelJs } from './round-panel.js';");
    expect(source).toContain("import { searchJs } from './search.js';");
    expect(source).toContain("import { switcherJs } from './switcher.js';");
    expect(source).toContain("import { tourJs } from './tour.js';");
    expect(source.indexOf("'./activity-heatmap.js'")).toBeLessThan(
      source.indexOf("'./activity.js'"),
    );
    expect(source.indexOf("'./activity.js'")).toBeLessThan(source.indexOf("'./backlog.js'"));
    expect(source.indexOf("'./backlog.js'")).toBeLessThan(source.indexOf("'./connect.js'"));
    expect(source.indexOf("'./connect.js'")).toBeLessThan(source.indexOf("'./coordination.js'"));
    expect(source.indexOf("'./coordination.js'")).toBeLessThan(
      source.indexOf("'./docs-viewer.js'"),
    );
    expect(source.indexOf("'./docs-viewer.js'")).toBeLessThan(source.indexOf("'./evolution.js'"));
    expect(source.indexOf("'./evolution.js'")).toBeLessThan(
      source.indexOf("'./firing-timeline.js'"),
    );
    expect(source.indexOf("'./firing-timeline.js'")).toBeLessThan(
      source.indexOf("'./flight-console.js'"),
    );
    expect(source.indexOf("'./flight-console.js'")).toBeLessThan(
      source.indexOf("'./flight-summary.js'"),
    );
    expect(source.indexOf("'./flight-summary.js'")).toBeLessThan(source.indexOf("'./fly.js'"));
    expect(source.indexOf("'./fly.js'")).toBeLessThan(source.indexOf("'./issue-triage.js'"));
    expect(source.indexOf("'./issue-triage.js'")).toBeLessThan(source.indexOf("'./landing.js'"));
    expect(source.indexOf("'./landing.js'")).toBeLessThan(source.indexOf("'./locale-data.js'"));
    expect(source.indexOf("'./locale-data.js'")).toBeLessThan(source.indexOf("'./locale.js'"));
    expect(source.indexOf("'./locale.js'")).toBeLessThan(source.indexOf("'./metrics.js'"));
    expect(source.indexOf("'./metrics.js'")).toBeLessThan(source.indexOf("'./notifications.js'"));
    expect(source.indexOf("'./notifications.js'")).toBeLessThan(
      source.indexOf("'./office-map.js'"),
    );
    expect(source.indexOf("'./office-map.js'")).toBeLessThan(source.indexOf("'./pipeline.js'"));
    expect(source.indexOf("'./pipeline.js'")).toBeLessThan(source.indexOf("'./pool-client.js'"));
    expect(source.indexOf("'./pool-client.js'")).toBeLessThan(source.indexOf("'./pr-review.js'"));
    expect(source.indexOf("'./pr-review.js'")).toBeLessThan(
      source.indexOf("'./process-health.js'"),
    );
    expect(source.indexOf("'./process-health.js'")).toBeLessThan(
      source.indexOf("'./publicity.js'"),
    );
    expect(source.indexOf("'./publicity.js'")).toBeLessThan(source.indexOf("'./release.js'"));
    expect(source.indexOf("'./release.js'")).toBeLessThan(
      source.indexOf("'./report-capture-client.js'"),
    );
    expect(source.indexOf("'./report-capture-client.js'")).toBeLessThan(
      source.indexOf("'./report-menu.js'"),
    );
    expect(source.indexOf("'./report-menu.js'")).toBeLessThan(source.indexOf("'./round-panel.js'"));
    expect(source.indexOf("'./round-panel.js'")).toBeLessThan(source.indexOf("'./search.js'"));
    expect(source.indexOf("'./search.js'")).toBeLessThan(source.indexOf("'./switcher.js'"));
    expect(source.indexOf("'./switcher.js'")).toBeLessThan(source.indexOf("'./tour.js'"));
    expect(source).toContain(
      'export const FEATURE_MODULE_FUNCTIONS: Array<() => string> = [activityHeatmapJs, activityJs, backlogJs, connectJs, coordinationJs, docsViewerJs, evolutionJs, firingTimelineJs, flightConsoleJs, flightSummaryJs, flyJs, issueTriageJs, landingJs, localeDataJs, localeJs, metricsJs, notificationsJs, officeMapJs, pipelineJs, poolClientJs, prReviewJs, processHealthJs, publicityJs, releaseJs, reportCaptureClientJs, reportMenuJs, roundPanelJs, searchJs, switcherJs, tourJs];',
    );

    const result = ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.ESNext },
    });
    expect(result.diagnostics ?? []).toEqual([]);
  });

  // web/features/index.ts is committed (generated via `--emit-index`, not
  // hand-written — its own header says so) so a future clientJs() can import
  // it directly instead of five hand-written feature-module names. Nothing
  // reads it yet (clientJs() still imports switcherJs/connectJs/flyJs/
  // searchJs by name — wiring it in is the open next slice, see
  // docs/epics/0002-shell-decomposition.md). Until then, this is the only
  // thing standing between the committed file and silent drift: a hand-edit,
  // or a new/removed feature module regenerating a different barrel, fails
  // here instead of shipping a stale `FEATURE_MODULE_FUNCTIONS` array. The
  // CLI's raw output isn't prettier-formatted (regenerating it is expected to
  // be followed by the repo's normal format step, same as any other
  // generated file), so this formats the fresh source the same way before
  // comparing — a byte diff would otherwise fail on formatting alone.
  it('the committed web/features/index.ts matches regenerating it fresh from the real directory', async () => {
    const committed = readFileSync(path.join(FEATURES_DIR, 'index.ts'), 'utf8');
    const fresh = await prettier.format(generateFeatureModulesIndexSource(FEATURES_DIR), {
      ...(await prettier.resolveConfig(path.join(FEATURES_DIR, 'index.ts'))),
      filepath: path.join(FEATURES_DIR, 'index.ts'),
    });
    expect(committed).toBe(fresh);
  });
});

describe('cross-checking the manifest against every relative import shell.ts declares — regression guard', () => {
  // The manifest has already silently undercounted its own registry three
  // times (missed jsonStringify's array-spread variant, missed the bare
  // template-literal shape entirely, missed the array-spread-before-
  // JSON.stringify shape) — each time discovered only by a one-off manual
  // diff against shell.ts's real imports in a commit message, not by a test.
  // This locks that diff in as a standing check: a future 5th splice shape
  // (or a regression in an existing one) fails CI instead of shipping silent.
  // fontFaceCss/PRELOAD_FONT_PATHS/layoutCss are legitimately server-side-only
  // HTML/CSS generation, never spliced into the client bundle at all —
  // layoutCss joined this set once it moved out of shell.ts entirely into its
  // own `web/layout-css.ts` module (epic 0002 follow-on): it is a genuine
  // relative import (`./layout-css.js`) `assetVersion()` calls directly for
  // its return value, the same non-splice shape fontFaceCss already had.
  // featureModulesJs is a third, newer category (epic 0002's PARALLEL UNLOCK B
  // auto-discovery rewire): a genuine relative import — `./features/index.js`,
  // the generated barrel — that is neither server-only nor spliced via
  // `.toString()`/`JSON.stringify()`/a template literal; `clientJs()` calls
  // it directly and embeds its RETURN VALUE, the same same-file-function-call
  // shape `fleetJs()` still uses since it remains declared inside shell.ts
  // itself (and so never showed up as a relative import needing accounting
  // at all). It replaces what used to be four separate exceptions here
  // (switcherJs/connectJs/flyJs/searchJs, each its own relative import) now
  // that clientJs() imports one barrel function instead of one name per
  // feature module. themeButtons/escapeAttr joined this set once they moved
  // out of shell.ts into their own `web/shell-html.ts` module (epic 0002
  // follow-on, mirroring layoutCss's own move): both are genuine relative
  // imports (`./shell-html.js`) `renderShell()` calls directly by name for
  // their return values — themeButtons() as a bare call, escapeAttr(project)
  // with an argument — never spliced via `.toString()`/`JSON.stringify()`
  // and never part of the client bundle `clientJs()` builds. langButtons
  // joined this set the same way (i18n foundation, board web-msnsndki-dz3vn1):
  // another bare-call `./shell-html.js` export `renderShell()` calls directly.
  const KNOWN_NON_SPLICE_IMPORTS = new Set([
    'fontFaceCss',
    'PRELOAD_FONT_PATHS',
    'layoutCss',
    'featureModulesJs',
    // CODE-SPLIT chunk composers (web/chunks.ts): composition calls exactly
    // like featureModulesJs above — served-chunk assembly, not .toString()
    // splices of client-visible helpers.
    'coreFeatureModulesJs',
    'projectFeatureModulesJs',
    'deferredFeatureModulesJs',
    'themeButtons',
    'langButtons',
    'escapeAttr',
    // Brand masthead lockup (epic 0008): a template-literal helper call in
    // renderShell's HTML, same non-splice shape as themeButtons()/langButtons().
    'gogglesMarkInlineSvg',
  ]);

  it('accounts for every relative-import binding: either discovered as a splice, or a known non-splice exception', () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    const allImports = allRelativeImportLocalNames(original, SHELL_TS);
    const discovered = new Set(
      buildSpliceManifest(original, SHELL_TS).entries.map((e) => e.localName),
    );

    const unaccounted = allImports.filter(
      (name) => !discovered.has(name) && !KNOWN_NON_SPLICE_IMPORTS.has(name),
    );
    expect(unaccounted).toEqual([]);
  });

  it('does not let the known non-splice exception list mask a real splice', () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    const discovered = new Set(
      buildSpliceManifest(original, SHELL_TS).entries.map((e) => e.localName),
    );

    for (const name of KNOWN_NON_SPLICE_IMPORTS) {
      expect(
        discovered.has(name),
        `${name} is listed as a non-splice import but was discovered as a splice`,
      ).toBe(false);
    }
  });
});

describe('verifySpliceManifestAgainstOutput', () => {
  const BINDINGS: Record<string, unknown> = {
    sharedHelperA: 'A-SOURCE',
    CONST_B: { b: 1 },
    helperC: 'C-SOURCE',
  };
  const entries = findSpliceManifest(FIXTURE, 'fixture.ts');
  const resolve = (entry: (typeof entries)[number]) => BINDINGS[entry.localName];

  it('reports no unmatched entries when every splice appears in order', () => {
    const output = `${BINDINGS['sharedHelperA']}\n${JSON.stringify(BINDINGS['CONST_B'])}\n${BINDINGS['helperC']}`;
    expect(verifySpliceManifestAgainstOutput(output, entries, resolve)).toEqual([]);
  });

  it('reports an entry whose expected content is missing entirely', () => {
    const output = JSON.stringify(BINDINGS['CONST_B']);
    const unmatched = verifySpliceManifestAgainstOutput(output, entries, resolve);
    expect(unmatched.map((e) => e.localName)).toEqual(['sharedHelperA', 'helperC']);
  });

  it('reports an entry whose expected content appears only before the manifest position', () => {
    // sharedHelperA's content is present, but only *before* CONST_B's match
    // consumes the cursor past it — proves the check is order-sensitive, not
    // just "does this text appear anywhere".
    const output = `${BINDINGS['sharedHelperA']}${JSON.stringify(BINDINGS['CONST_B'])}`;
    const outOfOrderBindings: Record<string, unknown> = {
      ...BINDINGS,
      helperC: BINDINGS['sharedHelperA'],
    };
    const unmatched = verifySpliceManifestAgainstOutput(
      output,
      entries,
      (entry) => outOfOrderBindings[entry.localName],
    );
    expect(unmatched.map((e) => e.localName)).toEqual(['helperC']);
  });

  it('matches a jsonStringifySpread entry against JSON.stringify([...value]), not JSON.stringify(value)', () => {
    // The resolved binding is the real Set (SUBAGENT_TOOLS is a
    // ReadonlySet<string>) — JSON.stringify() on a Set directly serializes
    // to '{}', so this proves the check spreads it into an array first, the
    // way `[...binding]` actually stringifies at runtime.
    const fixture = `import { TOOLS } from './tools.js';
export function f(): string {
  return \`var TOOLS = new Set(\${JSON.stringify([...TOOLS])});\`;
}
`;
    const spreadEntries = findSpliceManifest(fixture, 'fixture.ts');
    const value = new Set(['Agent', 'Task']);
    const output = `var TOOLS = new Set(${JSON.stringify([...value])});`;
    const unmatched = verifySpliceManifestAgainstOutput(output, spreadEntries, () => value);
    expect(unmatched).toEqual([]);
  });

  it('matches a templateLiteral entry against the raw String() conversion, not JSON.stringify()', () => {
    // A string value distinguishes the two: String('hello') has no quotes,
    // JSON.stringify('hello') does — proves templateLiteral entries are
    // checked the way `${binding}` actually stringifies at runtime.
    const fixture = `import { LABEL } from './label.js';
export function f(): string {
  return \`prefix-\${LABEL}-suffix\`;
}
`;
    const templateEntries = findSpliceManifest(fixture, 'fixture.ts');
    const output = 'prefix-hello-suffix';
    const unmatched = verifySpliceManifestAgainstOutput(output, templateEntries, () => 'hello');
    expect(unmatched).toEqual([]);
  });
});

describe('verifying the real assembled clientJs() bundle against the manifest', () => {
  it("contains every discovered splice's real compiled/serialized content, in manifest order", async () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    const manifest = buildSpliceManifest(original, SHELL_TS);
    const resolved = await resolveManifestBindings(manifest.entries, SHELL_DIR);

    const unmatched = verifySpliceManifestAgainstOutput(clientJs(), manifest.entries, (entry) =>
      resolved.get(`${entry.modulePath}#${entry.exportedName}`),
    );
    expect(unmatched).toEqual([]);
  });
});

describe('captureAssemblySegments + reassembleSegments', () => {
  const FIXTURE_ASSEMBLED = `const GREETING = 'hi';
function assembled(): string {
  return \`
head-\${GREETING}-mid-\${1 + 1}-tail
\`.trim();
}
`;

  it('splits a template-literal return into segments and slots, one more segment than slots', () => {
    const { segments, slots } = captureAssemblySegments(
      FIXTURE_ASSEMBLED,
      'assembled',
      'fixture.ts',
    );
    expect(segments.length).toBe(slots.length + 1);
    expect(slots.map((s: { exprText: string }) => s.exprText)).toEqual(['GREETING', '1 + 1']);
  });

  it('reassembles the exact original text from segments + resolved slot values', () => {
    const { segments, slots } = captureAssemblySegments(
      FIXTURE_ASSEMBLED,
      'assembled',
      'fixture.ts',
    );
    const resolved = slots.map((s: { exprText: string }) => (s.exprText === 'GREETING' ? 'hi' : 2));
    expect(reassembleSegments(segments, resolved).trim()).toBe('head-hi-mid-2-tail');
  });

  it('does not descend into a nested function scope for its own return statement', () => {
    const fixture = `function outer(): string {
  function inner(): string {
    return \`wrong\`;
  }
  inner();
  return \`right-\${1}\`;
}
`;
    const { segments } = captureAssemblySegments(fixture, 'outer', 'fixture.ts');
    expect(segments.join('')).not.toContain('wrong');
  });

  it('does not descend into a nested class getter/setter/constructor for its own return statement', () => {
    // Same nested-scope exclusion as a nested function, extended to a
    // class's GetAccessorDeclaration/SetAccessorDeclaration/
    // ConstructorDeclaration — each defines its own return scope just like a
    // MethodDeclaration (already excluded) but was previously missing from
    // the skip list, so it falsely counted as a second top-level return.
    const fixture = `function outer(): string {
  class Widget {
    get label() {
      return \`wrong-get-\${1}\`;
    }
    set label(v: string) {
      return \`wrong-set-\${v}\`;
    }
    constructor() {
      return \`wrong-ctor-\${2}\`;
    }
  }
  return \`right-\${3}\`;
}
`;
    const { segments } = captureAssemblySegments(fixture, 'outer', 'fixture.ts');
    expect(segments.join('')).not.toContain('wrong');
    expect(segments.join('')).toContain('right-');
  });

  it('throws when the named function has no template-literal return', () => {
    expect(() =>
      captureAssemblySegments('function f(): string { return "x"; }', 'f', 'fixture.ts'),
    ).toThrow();
  });

  it('throws a clear error naming the function when it has more than one top-level template-literal return', () => {
    // Unlike discoverAssemblyFunctionNames (which excludes a function shaped
    // this way rather than crash discovery of the rest of the file — see its
    // own coverage above), captureAssemblySegments is asked to capture ONE
    // specific named function the caller already believes is assembler-shaped
    // — surfacing a clear error there remains the correct behavior.
    const fixture = `function twoReturns(flag: boolean): string {
  if (flag) {
    return \`a-\${1}\`;
  }
  return \`b-\${2}\`;
}
`;
    expect(() => captureAssemblySegments(fixture, 'twoReturns', 'fixture.ts')).toThrow(
      'twoReturns has more than one top-level template-literal return',
    );
  });

  it('throws when the named function does not exist', () => {
    expect(() => captureAssemblySegments(FIXTURE_ASSEMBLED, 'missing', 'fixture.ts')).toThrow();
  });

  it('throws when the resolved-value count does not match the slot count', () => {
    expect(() => reassembleSegments(['a', 'b'], [])).toThrow();
  });
});

describe('localTopLevelConstLiteral', () => {
  it('reads a numeric top-level const literal', () => {
    expect(localTopLevelConstLiteral('const N = 3000;\n', 'N', 'fixture.ts')).toBe(3000);
  });

  it('reads a string top-level const literal', () => {
    expect(localTopLevelConstLiteral("const S = 'x';\n", 'S', 'fixture.ts')).toBe('x');
  });

  it('returns undefined for a name that is not a top-level const', () => {
    expect(localTopLevelConstLiteral('let N = 3000;\n', 'N', 'fixture.ts')).toBeUndefined();
  });

  it('returns undefined when the initializer is not a literal', () => {
    expect(localTopLevelConstLiteral('const N = compute();\n', 'N', 'fixture.ts')).toBeUndefined();
  });

  it('reads REFRESH_MS off the real shell.ts', () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    expect(localTopLevelConstLiteral(original, 'REFRESH_MS', SHELL_TS)).toBe(3000);
  });
});

describe('resolveManifestBindings', () => {
  const TOOL_MODULE_PATH = '../../../../scripts/codemod/generate-splice-manifest.mjs';
  const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

  it('dynamically imports each entry’s real binding', async () => {
    const entries = [{ modulePath: TOOL_MODULE_PATH, exportedName: 'reassembleSegments' }];
    const resolved = await resolveManifestBindings(entries, TEST_DIR);
    expect(resolved.get(`${TOOL_MODULE_PATH}#reassembleSegments`)).toBe(reassembleSegments);
  });

  it('dedupes repeated module+export pairs into a single import', async () => {
    const entries = [
      { modulePath: TOOL_MODULE_PATH, exportedName: 'reassembleSegments' },
      { modulePath: TOOL_MODULE_PATH, exportedName: 'reassembleSegments' },
      { modulePath: TOOL_MODULE_PATH, exportedName: 'localTopLevelConstLiteral' },
    ];
    const resolved = await resolveManifestBindings(entries, TEST_DIR);
    expect(resolved.size).toBe(2);
  });
});

describe('assembleFunctionFromManifest', () => {
  const ASSEMBLE_FIXTURE = `import { helperA as sharedHelperA } from './helper-a.js';
import { CONST_B } from './const-b.js';

export function assembled(): string {
  return \`head-\${sharedHelperA.toString()}-mid-\${JSON.stringify(CONST_B)}-tail-\${LOCAL}\`;
}
`;

  it('reconstructs a function’s real output from resolved splice bindings plus an injected resolver for non-splice slots', async () => {
    const bindings = new Map<string, unknown>([
      ['./helper-a.js#helperA', 'A-SOURCE'],
      ['./const-b.js#CONST_B', { b: 1 }],
    ]);
    const output = await assembleFunctionFromManifest(
      ASSEMBLE_FIXTURE,
      'assembled',
      bindings,
      (exprText: string) => (exprText === 'LOCAL' ? 42 : undefined),
      'fixture.ts',
    );
    expect(output).toBe(`head-A-SOURCE-mid-${JSON.stringify({ b: 1 })}-tail-42`);
  });

  it('throws for a non-splice slot when no resolveOtherSlot is supplied', async () => {
    await expect(
      assembleFunctionFromManifest(ASSEMBLE_FIXTURE, 'assembled', new Map()),
    ).rejects.toThrow(/no resolution for non-splice slot/);
  });
});

describe('buildAssemblyManifest', () => {
  const ASSEMBLY_FIXTURE = `import { helperA as sharedHelperA } from './helper-a.js';
import { CONST_B } from './const-b.js';

export function partOne(): string {
  return \`one-\${sharedHelperA.toString()}\`;
}

export function partTwo(): string {
  return \`two-\${JSON.stringify(CONST_B)}\`;
}
`;

  it('wraps the splice registry with the source file path', () => {
    const manifest = buildAssemblyManifest(ASSEMBLY_FIXTURE, 'fixture.ts', ['partOne', 'partTwo']);
    expect(manifest.sourceFile).toBe('fixture.ts');
    expect(manifest.entries).toEqual(findSpliceManifest(ASSEMBLY_FIXTURE, 'fixture.ts'));
  });

  it('captures each named function’s glue segments and slots, keyed by function name', () => {
    const manifest = buildAssemblyManifest(ASSEMBLY_FIXTURE, 'fixture.ts', ['partOne', 'partTwo']);
    expect(manifest.functions['partOne']).toEqual(
      captureAssemblySegments(ASSEMBLY_FIXTURE, 'partOne', 'fixture.ts'),
    );
    expect(manifest.functions['partTwo']).toEqual(
      captureAssemblySegments(ASSEMBLY_FIXTURE, 'partTwo', 'fixture.ts'),
    );
  });

  it('only captures the functions explicitly named', () => {
    const manifest = buildAssemblyManifest(ASSEMBLY_FIXTURE, 'fixture.ts', ['partOne']);
    expect(Object.keys(manifest.functions)).toEqual(['partOne']);
  });
});

describe('assembleFromManifest', () => {
  const ASSEMBLE_FIXTURE = `import { helperA as sharedHelperA } from './helper-a.js';
import { CONST_B } from './const-b.js';

export function assembled(): string {
  return \`head-\${sharedHelperA.toString()}-mid-\${JSON.stringify(CONST_B)}-tail-\${LOCAL}\`;
}
`;

  it('reconstructs a function’s real output from a pre-built manifest, with no source re-parsing', async () => {
    const manifest = buildAssemblyManifest(ASSEMBLE_FIXTURE, 'fixture.ts', ['assembled']);
    const bindings = new Map<string, unknown>([
      ['./helper-a.js#helperA', 'A-SOURCE'],
      ['./const-b.js#CONST_B', { b: 1 }],
    ]);
    const output = await assembleFromManifest(
      manifest,
      'assembled',
      bindings,
      (exprText: string) => (exprText === 'LOCAL' ? 42 : undefined),
    );
    expect(output).toBe(`head-A-SOURCE-mid-${JSON.stringify({ b: 1 })}-tail-42`);
  });

  it('matches assembleFunctionFromManifest’s output for the same inputs', async () => {
    const manifest = buildAssemblyManifest(ASSEMBLE_FIXTURE, 'fixture.ts', ['assembled']);
    const bindings = new Map<string, unknown>([
      ['./helper-a.js#helperA', 'A-SOURCE'],
      ['./const-b.js#CONST_B', { b: 1 }],
    ]);
    const resolveOtherSlot = (exprText: string) => (exprText === 'LOCAL' ? 42 : undefined);
    const fromManifest = await assembleFromManifest(
      manifest,
      'assembled',
      bindings,
      resolveOtherSlot,
    );
    const fromSource = await assembleFunctionFromManifest(
      ASSEMBLE_FIXTURE,
      'assembled',
      bindings,
      resolveOtherSlot,
      'fixture.ts',
    );
    expect(fromManifest).toBe(fromSource);
  });

  it('throws when the manifest has no captured glue segments for the function', async () => {
    const manifest = buildAssemblyManifest(ASSEMBLE_FIXTURE, 'fixture.ts', []);
    await expect(assembleFromManifest(manifest, 'assembled', new Map())).rejects.toThrow(
      /no captured glue segments/,
    );
  });

  it('throws for a non-splice slot when no resolveOtherSlot is supplied', async () => {
    const manifest = buildAssemblyManifest(ASSEMBLE_FIXTURE, 'fixture.ts', ['assembled']);
    await expect(assembleFromManifest(manifest, 'assembled', new Map())).rejects.toThrow(
      /no resolution for non-splice slot/,
    );
  });
});

/**
 * Resolves `clientJs()`'s three chunk-composer slots (`coreClientJs()`/
 * `projectClientJs()`/`panelsClientJs()` — production load order, see
 * shell.ts's clientJs comment) from already-reconstructed per-feature
 * outputs plus the reconstructed `fleetJs`, mirroring `web/chunks.ts`'s own
 * membership data (imported constants, not the composed functions — the
 * reconstruction stays manifest-driven, never comparing clientJs to
 * itself). Requires `nestedOutputs` to already hold every feature fn's
 * output and `fleetJs`.
 */
function setChunkComposerOutputs(nestedOutputs: Map<string, string>): void {
  const chunkJoin = (names: readonly string[]): string =>
    names
      .map((n) => nestedOutputs.get((FEATURE_JS_BY_NAME[n] as () => string).name) as string)
      .join('\n');
  const deferred = new Set([...PROJECT_PAGE_FEATURES, ...DEFERRED_OPERATOR_FEATURES]);
  nestedOutputs.set(
    'coreClientJs',
    [
      nestedOutputs.get('fleetJs'),
      chunkJoin(Object.keys(FEATURE_JS_BY_NAME).filter((n) => !deferred.has(n))),
    ].join('\n'),
  );
  nestedOutputs.set('projectClientJs', chunkJoin(PROJECT_PAGE_FEATURES));
  nestedOutputs.set('panelsClientJs', chunkJoin(DEFERRED_OPERATOR_FEATURES));
}

describe("reconstructing shell.ts's one remaining bundle-composing function byte-for-byte from segments + slots", () => {
  // PARALLEL UNLOCK B's other half: findSpliceManifest proves WHAT a splice
  // resolves to; this proves the literal "glue" text around every splice is
  // itself mechanically capturable, and that segments + resolved slot values
  // reproduce the real function output exactly — the concrete precondition
  // docs/epics/0002-shell-decomposition.md flags as still open before a
  // future assembler can read a generated manifest instead of shell.ts's
  // ~4900 lines of hand-interleaved splice call sites + literal markup.
  // switcherJs, connectJs, flyJs, and searchJs — four of the original five —
  // moved to web/features/switcher.ts, web/features/connect.ts,
  // web/features/fly.ts, and web/features/search.ts (epic 0002's first four
  // real extractions) and get their own dedicated reconstruction coverage
  // below instead of running through SHELL_TS, since none of them is
  // declared there anymore.
  const SHELL_BUNDLE_FUNCTIONS: Record<string, () => string> = {
    fleetJs,
  };

  // fleetJs()'s bare `${REFRESH_MS}` (a same-file local const, no import at
  // all) and switcherJs()'s `${names}` (a local var holding
  // `JSON.stringify(THEME_NAMES)`, where THEME_NAMES is a *package* import
  // from `@autopilot/tokens`, not a relative one) are the two non-splice
  // substitutions across the original five functions. Any future
  // substitution this doesn't recognize fails loudly instead of silently
  // reconstructing wrong output.
  async function resolveNonSpliceSlot(
    fnName: string,
    exprText: string,
    original: string,
  ): Promise<unknown> {
    if (fnName === 'fleetJs' && exprText === 'REFRESH_MS') {
      return localTopLevelConstLiteral(original, 'REFRESH_MS', SHELL_TS);
    }
    if (fnName === 'switcherJs' && exprText === 'names') {
      const tokens = (await import('@autopilot/tokens')) as { THEME_NAMES: readonly string[] };
      return JSON.stringify(tokens.THEME_NAMES);
    }
    if (fnName === 'localeJs' && exprText === 'names') {
      const tokens = (await import('@autopilot/tokens')) as { LOCALE_NAMES: readonly string[] };
      return JSON.stringify(tokens.LOCALE_NAMES);
    }
    if (fnName === 'localeJs' && exprText === 'rtlNames') {
      const tokens = (await import('@autopilot/tokens')) as { RTL_LOCALES: readonly string[] };
      return JSON.stringify(tokens.RTL_LOCALES);
    }
    if (fnName === 'localeJs' && exprText === 'stringsEn') {
      const tokens = (await import('@autopilot/tokens')) as {
        STRINGS: Readonly<Record<string, Readonly<Record<string, string>>>>;
      };
      return JSON.stringify(tokens.STRINGS['en']);
    }
    if (fnName === 'localeDataJs' && exprText === 'json') {
      const tokens = (await import('@autopilot/tokens')) as {
        STRINGS: Readonly<Record<string, Readonly<Record<string, string>>>>;
      };
      const nonEnglish = Object.fromEntries(
        Object.entries(tokens.STRINGS).filter(([locale]) => locale !== 'en'),
      );
      return JSON.stringify(nonEnglish);
    }
    throw new Error(
      `${fnName}: no known resolution for non-splice slot \`${exprText}\` — a new substitution ` +
        'shape appeared; teach resolveNonSpliceSlot about it',
    );
  }

  /** switcherJs's own reconstruction, from its real file under web/features/. */
  async function reconstructSwitcherJs(): Promise<string> {
    const switcherSource = readFileSync(SWITCHER_TS, 'utf8');
    return (
      await assembleFunctionFromManifest(
        switcherSource,
        'switcherJs',
        new Map(),
        (exprText: string) => resolveNonSpliceSlot('switcherJs', exprText, switcherSource),
        SWITCHER_TS,
      )
    ).trim();
  }

  it('switcherJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/switcher.ts', async () => {
    expect(await reconstructSwitcherJs()).toBe(switcherJs());
  });

  it('switcherJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off switcher.ts', async () => {
    const switcherSource = readFileSync(SWITCHER_TS, 'utf8');
    const manifest = buildAssemblyManifest(switcherSource, SWITCHER_TS, ['switcherJs']);
    const reassembled = (
      await assembleFromManifest(manifest, 'switcherJs', new Map(), (exprText: string) =>
        resolveNonSpliceSlot('switcherJs', exprText, switcherSource),
      )
    ).trim();
    expect(reassembled).toBe(switcherJs());
  });

  /** localeJs's own reconstruction, from its real file under web/features/. */
  async function reconstructLocaleJs(): Promise<string> {
    const localeSource = readFileSync(LOCALE_TS, 'utf8');
    return (
      await assembleFunctionFromManifest(
        localeSource,
        'localeJs',
        new Map(),
        (exprText: string) => resolveNonSpliceSlot('localeJs', exprText, localeSource),
        LOCALE_TS,
      )
    ).trim();
  }

  it('localeJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/locale.ts', async () => {
    expect(await reconstructLocaleJs()).toBe(localeJs());
  });

  it('localeJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off locale.ts', async () => {
    const localeSource = readFileSync(LOCALE_TS, 'utf8');
    const manifest = buildAssemblyManifest(localeSource, LOCALE_TS, ['localeJs']);
    const reassembled = (
      await assembleFromManifest(manifest, 'localeJs', new Map(), (exprText: string) =>
        resolveNonSpliceSlot('localeJs', exprText, localeSource),
      )
    ).trim();
    expect(reassembled).toBe(localeJs());
  });

  /** localeDataJs's own reconstruction, from its real file under web/features/. */
  async function reconstructLocaleDataJs(): Promise<string> {
    const localeDataSource = readFileSync(LOCALE_DATA_TS, 'utf8');
    return (
      await assembleFunctionFromManifest(
        localeDataSource,
        'localeDataJs',
        new Map(),
        (exprText: string) => resolveNonSpliceSlot('localeDataJs', exprText, localeDataSource),
        LOCALE_DATA_TS,
      )
    ).trim();
  }

  it('localeDataJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/locale-data.ts', async () => {
    expect(await reconstructLocaleDataJs()).toBe(localeDataJs());
  });

  it('localeDataJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off locale-data.ts', async () => {
    const localeDataSource = readFileSync(LOCALE_DATA_TS, 'utf8');
    const manifest = buildAssemblyManifest(localeDataSource, LOCALE_DATA_TS, ['localeDataJs']);
    const reassembled = (
      await assembleFromManifest(manifest, 'localeDataJs', new Map(), (exprText: string) =>
        resolveNonSpliceSlot('localeDataJs', exprText, localeDataSource),
      )
    ).trim();
    expect(reassembled).toBe(localeDataJs());
  });

  /**
   * notificationsJs's own reconstruction, from its real file under
   * web/features/. Like connectJs, it carries real relative-import splices
   * (parseNotifySettings/isQuietHour/activeNotifyKeys/newNotifyEvents from
   * ../notifications.js), resolved against web/features/, and no non-splice
   * slots at all.
   */
  async function reconstructNotificationsJs(): Promise<string> {
    const notificationsSource = readFileSync(NOTIFICATIONS_TS, 'utf8');
    const spliceEntries = findSpliceManifest(notificationsSource, NOTIFICATIONS_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        notificationsSource,
        'notificationsJs',
        resolvedBindings,
        undefined,
        NOTIFICATIONS_TS,
      )
    ).trim();
  }

  /**
   * activityJs's own reconstruction, from its real file under web/features/.
   * It carries real relative-import splices of its own (phaseCounts/
   * phaseTipText/phaseDetailRows/PHASE_DETAIL_CAP from ../phase-rail.js,
   * activityFileNodes/DEFAULT_FILE_NODE_CAP from ../../shared/file-nodes.js,
   * fnodeTip from ../flight-map.js, activityLiveLabel from
   * ../activity-log.js), resolved against web/features/ rather than
   * SHELL_DIR, and no non-splice slots at all.
   */
  async function reconstructActivityJs(): Promise<string> {
    const activitySource = readFileSync(ACTIVITY_TS, 'utf8');
    const spliceEntries = findSpliceManifest(activitySource, ACTIVITY_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        activitySource,
        'activityJs',
        resolvedBindings,
        undefined,
        ACTIVITY_TS,
      )
    ).trim();
  }

  it('activityJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/activity.ts', async () => {
    expect(await reconstructActivityJs()).toBe(activityJs());
  });

  it('activityJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off activity.ts', async () => {
    const activitySource = readFileSync(ACTIVITY_TS, 'utf8');
    const manifest = buildAssemblyManifest(activitySource, ACTIVITY_TS, ['activityJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'activityJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(activityJs());
  });

  /**
   * backlogJs's own reconstruction, from its real file under web/features/.
   * Like roundPanelJs, it carries real relative-import splices of its own
   * (backlogMatchText from ../../shared/backlog-match.js, backlogCandidateMeta
   * from ../backlog-panel.js), resolved against web/features/ rather than
   * SHELL_DIR, and no non-splice slots at all.
   */
  async function reconstructBacklogJs(): Promise<string> {
    const backlogSource = readFileSync(BACKLOG_TS, 'utf8');
    const spliceEntries = findSpliceManifest(backlogSource, BACKLOG_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        backlogSource,
        'backlogJs',
        resolvedBindings,
        undefined,
        BACKLOG_TS,
      )
    ).trim();
  }

  it('backlogJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/backlog.ts', async () => {
    expect(await reconstructBacklogJs()).toBe(backlogJs());
  });

  it('backlogJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off backlog.ts', async () => {
    const backlogSource = readFileSync(BACKLOG_TS, 'utf8');
    const manifest = buildAssemblyManifest(backlogSource, BACKLOG_TS, ['backlogJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'backlogJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(backlogJs());
  });

  /**
   * connectJs's own reconstruction, from its real file under web/features/.
   * Unlike switcherJs, it carries real relative-import splices of its own
   * (connectModeMeta/connectStatusMeta/connectTestResultMeta), resolved
   * against web/features/ rather than SHELL_DIR, and no non-splice slots at
   * all.
   */
  async function reconstructConnectJs(): Promise<string> {
    const connectSource = readFileSync(CONNECT_TS, 'utf8');
    const spliceEntries = findSpliceManifest(connectSource, CONNECT_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        connectSource,
        'connectJs',
        resolvedBindings,
        undefined,
        CONNECT_TS,
      )
    ).trim();
  }

  it('connectJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/connect.ts', async () => {
    expect(await reconstructConnectJs()).toBe(connectJs());
  });

  it('connectJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off connect.ts', async () => {
    const connectSource = readFileSync(CONNECT_TS, 'utf8');
    const manifest = buildAssemblyManifest(connectSource, CONNECT_TS, ['connectJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'connectJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(connectJs());
  });

  /**
   * coordinationJs's own reconstruction, from its real file under
   * web/features/. It carries one real relative-import splice of its own
   * (coordinationLineMeta from ../coordination-panel.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots at all.
   */
  async function reconstructCoordinationJs(): Promise<string> {
    const coordinationSource = readFileSync(COORDINATION_TS, 'utf8');
    const spliceEntries = findSpliceManifest(coordinationSource, COORDINATION_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        coordinationSource,
        'coordinationJs',
        resolvedBindings,
        undefined,
        COORDINATION_TS,
      )
    ).trim();
  }

  it('coordinationJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/coordination.ts', async () => {
    expect(await reconstructCoordinationJs()).toBe(coordinationJs());
  });

  it('coordinationJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off coordination.ts', async () => {
    const coordinationSource = readFileSync(COORDINATION_TS, 'utf8');
    const manifest = buildAssemblyManifest(coordinationSource, COORDINATION_TS, ['coordinationJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'coordinationJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(coordinationJs());
  });

  /**
   * flyJs's own reconstruction, from its real file under web/features/.
   * Like connectJs, it carries real relative-import splices of its own
   * (eight, across flights.js/fly-hint.js/flight-progress.js), resolved
   * against web/features/ rather than SHELL_DIR, and no non-splice slots at
   * all.
   */
  async function reconstructFlyJs(): Promise<string> {
    const flySource = readFileSync(FLY_TS, 'utf8');
    const spliceEntries = findSpliceManifest(flySource, FLY_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(flySource, 'flyJs', resolvedBindings, undefined, FLY_TS)
    ).trim();
  }

  it('flyJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/fly.ts', async () => {
    expect(await reconstructFlyJs()).toBe(flyJs());
  });

  it('flyJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off fly.ts', async () => {
    const flySource = readFileSync(FLY_TS, 'utf8');
    const manifest = buildAssemblyManifest(flySource, FLY_TS, ['flyJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (await assembleFromManifest(manifest, 'flyJs', resolvedBindings)).trim();
    expect(reassembled).toBe(flyJs());
  });

  /**
   * searchJs's own reconstruction, from its real file under web/features/.
   * Like connectJs/flyJs, it carries real relative-import splices of its own
   * (twelve, across search-history.js/markdown.js/ask-stream.js), resolved
   * against web/features/ rather than SHELL_DIR, and no non-splice slots at
   * all.
   */
  async function reconstructSearchJs(): Promise<string> {
    const searchSource = readFileSync(SEARCH_TS, 'utf8');
    const spliceEntries = findSpliceManifest(searchSource, SEARCH_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        searchSource,
        'searchJs',
        resolvedBindings,
        undefined,
        SEARCH_TS,
      )
    ).trim();
  }

  it('searchJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/search.ts', async () => {
    expect(await reconstructSearchJs()).toBe(searchJs());
  });

  it('searchJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off search.ts', async () => {
    const searchSource = readFileSync(SEARCH_TS, 'utf8');
    const manifest = buildAssemblyManifest(searchSource, SEARCH_TS, ['searchJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (await assembleFromManifest(manifest, 'searchJs', resolvedBindings)).trim();
    expect(reassembled).toBe(searchJs());
  });

  /**
   * tourJs's own reconstruction, from its real file under web/features/.
   * Like connectJs/flyJs/searchJs, it carries real relative-import splices
   * of its own (TOUR_STEPS/tourStepMeta from ../tour.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots at all.
   */
  async function reconstructTourJs(): Promise<string> {
    const tourSource = readFileSync(TOUR_TS, 'utf8');
    const spliceEntries = findSpliceManifest(tourSource, TOUR_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(tourSource, 'tourJs', resolvedBindings, undefined, TOUR_TS)
    ).trim();
  }

  it('tourJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/tour.ts', async () => {
    expect(await reconstructTourJs()).toBe(tourJs());
  });

  it('tourJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off tour.ts', async () => {
    const tourSource = readFileSync(TOUR_TS, 'utf8');
    const manifest = buildAssemblyManifest(tourSource, TOUR_TS, ['tourJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (await assembleFromManifest(manifest, 'tourJs', resolvedBindings)).trim();
    expect(reassembled).toBe(tourJs());
  });

  /**
   * flightConsoleJs's own reconstruction, from its real file under
   * web/features/. Like tourJs, it carries a real relative-import splice of
   * its own (consoleLinesAriaLabel from ../console-panel.js), resolved
   * against web/features/ rather than SHELL_DIR, and no non-splice slots at
   * all.
   */
  async function reconstructFlightConsoleJs(): Promise<string> {
    const flightConsoleSource = readFileSync(FLIGHT_CONSOLE_TS, 'utf8');
    const spliceEntries = findSpliceManifest(flightConsoleSource, FLIGHT_CONSOLE_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        flightConsoleSource,
        'flightConsoleJs',
        resolvedBindings,
        undefined,
        FLIGHT_CONSOLE_TS,
      )
    ).trim();
  }

  it('flightConsoleJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/flight-console.ts', async () => {
    expect(await reconstructFlightConsoleJs()).toBe(flightConsoleJs());
  });

  it('flightConsoleJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off flight-console.ts', async () => {
    const flightConsoleSource = readFileSync(FLIGHT_CONSOLE_TS, 'utf8');
    const manifest = buildAssemblyManifest(flightConsoleSource, FLIGHT_CONSOLE_TS, [
      'flightConsoleJs',
    ]);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'flightConsoleJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(flightConsoleJs());
  });

  /**
   * docsViewerJs's own reconstruction, from its real file under
   * web/features/. Like flightConsoleJs, it carries a real relative-import
   * splice of its own (docFileTip from ../docs-panel.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots at all.
   */
  async function reconstructDocsViewerJs(): Promise<string> {
    const docsViewerSource = readFileSync(DOCS_VIEWER_TS, 'utf8');
    const spliceEntries = findSpliceManifest(docsViewerSource, DOCS_VIEWER_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        docsViewerSource,
        'docsViewerJs',
        resolvedBindings,
        undefined,
        DOCS_VIEWER_TS,
      )
    ).trim();
  }

  it('docsViewerJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/docs-viewer.ts', async () => {
    expect(await reconstructDocsViewerJs()).toBe(docsViewerJs());
  });

  it('docsViewerJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off docs-viewer.ts', async () => {
    const docsViewerSource = readFileSync(DOCS_VIEWER_TS, 'utf8');
    const manifest = buildAssemblyManifest(docsViewerSource, DOCS_VIEWER_TS, ['docsViewerJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'docsViewerJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(docsViewerJs());
  });

  /**
   * roundPanelJs's own reconstruction, from its real file under
   * web/features/. Like docsViewerJs, it carries real relative-import
   * splices of its own (roundSinceLabel/roundStatItems from
   * ../stat-tiles.js), resolved against web/features/ rather than
   * SHELL_DIR, and no non-splice slots at all.
   */
  /** reportCaptureClientJs's own reconstruction, from its real file under
   *  web/features/ — same splice-binding shape as its siblings, resolved
   *  against web/features/ (its splices resolve one level up, into
   *  ../report-capture.js, the same as reportMenuJs's own report-panel.js
   *  splices). */
  async function reconstructReportCaptureClientJs(): Promise<string> {
    const reportCaptureClientSource = readFileSync(REPORT_CAPTURE_CLIENT_TS, 'utf8');
    const spliceEntries = findSpliceManifest(reportCaptureClientSource, REPORT_CAPTURE_CLIENT_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        reportCaptureClientSource,
        'reportCaptureClientJs',
        resolvedBindings,
        resolveReportCaptureClientSlot,
        REPORT_CAPTURE_CLIENT_TS,
      )
    ).trim();
  }

  /** reportCaptureClientJs's three own module-scope numeric constants,
   *  spliced as bare identifiers into its template literal rather than as
   *  relative-import bindings — resolveManifestBindings only resolves
   *  cross-file splices, so these need their own tiny local resolver, the
   *  same shape shell.ts's own `resolveNonSpliceSlot` provides for its
   *  local consts. */
  function resolveReportCaptureClientSlot(exprText: string): string {
    if (exprText === 'REPORT_CAPTURE_MAX_DEPTH') return '4';
    if (exprText === 'REPORT_CAPTURE_MAX_CHILDREN') return '12';
    if (exprText === 'REPORT_CAPTURE_CONSOLE_ERROR_CAPACITY') return '20';
    throw new Error(`reportCaptureClientJs: no resolution for non-splice slot \`${exprText}\``);
  }

  it('reportCaptureClientJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/report-capture-client.ts', async () => {
    expect(await reconstructReportCaptureClientJs()).toBe(reportCaptureClientJs());
  });

  it('reportCaptureClientJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off report-capture-client.ts', async () => {
    const reportCaptureClientSource = readFileSync(REPORT_CAPTURE_CLIENT_TS, 'utf8');
    const manifest = buildAssemblyManifest(reportCaptureClientSource, REPORT_CAPTURE_CLIENT_TS, [
      'reportCaptureClientJs',
    ]);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(
        manifest,
        'reportCaptureClientJs',
        resolvedBindings,
        resolveReportCaptureClientSlot,
      )
    ).trim();
    expect(reassembled).toBe(reportCaptureClientJs());
  });

  /** reportMenuJs's own reconstruction, from its real file under
   *  web/features/ — same splice-binding shape as its siblings, resolved
   *  against web/features/ (its four report-panel.js splices plus
   *  report-capture.js's formatCapturedReportContext), plus its one
   *  non-splice slot: REPORT_MENU_EDITABLE_SELECTOR, a same-file local
   *  const spliced as `JSON.stringify(REPORT_MENU_EDITABLE_SELECTOR)`
   *  rather than a relative-import binding. */
  async function reconstructReportMenuJs(): Promise<string> {
    const reportMenuSource = readFileSync(REPORT_MENU_TS, 'utf8');
    const spliceEntries = findSpliceManifest(reportMenuSource, REPORT_MENU_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        reportMenuSource,
        'reportMenuJs',
        resolvedBindings,
        resolveReportMenuSlot,
        REPORT_MENU_TS,
      )
    ).trim();
  }

  function resolveReportMenuSlot(exprText: string): string {
    if (exprText === 'JSON.stringify(REPORT_MENU_EDITABLE_SELECTOR)') {
      return JSON.stringify('input, textarea, select, [contenteditable="true"]');
    }
    throw new Error(`reportMenuJs: no resolution for non-splice slot \`${exprText}\``);
  }

  it('reportMenuJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/report-menu.ts', async () => {
    expect(await reconstructReportMenuJs()).toBe(reportMenuJs());
  });

  it('reportMenuJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off report-menu.ts', async () => {
    const reportMenuSource = readFileSync(REPORT_MENU_TS, 'utf8');
    const manifest = buildAssemblyManifest(reportMenuSource, REPORT_MENU_TS, ['reportMenuJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'reportMenuJs', resolvedBindings, resolveReportMenuSlot)
    ).trim();
    expect(reassembled).toBe(reportMenuJs());
  });

  async function reconstructActivityHeatmapJs(): Promise<string> {
    const activityHeatmapSource = readFileSync(ACTIVITY_HEATMAP_TS, 'utf8');
    const spliceEntries = findSpliceManifest(activityHeatmapSource, ACTIVITY_HEATMAP_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        activityHeatmapSource,
        'activityHeatmapJs',
        resolvedBindings,
        undefined,
        ACTIVITY_HEATMAP_TS,
      )
    ).trim();
  }

  it('activityHeatmapJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/activity-heatmap.ts', async () => {
    expect(await reconstructActivityHeatmapJs()).toBe(activityHeatmapJs());
  });

  it('activityHeatmapJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off activity-heatmap.ts', async () => {
    const activityHeatmapSource = readFileSync(ACTIVITY_HEATMAP_TS, 'utf8');
    const manifest = buildAssemblyManifest(activityHeatmapSource, ACTIVITY_HEATMAP_TS, [
      'activityHeatmapJs',
    ]);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'activityHeatmapJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(activityHeatmapJs());
  });

  async function reconstructRoundPanelJs(): Promise<string> {
    const roundPanelSource = readFileSync(ROUND_PANEL_TS, 'utf8');
    const spliceEntries = findSpliceManifest(roundPanelSource, ROUND_PANEL_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        roundPanelSource,
        'roundPanelJs',
        resolvedBindings,
        undefined,
        ROUND_PANEL_TS,
      )
    ).trim();
  }

  it('roundPanelJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/round-panel.ts', async () => {
    expect(await reconstructRoundPanelJs()).toBe(roundPanelJs());
  });

  it('roundPanelJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off round-panel.ts', async () => {
    const roundPanelSource = readFileSync(ROUND_PANEL_TS, 'utf8');
    const manifest = buildAssemblyManifest(roundPanelSource, ROUND_PANEL_TS, ['roundPanelJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'roundPanelJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(roundPanelJs());
  });

  /**
   * processHealthJs's own reconstruction, from its real file under
   * web/features/. Like roundPanelJs, it carries real relative-import splices
   * of its own (doraTileItems/gateParallelTileItems/warmSessionTileItems from
   * ../stat-tiles.js), resolved against web/features/ rather than SHELL_DIR,
   * and no non-splice slots at all — even though it composes THREE section
   * functions rather than one, the assembler shape is identical.
   */
  async function reconstructProcessHealthJs(): Promise<string> {
    const processHealthSource = readFileSync(PROCESS_HEALTH_TS, 'utf8');
    const spliceEntries = findSpliceManifest(processHealthSource, PROCESS_HEALTH_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        processHealthSource,
        'processHealthJs',
        resolvedBindings,
        undefined,
        PROCESS_HEALTH_TS,
      )
    ).trim();
  }

  it('processHealthJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/process-health.ts', async () => {
    expect(await reconstructProcessHealthJs()).toBe(processHealthJs());
  });

  it('processHealthJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off process-health.ts', async () => {
    const processHealthSource = readFileSync(PROCESS_HEALTH_TS, 'utf8');
    const manifest = buildAssemblyManifest(processHealthSource, PROCESS_HEALTH_TS, [
      'processHealthJs',
    ]);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'processHealthJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(processHealthJs());
  });

  /**
   * evolutionJs's own reconstruction, from its real file under
   * web/features/. Like processHealthJs, publicityJs, it carries real relative-import
   * splices of its own (EVAL_TREND_WEEKS/EVAL_TREND_DAY_MS/
   * EVAL_TREND_WEEK_MS/EVAL_TREND_FLAT_BAND/evalDayTs/evalDayKey/
   * evalWeekStart/evaluationTrendWeeks/evaluationTrendSummary/
   * evaluationTrendWeekTip/evaluationTrendLabel from ../evaluation-trend.js,
   * evaluationTrendTileItems from ../stat-tiles.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots at all —
   * even though it composes TWO section functions rather than one, the
   * assembler shape is identical.
   */
  async function reconstructEvolutionJs(): Promise<string> {
    const evolutionSource = readFileSync(EVOLUTION_TS, 'utf8');
    const spliceEntries = findSpliceManifest(evolutionSource, EVOLUTION_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        evolutionSource,
        'evolutionJs',
        resolvedBindings,
        undefined,
        EVOLUTION_TS,
      )
    ).trim();
  }

  it('evolutionJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/evolution.ts', async () => {
    expect(await reconstructEvolutionJs()).toBe(evolutionJs());
  });

  it('evolutionJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off evolution.ts', async () => {
    const evolutionSource = readFileSync(EVOLUTION_TS, 'utf8');
    const manifest = buildAssemblyManifest(evolutionSource, EVOLUTION_TS, ['evolutionJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'evolutionJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(evolutionJs());
  });

  /**
   * firingTimelineJs's own reconstruction, from its real file under
   * web/features/. Like backlogJs/officeMapJs, pipelineJs, it carries real
   * relative-import splices of its own (groupByFiring/firingLogEntry from
   * ../activity-log.js, trajectorySignalOf/firingTimelineRowMeta from
   * ../flight-metrics.js, diffLineClass/diffLinesForStep/diffToggleTip from
   * ../diff-view.js, clampReplayStep/replayNav from ../replay-nav.js),
   * resolved against web/features/ rather than SHELL_DIR, and no non-splice
   * slots at all.
   */
  async function reconstructFiringTimelineJs(): Promise<string> {
    const firingTimelineSource = readFileSync(FIRING_TIMELINE_TS, 'utf8');
    const spliceEntries = findSpliceManifest(firingTimelineSource, FIRING_TIMELINE_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        firingTimelineSource,
        'firingTimelineJs',
        resolvedBindings,
        undefined,
        FIRING_TIMELINE_TS,
      )
    ).trim();
  }

  it('firingTimelineJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/firing-timeline.ts', async () => {
    expect(await reconstructFiringTimelineJs()).toBe(firingTimelineJs());
  });

  it('firingTimelineJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off firing-timeline.ts', async () => {
    const firingTimelineSource = readFileSync(FIRING_TIMELINE_TS, 'utf8');
    const manifest = buildAssemblyManifest(firingTimelineSource, FIRING_TIMELINE_TS, [
      'firingTimelineJs',
    ]);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'firingTimelineJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(firingTimelineJs());
  });

  /**
   * metricsJs's own reconstruction, from its real file under web/features/.
   * Like evolutionJs, firingTimelineJs, it carries real relative-import splices of its own
   * (timelineSegments from ../timeline-strip.js, metricsStatItems/
   * modelMixItems/modelMixChipMeta from ../stat-tiles.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots at all —
   * even though it composes THREE functions (costSparkline/
   * flightTimelineStrip/metricsSection) rather than one, the assembler shape
   * is identical.
   */
  async function reconstructMetricsJs(): Promise<string> {
    const metricsSource = readFileSync(METRICS_TS, 'utf8');
    const spliceEntries = findSpliceManifest(metricsSource, METRICS_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        metricsSource,
        'metricsJs',
        resolvedBindings,
        undefined,
        METRICS_TS,
      )
    ).trim();
  }

  it('metricsJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/metrics.ts', async () => {
    expect(await reconstructMetricsJs()).toBe(metricsJs());
  });

  it('metricsJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off metrics.ts', async () => {
    const metricsSource = readFileSync(METRICS_TS, 'utf8');
    const manifest = buildAssemblyManifest(metricsSource, METRICS_TS, ['metricsJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'metricsJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(metricsJs());
  });

  /**
   * issueTriageJs's own reconstruction, from its real file under
   * web/features/. It carries four real relative-import splices of its own
   * (issueTriageDecisionLabel/issueTriageConfirmMessage/
   * issueTriageExecuteResult/issueTriageExecuteTip from
   * ../issue-triage-panel.js), resolved against web/features/ rather than
   * SHELL_DIR, and no non-splice slots — unlike roundPanelJs, it does NOT
   * splice decisionItemHeadMeta itself; that call stays a bare identifier
   * relying on SHELL_TS's own splice of it (verified separately below).
   */
  async function reconstructIssueTriageJs(): Promise<string> {
    const issueTriageSource = readFileSync(ISSUE_TRIAGE_TS, 'utf8');
    const spliceEntries = findSpliceManifest(issueTriageSource, ISSUE_TRIAGE_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        issueTriageSource,
        'issueTriageJs',
        resolvedBindings,
        undefined,
        ISSUE_TRIAGE_TS,
      )
    ).trim();
  }

  it('issueTriageJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/issue-triage.ts', async () => {
    expect(await reconstructIssueTriageJs()).toBe(issueTriageJs());
  });

  it('issueTriageJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off issue-triage.ts', async () => {
    const issueTriageSource = readFileSync(ISSUE_TRIAGE_TS, 'utf8');
    const manifest = buildAssemblyManifest(issueTriageSource, ISSUE_TRIAGE_TS, ['issueTriageJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'issueTriageJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(issueTriageJs());
  });

  /**
   * landingJs's own reconstruction, from its real file under web/features/.
   * It carries real relative-import splices of its own
   * (landingDiffstatItems/landingCommitFilesMeta/landingOverlapItems/
   * landingWorktreeDivergence/landingCommitRuns/landingGroupHeadMeta/
   * landingExecuteResult/landingExecuteConfirmMessage/landingExecuteTip from
   * ../landing-panel.js, and flightDebriefOf/flightDebriefChipItems/
   * flightDebriefNotableItems from ../flight-debrief.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots — like
   * metricsJs, it composes several functions (landingCommitRow/
   * landingCommitGroupNode/flightDebriefSection/renderLandingBody/
   * landingSection) plus its own EXECUTE click handler as one assembler.
   */
  async function reconstructLandingJs(): Promise<string> {
    const landingSource = readFileSync(LANDING_TS, 'utf8');
    const spliceEntries = findSpliceManifest(landingSource, LANDING_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        landingSource,
        'landingJs',
        resolvedBindings,
        undefined,
        LANDING_TS,
      )
    ).trim();
  }

  it('landingJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/landing.ts', async () => {
    expect(await reconstructLandingJs()).toBe(landingJs());
  });

  it('landingJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off landing.ts', async () => {
    const landingSource = readFileSync(LANDING_TS, 'utf8');
    const manifest = buildAssemblyManifest(landingSource, LANDING_TS, ['landingJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'landingJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(landingJs());
  });

  /**
   * releaseJs's own reconstruction, from its real file under web/features/.
   * It carries real relative-import splices of its own
   * (releaseVersionItems/releaseExecuteTip/releaseExecuteResult/
   * releaseConfirmMessage from ../release-panel.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots — like
   * landingJs, it composes the panel's renderer/section functions
   * (renderReleaseBody/releaseSection) plus its own EXECUTE click handler as
   * one assembler.
   */
  async function reconstructReleaseJs(): Promise<string> {
    const releaseSource = readFileSync(RELEASE_TS, 'utf8');
    const spliceEntries = findSpliceManifest(releaseSource, RELEASE_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        releaseSource,
        'releaseJs',
        resolvedBindings,
        undefined,
        RELEASE_TS,
      )
    ).trim();
  }

  it('releaseJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/release.ts', async () => {
    expect(await reconstructReleaseJs()).toBe(releaseJs());
  });

  it('releaseJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off release.ts', async () => {
    const releaseSource = readFileSync(RELEASE_TS, 'utf8');
    const manifest = buildAssemblyManifest(releaseSource, RELEASE_TS, ['releaseJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'releaseJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(releaseJs());
  });

  /**
   * publicityJs's own reconstruction, from its real file under
   * web/features/. It carries a real relative-import splice of its own
   * (publicityAffordanceTip from ../publicity-panel.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots — like
   * roundPanelJs, it composes the panel's renderer plus its self-init loader
   * as one assembler, with no execute click handler and no poll timer.
   */
  async function reconstructPublicityJs(): Promise<string> {
    const publicitySource = readFileSync(PUBLICITY_TS, 'utf8');
    const spliceEntries = findSpliceManifest(publicitySource, PUBLICITY_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        publicitySource,
        'publicityJs',
        resolvedBindings,
        undefined,
        PUBLICITY_TS,
      )
    ).trim();
  }

  it('publicityJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/publicity.ts', async () => {
    expect(await reconstructPublicityJs()).toBe(publicityJs());
  });

  it('publicityJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off publicity.ts', async () => {
    const publicitySource = readFileSync(PUBLICITY_TS, 'utf8');
    const manifest = buildAssemblyManifest(publicitySource, PUBLICITY_TS, ['publicityJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'publicityJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(publicityJs());
  });

  /**
   * officeMapJs's own reconstruction, from its real file under web/features/.
   * It carries real relative-import splices of its own (OFFICE_PHASES/
   * OFFICE_LABELS/OFFICE_W/OFFICE_H/OFFICE_ZONE_W/OFFICE_ZONE_H/
   * OFFICE_ZONE_Y/OFFICE_GAP/OFFICE_IDLE_X/OFFICE_IDLE_Y/OFFICE_ANIM_MS/
   * OFFICE_SATELLITE_R/OFFICE_SATELLITE_ORBIT/officeZoneX/officeTargetFor/
   * officeEase/officeSatellitePos/officeTweenPos from ../office-map.js),
   * resolved against web/features/ rather than SHELL_DIR, and no non-splice
   * slots at all — like activityJs, it composes the panel's DOM-building
   * functions (officeSatellites/officeMapSection) plus a helper
   * (prefersReducedMotion) as one assembler, leaving OFFICE_TIPS behind in
   * SHELL_TS since liveWorkerCard/renderStatTiles/activityJs's own
   * phaseRail read it too.
   */
  async function reconstructOfficeMapJs(): Promise<string> {
    const officeMapSource = readFileSync(OFFICE_MAP_TS, 'utf8');
    const spliceEntries = findSpliceManifest(officeMapSource, OFFICE_MAP_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        officeMapSource,
        'officeMapJs',
        resolvedBindings,
        undefined,
        OFFICE_MAP_TS,
      )
    ).trim();
  }

  it('officeMapJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/office-map.ts', async () => {
    expect(await reconstructOfficeMapJs()).toBe(officeMapJs());
  });

  it('officeMapJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off office-map.ts', async () => {
    const officeMapSource = readFileSync(OFFICE_MAP_TS, 'utf8');
    const manifest = buildAssemblyManifest(officeMapSource, OFFICE_MAP_TS, ['officeMapJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'officeMapJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(officeMapJs());
  });

  /**
   * pipelineJs's own reconstruction, from its real file under web/features/.
   * It carries one real relative-import splice (pipelineApiUrl from
   * ../pipeline-panel.js), resolved against web/features/ rather than
   * SHELL_DIR, and no non-splice slots — same web/features/ assembler shape
   * as coordinationJs.
   */
  async function reconstructPipelineJs(): Promise<string> {
    const pipelineSource = readFileSync(PIPELINE_TS, 'utf8');
    const spliceEntries = findSpliceManifest(pipelineSource, PIPELINE_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        pipelineSource,
        'pipelineJs',
        resolvedBindings,
        undefined,
        PIPELINE_TS,
      )
    ).trim();
  }

  it('pipelineJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/pipeline.ts', async () => {
    expect(await reconstructPipelineJs()).toBe(pipelineJs());
  });

  it('pipelineJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off pipeline.ts', async () => {
    const pipelineSource = readFileSync(PIPELINE_TS, 'utf8');
    const manifest = buildAssemblyManifest(pipelineSource, PIPELINE_TS, ['pipelineJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'pipelineJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(pipelineJs());
  });

  /**
   * poolClientJs's own reconstruction, from its real file under
   * web/features/. It carries real relative-import splices of its own
   * (poolClaimDecisionLabel/poolClaimConfirmMessage/poolClaimExecuteResult/
   * poolClaimExecuteTip from ../pool-client-panel.js), resolved against
   * web/features/ rather than SHELL_DIR, and no non-splice slots — like
   * prReviewJs, it composes the panel's renderer functions
   * (refreshPoolClientProjectOptions/syncPoolClientProjects/
   * renderPoolClientPanel/loadPoolClientPanel) plus its own claim click
   * handler as one assembler, self-initializing at the end rather than being
   * called from renderProjectPage().
   */
  async function reconstructPoolClientJs(): Promise<string> {
    const poolClientSource = readFileSync(POOL_CLIENT_TS, 'utf8');
    const spliceEntries = findSpliceManifest(poolClientSource, POOL_CLIENT_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        poolClientSource,
        'poolClientJs',
        resolvedBindings,
        undefined,
        POOL_CLIENT_TS,
      )
    ).trim();
  }

  it('poolClientJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/pool-client.ts', async () => {
    expect(await reconstructPoolClientJs()).toBe(poolClientJs());
  });

  it('poolClientJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off pool-client.ts', async () => {
    const poolClientSource = readFileSync(POOL_CLIENT_TS, 'utf8');
    const manifest = buildAssemblyManifest(poolClientSource, POOL_CLIENT_TS, ['poolClientJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'poolClientJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(poolClientJs());
  });

  /**
   * prReviewJs's own reconstruction, from its real file under web/features/.
   * It carries real relative-import splices of its own
   * (prReviewDecisionLabel/prReviewConfirmMessage/prReviewExecuteResult/
   * prReviewExecuteTip from ../pr-review-panel.js, decisionItemHeadMeta from
   * ../decision-item.js), resolved against web/features/ rather than
   * SHELL_DIR, and no non-splice slots — like releaseJs, it composes the
   * panel's renderer functions (renderPrReviewPanel/loadPrReviewPanel) plus
   * its own EXECUTE click handler as one assembler, self-initializing at the
   * end rather than being called from renderProjectPage().
   */
  async function reconstructPrReviewJs(): Promise<string> {
    const prReviewSource = readFileSync(PR_REVIEW_TS, 'utf8');
    const spliceEntries = findSpliceManifest(prReviewSource, PR_REVIEW_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        prReviewSource,
        'prReviewJs',
        resolvedBindings,
        undefined,
        PR_REVIEW_TS,
      )
    ).trim();
  }

  it('prReviewJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/pr-review.ts', async () => {
    expect(await reconstructPrReviewJs()).toBe(prReviewJs());
  });

  it('prReviewJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off pr-review.ts', async () => {
    const prReviewSource = readFileSync(PR_REVIEW_TS, 'utf8');
    const manifest = buildAssemblyManifest(prReviewSource, PR_REVIEW_TS, ['prReviewJs']);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'prReviewJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(prReviewJs());
  });

  /**
   * flightSummaryJs's own reconstruction, from its real file under
   * web/features/. Like flightConsoleJs, it carries real relative-import
   * splices of its own (finishedFlightSummaries from
   * ../../shared/flight-summary.js, flightSummaryLineMeta from
   * ../flight-summary-panel.js), resolved against web/features/ rather than
   * SHELL_DIR, and no non-splice slots at all.
   */
  async function reconstructFlightSummaryJs(): Promise<string> {
    const flightSummarySource = readFileSync(FLIGHT_SUMMARY_TS, 'utf8');
    const spliceEntries = findSpliceManifest(flightSummarySource, FLIGHT_SUMMARY_TS);
    const resolvedBindings = await resolveManifestBindings(spliceEntries, FEATURES_DIR);
    return (
      await assembleFunctionFromManifest(
        flightSummarySource,
        'flightSummaryJs',
        resolvedBindings,
        undefined,
        FLIGHT_SUMMARY_TS,
      )
    ).trim();
  }

  it('flightSummaryJs: assembleFunctionFromManifest reproduces the real function output exactly, from web/features/flight-summary.ts', async () => {
    expect(await reconstructFlightSummaryJs()).toBe(flightSummaryJs());
  });

  it('flightSummaryJs: assembleFromManifest reproduces the real function output from a pre-built manifest built off flight-summary.ts', async () => {
    const flightSummarySource = readFileSync(FLIGHT_SUMMARY_TS, 'utf8');
    const manifest = buildAssemblyManifest(flightSummarySource, FLIGHT_SUMMARY_TS, [
      'flightSummaryJs',
    ]);
    const resolvedBindings = await resolveManifestBindings(manifest.entries, FEATURES_DIR);
    const reassembled = (
      await assembleFromManifest(manifest, 'flightSummaryJs', resolvedBindings)
    ).trim();
    expect(reassembled).toBe(flightSummaryJs());
  });

  it.each(Object.keys(SHELL_BUNDLE_FUNCTIONS))(
    '%s: assembleFunctionFromManifest reproduces the real function output exactly',
    async (fnName) => {
      const original = readFileSync(SHELL_TS, 'utf8');
      const spliceEntries = findSpliceManifest(original, SHELL_TS).filter(
        (e) => e.enclosingFunction === fnName,
      );
      const resolvedBindings = await resolveManifestBindings(spliceEntries, SHELL_DIR);

      const reassembled = (
        await assembleFunctionFromManifest(
          original,
          fnName,
          resolvedBindings,
          (exprText: string) => resolveNonSpliceSlot(fnName, exprText, original),
          SHELL_TS,
        )
      ).trim();
      const realOutput = SHELL_BUNDLE_FUNCTIONS[fnName];
      if (!realOutput) throw new Error(`no bundle function registered for ${fnName}`);
      expect(reassembled).toBe(realOutput());
    },
  );

  it.each(Object.keys(SHELL_BUNDLE_FUNCTIONS))(
    '%s: assembleFromManifest reproduces the real function output from a pre-built manifest, with no source re-parsing',
    async (fnName) => {
      const original = readFileSync(SHELL_TS, 'utf8');
      const manifest = buildAssemblyManifest(
        original,
        SHELL_TS,
        Object.keys(SHELL_BUNDLE_FUNCTIONS),
      );
      const spliceEntries = manifest.entries.filter((e) => e.enclosingFunction === fnName);
      const resolvedBindings = await resolveManifestBindings(spliceEntries, SHELL_DIR);

      const reassembled = (
        await assembleFromManifest(manifest, fnName, resolvedBindings, (exprText: string) =>
          resolveNonSpliceSlot(fnName, exprText, original),
        )
      ).trim();
      const realOutput = SHELL_BUNDLE_FUNCTIONS[fnName];
      if (!realOutput) throw new Error(`no bundle function registered for ${fnName}`);
      expect(reassembled).toBe(realOutput());
    },
  );

  it('accounts for every slot across the one remaining function as either a discovered splice or a known non-splice exception', async () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    let totalSlots = 0;
    let unaccounted = 0;
    for (const fnName of Object.keys(SHELL_BUNDLE_FUNCTIONS)) {
      const { slots } = captureAssemblySegments(original, fnName, SHELL_TS);
      const spliceEntries = findSpliceManifest(original, SHELL_TS).filter(
        (e) => e.enclosingFunction === fnName,
      );
      const splicePositions = new Set(spliceEntries.map((e) => e.position));
      totalSlots += slots.length;
      for (const slot of slots) {
        if (splicePositions.has(slot.position)) continue;
        try {
          await resolveNonSpliceSlot(fnName, slot.exprText, original);
        } catch {
          unaccounted += 1;
        }
      }
    }
    expect(totalSlots).toBeGreaterThan(100);
    expect(unaccounted).toBe(0);
  });

  // Shared by both reconstruction proofs below (the in-memory one and the
  // disk-round-trip one) — REGISTRY DERIVATION (web-mteostss-7u5oaq): before
  // this helper, each proof hand-listed the same 30 `nestedOutputs.set(name,
  // await reconstructNameJs())` lines and, in the disk-round-trip proof, a
  // second hand-ordered 30-line featureModulesJs join — a new feature module
  // meant editing four places in lockstep, and the round-trip proof's join
  // had silently drifted back to the exact "mid-alphabet insertion shifts
  // every line below it" fragility the in-memory proof's join was already
  // derived away from. One builder means one place to add a module's output,
  // and the join order is always derived fresh from discoverFeatureModules.
  async function buildNestedFeatureOutputs(): Promise<Map<string, string>> {
    const nestedOutputs = new Map<string, string>();
    nestedOutputs.set('switcherJs', await reconstructSwitcherJs());
    nestedOutputs.set('activityHeatmapJs', await reconstructActivityHeatmapJs());
    nestedOutputs.set('activityJs', await reconstructActivityJs());
    nestedOutputs.set('backlogJs', await reconstructBacklogJs());
    nestedOutputs.set('connectJs', await reconstructConnectJs());
    nestedOutputs.set('coordinationJs', await reconstructCoordinationJs());
    nestedOutputs.set('docsViewerJs', await reconstructDocsViewerJs());
    nestedOutputs.set('evolutionJs', await reconstructEvolutionJs());
    nestedOutputs.set('firingTimelineJs', await reconstructFiringTimelineJs());
    nestedOutputs.set('flightConsoleJs', await reconstructFlightConsoleJs());
    nestedOutputs.set('flightSummaryJs', await reconstructFlightSummaryJs());
    nestedOutputs.set('flyJs', await reconstructFlyJs());
    nestedOutputs.set('issueTriageJs', await reconstructIssueTriageJs());
    nestedOutputs.set('landingJs', await reconstructLandingJs());
    nestedOutputs.set('localeDataJs', await reconstructLocaleDataJs());
    nestedOutputs.set('localeJs', await reconstructLocaleJs());
    nestedOutputs.set('metricsJs', await reconstructMetricsJs());
    nestedOutputs.set('notificationsJs', await reconstructNotificationsJs());
    nestedOutputs.set('officeMapJs', await reconstructOfficeMapJs());
    nestedOutputs.set('pipelineJs', await reconstructPipelineJs());
    nestedOutputs.set('poolClientJs', await reconstructPoolClientJs());
    nestedOutputs.set('prReviewJs', await reconstructPrReviewJs());
    nestedOutputs.set('processHealthJs', await reconstructProcessHealthJs());
    nestedOutputs.set('publicityJs', await reconstructPublicityJs());
    nestedOutputs.set('releaseJs', await reconstructReleaseJs());
    nestedOutputs.set('reportCaptureClientJs', await reconstructReportCaptureClientJs());
    nestedOutputs.set('reportMenuJs', await reconstructReportMenuJs());
    nestedOutputs.set('roundPanelJs', await reconstructRoundPanelJs());
    nestedOutputs.set('searchJs', await reconstructSearchJs());
    nestedOutputs.set('tourJs', await reconstructTourJs());
    // featureModulesJs() (web/features/index.ts, generated) is
    // `FEATURE_MODULE_FUNCTIONS.map((fn) => fn()).join('\n')` — the same join,
    // over the same already-reconstructed outputs, in the same directory
    // order discoverFeatureModules(FEATURES_DIR) already proves correct
    // above ("discovers every web/features module by name"). A hand-ordered
    // 30-line list here would be the exact "mid-alphabet insertion shifts
    // every line below it" fragility this file's other tests were already
    // refactored away from — deriving the join order from
    // discoverFeatureModules instead means a new module needs no insertion
    // at any particular position.
    const featureModulesOutput = discoverFeatureModules(FEATURES_DIR)
      .flatMap((m) => m.functionNames)
      .map((fnName) => {
        const output = nestedOutputs.get(fnName);
        if (output === undefined) {
          throw new Error(`no reconstructed output registered for ${fnName}`);
        }
        return output;
      })
      .join('\n');
    nestedOutputs.set('featureModulesJs', featureModulesOutput);
    return nestedOutputs;
  }

  // discoverAssemblyFunctionNames finds three assembler-shaped functions in
  // shell.ts now (switcherJs, connectJs, flyJs, and searchJs moved out), not
  // just this one — clientJs() (the served bundle) and renderShell() (the
  // full HTML document) assemble THEM rather than relative-import splices.
  // Both are only proven "capturable without throwing" above; clientJs()'s
  // five slots (`${switcherJs()}`, ...) are a genuinely different shape
  // findSpliceManifest doesn't classify at all — same-file-text function
  // calls, not relative-import splices, regardless of which file the callee
  // is actually declared in — so this proves the manifest-driven assembler
  // composes two levels deep: each nested function reconstructed from its
  // own splice entries and glue segments (the same proof above, or from its
  // own file for switcherJs/connectJs/flyJs/searchJs), then clientJs()
  // reconstructed from THOSE already-assembled (and internally `.trim()`-ed,
  // matching each function's own `.trim()`-wrapped return) outputs, with no
  // fallback to calling the real functions directly. renderShell() stays a
  // documented follow-on: its slots include local variables computed from
  // function calls (`v`/`anchor`) and a `.map().join()` expression,
  // non-splice shapes this suite's resolver doesn't yet know.
  it('clientJs: reconstructs the served bundle by composing its five nested assembler functions purely from the manifest', async () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    const manifest = buildAssemblyManifest(original, SHELL_TS, [
      ...Object.keys(SHELL_BUNDLE_FUNCTIONS),
      'clientJs',
    ]);

    const nestedOutputs = await buildNestedFeatureOutputs();
    for (const fnName of Object.keys(SHELL_BUNDLE_FUNCTIONS)) {
      const spliceEntries = manifest.entries.filter((e) => e.enclosingFunction === fnName);
      const resolvedBindings = await resolveManifestBindings(spliceEntries, SHELL_DIR);
      const output = await assembleFromManifest(manifest, fnName, resolvedBindings, (exprText) =>
        resolveNonSpliceSlot(fnName, exprText, original),
      );
      nestedOutputs.set(fnName, output.trim());
    }
    setChunkComposerOutputs(nestedOutputs);

    const clientOutput = await assembleFromManifest(manifest, 'clientJs', new Map(), (exprText) => {
      const fnName = exprText.replace(/\(\)$/, '');
      const nested = nestedOutputs.get(fnName);
      if (nested === undefined) {
        throw new Error(`clientJs: no known resolution for non-splice slot \`${exprText}\``);
      }
      return nested;
    });

    expect(clientOutput).toBe(clientJs());
  });

  describe('disk round trip — the manifest main() actually writes', () => {
    // assembleFromManifest's own doc comment claims a manifest works "exactly
    // as it would be read back from a written-to-disk JSON file" — every
    // reconstruction test above hands assembleFromManifest the live in-memory
    // object buildAssemblyManifest returned, so that claim has never actually
    // been exercised through real serialization. This proves what
    // generate-splice-manifest.mjs's own main() writes via
    // `JSON.stringify(manifest, null, 2)` and a future consumer would read
    // back via `JSON.parse` reconstructs correctly for both shapes already
    // proven in memory: a flat function with real splices plus a non-splice
    // slot (fleetJs), and a two-level composition of nested assembler calls
    // (clientJs).
    let outputDir: string;

    afterEach(() => {
      if (outputDir) rmSync(outputDir, { recursive: true, force: true });
    });

    function roundTripThroughDisk(manifest: AssemblyManifest): AssemblyManifest {
      outputDir = mkdtempSync(path.join(tmpdir(), 'splice-manifest-'));
      const manifestPath = path.join(outputDir, 'manifest.json');
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      return JSON.parse(readFileSync(manifestPath, 'utf8')) as AssemblyManifest;
    }

    it('reconstructs fleetJs() from a manifest round-tripped through real JSON.stringify/JSON.parse', async () => {
      const original = readFileSync(SHELL_TS, 'utf8');
      const manifest = buildAssemblyManifest(
        original,
        SHELL_TS,
        Object.keys(SHELL_BUNDLE_FUNCTIONS),
      );
      const roundTripped = roundTripThroughDisk(manifest);

      const spliceEntries = roundTripped.entries.filter((e) => e.enclosingFunction === 'fleetJs');
      const resolvedBindings = await resolveManifestBindings(spliceEntries, SHELL_DIR);
      const reassembled = (
        await assembleFromManifest(roundTripped, 'fleetJs', resolvedBindings, (exprText) =>
          resolveNonSpliceSlot('fleetJs', exprText, original),
        )
      ).trim();
      expect(reassembled).toBe(fleetJs());
    });

    it('reconstructs clientJs() two levels deep from the same round-tripped manifest', async () => {
      const original = readFileSync(SHELL_TS, 'utf8');
      const manifest = buildAssemblyManifest(original, SHELL_TS, [
        ...Object.keys(SHELL_BUNDLE_FUNCTIONS),
        'clientJs',
      ]);
      const roundTripped = roundTripThroughDisk(manifest);

      const nestedOutputs = await buildNestedFeatureOutputs();
      for (const fnName of Object.keys(SHELL_BUNDLE_FUNCTIONS)) {
        const spliceEntries = roundTripped.entries.filter((e) => e.enclosingFunction === fnName);
        const resolvedBindings = await resolveManifestBindings(spliceEntries, SHELL_DIR);
        const output = await assembleFromManifest(
          roundTripped,
          fnName,
          resolvedBindings,
          (exprText) => resolveNonSpliceSlot(fnName, exprText, original),
        );
        nestedOutputs.set(fnName, output.trim());
      }
      setChunkComposerOutputs(nestedOutputs);

      const clientOutput = await assembleFromManifest(
        roundTripped,
        'clientJs',
        new Map(),
        (exprText) => {
          const fnName = exprText.replace(/\(\)$/, '');
          const nested = nestedOutputs.get(fnName);
          if (nested === undefined) {
            throw new Error(`clientJs: no known resolution for non-splice slot \`${exprText}\``);
          }
          return nested;
        },
      );

      expect(clientOutput).toBe(clientJs());
    });
  });
});

describe("reconstructing shell.ts's renderShell() byte-for-byte — the documented follow-on", () => {
  // The clientJs() suite above left renderShell() as an explicit follow-on:
  // none of its 6 slots are relative-import splices (findSpliceManifest
  // returns zero entries for it) — every one is a genuinely different
  // non-splice shape: a package-import binding used bare (`DEFAULT_THEME`), a
  // `.map().join()` expression over a relative-import array
  // (`PRELOAD_FONT_PATHS`), a same-file exported function call assigned to a
  // local (`v` = `assetVersion()`, appearing twice), a local var computed from
  // a ternary + an imported helper (`anchor`, via `escapeAttr`), and an
  // imported helper call itself (`themeButtons()`). `escapeAttr`/`themeButtons`
  // used to be same-file unexported helpers this resolver had to replicate by
  // formula; now that they're real exports of `web/shell-html.ts` (epic 0002
  // follow-on, mirroring layoutCss's own move), it calls the real functions
  // directly instead — the same "real compiled source, not a hand-retyped
  // copy" contract every splice in this epic already uses, closing the one
  // remaining hand-replicated formula pair in this suite.
  async function resolveRenderShellSlot(
    exprText: string,
    project: string | undefined,
  ): Promise<unknown> {
    if (exprText === 'v') return assetVersion();
    if (exprText.includes('/project.js')) {
      // the conditional project-chunk script tag (web/chunks.ts code split):
      // emitted only when the shell carries a data-project anchor.
      return project !== undefined
        ? `\n  <script src="/project.js?v=${assetVersion()}" defer></script>`
        : '';
    }
    if (exprText === 'anchor') {
      return project !== undefined ? ` data-project="${escapeAttr(project)}"` : '';
    }
    if (exprText === 'DEFAULT_THEME') {
      const tokens = (await import('@autopilot/tokens')) as { DEFAULT_THEME: string };
      return tokens.DEFAULT_THEME;
    }
    if (exprText === 'themeButtons()') {
      return themeButtons();
    }
    if (exprText === 'langButtons()') {
      return langButtons();
    }
    if (exprText === 'gogglesMarkInlineSvg()') {
      return gogglesMarkInlineSvg();
    }
    if (exprText.includes('PRELOAD_FONT_PATHS')) {
      return PRELOAD_FONT_PATHS.map(
        (p) =>
          `<link rel="preload" href="${p}" as="font" type="font/woff2" crossorigin="anonymous" />`,
      ).join('\n  ');
    }
    throw new Error(
      `renderShell: no known resolution for non-splice slot \`${exprText}\` — a new ` +
        'substitution shape appeared; teach resolveRenderShellSlot about it',
    );
  }

  it.each([undefined, 'p1'])(
    'assembleFromManifest reproduces the real renderShell(%s) output exactly, from the manifest alone',
    async (project) => {
      const original = readFileSync(SHELL_TS, 'utf8');
      const manifest = buildAssemblyManifest(original, SHELL_TS, ['renderShell']);

      const reassembled = await assembleFromManifest(
        manifest,
        'renderShell',
        new Map(),
        (exprText) => resolveRenderShellSlot(exprText, project),
      );

      expect(reassembled).toBe(renderShell(project));
    },
  );

  it('has no relative-import splice entries — every one of its 6 slots is a non-splice shape', () => {
    const original = readFileSync(SHELL_TS, 'utf8');
    const spliceEntries = findSpliceManifest(original, SHELL_TS).filter(
      (e) => e.enclosingFunction === 'renderShell',
    );
    const { slots } = captureAssemblySegments(original, 'renderShell', SHELL_TS);
    expect(spliceEntries).toHaveLength(0);
    expect(slots.length).toBeGreaterThan(0);
  });
});

describe('CLI: main() — the codemod:splice-manifest npm script entry point', () => {
  // Every test above calls buildAssemblyManifest/discoverAssemblyFunctionNames
  // as library functions; main() itself (argv parsing, the usage-error exit,
  // wiring discoverAssemblyFunctionNames's result into buildAssemblyManifest,
  // the default-output-path fallback, and the console.log summary) has never
  // actually run under test — the "disk round trip" suite above only
  // replicates what main() writes via a hand-called JSON.stringify, it never
  // executes the CLI process real dev/CI workflows invoke through the
  // `codemod:splice-manifest` npm script. This closes that gap by running the
  // real script as a subprocess, the same "prove it end-to-end, not just its
  // pieces" shape this suite already applies to shell.ts's own splices.
  const CLI_SCRIPT = fileURLToPath(
    new URL('../../../../scripts/codemod/generate-splice-manifest.mjs', import.meta.url),
  );
  const CLI_FIXTURE = `import { helperA } from './helper-a.js';

export function assembler(): string {
  return \`head-\${helperA.toString()}-tail\`;
}
`;

  let workDir: string;

  afterEach(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  function writeFixtureFile(): string {
    workDir = mkdtempSync(path.join(tmpdir(), 'splice-manifest-cli-'));
    const inputFile = path.join(workDir, 'fixture.ts');
    writeFileSync(inputFile, CLI_FIXTURE, 'utf8');
    return inputFile;
  }

  it('exits 1 and prints usage to stderr when no input file is given', () => {
    expect.assertions(2);
    try {
      execFileSync(process.execPath, [CLI_SCRIPT], { encoding: 'utf8' });
    } catch (error) {
      const failure = error as { status: number; stderr: string };
      expect(failure.status).toBe(1);
      expect(failure.stderr).toContain(
        'Usage: node scripts/codemod/generate-splice-manifest.mjs <input-file-or-directory> [output-file]',
      );
    }
  });

  it('exits 1 and prints a clean error (not a raw stack trace) when the input file does not exist', () => {
    expect.assertions(3);
    workDir = mkdtempSync(path.join(tmpdir(), 'splice-manifest-cli-'));
    const missingFile = path.join(workDir, 'does-not-exist.ts');
    try {
      execFileSync(process.execPath, [CLI_SCRIPT, missingFile], { encoding: 'utf8' });
    } catch (error) {
      const failure = error as { status: number; stderr: string };
      expect(failure.status).toBe(1);
      expect(failure.stderr).toContain(`cannot read input file: ${missingFile}`);
      expect(failure.stderr).not.toContain('at main');
    }
  });

  it('exits 1 and prints a clean error (not a raw stack trace) when the output path cannot be written', () => {
    expect.assertions(3);
    const inputFile = writeFixtureFile();
    const outputFile = path.join(workDir, 'no-such-dir', 'out.json');
    try {
      execFileSync(process.execPath, [CLI_SCRIPT, inputFile, outputFile], { encoding: 'utf8' });
    } catch (error) {
      const failure = error as { status: number; stderr: string };
      expect(failure.status).toBe(1);
      expect(failure.stderr).toContain(`cannot write output file: ${outputFile}`);
      expect(failure.stderr).not.toContain('at main');
    }
  });

  it('writes a manifest to the given output path and prints a summary to stdout', () => {
    const inputFile = writeFixtureFile();
    const outputFile = path.join(workDir, 'out.json');

    const stdout = execFileSync(process.execPath, [CLI_SCRIPT, inputFile, outputFile], {
      encoding: 'utf8',
    });

    expect(stdout).toContain(
      'generate-splice-manifest OK: 1 splice site(s) across 1 assembler function(s)',
    );
    const written = JSON.parse(readFileSync(outputFile, 'utf8')) as AssemblyManifest;
    expect(written.entries).toHaveLength(1);
    expect(written.entries[0]?.localName).toBe('helperA');
    expect(Object.keys(written.functions)).toEqual(['assembler']);
  });

  it('defaults the output path to <input-file>.splice-manifest.json when none is given', () => {
    const inputFile = writeFixtureFile();
    const defaultOutput = `${inputFile}.splice-manifest.json`;

    execFileSync(process.execPath, [CLI_SCRIPT, inputFile], { encoding: 'utf8' });

    expect(existsSync(defaultOutput)).toBe(true);
    const written = JSON.parse(readFileSync(defaultOutput, 'utf8')) as AssemblyManifest;
    expect(written.sourceFile).toBe(inputFile);
  });

  it('the written manifest matches buildAssemblyManifest called directly on the same fixture', () => {
    const inputFile = writeFixtureFile();
    const outputFile = path.join(workDir, 'out.json');

    execFileSync(process.execPath, [CLI_SCRIPT, inputFile, outputFile], { encoding: 'utf8' });

    const written = JSON.parse(readFileSync(outputFile, 'utf8')) as AssemblyManifest;
    const expected = buildAssemblyManifest(
      CLI_FIXTURE,
      inputFile,
      discoverAssemblyFunctionNames(CLI_FIXTURE, inputFile),
    );
    expect(written).toEqual(expected);
  });

  // PARALLEL UNLOCK B's "nothing yet calls buildFeatureModulesManifest from
  // the CLI's main()" gap: giving main() a directory instead of a file must
  // route to the directory-glob discovery path and emit a
  // FeatureModulesManifest, not attempt to read the directory as source text.
  function writeFixtureFeaturesDir(): string {
    workDir = mkdtempSync(path.join(tmpdir(), 'splice-manifest-cli-'));
    const featuresDir = path.join(workDir, 'features');
    mkdirSync(featuresDir);
    writeFileSync(
      path.join(featuresDir, 'alpha.ts'),
      `export function alphaJs(): string {\n  return \`a-\${1}\`;\n}\n`,
      'utf8',
    );
    return featuresDir;
  }

  it('writes a FeatureModulesManifest and prints a summary when given a directory instead of a file', () => {
    const featuresDir = writeFixtureFeaturesDir();
    const outputFile = path.join(workDir, 'out.json');

    const stdout = execFileSync(process.execPath, [CLI_SCRIPT, featuresDir, outputFile], {
      encoding: 'utf8',
    });

    expect(stdout).toContain(
      'generate-splice-manifest OK: 1 feature module(s), 1 assembler function(s)',
    );
    const written = JSON.parse(readFileSync(outputFile, 'utf8')) as FeatureModulesManifest;
    expect(written.directoryPath).toBe(featuresDir);
    expect(written.modules).toHaveLength(1);
    expect(Object.keys(written.modules[0]!.functions)).toEqual(['alphaJs']);
  });

  it('defaults the output path to <directory>.feature-modules-manifest.json when a directory is given with no output path', () => {
    const featuresDir = writeFixtureFeaturesDir();
    const defaultOutput = `${featuresDir}.feature-modules-manifest.json`;

    execFileSync(process.execPath, [CLI_SCRIPT, featuresDir], { encoding: 'utf8' });

    expect(existsSync(defaultOutput)).toBe(true);
    const written = JSON.parse(readFileSync(defaultOutput, 'utf8')) as FeatureModulesManifest;
    expect(written.directoryPath).toBe(featuresDir);
  });

  it('the written FeatureModulesManifest matches buildFeatureModulesManifest called directly on the same fixture directory', () => {
    const featuresDir = writeFixtureFeaturesDir();
    const outputFile = path.join(workDir, 'out.json');

    execFileSync(process.execPath, [CLI_SCRIPT, featuresDir, outputFile], { encoding: 'utf8' });

    const written = JSON.parse(readFileSync(outputFile, 'utf8')) as FeatureModulesManifest;
    expect(written).toEqual(buildFeatureModulesManifest(featuresDir));
  });

  // `generateFeatureModulesIndexSource`'s own doc comment already documents
  // `--emit-index <features-dir>` as the way to regenerate its output, but
  // main() never implemented the flag — this closes that CLI-wiring gap
  // PARALLEL UNLOCK B left as an explicit follow-on.
  describe('--emit-index', () => {
    it('exits 1 and prints usage to stderr when no directory is given', () => {
      expect.assertions(2);
      try {
        execFileSync(process.execPath, [CLI_SCRIPT, '--emit-index'], { encoding: 'utf8' });
      } catch (error) {
        const failure = error as { status: number; stderr: string };
        expect(failure.status).toBe(1);
        expect(failure.stderr).toContain(
          'Usage: node scripts/codemod/generate-splice-manifest.mjs --emit-index <features-dir> [output-file]',
        );
      }
    });

    it('exits 1 and prints a clean error (not a raw stack trace) when the directory does not exist', () => {
      expect.assertions(3);
      workDir = mkdtempSync(path.join(tmpdir(), 'splice-manifest-cli-'));
      const missingDir = path.join(workDir, 'does-not-exist');
      try {
        execFileSync(process.execPath, [CLI_SCRIPT, '--emit-index', missingDir], {
          encoding: 'utf8',
        });
      } catch (error) {
        const failure = error as { status: number; stderr: string };
        expect(failure.status).toBe(1);
        expect(failure.stderr).toContain(`cannot read input directory: ${missingDir}`);
        expect(failure.stderr).not.toContain('at runEmitIndex');
      }
    });

    it('exits 1 with a clean error when given a file instead of a directory', () => {
      expect.assertions(2);
      const inputFile = writeFixtureFile();
      try {
        execFileSync(process.execPath, [CLI_SCRIPT, '--emit-index', inputFile], {
          encoding: 'utf8',
        });
      } catch (error) {
        const failure = error as { status: number; stderr: string };
        expect(failure.status).toBe(1);
        expect(failure.stderr).toContain(
          `--emit-index requires a directory, got a file: ${inputFile}`,
        );
      }
    });

    it('exits 1 and prints a clean error (not a raw stack trace) when the output path cannot be written', () => {
      expect.assertions(3);
      const featuresDir = writeFixtureFeaturesDir();
      const outputFile = path.join(workDir, 'no-such-dir', 'index.ts');
      try {
        execFileSync(process.execPath, [CLI_SCRIPT, '--emit-index', featuresDir, outputFile], {
          encoding: 'utf8',
        });
      } catch (error) {
        const failure = error as { status: number; stderr: string };
        expect(failure.status).toBe(1);
        expect(failure.stderr).toContain(`cannot write output file: ${outputFile}`);
        expect(failure.stderr).not.toContain('at runEmitIndex');
      }
    });

    it('writes the barrel source to the given output path and prints a summary to stdout', () => {
      const featuresDir = writeFixtureFeaturesDir();
      const outputFile = path.join(workDir, 'index.ts');

      const stdout = execFileSync(
        process.execPath,
        [CLI_SCRIPT, '--emit-index', featuresDir, outputFile],
        { encoding: 'utf8' },
      );

      expect(stdout).toContain('generate-splice-manifest OK: emitted a 1 feature module barrel');
      expect(readFileSync(outputFile, 'utf8')).toBe(generateFeatureModulesIndexSource(featuresDir));
    });

    it('defaults the output path to <directory>/index.ts when none is given', () => {
      const featuresDir = writeFixtureFeaturesDir();
      const defaultOutput = path.join(featuresDir, 'index.ts');

      execFileSync(process.execPath, [CLI_SCRIPT, '--emit-index', featuresDir], {
        encoding: 'utf8',
      });

      expect(existsSync(defaultOutput)).toBe(true);
      expect(readFileSync(defaultOutput, 'utf8')).toBe(
        generateFeatureModulesIndexSource(featuresDir),
      );
    });
  });
});
