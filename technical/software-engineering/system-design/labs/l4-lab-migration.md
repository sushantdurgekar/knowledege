---
title: "An online migration between two databases, with crashes, half-done writes and verification"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l4, lab]
status: new
created: 2026-10-12
updated: 2026-10-12
---
# Lab: An online migration between two databases, with crashes, half-done writes and verification

> System Design L4 · about 90 min · modules m04

Move 2,000 customer records from an old SQLite store to a new one with a different shape (name split into first and last), while the application keeps updating them. Dual write every update, backfill in batches with conditional writes and a checkpoint, crash the backfill and resume it, let some dual writes die halfway, then find and repair every difference with range checksums, run a parallel read check, and only then contract.

## Before you start
- Python 3.12+ (sqlite3) and Node.js 22.13+ (node:sqlite)
- Read module 4

## Steps
1. Create the old store with 2,000 customers and a version column, and the new store with the new shape: the expand step.
2. Write the application's update as a dual write: update the old store, then upsert the new one only if the version is newer. Make one in a hundred die between the two writes.
3. Write a backfill that reads a batch, lets live traffic run, writes the batch conditionally, and saves a checkpoint; crash it after batch 4, before the checkpoint, and resume it.
4. Keep dual writes going after the backfill, then compare the stores range by range with checksums, and repair each differing record from the old store.
5. Read 500 random records from both stores and count mismatches; switch reads, then drop the old table: the contract step.

## Prove it worked
- The resumed backfill redoes batch 4 without harm, because its writes are conditional and idempotent.
- Seven dual writes died halfway; the checksums find the five records that stayed stale, and repairing them leaves no differences.
- 500 parallel reads match before reads switch, and the old table is dropped last.

## Break it (then fix it)
- Make the backfill's write unconditional and count the records it rolls back to older versions.
- Remove the checkpoint and restart the backfill from the beginning after the crash: what does it cost, and is the result still right?
- Drop the old table before the second verification and explain what you can no longer repair.

## Starter code
```python
import sqlite3

def mulberry32(seed): ...                       # copy the seeded generator from module 4

UPSERT = "..."                                  # TODO: insert, or update only WHERE excluded.version > customers.version

def live_update(): ...                          # TODO: old store first, then the new one; sometimes die in between
def backfill(crash_after=None): ...             # TODO: batches from the checkpoint, conditional writes, then save it
def verify_and_repair(): ...                    # TODO: checksums per range, then record by record where they differ
```

```javascript
const { DatabaseSync } = require("node:sqlite");

function mulberry32(seed) { /* copy the seeded generator from module 4 */ }
const UPSERT_SQL = "...";                       // TODO: insert, or update only WHERE excluded.version > customers.version
function liveUpdate() { /* TODO: old store first, then the new one; sometimes die in between */ }
function backfill(crashAfter = null) { /* TODO: batches from the checkpoint, conditional writes, then save it */ }
function verifyAndRepair() { /* TODO: checksums per range, then record by record where they differ */ }
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""An online migration between two databases: expand, dual writes, a resumable backfill, verification, switch, contract."""
import sqlite3

def mulberry32(seed):                               # a tiny seeded random generator, same as the JavaScript one
    state = seed & 0xFFFFFFFF
    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand

FIRST = ["Ada", "Alan", "Grace", "Edsger", "Barbara", "Donald", "Frances", "Ken"]
LAST = ["Lovelace", "Turing", "Hopper", "Dijkstra", "Liskov", "Knuth", "Allen", "Thompson"]
N, BATCH, RANGE = 2_000, 200, 100
rand = mulberry32(2026)

old = sqlite3.connect(":memory:", isolation_level=None)   # the old store: the source of truth until the switch
old.execute("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT, version INTEGER)")
old.execute("BEGIN")
for i in range(1, N + 1):
    old.execute("INSERT INTO customers VALUES (?, ?, ?, 1)",
                (i, f"{FIRST[i % 8]} {LAST[i * 3 % 8]}", f"c{i}@example.com"))
old.execute("COMMIT")

new = sqlite3.connect(":memory:", isolation_level=None)   # expand: the new store with the new shape
new.execute("CREATE TABLE customers (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, version INTEGER)")
UPSERT = """INSERT INTO customers VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
            first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email,
            version = excluded.version WHERE excluded.version > customers.version"""

def to_new(row):                                    # (id, name, email, version) -> the new shape
    first, last = row[1].split(" ", 1)
    return row[0], first, last, row[2], row[3]

stats = {"updates": 0, "half_done": 0}

def live_update():                                  # the application, dual writing: old store first, then the new one
    i = 1 + int(rand() * N)
    name = f"{FIRST[int(rand() * 8)]} {LAST[int(rand() * 8)]}"
    old.execute("UPDATE customers SET name = ?, version = version + 1 WHERE id = ?", (name, i))
    row = old.execute("SELECT id, name, email, version FROM customers WHERE id = ?", (i,)).fetchone()
    stats["updates"] += 1
    if rand() < 0.01:                               # the process dies between the two writes
        stats["half_done"] += 1
        return
    new.execute(UPSERT, to_new(row))

def backfill(crash_after=None):                     # resumable: the checkpoint is the last id copied
    checkpoint = new.execute("SELECT COALESCE(MAX(value), 0) FROM progress").fetchone()[0]
    batches = 0
    while True:
        rows = old.execute("SELECT id, name, email, version FROM customers WHERE id > ? ORDER BY id LIMIT ?",
                           (checkpoint, BATCH)).fetchall()
        if not rows:
            return batches
        for _ in range(30):                         # live traffic keeps going while the batch is in flight
            live_update()
        new.execute("BEGIN")
        for row in rows:
            new.execute(UPSERT, to_new(row))        # conditional: never overwrite a newer dual-written version
        new.execute("COMMIT")
        batches += 1
        if crash_after == batches:
            return None                             # crashed before saving the checkpoint
        checkpoint = rows[-1][0]
        new.execute("INSERT INTO progress VALUES (?)", (checkpoint,))

def fnv(text):
    h = 2166136261
    for byte in text.encode():
        h = ((h ^ byte) * 16777619) & 0xFFFFFFFF
    return h

def mix(h):                                         # MurmurHash3's finaliser, so small edits can't cancel out in a sum
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    return h ^ (h >> 16)

def snapshot(start, end):                           # each store's rows for ids start..end - 1, in one canonical form
    a = {r[0]: "|".join(map(str, to_new(r))) for r in old.execute(
        "SELECT id, name, email, version FROM customers WHERE id >= ? AND id < ?", (start, end))}
    b = {r[0]: "|".join(map(str, r)) for r in new.execute(
        "SELECT id, first_name, last_name, email, version FROM customers WHERE id >= ? AND id < ?", (start, end))}
    return a, b

def verify_and_repair():
    differing = repaired = 0
    for start in range(1, N + 1, RANGE):
        a, b = snapshot(start, start + RANGE)
        if sum(mix(fnv(x)) for x in a.values()) % 2**32 == sum(mix(fnv(x)) for x in b.values()) % 2**32:
            continue                                # one number per range, not RANGE rows
        differing += 1
        for i in sorted(set(a) | set(b)):
            if a.get(i) != b.get(i):
                row = old.execute("SELECT id, name, email, version FROM customers WHERE id = ?", (i,)).fetchone()
                new.execute(UPSERT, to_new(row))    # the old store is still the source of truth
                repaired += 1
    return differing, repaired

new.execute("CREATE TABLE progress (value INTEGER)")
first_run = backfill(crash_after=4)
resumed = backfill()
copied = new.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
print(f"backfill: crashed after 4 batches, resumed from the checkpoint and ran {resumed} more, "
      f"redoing batch 4 safely; {copied:,} rows copied")
for _ in range(300):                                # dual writes continue until reads and writes have switched
    live_update()
print(f"live traffic during and after the backfill: {stats['updates']} dual writes, {stats['half_done']} died halfway")
differing, repaired = verify_and_repair()
print(f"verify: {differing} of {N // RANGE} ranges differed; {repaired} records repaired from the old store")
again = verify_and_repair()
print(f"verify again: {again[0]} ranges differ")

reads = mismatches = 0
for _ in range(500):                                # parallel run: read both, serve the old answer, count differences
    i = 1 + int(rand() * N)
    a = to_new(old.execute("SELECT id, name, email, version FROM customers WHERE id = ?", (i,)).fetchone())
    b = new.execute("SELECT id, first_name, last_name, email, version FROM customers WHERE id = ?", (i,)).fetchone()
    reads, mismatches = reads + 1, mismatches + (a != tuple(b))
print(f"parallel reads: {reads} compared, {mismatches} mismatches: switch reads to the new store")
old.execute("DROP TABLE customers")                 # contract, once nothing reads or writes the old table
print("contract: dual writes off, old table dropped")

assert first_run is None and resumed == 7 and copied == N
assert 0 < repaired <= stats["half_done"] and again == (0, 0) and mismatches == 0
print("migration lab OK")
```

Output:
```text
backfill: crashed after 4 batches, resumed from the checkpoint and ran 7 more, redoing batch 4 safely; 2,000 rows copied
live traffic during and after the backfill: 630 dual writes, 7 died halfway
verify: 5 of 20 ranges differed; 5 records repaired from the old store
verify again: 0 ranges differ
parallel reads: 500 compared, 0 mismatches: switch reads to the new store
contract: dual writes off, old table dropped
migration lab OK
```

```javascript
// An online migration between two databases: expand, dual writes, a resumable backfill, verification, switch, contract.
const { DatabaseSync } = require("node:sqlite");

function mulberry32(seed) {                            // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Ada", "Alan", "Grace", "Edsger", "Barbara", "Donald", "Frances", "Ken"];
const LAST = ["Lovelace", "Turing", "Hopper", "Dijkstra", "Liskov", "Knuth", "Allen", "Thompson"];
const N = 2000, BATCH = 200, RANGE = 100;
const rand = mulberry32(2026);

const old = new DatabaseSync(":memory:");              // the old store: the source of truth until the switch
old.exec("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT, version INTEGER)");
old.exec("BEGIN");
const insertOld = old.prepare("INSERT INTO customers VALUES (?, ?, ?, 1)");
for (let i = 1; i <= N; i++) insertOld.run(i, `${FIRST[i % 8]} ${LAST[(i * 3) % 8]}`, `c${i}@example.com`);
old.exec("COMMIT");

const fresh = new DatabaseSync(":memory:");            // expand: the new store with the new shape
fresh.exec("CREATE TABLE customers (id INTEGER PRIMARY KEY, first_name TEXT, last_name TEXT, email TEXT, version INTEGER)");
const upsert = fresh.prepare(`INSERT INTO customers VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
            first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email,
            version = excluded.version WHERE excluded.version > customers.version`);
const readOld = old.prepare("SELECT id, name, email, version FROM customers WHERE id = ?");
const readNew = fresh.prepare("SELECT id, first_name, last_name, email, version FROM customers WHERE id = ?");

function toNew(row) {                                  // {id, name, email, version} -> the new shape, as an array
  const space = row.name.indexOf(" ");
  return [row.id, row.name.slice(0, space), row.name.slice(space + 1), row.email, row.version];
}
const asArray = r => [r.id, r.first_name, r.last_name, r.email, r.version];

const stats = { updates: 0, halfDone: 0 };

function liveUpdate() {                                // the application, dual writing: old store first, then the new one
  const i = 1 + Math.floor(rand() * N);
  const name = `${FIRST[Math.floor(rand() * 8)]} ${LAST[Math.floor(rand() * 8)]}`;
  old.prepare("UPDATE customers SET name = ?, version = version + 1 WHERE id = ?").run(name, i);
  const row = readOld.get(i);
  stats.updates++;
  if (rand() < 0.01) {                                 // the process dies between the two writes
    stats.halfDone++;
    return;
  }
  upsert.run(...toNew(row));
}

function backfill(crashAfter = null) {                 // resumable: the checkpoint is the last id copied
  let checkpoint = fresh.prepare("SELECT COALESCE(MAX(value), 0) AS v FROM progress").get().v;
  let batches = 0;
  const page = old.prepare("SELECT id, name, email, version FROM customers WHERE id > ? ORDER BY id LIMIT ?");
  for (;;) {
    const rows = page.all(checkpoint, BATCH);
    if (!rows.length) return batches;
    for (let u = 0; u < 30; u++) liveUpdate();         // live traffic keeps going while the batch is in flight
    fresh.exec("BEGIN");
    for (const row of rows) upsert.run(...toNew(row)); // conditional: never overwrite a newer dual-written version
    fresh.exec("COMMIT");
    batches++;
    if (crashAfter === batches) return null;           // crashed before saving the checkpoint
    checkpoint = rows[rows.length - 1].id;
    fresh.prepare("INSERT INTO progress VALUES (?)").run(checkpoint);
  }
}

function fnv(text) {
  let h = 2166136261;
  for (const byte of Buffer.from(text)) h = Math.imul(h ^ byte, 16777619) >>> 0;
  return h;
}

function mix(h) {                                      // MurmurHash3's finaliser, so small edits can't cancel out in a sum
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function snapshot(start, end) {                        // each store's rows for ids start..end - 1, in one canonical form
  const a = new Map(old.prepare("SELECT id, name, email, version FROM customers WHERE id >= ? AND id < ?")
    .all(start, end).map(r => [r.id, toNew(r).join("|")]));
  const b = new Map(fresh.prepare("SELECT id, first_name, last_name, email, version FROM customers WHERE id >= ? AND id < ?")
    .all(start, end).map(r => [r.id, asArray(r).join("|")]));
  return [a, b];
}

const checksum = map => [...map.values()].reduce((sum, text) => sum + mix(fnv(text)), 0) % 2 ** 32;

function verifyAndRepair() {
  let differing = 0, repaired = 0;
  for (let start = 1; start <= N; start += RANGE) {
    const [a, b] = snapshot(start, start + RANGE);
    if (checksum(a) === checksum(b)) continue;         // one number per range, not RANGE rows
    differing++;
    const ids = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
    for (const i of ids) {
      if (a.get(i) !== b.get(i)) {
        upsert.run(...toNew(readOld.get(i)));          // the old store is still the source of truth
        repaired++;
      }
    }
  }
  return [differing, repaired];
}

fresh.exec("CREATE TABLE progress (value INTEGER)");
const firstRun = backfill(4);
const resumed = backfill();
const copied = fresh.prepare("SELECT COUNT(*) AS n FROM customers").get().n;
console.log(`backfill: crashed after 4 batches, resumed from the checkpoint and ran ${resumed} more, ` +
            `redoing batch 4 safely; ${copied.toLocaleString("en-US")} rows copied`);
for (let u = 0; u < 300; u++) liveUpdate();            // dual writes continue until reads and writes have switched
console.log(`live traffic during and after the backfill: ${stats.updates} dual writes, ${stats.halfDone} died halfway`);
const [differing, repaired] = verifyAndRepair();
console.log(`verify: ${differing} of ${N / RANGE} ranges differed; ${repaired} records repaired from the old store`);
const again = verifyAndRepair();
console.log(`verify again: ${again[0]} ranges differ`);

let reads = 0, mismatches = 0;
for (let r = 0; r < 500; r++) {                        // parallel run: read both, serve the old answer, count differences
  const i = 1 + Math.floor(rand() * N);
  const a = toNew(readOld.get(i)), b = asArray(readNew.get(i));
  reads++;
  if (a.join("|") !== b.join("|")) mismatches++;
}
console.log(`parallel reads: ${reads} compared, ${mismatches} mismatches: switch reads to the new store`);
old.exec("DROP TABLE customers");                      // contract, once nothing reads or writes the old table
console.log("contract: dual writes off, old table dropped");

if (firstRun !== null || resumed !== 7 || copied !== N) throw new Error("backfill");
if (!(repaired > 0 && repaired <= stats.halfDone) || again[0] !== 0 || again[1] !== 0 || mismatches !== 0) throw new Error("verification");
console.log("migration lab OK");
```

Output:
```text
backfill: crashed after 4 batches, resumed from the checkpoint and ran 7 more, redoing batch 4 safely; 2,000 rows copied
live traffic during and after the backfill: 630 dual writes, 7 died halfway
verify: 5 of 20 ranges differed; 5 records repaired from the old store
verify again: 0 ranges differ
parallel reads: 500 compared, 0 mismatches: switch reads to the new store
contract: dual writes off, old table dropped
migration lab OK
```

</details>
