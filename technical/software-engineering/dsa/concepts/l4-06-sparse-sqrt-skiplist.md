---
title: "Sparse tables, square-root tricks and skip lists"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l4, dsa-l4-m06]
status: new
created: 2026-10-09
updated: 2026-10-09
sources:
  - url: https://cp-algorithms.com/data_structures/sparse-table.html
    accessed: 2026-10-09
  - url: https://cp-algorithms.com/data_structures/sqrt_decomposition.html
    accessed: 2026-10-09
  - url: https://en.wikipedia.org/wiki/Skip_list
    accessed: 2026-10-09
  - url: https://redis.io/docs/latest/develop/data-types/sorted-sets/
    accessed: 2026-10-09
  - url: https://cses.fi/problemset/
    accessed: 2026-10-09
---
# Sparse tables, square-root tricks and skip lists

> Data Structures & Algorithms · L4 Expert · Trees, strings & advanced structures · about 120 min · hub module `m06` ([open the hub](https://claude.ai/artifact/DxduaMdo2n5kqrt3We8PPZ))

## Why it matters
Not every range question needs a segment tree. When the data never changes, a sparse table answers a range minimum in O(1). When the operation doesn't merge neatly, blocks of √n elements keep the code short. When all the queries are known up front, Mo's algorithm reorders them so that one sliding window answers them all. And when you need a sorted set without rotations, the skip list behind Redis's sorted sets and many databases' in-memory write buffers does it with coin flips.

## Pre-question (answer before reading)
**Q:** You must answer a million “minimum of a[l..r]?” questions on an array that never changes. Is there a way to answer each one by looking at just two stored numbers?

<details><summary>Answer</summary>

Yes. Store the minimum of every block whose length is a power of two. Any range [l, r] is covered by two such blocks of the same length, one starting at l and one ending at r. They may overlap, but an element counted twice can't change a minimum, so min(block 1, block 2) is the answer. That table is a sparse table.

</details>

## 🍎 Story time (kid version)
**The toy room and the treasure-map road trip: Ben's express lanes**

Ben lines his toy cars up in number order along the bottom shelf. Finding car 70 means walking past every car, so he flips a coin for each car: heads, a copy goes up on the shelf above too, and he flips again for the shelf above that. Now the top shelf has only a few cars, the next one twice as many, and so on. To find a car, he walks along the top shelf until the next car is too big, then drops a shelf and carries on. Every drop halves what's left to search.

| In the story | In code |
|---|---|
| Cars in number order on the bottom shelf | Level 0: a sorted linked list of every value |
| A coin flip sends a copy up a shelf | Each node joins the next level with probability 1/2 |
| Each shelf has about half the cars of the one below | Level i holds about n / 2^i nodes, so there are about log₂ n levels |
| Walk right until the next car is too big, then drop | Search: move right while next < target, then go down a level |
| Every drop halves what's left | Expected O(log n) steps for search, insert and delete |

**Where the story breaks:** Ben's shelves are lucky or unlucky by chance, and so are a skip list's levels: the O(log n) is an expected cost, not a guarantee, although a really bad run is vanishingly unlikely. And Ben copies whole cars, while a skip list stores each value once with a tower of pointers, about two per value on average.

## Key ideas (grown-up version)
- **Sparse table**: t[j][i] holds the answer for a[i .. i + 2^j − 1], built level by level from two halves in O(n log n) time and memory. A query on [l, r] takes the largest 2^j that fits and combines the block starting at l with the block ending at r: O(1).
- **Idempotent operations only**: the two blocks may overlap, which is harmless when op(x, x) = x (min, max, gcd, bitwise and/or) but double-counts for sums. And the table is static: one change would touch O(n) entries.
- **Square-root decomposition**: cut the array into blocks of about √n and keep a summary per block. A range query handles O(√n) whole blocks by their summaries and O(√n) loose elements one by one, and an update fixes one block: O(√n) per operation, more with a log factor if blocks are binary searched.
- **Why use blocks at all**: the summary only has to work for a block, not merge with its neighbours. Sorted copies of each block answer “how many values ≤ x in [l, r]?” with point updates, which a plain segment tree can't do with O(1) summaries.
- **Mo's algorithm (offline)**: read every query first, sort them by (block of l, then r), and slide one window [lo, hi] from query to query, adding or removing one element at a time. With block size B ≈ n / √q, the ends move O(n √q) steps in total, so anything you can update in O(1) per element (distinct counts, frequencies) costs O(n √q + q log q).
- **Mo's needs**: all queries in advance (no online or encoded queries), O(1) add and remove, and no updates in the basic form. Alternating the direction of r between blocks (snake order) roughly halves the right end's travel.
- **Skip list**: a sorted linked list with “express lanes”: each node also joins the level above with probability 1/2, so level i has about n / 2^i nodes. Search moves right while the next value is smaller, then drops a level. Search, insert and delete take expected O(log n) time and expected O(n) space, with no rotations; Redis sorted sets and LevelDB/RocksDB in-memory tables use them.
- **Choosing**: static data and min/max/gcd → sparse table; static sums → prefix sums; updates with a mergeable operation → Fenwick or segment tree (L3); awkward operations → square-root blocks; many offline add/remove-style queries → Mo's; a sorted set you build yourself → skip list or a balanced tree.

## Diagrams
**A sparse table for min over a = [5, 2, 8, 6, 3, 7, 4, 9]**

| len 1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 5 | 2 | 8 | 6 | 3 | 7 | 4 | 9 |

| len 2 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | 2 | 2 | 6 | 3 | 3 | 4 | 4 |

| len 4 | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| value | 2 | 2 | **3** | **3** | 3 |

| len 8 | 0 |
|---|---|
| value | 2 |

_min(a[2..6]) covers 5 elements, so it uses two length-4 blocks: the one starting at 2 (8, 6, 3, 7) and the one ending at 6 (6, 3, 7, 4). They overlap on a[3..5], which can't change a minimum: the answer is min(3, 3) = 3._

**A skip list holding 1 2 3 4 6 7 9: searching for 7**

| level 3 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | · | · | · | **4** | · | · | · |

| level 2 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | · | · | · | **4** | · | · | 9 |

| level 1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | · | 2 | · | **4** | · | 7 | 9 |

| level 0 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | 1 | 2 | 3 | **4** | **6** | 7 | 9 |

_Start at the top: 4 < 7, so move to 4. On levels 3, 2 and 1 the next node is missing or not smaller than 7 (nothing, then 9, then 7), so drop down. On level 0, move to 6; the next node is 7, the target. Two moves to the right instead of five along the bottom level._

## Comparisons
**Range-query structures: which one?**

| Structure | Build | Query | Update | Best for |
|---|---|---|---|---|
| Prefix sums | O(n) | O(1) | O(n) | Static sums |
| Sparse table | O(n log n) | O(1) | Not supported | Static min, max, gcd |
| Fenwick or segment tree (L3) | O(n) | O(log n) | O(log n) | Mergeable operations with updates |
| Square-root blocks | O(n), or O(n log n) with sorted blocks | O(√n), or O(√n log n) | O(√n) | Operations that don't merge neatly |
| Mo's algorithm | Sort the queries: O(q log q) | O(n √q) for all of them together | Not in the basic form | Distinct counts, frequencies, other add/remove answers |

**Balanced search tree or skip list?**

|  | Red-black or AVL tree | Skip list |
|---|---|---|
| Search, insert, delete | O(log n) in the worst case | O(log n) expected |
| Staying balanced | Rotations and colour or height rules | Coin flips: no rebalancing at all |
| Ordered scan | In-order traversal | Walk level 0 |
| Concurrent versions | Hard to write | Simpler, including lock-free designs |
| Seen in | Java's TreeMap, C++'s std::map | Redis sorted sets, LevelDB and RocksDB memtables |

## Code (JavaScript + Python)
### The sparse table used by the first example and the quiz
```python
class SparseTable:                              # O(n log n) build, O(1) query for idempotent operations
    def __init__(self, a, op):
        self.op, self.t = op, [a[:]]            # t[j][i] = op over a[i .. i + 2^j - 1]
        j = 1
        while 1 << j <= len(a):
            prev, half = self.t[-1], 1 << (j - 1)
            self.t.append([op(prev[i], prev[i + half]) for i in range(len(a) - (1 << j) + 1)])
            j += 1

    def query(self, l, r):                      # op over a[l .. r], both ends included
        j = (r - l + 1).bit_length() - 1        # the largest power of two that fits in the range
        return self.op(self.t[j][l], self.t[j][r - (1 << j) + 1])   # two overlapping blocks cover [l, r]
```

```javascript
class SparseTable {                             // O(n log n) build, O(1) query for idempotent operations
  constructor(a, op) {
    this.op = op;
    this.t = [[...a]];                          // t[j][i] = op over a[i .. i + 2^j - 1]
    for (let j = 1; 1 << j <= a.length; j++) {
      const prev = this.t[j - 1], half = 1 << (j - 1);
      this.t.push(Array.from({ length: a.length - (1 << j) + 1 }, (_, i) => op(prev[i], prev[i + half])));
    }
  }
  query(l, r) {                                 // op over a[l .. r], both ends included
    const j = 31 - Math.clz32(r - l + 1);       // the largest power of two that fits in the range
    return this.op(this.t[j][l], this.t[j][r - (1 << j) + 1]);   // two overlapping blocks cover [l, r]
  }
}
```

### Sparse tables: O(1) range minimum, range gcd, and 100,000 elements
```python
from math import gcd

a = [5, 2, 8, 6, 3, 7, 4, 9]
mn = SparseTable(a, min)
print(mn.query(0, 7), mn.query(2, 6), mn.query(3, 3), mn.query(5, 7))
g = SparseTable([12, 18, 24, 9, 15], gcd)
print(g.query(0, 2), g.query(1, 4), g.query(3, 4))
big = SparseTable(list(range(100_000, 0, -1)), max)
print(len(big.t), big.query(10, 99_999))
```

Output:
```text
2 3 6 4
6 3 3
17 99990
```

- line 5: query(2, 6) covers 5 elements: blocks of 4 at 2 and at 3 overlap, and min(3, 3) = 3.
- line 7: gcd is idempotent too: gcd(x, x) = x, so overlapping blocks are fine. gcd(18, 24, 9, 15) = 3.
- line 8: 100,000 elements need 17 levels, since 2¹⁶ ≤ 100,000 < 2¹⁷: about 1.6 million stored values for O(1) queries.

```javascript
const gcd = (x, y) => (y === 0 ? x : gcd(y, x % y));

const a = [5, 2, 8, 6, 3, 7, 4, 9];
const mn = new SparseTable(a, Math.min);
console.log(mn.query(0, 7), mn.query(2, 6), mn.query(3, 3), mn.query(5, 7));
const g = new SparseTable([12, 18, 24, 9, 15], gcd);
console.log(g.query(0, 2), g.query(1, 4), g.query(3, 4));
const big = new SparseTable(Array.from({ length: 100000 }, (_, i) => 100000 - i), Math.max);
console.log(big.t.length, big.query(10, 99999));
```

Output:
```text
2 3 6 4
6 3 3
17 99990
```

- line 5: query(2, 6) covers 5 elements: blocks of 4 at 2 and at 3 overlap, and min(3, 3) = 3.
- line 7: gcd is idempotent too: gcd(x, x) = x, so overlapping blocks are fine. gcd(18, 24, 9, 15) = 3.
- line 8: 100,000 elements need 17 levels, since 2¹⁶ ≤ 100,000 < 2¹⁷: about 1.6 million stored values for O(1) queries.

### Square-root blocks: count values ≤ x in a range, with point updates
```python
from bisect import bisect_right, insort

class BlockCounter:                           # count values <= x in a[l..r], with point updates
    def __init__(self, a):
        self.a = a[:]
        self.B = max(1, int(len(a) ** 0.5))   # block size about sqrt(n)
        self.blocks = [sorted(a[i:i + self.B]) for i in range(0, len(a), self.B)]

    def update(self, i, x):                   # O(B): fix one sorted block
        blk = self.blocks[i // self.B]
        blk.pop(bisect_right(blk, self.a[i]) - 1)   # remove the old value
        insort(blk, x)
        self.a[i] = x

    def count_le(self, l, r, x):              # O(B + (n / B) log B)
        total = 0
        while l <= r and l % self.B:          # the loose elements before the first whole block
            total += self.a[l] <= x
            l += 1
        while l + self.B - 1 <= r:            # whole blocks: binary search their sorted copies
            total += bisect_right(self.blocks[l // self.B], x)
            l += self.B
        while l <= r:                         # the loose elements after the last whole block
            total += self.a[l] <= x
            l += 1
        return total

bc = BlockCounter([7, 2, 9, 4, 4, 8, 1, 6, 3, 5])
print(bc.count_le(0, 9, 4), bc.count_le(2, 7, 6))
bc.update(3, 10)
print(bc.count_le(2, 7, 6), bc.count_le(0, 9, 10) - bc.count_le(0, 9, 5))
```

Output:
```text
5 4
3 5
```

- line 7: √10 rounds down to 3: blocks [7, 2, 9], [4, 4, 8], [1, 6, 3] and [5], each kept sorted.
- line 17: Loose elements at the edges are checked one by one: at most 2B of them.
- line 20: A whole block answers with one binary search over its sorted copy instead of B comparisons.
- line 31: Values in (5, 10] are a difference of two counts, as in CSES 1144 (Salary Queries).

```javascript
const upperBound = (arr, x) => {              // how many values in sorted arr are <= x
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= x) lo = mid + 1; else hi = mid; }
  return lo;
};

class BlockCounter {                          // count values <= x in a[l..r], with point updates
  constructor(a) {
    this.a = [...a];
    this.B = Math.max(1, Math.floor(Math.sqrt(a.length)));   // block size about sqrt(n)
    this.blocks = [];
    for (let i = 0; i < a.length; i += this.B) this.blocks.push(a.slice(i, i + this.B).sort((x, y) => x - y));
  }
  update(i, x) {                              // O(B): fix one sorted block
    const blk = this.blocks[Math.floor(i / this.B)];
    blk.splice(upperBound(blk, this.a[i]) - 1, 1);   // remove the old value
    blk.splice(upperBound(blk, x), 0, x);
    this.a[i] = x;
  }
  countLe(l, r, x) {                          // O(B + (n / B) log B)
    let total = 0;
    for (; l <= r && l % this.B !== 0; l++) total += this.a[l] <= x ? 1 : 0;   // loose elements first
    for (; l + this.B - 1 <= r; l += this.B) total += upperBound(this.blocks[l / this.B], x);   // whole blocks
    for (; l <= r; l++) total += this.a[l] <= x ? 1 : 0;   // loose elements last
    return total;
  }
}

const bc = new BlockCounter([7, 2, 9, 4, 4, 8, 1, 6, 3, 5]);
console.log(bc.countLe(0, 9, 4), bc.countLe(2, 7, 6));
bc.update(3, 10);
console.log(bc.countLe(2, 7, 6), bc.countLe(0, 9, 10) - bc.countLe(0, 9, 5));
```

Output:
```text
5 4
3 5
```

- line 10: √10 rounds down to 3: blocks [7, 2, 9], [4, 4, 8], [1, 6, 3] and [5], each kept sorted.
- line 22: Loose elements at the edges are checked one by one: at most 2B of them.
- line 23: A whole block answers with one binary search over its sorted copy instead of B comparisons.
- line 32: Values in (5, 10] are a difference of two counts, as in CSES 1144 (Salary Queries).

### Mo's algorithm: distinct values in many ranges, answered offline
```python
def distinct_queries(a, queries):             # offline: the number of distinct values in each a[l..r]
    n, q = len(a), len(queries)
    B = max(1, int(n / max(1, q) ** 0.5))     # block size about n / sqrt(q)
    def key(i):
        b = queries[i][0] // B
        return (b, queries[i][1] if b % 2 == 0 else -queries[i][1])   # snake order: r alternates by block
    cnt, ans = [0] * (max(a, default=0) + 1), [0] * q
    distinct, lo, hi = 0, 0, -1               # the window a[lo..hi], empty at first
    def add(i):
        nonlocal distinct
        cnt[a[i]] += 1
        distinct += cnt[a[i]] == 1
    def remove(i):
        nonlocal distinct
        cnt[a[i]] -= 1
        distinct -= cnt[a[i]] == 0
    for i in sorted(range(q), key=key):
        l, r = queries[i]
        while hi < r:                         # grow first, then shrink, so the window stays valid
            hi += 1
            add(hi)
        while lo > l:
            lo -= 1
            add(lo)
        while hi > r:
            remove(hi)
            hi -= 1
        while lo < l:
            remove(lo)
            lo += 1
        ans[i] = distinct
    return ans

print(*distinct_queries([2, 1, 3, 2, 3, 1, 4, 2], [(0, 3), (1, 6), (4, 7), (2, 2), (0, 7)]))
```

Output:
```text
3 4 4 1 4
```

- line 3: With q = 5 queries on n = 8 elements, B = int(8 / √5) = 3. Bigger inputs balance q × B steps of the left end against n² / B steps of the right end.
- line 6: Within even blocks r rises and within odd blocks it falls, so the right end sweeps back and forth instead of jumping back to the start.
- line 19: Each step adds or removes one element in O(1), which is all Mo's algorithm needs from the answer.
- line 31: The answers come back in the queries' original order, although they were computed in Mo's order.

```javascript
function distinctQueries(a, queries) {        // offline: the number of distinct values in each a[l..r]
  const n = a.length, q = queries.length;
  const B = Math.max(1, Math.floor(n / Math.sqrt(Math.max(1, q))));   // block size about n / sqrt(q)
  const order = [...Array(q).keys()].sort((i, j) => {
    const bi = Math.floor(queries[i][0] / B), bj = Math.floor(queries[j][0] / B);
    if (bi !== bj) return bi - bj;
    return bi % 2 === 0 ? queries[i][1] - queries[j][1] : queries[j][1] - queries[i][1];   // snake order
  });
  const cnt = new Array(a.reduce((m, x) => Math.max(m, x), 0) + 1).fill(0), ans = new Array(q).fill(0);
  let distinct = 0, lo = 0, hi = -1;          // the window a[lo..hi], empty at first
  const add = i => { if (cnt[a[i]]++ === 0) distinct++; };
  const remove = i => { if (--cnt[a[i]] === 0) distinct--; };
  for (const i of order) {
    const [l, r] = queries[i];
    while (hi < r) add(++hi);                 // grow first, then shrink, so the window stays valid
    while (lo > l) add(--lo);
    while (hi > r) remove(hi--);
    while (lo < l) remove(lo++);
    ans[i] = distinct;
  }
  return ans;
}

console.log(...distinctQueries([2, 1, 3, 2, 3, 1, 4, 2], [[0, 3], [1, 6], [4, 7], [2, 2], [0, 7]]));
```

Output:
```text
3 4 4 1 4
```

- line 3: With q = 5 queries on n = 8 elements, B = int(8 / √5) = 3. Bigger inputs balance q × B steps of the left end against n² / B steps of the right end.
- line 7: Within even blocks r rises and within odd blocks it falls, so the right end sweeps back and forth instead of jumping back to the start.
- line 15: Each step adds or removes one element in O(1), which is all Mo's algorithm needs from the answer.
- line 19: The answers come back in the queries' original order, although they were computed in Mo's order.

## Worked example
**Problem.** Design a class that, given an array, answers queries (left, right, threshold): return the element that occurs at least threshold times in arr[left..right], or −1. It's guaranteed that 2 × threshold > right − left + 1. (LeetCode 1157, Online Majority Element In Subarray)

1. 2 × threshold > length means any qualifying element is a strict majority of the range, so at most one element can qualify.
2. Boyer–Moore voting finds the only possible candidate: pair up different values and cancel them, and whatever survives is the candidate. Two pieces' summaries (candidate, votes) merge the same way, so a segment tree can hold one summary per node.
3. A query merges the O(log n) nodes covering the range to get a candidate, then counts the candidate's occurrences with two binary searches in its sorted list of positions.
4. Build: O(n) time and space for the tree and the position lists. Each query: O(log n) for the candidate and O(log n) for the count.

```python
from bisect import bisect_left, bisect_right

def merge(x, y):                              # Boyer-Moore: equal candidates add votes, different ones cancel
    if x[0] == y[0]:
        return (x[0], x[1] + y[1])
    return (x[0], x[1] - y[1]) if x[1] >= y[1] else (y[0], y[1] - x[1])

class MajorityChecker:
    def __init__(self, arr):
        self.n = n = len(arr)
        self.pos = {}                         # value -> its positions, in order
        for i, v in enumerate(arr):
            self.pos.setdefault(v, []).append(i)
        self.t = [(0, 0)] * n + [(v, 1) for v in arr]   # bottom-up segment tree of (candidate, votes)
        for i in range(n - 1, 0, -1):
            self.t[i] = merge(self.t[2 * i], self.t[2 * i + 1])

    def query(self, left, right, threshold):
        res, l, r = (0, 0), left + self.n, right + self.n + 1
        while l < r:                          # merge the O(log n) nodes that cover [left, right]
            if l & 1:
                res, l = merge(res, self.t[l]), l + 1
            if r & 1:
                r -= 1
                res = merge(res, self.t[r])
            l, r = l // 2, r // 2
        p = self.pos.get(res[0], [])
        count = bisect_right(p, right) - bisect_left(p, left)
        return res[0] if count >= threshold else -1

mc = MajorityChecker([1, 1, 2, 2, 1, 1])
print(mc.query(0, 5, 4), mc.query(0, 3, 3), mc.query(2, 3, 2))
```

Output:
```text
1 -1 2
```

```javascript
const lowerBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo; };
const upperBound = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return lo; };

const merge = ([c1, v1], [c2, v2]) => {       // Boyer-Moore: equal candidates add votes, different ones cancel
  if (c1 === c2) return [c1, v1 + v2];
  return v1 >= v2 ? [c1, v1 - v2] : [c2, v2 - v1];
};

class MajorityChecker {
  constructor(arr) {
    const n = (this.n = arr.length);
    this.pos = new Map();                     // value -> its positions, in order
    arr.forEach((v, i) => { if (!this.pos.has(v)) this.pos.set(v, []); this.pos.get(v).push(i); });
    this.t = new Array(2 * n);                // bottom-up segment tree of [candidate, votes]
    for (let i = 0; i < n; i++) this.t[n + i] = [arr[i], 1];
    for (let i = n - 1; i > 0; i--) this.t[i] = merge(this.t[2 * i], this.t[2 * i + 1]);
  }
  query(left, right, threshold) {
    let res = [0, 0];
    for (let l = left + this.n, r = right + this.n + 1; l < r; l >>= 1, r >>= 1) {   // merge the covering nodes
      if (l & 1) res = merge(res, this.t[l++]);
      if (r & 1) res = merge(res, this.t[--r]);
    }
    const p = this.pos.get(res[0]) || [];
    const count = upperBound(p, right) - lowerBound(p, left);
    return count >= threshold ? res[0] : -1;
  }
}

const mc = new MajorityChecker([1, 1, 2, 2, 1, 1]);
console.log(mc.query(0, 5, 4), mc.query(0, 3, 3), mc.query(2, 3, 2));
```

Output:
```text
1 -1 2
```

**Answer.** 1, −1 and 2. The whole array has four 1s, enough for threshold 4. arr[0..3] = 1 1 2 2 has no value three times. arr[2..3] = 2 2 meets threshold 2.

## Your turn (faded example)
**Problem.** Design a skip list without any library sorted structure: search(target) says whether target is present, add(num) inserts it (duplicates allowed), and erase(num) removes one copy and says whether it found one. Each call should take O(log n) expected time. (LeetCode 1206, Design Skiplist)

- ✓ Keep a sorted linked list on level 0 and “express lanes” above it: each node also joins the next level up with probability 1/2, so level i holds about n / 2^i nodes.
- **How does a search move through the levels?**
  <details><summary>Answer</summary>Start at the head on the top level in use. Move right while the next value is smaller than the target, then drop a level. On level 0, the next node is the first value ≥ target.</details>
- **What must add and erase remember on the way down?**
  <details><summary>Answer</summary>The last node before the target on every level (an update array). add splices the new node in after those nodes on its lowest lvl levels; erase unlinks the first matching node on every level it's on.</details>
- **Time and space?**
  <details><summary>Answer</summary>Expected O(log n) per search, add and erase, and expected O(n) space (about two pointers per value), because each level holds about half the nodes of the one below. The worst case is O(n), but it's vanishingly unlikely.</details>

Starter:
```python
import random

class Node:
    def __init__(self, val, level):
        self.val, self.next = val, [None] * level

class Skiplist:
    MAX = 16                                  # enough levels for about 2^16 values

    def __init__(self):
        self.head, self.level = Node(-1, self.MAX), 1

    def _before(self, target):                # the last node < target on every level
        update, x = [self.head] * self.MAX, self.head
        for i in range(self.level - 1, -1, -1):
            while x.next[i] and x.next[i].val < target:
                x = x.next[i]
            update[i] = x
        return update

    def search(self, target):
        nxt = self._before(target)[0].next[0]
        return nxt is not None and nxt.val == target

    def add(self, num):
        ...                                   # TODO: pick a random level, then splice in on each level

    def erase(self, num):
        ...                                   # TODO: unlink the first copy on every level it is on
```

```javascript
class SkipNode {
  constructor(val, level) { this.val = val; this.next = new Array(level).fill(null); }
}

class Skiplist {
  constructor() { this.MAX = 16; this.head = new SkipNode(-1, this.MAX); this.level = 1; }
  before(target) {                            // the last node < target on every level
    const update = new Array(this.MAX).fill(this.head);
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i--) {
      while (x.next[i] && x.next[i].val < target) x = x.next[i];
      update[i] = x;
    }
    return update;
  }
  search(target) {
    const nxt = this.before(target)[0].next[0];
    return nxt !== null && nxt.val === target;
  }
  add(num) {
    // TODO: pick a random level, then splice in on each level
  }
  erase(num) {
    // TODO: unlink the first copy on every level it is on
  }
}
```

<details><summary>Full solution</summary>

```python
import random

class Node:
    def __init__(self, val, level):
        self.val, self.next = val, [None] * level

class Skiplist:
    MAX = 16                                  # enough levels for about 2^16 values

    def __init__(self):
        self.head, self.level = Node(-1, self.MAX), 1

    def _before(self, target):                # the last node < target on every level
        update, x = [self.head] * self.MAX, self.head
        for i in range(self.level - 1, -1, -1):
            while x.next[i] and x.next[i].val < target:
                x = x.next[i]                 # move right while the next value is smaller
            update[i] = x                     # then drop a level
        return update

    def search(self, target):
        nxt = self._before(target)[0].next[0]
        return nxt is not None and nxt.val == target

    def add(self, num):
        update, lvl = self._before(num), 1
        while lvl < self.MAX and random.random() < 0.5:
            lvl += 1                          # each extra level with probability 1/2
        self.level = max(self.level, lvl)
        node = Node(num, lvl)
        for i in range(lvl):                  # splice in after the last smaller node on each level
            node.next[i], update[i].next[i] = update[i].next[i], node

    def erase(self, num):
        update = self._before(num)
        node = update[0].next[0]
        if node is None or node.val != num:
            return False
        for i in range(len(node.next)):       # it's the first copy, so it follows update[i] on every level
            update[i].next[i] = node.next[i]
        return True

sl = Skiplist()
for x in (1, 2, 3):
    sl.add(x)
out = [sl.search(0)]
sl.add(4)
out += [sl.search(1), sl.erase(0), sl.erase(1), sl.search(1)]
print(*("yes" if b else "no" for b in out))
```

Output:
```text
no yes no yes no
```

```javascript
class SkipNode {
  constructor(val, level) { this.val = val; this.next = new Array(level).fill(null); }
}

class Skiplist {
  constructor() { this.MAX = 16; this.head = new SkipNode(-1, this.MAX); this.level = 1; }
  before(target) {                            // the last node < target on every level
    const update = new Array(this.MAX).fill(this.head);
    let x = this.head;
    for (let i = this.level - 1; i >= 0; i--) {
      while (x.next[i] && x.next[i].val < target) x = x.next[i];   // move right while the next value is smaller
      update[i] = x;                          // then drop a level
    }
    return update;
  }
  search(target) {
    const nxt = this.before(target)[0].next[0];
    return nxt !== null && nxt.val === target;
  }
  add(num) {
    const update = this.before(num);
    let lvl = 1;
    while (lvl < this.MAX && Math.random() < 0.5) lvl++;   // each extra level with probability 1/2
    this.level = Math.max(this.level, lvl);
    const node = new SkipNode(num, lvl);
    for (let i = 0; i < lvl; i++) { node.next[i] = update[i].next[i]; update[i].next[i] = node; }   // splice in
  }
  erase(num) {
    const update = this.before(num), node = update[0].next[0];
    if (node === null || node.val !== num) return false;
    for (let i = 0; i < node.next.length; i++) update[i].next[i] = node.next[i];   // the first copy follows update[i]
    return true;
  }
}

const sl = new Skiplist();
for (const x of [1, 2, 3]) sl.add(x);
const out = [sl.search(0)];
sl.add(4);
out.push(sl.search(1), sl.erase(0), sl.erase(1), sl.search(1));
console.log(...out.map(b => (b ? "yes" : "no")));
```

Output:
```text
no yes no yes no
```

</details>

## Socratic checks and quiz (answers hidden)
**1. What does this print? (`SparseTable` is this module's helper; `t` holds one list per level.)**

```python
st = SparseTable([4, 6, 1, 5, 3], min)
print(st.query(0, 4), st.query(1, 3), st.query(3, 4), len(st.t))
```

```javascript
const st = new SparseTable([4, 6, 1, 5, 3], Math.min);
console.log(st.query(0, 4), st.query(1, 3), st.query(3, 4), st.t.length);
```

- A. 1 1 3 3
- B. 1 1 3 2
- C. 1 5 3 3
- D. 4 1 3 3

<details><summary>Answer</summary>

1 1 3 3. The minimum of everything is 1, of 6 1 5 it is 1, and of 5 3 it is 3. With n = 5 there are levels for lengths 1, 2 and 4: 8 doesn't fit, so 3 levels.

</details>

**2. What does this print?**

```python
B = 3
qs = [(0, 8), (1, 2), (4, 5), (3, 9), (7, 7)]
key = lambda i: (qs[i][0] // B, qs[i][1] if qs[i][0] // B % 2 == 0 else -qs[i][1])
print(*sorted(range(len(qs)), key=key))
```

```javascript
const B = 3, qs = [[0, 8], [1, 2], [4, 5], [3, 9], [7, 7]];
const block = i => Math.floor(qs[i][0] / B);
const order = [...qs.keys()].sort((i, j) => block(i) - block(j) || (block(i) % 2 === 0 ? qs[i][1] - qs[j][1] : qs[j][1] - qs[i][1]));
console.log(...order);
```

- A. 1 0 3 2 4
- B. 0 1 2 3 4
- C. 1 0 2 3 4
- D. 1 0 3 4 2

<details><summary>Answer</summary>

1 0 3 2 4. Block 0 (l = 0, 1) is sorted by rising r: queries 1 (r = 2) then 0 (r = 8). Block 1 (l = 3, 4) is odd, so r falls: 3 (r = 9) then 2 (r = 5). Query 4 is alone in block 2.

</details>

**3. Why can a sparse table answer a range minimum with two overlapping blocks but not a range sum?**

- A. min is idempotent: an element counted twice doesn't change a minimum, but it changes a sum
- B. Sums need more than O(n log n) memory
- C. For minimum queries the two blocks never overlap
- D. Sums can be negative

<details><summary>Answer</summary>

min is idempotent: an element counted twice doesn't change a minimum, but it changes a sum. The overlap is the point: min(x, x) = x, while x + x ≠ x. Memory is the same for both, the blocks often overlap, and the sign of the numbers doesn't matter.

</details>

**4. Which statements are true? (choose 2)**

- A. Mo's algorithm needs every query before it answers any of them
- B. A skip list's search, insert and delete take O(log n) expected time
- C. A sparse table handles point updates in O(log n)
- D. Square-root decomposition answers every query in O(log n)
- E. Mo's algorithm only works for range sums

<details><summary>Answer</summary>

Mo's algorithm needs every query before it answers any of them, A skip list's search, insert and delete take O(log n) expected time. Mo's sorts the queries, so it's offline, and a skip list's levels give expected O(log n). A sparse table update touches O(n) entries, square-root blocks cost O(√n), and Mo's handles any answer with cheap add and remove, such as distinct counts.

</details>

**5. Judge each statement.**

- With blocks of about √n, a range query touches O(√n) whole blocks and O(√n) loose elements.
- In Mo's algorithm, adding or removing one element must be cheap, ideally O(1).
- A sparse table query is O(log n) because it combines log n blocks.
- A skip list stays balanced with rotations, like a red-black tree.

<details><summary>Answer</summary>

With blocks of about √n, a range query touches O(√n) whole blocks and O(√n) loose elements.: Yes; In Mo's algorithm, adding or removing one element must be cheap, ideally O(1).: Yes; A sparse table query is O(log n) because it combines log n blocks.: No; A skip list stays balanced with rotations, like a red-black tree.: No. There are about √n blocks and at most two partial ones. Mo's moves the window O(n √q) steps, so each step must be cheap. A sparse table combines just two blocks in O(1), and a skip list uses random levels, never rotations.

</details>

**6. Put the steps of Mo's algorithm in order.**

- (put the steps in order)

<details><summary>Answer</summary>

Read every query and remember its position → Sort the queries by the block of l, then by r → Move the window's ends one step at a time to each query's range, updating the answer → Write each answer back to its query's original position. Sorting needs all the queries, the window walks them in the sorted order, and only then can the answers go back in the original order.

</details>

**7. Complete the Python range-minimum query on a sparse table `t`.**

```
def range_min(t, l, r):                       # t[j][i] = min of a[i .. i + 2^j - 1]
    j = {{0}}
    return min(t[j][l], {{1}})

```

<details><summary>Answer</summary>

(r - l + 1).bit_length() - 1 | t[j][r - (1 << j) + 1]. j is the largest power of two that fits in the range's length, and the second block is the one of that length that ends exactly at r.

</details>

**8. Match each task to the structure that suits it best.**


<details><summary>Answer</summary>

Many range-minimum queries on an array that never changes = A sparse table: O(1) per query; Distinct values in many ranges, all known in advance = Mo's algorithm; Count values ≤ x in a range, with point updates = Square-root blocks with sorted copies; A sorted set with expected O(log n) operations and no rotations = A skip list. Static minimums are what sparse tables do best, offline add/remove answers suit Mo's, “≤ x” counting needs sorted blocks, and random levels replace rotations in a skip list. Prefix sums in a hash map answer subarray-sum questions, not these.

</details>

## Traps & misconceptions
- **“A sparse table does range sums in O(1) too.”** Its two blocks overlap, which is harmless for min, max or gcd but counts the overlap twice in a sum. For static sums use prefix sums.
- **“A sparse table can take updates.”** One changed element sits in O(n) of its blocks (one per start position and level), so an update costs O(n). With updates, use a Fenwick or segment tree.
- **“Mo's algorithm works online.”** It reorders the queries, so it needs all of them first. If each query depends on the previous answer, as in encoded online queries, Mo's can't be used.
- **“Any block size works for Mo's algorithm.”** The left end moves up to B per query and the right end up to n per block, about q × B + n² / B steps. B ≈ n / √q balances them at O(n √q); too small or too large a block can be many times slower.
- **“Square-root decomposition is just a slow segment tree.”** It is slower per query, O(√n) against O(log n), but it handles summaries that don't merge, such as sorted blocks for “how many values ≤ x”, with very little code.
- **“A skip list is only fast for lucky inputs.”** Its speed comes from its own coin flips, not from the input, so no input order makes it slow. The O(log n) is expected over the coin flips, for every input.

## Discussion prompts
- **When would you choose square-root decomposition over a segment tree?**
  <details><summary>One good answer</summary>When a block's summary is easy to keep but two summaries don't merge neatly: sorted blocks for “how many ≤ x”, a frequency table per block, or a bulk operation that's simple to hold lazily for a whole block. It's also quick to write correctly under time pressure. When the operation does merge (sum, min, gcd), a segment tree's O(log n) wins.</details>
- **Where are skip lists used in real systems?**
  <details><summary>One good answer</summary>Redis keeps each sorted set in a skip list paired with a hash table, and LevelDB and RocksDB buffer recent writes in a skip-list memtable before flushing them to disk. Skip lists need no rebalancing, give ordered scans for free and suit concurrent versions, which is why they appear where a balanced tree would be harder to maintain.</details>

## Teach-back
**Prompt:** Explain to a junior colleague when you'd use a sparse table, square-root blocks, Mo's algorithm or a skip list, and what each costs.

Rubric:
- [ ] Sparse table: static data, idempotent operations, O(n log n) build, O(1) query
- [ ] Square-root blocks: about √n blocks of about √n, O(√n) per operation, flexible summaries
- [ ] Mo's algorithm: offline, sort by block of l then r, O(n √q) pointer moves
- [ ] Skip list: random levels, expected O(log n), no rebalancing
- [ ] Choose by static or not, online or offline, mergeable or not

<details><summary>Model answer</summary>

If the array never changes and the operation is idempotent, like min, max or gcd, I'd build a sparse table: it stores every power-of-two block in O(n log n) and answers any range with two overlapping blocks in O(1). If there are updates and the operation merges neatly, a Fenwick or segment tree is the default. When the per-block summary is easy but merging is awkward, like counting values ≤ x, I'd cut the array into √n blocks of √n and pay O(√n) per operation, which is very little code. When all queries are known in advance and I can add or remove one element cheaply, like counting distinct values, Mo's algorithm sorts the queries by the block of l and then by r and slides one window across them, about O(n √q) steps in all. And when I need a sorted set I build myself, a skip list gives expected O(log n) search, insert and delete using random levels instead of rotations.

</details>

## Quick Q&A (also in the SRS deck)
- **How fast is a sparse table?** O(n log n) to build, then O(1) per query for idempotent operations such as min, max and gcd.
- **Why must a sparse table's operation be idempotent?** The two blocks of a query overlap, so an element counted twice must not change the answer.
- **Which block size does Mo's algorithm use?** About n / √q (√n when q ≈ n), with queries sorted by block of l, then by r.
- **What does Mo's algorithm need?** Every query in advance, and O(1) add and remove of one element.
- **How does a skip list stay fast without rebalancing?** Each node joins each next level with probability 1/2, giving about log₂ n levels and expected O(log n) steps.
- **What does square-root decomposition cost per operation?** O(√n) with blocks of about √n, times log n if each block is binary searched.

## Practice problems
- [ ] [CSES 1647 · Static Range Minimum Queries](https://cses.fi/problemset/task/1647) · a sparse table with min: O(1) per query
- [ ] [CSES 1649 · Dynamic Range Minimum Queries](https://cses.fi/problemset/task/1649) · updates rule out a sparse table: try √n blocks with a minimum per block, then compare with a segment tree
- [ ] [CSES 1144 · Salary Queries](https://cses.fi/problemset/task/1144) · counts in a value range with updates: sorted √n blocks (code block 2), or compress the values for a Fenwick tree
- [ ] [CSES 1734 · Distinct Values Queries](https://cses.fi/problemset/task/1734) · Mo's algorithm after compressing the values (code block 3); an offline Fenwick tree by last occurrence is faster
- [ ] [LC 1157 · Online Majority Element In Subarray](https://leetcode.com/problems/online-majority-element-in-subarray/) · Hard · the worked example: Boyer–Moore summaries in a segment tree, checked with position lists
- [ ] [LC 1206 · Design Skiplist](https://leetcode.com/problems/design-skiplist/) · Hard · the faded example: random levels and an update array of the last smaller node per level

## Sources (accessed 2026-10-09)
- [cp-algorithms: Sparse table](https://cp-algorithms.com/data_structures/sparse-table.html)
- [cp-algorithms: Sqrt decomposition, with Mo's algorithm](https://cp-algorithms.com/data_structures/sqrt_decomposition.html)
- [Wikipedia: Skip list](https://en.wikipedia.org/wiki/Skip_list)
- [Redis documentation: Sorted sets (implemented with a skip list and a hash table)](https://redis.io/docs/latest/develop/data-types/sorted-sets/)
- [CSES Problem Set (range queries section)](https://cses.fi/problemset/)
