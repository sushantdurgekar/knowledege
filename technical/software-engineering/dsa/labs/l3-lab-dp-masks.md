---
title: "Interval DP and bitmask DP against brute force"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Interval DP and bitmask DP against brute force

> Data Structures & Algorithms L3 · about 90 min · modules m04, m05

Solve Burst Balloons (LeetCode 312) with interval DP, and the travelling salesman problem with Held–Karp's bitmask DP, rebuilding the tour itself. Check both against brute force that tries every order, for up to 7 balloons or cities.

## Before you start
- Python 3.12+ and Node.js 22+
- Modules 04 and 05

## Steps
1. `max_coins(nums)`: pad the balloons with a 1 at each end. Let `dp[i][j]` be the most coins from bursting every balloon strictly between i and j, and try each k as the balloon burst *last* in that range: its neighbours are then a[i] and a[j], so the two sides don't affect each other.
2. Fill the table by increasing length j − i, so every shorter interval inside (i, j) is ready when you need it, and return the value for the whole padded range.
3. `held_karp(dist)` returns the cost and the tour (module 05's `tsp` returns only the cost). `dp[mask][v]` is the cheapest route that starts at city 0, visits exactly the cities in mask and ends at v. Only odd masks contain city 0. Each step adds one city u that isn't in the mask yet, improving `dp[mask | 1 << u][u]` with `dp[mask][v] + dist[v][u]`.
4. Close the tour with the smallest `dp[full][v] + dist[v][0]`, then rebuild it from a `parent` table, clearing each city's bit as you walk back to city 0.
5. Test 200 random cases: up to 7 balloons worth 0–9 (zeros included), and 2–7 cities with random one-way costs. Compare with a brute force over every bursting order and every permutation of the cities, and check that the tour visits each city once and costs what was claimed.

## Prove it worked
- Both DPs match brute force on 200 random cases, including no balloons, zero-valued balloons and just two cities.
- The tour starts and ends at city 0, visits every other city exactly once, and its edges add up to the reported cost.
- You can say why the work drops from (n − 1)! orders to about 2ⁿ · n² steps: the DP needs to know which cities are used and where you are, not the order you visited them in.

## Break it (then fix it)
- Fill the interval table row by row with i going up (and j from i + 2) instead of by length: [3, 1, 5, 8] now gives 63 instead of 167, because dp[k][j] for k > i isn't filled yet. Then run i down from the end (j still going up) and the tests pass again: any order works as long as every shorter interval inside (i, j) comes first.
- Delete the check that skips cities already in the mask. The cost check against brute force fails within the 200 random tests, with a cost that is too low: random one-way costs often break the triangle inequality, so a route that passes through a city twice can beat every real tour.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random
from itertools import permutations

def max_coins(nums):                            # interval DP: O(n^3) time, O(n^2) space
    a = [1] + nums + [1]                        # a 1 at each end: the walls never burst
    n = len(a)
    dp = [[0] * n for _ in range(n)]            # dp[i][j]: best coins from the balloons strictly between i and j
    for length in range(2, n):                  # shorter intervals first
        for i in range(n - length):
            j = i + length
            dp[i][j] = max(dp[i][k] + a[i] * a[k] * a[j] + dp[k][j]   # k is the LAST balloon burst in (i, j),
                           for k in range(i + 1, j))                  # so its neighbours are a[i] and a[j]
    return dp[0][n - 1]

def held_karp(dist):                            # n >= 2 cities; O(2^n * n^2) time, O(2^n * n) space
    n, INF = len(dist), float("inf")
    full = (1 << n) - 1
    dp = [[INF] * n for _ in range(1 << n)]     # dp[mask][v]: cheapest route from 0 through mask, ending at v
    parent = [[-1] * n for _ in range(1 << n)]
    dp[1][0] = 0
    for mask in range(1, 1 << n, 2):            # odd masks only: city 0 is always visited
        for v in range(n):
            if dp[mask][v] == INF:
                continue
            for u in range(n):
                if mask >> u & 1:               # every city at most once
                    continue
                nxt, cost = mask | 1 << u, dp[mask][v] + dist[v][u]
                if cost < dp[nxt][u]:
                    dp[nxt][u], parent[nxt][u] = cost, v
    best, last = min((dp[full][v] + dist[v][0], v) for v in range(1, n))
    tour, mask, v = [], full, last              # walk the parents back to city 0
    while v != -1:
        tour.append(v)
        mask, v = mask ^ 1 << v, parent[mask][v]
    return best, tour[::-1] + [0]

def brute_coins(nums):                          # try every order of bursting: O(n! * n)
    if not nums:
        return 0
    return max((nums[i - 1] if i > 0 else 1) * nums[i] * (nums[i + 1] if i + 1 < len(nums) else 1)
               + brute_coins(nums[:i] + nums[i + 1:]) for i in range(len(nums)))

def brute_tsp(dist):                            # try every order of cities 1..n-1: O(n!)
    n = len(dist)
    return min(sum(dist[a][b] for a, b in zip((0,) + p, p + (0,))) for p in permutations(range(1, n)))

for _ in range(200):
    nums = [random.randint(0, 9) for _ in range(random.randint(0, 7))]
    assert max_coins(nums) == brute_coins(nums), nums
    n = random.randint(2, 7)                    # random one-way costs: no triangle inequality
    dist = [[0 if i == j else random.randint(1, 20) for j in range(n)] for i in range(n)]
    cost, tour = held_karp(dist)
    assert cost == brute_tsp(dist), dist
    assert tour[0] == tour[-1] == 0 and sorted(tour[:-1]) == list(range(n))
    assert sum(dist[a][b] for a, b in zip(tour, tour[1:])) == cost

cost, tour = held_karp([[0, 2, 9, 10], [1, 0, 6, 4], [15, 7, 0, 8], [6, 3, 12, 0]])
print("burst 3 1 5 8 ->", max_coins([3, 1, 5, 8]), "| tour", *tour, "costs", cost)
```

Output:
```text
burst 3 1 5 8 -> 167 | tour 0 2 3 1 0 costs 21
```

```javascript
const assert = require("node:assert");

function maxCoins(nums) {                       // interval DP: O(n^3) time, O(n^2) space
  const a = [1, ...nums, 1], n = a.length;      // a 1 at each end: the walls never burst
  const dp = Array.from({ length: n }, () => new Array(n).fill(0));   // dp[i][j]: balloons strictly between i and j
  for (let len = 2; len < n; len++)             // shorter intervals first
    for (let i = 0; i + len < n; i++) {
      const j = i + len;
      for (let k = i + 1; k < j; k++)           // k is the LAST balloon burst in (i, j),
        dp[i][j] = Math.max(dp[i][j], dp[i][k] + a[i] * a[k] * a[j] + dp[k][j]);   // so a[i] and a[j] are its neighbours
    }
  return dp[0][n - 1];
}

function heldKarp(dist) {                       // n >= 2 cities; O(2^n * n^2) time, O(2^n * n) space
  const n = dist.length, full = (1 << n) - 1;
  const dp = Array.from({ length: 1 << n }, () => new Array(n).fill(Infinity));   // dp[mask][v]: from 0 through mask, ending at v
  const parent = Array.from({ length: 1 << n }, () => new Array(n).fill(-1));
  dp[1][0] = 0;
  for (let mask = 1; mask <= full; mask += 2)   // odd masks only: city 0 is always visited
    for (let v = 0; v < n; v++) {
      if (dp[mask][v] === Infinity) continue;
      for (let u = 0; u < n; u++) {
        if ((mask >> u) & 1) continue;          // every city at most once
        const next = mask | (1 << u), cost = dp[mask][v] + dist[v][u];
        if (cost < dp[next][u]) {
          dp[next][u] = cost;
          parent[next][u] = v;
        }
      }
    }
  let best = Infinity, last = -1;
  for (let v = 1; v < n; v++) {
    if (dp[full][v] + dist[v][0] < best) {
      best = dp[full][v] + dist[v][0];
      last = v;
    }
  }
  const tour = [];                              // walk the parents back to city 0
  for (let mask = full, v = last; v !== -1; ) {
    tour.push(v);
    const p = parent[mask][v];
    mask ^= 1 << v;
    v = p;
  }
  return [best, [...tour.reverse(), 0]];
}

function* permutations(items) {                 // every order of items
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++)
    for (const rest of permutations(items.toSpliced(i, 1))) yield [items[i], ...rest];
}

function bruteCoins(nums) {                     // try every order of bursting: O(n! * n)
  let best = 0;
  for (let i = 0; i < nums.length; i++) {
    const coins = (nums[i - 1] ?? 1) * nums[i] * (nums[i + 1] ?? 1);
    best = Math.max(best, coins + bruteCoins(nums.toSpliced(i, 1)));
  }
  return best;
}

function bruteTsp(dist) {                       // try every order of cities 1..n-1: O(n!)
  let best = Infinity;
  for (const p of permutations([...dist.keys()].slice(1))) {
    const route = [0, ...p, 0];
    best = Math.min(best, route.slice(1).reduce((sum, v, i) => sum + dist[route[i]][v], 0));
  }
  return best;
}

const rnd = k => Math.floor(Math.random() * k);
for (let t = 0; t < 200; t++) {
  const nums = Array.from({ length: rnd(8) }, () => rnd(10));
  assert.strictEqual(maxCoins(nums), bruteCoins(nums), String(nums));
  const n = 2 + rnd(6);                         // random one-way costs: no triangle inequality
  const dist = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : 1 + rnd(20))));
  const [cost, tour] = heldKarp(dist);
  assert.strictEqual(cost, bruteTsp(dist));
  assert.ok(tour[0] === 0 && tour.at(-1) === 0);
  assert.deepStrictEqual(tour.slice(0, -1).toSorted((x, y) => x - y), [...dist.keys()]);
  assert.strictEqual(tour.slice(1).reduce((sum, v, i) => sum + dist[tour[i]][v], 0), cost);
}

const [cost, tour] = heldKarp([[0, 2, 9, 10], [1, 0, 6, 4], [15, 7, 0, 8], [6, 3, 12, 0]]);
console.log("burst 3 1 5 8 ->", maxCoins([3, 1, 5, 8]), "| tour", ...tour, "costs", cost);
```

Output:
```text
burst 3 1 5 8 -> 167 | tour 0 2 3 1 0 costs 21
```

</details>
