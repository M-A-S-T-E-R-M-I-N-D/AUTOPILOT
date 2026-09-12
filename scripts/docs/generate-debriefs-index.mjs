// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0
//
// Writes docs/debriefs/README.md: one row per debrief, newest first, from each
// file's date prefix and first heading. Flights write debriefs into this folder
// on their own, so the index is regenerated rather than hand-edited:
//
//   node scripts/docs/generate-debriefs-index.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DIR = resolve('docs/debriefs');
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort()
  .reverse();

const rows = files.map((file) => {
  const src = readFileSync(join(DIR, file), 'utf8');
  const heading = (src.match(/^# (.+)$/m)?.[1] ?? file).replace(/\|/g, '\\|').trim();
  const date = file.slice(0, 10);
  return `| ${date} | [${heading}](${file}) |`;
});

const out = [
  '<!--',
  'SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND',
  'SPDX-License-Identifier: Apache-2.0',
  '-->',
  '',
  '# Debriefs',
  '',
  'One file per incident or verdict, dated, written by the firing that met it — the raw record the',
  'doctrine docs (`docs/FAILURE-DOCTRINE.md`, `docs/RESEARCH-LIBRARY.md`) distil. Flights write here',
  'on their own; this index is generated (`node scripts/docs/generate-debriefs-index.mjs`), never',
  'hand-edited.',
  '',
  '| Date | Debrief |',
  '| --- | --- |',
  ...rows,
  '',
];
writeFileSync(join(DIR, 'README.md'), out.join('\n'));
console.log(`debriefs index: ${rows.length} entries`);
