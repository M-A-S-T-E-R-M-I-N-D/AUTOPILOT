// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Owning-module resolution, console-error capture, and DOM/CSS snapshotting
 * for RIGHT-CLICK REPORT-FROM-HERE (`web-mtdc6wsm-hek3bl`, epic 0015) — the
 * operator's brief asks for a contextmenu on ANY dashboard element to
 * capture its DOM subtree, computed CSS, owning feature module (a "chunk
 * map"), and recent console errors, auto-attached to a report. This ships
 * five of those legs: {@link resolveOwningModule} walks up from an
 * arbitrary right-clicked element to the nearest ancestor tagged {@link
 * REPORT_REGION_ATTR} and looks its region up in a registry; {@link
 * recordConsoleError} appends to a fixed-capacity {@link
 * ConsoleErrorRingBuffer} so a report can carry the handful of errors that
 * preceded it instead of the whole session's log; {@link captureDomSnapshot}
 * walks a right-clicked element's subtree into a bounded, JSON-safe {@link
 * DomSnapshotNode} tree — depth- and children-capped with an honest
 * `truncatedChildren` count rather than a silent cutoff, since a careless
 * right-click near `fleet`'s root could otherwise serialize the entire
 * project page; {@link captureComputedCss} picks a fixed,
 * layout-debugging-relevant property allowlist off a real
 * `getComputedStyle()` result rather than the ~300-property full
 * declaration a report would never need; {@link formatCapturedReportContext}
 * turns a stored capture into the plain-text block
 * `web/features/report-menu.ts`'s dialog shows read-only and folds into the
 * description it POSTs — never auto-submitted, always visible first, the
 * same always-previewed stance `flight/report-from-here.ts`'s ritual already
 * takes for the plan itself.
 *
 * Pure and DOM-free at the type level: this project's `tsconfig.base.json`
 * ships `lib: ["ES2022"]` with no `dom` lib, so {@link ReportTargetLike} and
 * {@link DomSnapshotElementLike} duck-type the real `Element` methods each
 * needs (`closest`/`getAttribute` for the former; `getAttributeNames`/
 * `children`/`textContent` for the latter), the same `*Like`
 * structural-shape convention `web/report-panel.ts`'s `ReportPlanLike`/
 * `ReportCommandResultLike` use for the server's real types. The ring
 * buffer is plain immutable data plus a pure updater — `recordConsoleError`
 * returns a new buffer rather than mutating in place, the same convention
 * this project's coding standards require everywhere else — so wiring it to
 * a real `console.error` override is just "reassign the held buffer on each
 * call", left to the later slice that also owns the override's lifecycle.
 * `shell.ts`'s `renderProjectPage()` tags each of its eight `REPORT_REGIONS`
 * containers with {@link REPORT_REGION_ATTR} directly at render (REPORT
 * UNIFICATION 2/2, epic 0015) — an earlier slice deferred that as a
 * `shell.ts` diff and had `web/features/report-capture-client.ts` relay
 * identity off a sibling panel instead, since removed along with the eight
 * always-open panels it read from.
 */

/** The one real-`Element` method {@link resolveOwningModule} needs — see
 *  the header comment for why this stays duck-typed instead of importing
 *  `dom` lib types. */
export interface ReportTargetLike {
  closest(selector: string): ReportTargetLike | null;
  getAttribute(name: string): string | null;
}

/** One resolvable region — the `regionId`/`regionLabel`/`moduleSources`
 *  shape `flight/report-from-here.ts`'s `ReportRegionCapture` already
 *  carries, so a later wiring slice can spread this straight into a
 *  capture body. */
export interface ReportOwningModule {
  readonly regionId: string;
  readonly regionLabel: string;
  readonly moduleSources: readonly string[];
}

/** Keyed by `regionId`, the same key `shell.ts`'s `REPORT_REGIONS` literal
 *  uses today. */
export type ReportRegionRegistry = Readonly<Record<string, ReportOwningModule>>;

/** The attribute a right-clickable region's container carries so ANY
 *  descendant element — not just the region's own panel controls — resolves
 *  back to the module(s) that render it. */
export const REPORT_REGION_ATTR = 'data-report-region';

/**
 * Resolves the feature module(s) that render whatever DOM element a
 * contextmenu fired on: walks up to the nearest ancestor carrying {@link
 * REPORT_REGION_ATTR} (inclusive of `target` itself, matching real
 * `Element.closest()` semantics) and looks its region id up in `registry`.
 * Returns `null` when no ancestor is tagged (a target outside every known
 * region) or when a tagged id has no matching registry entry (a stale tag
 * left over from a renamed/removed region) — either way, "no capture
 * offered here" rather than a guess.
 */
export function resolveOwningModule(
  target: ReportTargetLike,
  registry: ReportRegionRegistry,
): ReportOwningModule | null {
  const owner = target.closest(`[${REPORT_REGION_ATTR}]`);
  if (!owner) return null;
  const regionId = owner.getAttribute(REPORT_REGION_ATTR);
  if (!regionId) return null;
  return registry[regionId] ?? null;
}

/** One console error captured for a report — the message text and the
 *  epoch-millisecond timestamp the caller observed it at (never `Date.now()`
 *  itself, so this stays pure and testable). */
export interface CapturedConsoleError {
  readonly message: string;
  readonly timestamp: number;
}

/** A fixed-capacity FIFO of recent console errors: {@link recordConsoleError}
 *  drops the oldest entry once `entries` would exceed `capacity`, so a
 *  long-lived session's ring buffer never grows unbounded. */
export interface ConsoleErrorRingBuffer {
  readonly capacity: number;
  readonly entries: readonly CapturedConsoleError[];
}

/** An empty ring buffer holding at most `capacity` entries. */
export function createConsoleErrorRingBuffer(capacity: number): ConsoleErrorRingBuffer {
  return { capacity, entries: [] };
}

/**
 * Appends one console error, returning a NEW buffer — never mutates `buffer`
 * — trimming from the front once `entries` would exceed `capacity` so the
 * most recent errors always survive. A non-positive `capacity` yields a
 * buffer that stays empty, which is the honest result for "capture nothing"
 * rather than a special case.
 */
export function recordConsoleError(
  buffer: ConsoleErrorRingBuffer,
  message: string,
  timestamp: number,
): ConsoleErrorRingBuffer {
  const entries = [...buffer.entries, { message, timestamp }];
  const overflow = entries.length - buffer.capacity;
  return {
    capacity: buffer.capacity,
    entries: overflow > 0 ? entries.slice(overflow) : entries,
  };
}

/** The subset of `Element` {@link captureDomSnapshot} needs — attribute
 *  iteration via `getAttributeNames`/`getAttribute` rather than
 *  `attributes` (whose `NamedNodeMap` type needs the `dom` lib), `children`
 *  as an `ArrayLike` (a real `HTMLCollection` duck-types fine), and
 *  `textContent` for the leaf case. */
export interface DomSnapshotElementLike {
  readonly tagName: string;
  readonly children: ArrayLike<DomSnapshotElementLike>;
  readonly textContent: string | null;
  getAttributeNames(): readonly string[];
  getAttribute(name: string): string | null;
}

/** One captured node. `text` is populated only for a leaf (zero element
 *  children) — a real `textContent` on a branch node already includes
 *  every descendant's text, so capturing it there too would just duplicate
 *  what `children` already carries. `truncatedChildren` counts siblings
 *  dropped by either the depth or per-node child cap, so a reader can tell
 *  "nothing more here" from "more exists, not shown" — the same honest-
 *  emptiness stance {@link recordConsoleError} takes for a non-positive
 *  capacity. */
export interface DomSnapshotNode {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly text: string | null;
  readonly children: readonly DomSnapshotNode[];
  readonly truncatedChildren: number;
}

/** A leaf's captured text is trimmed and clipped to this many characters —
 *  long enough to be useful, short enough that one verbose `<pre>` block
 *  can't blow up a capture's payload size. Exported (not module-private)
 *  because {@link captureDomSnapshot} references it as a free variable, and
 *  a client-side embedder that splices the function's real compiled source
 *  via `.toString()` — the same no-drift convention `report-panel.ts`'s
 *  functions already ride into `features/report-menu.ts` — needs the real
 *  value to embed alongside it, not a hand-retyped copy that could drift. */
export const REPORT_DOM_MAX_TEXT_LENGTH = 500;

/**
 * Captures `element`'s subtree into a bounded, JSON-safe tree: recurses at
 * most `maxDepth` levels below `element` and keeps at most
 * `maxChildrenPerNode` children at each level (in DOM order — the first N,
 * not a sample), so a right-click near the root of a large region caps the
 * payload instead of serializing hundreds of rows. A negative `maxDepth` is
 * clamped to zero, the honest "just this element, no children" capture
 * rather than throwing.
 */
export function captureDomSnapshot(
  element: DomSnapshotElementLike,
  maxDepth: number,
  maxChildrenPerNode: number,
): DomSnapshotNode {
  const depth = Math.max(0, maxDepth);
  const attributes: Record<string, string> = {};
  for (const name of element.getAttributeNames()) {
    attributes[name] = element.getAttribute(name) ?? '';
  }
  const totalChildren = element.children.length;
  const capturedCount = depth > 0 ? Math.min(totalChildren, Math.max(0, maxChildrenPerNode)) : 0;
  const children: DomSnapshotNode[] = [];
  for (let i = 0; i < capturedCount; i++) {
    children.push(captureDomSnapshot(element.children[i]!, depth - 1, maxChildrenPerNode));
  }
  const text =
    totalChildren === 0 && element.textContent
      ? element.textContent.trim().slice(0, REPORT_DOM_MAX_TEXT_LENGTH)
      : null;
  return {
    tag: element.tagName.toLowerCase(),
    attributes,
    text,
    children,
    truncatedChildren: totalChildren - capturedCount,
  };
}

/** The one `CSSStyleDeclaration` method {@link captureComputedCss} needs —
 *  a real `getComputedStyle()` result duck-types fine. */
export interface ComputedStyleLike {
  getPropertyValue(property: string): string;
}

/** A fixed, layout-debugging-relevant property allowlist — box model,
 *  typography, and flex/grid placement — rather than the ~300-property
 *  full `CSSStyleDeclaration` a report would never need. */
export const REPORT_CSS_PROPERTIES = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'margin',
  'padding',
  'box-sizing',
  'color',
  'background-color',
  'border',
  'border-radius',
  'font-size',
  'font-weight',
  'line-height',
  'text-align',
  'flex-direction',
  'justify-content',
  'align-items',
  'gap',
  'grid-template-columns',
  'overflow',
  'z-index',
  'opacity',
  'visibility',
] as const;

/**
 * Reads `properties` (defaulting to {@link REPORT_CSS_PROPERTIES}) off
 * `style` into a plain, JSON-safe record — a real `getPropertyValue()`
 * returns `''` for an unset property rather than throwing, so every
 * requested property always resolves to a string, never `undefined`.
 */
export function captureComputedCss(
  style: ComputedStyleLike,
  properties: readonly string[] = REPORT_CSS_PROPERTIES,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const property of properties) {
    result[property] = style.getPropertyValue(property);
  }
  return result;
}

/** The shape `window.__autopilotReportCapture` holds after a contextmenu
 *  fires — {@link formatCapturedReportContext}'s own input. */
export interface CapturedReportContext {
  readonly owningModule: ReportOwningModule | null;
  readonly dom: Pick<DomSnapshotNode, 'tag'>;
  readonly consoleErrors: readonly CapturedConsoleError[];
}

/**
 * Formats a right-click capture into report-description text: which
 * element was captured, its owning module/region if `resolveOwningModule`
 * found a tagged ancestor (`null` outside every known region), and any
 * console errors that preceded the click. This is what
 * `web/features/report-menu.ts`'s dialog shows read-only and folds into the
 * description it POSTs — never left for the operator to retype, and always
 * visible before previewing or executing a report.
 */
export function formatCapturedReportContext(capture: CapturedReportContext): string {
  const lines: string[] = [];
  lines.push(
    capture.owningModule
      ? `Captured element: <${capture.dom.tag}> in "${capture.owningModule.regionLabel}" (${capture.owningModule.moduleSources.join(', ')}).`
      : `Captured element: <${capture.dom.tag}>.`,
  );
  if (capture.consoleErrors.length > 0) {
    lines.push('', 'Recent console errors:');
    for (const error of capture.consoleErrors) lines.push(`- ${error.message}`);
  }
  return lines.join('\n');
}
