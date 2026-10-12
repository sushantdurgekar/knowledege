---
title: "An LLM serving simulator: continuous batching, a paged KV cache and prefix caching"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l4, lab]
status: new
created: 2026-10-12
updated: 2026-10-12
---
# Lab: An LLM serving simulator: continuous batching, a paged KV cache and prefix caching

> System Design L4 · about 90 min · modules m06, m03

Simulate an LLM server step by step: requests arrive at random, wait in a queue, and join a continuous batch when there's KV cache memory for them; each decode step costs a fixed time plus a little per sequence and per prefilled token; memory is allocated in 16-token blocks as requests grow, and when it runs out the newest request is preempted and recomputed later. Measure time to first token and time per token at the 95th percentile, then find the highest load that meets both targets, with and without a cached shared system prompt.

## Before you start
- Python 3.12+ and Node.js 22.13+, standard libraries only
- Read module 6, and module 3 for queueing

## Steps
1. Generate 400 requests with random arrivals (von Neumann's exponential), a 512-token shared system prompt plus 50 to 500 tokens of their own, and 50 to 400 output tokens.
2. Each step: admit queued requests while the batch has room and the KV pool has blocks for their prompt plus one, then advance the clock by the step's cost.
3. Give every active request one more token; record its first token time; allocate a new block when it crosses a 16-token boundary, preempting the newest request if the pool is empty.
4. With prefix caching, the shared prompt's blocks are loaded once and shared, so requests prefill and store only their own tokens.
5. Report p95 time to first token, p95 time per token, throughput and preemptions; raise the load in steps of two requests a second until a target is missed.

## Prove it worked
- Every request finishes in both configurations, including the ones that were preempted.
- Prefix caching cuts the p95 time to first token from 840 ms to 69 ms and removes the preemptions at 4 requests a second.
- With the shared prompt cached, the server meets both targets at twice the load.

## Break it (then fix it)
- Switch to static batching (admit only when the batch is empty) and compare throughput and time to first token at 4 requests a second.
- Reserve each request's maximum length up front instead of allocating blocks as it grows, and count how many fit.
- Halve BLOCKS and watch the preemptions climb: what happens to the p95 time per token, and why?

## Starter code
```python
def mulberry32(seed): ...                       # copy the seeded generator from module 6
def exponential(rand): ...                      # von Neumann's method, as in the capacity lab

STEP_MS, PER_SEQUENCE_MS, PREFILL_MS_PER_TOKEN = 15, 0.25, 0.05
BLOCK, BLOCKS, MAX_BATCH, SHARED = 16, 2_000, 64, 512

def run(rate, prefix_cache, count=400, seed=7): ...   # TODO: (p95 first token, p95 per token, tokens/s, preemptions, done)
```

```javascript
function mulberry32(seed) { /* copy the seeded generator from module 6 */ }
function exponential(rand) { /* von Neumann's method, as in the capacity lab */ }

const STEP_MS = 15, PER_SEQUENCE_MS = 0.25, PREFILL_MS_PER_TOKEN = 0.05;
const BLOCK = 16, BLOCKS = 2000, MAX_BATCH = 64, SHARED = 512;
function run(rate, prefixCache, count = 400, seed = 7) { /* TODO: [p95 first token, p95 per token, tokens/s, preemptions, done] */ }
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
"""An LLM serving simulator: continuous batching, a paged KV cache with preemption, and prefix caching, against SLOs."""

def mulberry32(seed):                               # a tiny seeded random generator, same as the JavaScript one
    state = seed & 0xFFFFFFFF
    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((state ^ (state >> 15)) * (state | 1)) & 0xFFFFFFFF
        t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand

def exponential(rand):                              # von Neumann's method: exact, and needs no logarithms
    k = 0
    while True:
        first = low = rand()
        n = 1
        while True:
            u = rand()
            if u >= low:
                break
            low, n = u, n + 1
        if n % 2 == 1:
            return k + first
        k += 1

STEP_MS, PER_SEQUENCE_MS, PREFILL_MS_PER_TOKEN = 15, 0.25, 0.05   # an illustrative accelerator
BLOCK, BLOCKS, MAX_BATCH, SHARED = 16, 2_000, 64, 512   # KV blocks of 16 tokens; a 512-token shared system prompt

def blocks_for(tokens):
    return -(-tokens // BLOCK)

def p95(values):
    ordered = sorted(values)
    return ordered[(len(ordered) * 95 + 99) // 100 - 1]

def run(rate, prefix_cache, count=400, seed=7):    # rate in requests a second; returns the measurements
    rand = mulberry32(seed)
    waiting, t = [], 0.0
    for i in range(count):
        t += exponential(rand) * 1000 / rate        # random (Poisson) arrivals
        waiting.append({"id": i, "arrive": t, "prompt": SHARED + 50 + int(rand() * 450),
                        "out": 50 + int(rand() * 350), "made": 0})
    free = BLOCKS - (blocks_for(SHARED) if prefix_cache else 0)   # cached prefix blocks stay resident, shared by all
    clock, queue, active, done, preemptions = 0.0, [], [], [], 0
    while waiting or queue or active:
        while waiting and waiting[0]["arrive"] <= clock:
            queue.append(waiting.pop(0))
        if not queue and not active:
            clock = waiting[0]["arrive"]            # idle until the next request arrives
            continue
        prefill = 0
        while queue and len(active) < MAX_BATCH:
            r = queue[0]
            r["own"] = r["prompt"] - (SHARED if prefix_cache else 0)   # tokens it must prefill and keep itself
            if blocks_for(r["own"] + r["made"]) + 1 > free:
                break                               # not enough KV memory: it waits at the head of the queue
            queue.pop(0)
            r["held"] = blocks_for(r["own"] + r["made"])
            free -= r["held"]
            prefill += r["own"] + r["made"]         # a preempted request recomputes what it had
            active.append(r)
        clock += STEP_MS + PER_SEQUENCE_MS * len(active) + PREFILL_MS_PER_TOKEN * prefill
        gone = set()
        for r in list(active):
            if r["id"] in gone:
                continue                            # preempted earlier in this step
            r["made"] += 1
            if r["made"] == 1:
                r["first"] = clock                  # time to first token ends with the step that prefilled it
            if blocks_for(r["own"] + r["made"]) > r["held"]:
                if free == 0:                       # out of KV memory: preempt the newest request
                    victim = active.pop()
                    free += victim["held"]
                    queue.insert(0, victim)
                    gone.add(victim["id"])
                    preemptions += 1
                    if victim is r:
                        r["made"] -= 1              # this step's token is recomputed later
                        continue
                free -= 1
                r["held"] += 1
            if r["made"] == r["out"]:
                active = [x for x in active if x["id"] != r["id"]]
                free += r["held"]
                r["finish"] = clock
                done.append(r)
    tokens = sum(r["out"] for r in done)
    ttft = p95([r["first"] - r["arrive"] for r in done])
    tpot = p95([(r["finish"] - r["first"]) / (r["out"] - 1) for r in done])
    return ttft, tpot, tokens * 1000 // int(clock), preemptions, len(done)

def ms(x):
    return f"{int(x + 0.5):,} ms"

TTFT_SLO, TPOT_SLO = 1_000, 60                      # p95 targets: first token within 1 s, then 60 ms a token
for cache in (False, True):
    ttft, tpot, per_second, preempted, finished = run(4, cache)
    print(f"prefix caching {'on' if cache else 'off'}, 4 requests a second: first token p95 {ms(ttft)}, "
          f"time per token p95 {ms(tpot)}, {per_second:,} tokens/s, {preempted} preemptions")
best = {}
for cache in (False, True):
    best[cache] = 0
    for rate in range(2, 21, 2):                    # raise the load until a target is missed
        ttft, tpot = run(rate, cache)[:2]
        if ttft > TTFT_SLO or tpot > TPOT_SLO:
            break
        best[cache] = rate
print(f"highest rate meeting both p95 targets: {best[False]} requests a second without prefix caching, "
      f"{best[True]} with it")

assert run(4, True)[4] == 400 and run(4, False)[4] == 400       # every request finishes
assert best[True] >= best[False] > 0
print("serving lab OK")
```

Output:
```text
prefix caching off, 4 requests a second: first token p95 840 ms, time per token p95 29 ms, 863 tokens/s, 9 preemptions
prefix caching on, 4 requests a second: first token p95 69 ms, time per token p95 24 ms, 864 tokens/s, 0 preemptions
highest rate meeting both p95 targets: 4 requests a second without prefix caching, 8 with it
serving lab OK
```

```javascript
// An LLM serving simulator: continuous batching, a paged KV cache with preemption, and prefix caching, against SLOs.

function mulberry32(seed) {                            // a tiny seeded random generator, same as the Python one
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function exponential(rand) {                           // von Neumann's method: exact, and needs no logarithms
  let k = 0;
  for (;;) {
    const first = rand();
    let low = first, n = 1;
    for (;;) {
      const u = rand();
      if (u >= low) break;
      low = u;
      n++;
    }
    if (n % 2 === 1) return k + first;
    k++;
  }
}

const STEP_MS = 15, PER_SEQUENCE_MS = 0.25, PREFILL_MS_PER_TOKEN = 0.05;   // an illustrative accelerator
const BLOCK = 16, BLOCKS = 2000, MAX_BATCH = 64, SHARED = 512;   // KV blocks of 16 tokens; a 512-token shared system prompt

const blocksFor = tokens => Math.ceil(tokens / BLOCK);

function p95(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor((ordered.length * 95 + 99) / 100) - 1];
}

function run(rate, prefixCache, count = 400, seed = 7) {   // rate in requests a second; returns the measurements
  const rand = mulberry32(seed);
  const waiting = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    t += exponential(rand) * 1000 / rate;              // random (Poisson) arrivals
    waiting.push({ id: i, arrive: t, prompt: SHARED + 50 + Math.floor(rand() * 450), out: 50 + Math.floor(rand() * 350), made: 0 });
  }
  let free = BLOCKS - (prefixCache ? blocksFor(SHARED) : 0);   // cached prefix blocks stay resident, shared by all
  let clock = 0, active = [], preemptions = 0;
  const queue = [], done = [];
  while (waiting.length || queue.length || active.length) {
    while (waiting.length && waiting[0].arrive <= clock) queue.push(waiting.shift());
    if (!queue.length && !active.length) {
      clock = waiting[0].arrive;                       // idle until the next request arrives
      continue;
    }
    let prefill = 0;
    while (queue.length && active.length < MAX_BATCH) {
      const r = queue[0];
      r.own = r.prompt - (prefixCache ? SHARED : 0);   // tokens it must prefill and keep itself
      if (blocksFor(r.own + r.made) + 1 > free) break; // not enough KV memory: it waits at the head of the queue
      queue.shift();
      r.held = blocksFor(r.own + r.made);
      free -= r.held;
      prefill += r.own + r.made;                       // a preempted request recomputes what it had
      active.push(r);
    }
    clock += STEP_MS + PER_SEQUENCE_MS * active.length + PREFILL_MS_PER_TOKEN * prefill;
    const gone = new Set();
    for (const r of [...active]) {
      if (gone.has(r.id)) continue;                    // preempted earlier in this step
      r.made++;
      if (r.made === 1) r.first = clock;               // time to first token ends with the step that prefilled it
      if (blocksFor(r.own + r.made) > r.held) {
        if (free === 0) {                              // out of KV memory: preempt the newest request
          const victim = active.pop();
          free += victim.held;
          queue.unshift(victim);
          gone.add(victim.id);
          preemptions++;
          if (victim === r) {
            r.made--;                                  // this step's token is recomputed later
            continue;
          }
        }
        free--;
        r.held++;
      }
      if (r.made === r.out) {
        active = active.filter(x => x.id !== r.id);
        free += r.held;
        r.finish = clock;
        done.push(r);
      }
    }
  }
  const tokens = done.reduce((sum, r) => sum + r.out, 0);
  const ttft = p95(done.map(r => r.first - r.arrive));
  const tpot = p95(done.map(r => (r.finish - r.first) / (r.out - 1)));
  return [ttft, tpot, Math.floor(tokens * 1000 / Math.floor(clock)), preemptions, done.length];
}

const ms = x => `${Math.floor(x + 0.5).toLocaleString("en-US")} ms`;

const TTFT_SLO = 1000, TPOT_SLO = 60;                  // p95 targets: first token within 1 s, then 60 ms a token
for (const cache of [false, true]) {
  const [ttft, tpot, perSecond, preempted] = run(4, cache);
  console.log(`prefix caching ${cache ? "on" : "off"}, 4 requests a second: first token p95 ${ms(ttft)}, ` +
              `time per token p95 ${ms(tpot)}, ${perSecond.toLocaleString("en-US")} tokens/s, ${preempted} preemptions`);
}
const best = new Map();
for (const cache of [false, true]) {
  best.set(cache, 0);
  for (let rate = 2; rate <= 20; rate += 2) {          // raise the load until a target is missed
    const [ttft, tpot] = run(rate, cache);
    if (ttft > TTFT_SLO || tpot > TPOT_SLO) break;
    best.set(cache, rate);
  }
}
console.log(`highest rate meeting both p95 targets: ${best.get(false)} requests a second without prefix caching, ` +
            `${best.get(true)} with it`);

if (run(4, true)[4] !== 400 || run(4, false)[4] !== 400) throw new Error("every request must finish");
if (!(best.get(true) >= best.get(false) && best.get(false) > 0)) throw new Error("prefix caching should not hurt");
console.log("serving lab OK");
```

Output:
```text
prefix caching off, 4 requests a second: first token p95 840 ms, time per token p95 29 ms, 863 tokens/s, 9 preemptions
prefix caching on, 4 requests a second: first token p95 69 ms, time per token p95 24 ms, 864 tokens/s, 0 preemptions
highest rate meeting both p95 targets: 4 requests a second without prefix caching, 8 with it
serving lab OK
```

</details>
