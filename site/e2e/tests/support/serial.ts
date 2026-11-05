/**
 * `test` for the specs that change state the whole server shares (the `sync` project: tests that
 * reset the store, set faults, quota, clock offsets or maintenance, delete accounts).
 *
 * The `sync` project already asks Playwright for one worker (`workers: 1` in playwright.config.ts),
 * but Playwright 1.56 does not enforce that limit while a worker slot switches projects. The
 * dispatcher counts only slots whose worker already belongs to the project, and a slot that has
 * just taken a sync test is still stopping its previous M0 worker. So when the M0 tests run out,
 * two or more sync spec files can start together. One of them then resets the server, or deletes
 * userA, in the middle of another's test.
 *
 * This fixture closes that gap. Every test here holds a lock file for the server under test from
 * before its `beforeEach` hooks until after its `afterEach` hooks. The lock spans processes: each
 * Playwright worker is a process. A lock left by a worker that died (its pid is gone) is taken
 * over. The time spent waiting is added to the test's timeout, so a waiting test never times out
 * because of another test.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base } from '@playwright/test';
import { BASE_URL } from './env';

const LOCK = path.join(os.tmpdir(), `studyhubs-e2e-${createHash('sha1').update(BASE_URL).digest('hex').slice(0, 12)}.lock`);
const POLL_MS = 50;

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'; // exists, owned by someone else
  }
};

/** Take the lock if it is free (or its owner died); false while another live worker holds it. */
function tryLock(): boolean {
  try {
    const fd = fs.openSync(LOCK, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  let owner = NaN;
  try {
    owner = Number(fs.readFileSync(LOCK, 'utf8'));
  } catch {
    return false; // released between our open and read: try again on the next poll
  }
  // An empty file is a lock being written right now; a dead pid is a lock nobody will release.
  if (Number.isInteger(owner) && owner > 0 && owner !== process.pid && !alive(owner)) {
    try {
      fs.unlinkSync(LOCK);
    } catch {
      /* another waiter took it over first */
    }
  }
  return false;
}

function unlock(): void {
  try {
    if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) fs.unlinkSync(LOCK);
  } catch {
    /* already gone */
  }
}

export const test = base.extend<{ sharedServer: void }>({
  sharedServer: [
    async ({}, use, testInfo) => {
      const started = Date.now();
      while (!tryLock()) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const waited = Date.now() - started;
      if (waited > 0 && testInfo.timeout > 0) testInfo.setTimeout(testInfo.timeout + waited);
      try {
        await use();
      } finally {
        unlock();
      }
    },
    { auto: true },
  ],
});
