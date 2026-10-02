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
  detectDiskClass,
  HDD_FSYNC_MS,
  type ProbeExec,
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

  it('stays at plain ssd when a solid-state disk names no bus at all', () => {
    expect(classifyDarwinDisk('<dict><key>SolidState</key><true/></dict>')).toBe('ssd');
  });
});

describe('detectDiskClass', () => {
  const execFrom = (responses: Record<string, string>): ProbeExec => {
    return (command, args) => Promise.resolve(responses[[command, ...args].join(' ')]);
  };

  it('resolves an NVMe root device on Linux, whose name embeds digits sd*/vd* never would', () => {
    // /dev/nvme0n1p1 -> base device nvme0n1. A naive "strip trailing digits"
    // reader would query /sys/block/nvme0n for rotational and get nothing.
    const exec = execFrom({
      'findmnt -n -o SOURCE --target /': '/dev/nvme0n1p1',
      'cat /sys/block/nvme0n1/queue/rotational': '0',
    });
    return detectDiskClass('/', 'linux', exec).then((result) => {
      expect(result).toBe('nvme');
    });
  });

  it('resolves an eMMC device on Linux the same way, base name mmcblk0 not mmcblk', () => {
    const exec = execFrom({
      'findmnt -n -o SOURCE --target /': '/dev/mmcblk0p1',
      'cat /sys/block/mmcblk0/queue/rotational': '0',
    });
    return detectDiskClass('/', 'linux', exec).then((result) => {
      expect(result).toBe('ssd');
    });
  });

  it('still resolves an ordinary sd* partition on Linux — the regression guard', () => {
    const exec = execFrom({
      'findmnt -n -o SOURCE --target /': '/dev/sda1',
      'cat /sys/block/sda/queue/rotational': '1',
    });
    return detectDiskClass('/', 'linux', exec).then((result) => {
      expect(result).toBe('hdd');
    });
  });

  it('says unknown on Linux when findmnt fails, without ever calling cat', () => {
    return detectDiskClass('/', 'linux', () => Promise.resolve(undefined)).then((result) => {
      expect(result).toBe('unknown');
    });
  });

  it('says unknown on Linux when findmnt names no device or rotational cannot be read', () => {
    return Promise.all([
      detectDiskClass('/', 'linux', execFrom({ 'findmnt -n -o SOURCE --target /': '\n' })),
      detectDiskClass('/', 'linux', execFrom({ 'findmnt -n -o SOURCE --target /': '/dev/sda1' })),
    ]).then((results) => {
      expect(results).toEqual(['unknown', 'unknown']);
    });
  });

  it('asks Windows for the disk behind the path’s own volume, not the first physical disk', () => {
    // Volume -> partition's disk number -> that disk's row. On the operator's
    // machine disk 0 is the NVMe while Z: is the platter, so a probe that
    // skipped the partition hop would answer exactly backwards.
    const calls: (readonly string[])[] = [];
    const exec: ProbeExec = (command, args) => {
      calls.push([command, ...args]);
      return Promise.resolve('{"MediaType":3,"BusType":8}');
    };
    return detectDiskClass('z:\\Claude\\AUTOPILOT', 'win32', exec).then((result) => {
      expect(result).toBe('hdd');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.slice(0, 4)).toEqual([
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
      ]);
      const script = calls[0]?.[4] ?? '';
      expect(script).toContain(
        "-ClassName MSFT_Partition | Where-Object { $_.DriveLetter -eq 'Z' }).DiskNumber",
      );
      expect(script).toContain(
        '-ClassName MSFT_PhysicalDisk | Where-Object { $_.DeviceId -eq "$dn" }',
      );
      expect(script).not.toContain('wmic');
    });
  });

  it('answers per volume on Windows — the platter and the NVMe in the same box', () => {
    // Verified on the operator's machine: Z: -> MediaType 3, C: -> MediaType 4 / BusType 17.
    const exec: ProbeExec = (_command, args) =>
      Promise.resolve(
        args.at(-1)?.includes("DriveLetter -eq 'Z'") === true
          ? '{"MediaType":3,"BusType":8}'
          : '{"MediaType":4,"BusType":17}',
      );
    return Promise.all([
      detectDiskClass('Z:\\repo', 'win32', exec),
      detectDiskClass('C:\\repo', 'win32', exec),
    ]).then((results) => {
      expect(results).toEqual(['hdd', 'nvme']);
    });
  });

  it('says unknown on Windows for a path with no drive letter, without spawning PowerShell', () => {
    // A UNC share, a relative path or a POSIX-style path names no local volume to look up.
    let spawned = 0;
    const exec: ProbeExec = () => {
      spawned += 1;
      return Promise.resolve('{"MediaType":3}');
    };
    return Promise.all(
      ['\\\\server\\share\\repo', 'repo', '/z/repo'].map((p) => detectDiskClass(p, 'win32', exec)),
    ).then((results) => {
      expect(results).toEqual(['unknown', 'unknown', 'unknown']);
      expect(spawned).toBe(0);
    });
  });

  it('says unknown on Windows when PowerShell fails or finds no partition for the letter', () => {
    // The script prints '' when no partition carries the drive letter.
    return Promise.all([
      detectDiskClass('C:\\', 'win32', () => Promise.resolve(undefined)),
      detectDiskClass('C:\\', 'win32', () => Promise.resolve('')),
    ]).then((results) => {
      expect(results).toEqual(['unknown', 'unknown']);
    });
  });

  it('asks diskutil about the path itself on macOS', () => {
    const exec = execFrom({
      'diskutil info -plist /Volumes/Work/repo':
        '<dict><key>SolidState</key><true/><key>BusProtocol</key><string>Apple Fabric</string></dict>',
    });
    return detectDiskClass('/Volumes/Work/repo', 'darwin', exec).then((result) => {
      expect(result).toBe('nvme');
    });
  });

  it('says unknown on macOS when diskutil fails', () => {
    return detectDiskClass('/', 'darwin', () => Promise.resolve(undefined)).then((result) => {
      expect(result).toBe('unknown');
    });
  });

  it('says unknown for a platform none of the probes cover', () => {
    return detectDiskClass('/', 'sunos', () => Promise.resolve('anything')).then((result) => {
      expect(result).toBe('unknown');
    });
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
