// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * WHAT DISK THE WORKTREES ARE ON (profiling, 2026-09-14). Each classifier is
 * pinned against the REAL output shape of its platform's probe, including
 * the three fields that are known to lie: Windows `BusType` under a RAID
 * controller, Linux `rotational` on virtio, and any timed write at all.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyWindowsDisk,
  classifyLinuxDisk,
  classifyDarwinDisk,
  classifyByFsync,
  HDD_FSYNC_MS,
} from '../../src/flight/disk-class.js';

describe('classifyWindowsDisk', () => {
  // These three rows are verbatim from the operator's own machine.
  const REAL = `[{"DeviceId":"0","FriendlyName":"Force MP600","MediaType":4,"SpindleSpeed":0,"SizeGB":1863},
    {"DeviceId":"1","FriendlyName":"Corsair Force LS SSD","MediaType":4,"SpindleSpeed":0,"SizeGB":112},
    {"DeviceId":"2","FriendlyName":"WDC WD1003FZEX-00MK2A0","MediaType":3,"SpindleSpeed":4294967295,"SizeGB":932}]`;

  it('reads a spinning disk off MediaType 3 — the real row this work came from', () => {
    const platter = JSON.parse(REAL)[2] as unknown;
    expect(classifyWindowsDisk(JSON.stringify(platter))).toBe('hdd');
  });

  it('reads flash off MediaType 4, and NVMe only when the bus agrees', () => {
    expect(classifyWindowsDisk('{"MediaType":4,"BusType":17}')).toBe('nvme');
    expect(classifyWindowsDisk('{"MediaType":4,"BusType":11}')).toBe('ssd');
    expect(classifyWindowsDisk('{"MediaType":5,"BusType":17}')).toBe('nvme');
  });

  it('resolves DOWN when BusType lies, rather than claiming NVMe', () => {
    // A SATA drive behind a controller in RAID mode reports BusType 8, not
    // 11 — observed on the operator's machine. Calling that NVMe would
    // remove the only constraint the disk term exists to apply.
    expect(classifyWindowsDisk('{"MediaType":4,"BusType":8}')).toBe('ssd');
  });

  it('takes the first row when handed the whole array, and stays honest about what it can see', () => {
    // These rows carry no BusType — the query that produced them did not ask
    // for one. Disk 0 really IS the NVMe, and the classifier still answers
    // 'ssd', which is correct: without the bus it knows the disk is flash and
    // nothing more. Resolving up to 'nvme' on a friendly name would be a
    // guess, and 'ssd' and 'nvme' only differ in how many lanes they permit.
    expect(classifyWindowsDisk(REAL)).toBe('ssd');
  });

  it('says unknown for anything it cannot parse or recognise', () => {
    for (const bad of ['', 'not json', '[]', 'null', '{"MediaType":0}', '{"MediaType":99}']) {
      expect(classifyWindowsDisk(bad), bad).toBe('unknown');
    }
  });
});

describe('classifyLinuxDisk', () => {
  it('reads rotational straight when the device name is honest', () => {
    expect(classifyLinuxDisk('1\n', 'sda')).toBe('hdd');
    expect(classifyLinuxDisk('0\n', 'sda')).toBe('ssd');
  });

  it('trusts the nvme name over anything rotational says', () => {
    expect(classifyLinuxDisk('1', 'nvme0n1')).toBe('nvme');
  });

  it('refuses to believe virtio, which always claims to be spinning', () => {
    // virtio-blk sets the rotational feature unconditionally, so every
    // /dev/vda on every KVM guest reports 1. Throttling a VM backed by
    // flash is the expensive mistake here, so this resolves to unknown.
    expect(classifyLinuxDisk('1', 'vda')).toBe('unknown');
  });

  it('says unknown for an unreadable flag', () => {
    expect(classifyLinuxDisk('', 'sda')).toBe('unknown');
    expect(classifyLinuxDisk('maybe', 'sda')).toBe('unknown');
  });
});

describe('classifyDarwinDisk', () => {
  const plist = (solid: boolean, protocol: string): string =>
    `<dict><key>SolidState</key><${solid}/><key>BusProtocol</key><string>${protocol}</string></dict>`;

  it('prefers the SolidState boolean', () => {
    expect(classifyDarwinDisk(plist(false, 'SATA'))).toBe('hdd');
    expect(classifyDarwinDisk(plist(true, 'SATA'))).toBe('ssd');
  });

  it('recognises Apple Silicon’s own bus spelling as NVMe', () => {
    expect(classifyDarwinDisk(plist(true, 'PCI-Express'))).toBe('nvme');
    expect(classifyDarwinDisk(plist(true, 'Apple Fabric'))).toBe('nvme');
  });

  it('says unknown when the key is absent', () => {
    expect(classifyDarwinDisk('<dict></dict>')).toBe('unknown');
  });
});

describe('classifyByFsync — the probe that works everywhere', () => {
  it('separates the two real measurements this work started from', () => {
    // 11.21 ms on the platter, 0.22 ms on the NVMe, measured on the
    // operator's machine. The threshold sits an order of magnitude from both.
    expect(classifyByFsync(11.21)).toBe('hdd');
    expect(classifyByFsync(0.22)).toBe('ssd');
    expect(HDD_FSYNC_MS).toBeGreaterThan(0.22);
    expect(HDD_FSYNC_MS).toBeLessThan(11.21);
  });

  it('never claims NVMe — it cannot tell flash apart, and does not pretend to', () => {
    expect(classifyByFsync(0.01)).toBe('ssd');
  });

  it('says unknown rather than guessing from a nonsense measurement', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(classifyByFsync(bad), String(bad)).toBe('unknown');
    }
  });
});
