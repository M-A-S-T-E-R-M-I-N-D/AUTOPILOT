// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Hand-maintained declarations for `record-demo-frames.mjs`, so
 * `apps/dashboard/test/tooling/record-demo-frames.test.ts` typechecks — the
 * same sibling-`.d.mts` pattern `scripts/docs/check-links.d.mts` uses. Keep in
 * step with the JSDoc types in the `.mjs`.
 */

export interface Beat {
  readonly id: string;
  readonly holdMs: number;
}

export interface FrameSize {
  width: number;
  height: number;
}

export interface ManifestFrame {
  file: string;
  beat: string;
  holdMs: number;
}

export interface Manifest extends FrameSize {
  totalMs: number;
  frames: ManifestFrame[];
}

export interface PngChunk {
  type: string;
  data: Buffer;
}

export interface AnimationFrame {
  readonly file: string;
  readonly bytes: Uint8Array;
  readonly holdMs: number;
}

export const VIEWPORT: FrameSize;
export const MANIFEST: string;
export const ANIMATION: string;
export const MAX_TOTAL_MS: number;
export const MAX_HOLD_MS: number;
export const STORYBOARD: readonly Beat[];
export const ACTIONS: Record<string, (scene: unknown) => Promise<unknown>>;

export function frameFile(index: number): string;
export function buildManifest(beats: readonly Beat[], size: FrameSize): Manifest;
export function pngSize(bytes: Uint8Array): FrameSize;
export function assertUniformFrames(sizes: readonly (FrameSize & { file: string })[]): FrameSize;
export function readChunks(bytes: Uint8Array): PngChunk[];
export function assembleApng(
  frames: readonly AnimationFrame[],
  options?: { plays?: number },
): Buffer;
