// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Cockpit MX redesign (epic 0005 slice 6, `docs/epics/0005-cockpit-redesign.md`):
 * the masthead Tour button (`.tour-btn`, `shell.ts`), the fly bar's Browse…
 * button (`#fly-browse-btn`), and the project card's Remove button
 * (`.card-remove`) each own a single `:hover` rule with no `:focus-visible`
 * twin — a keyboard-only operator tabbing to them gets none of the feedback a
 * mouse operator gets. Every sibling control that went through the slice-6
 * sweep (`.task-move` et al. in `task-board-shape-morph.test.ts`,
 * `.connect-test`, `.gh-issue-form button`, `.tour-actions button`) pairs the
 * two states in one selector list; these three were flagged as the remaining
 * hover-only stragglers by the firing-156 stylesheet audit (29040f59).
 *
 * A later audit found two more the sweep never reached: the browse-a-folder
 * modal's list buttons (`.browse-entry` — every subfolder plus the ".. (up)"
 * button — and `.browse-drive`, the drive switchers; `features/fly.ts`) carry
 * a hover wash with no `:focus-visible` twin, while their modal-mates
 * `.browse-actions button` pair both states in one selector list.
 *
 * A third audit found the M3 filled-button family (`.connect-form button`,
 * `.connect-login`, `.task-add button`, `.inbox-add button`,
 * `.soul-editor-form button`) split its own feedback: the shared `::after`
 * state-layer shine pairs `:hover`/`:focus-visible`/`:active` correctly, but
 * the sibling box-shadow elevation-lift rule right below it (`box-shadow:
 * var(--elevation-level-2)`) paired only `:hover` — a keyboard-only operator
 * tabbing to any of these five buttons got the subtle shine but not the
 * elevation depth cue a mouse operator gets.
 *
 * A fourth audit found the shape-morph + `--elevation-level-1` idiom's own
 * origin left OUT of its own pairing: `#fly-go`/`#fly-stop`/`#fly-pause`
 * (the fly bar's flight-control CTAs) and `.fly-flight-actions button` (a
 * live flight row's Pause/Stop) each carry a `:not(:disabled):hover` rule
 * with no `:focus-visible` twin — while every descendant that copied their
 * "structural twin" idiom (`#search-go`/`#ask-go`, `.landing-execute` et al,
 * `.task-move`) pairs both states correctly. A keyboard operator tabbing to
 * the buttons that actually start/stop/pause a flight got zero shape-morph
 * or elevation feedback.
 *
 * A fifth audit found two more classes of straggler: the SOUL governance
 * panel's `.soul-review-btn`/`.soul-ratify-btn`/`.soul-dismiss-btn`/
 * `.soul-unratify-btn` (each already pins hover/active designed states in
 * `soul-designed-states.test.ts`/`soul-review-btn-designed-states.test.ts`,
 * but neither test asserts a `:focus-visible` twin, so none ever grew one),
 * and two plain navigation anchors — the project card's title link
 * (`.card-link`, `shell.ts`'s `cardHead`) and the project page's "← Fleet"
 * back link (`.back a`) — whose hover-only underline+color feedback left a
 * keyboard operator tabbing to either link with zero visual confirmation
 * before pressing Enter to navigate.
 *
 * A sixth audit found `.switch button` — the masthead's Theme switch,
 * Language switch, and Ask-persona toggle (`shell.ts`) all render through
 * this one selector — carrying zero designed states at all, not just a
 * missing `:focus-visible` twin: no hover, no focus, no active, only
 * `cursor: pointer`. Structurally identical to `.tour-btn` (same
 * `--radius-full` pill, same rest colors), which already pairs both states
 * on one line — the fix reuses that exact idiom rather than inventing a
 * new one.
 *
 * A seventh audit found `.connect > summary` — the masthead's CONNECT
 * popover trigger (a real `<summary>` inside `<details class="connect">`,
 * `shell.ts`) — in the exact same shape: zero designed states, only
 * `cursor: pointer`. Structurally identical to `.switch button` fixed by
 * the sixth audit (same `--radius-full` pill, same rest colors
 * `color-text-muted`/transparent/`color-border`, and its own `[open]` state
 * playing the role `[aria-pressed='true']` plays there) — the fix reuses
 * that same idiom again.
 *
 * An eighth audit flipped the search: every prior finding was a `:hover`
 * rule missing its `:focus-visible` twin — a keyboard operator left out.
 * `.console-title` (the Flight console `<summary>`, `features/flight-console.ts`)
 * and `.report-title` (the report-from-here `<summary>`, `features/report.ts`)
 * are the mirror gap — a bare `:focus-visible { outline: ... }` rule with NO
 * `:hover` counterpart at all, so a MOUSE operator gets zero feedback that
 * these disclosure triangles are clickable. Both are structurally identical
 * to `.detail summary`/`.soul-editor-summary`/`.soul-proposal-summary`
 * (`layout-css.ts`) — the same `<summary>`-toggle role, already carrying the
 * full shape-morph + `--elevation-level-1` hover/focus-visible pair with
 * pressed-flat `:active` — so the fix reuses that idiom rather than
 * inventing a new one, and folds the standalone outline into it (the
 * background + shape-morph + elevation IS the focus indicator every sibling
 * summary relies on, not a separate outline rule).
 *
 * A ninth audit found the same mirror gap on `.spark-bar` (`layout-css.ts`,
 * the flight-history sparkline's SVG `rect`s) — a bare `:focus-visible {
 * outline: ... }` rule with no `:hover` counterpart, the identical shape
 * the eighth audit closed for `.console-title`/`.report-title`. But
 * `.spark-bar` is an SVG shape, not a text/background element: its own
 * epic note (0005-cockpit-redesign.md slice 6) left the fix open rather
 * than reusing the summary idiom verbatim, since box-shadow/background
 * feedback reads poorly on a handful-of-pixels-wide packed bar and would
 * also mask the bar's own semantic fill color (`.spark-shipped` et al.).
 * The fix instead pairs `:hover`/`:focus-visible` on an SVG-native `stroke`
 * outline — the fill/stroke idiom the note called for — so the verdict
 * color underneath stays legible while both a mouse and a keyboard
 * operator get the same highlighted-edge feedback.
 *
 * A tenth audit found the identical mirror gap on the other two focusable,
 * `data-tip`-carrying SVG `rect` families that predate `.spark-bar`'s fix:
 * `.heat-cell` (the contribution heatmap's day cells, `shell.ts`) and
 * `.eval-trend-bar`/`.eval-trend-empty` (the evolution trend's weekly bars
 * and no-verdicts baseline marker, `features/evolution.ts`) — each carries a
 * bare `:focus-visible { outline: ... }` rule with no `:hover` counterpart,
 * so a mouse operator hovering a tooltip-bearing cell gets no feedback that
 * it holds information. Same fix as `.spark-bar`: pair `:hover`/
 * `:focus-visible` on the SVG-native `stroke`/`stroke-width` idiom rather
 * than box-shadow/background, since these are dense packed-cell grids where
 * a background fill would mask the cell's own semantic verdict color.
 * A follow-up audit (firing 221) found the same gap on the fly bar's own
 * primary controls and the SOUL review surface: `#fly-go`/`#fly-stop`/
 * `#fly-pause`, `.fly-flight-actions button`, and `.soul-review-btn`/
 * `.soul-ratify-btn`/`.soul-dismiss-btn`/`.soul-unratify-btn` all carry the
 * MX shape-morph + elevation-lift treatment on `:hover` only — even though
 * their own structural twins (`#search-go`/`#ask-go`, `.task-move` et al.,
 * `.soul-proposal-summary`) already pair it with `:focus-visible`.
 *
 * The firing-236 stylesheet audit named the LAST hover-only stragglers —
 * `.card-link` (project-card title link), `.back a` (the inside page's back
 * link), and `.browse-entry`/`.browse-drive` (fly-bar folder-browse rows) —
 * but left the CSS to a later firing because sibling lanes held
 * layout-css.ts at the time (see the epic-0005 slice-6 log).
 */

import { describe, it, expect } from 'vitest';
import { layoutCss } from '../../src/web/layout-css.js';

// A selector may open its own rule (`sel {`) or sit in a shared selector
// list (`sel, other {`) — match either so combined hover/focus-visible
// rules resolve the same as standalone ones.
function ruleFor(css: string, selector: string): string {
  const braceIdx = css.indexOf(`${selector} {`);
  const commaIdx = css.indexOf(`${selector},`);
  const candidates = [braceIdx, commaIdx].filter((i) => i >= 0);
  const start = candidates.length > 0 ? Math.min(...candidates) : -1;
  expect(start, `rule containing "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf('}', start);
  return css.slice(start, end + 1);
}

// `.card-remove` later joined the MX designed-states family
// (card-remove-designed-states.test.ts), gaining the `:not(:disabled)` guard
// its siblings carry — the pairing assertion tracks the guarded selector.
describe.each([
  '.tour-btn',
  '#fly-browse-btn',
  '.card-remove:not(:disabled)',
  '.browse-entry',
  '.browse-drive',
  '.connect-form button',
  '.connect-login',
  '.task-add button',
  '.inbox-add button',
  '.soul-editor-form button',
  '#fly-go:not(:disabled)',
  '#fly-stop:not(:disabled)',
  '#fly-pause:not(:disabled)',
  '#fly-lucky:not(:disabled)',
  '.pool-client-fly:not(:disabled)',
  '.fly-flight-actions button:not(:disabled)',
  '.soul-review-btn:not(:disabled)',
  '.soul-ratify-btn:not(:disabled)',
  '.soul-dismiss-btn:not(:disabled)',
  '.soul-unratify-btn:not(:disabled)',
  '.card-link',
  '.back a',
  '.switch button',
  '.connect > summary',
  '.console-title',
  '.report-title',
  '.spark-bar',
  '.heat-cell',
  '.eval-trend-bar',
  '.eval-trend-empty',
  '.browse-entry',
  '.browse-drive',
])('%s hover/focus-visible pairing', (selector) => {
  const css = layoutCss();

  it('pairs the hover feedback with :focus-visible for keyboard operators', () => {
    const rule = ruleFor(css, `${selector}:hover`);
    expect(rule).toContain(`${selector}:focus-visible`);
  });
});
