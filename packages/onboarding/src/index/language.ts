// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import type { Language } from '@autopilot/store';

/** Extension → language. Unknown extensions degrade to `'other'` (never crash). */
const EXTENSION_MAP: Readonly<Record<string, Language>> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  c: 'c',
  h: 'c',
  sh: 'shell',
  bash: 'shell',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  sql: 'sql',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  md: 'markdown',
  markdown: 'markdown',
};

export function detectLanguage(path: string): Language {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return 'other';
  return EXTENSION_MAP[path.slice(dot + 1).toLowerCase()] ?? 'other';
}
