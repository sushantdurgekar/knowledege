---
title: "Range-query structures against brute force"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Range-query structures against brute force

> Data Structures & Algorithms L3 · about 90 min · modules m07, m08, m09

Build the two range-query structures that hard array problems lean on: a Fenwick tree (point add, prefix and range sums, and a binary-lifting search for the first index whose prefix sum reaches a target) and a segment tree with lazy propagation (range add, range sum, range max). Check both against a plain array on random sequences of operations.

## Before you start
- Python 3.12+ and Node.js 22+
- Modules 07, 08 and 09

## Steps
1. Fenwick tree: n + 1 slots, where slot i holds the sum of the `i & -i` values ending at i. Unlike module 08's class, take 0-indexed positions and add 1 inside, so the tests can compare with a plain list. `add` climbs with `i += i & -i`, `prefix(i)` (a[0] + … + a[i]) descends with `i -= i & -i`, and `range_sum(l, r)` is `prefix(r) - prefix(l - 1)`.
2. `lower_bound(target)`: binary lifting from the largest power of two down, stepping right whenever that block still leaves the running sum below the target. It's O(log n), and it needs every value to be non-negative, so that the prefix sums never go down.
3. Lazy segment tree: arrays of size 4n for each node's sum and max, plus a `tag` for an add the node still owes its children. An update that covers a node's whole range changes that node and its tag, and stops there.
4. Before going below a node (in `add` and in `query`), push its tag down to both children; after updating the children in `add`, pull their sums and maxima back up.
5. Test 200 random arrays of up to 40 values, with 30 random steps each: a point add plus prefix, range and lower-bound queries on the Fenwick tree, then a range add and a (sum, max) query on the segment tree, all checked against a plain array.

## Prove it worked
- Both structures match a plain array on 200 random sequences of 30 steps, including arrays of length 1 and negative segment-tree values.
- `lower_bound` returns 0 for a target of 0, and n when even the whole array's sum falls short.
- You can explain why a segment-tree query or update is O(log n): on each level of the tree, at most two nodes are cut by the ends of the range and get split further.

## Break it (then fix it)
- Delete the push in `query` (keep the one in `add`). After `add(0, 3, 5)` on [0, 0, 0, 0], `query(0, 1)` returns (0, 0) instead of (10, 5), because the add still sits in the root's tag, and the random checks fail on every run.
- Put a negative value in the Fenwick tree: for [5, −3, 4], `lower_bound(4)` returns 2, but the first prefix sum to reach 4 is at index 0. Binary lifting assumes the prefix sums never go down; with negative values, descend a segment tree that stores each node's largest prefix sum instead.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random
from itertools import accumulate

class Fenwick:                                  # point add and prefix sums: O(log n) each, n + 1 slots
    def __init__(self, n):
        self.n, self.t = n, [0] * (n + 1)       # 1-indexed inside: t[i] holds the sum of (i - (i & -i), i]

    def add(self, i, delta):                    # a[i] += delta
        i += 1
        while i <= self.n:
            self.t[i] += delta
            i += i & -i                         # the next node whose range covers i

    def prefix(self, i):                        # a[0] + ... + a[i]; prefix(-1) is 0
        i += 1
        total = 0
        while i > 0:
            total += self.t[i]
            i -= i & -i                         # drop the lowest set bit
        return total

    def range_sum(self, l, r):                  # a[l] + ... + a[r]
        return self.prefix(r) - self.prefix(l - 1)

    def lower_bound(self, target):              # smallest i with prefix(i) >= target, else n; needs a[i] >= 0
        pos, rem, step = 0, target, 1 << self.n.bit_length()
        while step:
            if pos + step <= self.n and self.t[pos + step] < rem:
                pos += step                     # the first pos values still fall short of the target
                rem -= self.t[pos]
            step >>= 1
        return pos

class LazySegTree:                              # range add, range sum, range max: O(log n) each
    def __init__(self, values):
        self.n = len(values)
        self.sum, self.max = [0] * (4 * self.n), [0] * (4 * self.n)
        self.tag = [0] * (4 * self.n)           # an add still owed to every element below the node
        self._build(1, 0, self.n - 1, values)

    def _build(self, node, lo, hi, values):
        if lo == hi:
            self.sum[node] = self.max[node] = values[lo]
            return
        mid = (lo + hi) // 2
        self._build(2 * node, lo, mid, values)
        self._build(2 * node + 1, mid + 1, hi, values)
        self._pull(node)

    def _apply(self, node, lo, hi, delta):      # add delta to every element of the node's range
        self.sum[node] += delta * (hi - lo + 1)
        self.max[node] += delta
        self.tag[node] += delta

    def _push(self, node, lo, mid, hi):         # hand the pending add down to both children
        if self.tag[node]:
            self._apply(2 * node, lo, mid, self.tag[node])
            self._apply(2 * node + 1, mid + 1, hi, self.tag[node])
            self.tag[node] = 0

    def _pull(self, node):
        self.sum[node] = self.sum[2 * node] + self.sum[2 * node + 1]
        self.max[node] = max(self.max[2 * node], self.max[2 * node + 1])

    def add(self, l, r, delta, node=1, lo=0, hi=None):   # a[l..r] += delta
        hi = self.n - 1 if hi is None else hi
        if r < lo or hi < l:
            return
        if l <= lo and hi <= r:                 # fully covered: tag the node and stop
            self._apply(node, lo, hi, delta)
            return
        mid = (lo + hi) // 2
        self._push(node, lo, mid, hi)
        self.add(l, r, delta, 2 * node, lo, mid)
        self.add(l, r, delta, 2 * node + 1, mid + 1, hi)
        self._pull(node)

    def query(self, l, r, node=1, lo=0, hi=None):        # (sum, max) of a[l..r]
        hi = self.n - 1 if hi is None else hi
        if r < lo or hi < l:
            return 0, float("-inf")
        if l <= lo and hi <= r:
            return self.sum[node], self.max[node]
        mid = (lo + hi) // 2
        self._push(node, lo, mid, hi)
        s1, m1 = self.query(l, r, 2 * node, lo, mid)
        s2, m2 = self.query(l, r, 2 * node + 1, mid + 1, hi)
        return s1 + s2, max(m1, m2)

for _ in range(200):
    n = random.randint(1, 40)
    a = [random.randint(0, 9) for _ in range(n)]       # Fenwick values stay >= 0
    b = [random.randint(-9, 9) for _ in range(n)]      # segment-tree values can be negative
    fw, st = Fenwick(n), LazySegTree(b)
    for i, x in enumerate(a):
        fw.add(i, x)
    for _ in range(30):                                # a random sequence of updates and queries
        i = random.randrange(n)
        l, r = sorted(random.choices(range(n), k=2))
        delta = random.randint(-a[i], 9)
        fw.add(i, delta)
        a[i] += delta
        pre = list(accumulate(a))
        target = random.randint(0, pre[-1] + 2)
        assert fw.prefix(r) == pre[r] and fw.range_sum(l, r) == sum(a[l:r + 1])
        assert fw.lower_bound(target) == next((k for k in range(n) if pre[k] >= target), n)
        d = random.randint(-9, 9)
        st.add(l, r, d)
        b[l:r + 1] = [x + d for x in b[l:r + 1]]
        ql, qr = sorted(random.choices(range(n), k=2))
        assert st.query(ql, qr) == (sum(b[ql:qr + 1]), max(b[ql:qr + 1]))

values = [3, 1, 4, 1, 5, 9, 2, 6]
fw, st = Fenwick(len(values)), LazySegTree(values)
for i, x in enumerate(values):
    fw.add(i, x)
assert fw.lower_bound(0) == 0 and fw.lower_bound(sum(values) + 1) == len(values)   # n means "never"
st.add(2, 4, 10)                                # now 3 1 14 11 15 9 2 6
print(f"prefix(3) = {fw.prefix(3)} | sum 2..5 = {fw.range_sum(2, 5)} | first prefix >= 10 at {fw.lower_bound(10)}"
      f" | after +10 on 2..4: sum {st.query(0, 7)[0]}, max 0..3 = {st.query(0, 3)[1]}")
```

Output:
```text
prefix(3) = 9 | sum 2..5 = 19 | first prefix >= 10 at 4 | after +10 on 2..4: sum 61, max 0..3 = 14
```

```javascript
const assert = require("node:assert");

class Fenwick {                                 // point add and prefix sums: O(log n) each, n + 1 slots
  constructor(n) {
    this.n = n;
    this.t = new Array(n + 1).fill(0);          // 1-indexed inside: t[i] holds the sum of (i - (i & -i), i]
  }
  add(i, delta) {                               // a[i] += delta
    for (i++; i <= this.n; i += i & -i) this.t[i] += delta;   // the next node whose range covers i
  }
  prefix(i) {                                   // a[0] + ... + a[i]; prefix(-1) is 0
    let total = 0;
    for (i++; i > 0; i -= i & -i) total += this.t[i];         // drop the lowest set bit
    return total;
  }
  rangeSum(l, r) {                              // a[l] + ... + a[r]
    return this.prefix(r) - this.prefix(l - 1);
  }
  lowerBound(target) {                          // smallest i with prefix(i) >= target, else n; needs a[i] >= 0
    let pos = 0, rem = target, step = 1;
    while (step <= this.n) step *= 2;
    for (; step > 0; step >>= 1) {
      if (pos + step <= this.n && this.t[pos + step] < rem) {
        pos += step;                            // the first pos values still fall short of the target
        rem -= this.t[pos];
      }
    }
    return pos;
  }
}

class LazySegTree {                             // range add, range sum, range max: O(log n) each
  constructor(values) {
    this.n = values.length;
    this.sum = new Array(4 * this.n).fill(0);
    this.max = new Array(4 * this.n).fill(0);
    this.tag = new Array(4 * this.n).fill(0);   // an add still owed to every element below the node
    this.build(1, 0, this.n - 1, values);
  }
  build(node, lo, hi, values) {
    if (lo === hi) {
      this.sum[node] = this.max[node] = values[lo];
      return;
    }
    const mid = (lo + hi) >> 1;
    this.build(2 * node, lo, mid, values);
    this.build(2 * node + 1, mid + 1, hi, values);
    this.pull(node);
  }
  apply(node, lo, hi, delta) {                  // add delta to every element of the node's range
    this.sum[node] += delta * (hi - lo + 1);
    this.max[node] += delta;
    this.tag[node] += delta;
  }
  push(node, lo, mid, hi) {                     // hand the pending add down to both children
    if (this.tag[node]) {
      this.apply(2 * node, lo, mid, this.tag[node]);
      this.apply(2 * node + 1, mid + 1, hi, this.tag[node]);
      this.tag[node] = 0;
    }
  }
  pull(node) {
    this.sum[node] = this.sum[2 * node] + this.sum[2 * node + 1];
    this.max[node] = Math.max(this.max[2 * node], this.max[2 * node + 1]);
  }
  add(l, r, delta, node = 1, lo = 0, hi = this.n - 1) {   // a[l..r] += delta
    if (r < lo || hi < l) return;
    if (l <= lo && hi <= r) {                   // fully covered: tag the node and stop
      this.apply(node, lo, hi, delta);
      return;
    }
    const mid = (lo + hi) >> 1;
    this.push(node, lo, mid, hi);
    this.add(l, r, delta, 2 * node, lo, mid);
    this.add(l, r, delta, 2 * node + 1, mid + 1, hi);
    this.pull(node);
  }
  query(l, r, node = 1, lo = 0, hi = this.n - 1) {        // [sum, max] of a[l..r]
    if (r < lo || hi < l) return [0, -Infinity];
    if (l <= lo && hi <= r) return [this.sum[node], this.max[node]];
    const mid = (lo + hi) >> 1;
    this.push(node, lo, mid, hi);
    const [s1, m1] = this.query(l, r, 2 * node, lo, mid);
    const [s2, m2] = this.query(l, r, 2 * node + 1, mid + 1, hi);
    return [s1 + s2, Math.max(m1, m2)];
  }
}

const rnd = k => Math.floor(Math.random() * k);
const pair = n => [rnd(n), rnd(n)].sort((x, y) => x - y);
const total = xs => xs.reduce((x, y) => x + y, 0);
for (let t = 0; t < 200; t++) {
  const n = 1 + rnd(40);
  const a = Array.from({ length: n }, () => rnd(10));       // Fenwick values stay >= 0
  const b = Array.from({ length: n }, () => rnd(19) - 9);   // segment-tree values can be negative
  const fw = new Fenwick(n), st = new LazySegTree(b);
  a.forEach((x, i) => fw.add(i, x));
  for (let step = 0; step < 30; step++) {                   // a random sequence of updates and queries
    const i = rnd(n), [l, r] = pair(n);
    const delta = rnd(a[i] + 10) - a[i];
    fw.add(i, delta);
    a[i] += delta;
    const pre = a.map((_, k) => total(a.slice(0, k + 1)));
    const target = rnd(pre.at(-1) + 3);
    assert.ok(fw.prefix(r) === pre[r] && fw.rangeSum(l, r) === total(a.slice(l, r + 1)));
    const want = pre.findIndex(s => s >= target);
    assert.strictEqual(fw.lowerBound(target), want === -1 ? n : want);
    const d = rnd(19) - 9;
    st.add(l, r, d);
    for (let k = l; k <= r; k++) b[k] += d;
    const [ql, qr] = pair(n), part = b.slice(ql, qr + 1);
    assert.deepStrictEqual(st.query(ql, qr), [total(part), Math.max(...part)]);
  }
}

const values = [3, 1, 4, 1, 5, 9, 2, 6];
const fw = new Fenwick(values.length), st = new LazySegTree(values);
values.forEach((x, i) => fw.add(i, x));
assert.ok(fw.lowerBound(0) === 0 && fw.lowerBound(total(values) + 1) === values.length);   // n means "never"
st.add(2, 4, 10);                               // now 3 1 14 11 15 9 2 6
console.log(`prefix(3) = ${fw.prefix(3)} | sum 2..5 = ${fw.rangeSum(2, 5)} | first prefix >= 10 at ${fw.lowerBound(10)}` +
  ` | after +10 on 2..4: sum ${st.query(0, 7)[0]}, max 0..3 = ${st.query(0, 3)[1]}`);
```

Output:
```text
prefix(3) = 9 | sum 2..5 = 19 | first prefix >= 10 at 4 | after +10 on 2..4: sum 61, max 0..3 = 14
```

</details>
