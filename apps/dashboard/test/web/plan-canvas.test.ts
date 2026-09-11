// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE PLAN CANVAS AS A CAMERA (epic 0021 slice 3, first cut). The pipeline
 * SVG never re-lays out: zoom and pan are edits to its viewBox. The math is
 * pure and spliced into the client by `.toString()`, so these tests read the
 * exact functions the browser runs; the wiring test executes the real client
 * module against a synthetic canvas and drives it with the same events a
 * wheel, a keyboard and a drag produce.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseViewBox,
  zoomViewBox,
  panViewBox,
  formatViewBox,
} from '../../src/web/pipeline-panel.js';
import { pipelineJs } from '../../src/web/features/pipeline.js';

describe('camera math', () => {
  it('parses a viewBox and refuses a malformed or degenerate one', () => {
    expect(parseViewBox('0 0 100 50')).toEqual([0, 0, 100, 50]);
    expect(parseViewBox(' 10,20 , 300 150 ')).toEqual([10, 20, 300, 150]);
    expect(parseViewBox(null)).toBeNull();
    expect(parseViewBox('0 0 100')).toBeNull();
    expect(parseViewBox('0 0 0 50')).toBeNull();
    expect(parseViewBox('a b c d')).toBeNull();
  });

  it('zooms about the anchor so the point under the pointer stays put', () => {
    const base = [0, 0, 100, 50];
    // 2× in about the centre: the window halves around (50, 25).
    expect(zoomViewBox(base, 2, 50, 25, base)).toEqual([25, 12.5, 50, 25]);
    // 2× in about the origin: the origin stays the origin.
    expect(zoomViewBox(base, 2, 0, 0, base)).toEqual([0, 0, 50, 25]);
    // Zooming back out about the same anchor returns to the base.
    const zoomed = zoomViewBox(base, 2, 50, 25, base);
    expect(zoomViewBox(zoomed, 0.5, 50, 25, base)).toEqual([0, 0, 100, 50]);
  });

  it('clamps the camera between a quarter and four times the drawing', () => {
    const base = [0, 0, 100, 50];
    expect(zoomViewBox(base, 1000, 50, 25, base)[2]).toBe(25);
    expect(zoomViewBox(base, 0.0001, 50, 25, base)[2]).toBe(400);
    // The height follows the width through the clamp — aspect preserved.
    expect(zoomViewBox(base, 1000, 50, 25, base)[3]).toBe(12.5);
    // A nonsense factor is treated as 1 rather than blowing up.
    expect(zoomViewBox(base, 0, 50, 25, base)).toEqual(base);
  });

  it('pans the camera the other way from the pointer, and serialises stably', () => {
    expect(panViewBox([0, 0, 100, 50], 10, -5)).toEqual([-10, 5, 100, 50]);
    expect(formatViewBox([1 / 3, 2 / 3, 100, 50])).toBe('0.333 0.667 100 50');
    expect(formatViewBox([0, 0, 100, 50])).toBe('0 0 100 50');
  });
});

describe('camera wiring — the real client module against a synthetic canvas', () => {
  type Wire = (
    body: HTMLElement,
    state: Record<string, unknown>,
  ) => { viewBox: () => number[] } | null;
  let wire: Wire;
  let body: HTMLElement;
  let svg: SVGSVGElement;

  beforeEach(() => {
    (globalThis as unknown as { tr: unknown }).tr = (key: string) => key;
    wire = new Function(`${pipelineJs()}; return wirePlanCanvas;`)() as Wire;
    document.body.innerHTML =
      '<div id="host"><div class="pipeline-controls"></div><svg class="pipeline-canvas" viewBox="0 0 100 50"></svg></div>';
    body = document.getElementById('host') as HTMLElement;
    svg = body.querySelector('svg') as SVGSVGElement;
    // jsdom has no layout: give the canvas a 200×100 box so pointer→unit
    // conversion is 0.5 units per pixel.
    svg.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        x: 0,
        y: 0,
      }) as DOMRect;
  });

  it('a wheel over the canvas zooms about the pointer; 0 fits again', () => {
    const cam = wire(body, {})!;
    expect(cam).not.toBeNull();
    svg.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 50, bubbles: true }),
    );
    const [x, y, w] = cam.viewBox() as [number, number, number, number];
    expect(w).toBeLessThan(100);
    // Zoomed about the centre: the window shrank symmetrically.
    expect(x).toBeCloseTo((100 - w) / 2, 3);
    expect(y).toBeCloseTo((50 - w / 2) / 2, 3);
    expect(svg.getAttribute('viewBox')).toBe(formatViewBox(cam.viewBox()));
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
    expect(cam.viewBox()).toEqual([0, 0, 100, 50]);
  });

  it('a drag pans; the buttons zoom and fit; a re-render keeps the camera', () => {
    const state: Record<string, unknown> = {};
    const cam = wire(body, state)!;
    svg.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 1, clientX: 20, clientY: 20, bubbles: true }),
    );
    svg.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 1, clientX: 40, clientY: 30, bubbles: true }),
    );
    svg.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, clientX: 40, clientY: 30, bubbles: true }),
    );
    // 20px right and 10px down at 0.5 units/px: the camera moved 10 left, 5 up.
    expect(cam.viewBox()).toEqual([-10, -5, 100, 50]);
    expect(svg.classList.contains('is-panning')).toBe(false);

    const buttons = body.querySelectorAll('.plan-zoom button');
    expect(buttons).toHaveLength(3);
    (buttons[0] as HTMLButtonElement).click();
    expect(cam.viewBox()[2]).toBe(80);
    (buttons[2] as HTMLButtonElement).click();
    expect(cam.viewBox()).toEqual([0, 0, 100, 50]);
    (buttons[1] as HTMLButtonElement).click();
    expect(cam.viewBox()[2]).toBe(125);

    // The page re-renders the SVG on every poll; the camera survives in state.
    expect(state['planViewBox']).toEqual(cam.viewBox());
    svg.setAttribute('viewBox', '0 0 100 50');
    const again = wire(body, state)!;
    expect(again.viewBox()[2]).toBe(125);
    expect(svg.getAttribute('viewBox')).toBe(formatViewBox(again.viewBox()));
  });

  it('a new drawing resets the camera; a node click never starts a pan', () => {
    const state: Record<string, unknown> = {
      planBaseKey: '0 0 100 50',
      planViewBox: [10, 10, 50, 25],
    };
    svg.setAttribute('viewBox', '0 0 300 150');
    const cam = wire(body, state)!;
    expect(cam.viewBox()).toEqual([0, 0, 300, 150]);
    svg.innerHTML = '<g class="pipeline-node"><rect width="10" height="10"/></g>';
    const node = svg.querySelector('.pipeline-node') as SVGGElement;
    node.dispatchEvent(
      new PointerEvent('pointerdown', { pointerId: 2, clientX: 5, clientY: 5, bubbles: true }),
    );
    node.dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 2, clientX: 50, clientY: 50, bubbles: true }),
    );
    expect(cam.viewBox()).toEqual([0, 0, 300, 150]);
  });
});
