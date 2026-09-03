// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

// Real second writer for the two-writer concurrency test (db.test.ts):
// runs on its own OS thread so it can hold a write lock via a blocking
// Atomics.wait while the main thread's connection contends for the same
// file — something a single-threaded, same-process test cannot simulate,
// since better-sqlite3 is fully synchronous.
import { parentPort, workerData } from 'node:worker_threads';
import Database from 'better-sqlite3';

const { dbPath, holdMs } = workerData;

const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');
db.exec('BEGIN IMMEDIATE');
parentPort.postMessage('locked');
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, holdMs);
db.exec('COMMIT');
db.close();
parentPort.postMessage('released');
