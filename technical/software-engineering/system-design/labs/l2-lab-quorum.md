---
title: "Quorums and read repair: a three-replica simulation"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Quorums and read repair: a three-replica simulation

> System Design L2 · about 60 min · modules m01, m02

Simulate a leaderless store with three replicas: writes wait for W acknowledgements while the other replicas get the update a little later, and reads ask R replicas and keep the newest version. Measure stale reads for several (W, R) pairs, show that W + R > N never reads stale data, then add read repair and measure again.

## Before you start
- Python 3.12+ and Node.js 22+
- Read modules 1 and 2

## Steps
1. Keep each replica's version of one key, and a list of pending copies (due step, replica, version) for writes still on the way.
2. Every fifth step is a write: W random replicas apply it at once and the others get it 1 to 10 steps later. The other steps are reads of R random replicas, keeping the highest version they hold.
3. Count a read as stale when its version is below the last acknowledged write, and run (1, 1), (1, 2), (2, 2), (3, 1) and (1, 3) with the same seeded random generator.
4. Add read repair: after each read, write the newest version back to the replicas you asked that were behind. Compare (1, 2) with and without it.
5. Explain in two sentences why W + R > N never reads stale here, and what a real system still has to handle: replicas that fail, sloppy quorums and concurrent writes.

## Prove it worked
- (2, 2), (3, 1) and (1, 3) give no stale reads: every read set overlaps the last write's set.
- (1, 1) is stale about half the time, and (1, 2) less often.
- Read repair cuts the stale reads of (1, 2) by more than half, without any extra writes.

## Break it (then fix it)
- Make one replica lose its pending copies for good, and see which (W, R) pairs still hold.
- Stretch the delay to 1 to 50 steps and watch (1, 2) get worse.
- Let two clients write at the same step with the same version number, and find the conflict a counter can't settle (module 2's concurrent writes).

## Starter code
```python
def mulberry32(seed):                               # copy the seeded generator from module 1
    ...

N = 3

def shuffled(items, rand):
    ...                                             # TODO: a Fisher-Yates shuffle using rand()

def run(w, r, read_repair=False, ops=2000, seed=42):
    rand = mulberry32(seed)
    replicas, pending = [0] * N, []                 # versions; (due step, replica, version) still on the way
    latest = stale = repairs = 0
    for step in range(ops):
        ...                                         # TODO: deliver due copies; write on every fifth step, else read
    return stale, repairs
```

```javascript
function mulberry32(seed) { /* copy the seeded generator from module 1 */ }

const N = 3;

function shuffled(items, rand) { /* TODO: a Fisher-Yates shuffle using rand() */ }

function run(w, r, readRepair = false, ops = 2000, seed = 42) {
  const rand = mulberry32(seed);
  const replicas = new Array(N).fill(0);
  let pending = [];                                 // [due step, replica, version] still on the way
  let latest = 0, stale = 0, repairs = 0;
  for (let step = 0; step < ops; step++) {
    // TODO: deliver due copies; write on every fifth step, else read
  }
  return [stale, repairs];
}
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""Leaderless replication with quorums: N = 3 replicas, writes wait for W acknowledgements, reads ask R replicas."""

def mulberry32(seed):                               # a tiny seeded random generator, same as the JavaScript one
    state = seed & 0xFFFFFFFF
    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand

N = 3

def shuffled(items, rand):
    items = list(items)
    for i in range(len(items) - 1, 0, -1):          # Fisher-Yates, driven by the seeded generator
        j = int(rand() * (i + 1))
        items[i], items[j] = items[j], items[i]
    return items

def run(w, r, read_repair=False, ops=2000, seed=42):
    """Write one key every fifth step and read it on the others; return (stale reads, repairs made)."""
    rand = mulberry32(seed)
    replicas = [0] * N                              # each replica's version of the key (the version is the value)
    pending = []                                    # (due step, replica, version): copies of writes still on the way
    latest = stale = repairs = 0
    for step in range(ops):
        for item in [p for p in pending if p[0] <= step]:
            pending.remove(item)                    # a late copy arrives; an older one never overwrites a newer one
            _, i, version = item
            replicas[i] = max(replicas[i], version)
        if step % 5 == 0:                           # a write: one step in five; the rest are reads
            latest += 1
            order = shuffled(range(N), rand)
            for i in order[:w]:
                replicas[i] = latest                # W replicas apply it before the client gets its acknowledgement
            for i in order[w:]:
                pending.append((step + 1 + int(rand() * 10), i, latest))   # the others get it 1 to 10 steps later
        else:                                       # a read
            asked = shuffled(range(N), rand)[:r]
            newest = max(replicas[i] for i in asked)
            if newest < latest:
                stale += 1                          # the read missed the last acknowledged write
            if read_repair:
                for i in asked:
                    if replicas[i] < newest:
                        replicas[i] = newest        # write the newest version back to replicas that were behind
                        repairs += 1
    return stale, repairs

results = {}
for w, r, repair in ((1, 1, False), (1, 2, False), (1, 2, True), (2, 2, False), (3, 1, False), (1, 3, False)):
    stale, repairs = run(w, r, repair)
    results[(w, r, repair)] = stale
    label = f"W={w} R={r}" + (" + read repair" if repair else "")
    print(f"{label}: {stale} stale reads out of 1600" + (f", {repairs} repairs" if repair else ""))
assert all(results[(w, r, False)] == 0 for w, r in ((2, 2), (3, 1), (1, 3)))   # W + R > N: every read overlaps the last write
assert results[(1, 1, False)] > results[(1, 2, False)] > 0
assert results[(1, 2, True)] <= results[(1, 2, False)]   # repairs only ever move replicas forward
print("quorum lab OK")
```

Output:
```text
W=1 R=1: 790 stale reads out of 1600
W=1 R=2: 312 stale reads out of 1600
W=1 R=2 + read repair: 143 stale reads out of 1600, 631 repairs
W=2 R=2: 0 stale reads out of 1600
W=3 R=1: 0 stale reads out of 1600
W=1 R=3: 0 stale reads out of 1600
quorum lab OK
```

```javascript
// Leaderless replication with quorums: N = 3 replicas, writes wait for W acknowledgements, reads ask R replicas.

function mulberry32(seed) {                         // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 3;

function shuffled(items, rand) {
  items = [...items];
  for (let i = items.length - 1; i > 0; i--) {      // Fisher-Yates, driven by the seeded generator
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function run(w, r, readRepair = false, ops = 2000, seed = 42) {
  // write one key every fifth step and read it on the others; return [stale reads, repairs made]
  const rand = mulberry32(seed);
  const replicas = new Array(N).fill(0);            // each replica's version of the key (the version is the value)
  let pending = [];                                 // [due step, replica, version]: copies of writes still on the way
  let latest = 0, stale = 0, repairs = 0;
  const ids = [...Array(N).keys()];
  for (let step = 0; step < ops; step++) {
    for (const [due, i, version] of pending.filter(p => p[0] <= step)) {
      replicas[i] = Math.max(replicas[i], version); // a late copy arrives; an older one never overwrites a newer one
    }
    pending = pending.filter(p => p[0] > step);
    if (step % 5 === 0) {                           // a write: one step in five; the rest are reads
      latest++;
      const order = shuffled(ids, rand);
      for (const i of order.slice(0, w)) replicas[i] = latest;   // W replicas apply it before the client gets its acknowledgement
      for (const i of order.slice(w)) pending.push([step + 1 + Math.floor(rand() * 10), i, latest]);   // the others get it 1 to 10 steps later
    } else {                                        // a read
      const asked = shuffled(ids, rand).slice(0, r);
      const newest = Math.max(...asked.map(i => replicas[i]));
      if (newest < latest) stale++;                 // the read missed the last acknowledged write
      if (readRepair) {
        for (const i of asked) {
          if (replicas[i] < newest) { replicas[i] = newest; repairs++; }   // write the newest version back to replicas that were behind
        }
      }
    }
  }
  return [stale, repairs];
}

const results = new Map();
for (const [w, r, repair] of [[1, 1, false], [1, 2, false], [1, 2, true], [2, 2, false], [3, 1, false], [1, 3, false]]) {
  const [stale, repairs] = run(w, r, repair);
  results.set(`${w},${r},${repair}`, stale);
  const label = `W=${w} R=${r}` + (repair ? " + read repair" : "");
  console.log(`${label}: ${stale} stale reads out of 1600` + (repair ? `, ${repairs} repairs` : ""));
}
const get = (w, r, repair) => results.get(`${w},${r},${repair}`);
if (![[2, 2], [3, 1], [1, 3]].every(([w, r]) => get(w, r, false) === 0)) throw new Error("W + R > N must never be stale");
if (!(get(1, 1, false) > get(1, 2, false) && get(1, 2, false) > 0)) throw new Error("weak quorums");
if (get(1, 2, true) > get(1, 2, false)) throw new Error("read repair");
console.log("quorum lab OK");
```

Output:
```text
W=1 R=1: 790 stale reads out of 1600
W=1 R=2: 312 stale reads out of 1600
W=1 R=2 + read repair: 143 stale reads out of 1600, 631 repairs
W=2 R=2: 0 stale reads out of 1600
W=3 R=1: 0 stale reads out of 1600
W=1 R=3: 0 stale reads out of 1600
quorum lab OK
```

</details>
