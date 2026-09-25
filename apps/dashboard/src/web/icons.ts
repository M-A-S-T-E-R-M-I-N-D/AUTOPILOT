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
  // 🎨 theme → palette
  palette: [
    ['circle', { cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
    ['circle', { cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' }],
    [
      'path',
      {
        d: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z',
      },
    ],
  ],
  // 🌐 language → globe
  globe: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ],
  // 🔔 notifications → bell
  bell: [
    ['path', { d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' }],
    ['path', { d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0' }],
  ],
  // ♥ foundation → heart
  heart: [
    [
      'path',
      {
        d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
      },
    ],
  ],
  // display & accessibility → settings (gear)
  settings: [
    [
      'path',
      {
        d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      },
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }],
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
  // Epic 0025 slice 2 — the panel headings, chips and lines that still drew
  // emoji: vendored the same way (Lucide, ISC), used through panelHeading()
  // and iconEl() on the client, iconSvg() on the server.
  rocket: [
    ['path', { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5' }],
    [
      'path',
      {
        d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09',
      },
    ],
    [
      'path',
      {
        d: 'M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z',
      },
    ],
    ['path', { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05' }],
  ],
  'plane-landing': [
    ['path', { d: 'M2 22h20' }],
    [
      'path',
      {
        d: 'M3.77 10.77 2 9l2-4.5 1.1.55c.55.28.9.84.9 1.45s.35 1.17.9 1.45L8 8.5l3-6 1.05.53a2 2 0 0 1 1.09 1.52l.72 5.4a2 2 0 0 0 1.09 1.52l4.4 2.2c.42.22.78.55 1.01.96l.6 1.03c.49.88-.06 1.98-1.06 2.1l-1.18.15c-.47.06-.95-.02-1.37-.24L4.29 11.15a2 2 0 0 1-.52-.38Z',
      },
    ],
  ],
  monitor: [
    ['rect', { width: '20', height: '14', x: '2', y: '3', rx: '2' }],
    ['line', { x1: '8', x2: '16', y1: '21', y2: '21' }],
    ['line', { x1: '12', x2: '12', y1: '17', y2: '21' }],
  ],
  'chart-line': [
    ['path', { d: 'M3 3v16a2 2 0 0 0 2 2h16' }],
    ['path', { d: 'm19 9-5 5-4-4-3 3' }],
  ],
  zap: [
    [
      'path',
      {
        d: 'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z',
      },
    ],
  ],
  dna: [
    ['path', { d: 'm10 16 1.5 1.5' }],
    ['path', { d: 'm14 8-1.5-1.5' }],
    ['path', { d: 'M15 2c-1.798 1.998-2.518 3.995-2.807 5.993' }],
    ['path', { d: 'm16.5 10.5 1 1' }],
    ['path', { d: 'm17 6-2.891-2.891' }],
    ['path', { d: 'M2 15c6.667-6 13.333 0 20-6' }],
    ['path', { d: 'm20 9 .891.891' }],
    ['path', { d: 'M3.109 14.109 4 15' }],
    ['path', { d: 'm6.5 12.5 1 1' }],
    ['path', { d: 'm7 18 2.891 2.891' }],
    ['path', { d: 'M9 22c1.798-1.998 2.518-3.995 2.807-5.993' }],
  ],
  search: [
    ['path', { d: 'm21 21-4.34-4.34' }],
    ['circle', { cx: '11', cy: '11', r: '8' }],
  ],
  activity: [
    [
      'path',
      {
        d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
      },
    ],
  ],
  sprout: [
    [
      'path',
      {
        d: 'M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3',
      },
    ],
    ['path', { d: 'M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4' }],
    ['path', { d: 'M5 21h14' }],
  ],
  'message-circle': [
    [
      'path',
      {
        d: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
      },
    ],
  ],
  'refresh-cw': [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
  repeat: [
    ['path', { d: 'm17 2 4 4-4 4' }],
    ['path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }],
    ['path', { d: 'm7 22-4-4 4-4' }],
    ['path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }],
  ],
  wrench: [
    [
      'path',
      {
        d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z',
      },
    ],
  ],
  'pen-line': [
    ['path', { d: 'M13 21h8' }],
    [
      'path',
      {
        d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      },
    ],
  ],
  users: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['circle', { cx: '9', cy: '7', r: '4' }],
  ],
  handshake: [
    ['path', { d: 'm11 17 2 2a1 1 0 1 0 3-3' }],
    [
      'path',
      {
        d: 'm14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4',
      },
    ],
    ['path', { d: 'm21 3 1 11h-2' }],
    ['path', { d: 'M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3' }],
    ['path', { d: 'M3 4h8' }],
  ],
  flag: [
    [
      'path',
      {
        d: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528',
      },
    ],
  ],
  'key-round': [
    [
      'path',
      {
        d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z',
      },
    ],
    ['circle', { cx: '16.5', cy: '7.5', r: '.5', fill: 'currentColor' }],
  ],
  'book-open': [
    ['path', { d: 'M12 5v16' }],
    [
      'path',
      {
        d: 'M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z',
      },
    ],
  ],
  'git-pull-request': [
    ['circle', { cx: '18', cy: '18', r: '3' }],
    ['circle', { cx: '6', cy: '6', r: '3' }],
    ['path', { d: 'M13 6h3a2 2 0 0 1 2 2v7' }],
    ['line', { x1: '6', x2: '6', y1: '9', y2: '21' }],
  ],
  'notebook-pen': [
    ['path', { d: 'M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4' }],
    ['path', { d: 'M2 6h4' }],
    ['path', { d: 'M2 10h4' }],
    ['path', { d: 'M2 14h4' }],
    ['path', { d: 'M2 18h4' }],
    [
      'path',
      {
        d: 'M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z',
      },
    ],
  ],
  clock: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 6v6l4 2' }],
  ],
  compass: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    [
      'path',
      {
        d: 'm16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z',
      },
    ],
  ],
  siren: [
    ['path', { d: 'M7 18v-6a5 5 0 1 1 10 0v6' }],
    ['path', { d: 'M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z' }],
    ['path', { d: 'M21 12h1' }],
    ['path', { d: 'M18.5 4.5 18 5' }],
    ['path', { d: 'M2 12h1' }],
    ['path', { d: 'M12 2v1' }],
    ['path', { d: 'm4.929 4.929.707.707' }],
    ['path', { d: 'M12 12v6' }],
  ],
  shield: [
    [
      'path',
      {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    ],
  ],
  ban: [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M4.929 4.929 19.07 19.071' }],
  ],
  'octagon-x': [
    ['path', { d: 'm15 9-6 6' }],
    [
      'path',
      {
        d: 'M2.586 16.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586z',
      },
    ],
    ['path', { d: 'm9 9 6 6' }],
  ],
  trophy: [
    ['path', { d: 'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2' }],
    ['path', { d: 'M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2' }],
    ['path', { d: 'M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3' }],
    ['path', { d: 'M4 22h16' }],
    ['path', { d: 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z' }],
    ['path', { d: 'M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3' }],
  ],
  skull: [
    ['path', { d: 'm12.5 17-.5-1-.5 1h1z' }],
    [
      'path',
      {
        d: 'M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z',
      },
    ],
    ['circle', { cx: '15', cy: '12', r: '1' }],
    ['circle', { cx: '9', cy: '12', r: '1' }],
  ],
  bandage: [
    ['path', { d: 'M10 10.01h.01' }],
    ['path', { d: 'M10 14.01h.01' }],
    ['path', { d: 'M14 10.01h.01' }],
    ['path', { d: 'M14 14.01h.01' }],
    ['path', { d: 'M18 6v12' }],
    ['path', { d: 'M6 6v12' }],
    ['rect', { x: '2', y: '6', width: '20', height: '12', rx: '2' }],
  ],
  'lock-open': [
    ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 9.9-1' }],
  ],
  'clipboard-check': [
    ['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }],
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['path', { d: 'm9 14 2 2 4-4' }],
  ],
  // … the back link (epic 0031 fix): a directional icon that mirrors under
  // dir=rtl, instead of an arrow character baked into the words.
  'arrow-left': [
    ['path', { d: 'm12 19-7-7 7-7' }],
    ['path', { d: 'M19 12H5' }],
  ],
  // … the overflow menu's summary (epic 0017 slice 3) — ellipsis
  ellipsis: [
    ['circle', { cx: '12', cy: '12', r: '1' }],
    ['circle', { cx: '19', cy: '12', r: '1' }],
    ['circle', { cx: '5', cy: '12', r: '1' }],
  ],
  // Epic 0025 continuation (board web-mtywp7zq-55f3o9): the KEEPER PR review
  // panel's queue-for-human decision badge drops its baked-in 🔒/🟣 glyphs.
  lock: [
    ['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  user: [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: '12', cy: '7', r: '4' }],
  ],
  // Epic 0025 continuation (board web-mtywp7zq-55f3o9): the SOUL editor
  // summary drops its baked-in ✎ glyph.
  pencil: [
    [
      'path',
      {
        d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      },
    ],
    ['path', { d: 'm15 5 4 4' }],
  ],
  // Epic 0025 continuation (board web-mtywp7zq-55f3o9): the report menu's
  // two remaining copy-toolkit items drop their baked-in 🧩/🧠 glyphs.
  puzzle: [
    [
      'path',
      {
        d: 'M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z',
      },
    ],
  ],
  brain: [
    ['path', { d: 'M12 18V5' }],
    ['path', { d: 'M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4' }],
    ['path', { d: 'M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5' }],
    ['path', { d: 'M17.997 5.125a4 4 0 0 1 2.526 5.77' }],
    ['path', { d: 'M18 18a4 4 0 0 0 2-7.464' }],
    ['path', { d: 'M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517' }],
    ['path', { d: 'M6 18a4 4 0 0 1-2-7.464' }],
    ['path', { d: 'M6.003 5.125a4 4 0 0 0-2.526 5.77' }],
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
