---
title: "A tiny LSM key-value store: write-ahead log, SSTables, crash recovery and compaction"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: A tiny LSM key-value store: write-ahead log, SSTables, crash recovery and compaction

> System Design L3 · about 90 min · modules m05

Build a key-value store on disk the way LSM engines do: every write is appended to a write-ahead log and flushed with fsync before it's acknowledged, a memtable holds recent writes, full memtables become immutable sorted SSTable files, reads check the memtable and then the tables from newest to oldest, deletes write tombstones, and compaction merges the tables. Crash it three times, once halfway through writing a log record, and prove that every restart recovers exactly the acknowledged writes.

## Before you start
- Python 3.12+ and Node.js 22+
- Read module 5

## Steps
1. Write a record to wal.log for every put and delete, flush and fsync it, then update the memtable; when the memtable holds 50 keys, write it as a sorted SSTable (a temporary file, fsynced, then renamed) and start a new log.
2. get(key) looks in the memtable, then in each SSTable from newest to oldest; count how many tables each read searches.
3. On open, load the SSTables, replay the log into the memtable, and stop at a torn final record, rewriting the log without it.
4. Run 2,000 random puts and deletes over 300 keys, crashing after 500, 1,000 and 1,500 writes; at 1,000, die halfway through a record. Compare every key with a reference dictionary after each restart.
5. Compact all tables into one, dropping tombstones, and compare the tables searched per read before and after.

## Prove it worked
- Every restart recovers exactly the acknowledged writes; the torn record is ignored because it was never acknowledged.
- Reads search 5.1 tables on average before compaction and 1.0 after.
- Compaction drops 62 tombstones, which is only safe because nothing older remains below the merged table.

## Break it (then fix it)
- Skip the fsync and simulate a power cut by dropping the last log records the OS hadn't written: which acknowledged writes vanish?
- Drop tombstones while merging only the two newest tables, and watch deleted keys come back.
- Write SSTables in place instead of renaming a temporary file, crash halfway, and see what the restart reads.

## Starter code
```python
import json, os, tempfile

def mulberry32(seed): ...                       # copy the seeded generator from module 1

class LSMStore:
    def __init__(self, folder, memtable_limit=50):
        ...                                     # TODO: load the SSTables, replay the log, drop a torn tail
    def write(self, key, value): ...            # TODO: log, fsync, memtable, flush when full
    def get(self, key): ...                     # TODO: memtable, then tables newest first
    def compact(self): ...                      # TODO: merge, drop tombstones, delete old files
```

```javascript
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

function mulberry32(seed) { /* copy the seeded generator from module 1 */ }

class LSMStore {
  constructor(folder, memtableLimit = 50) { /* TODO: load the SSTables, replay the log, drop a torn tail */ }
  write(key, value) { /* TODO: log, fsync, memtable, flush when full */ }
  get(key) { /* TODO: memtable, then tables newest first */ }
  compact() { /* TODO: merge, drop tombstones, delete old files */ }
}
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""A tiny LSM key-value store on disk: a write-ahead log, a memtable, SSTable files, crash recovery and compaction."""
import json
import os
import shutil
import tempfile

def mulberry32(seed):                               # a tiny seeded random generator, same as the JavaScript one
    state = seed & 0xFFFFFFFF
    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand

class LSMStore:
    def __init__(self, folder, memtable_limit=50):
        self.folder, self.limit, self.tables = folder, memtable_limit, []   # tables: (number, dict), newest first
        for name in sorted(n for n in os.listdir(folder) if n.startswith("sst-") and n.endswith(".jsonl")):
            with open(self.path(int(name[4:10]))) as f:
                self.tables.insert(0, (int(name[4:10]), dict(json.loads(line) for line in f)))
        self.memtable, self.recovered, good = {}, 0, []
        wal = os.path.join(folder, "wal.log")
        if os.path.exists(wal):
            with open(wal) as f:
                for line in f:
                    try:
                        key, value = json.loads(line)
                    except ValueError:
                        break                       # a torn record from a crash mid-write: it was never acknowledged
                    self.memtable[key] = value
                    good.append(line if line.endswith("\n") else line + "\n")
                    self.recovered += 1
        with open(wal + ".tmp", "w") as f:          # rewrite the log without the torn tail
            f.writelines(good)
        os.replace(wal + ".tmp", wal)
        self.wal = open(wal, "a")

    def path(self, number):
        return os.path.join(self.folder, f"sst-{number:06d}.jsonl")

    def write(self, key, value):                    # value None is a delete: a tombstone
        self.wal.write(json.dumps([key, value]) + "\n")
        self.wal.flush()
        os.fsync(self.wal.fileno())                 # durable before the write is acknowledged
        self.memtable[key] = value
        if len(self.memtable) >= self.limit:
            self.save_table(self.memtable)
            self.wal.close()
            self.wal = open(os.path.join(self.folder, "wal.log"), "w")   # those records now live in the table
            self.memtable = {}

    def save_table(self, rows):
        number = self.tables[0][0] + 1 if self.tables else 1
        with open(self.path(number) + ".tmp", "w") as f:
            f.writelines(json.dumps([k, rows[k]]) + "\n" for k in sorted(rows))
            f.flush()
            os.fsync(f.fileno())
        os.replace(self.path(number) + ".tmp", self.path(number))   # a table appears whole, or not at all
        self.tables.insert(0, (number, dict(rows)))

    def get(self, key):
        if key in self.memtable:
            return self.memtable[key], 0
        for searched, (_, table) in enumerate(self.tables, start=1):
            if key in table:
                return table[key], searched         # the newest table holding the key wins
        return None, len(self.tables)

    def compact(self):
        merged = {}
        for _, table in reversed(self.tables):      # oldest first, so newer values overwrite older ones
            merged.update(table)
        live = {k: v for k, v in merged.items() if v is not None}   # nothing older remains: tombstones can go
        old = [n for n, _ in self.tables]
        self.save_table(live)
        for n in old:
            os.remove(self.path(n))
        self.tables = self.tables[:1]
        return len(merged) - len(live)

rand, folder = mulberry32(9), tempfile.mkdtemp()
store, reference, matched = LSMStore(folder), {}, True
keys = [f"k{n:03d}" for n in range(300)]
for i in range(2000):
    key, value = keys[int(rand() * 300)], (None if rand() < 0.2 else int(rand() * 1000))
    store.write(key, value)
    reference[key] = value
    if i in (499, 999, 1499):                       # the process dies; at 999 it dies halfway through a record
        if i == 999:
            store.wal.write('["k007", 12')
            store.wal.flush()
        store.wal.close()
        store = LSMStore(folder)                    # restart: tables from disk, the memtable from the log
        matched = matched and all(store.get(k)[0] == reference.get(k) for k in keys)
before = len(store.tables)
searched_before = sum(store.get(k)[1] for k in keys) * 10 // len(keys)
store.save_table(store.memtable)                    # flush what's left, then merge everything
store.memtable = {}
dropped = store.compact()
searched_after = sum(store.get(k)[1] for k in keys) * 10 // len(keys)
matched = matched and all(store.get(k)[0] == reference.get(k) for k in keys)
live = sum(1 for k in keys if store.get(k)[0] is not None)
store.wal.close()
shutil.rmtree(folder)
print(f"2000 writes, 3 crashes, one halfway through a log record: every restart matched the reference: {'yes' if matched else 'no'}")
print(f"sstables: {before} before compaction, 1 after | tables searched per read: "
      f"{searched_before // 10}.{searched_before % 10} before, {searched_after // 10}.{searched_after % 10} after")
print(f"live keys: {live} | tombstones dropped by compaction: {dropped} | records replayed from the log at the last restart: {store.recovered}")
assert matched and live == sum(1 for v in reference.values() if v is not None)
print("lsm lab OK")
```

Output:
```text
2000 writes, 3 crashes, one halfway through a log record: every restart matched the reference: yes
sstables: 36 before compaction, 1 after | tables searched per read: 5.1 before, 1.0 after
live keys: 238 | tombstones dropped by compaction: 62 | records replayed from the log at the last restart: 41
lsm lab OK
```

```javascript
// A tiny LSM key-value store on disk: a write-ahead log, a memtable, SSTable files, crash recovery and compaction.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function mulberry32(seed) {                         // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class LSMStore {
  constructor(folder, memtableLimit = 50) {
    this.folder = folder; this.limit = memtableLimit; this.tables = [];   // tables: [number, Map], newest first
    for (const name of fs.readdirSync(folder).filter(n => n.startsWith("sst-") && n.endsWith(".jsonl")).sort()) {
      const lines = fs.readFileSync(path.join(folder, name), "utf8").split("\n").filter(Boolean);
      this.tables.unshift([Number(name.slice(4, 10)), new Map(lines.map(line => JSON.parse(line)))]);
    }
    this.memtable = new Map(); this.recovered = 0;
    const wal = path.join(folder, "wal.log"), good = [];
    if (fs.existsSync(wal)) {
      for (const line of fs.readFileSync(wal, "utf8").split("\n").filter(Boolean)) {
        let record;
        try { record = JSON.parse(line); } catch { break; }   // a torn record from a crash mid-write: it was never acknowledged
        this.memtable.set(record[0], record[1]);
        good.push(line + "\n");
        this.recovered++;
      }
    }
    fs.writeFileSync(wal + ".tmp", good.join(""));  // rewrite the log without the torn tail
    fs.renameSync(wal + ".tmp", wal);
    this.wal = fs.openSync(wal, "a");
  }

  path(number) { return path.join(this.folder, `sst-${String(number).padStart(6, "0")}.jsonl`); }

  write(key, value) {                               // value null is a delete: a tombstone
    fs.writeSync(this.wal, JSON.stringify([key, value]) + "\n");
    fs.fsyncSync(this.wal);                         // durable before the write is acknowledged
    this.memtable.set(key, value);
    if (this.memtable.size >= this.limit) {
      this.saveTable(this.memtable);
      fs.closeSync(this.wal);
      this.wal = fs.openSync(path.join(this.folder, "wal.log"), "w");   // those records now live in the table
      this.memtable = new Map();
    }
  }

  saveTable(rows) {
    const number = this.tables.length ? this.tables[0][0] + 1 : 1;
    const fd = fs.openSync(this.path(number) + ".tmp", "w");
    fs.writeSync(fd, [...rows.keys()].sort().map(k => JSON.stringify([k, rows.get(k)]) + "\n").join(""));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(this.path(number) + ".tmp", this.path(number));   // a table appears whole, or not at all
    this.tables.unshift([number, new Map(rows)]);
  }

  get(key) {
    if (this.memtable.has(key)) return [this.memtable.get(key), 0];
    for (let i = 0; i < this.tables.length; i++) {
      if (this.tables[i][1].has(key)) return [this.tables[i][1].get(key), i + 1];   // the newest table holding the key wins
    }
    return [null, this.tables.length];
  }

  compact() {
    const merged = new Map();
    for (const [, table] of [...this.tables].reverse()) for (const [k, v] of table) merged.set(k, v);   // oldest first
    const live = new Map([...merged].filter(([, v]) => v !== null));   // nothing older remains: tombstones can go
    const old = this.tables.map(([n]) => n);
    this.saveTable(live);
    for (const n of old) fs.unlinkSync(this.path(n));
    this.tables = this.tables.slice(0, 1);
    return merged.size - live.size;
  }
}

const rand = mulberry32(9), folder = fs.mkdtempSync(path.join(os.tmpdir(), "lsm-"));
let store = new LSMStore(folder), matched = true;
const reference = new Map(), keys = Array.from({ length: 300 }, (_, n) => `k${String(n).padStart(3, "0")}`);
const matches = () => keys.every(k => store.get(k)[0] === (reference.get(k) ?? null));
for (let i = 0; i < 2000; i++) {
  const key = keys[Math.floor(rand() * 300)], value = rand() < 0.2 ? null : Math.floor(rand() * 1000);
  store.write(key, value);
  reference.set(key, value);
  if (i === 499 || i === 999 || i === 1499) {       // the process dies; at 999 it dies halfway through a record
    if (i === 999) fs.writeSync(store.wal, '["k007", 12');
    fs.closeSync(store.wal);
    store = new LSMStore(folder);                   // restart: tables from disk, the memtable from the log
    matched = matched && matches();
  }
}
const before = store.tables.length;
const searchedBefore = Math.floor(keys.reduce((s, k) => s + store.get(k)[1], 0) * 10 / keys.length);
store.saveTable(store.memtable);                    // flush what's left, then merge everything
store.memtable = new Map();
const dropped = store.compact();
const searchedAfter = Math.floor(keys.reduce((s, k) => s + store.get(k)[1], 0) * 10 / keys.length);
matched = matched && matches();
const live = keys.filter(k => store.get(k)[0] !== null).length;
fs.closeSync(store.wal);
fs.rmSync(folder, { recursive: true });
console.log(`2000 writes, 3 crashes, one halfway through a log record: every restart matched the reference: ${matched ? "yes" : "no"}`);
console.log(`sstables: ${before} before compaction, 1 after | tables searched per read: ` +
            `${Math.floor(searchedBefore / 10)}.${searchedBefore % 10} before, ${Math.floor(searchedAfter / 10)}.${searchedAfter % 10} after`);
console.log(`live keys: ${live} | tombstones dropped by compaction: ${dropped} | records replayed from the log at the last restart: ${store.recovered}`);
if (!matched || live !== [...reference.values()].filter(v => v !== null).length) throw new Error("the store lost or invented data");
console.log("lsm lab OK");
```

Output:
```text
2000 writes, 3 crashes, one halfway through a log record: every restart matched the reference: yes
sstables: 36 before compaction, 1 after | tables searched per read: 5.1 before, 1.0 after
live keys: 238 | tombstones dropped by compaction: 62 | records replayed from the log at the last restart: 41
lsm lab OK
```

</details>
