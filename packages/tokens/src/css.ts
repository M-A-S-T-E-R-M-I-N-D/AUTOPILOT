// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { SPACE, RADIUS, TYPE, FONT, MOTION } from './scale.js';
import { COLOR_TOKENS, type Theme } from './color.js';
import { THEMES, THEME_NAMES } from './themes.js';
import { ELEVATION, SHAPE, DURATION, EASING, STATE_LAYER, TYPE_SCALE } from './m3.js';
import { stateRadius } from './mx.js';

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** The `--color-*` custom properties for one theme. */
export function colorVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const token of COLOR_TOKENS) out[`--color-${kebab(token)}`] = theme[token];
  return out;
}

/** MX shape-morphing (`./mx.js`'s `stateRadius`) as `--shape-{role}-hover`/
 *  `--shape-{role}-pressed` custom properties, one pair per `./m3.js` `SHAPE`
 *  role whose radius actually shifts (`stateRadius` no-ops `none`/`full`, so
 *  those two are skipped rather than emitting a redundant pair). */
export function shapeStateVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(SHAPE)) {
    if (v === '0' || v === '9999px') continue;
    const name = kebab(k);
    out[`--shape-${name}-hover`] = stateRadius(v, 'hover');
    out[`--shape-${name}-pressed`] = stateRadius(v, 'pressed');
  }
  return out;
}

/** The Material 3 `--elevation/--shape/--duration/--easing/--state/--type-*` properties. */
export function m3Vars(): Record<string, string> {
  const out: Record<string, string> = {};
  ELEVATION.forEach((level, i) => {
    out[`--elevation-level-${i}`] = level.shadow;
    out[`--elevation-tint-${i}`] = String(level.surfaceTint);
  });
  for (const [k, v] of Object.entries(SHAPE)) out[`--shape-${kebab(k)}`] = v;
  Object.assign(out, shapeStateVars());
  for (const [k, v] of Object.entries(DURATION)) out[`--duration-${kebab(k)}`] = `${v}ms`;
  for (const [k, v] of Object.entries(EASING)) out[`--easing-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(STATE_LAYER)) out[`--state-${kebab(k)}`] = String(v);
  for (const [role, spec] of Object.entries(TYPE_SCALE)) {
    const name = kebab(role);
    out[`--type-${name}-size`] = spec.size;
    out[`--type-${name}-line-height`] = spec.lineHeight;
    out[`--type-${name}-weight`] = String(spec.weight);
    out[`--type-${name}-tracking`] = spec.tracking;
  }
  return out;
}

/** The theme-invariant `--space/--radius/--text/--font/--duration/--ease` properties. */
export function globalVars(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(SPACE)) out[`--space-${k}`] = v;
  for (const [k, v] of Object.entries(RADIUS)) out[`--radius-${k}`] = v;
  for (const [k, v] of Object.entries(TYPE)) out[`--text-${k}`] = v;
  out['--font-sans'] = FONT.sans;
  out['--font-mono'] = FONT.mono;
  out['--font-m3'] = FONT.m3;
  out['--duration-fast'] = MOTION.fast;
  out['--duration-normal'] = MOTION.normal;
  out['--ease'] = MOTION.ease;
  return { ...out, ...m3Vars() };
}

function block(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `${selector} {\n${body}\n}`;
}

/** The full token stylesheet: global vars under `:root`, colors per `[data-theme]`. */
export function stylesheet(): string {
  const parts = [block(':root', globalVars())];
  for (const name of THEME_NAMES) {
    parts.push(block(`[data-theme='${name}']`, colorVars(THEMES[name])));
  }
  return `${parts.join('\n\n')}\n`;
}
