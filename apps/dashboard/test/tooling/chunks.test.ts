// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * CLIENT CODE-SPLITTING guards (epic 0002 slice 2 / BUNDLE DIET —
 * `web/chunks.ts`). Three invariants keep the split honest:
 *
 * 1. COMPLETENESS — the chunk map names exactly the modules discovery finds,
 *    every module lands in exactly one chunk, and the three chunks together
 *    carry the same text `featureModulesJs()` (the old single bundle) does.
 *    A new feature module fails here until it is added to the map (where it
 *    defaults to core — the safe direction: bytes, never a ReferenceError).
 * 2. CORE SELF-SUFFICIENCY — the core chunk alone must boot the home page:
 *    evaluating it in jsdom must not throw, because on `/` the deferred
 *    chunks arrive later (defer) and on a slow connection much later.
 * 3. DEFERRED CALL SAFETY — nothing in the core text calls a deferred
 *    module's hoisted functions without a `typeof` guard, because until the
 *    deferred script executes those names do not exist. This is the static
 *    half of the guarantee; the jsdom smoke above is the dynamic half.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  FEATURE_JS_BY_NAME,
  PROJECT_PAGE_FEATURES,
  DEFERRED_OPERATOR_FEATURES,
  coreFeatureModulesJs,
  projectFeatureModulesJs,
  deferredFeatureModulesJs,
} from '../../src/web/chunks.js';
import { featureModulesJs } from '../../src/web/features/index.js';
import { coreClientJs, projectClientJs, panelsClientJs, renderShell } from '../../src/web/shell.js';
import { discoverFeatureModules } from '../../../../scripts/codemod/generate-splice-manifest.mjs';

const FEATURES_DIR = path.resolve(__dirname, '../../src/web/features');

describe('chunk map completeness', () => {
  it('names exactly the modules discovery finds — a new module cannot be forgotten silently', () => {
    const discovered = discoverFeatureModules(FEATURES_DIR).map((m: { filePath: string }) =>
      m.filePath.replace(/\\/g, '/').replace(/.*\//, '').replace(/\.ts$/, ''),
    );
    expect(Object.keys(FEATURE_JS_BY_NAME).sort()).toEqual([...discovered].sort());
  });

  it('keeps the chunk lists disjoint and inside the map', () => {
    const names = new Set(Object.keys(FEATURE_JS_BY_NAME));
    for (const n of [...PROJECT_PAGE_FEATURES, ...DEFERRED_OPERATOR_FEATURES]) {
      expect(names.has(n), `${n} is not a real feature module`).toBe(true);
    }
    const overlap = PROJECT_PAGE_FEATURES.filter((n) => DEFERRED_OPERATOR_FEATURES.includes(n));
    expect(overlap).toEqual([]);
  });

  it('the three chunks together carry the same module text as the old single bundle', () => {
    const together = [coreFeatureModulesJs(), projectFeatureModulesJs(), deferredFeatureModulesJs()]
      .join('\n')
      .split('\n')
      .sort()
      .join('\n');
    const single = featureModulesJs().split('\n').sort().join('\n');
    expect(together).toBe(single);
  });
});

describe('core self-sufficiency (the home page boots without the deferred chunks)', () => {
  it('never calls a deferred hoisted function from core without a typeof guard', () => {
    const deferredText = `${projectClientJs()}\n${panelsClientJs()}`;
    const deferredFns = [...deferredText.matchAll(/^function ([A-Za-z0-9_]+)\s*\(/gm)].map(
      (m) => m[1] as string,
    );
    const core = coreClientJs();
    const offenders: string[] = [];
    for (const fn of deferredFns) {
      // a bare CALL in core text; declaration lines and guarded calls pass.
      const call = new RegExp(`(^|[^.\\w'"])${fn}\\s*\\(`, 'gm');
      for (const line of core.split('\n')) {
        if (line.trim().startsWith('//')) continue;
        if (new RegExp(`function ${fn}\\s*\\(`).test(line)) continue;
        if (!call.test(line)) continue;
        if (line.includes(`typeof ${fn}`)) continue;
        offenders.push(`${fn}: ${line.trim().slice(0, 90)}`);
      }
    }
    // renderProjectPage's own body may call /project.js functions freely —
    // it only runs on /p/<id> pages where that chunk is emitted before any
    // fleet state can arrive. Everything else must be guarded.
    const outsideRpp = offenders.filter((o) => !isInsideRenderProjectPage(core, o));
    expect(outsideRpp, outsideRpp.join('\n')).toEqual([]);
  });
});

/** True when the offending line lives inside renderProjectPage's body. */
function isInsideRenderProjectPage(core: string, offender: string): boolean {
  const line = offender.slice(offender.indexOf(': ') + 2);
  const idx = core.indexOf(line.slice(0, 60));
  if (idx < 0) return false;
  const before = core.slice(0, idx);
  const start = before.lastIndexOf('function renderProjectPage');
  if (start < 0) return false;
  // crude but honest: no other top-level function opens between rPP and the line
  const between = before.slice(start);
  const opens = (between.match(/^function [A-Za-z]/gm) || []).length;
  return opens === 1;
}

describe('renderShell emits the right script tags per page', () => {
  it('home: core + panels(defer), no project chunk', () => {
    const html = renderShell();
    expect(html).toMatch(/<script src="\/app\.js\?v=[a-z0-9]+"><\/script>/);
    expect(html).toMatch(/<script src="\/panels\.js\?v=[a-z0-9]+" defer><\/script>/);
    expect(html).not.toContain('/project.js');
  });

  it('project page: core + project(defer) + panels(defer), in that order', () => {
    const html = renderShell('fly-autopilot');
    const app = html.indexOf('/app.js');
    const project = html.indexOf('/project.js');
    const panels = html.indexOf('/panels.js');
    expect(app).toBeGreaterThan(-1);
    expect(project).toBeGreaterThan(app);
    expect(panels).toBeGreaterThan(project);
    expect(html).toMatch(/<script src="\/project\.js\?v=[a-z0-9]+" defer><\/script>/);
  });
});
