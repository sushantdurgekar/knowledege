---
title: "Big-O with a stopwatch"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Big-O with a stopwatch

> Data Structures & Algorithms L1 · about 45 min · modules m01

See complexity with your own eyes: time an O(n), an O(n log n) and an O(n²) function as n doubles, in Python and JavaScript, and check that the ratios match the theory (about 2×, a bit over 2×, and 4×).

## Before you start
- Python 3.12+ and Node.js 22+
- Read module 01 (Big-O)

## Steps
1. Write three functions: sum of a list (O(n)), sort a copy (O(n log n)), count equal pairs with two nested loops (O(n²)).
2. Time each one for n = 1,000, 2,000, 4,000 and 8,000 using `time.perf_counter()` in Python and `performance.now()` in Node.
3. Print the ratio between each time and the previous one.
4. Repeat each measurement 5 times and keep the best, to remove noise.
5. Write two sentences in your notes: which ratio matched the theory best, and why the small n values are noisy.

## Prove it worked
- Your O(n²) times grow about 4× per doubling and your O(n) times about 2×.
- You can explain why tiny inputs give noisy ratios (timer resolution, warm-up, caching).

## Break it (then fix it)
- Replace the nested loops with a Counter / Map of counts (pairs = sum of c × (c − 1) / 2) and watch the ratio drop to about 2×.
- Time `list.insert(0, x)` in a loop and discover it's O(n²) overall.

## Starter code
```python
import random, time

def linear(a):       return sum(a)
def n_log_n(a):      return sorted(a)
def quadratic(a):
    pairs = 0
    for i in range(len(a)):
        for j in range(i + 1, len(a)):
            if a[i] == a[j]:
                pairs += 1
    return pairs

def best_time(fn, a, repeats=5):
    # TODO: run fn(a) `repeats` times and return the fastest time in seconds
    ...

prev = None
for n in (1000, 2000, 4000, 8000):
    data = [random.randint(0, 1000) for _ in range(n)]
    # TODO: time quadratic(data) and print n, the time, and the ratio to prev
```

```javascript
const { performance } = require("node:perf_hooks");

const linear = a => a.reduce((s, x) => s + x, 0);
const nLogN = a => [...a].sort((x, y) => x - y);
function quadratic(a) {
  let pairs = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++)
      if (a[i] === a[j]) pairs++;
  return pairs;
}

function bestTime(fn, a, repeats = 5) {
  // TODO: run fn(a) `repeats` times and return the fastest time in ms
}

let prev = null;
for (const n of [1000, 2000, 4000, 8000]) {
  const data = Array.from({ length: n }, () => Math.floor(Math.random() * 1001));
  // TODO: time quadratic(data) and print n, the time, and the ratio to prev
}
```

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random, time

def quadratic(a):
    pairs = 0
    for i in range(len(a)):
        for j in range(i + 1, len(a)):
            if a[i] == a[j]:
                pairs += 1
    return pairs

def best_time(fn, a, repeats=5):
    best = float("inf")
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn(a)
        best = min(best, time.perf_counter() - t0)
    return best

prev = None
ratios = []
for n in (500, 1000, 2000):
    data = [random.randint(0, 1000) for _ in range(n)]
    t = best_time(quadratic, data, repeats=3)
    if prev:
        ratios.append(t / prev)
    prev = t
# doubling n should roughly quadruple the time of an O(n^2) function
assert all(2.5 < r < 6.5 for r in ratios), ratios
print("quadratic ratios look like ~4x")
```

Output:
```text
quadratic ratios look like ~4x
```

```javascript
const { performance } = require("node:perf_hooks");

function quadratic(a) {
  let pairs = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = i + 1; j < a.length; j++)
      if (a[i] === a[j]) pairs++;
  return pairs;
}

function bestTime(fn, a, repeats = 5) {
  let best = Infinity;
  for (let r = 0; r < repeats; r++) {
    const t0 = performance.now();
    fn(a);
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

let prev = null;
const ratios = [];
for (const n of [2000, 4000, 8000]) {
  const data = Array.from({ length: n }, () => Math.floor(Math.random() * 1001));
  const t = bestTime(quadratic, data, 3);
  if (prev) ratios.push(t / prev);
  prev = t;
}
if (!ratios.every(r => r > 2.2 && r < 7)) throw new Error("unexpected ratios " + ratios);
console.log("quadratic ratios look like ~4x");
```

Output:
```text
quadratic ratios look like ~4x
```

</details>
