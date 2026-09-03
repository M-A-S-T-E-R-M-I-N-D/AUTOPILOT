// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Coverage for RIGHT-CLICK REPORT-FROM-HERE's owning-module resolver,
 * console-error ring buffer, and DOM/CSS snapshotting (`web-mtdc6wsm-hek3bl`,
 * epic 0015) — `src/web/report-capture.ts`'s {@link resolveOwningModule},
 * {@link recordConsoleError}, {@link captureDomSnapshot}, and {@link
 * captureComputedCss}. Uses hand-rolled fakes implementing {@link
 * ReportTargetLike}/{@link DomSnapshotElementLike}/{@link ComputedStyleLike}
 * rather than jsdom: every function under test is typed against a narrow
 * structural shape on purpose (no `dom` lib in this project), so the fakes
 * are the more faithful test of what each actually depends on.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveOwningModule,
  REPORT_REGION_ATTR,
  createConsoleErrorRingBuffer,
  recordConsoleError,
  captureDomSnapshot,
  captureComputedCss,
  formatCapturedReportContext,
  REPORT_CSS_PROPERTIES,
  type ReportTargetLike,
  type ReportRegionRegistry,
  type DomSnapshotElementLike,
  type ComputedStyleLike,
} from '../../src/web/report-capture.js';

class FakeTarget implements ReportTargetLike {
  constructor(
    private readonly attrs: Readonly<Record<string, string>>,
    private readonly parent: FakeTarget | null = null,
  ) {}

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  closest(selector: string): ReportTargetLike | null {
    const match = /^\[([\w-]+)\]$/.exec(selector);
    if (!match) return null;
    return this.nearestTagged(match[1]!);
  }

  private nearestTagged(attrName: string): FakeTarget | null {
    if (attrName in this.attrs) return this;
    return this.parent ? this.parent.nearestTagged(attrName) : null;
  }
}

const REGISTRY: ReportRegionRegistry = {
  'flight-console': {
    regionId: 'flight-console',
    regionLabel: 'Flight console',
    moduleSources: ['apps/dashboard/src/web/features/flight-console.ts'],
  },
  'issue-triage': {
    regionId: 'issue-triage',
    regionLabel: 'KEEPER issue triage',
    moduleSources: [
      'apps/dashboard/src/web/features/issue-triage.ts',
      'apps/dashboard/src/flight/issue-triage.ts',
    ],
  },
};

describe('resolveOwningModule', () => {
  it('resolves a deeply nested element to its tagged ancestor region', () => {
    const region = new FakeTarget({ [REPORT_REGION_ATTR]: 'flight-console' });
    const child = new FakeTarget({}, region);
    const grandchild = new FakeTarget({ class: 'log-line' }, child);

    expect(resolveOwningModule(grandchild, REGISTRY)).toEqual(REGISTRY['flight-console']);
  });

  it('resolves the tagged element itself, not only its descendants', () => {
    const region = new FakeTarget({ [REPORT_REGION_ATTR]: 'issue-triage' });

    expect(resolveOwningModule(region, REGISTRY)).toEqual(REGISTRY['issue-triage']);
  });

  it('resolves the nearest tagged ancestor when regions nest', () => {
    const outer = new FakeTarget({ [REPORT_REGION_ATTR]: 'flight-console' });
    const inner = new FakeTarget({ [REPORT_REGION_ATTR]: 'issue-triage' }, outer);
    const leaf = new FakeTarget({}, inner);

    expect(resolveOwningModule(leaf, REGISTRY)).toEqual(REGISTRY['issue-triage']);
  });

  it('returns null when no ancestor carries data-report-region', () => {
    const untagged = new FakeTarget({ class: 'footer' });

    expect(resolveOwningModule(untagged, REGISTRY)).toBeNull();
  });

  it('returns null for a tagged region id absent from the registry', () => {
    const stale = new FakeTarget({ [REPORT_REGION_ATTR]: 'removed-region' });

    expect(resolveOwningModule(stale, REGISTRY)).toBeNull();
  });
});

describe('recordConsoleError', () => {
  it('appends an entry to an empty buffer', () => {
    const buffer = createConsoleErrorRingBuffer(3);

    const next = recordConsoleError(buffer, 'boom', 100);

    expect(next.entries).toEqual([{ message: 'boom', timestamp: 100 }]);
  });

  it('does not mutate the buffer it is passed', () => {
    const buffer = createConsoleErrorRingBuffer(3);

    recordConsoleError(buffer, 'boom', 100);

    expect(buffer.entries).toEqual([]);
  });

  it('preserves insertion order under capacity', () => {
    let buffer = createConsoleErrorRingBuffer(3);
    buffer = recordConsoleError(buffer, 'first', 1);
    buffer = recordConsoleError(buffer, 'second', 2);

    expect(buffer.entries.map((entry) => entry.message)).toEqual(['first', 'second']);
  });

  it('drops the oldest entry once capacity is exceeded', () => {
    let buffer = createConsoleErrorRingBuffer(2);
    buffer = recordConsoleError(buffer, 'first', 1);
    buffer = recordConsoleError(buffer, 'second', 2);
    buffer = recordConsoleError(buffer, 'third', 3);

    expect(buffer.entries.map((entry) => entry.message)).toEqual(['second', 'third']);
  });

  it('keeps the buffer empty for a non-positive capacity', () => {
    let buffer = createConsoleErrorRingBuffer(0);
    buffer = recordConsoleError(buffer, 'boom', 1);

    expect(buffer.entries).toEqual([]);
  });

  it('preserves capacity across successive records', () => {
    let buffer = createConsoleErrorRingBuffer(1);
    buffer = recordConsoleError(buffer, 'first', 1);
    buffer = recordConsoleError(buffer, 'second', 2);

    expect(buffer.capacity).toBe(1);
    expect(buffer.entries).toEqual([{ message: 'second', timestamp: 2 }]);
  });
});

class FakeElement implements DomSnapshotElementLike {
  constructor(
    readonly tagName: string,
    private readonly attrs: Readonly<Record<string, string>> = {},
    readonly children: readonly FakeElement[] = [],
    readonly textContent: string | null = null,
  ) {}

  getAttributeNames(): readonly string[] {
    return Object.keys(this.attrs);
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
}

describe('captureDomSnapshot', () => {
  it('captures the tag (lowercased) and attributes of a leaf element', () => {
    const leaf = new FakeElement('SPAN', { class: 'log-line', 'data-id': '7' });

    const snapshot = captureDomSnapshot(leaf, 5, 10);

    expect(snapshot.tag).toBe('span');
    expect(snapshot.attributes).toEqual({ class: 'log-line', 'data-id': '7' });
  });

  it('captures a leaf element trimmed and length-clipped text', () => {
    const leaf = new FakeElement('P', {}, [], '  hello world  ');

    const snapshot = captureDomSnapshot(leaf, 5, 10);

    expect(snapshot.text).toBe('hello world');
  });

  it('omits text for a branch node even when textContent is set', () => {
    const child = new FakeElement('SPAN', {}, [], 'child text');
    const branch = new FakeElement('DIV', {}, [child], 'child text');

    const snapshot = captureDomSnapshot(branch, 5, 10);

    expect(snapshot.text).toBeNull();
  });

  it('recurses into children up to maxDepth', () => {
    const grandchild = new FakeElement('EM', {}, [], 'deep');
    const child = new FakeElement('SPAN', {}, [grandchild]);
    const root = new FakeElement('DIV', {}, [child]);

    const snapshot = captureDomSnapshot(root, 2, 10);

    expect(snapshot.children[0]?.tag).toBe('span');
    expect(snapshot.children[0]?.children[0]?.tag).toBe('em');
  });

  it('stops recursing beyond maxDepth and reports the drop honestly', () => {
    const child = new FakeElement('SPAN');
    const root = new FakeElement('DIV', {}, [child]);

    const snapshot = captureDomSnapshot(root, 0, 10);

    expect(snapshot.children).toEqual([]);
    expect(snapshot.truncatedChildren).toBe(1);
  });

  it('caps children per node at maxChildrenPerNode, keeping the first N', () => {
    const kids = [new FakeElement('A'), new FakeElement('B'), new FakeElement('C')];
    const root = new FakeElement('DIV', {}, kids);

    const snapshot = captureDomSnapshot(root, 5, 2);

    expect(snapshot.children.map((c) => c.tag)).toEqual(['a', 'b']);
    expect(snapshot.truncatedChildren).toBe(1);
  });

  it('clamps a negative maxDepth to zero rather than throwing', () => {
    const child = new FakeElement('SPAN');
    const root = new FakeElement('DIV', {}, [child]);

    const snapshot = captureDomSnapshot(root, -3, 10);

    expect(snapshot.children).toEqual([]);
    expect(snapshot.truncatedChildren).toBe(1);
  });
});

class FakeComputedStyle implements ComputedStyleLike {
  constructor(private readonly values: Readonly<Record<string, string>> = {}) {}

  getPropertyValue(property: string): string {
    return this.values[property] ?? '';
  }
}

describe('captureComputedCss', () => {
  it('reads every REPORT_CSS_PROPERTIES entry by default', () => {
    const style = new FakeComputedStyle({ display: 'flex', color: 'rgb(0, 0, 0)' });

    const snapshot = captureComputedCss(style);

    expect(Object.keys(snapshot)).toEqual([...REPORT_CSS_PROPERTIES]);
    expect(snapshot['display']).toBe('flex');
    expect(snapshot['color']).toBe('rgb(0, 0, 0)');
  });

  it('resolves an unset property to the empty string, never undefined', () => {
    const style = new FakeComputedStyle({});

    const snapshot = captureComputedCss(style);

    expect(snapshot['width']).toBe('');
  });

  it('honors a caller-supplied property list instead of the default', () => {
    const style = new FakeComputedStyle({ 'font-size': '14px' });

    const snapshot = captureComputedCss(style, ['font-size']);

    expect(snapshot).toEqual({ 'font-size': '14px' });
  });
});

describe('formatCapturedReportContext', () => {
  it('describes a captured element with no resolved owning module', () => {
    const text = formatCapturedReportContext({
      owningModule: null,
      dom: { tag: 'div' },
      consoleErrors: [],
    });

    expect(text).toBe('Captured element: <div>.');
  });

  it('names the owning module and its regionLabel/moduleSources once resolved', () => {
    const text = formatCapturedReportContext({
      owningModule: {
        regionId: 'flight-console',
        regionLabel: 'Flight console',
        moduleSources: ['apps/dashboard/src/web/features/flight-console.ts'],
      },
      dom: { tag: 'button' },
      consoleErrors: [],
    });

    expect(text).toBe(
      'Captured element: <button> in "Flight console" (apps/dashboard/src/web/features/flight-console.ts).',
    );
  });

  it('lists every captured console error under its own heading', () => {
    const text = formatCapturedReportContext({
      owningModule: null,
      dom: { tag: 'span' },
      consoleErrors: [
        { message: 'first boom', timestamp: 1 },
        { message: 'second boom', timestamp: 2 },
      ],
    });

    expect(text).toBe(
      'Captured element: <span>.\n\nRecent console errors:\n- first boom\n- second boom',
    );
  });

  it('omits the console-errors section entirely when none were captured', () => {
    const text = formatCapturedReportContext({
      owningModule: null,
      dom: { tag: 'p' },
      consoleErrors: [],
    });

    expect(text).not.toContain('Recent console errors');
  });
});
