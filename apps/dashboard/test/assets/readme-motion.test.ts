// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import { isAnimatedPng } from '../../../../scripts/docs/record-demo-frames.mjs';

/**
 * WCAG 2.2.2 (Pause, Stop, Hide) for the README's demo loop (board
 * web-mtnd3yeq-oyprf0). A `.gif` on GitHub brings its own control: the
 * renderer marks it `data-animated-image`, and the page then honours the
 * reader's reduced-motion preference and offers play/pause (GitHub changelog,
 * 2022-05-18). An animated PNG gets no mark — POST /markdown renders
 * `![demo](docs/screens/demo.png)` as a bare <img> (checked 2026-09-26) — so
 * it would loop with no way to stop it. The one control a README can carry
 * itself is <picture>: its `media` survives GitHub's sanitizer, so a
 * `(prefers-reduced-motion: reduce)` source can swap in a still.
 *
 * The law: every animated PNG README.md embeds is a <picture>'s <img> with
 * such a source, and that source is a still that exists.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const README = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
const REDUCED_MOTION = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i;

interface Embed {
  readonly src: string;
  /** The reduced-motion stills of the <picture> around it; none outside one. */
  readonly stills: readonly string[];
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match ? (match[1] ?? match[2]) : undefined;
}

function imgSources(html: string): string[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)].flatMap(([tag]) => attr(tag, 'src') ?? []);
}

/** Every image the markdown embeds, as markdown or <img>, <picture> or not. */
function embeds(markdown: string): Embed[] {
  const inPictures: Embed[] = [];
  const outside = markdown.replace(
    /<picture\b[^>]*>([\s\S]*?)<\/picture>/gi,
    (_, inner: string) => {
      const stills = [...inner.matchAll(/<source\b[^>]*>/gi)]
        .map(([tag]) => tag)
        .filter((tag) => REDUCED_MOTION.test(attr(tag, 'media') ?? ''))
        .flatMap((tag) => (attr(tag, 'srcset') ?? '').split(','))
        .map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
        .filter(Boolean);
      inPictures.push(...imgSources(inner).map((src) => ({ src, stills })));
      return '';
    },
  );
  const markdownImages = [...outside.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g)].map(
    ([, src]) => src ?? '',
  );
  return [
    ...inPictures,
    ...[...markdownImages, ...imgSources(outside)].map((src) => ({ src, stills: [] })),
  ];
}

/** A repository-relative PNG, not a URL: the only kind that can animate unmarked. */
function isLocalPng(src: string): boolean {
  return !/^[a-z][a-z\d+.-]*:/i.test(src) && /\.png$/i.test(src.replace(/[?#].*$/, ''));
}

/** What breaks the law, one line per image, given how to read a local file. */
function motionViolations(
  markdown: string,
  read: (src: string) => Uint8Array | undefined,
): string[] {
  return embeds(markdown).flatMap(({ src, stills }) => {
    const bytes = isLocalPng(src) ? read(src) : undefined;
    if (!bytes || !isAnimatedPng(bytes)) return [];
    if (stills.length === 0) {
      return [
        `${src} animates with no (prefers-reduced-motion: reduce) still — wrap it in <picture>`,
      ];
    }
    return stills.flatMap((still) => {
      const stillBytes = read(still);
      if (!stillBytes) return [`${src}: its reduced-motion still ${still} does not exist`];
      return isLocalPng(still) && isAnimatedPng(stillBytes)
        ? [`${src}: its reduced-motion still ${still} animates too`]
        : [];
    });
  });
}

function readFromRepo(src: string): Uint8Array | undefined {
  const path = join(REPO_ROOT, src.replace(/[?#].*$/, ''));
  return existsSync(path) ? readFileSync(path) : undefined;
}

describe('README motion law', () => {
  it('every animated PNG README.md embeds can be stilled by prefers-reduced-motion', () => {
    expect(motionViolations(README, readFromRepo)).toEqual([]);
  });
});

describe('README motion law — it bites', () => {
  const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  /** A PNG stream of just these chunk types, empty, CRCs right: all isAnimatedPng reads. */
  const pngOf = (...types: string[]) =>
    Buffer.concat([
      SIGNATURE,
      ...[...types, 'IEND'].map((type) => {
        const out = Buffer.alloc(12);
        out.write(type, 4, 'latin1');
        out.writeUInt32BE(crc32(Buffer.from(type, 'latin1')), 8);
        return out;
      }),
    ]);
  const files: Record<string, Buffer> = {
    'demo.png': pngOf('IHDR', 'acTL', 'IDAT'),
    'still.png': pngOf('IHDR', 'IDAT'),
    'other-loop.png': pngOf('IHDR', 'acTL', 'IDAT'),
  };
  const read = (src: string) => files[src];
  const picture = (sources: string) =>
    `<picture>\n  ${sources}\n  <img src="demo.png" alt="The demo loop">\n</picture>`;

  it('flags an animated PNG embedded as markdown or a bare <img>', () => {
    expect(motionViolations('![The demo loop](demo.png)', read)).toEqual([
      'demo.png animates with no (prefers-reduced-motion: reduce) still — wrap it in <picture>',
    ]);
    expect(motionViolations('<img src="demo.png" alt="The demo loop">', read)).toHaveLength(1);
  });

  it('flags a <picture> whose only source answers the colour scheme, not motion', () => {
    const themed = picture('<source media="(prefers-color-scheme: dark)" srcset="still.png">');
    expect(motionViolations(themed, read)).toHaveLength(1);
  });

  it('passes a <picture> whose reduced-motion source is a still', () => {
    const stilled = picture('<source media="(prefers-reduced-motion: reduce)" srcset="still.png">');
    expect(motionViolations(stilled, read)).toEqual([]);
  });

  it('flags a reduced-motion source that is missing or animates too', () => {
    const missing = picture('<source media="(prefers-reduced-motion: reduce)" srcset="gone.png">');
    const moving = picture(
      '<source media="(prefers-reduced-motion:reduce)" srcset="other-loop.png 2x">',
    );
    expect(motionViolations(missing, read)).toEqual([
      'demo.png: its reduced-motion still gone.png does not exist',
    ]);
    expect(motionViolations(moving, read)).toEqual([
      'demo.png: its reduced-motion still other-loop.png animates too',
    ]);
  });

  it('leaves still PNGs, GIFs (GitHub pauses those itself) and URLs unread or unflagged', () => {
    const spy = vi.fn(read);
    const markdown = [
      '![A still](still.png)',
      '![A gif](demo.gif)',
      '<img src="https://example.com/demo.png" alt="remote">',
    ].join('\n');
    expect(motionViolations(markdown, spy)).toEqual([]);
    expect(spy.mock.calls).toEqual([['still.png']]);
  });
});
