// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT DISK THE WORKTREES ARE ON (profiling, 2026-09-14).
 *
 * Profiling the operator's own machine found the term that dominates its
 * gate and was not being measured anywhere: the repository, all six lane
 * worktrees and the package store sat on a 7200 RPM platter, while a 2 TB
 * NVMe idled in the same box holding the system volume. A 4 KiB fsync cost
 * **11.2 ms** there against **0.22 ms** on the NVMe — measured twice, an
 * independent 51x. About a third of a `tsc` run is I/O read time, and
 * `format:check`, which is close to pure file reading, cost as much as the
 * entire eight-project typecheck.
 *
 * So `lucky-plan.ts` takes a disk class now, and this module answers it.
 *
 * Two rules, both learned the hard way:
 *
 *  1. **A timed write measures the page cache, not the disk.** A 16 MiB
 *     buffered write clocked ~1.4 GB/s on BOTH volumes — identical, and
 *     both meaningless. Only a timed `fsync` separates them, because only
 *     `fsync` waits for the platter. The fallback probe here therefore
 *     syncs, and it is the last resort rather than the first.
 *  2. **`unknown` is a real answer.** Every platform has cases the cheap
 *     probes cannot resolve without elevation, and `lucky-plan.ts` treats
 *     `unknown` as "do not constrain" precisely so a failed probe never
 *     throttles a fast machine. Guessing would be worse than not knowing.
 *
 * Pure decision logic lives in the exported classifiers, which take the raw
 * platform output as a string; the impure half is one guarded child process
 * with a hard timeout. Nothing here throws: every failure path returns
 * `unknown`.
 */

import type { DiskClass } from './lucky-plan.js';

export type { DiskClass };

/** How long any platform probe may take before its answer stops being
 *  worth waiting for. A Fly-bar roll must feel instant, and every probe
 *  below was measured well inside this. */
export const DISK_PROBE_TIMEOUT_MS = 2_500;

/** Above this, a 4 KiB fsync is a seeking head rather than flash. The
 *  measured pair on the operator's machine was 11.2 ms (platter) against
 *  0.22 ms (NVMe), so the boundary sits an order of magnitude from both. */
export const HDD_FSYNC_MS = 3;

/**
 * Classifies a Windows `MSFT_PhysicalDisk` row.
 *
 * `MediaType` is the reliable field: 3 = HDD, 4 = SSD, 5 = SCM. `BusType`
 * is NOT reliable — the SATA drive on the operator's machine reports bus
 * type 8 (RAID) because of the controller mode, so NVMe is read from the
 * friendly name and the bus type together, and a disagreement resolves
 * down to plain `ssd` rather than up.
 */
export function classifyWindowsDisk(json: string): DiskClass {
  let row: { MediaType?: number; BusType?: number; FriendlyName?: string };
  try {
    const parsed: unknown = JSON.parse(json);
    row = (Array.isArray(parsed) ? parsed[0] : parsed) as typeof row;
  } catch {
    return 'unknown';
  }
  if (row === null || typeof row !== 'object') return 'unknown';
  if (row.MediaType === 3) return 'hdd';
  if (row.MediaType === 4 || row.MediaType === 5) {
    // 17 is NVMe. The friendly name is the corroborating signal, since a
    // controller in RAID mode hides the real bus type behind 8.
    return row.BusType === 17 ? 'nvme' : 'ssd';
  }
  return 'unknown';
}

/**
 * Classifies a Linux block device from `/sys/block/<dev>/queue/rotational`
 * plus the device name.
 *
 * `rotational` has one notorious lie: virtio-blk reports 1 unconditionally,
 * so every `/dev/vda` on every KVM guest claims to be spinning rust. A
 * `vd*` name therefore resolves to `unknown` rather than to `hdd` — the
 * direction that does not throttle a VM whose backing store is flash.
 */
export function classifyLinuxDisk(rotational: string, deviceName: string): DiskClass {
  const name = deviceName.trim().toLowerCase();
  if (name.startsWith('nvme')) return 'nvme';
  if (name.startsWith('vd')) return 'unknown';
  const flag = rotational.trim();
  if (flag === '0') return 'ssd';
  if (flag === '1') return 'hdd';
  return 'unknown';
}

/**
 * Classifies a macOS `diskutil info -plist` payload.
 *
 * Prefers the boolean `SolidState` over any string. `BusProtocol` reads
 * "Apple Fabric" on Apple Silicon rather than "PCI-Express", so NVMe is
 * inferred from either spelling and anything else solid-state stays `ssd`.
 */
export function classifyDarwinDisk(plist: string): DiskClass {
  const solid = /<key>SolidState<\/key>\s*<(true|false)\/>/.exec(plist);
  if (solid === null) return 'unknown';
  if (solid[1] === 'false') return 'hdd';
  const bus = /<key>BusProtocol<\/key>\s*<string>([^<]*)<\/string>/.exec(plist);
  const protocol = (bus?.[1] ?? '').toLowerCase();
  return protocol.includes('pci-express') || protocol.includes('apple fabric') ? 'nvme' : 'ssd';
}

/** Classifies from a measured fsync median — the last resort, and the only
 *  probe that works everywhere. It can tell slow from fast; it cannot tell
 *  an NVMe from a SATA SSD, and it does not pretend to. */
export function classifyByFsync(medianMs: number): DiskClass {
  if (!Number.isFinite(medianMs) || medianMs <= 0) return 'unknown';
  return medianMs >= HDD_FSYNC_MS ? 'hdd' : 'ssd';
}

/** Runs one command and returns its stdout, or `undefined` on any failure.
 *  Injected so the detector below stays testable without a real machine. */
export type ProbeExec = (command: string, args: readonly string[]) => Promise<string | undefined>;

/**
 * Asks the platform what `path` lives on.
 *
 * One command, hard-bounded, and every failure resolves to `unknown` rather
 * than throwing — a Fly-bar roll must not be able to fail because a probe
 * did. The caller caches the answer: a disk does not change under a running
 * dashboard, and re-asking on every roll would spend the budget repeatedly
 * for a constant.
 *
 * Windows deliberately uses the direct CIM class rather than the Storage
 * module's `Get-PhysicalDisk`, which measured eight times slower for the
 * same fields. It never calls `wmic`, which Windows removed in 2026.
 */
export async function detectDiskClass(
  path: string,
  platform: NodeJS.Platform,
  exec: ProbeExec,
): Promise<DiskClass> {
  if (platform === 'win32') {
    const volume = /^([a-z]):/i.exec(path)?.[1];
    if (volume === undefined) return 'unknown';
    // Volume -> disk number -> that disk's media type. The middle hop is
    // the part that matters: selecting the first physical disk instead would
    // have reported this machine's NVMe for a repo living on its platter,
    // which is the exact wrong answer this whole term exists to avoid.
    // Verified on the operator's machine: Z: -> MediaType 3 (the platter),
    // C: -> MediaType 4 / BusType 17 (the NVMe).
    const script =
      String.raw`$dn = (Get-CimInstance -Namespace root/Microsoft/Windows/Storage ` +
      String.raw`-ClassName MSFT_Partition | Where-Object { $_.DriveLetter -eq '` +
      volume.toUpperCase() +
      String.raw`' }).DiskNumber; if ($dn -eq $null) { '' } else { ` +
      String.raw`Get-CimInstance -Namespace root/Microsoft/Windows/Storage ` +
      String.raw`-ClassName MSFT_PhysicalDisk | Where-Object { $_.DeviceId -eq "$dn" } | ` +
      String.raw`Select-Object -First 1 MediaType,BusType | ConvertTo-Json -Compress }`;
    const out = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    return out === undefined ? 'unknown' : classifyWindowsDisk(out);
  }
  if (platform === 'darwin') {
    const out = await exec('diskutil', ['info', '-plist', path]);
    return out === undefined ? 'unknown' : classifyDarwinDisk(out);
  }
  if (platform === 'linux') {
    // `findmnt` names the source device without needing a mount table parse.
    const source = await exec('findmnt', ['-n', '-o', 'SOURCE', '--target', path]);
    if (source === undefined) return 'unknown';
    const device = /([a-z0-9]+?)\d*$/i.exec(source.trim().replace('/dev/', ''))?.[1];
    if (device === undefined) return 'unknown';
    const rotational = await exec('cat', [`/sys/block/${device}/queue/rotational`]);
    return rotational === undefined ? 'unknown' : classifyLinuxDisk(rotational, device);
  }
  return 'unknown';
}
