---
title: "A windowed stream job with watermarks, checkpoints and an idempotent sink"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: A windowed stream job with watermarks, checkpoints and an idempotent sink

> System Design L3 · about 75 min · modules m03

Process 3,000 page views that arrive out of order into one-minute counts per page, by event time. A watermark with 30 seconds of allowed lateness decides when each window is final, and later events are sent aside. Save checkpoints of the job's state and input offset to disk, crash the job twice, restart from the checkpoints, and show that an upserting sink ends up exactly as in a run without crashes, while an append-only sink collects duplicates.

## Before you start
- Python 3.12+ and Node.js 22.13+ (node:sqlite)
- Read module 3

## Steps
1. Generate the events with the seeded generator: an event time over 20 minutes, a page, and an arrival time, 2 seconds later usually and 20 to 150 seconds later for one event in ten. Sort them by arrival.
2. Keep state as plain data: the input offset, the newest event time, the open windows' counts, the windows already emitted and the late count.
3. For each event: count it in its tumbling window, or send it aside if that window was already emitted; advance the watermark; emit every window whose end is behind it to a SQLite sink with an upsert, and also append it to a second table.
4. Every 500 events, write the state to checkpoint.json atomically (write a temporary file, then rename it).
5. Crash at offsets 1,234 and 2,345 by throwing the state away and loading the last checkpoint; compare the sink with a crash-free run.

## Prove it worked
- Every event is counted exactly once: in an emitted window, in a still-open window, or as a late event.
- The two crashes replay 234 and 345 events from the checkpoints at 1,000 and 2,000, and the upserting sink matches the clean run exactly.
- The append-only table holds 12 duplicate rows: replays re-emit windows, so outputs must be idempotent or transactional.

## Break it (then fix it)
- Save the checkpoint without the rename and crash halfway through writing it: what does the restart load?
- Checkpoint the state but not the offset, and watch events vanish or double.
- Set the allowed lateness to 0, then to 300 seconds, and compare late events against how long each window waits.

## Starter code
```python
import json, os, sqlite3, tempfile

def mulberry32(seed): ...                       # copy the seeded generator from module 1

WINDOW, LATENESS, EVERY = 60, 30, 500

def run(crash_at, workdir):
    state = {"offset": 0, "newest": 0, "open": {}, "closed": [], "late": 0}
    ...                                         # TODO: process, emit behind the watermark, checkpoint, crash and restore
```

```javascript
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function mulberry32(seed) { /* copy the seeded generator from module 1 */ }
const WINDOW = 60, LATENESS = 30, EVERY = 500;

function run(crashAt, workdir) {
  let state = { offset: 0, newest: 0, open: {}, closed: [], late: 0 };
  // TODO: process, emit behind the watermark, checkpoint, crash and restore
}
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""A windowed stream job: event-time windows, a watermark, checkpoints to disk, crashes, and an idempotent sink."""
import json
import os
import sqlite3
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

rand = mulberry32(5)
events = []
for _ in range(3000):                               # page views over 20 minutes; 10% arrive 20 to 150 s late
    t = int(rand() * 1200)
    page = ["home", "menu", "order"][int(rand() * 3)]
    events.append((t + (20 + int(rand() * 130) if rand() < 0.1 else int(rand() * 3)), t, page))
events.sort()                                       # the log holds them in arrival order
WINDOW, LATENESS, EVERY = 60, 30, 500

def fresh_state():
    return {"offset": 0, "newest": 0, "open": {}, "closed": [], "late": 0}

def run(crash_at=(), workdir=None):
    sink = sqlite3.connect(":memory:")
    sink.execute("CREATE TABLE counts (window INTEGER, page TEXT, n INTEGER, PRIMARY KEY (window, page))")
    sink.execute("CREATE TABLE appended (window INTEGER, page TEXT, n INTEGER)")   # what an append-only sink would hold
    path = os.path.join(workdir, "checkpoint.json")
    crashes, state, processed = set(crash_at), fresh_state(), 0
    while state["offset"] < len(events):
        if state["offset"] in crashes:              # the process dies: everything in memory is gone
            crashes.discard(state["offset"])
            with open(path) as f:
                state = json.load(f)                # restart from the last checkpoint and replay from its offset
            continue
        _, t, page = events[state["offset"]]
        start = t - t % WINDOW
        if start in state["closed"]:
            state["late"] += 1                      # its window was already emitted: send it aside
        else:
            key = f"{start}|{page}"
            state["open"][key] = state["open"].get(key, 0) + 1
        state["newest"] = max(state["newest"], t)
        watermark = state["newest"] - LATENESS
        for key in sorted(k for k in state["open"] if int(k.split("|")[0]) + WINDOW <= watermark):
            w, p = key.split("|")
            n = state["open"].pop(key)
            with sink:                              # an upsert: replaying the same window rewrites the same row
                sink.execute("INSERT INTO counts VALUES (?, ?, ?) ON CONFLICT (window, page) DO UPDATE SET n = excluded.n", (int(w), p, n))
                sink.execute("INSERT INTO appended VALUES (?, ?, ?)", (int(w), p, n))
            if int(w) not in state["closed"]:
                state["closed"].append(int(w))
        state["offset"] += 1
        processed += 1
        if state["offset"] % EVERY == 0:
            tmp = path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(state, f)
            os.replace(tmp, path)                   # atomic: a crash mid-write leaves the old checkpoint intact
    rows = sink.execute("SELECT window, page, n FROM counts ORDER BY window, page").fetchall()
    appended = sink.execute("SELECT COUNT(*) FROM appended").fetchone()[0]
    return rows, appended, processed, state["late"], sum(state["open"].values())

with tempfile.TemporaryDirectory() as clean_dir, tempfile.TemporaryDirectory() as crash_dir:
    rows, appended, processed, late, still_open = run(workdir=clean_dir)
    rows2, appended2, processed2, late2, _ = run(crash_at=(1234, 2345), workdir=crash_dir)
print(f"events: {len(events)} | windows emitted: {len(rows)} | late events sent aside: {late} | still in open windows: {still_open}")
print(f"with crashes at offsets 1234 and 2345: {processed2 - processed} events replayed, "
      f"sink identical to the clean run: {'yes' if rows2 == rows and late2 == late else 'no'}, "
      f"an append-only sink would hold {appended2 - len(rows2)} duplicate rows")
assert rows2 == rows and late2 == late and processed2 - processed == 234 + 345
assert sum(n for _, _, n in rows) + late + still_open == len(events)   # every event counted exactly once
print("stream lab OK")
```

Output:
```text
events: 3000 | windows emitted: 57 | late events sent aside: 194 | still in open windows: 153
with crashes at offsets 1234 and 2345: 579 events replayed, sink identical to the clean run: yes, an append-only sink would hold 12 duplicate rows
stream lab OK
```

```javascript
// A windowed stream job: event-time windows, a watermark, checkpoints to disk, crashes, and an idempotent sink.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");     // built in from Node.js 22.13 (with an experimental warning)

function mulberry32(seed) {                         // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(5);
const events = [];
for (let i = 0; i < 3000; i++) {                    // page views over 20 minutes; 10% arrive 20 to 150 s late
  const t = Math.floor(rand() * 1200);
  const page = ["home", "menu", "order"][Math.floor(rand() * 3)];
  const delay = rand() < 0.1 ? 20 + Math.floor(rand() * 130) : Math.floor(rand() * 3);
  events.push([t + delay, t, page]);
}
events.sort((a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));   // the log holds them in arrival order
const WINDOW = 60, LATENESS = 30, EVERY = 500;

const freshState = () => ({ offset: 0, newest: 0, open: {}, closed: [], late: 0 });

function run(crashAt, workdir) {
  const sink = new DatabaseSync(":memory:");
  sink.exec("CREATE TABLE counts (window INTEGER, page TEXT, n INTEGER, PRIMARY KEY (window, page))");
  sink.exec("CREATE TABLE appended (window INTEGER, page TEXT, n INTEGER)");   // what an append-only sink would hold
  const file = path.join(workdir, "checkpoint.json");
  const crashes = new Set(crashAt);
  let state = freshState(), processed = 0;
  while (state.offset < events.length) {
    if (crashes.has(state.offset)) {                // the process dies: everything in memory is gone
      crashes.delete(state.offset);
      state = JSON.parse(fs.readFileSync(file, "utf8"));   // restart from the last checkpoint and replay from its offset
      continue;
    }
    const [, t, page] = events[state.offset];
    const start = t - (t % WINDOW);
    if (state.closed.includes(start)) state.late++; // its window was already emitted: send it aside
    else {
      const key = `${start}|${page}`;
      state.open[key] = (state.open[key] ?? 0) + 1;
    }
    state.newest = Math.max(state.newest, t);
    const watermark = state.newest - LATENESS;
    for (const key of Object.keys(state.open).filter(k => Number(k.split("|")[0]) + WINDOW <= watermark).sort()) {
      const [w, p] = key.split("|");
      const n = state.open[key];
      delete state.open[key];
      sink.exec("BEGIN");                           // an upsert: replaying the same window rewrites the same row
      sink.prepare("INSERT INTO counts VALUES (?, ?, ?) ON CONFLICT (window, page) DO UPDATE SET n = excluded.n").run(Number(w), p, n);
      sink.prepare("INSERT INTO appended VALUES (?, ?, ?)").run(Number(w), p, n);
      sink.exec("COMMIT");
      if (!state.closed.includes(Number(w))) state.closed.push(Number(w));
    }
    state.offset++;
    processed++;
    if (state.offset % EVERY === 0) {
      fs.writeFileSync(file + ".tmp", JSON.stringify(state));
      fs.renameSync(file + ".tmp", file);           // atomic: a crash mid-write leaves the old checkpoint intact
    }
  }
  const rows = sink.prepare("SELECT window, page, n FROM counts ORDER BY window, page").all().map(r => [r.window, r.page, r.n]);
  const appended = sink.prepare("SELECT COUNT(*) AS c FROM appended").get().c;
  return [rows, appended, processed, state.late, Object.values(state.open).reduce((a, b) => a + b, 0)];
}

const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), "stream-")), crashDir = fs.mkdtempSync(path.join(os.tmpdir(), "stream-"));
const [rows, , processed, late, stillOpen] = run([], cleanDir);
const [rows2, appended2, processed2, late2] = run([1234, 2345], crashDir);
fs.rmSync(cleanDir, { recursive: true }); fs.rmSync(crashDir, { recursive: true });
const same = JSON.stringify(rows2) === JSON.stringify(rows) && late2 === late;
console.log(`events: ${events.length} | windows emitted: ${rows.length} | late events sent aside: ${late} | still in open windows: ${stillOpen}`);
console.log(`with crashes at offsets 1234 and 2345: ${processed2 - processed} events replayed, ` +
            `sink identical to the clean run: ${same ? "yes" : "no"}, an append-only sink would hold ${appended2 - rows2.length} duplicate rows`);
if (!same || processed2 - processed !== 234 + 345) throw new Error("replay changed the result");
if (rows.reduce((s, r) => s + r[2], 0) + late + stillOpen !== events.length) throw new Error("an event was lost or counted twice");
console.log("stream lab OK");
```

Output:
```text
events: 3000 | windows emitted: 57 | late events sent aside: 194 | still in open windows: 153
with crashes at offsets 1234 and 2345: 579 events replayed, sink identical to the clean run: yes, an append-only sink would hold 12 duplicate rows
stream lab OK
```

</details>
