// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * URL-addressable tab routing — the "new client-routing plumbing (none exists today)"
 * `web/tabs.ts`'s module header deferred to a later slice of epic 0015 D2.13's tabbed IA
 * (board web-mtdc6wuk-0exzb4). Pure and DOM-free: reads/writes `location.hash` (`#<tabId>`)
 * rather than a query param or a new server route, so `/p/<id>` keeps serving one page and
 * only the fragment moves — the active tab survives reload, back/forward, and copy-paste
 * sharing with zero new server plumbing. Nothing calls this yet (zero bundle bytes, zero
 * page change); wiring it into `renderProjectPage`'s client is a later slice.
 */
import type { TabDef } from './tabs.js';

function stripHash(hash: string): string {
  return hash.startsWith('#') ? hash.slice(1) : hash;
}

/**
 * Resolves a `location.hash` value to a known tab id. Matches {@link nextTabId}'s stale-safe
 * contract: an empty, malformed, or unrecognised hash (including one left over from a prior
 * tab set) resolves to `fallbackId` rather than throwing, so a stale or hand-edited link
 * degrades to the default tab instead of breaking the page.
 */
export function tabIdFromHash(hash: string, tabs: readonly TabDef[], fallbackId: string): string {
  const id = stripHash(hash);
  return tabs.some((tab) => tab.id === id) ? id : fallbackId;
}

/** The `location.hash` value (including the leading `#`) that addresses `tabId` directly. */
export function hashForTab(tabId: string): string {
  return '#' + tabId;
}
