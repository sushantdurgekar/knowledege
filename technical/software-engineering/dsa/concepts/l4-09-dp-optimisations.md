---
title: "DP optimisations: convex hull trick, divide and conquer, SOS"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l4, dsa-l4-m09]
status: new
created: 2026-10-09
updated: 2026-10-09
sources:
  - url: https://cp-algorithms.com/geometry/convex_hull_trick.html
    accessed: 2026-10-09
  - url: https://cp-algorithms.com/dynamic_programming/divide-and-conquer-dp.html
    accessed: 2026-10-09
  - url: https://cp-algorithms.com/dynamic_programming/knuth-optimization.html
    accessed: 2026-10-09
  - url: https://cp-algorithms.com/algebra/all-submasks.html
    accessed: 2026-10-09
  - url: https://usaco.guide/plat/dp-sos
    accessed: 2026-10-09
---
# DP optimisations: convex hull trick, divide and conquer, SOS

> Data Structures & Algorithms · L4 Expert · Expert technique & teaching · about 120 min · hub module `m09` ([open the hub](https://claude.ai/artifact/DxduaMdo2n5kqrt3We8PPZ))

## Why it matters
Many hard DP problems have an obvious O(n²) or O(n³) solution and a time limit that needs O(n log n). The fix is rarely a new idea about the problem; it's spotting a shape in the transition: a minimum of straight lines, a best split point that only moves right, or a sum over subsets. Recognising those shapes is what separates a working solution from an accepted one.

## Pre-question (answer before reading)
**Q:** dp[i] = min over j < i of (dp[j] + s[i] × f[j]). For a fixed j, how does dp[j] + s[i] × f[j] change as s[i] grows? What picture does that give you for all the j at once?

<details><summary>Answer</summary>

For a fixed j it's a straight line in s[i], with slope f[j] and height dp[j] at s[i] = 0. So all the candidates are lines, and dp[i] is the lowest line at the point s[i]: the lower envelope of a set of lines. Keeping that envelope up to date is the convex hull trick.

</details>

## 🍎 Story time (kid version)
**The toy room and the treasure-map road trip: Tara's cheapest taxi**

Each taxi company in Tara's town charges a starting fee plus a price per mile. For a short trip the company with the lowest starting fee wins; for a long trip, the cheapest per mile. Ben draws every company's price as a straight line on squared paper and colours the lowest line at each distance. Some companies are never the cheapest at any distance, so he crosses them out. Now, for any trip, he just finds the coloured line above that distance.

| In the story | In code |
|---|---|
| A company's fee plus price per mile | A line m_j · x + c_j for one earlier state j |
| The trip's distance | The query point x_i for state i |
| The lowest line at each distance | The lower envelope: min over j, which is dp[i] |
| Crossing out companies that are never cheapest | Removing lines that are never on the envelope |
| Reading the coloured line above a distance | Answering a query in O(1) amortised (sorted) or O(log n) |

**Where the story breaks:** Ben can eyeball where lines cross, but code compares crossing points exactly, by cross-multiplying, because rounding can misorder nearly-parallel lines. And his companies arrive all at once, while in a DP each new line appears only after its own state is solved, so the order of slopes and queries decides which structure to use.

## Key ideas (grown-up version)
- **Find the bottleneck first**: dp[i] = min over j < i of (dp[j] + cost(j, i)) is O(n²) as written. Each optimisation below needs a specific shape in cost(j, i), so expand the cost and look for it before reaching for one.
- **Convex hull trick**: if the candidate for j is linear in a quantity x_i of i, m_j · x_i + c_j, then dp[i] is the lowest of a set of lines at x_i. With slopes added in sorted order and queries sorted too, a deque keeps the lower envelope and every line is added and removed once: O(n) amortised.
- **Exact envelope tests**: a middle line is useless when its outer neighbours cross before it can take over, which is the comparison (c₃ − c₁)(m₁ − m₂) ≤ (c₂ − c₁)(m₁ − m₃), with no division. Products of DP values and slopes can pass 2⁵³, so JavaScript uses BigInt.
- **Li Chao tree**: a segment tree over the x range in which each node keeps the line that's lowest at the node's midpoint, and a new line pushes the loser into the one half where it can still win. Lines in any order and queries anywhere: O(log C) each for a range of size C.
- **Divide and conquer optimisation**: for a layered DP dp_k[i] = min over j < i of dp_(k−1)[j] + C(j, i), if the best j never moves left as i grows, compute the middle i's best j by a scan, then solve the left half with j up to it and the right half with j from it. O(n log n) per layer instead of O(n²); the monotone best j holds when C satisfies the quadrangle inequality, as squared sums of positive numbers do.
- **Knuth's optimisation**: for interval DPs dp[l][r] = min over m of dp[l][m] + dp[m + 1][r] + w(l, r) whose best split points nest, opt[l][r − 1] ≤ opt[l][r] ≤ opt[l + 1][r], scanning only between those bounds totals O(n²) instead of O(n³) (CSES 2088).
- **SOS DP (sum over subsets)**: f[mask] = Σ a[sub] over every sub ⊆ mask. Add one bit at a time: for each bit b, every mask containing b adds f[mask without b]. O(2^b · b) instead of the O(3^b) of enumerating every submask of every mask; superset sums run the same loop the other way.
- **Submask enumeration**: sub = mask, then sub = (sub − 1) & mask until 0 visits every submask of one mask in decreasing order. Over all masks of b bits that's 3^b steps in total, fine for b ≤ about 15, or for a few masks with few bits (LeetCode 1178).

## Diagrams
**Three lines and their lower envelope at x = 0 to 6**

| 3x | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | **0** | **3** | **6** | 9 | 12 | 15 | 18 |

| x + 5 | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | 5 | 6 | 7 | **8** | 9 | 10 | 11 |

| 15 − 2x | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | 15 | 13 | 11 | 9 | **7** | **5** | **3** |

| min | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | 0 | 3 | 6 | 8 | 7 | 5 | 3 |

_The envelope follows 3x up to x = 2.5, then x + 5 until x = 10/3, then 15 − 2x. The slopes fall from line to line, so as the query x moves right, a front line that has been overtaken is dropped for good._

**SOS DP on 3 bits: one pass per bit turns a into subset sums**

| a | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 1 | 2 | 0 | 3 | 1 | 0 | 2 | 1 |

| bit 0 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 1 | **3** | 0 | **3** | 1 | **1** | 2 | **3** |

| bit 1 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 1 | 3 | **1** | **6** | 1 | 1 | **3** | **4** |

| bit 2 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 1 | 3 | 1 | 6 | **2** | **4** | **4** | **10** |

_Columns are masks 0 to 7. Each pass adds, to every mask that has bit b, the value of the same mask without b. At the end f[5] = a[0] + a[1] + a[4] + a[5] = 4, and f[7] = 10 is the total: 3 passes of 8 instead of 27 (mask, submask) pairs._

## Comparisons
**Which DP optimisation?**

| Shape of the transition | Technique | Cost |
|---|---|---|
| min over j of m_j · x_i + c_j, slopes and queries sorted | Convex hull trick with a deque | O(n) amortised |
| The same, in any order | Li Chao tree (or a hull with binary search) | O(n log C) |
| Layered: dp_k[i] = min over j of dp_(k−1)[j] + C(j, i), best j monotone | Divide and conquer | O(k n log n) |
| Interval: dp[l][r] over split points that nest | Knuth's optimisation | O(n²) |
| min over a sliding window of j | Monotonic deque (L3) | O(n) |
| f[mask] = Σ over submasks | SOS DP | O(2^b · b) |

## Code (JavaScript + Python)
### The monotone convex hull trick used by the first example and the quiz (BigInt in JavaScript)
```python
from collections import deque

def bad(l1, l2, l3):                            # slopes m1 > m2 > m3: is l2 never strictly the lowest?
    (m1, c1), (m2, c2), (m3, c3) = l1, l2, l3
    return (c3 - c1) * (m1 - m2) <= (c2 - c1) * (m1 - m3)   # l3 overtakes l1 no later than l2 does

class MonotoneCHT:                              # minimum of lines; slopes added in decreasing order, queries rising
    def __init__(self):
        self.q = deque()

    def add(self, m, c):
        if self.q and self.q[-1][0] == m:       # same slope: keep only the lower line
            if self.q[-1][1] <= c:
                return
            self.q.pop()
        while len(self.q) >= 2 and bad(self.q[-2], self.q[-1], (m, c)):
            self.q.pop()
        self.q.append((m, c))

    def query(self, x):                         # x must not decrease between calls
        q = self.q
        while len(q) >= 2 and q[1][0] * x + q[1][1] <= q[0][0] * x + q[0][1]:
            q.popleft()                         # the front line will never be lowest again
        return q[0][0] * x + q[0][1]
```

```javascript
const bad = ([m1, c1], [m2, c2], [m3, c3]) => (c3 - c1) * (m1 - m2) <= (c2 - c1) * (m1 - m3);   // slopes m1 > m2 > m3

class MonotoneCHT {                             // minimum of lines; slopes added in decreasing order, queries rising
  constructor() { this.q = []; this.head = 0; } // an array used as a deque; every value is a BigInt
  add(m, c) {
    const q = this.q;
    if (q.length > this.head && q[q.length - 1][0] === m) {   // same slope: keep only the lower line
      if (q[q.length - 1][1] <= c) return;
      q.pop();
    }
    while (q.length - this.head >= 2 && bad(q[q.length - 2], q[q.length - 1], [m, c])) q.pop();
    q.push([m, c]);
  }
  query(x) {                                    // x must not decrease between calls
    const q = this.q, val = L => L[0] * x + L[1];
    while (q.length - this.head >= 2 && val(q[this.head + 1]) <= val(q[this.head])) this.head++;   // never lowest again
    return val(q[this.head]);
  }
}
```

### The monotone convex hull trick on CSES 2084 (Monster Game I)
```python
def monster_game(x, s, f):                    # CSES 2084: s rises, and x >= f[0] >= f[1] >= ...
    cht = MonotoneCHT()
    cht.add(x, 0)                             # the start: skill x and no time spent yet
    for i in range(len(s)):
        best = cht.query(s[i])                # min over the last kill j of time[j] + s[i] * f[j]
        if i == len(s) - 1:
            return best                       # the last monster must be killed
        cht.add(f[i], best)                   # killing monster i adds a line with slope f[i]

print(monster_game(100, [20, 30, 30, 50, 90], [90, 60, 20, 20, 10]))
```

Output:
```text
4800
```

- line 3: The start is a line too: slope x, height 0. Every later line has a smaller or equal slope f[i].
- line 5: Queries s[i] never decrease, so a front line that has been overtaken can be dropped for good.
- line 8: Each monster's best time becomes the height of a new line: the DP feeds the hull as it goes.
- line 10: Kill monster 3 (30 × 100 = 3000), then monster 5 (90 × 20 = 1800): 4800.

```javascript
function monsterGame(x, s, f) {               // CSES 2084: s rises, and x >= f[0] >= f[1] >= ...; BigInt throughout
  const cht = new MonotoneCHT();
  cht.add(BigInt(x), 0n);                     // the start: skill x and no time spent yet
  for (let i = 0; i < s.length; i++) {
    const best = cht.query(BigInt(s[i]));     // min over the last kill j of time[j] + s[i] * f[j]
    if (i === s.length - 1) return best;      // the last monster must be killed
    cht.add(BigInt(f[i]), best);              // killing monster i adds a line with slope f[i]
  }
}

console.log(String(monsterGame(100, [20, 30, 30, 50, 90], [90, 60, 20, 20, 10])));
```

Output:
```text
4800
```

- line 3: The start is a line too: slope x, height 0. Every later line has a smaller or equal slope f[i].
- line 5: Queries s[i] never decrease, so a front line that has been overtaken can be dropped for good.
- line 7: Each monster's best time becomes the height of a new line: the DP feeds the hull as it goes.
- line 11: Kill monster 3 (30 × 100 = 3000), then monster 5 (90 × 20 = 1800): 4800.

### A Li Chao tree: lines in any order, queries anywhere
```python
class LiChao:                                 # minimum of lines at integer x in [lo, hi], lines in any order
    def __init__(self, lo, hi):
        self.lo, self.hi, self.node = lo, hi, {}   # node i covers a range; its children are 2i and 2i + 1

    def add(self, m, c):
        line, i, lo, hi = (m, c), 1, self.lo, self.hi
        at = lambda L, x: L[0] * x + L[1]
        while True:
            cur = self.node.get(i)
            if cur is None:
                self.node[i] = line
                return
            mid = (lo + hi) // 2
            if at(line, mid) < at(cur, mid):  # the node keeps whichever line is lower at mid
                self.node[i], line, cur = line, cur, line
            if lo == hi:
                return
            if at(line, lo) < at(cur, lo):    # the other line can only still win on one side
                i, hi = 2 * i, mid
            elif at(line, hi) < at(cur, hi):
                i, lo = 2 * i + 1, mid + 1
            else:
                return

    def query(self, x):                       # walk from the root towards x: O(log(hi - lo))
        i, lo, hi, best = 1, self.lo, self.hi, None
        while i in self.node:
            m, c = self.node[i]
            best = m * x + c if best is None else min(best, m * x + c)
            if lo == hi:
                break
            mid = (lo + hi) // 2
            i, lo, hi = (2 * i, lo, mid) if x <= mid else (2 * i + 1, mid + 1, hi)
        return best

lc = LiChao(-10, 10)
lines, xs = [(2, 3), (-1, 10), (0, 5), (3, -4), (-2, 20)], [-3, 0, 2, 5, 7]
for m, c in lines[:2]:
    lc.add(m, c)
print(*(lc.query(x) for x in xs))
for m, c in lines[2:]:
    lc.add(m, c)
print(*(lc.query(x) for x in xs))
```

Output:
```text
-3 3 7 5 3
-13 -4 2 5 3
```

- line 14: Whichever line is lower at the midpoint stays in this node; the other one is the candidate to push down.
- line 18: Two lines cross at most once. If the pushed line is lower at the left end, the crossing is in the left half, so only that half can need it.
- line 25: A query checks one node per level on the way to x, and the best line for x is on that path.
- line 43: After all five lines, 3x − 4 is lowest at small x and 20 − 2x takes over on the right.

```javascript
class LiChao {                                // minimum of lines at integer x in [lo, hi], lines in any order
  constructor(lo, hi) { this.lo = lo; this.hi = hi; this.node = new Map(); }   // lines are [m, c] BigInt pairs
  add(m, c) {
    let line = [m, c], i = 1, lo = this.lo, hi = this.hi;
    const at = (L, x) => L[0] * BigInt(x) + L[1];
    for (;;) {
      let cur = this.node.get(i);
      if (cur === undefined) { this.node.set(i, line); return; }
      const mid = Math.floor((lo + hi) / 2);
      if (at(line, mid) < at(cur, mid)) { this.node.set(i, line); [line, cur] = [cur, line]; }   // keep the lower at mid
      if (lo === hi) return;
      if (at(line, lo) < at(cur, lo)) { i = 2 * i; hi = mid; }   // the other line can only still win on one side
      else if (at(line, hi) < at(cur, hi)) { i = 2 * i + 1; lo = mid + 1; }
      else return;
    }
  }
  query(x) {                                  // walk from the root towards x: O(log(hi - lo))
    let i = 1, lo = this.lo, hi = this.hi, best = null;
    while (this.node.has(i)) {
      const [m, c] = this.node.get(i), v = m * BigInt(x) + c;
      if (best === null || v < best) best = v;
      if (lo === hi) break;
      const mid = Math.floor((lo + hi) / 2);
      if (x <= mid) { i = 2 * i; hi = mid; } else { i = 2 * i + 1; lo = mid + 1; }
    }
    return best;
  }
}

const lc = new LiChao(-10, 10);
const lines = [[2, 3], [-1, 10], [0, 5], [3, -4], [-2, 20]], xs = [-3, 0, 2, 5, 7];
for (const [m, c] of lines.slice(0, 2)) lc.add(BigInt(m), BigInt(c));
console.log(...xs.map(x => String(lc.query(x))));
for (const [m, c] of lines.slice(2)) lc.add(BigInt(m), BigInt(c));
console.log(...xs.map(x => String(lc.query(x))));
```

Output:
```text
-3 3 7 5 3
-13 -4 2 5 3
```

- line 10: Whichever line is lower at the midpoint stays in this node; the other one is the candidate to push down.
- line 12: Two lines cross at most once. If the pushed line is lower at the left end, the crossing is in the left half, so only that half can need it.
- line 17: A query checks one node per level on the way to x, and the best line for x is on that path.
- line 35: After all five lines, 3x − 4 is lowest at small x and 20 − 2x takes over on the right.

### SOS DP: subset and superset counts for every mask (CSES 1654)
```python
def sos_counts(values, bits):                 # per mask: how many values are subsets of it, and supersets
    sub = [0] * (1 << bits)
    for v in values:
        sub[v] += 1
    sup = sub[:]
    for b in range(bits):                     # one bit at a time: O(2^bits * bits)
        for mask in range(1 << bits):
            if mask >> b & 1:
                sub[mask] += sub[mask ^ (1 << b)]   # the subsets of mask that lack bit b
            else:
                sup[mask] += sup[mask | (1 << b)]   # the supersets of mask that have bit b
    return sub, sup

vals = [3, 7, 2, 9, 2]                        # CSES 1654's sample
sub, sup = sos_counts(vals, 4)
full = (1 << 4) - 1
for x in vals:                                # y inside x, y containing x, y sharing a bit with x
    print(sub[x], sup[x], len(vals) - sub[full ^ x])
```

Output:
```text
3 2 5
4 1 5
2 4 4
1 1 3
2 4 4
```

- line 9: After the passes for bits 0..b, sub[mask] counts the values that match mask outside those bits and fit inside it on them.
- line 11: Supersets run the same loop the other way: a mask without bit b collects the counts of the mask with it.
- line 18: x and y share a bit unless y fits inside the complement of x, so subtract those from n.

```javascript
function sosCounts(values, bits) {            // per mask: how many values are subsets of it, and supersets
  const sub = new Array(1 << bits).fill(0);
  for (const v of values) sub[v]++;
  const sup = [...sub];
  for (let b = 0; b < bits; b++) {            // one bit at a time: O(2^bits * bits)
    for (let mask = 0; mask < 1 << bits; mask++) {
      if ((mask >> b) & 1) sub[mask] += sub[mask ^ (1 << b)];   // the subsets of mask that lack bit b
      else sup[mask] += sup[mask | (1 << b)];  // the supersets of mask that have bit b
    }
  }
  return [sub, sup];
}

const vals = [3, 7, 2, 9, 2];                 // CSES 1654's sample
const [sub, sup] = sosCounts(vals, 4), full = (1 << 4) - 1;
for (const x of vals) console.log(sub[x], sup[x], vals.length - sub[full ^ x]);   // inside x, containing x, sharing a bit
```

Output:
```text
3 2 5
4 1 5
2 4 4
1 1 3
2 4 4
```

- line 7: After the passes for bits 0..b, sub[mask] counts the values that match mask outside those bits and fit inside it on them.
- line 8: Supersets run the same loop the other way: a mask without bit b collects the counts of the mask with it.
- line 16: x and y share a bit unless y fits inside the complement of x, so subtract those from n.

## Worked example
**Problem.** Split an array of n positive numbers into k contiguous parts so that the sum of the squares of the parts' sums is as small as possible (n ≤ 3000). (CSES 2086, Subarray Squares)

1. With prefix sums P, dp_c[i] = min over j < i of dp_(c−1)[j] + (P[i] − P[j])²: the best way to cut the first i numbers into c parts. Done plainly, that's O(k n²), about 2.7 × 10¹⁰ steps.
2. For positive numbers, the best last cut j never moves left as i grows: a longer prefix never wants a shorter last part. So the best j's of one layer are sorted.
3. Divide and conquer: find the middle i's best j by scanning its allowed window, then the left half only needs j up to that point and the right half only from it. Each recursion level scans O(n) values in total, and there are O(log n) levels.
4. O(k n log n) time and O(n) space per layer. A convex hull trick also works here, since the cost expands into lines in P[j].

```python
def subarray_squares(a, k):                   # CSES 2086: k parts, least sum of squared part sums
    n = len(a)
    P = [0] * (n + 1)
    for i, v in enumerate(a):
        P[i + 1] = P[i] + v
    INF = float("inf")
    prev = [0] + [INF] * n                    # 0 parts: only the empty prefix costs nothing
    for _ in range(k):
        cur = [INF] * (n + 1)
        stack = [(1, n, 0, n - 1)]            # fill cur[lo..hi], knowing their best j lies in [opt_lo, opt_hi]
        while stack:
            lo, hi, opt_lo, opt_hi = stack.pop()
            if lo > hi:
                continue
            mid = (lo + hi) // 2
            best, arg = INF, opt_lo
            for j in range(opt_lo, min(mid - 1, opt_hi) + 1):
                v = prev[j] + (P[mid] - P[j]) ** 2
                if v < best:
                    best, arg = v, j
            cur[mid] = best
            stack += [(lo, mid - 1, opt_lo, arg), (mid + 1, hi, arg, opt_hi)]   # the best j only moves right
        prev = cur
    return prev[n]

print(subarray_squares([2, 3, 1, 2, 2, 3, 4, 1], 3), subarray_squares([5, 5, 5, 5], 2), subarray_squares([1] * 2000, 10))
```

Output:
```text
110 200 400000
```

```javascript
function subarraySquares(a, k) {              // CSES 2086; BigInt, since squared sums can pass 2^53
  const n = a.length, P = [0n];
  for (const v of a) P.push(P[P.length - 1] + BigInt(v));
  const INF = 1n << 62n;
  let prev = [0n, ...new Array(n).fill(INF)]; // 0 parts: only the empty prefix costs nothing
  for (let layer = 0; layer < k; layer++) {
    const cur = new Array(n + 1).fill(INF);
    const stack = [[1, n, 0, n - 1]];         // fill cur[lo..hi], knowing their best j lies in [optLo, optHi]
    while (stack.length) {
      const [lo, hi, optLo, optHi] = stack.pop();
      if (lo > hi) continue;
      const mid = (lo + hi) >> 1;
      let best = INF, arg = optLo;
      for (let j = optLo; j <= Math.min(mid - 1, optHi); j++) {
        const v = prev[j] + (P[mid] - P[j]) ** 2n;
        if (v < best) { best = v; arg = j; }
      }
      cur[mid] = best;
      stack.push([lo, mid - 1, optLo, arg], [mid + 1, hi, arg, optHi]);   // the best j only moves right
    }
    prev = cur;
  }
  return prev[n];
}

console.log(String(subarraySquares([2, 3, 1, 2, 2, 3, 4, 1], 3)), String(subarraySquares([5, 5, 5, 5], 2)), String(subarraySquares(new Array(2000).fill(1), 10)));
```

Output:
```text
110 200 400000
```

**Answer.** 110, 200 and 400,000. CSES's sample splits into [2, 3, 1], [2, 2, 3], [4, 1] with sums 6, 7 and 5: 36 + 49 + 25 = 110. Four 5s in two parts are best as 10 and 10, and 2,000 ones in ten parts as ten parts of 200.

## Your turn (faded example)
**Problem.** A word is valid for a 7-letter puzzle (all letters different) if it contains the puzzle's first letter and every letter of the word appears in the puzzle. For each puzzle, count the valid words among up to 10⁵ words. (LeetCode 1178, Number of Valid Words for Each Puzzle)

- ✓ A word matters only through its set of letters: a 26-bit mask. Count how many words have each mask.
- **Which masks can a valid word have for one puzzle?**
  <details><summary>Answer</summary>The first letter's bit plus any subset of the other six letters: only 2⁶ = 64 masks per puzzle.</details>
- **How do you visit every subset of a mask?**
  <details><summary>Answer</summary>Start at sub = rest and step sub = (sub − 1) & rest until you reach 0, visiting 0 too: that walks every submask in decreasing order.</details>
- **Time and space?**
  <details><summary>Answer</summary>O(total letters in the words) to build the counts, then 64 lookups per puzzle: O(W · L + 64 P) time and O(W) space for the counter.</details>

Starter:
```python
from collections import Counter

def find_num_of_valid_words(words, puzzles):
    count = Counter()
    for w in words:
        m = 0
        for ch in w:
            m |= 1 << (ord(ch) - 97)
        count[m] += 1                         # words with the same set of letters share one mask
    ...                                       # TODO: per puzzle, add count[first | sub] over every sub of the other letters
```

```javascript
function findNumOfValidWords(words, puzzles) {
  const count = new Map();
  for (const w of words) {
    let m = 0;
    for (const ch of w) m |= 1 << (ch.charCodeAt(0) - 97);
    count.set(m, (count.get(m) || 0) + 1);    // words with the same set of letters share one mask
  }
  // TODO: per puzzle, add count[first | sub] over every sub of the other letters
}
```

<details><summary>Full solution</summary>

```python
from collections import Counter

def find_num_of_valid_words(words, puzzles):
    count = Counter()
    for w in words:
        m = 0
        for ch in w:
            m |= 1 << (ord(ch) - 97)
        count[m] += 1                         # words with the same set of letters share one mask
    out = []
    for p in puzzles:
        first, rest = 1 << (ord(p[0]) - 97), 0
        for ch in p[1:]:
            rest |= 1 << (ord(ch) - 97)
        total, sub = 0, rest
        while True:                           # every subset of the other six letters
            total += count[first | sub]
            if sub == 0:
                break
            sub = (sub - 1) & rest
        out.append(total)
    return out

print(*find_num_of_valid_words(["aaaa", "asas", "able", "ability", "actt", "actor", "access"],
                               ["aboveyz", "abrodyz", "abslute", "absoryz", "actresz", "gaswxyz"]))
print(*find_num_of_valid_words(["apple", "pleas", "please"], ["aelwxyz", "aelpxyz", "aelpsxy", "saelpxy", "xaelpsy"]))
```

Output:
```text
1 1 3 2 4 0
0 1 3 2 0
```

```javascript
function findNumOfValidWords(words, puzzles) {
  const count = new Map();
  for (const w of words) {
    let m = 0;
    for (const ch of w) m |= 1 << (ch.charCodeAt(0) - 97);
    count.set(m, (count.get(m) || 0) + 1);    // words with the same set of letters share one mask
  }
  return puzzles.map(p => {
    const first = 1 << (p.charCodeAt(0) - 97);
    let rest = 0;
    for (const ch of p.slice(1)) rest |= 1 << (ch.charCodeAt(0) - 97);
    let total = 0;
    for (let sub = rest; ; sub = (sub - 1) & rest) {   // every subset of the other six letters
      total += count.get(first | sub) || 0;
      if (sub === 0) break;
    }
    return total;
  });
}

console.log(...findNumOfValidWords(["aaaa", "asas", "able", "ability", "actt", "actor", "access"],
  ["aboveyz", "abrodyz", "abslute", "absoryz", "actresz", "gaswxyz"]));
console.log(...findNumOfValidWords(["apple", "pleas", "please"], ["aelwxyz", "aelpxyz", "aelpsxy", "saelpxy", "xaelpsy"]));
```

Output:
```text
1 1 3 2 4 0
0 1 3 2 0
```

</details>

## Socratic checks and quiz (answers hidden)
**1. What does this print? (`MonotoneCHT` is this module's helper; in JavaScript its values are BigInts.)**

```python
cht = MonotoneCHT()
for m, c in [(3, 0), (1, 4), (-1, 12)]:     # slopes in decreasing order
    cht.add(m, c)
print(*(cht.query(x) for x in [0, 2, 3, 5, 9]))
```

```javascript
const cht = new MonotoneCHT();
for (const [m, c] of [[3n, 0n], [1n, 4n], [-1n, 12n]]) cht.add(m, c);   // slopes in decreasing order
console.log(...[0n, 2n, 3n, 5n, 9n].map(x => String(cht.query(x))));
```

- A. 0 6 7 7 3
- B. 0 6 9 7 3
- C. 0 4 7 7 3
- D. 0 6 7 9 3

<details><summary>Answer</summary>

0 6 7 7 3. At x = 0 the lines give 0, 4 and 12; at 2: 6, 6 and 10; at 3: 9, 7 and 9; at 5: 15, 9 and 7; at 9: 27, 13 and 3. The minimum at each point is 0, 6, 7, 7 and 3.

</details>

**2. What does this print?**

```python
mask, out, sub = 0b101, [], 0b101
while True:
    out.append(sub)
    if sub == 0:
        break
    sub = (sub - 1) & mask
print(*out)
```

```javascript
const mask = 0b101, out = [];
for (let sub = mask; ; sub = (sub - 1) & mask) {
  out.push(sub);
  if (sub === 0) break;
}
console.log(...out);
```

- A. 5 4 1 0
- B. 5 4 3 2 1 0
- C. 0 1 4 5
- D. 5 1 4 0

<details><summary>Answer</summary>

5 4 1 0. (sub − 1) & mask jumps to the next smaller submask: 5 (101), 4 (100), 1 (001), then 0. Numbers like 3 or 2 aren't submasks of 101, so they never appear.

</details>

**3. When does the divide and conquer optimisation apply to dp[i] = min over j < i of (prev[j] + C(j, i))?**

- A. When the best j for i never decreases as i increases (opt(i) ≤ opt(i + 1))
- B. Whenever C(j, i) is positive
- C. Only when the DP has a single layer
- D. When n is a power of two

<details><summary>Answer</summary>

When the best j for i never decreases as i increases (opt(i) ≤ opt(i + 1)). The method relies on each half's best j being on one side of the middle's best j. Positive costs alone don't guarantee that, the number of layers doesn't matter, and n can be anything.

</details>

**4. Which statements are true? (choose 2)**

- A. The convex hull trick needs each candidate to be a linear function of some quantity of i
- B. SOS DP finds, for every mask, the sum over its subsets in O(2^b · b)
- C. A Li Chao tree needs its lines inserted in order of slope
- D. Knuth's optimisation turns every O(n³) interval DP into O(n²)
- E. Enumerating the submasks of every b-bit mask takes O(2^b) steps in total

<details><summary>Answer</summary>

The convex hull trick needs each candidate to be a linear function of some quantity of i, SOS DP finds, for every mask, the sum over its subsets in O(2^b · b). Lines in i and one-bit-at-a-time subset sums are the two true statements. A Li Chao tree takes lines in any order, Knuth needs nested split points, and enumerating all submasks of all masks is 3^b.

</details>

**5. Judge each statement.**

- With slopes added in decreasing order and rising queries, each line enters and leaves the deque at most once.
- Over all masks of b bits, there are 3^b (mask, submask) pairs.
- A Li Chao tree answers a query in O(1).
- The divide and conquer optimisation cuts one layer from O(n²) to O(n log n).

<details><summary>Answer</summary>

With slopes added in decreasing order and rising queries, each line enters and leaves the deque at most once.: Yes; Over all masks of b bits, there are 3^b (mask, submask) pairs.: Yes; A Li Chao tree answers a query in O(1).: No; The divide and conquer optimisation cuts one layer from O(n²) to O(n log n).: Yes. That's why the deque is O(n) amortised. Each bit is in neither, the mask only, or both. A Li Chao query walks one root-to-leaf path, O(log C). And divide and conquer scans O(n) per recursion level over O(log n) levels.

</details>

**6. Put the steps of one layer of the divide and conquer optimisation in order.**

- (put the steps in order)

<details><summary>Answer</summary>

Finish the previous layer's values prev[0..n] → Take the middle index mid of the current range → Scan j in the allowed window to find mid's best split, opt → Solve both halves, the left with j ≤ opt and the right with j ≥ opt. Each value of this layer needs the previous layer, the halves need mid's best split, and that split needs the scan.

</details>

**7. Complete the Python SOS DP that computes f[mask] = Σ a[sub] over every sub ⊆ mask.**

```
def subset_sums(a, bits):
    f = a[:]
    for b in range(bits):
        for mask in range(1 << bits):
            if {{0}}:
                f[mask] += f[{{1}}]
    return f

```

<details><summary>Answer</summary>

mask >> b & 1 | mask ^ (1 << b). A mask that has bit b adds the value of the same mask without b. Using masks without b and adding mask | (1 << b) gives superset sums instead.

</details>

**8. Match each transition to the technique that speeds it up.**


<details><summary>Answer</summary>

dp[i] = min over j of m_j · x_i + c_j, slopes and queries sorted = The convex hull trick with a deque; Lines added in any order, queries anywhere = A Li Chao tree; A layered DP where the best split moves right as i grows = The divide and conquer optimisation; For every mask, a sum over all its subsets = SOS DP, one bit at a time. Sorted lines suit the deque, unsorted ones the Li Chao tree, monotone splits divide and conquer, and subset sums SOS DP. Floyd–Warshall computes all-pairs shortest paths.

</details>

## Traps & misconceptions
- **“The convex hull trick speeds up any O(n²) DP.”** Only when the transition is a minimum or maximum of linear functions: dp[j] + cost(j, i) must split into (something of j) × (something of i) + (something of j). Expand the cost and check first.
- **“Comparing crossing points with division is fine.”** Floating-point crossing points can misorder nearly-parallel lines. Compare fractions by cross-multiplying, in exact integers (BigInt in JavaScript once products pass 2⁵³).
- **“A Li Chao tree needs its lines sorted by slope.”** It takes lines in any order and queries anywhere in its range, at O(log C) each. Sorted slopes are what the deque needs, and sorted queries too for O(1) amortised queries.
- **“The divide and conquer optimisation works for every layered DP.”** It needs the best split point to move one way only (opt(i) ≤ opt(i + 1)), which follows from the quadrangle inequality, as for squared sums of positive numbers. Check it against a brute force before trusting it.
- **“Enumerating the submasks of every mask is 2^b × 2^b work.”** Each bit is either in neither, in the mask only, or in both, so the total is 3^b steps; SOS DP gets the sums in 2^b · b.
- **“DP values always fit in a JavaScript Number.”** Monster Game times reach about 2 × 10¹⁷ and squared sums about 9 × 10¹⁶, past 2⁵³. Use BigInt in JavaScript; Python's integers are exact.

## Discussion prompts
- **Why can a line that's never lowest be removed for good?**
  <details><summary>One good answer</summary>With slopes decreasing, each newer line beats the older ones for large enough x. If the newest line overtakes the second-to-last before that one ever overtakes the line before it, the middle line is never below both neighbours anywhere, so it can never be the answer again. That's one cross-multiplied comparison, and each line is added and removed at most once.</details>
- **How do you choose between these optimisations?**
  <details><summary>One good answer</summary>Write the plain DP and a brute force first. Then read the transition: linear in some quantity of i means the convex hull trick (a deque if slopes and queries are sorted, a Li Chao tree otherwise); a layered minimum with a monotone best split means divide and conquer; an interval DP whose split points nest means Knuth; sums over submasks mean SOS DP. Confirm the speed-up against the slow version on random tests (module 10).</details>

## Teach-back
**Prompt:** Explain to a junior colleague when the convex hull trick, the divide and conquer optimisation and SOS DP apply, and what each one costs.

Rubric:
- [ ] Convex hull trick: dp[i] is the lowest of lines at x_i; deque O(n) when sorted, Li Chao O(log C) otherwise
- [ ] Crossing points are compared exactly, by cross-multiplying
- [ ] Divide and conquer: a monotone best split gives O(n log n) per layer
- [ ] SOS DP: subset sums in O(2^b · b), not O(3^b)
- [ ] Always check the faster version against a slow brute force

<details><summary>Model answer</summary>

I start by writing the slow DP and looking at its transition. If the candidate for each earlier state j is a straight line in some quantity of i, like dp[j] + s[i] × f[j], then dp[i] is the lowest line at s[i], and I keep the lower envelope: with sorted slopes and sorted queries a deque does it in O(n) amortised, otherwise a Li Chao tree does each insert and query in O(log C), and I compare crossing points by cross-multiplying so nothing is rounded. If the DP has layers and the best split point only moves right as i grows, I use divide and conquer: solve the middle i by a scan, then each half only searches its side of that split, for O(n log n) per layer. For sums over all subsets of every mask, SOS DP adds one bit at a time in O(2^b · b) instead of enumerating every submask. Whatever I pick, I test it against the slow version on random inputs before trusting it.

</details>

## Quick Q&A (also in the SRS deck)
- **When does the convex hull trick apply?** When dp[i] is a minimum (or maximum) over j of linear functions m_j · x_i + c_j.
- **What does a Li Chao tree cost?** O(log C) per line insert and per query, with lines in any order.
- **What does the divide and conquer optimisation need?** A monotone best split point: opt(i) ≤ opt(i + 1).
- **How fast is SOS DP?** O(2^b · b) for all masks of b bits.
- **How many (mask, submask) pairs are there over b bits?** 3^b.
- **How do you step through the submasks of mask?** sub = mask, then sub = (sub − 1) & mask until 0 (visiting 0 too).

## Practice problems
- [ ] [LC 1235 · Maximum Profit in Job Scheduling](https://leetcode.com/problems/maximum-profit-in-job-scheduling/) · Hard · sort jobs by end time; a DP over jobs with a binary search for the last one that fits: O(n log n) instead of O(n²)
- [ ] [LC 1178 · Number of Valid Words for Each Puzzle](https://leetcode.com/problems/number-of-valid-words-for-each-puzzle/) · Hard · the faded example: count word masks, then walk the 64 submasks of each puzzle's other six letters
- [ ] [CSES 2084 · Monster Game I](https://cses.fi/problemset/task/2084) · the monotone convex hull trick: slopes f fall and queries s rise (code block 1)
- [ ] [CSES 2085 · Monster Game II](https://cses.fi/problemset/task/2085) · the same DP without the ordering: a Li Chao tree over the strengths (code block 2)
- [ ] [CSES 2086 · Subarray Squares](https://cses.fi/problemset/task/2086) · the worked example: divide and conquer per layer
- [ ] [CSES 2087 · Houses and Schools](https://cses.fi/problemset/task/2087) · divide and conquer again; first precompute the cost of serving a range of houses from one school
- [ ] [CSES 2088 · Knuth Division](https://cses.fi/problemset/task/2088) · Knuth's optimisation: the best split of [l, r] lies between those of [l, r − 1] and [l + 1, r], O(n²) in total
- [ ] [CSES 1654 · SOS Bit Problem](https://cses.fi/problemset/task/1654) · code block 3: subset and superset counts over 20 bits

## Sources (accessed 2026-10-09)
- [cp-algorithms: Convex hull trick and Li Chao tree](https://cp-algorithms.com/geometry/convex_hull_trick.html)
- [cp-algorithms: Divide and conquer DP](https://cp-algorithms.com/dynamic_programming/divide-and-conquer-dp.html)
- [cp-algorithms: Knuth's optimization](https://cp-algorithms.com/dynamic_programming/knuth-optimization.html)
- [cp-algorithms: Enumerating submasks of a bitmask](https://cp-algorithms.com/algebra/all-submasks.html)
- [USACO Guide: Sum over subsets DP](https://usaco.guide/plat/dp-sos)
