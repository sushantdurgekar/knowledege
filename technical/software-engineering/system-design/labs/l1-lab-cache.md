---
title: "A cache layer: LRU, TTL and one load per missing key"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: A cache layer: LRU, TTL and one load per missing key

> System Design L1 · about 75 min · modules m05, m06, m07

Build the cache you'd put in front of a database: least-recently-used eviction, a time to live, and single-flight loading, so that 100 requests arriving together for a missing key cause one database read, not 100. Test it with a fake clock and a slow fake database.

## Before you start
- Python 3.12+ (asyncio) and Node.js 22+ (promises)
- Read module 5

## Steps
1. Write `get(key)` and `set(key, value)` over an ordered map: a hit moves the key to the recent end, an expired entry counts as missing, and a full cache evicts the least recently used key.
2. Write `get_or_load(key, loader)`: return a fresh value, or start one load and remember it as in flight, so that other misses for the same key wait for that same load.
3. Fire 100 concurrent `get_or_load` calls for one missing key and check that the database was read once.
4. Check eviction (capacity 2: the least recently used key goes) and expiry (advance the fake clock past the TTL).
5. Test `get` and `set` against a simple list model with random operations.

## Prove it worked
- 100 concurrent misses for one key cause exactly one database read.
- The least recently used key is evicted when the cache is full, and expired entries count as misses.
- The random test against the list model passes.

## Break it (then fix it)
- Remove the in-flight map and count the database reads for 100 concurrent misses: a stampede in miniature.
- Make the loader fail once: do all 100 waiting callers see the error, and does the next call try again?
- Give every key the same TTL, load 1,000 keys at once, and watch them all expire together; then add random jitter to the TTL.

## Starter code
```python
import asyncio
from collections import OrderedDict

class Cache:
    def __init__(self, capacity, ttl, clock):
        self.capacity, self.ttl, self.clock = capacity, ttl, clock
        self.items = OrderedDict()          # key -> (value, expires_at), least recently used first
        self.in_flight = {}                 # key -> the task that is loading it
        self.hits = self.misses = self.loads = 0

    def get(self, key): ...                 # TODO: None if missing or expired; otherwise mark as used
    def set(self, key, value): ...          # TODO: store with an expiry; evict the LRU while over capacity

    async def get_or_load(self, key, loader):
        ...                                 # TODO: a hit, or one shared load per missing key
```

```javascript
class Cache {
  constructor(capacity, ttl, clock) {
    this.capacity = capacity; this.ttl = ttl; this.clock = clock;
    this.items = new Map();                 // key -> [value, expiresAt], least recently used first
    this.inFlight = new Map();              // key -> the promise that is loading it
    this.hits = 0; this.misses = 0; this.loads = 0;
  }
  get(key) { /* TODO: undefined if missing or expired; otherwise mark as used */ }
  set(key, value) { /* TODO: store with an expiry; evict the LRU while over capacity */ }
  async getOrLoad(key, loader) { /* TODO: a hit, or one shared load per missing key */ }
}
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import asyncio, random
from collections import OrderedDict

class Clock:                                        # a fake clock for TTLs
    def __init__(self):
        self.now = 0

class Cache:
    """LRU + TTL cache with single-flight loading: concurrent misses for one key share one load."""
    def __init__(self, capacity, ttl, clock):
        self.capacity, self.ttl, self.clock = capacity, ttl, clock
        self.items = OrderedDict()                  # key -> (value, expires_at), least recently used first
        self.in_flight = {}                         # key -> the task that is loading it
        self.hits = self.misses = self.loads = 0

    def get(self, key):
        item = self.items.get(key)
        if item is None or item[1] <= self.clock.now:
            self.items.pop(key, None)               # missing or expired
            return None
        self.items.move_to_end(key)                 # used just now
        return item[0]

    def set(self, key, value):
        self.items[key] = (value, self.clock.now + self.ttl)
        self.items.move_to_end(key)
        while len(self.items) > self.capacity:
            self.items.popitem(last=False)          # evict the least recently used

    async def get_or_load(self, key, loader):
        value = self.get(key)
        if value is not None:
            self.hits += 1
            return value
        self.misses += 1
        if key not in self.in_flight:               # the first miss starts the load...
            self.loads += 1
            self.in_flight[key] = asyncio.ensure_future(loader(key))
        try:
            value = await self.in_flight[key]       # ...and every other miss waits for the same one
            self.set(key, value)
            return value
        finally:
            self.in_flight.pop(key, None)

async def main():
    clock, db_reads = Clock(), []

    async def loader(key):                          # the slow database
        db_reads.append(key)
        await asyncio.sleep(0.01)
        return f"value of {key}"

    cache = Cache(capacity=2, ttl=60, clock=clock)
    results = await asyncio.gather(*(cache.get_or_load("menu", loader) for _ in range(100)))
    assert set(results) == {"value of menu"} and len(db_reads) == 1   # 100 misses, one database read
    await cache.get_or_load("menu", loader)         # a hit
    await cache.get_or_load("prices", loader)
    await cache.get_or_load("hours", loader)        # evicts menu, the least recently used
    assert cache.get("menu") is None and len(db_reads) == 3
    clock.now += 61
    assert cache.get("prices") is None              # expired
    print("hits", cache.hits, "misses", cache.misses, "loads", cache.loads)

    ref, model = Cache(3, 10, Clock()), []          # LRU and TTL against a simple list model
    for _ in range(2000):
        ref.clock.now += random.randint(0, 3)
        key = random.randint(0, 5)
        found = next((x for x in model if x[0] == key), None)
        if random.random() < 0.5:
            fresh = found is not None and found[2] > ref.clock.now
            assert ref.get(key) == (found[1] if fresh else None)
            if found:
                model.remove(found)
                if fresh:
                    model.append(found)             # a hit moves to the recent end; an expired entry is dropped
        else:
            ref.set(key, key * 10)
            if found:
                model.remove(found)
            model.append((key, key * 10, ref.clock.now + 10))
            model = model[-3:]
        assert list(ref.items) == [k for k, _, _ in model]

asyncio.run(main())
print("cache lab OK")
```

Output:
```text
hits 1 misses 102 loads 3
cache lab OK
```

```javascript
class Cache {
  // LRU + TTL cache with single-flight loading: concurrent misses for one key share one load
  constructor(capacity, ttl, clock) {
    this.capacity = capacity; this.ttl = ttl; this.clock = clock;
    this.items = new Map();                         // key -> [value, expiresAt], least recently used first
    this.inFlight = new Map();                      // key -> the promise that is loading it
    this.hits = 0; this.misses = 0; this.loads = 0;
  }
  get(key) {
    const item = this.items.get(key);
    if (item === undefined || item[1] <= this.clock.now) { this.items.delete(key); return undefined; }   // missing or expired
    this.items.delete(key);
    this.items.set(key, item);                      // used just now
    return item[0];
  }
  set(key, value) {
    this.items.delete(key);
    this.items.set(key, [value, this.clock.now + this.ttl]);
    while (this.items.size > this.capacity) this.items.delete(this.items.keys().next().value);   // evict the least recently used
  }
  async getOrLoad(key, loader) {
    const cached = this.get(key);
    if (cached !== undefined) { this.hits++; return cached; }
    this.misses++;
    if (!this.inFlight.has(key)) {                  // the first miss starts the load...
      this.loads++;
      this.inFlight.set(key, loader(key));
    }
    try {
      const value = await this.inFlight.get(key);   // ...and every other miss waits for the same one
      this.set(key, value);
      return value;
    } finally {
      this.inFlight.delete(key);
    }
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const clock = { now: 0 }, dbReads = [];
  const loader = async key => {                     // the slow database
    dbReads.push(key);
    await sleep(10);
    return `value of ${key}`;
  };
  const cache = new Cache(2, 60, clock);
  const results = await Promise.all(Array.from({ length: 100 }, () => cache.getOrLoad("menu", loader)));
  if (new Set(results).size !== 1 || results[0] !== "value of menu" || dbReads.length !== 1) throw new Error("single flight");
  await cache.getOrLoad("menu", loader);            // a hit
  await cache.getOrLoad("prices", loader);
  await cache.getOrLoad("hours", loader);           // evicts menu, the least recently used
  if (cache.get("menu") !== undefined || dbReads.length !== 3) throw new Error("lru");
  clock.now += 61;
  if (cache.get("prices") !== undefined) throw new Error("ttl");
  console.log("hits", cache.hits, "misses", cache.misses, "loads", cache.loads);

  const ref = new Cache(3, 10, { now: 0 });         // LRU and TTL against a simple list model
  let model = [];
  for (let i = 0; i < 2000; i++) {
    ref.clock.now += Math.floor(Math.random() * 4);
    const key = Math.floor(Math.random() * 6);
    const found = model.find(x => x[0] === key);
    if (Math.random() < 0.5) {
      const fresh = found !== undefined && found[2] > ref.clock.now;
      if (ref.get(key) !== (fresh ? found[1] : undefined)) throw new Error("get");
      if (found) {
        model = model.filter(x => x !== found);
        if (fresh) model.push(found);               // a hit moves to the recent end; an expired entry is dropped
      }
    } else {
      ref.set(key, key * 10);
      if (found) model = model.filter(x => x !== found);
      model.push([key, key * 10, ref.clock.now + 10]);
      model = model.slice(-3);
    }
    if ([...ref.items.keys()].join() !== model.map(x => x[0]).join()) throw new Error("order");
  }
  console.log("cache lab OK");
})();
```

Output:
```text
hits 1 misses 102 loads 3
cache lab OK
```

</details>
