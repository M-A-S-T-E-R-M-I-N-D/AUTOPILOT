// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-FileCopyrightText: 2026 Lucide Icons and Contributors
// SPDX-FileCopyrightText: 2013-present Cole Bemis (Feather, for the icons Lucide derived)
// SPDX-License-Identifier: Apache-2.0 AND ISC

/**
 * THE ICON SYSTEM (epic 0025, slice 1): one stroke family, no emoji. The
 * shapes below are vendored from Lucide (ISC — the complete upstream licence
 * travels in `LICENSES/ISC.txt`, with the Feather notice for the icons Lucide
 * derived; see THANKS.md). Only the icons in use are vendored, as data: each
 * icon is a list of SVG elements with their attributes, so the SERVER can
 * print it as markup (`iconSvg`) and the CLIENT can build it with
 * `createElementNS` — no icon font, no runtime fetch, no innerHTML; CSP
 * `script-src 'self'` stays as it is.
 *
 * Laws (epic 0025): `currentColor` everywhere, so the three themes need no
 * per-icon work; size from the type scale (`1em` inline in a chip, larger in
 * a button, by CSS); an icon beside a label is decorative (`aria-hidden`),
 * and an icon alone gets its accessible name from the control that holds it.
 */

/** One SVG element of an icon: tag and attributes, nothing else. */
export type IconShape = readonly [tag: string, attrs: Readonly<Record<string, string>>];

/** The vendored set — Lucide names. */
export const ICON_SHAPES: Readonly<Record<string, readonly IconShape[]>> = {
  // 🎯 focus → target
  target: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['circle', { cx: '12', cy: '12', r: '6' }],
    ['circle', { cx: '12', cy: '12', r: '2' }],
  ],
  // 🔥 burn → flame
  flame: [
    [
      'path',
      {
        d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
      },
    ],
  ],
  // 📥 inbox → inbox
  inbox: [
    ['polyline', { points: '22 12 16 12 14 15 10 15 8 12 2 12' }],
    [
      'path',
      {
        d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
      },
    ],
  ],
  // 📋 backlog → clipboard-list
  'clipboard-list': [
    ['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'M12 11h4' }],
    ['path', { d: 'M12 16h4' }],
    ['path', { d: 'M8 11h.01' }],
    ['path', { d: 'M8 16h.01' }],
  ],
  // ✦ proposed → sparkles
  sparkles: [
    [
      'path',
      {
        d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
      },
    ],
    ['path', { d: 'M20 3v4' }],
    ['path', { d: 'M22 5h-4' }],
  ],
  // 🗑 delete → trash-2
  'trash-2': [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ['line', { x1: '10', x2: '10', y1: '11', y2: '17' }],
    ['line', { x1: '14', x2: '14', y1: '11', y2: '17' }],
  ],
  // ⚠️ runaway → triangle-alert
  'triangle-alert': [
    ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  // ⠿ drag handle → grip-vertical
  'grip-vertical': [
    ['circle', { cx: '9', cy: '12', r: '1' }],
    ['circle', { cx: '9', cy: '5', r: '1' }],
    ['circle', { cx: '9', cy: '19', r: '1' }],
    ['circle', { cx: '15', cy: '12', r: '1' }],
    ['circle', { cx: '15', cy: '5', r: '1' }],
    ['circle', { cx: '15', cy: '19', r: '1' }],
  ],
};

export type IconName = keyof typeof ICON_SHAPES;

/** Every vendored icon's name — the census tests iterate it. */
export const ICON_NAMES: readonly string[] = Object.keys(ICON_SHAPES);

function escapeAttrValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * The icon as server-side markup — decorative by default (`aria-hidden`),
 * `currentColor` stroke, sized by CSS through the `icon` class. An unknown
 * name renders nothing rather than a broken box.
 */
export function iconSvg(name: string, extraClass?: string): string {
  const shapes = ICON_SHAPES[name];
  if (!shapes) return '';
  // Plain concatenation on purpose: a template literal here would make the
  // splice discoverer read this data module as a bundle assembler.
  let inner = '';
  for (const [tag, attrs] of shapes) {
    let open = '<' + tag;
    for (const [k, v] of Object.entries(attrs)) open += ' ' + k + '="' + escapeAttrValue(v) + '"';
    inner += open + '/>';
  }
  const cls = 'icon icon-' + name + (extraClass ? ' ' + extraClass : '');
  return (
    '<svg class="' +
    cls +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    inner +
    '</svg>'
  );
}
