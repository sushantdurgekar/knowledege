---
title: "Suffix array toolkit with O(1) LCP queries"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l4, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Suffix array toolkit with O(1) LCP queries

> Data Structures & Algorithms L4 · about 90 min · modules m05, m06

Build the suffix array and LCP array, answer distinct-substring, longest-repeat, pattern and k-th-substring questions, and add a sparse table so that the common prefix of any two suffixes is an O(1) range minimum.

## Before you start
- Python 3.12+ and Node.js 22+
- Modules 05 and 06

## Steps
1. `suffix_array(s)` by prefix doubling: sort by (rank, rank k places later), re-rank, double k, stop when every rank differs.
2. `lcp_array(s, sa)` by Kasai: visit suffixes in text order and start each comparison from the previous match length minus 1.
3. `find_all(s, sa, p)` with two binary searches, and `kth_distinct(s, k)` by walking the suffix array (suffix sa[i] adds n − sa[i] − lcp[i] new substrings).
4. `lcp_of(i, j)`: a sparse table over the LCP array; the common prefix of suffixes i and j is the minimum of lcp between their ranks.
5. Tests: 300 random strings against sorting every suffix, the set of all substrings and direct comparisons, plus “a” × 20,000, the worst case for doubling.

## Prove it worked
- The suffix array equals the brute-force sort of every suffix, and n(n + 1)/2 − Σ lcp equals the number of distinct substrings.
- lcp_of(i, j) matches a direct comparison for every pair of suffixes.
- find_all and kth_distinct match brute force on every random string.

## Break it (then fix it)
- Replace the doubling with a plain sort of suffix strings and time both on “a” × 20,000. Explain the difference with the cost of one comparison.
- In Kasai, reset h to 0 for every suffix. The answers stay right; measure how much slower it gets on “a” × 20,000 and say why.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
def suffix_array(s):                            # s: a str, or a list of non-negative ints
    n = len(s)
    if n == 0:
        return []
    rank = [ord(c) for c in s] if isinstance(s, str) else list(s)
    sa, k = list(range(n)), 1
    while True:
        key = lambda i: (rank[i], rank[i + k] if i + k < n else -1)   # (first k items, next k items)
        sa.sort(key=key)
        new = [0] * n
        for j in range(1, n):
            new[sa[j]] = new[sa[j - 1]] + (key(sa[j]) != key(sa[j - 1]))
        rank = new                              # ranks now describe the first 2k items
        if rank[sa[-1]] == n - 1:               # every rank differs: fully sorted
            return sa
        k *= 2

def lcp_array(s, sa):                           # Kasai: lcp[i] = LCP of suffixes sa[i - 1] and sa[i]; lcp[0] = 0
    n = len(s)
    rank = [0] * n
    for i, p in enumerate(sa):
        rank[p] = i
    lcp, h = [0] * n, 0
    for p in range(n):                          # suffixes in text order, so h falls by at most 1 per step
        if rank[p] == 0:
            h = 0
            continue
        q = sa[rank[p] - 1]                     # the suffix just before p in sorted order
        while p + h < n and q + h < n and s[p + h] == s[q + h]:
            h += 1
        lcp[rank[p]] = h
        h = max(h - 1, 0)
    return lcp

def find_all(s, sa, p):                         # every start of p in s, in O(|p| log n)
    def first(strict):                          # the first suffix whose first |p| letters are >= p (> p if strict)
        lo, hi = 0, len(sa)
        while lo < hi:
            mid = (lo + hi) // 2
            head = s[sa[mid]:sa[mid] + len(p)]
            if head < p or (strict and head == p):
                lo = mid + 1
            else:
                hi = mid
        return lo
    return sorted(sa[first(False):first(True)])

def kth_distinct(s, k):                         # the k-th smallest distinct substring (k from 1)
    sa = suffix_array(s)
    lcp = lcp_array(s, sa)
    for i, p in enumerate(sa):
        new = len(s) - p - lcp[i]               # prefixes of this suffix not seen in an earlier one
        if k <= new:
            return s[p:p + lcp[i] + k]
        k -= new
    return ""                                   # fewer than k distinct substrings

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
import random
random.seed(4)

def lcp_tools(s):                                 # the LCP of any two suffixes as an O(1) range minimum
    sa = suffix_array(s)
    lcp = lcp_array(s, sa)
    rank = [0] * len(s)
    for i, p in enumerate(sa):
        rank[p] = i
    table = SparseTable(lcp, min) if s else None
    def lcp_of(i, j):
        if i == j:
            return len(s) - i
        a, b = sorted((rank[i], rank[j]))
        return table.query(a + 1, b)              # the minimum of the lcp values between the two ranks
    return sa, lcp, lcp_of

for _ in range(300):
    s = "".join(random.choice("ab" if random.random() < 0.5 else "abc") for _ in range(random.randint(1, 14)))
    n = len(s)
    sa, lcp, lcp_of = lcp_tools(s)
    assert sa == sorted(range(n), key=lambda i: s[i:])
    subs = sorted({s[i:j] for i in range(n) for j in range(i + 1, n + 1)})
    assert n * (n + 1) // 2 - sum(lcp) == len(subs)
    for i in range(n):
        for j in range(n):
            h = 0
            while i + h < n and j + h < n and s[i + h] == s[j + h]:
                h += 1
            assert lcp_of(i, j) == h
    for k in range(1, len(subs) + 1):
        assert kth_distinct(s, k) == subs[k - 1]
    p = "".join(random.choice("abc") for _ in range(random.randint(1, 3)))
    assert find_all(s, sa, p) == [i for i in range(n) if s.startswith(p, i)]

big = "a" * 20_000
sa, lcp, lcp_of = lcp_tools(big)
print("suffix arrays: 300 strings ok | a * 20000:", len(big) * (len(big) + 1) // 2 - sum(lcp), "distinct substrings, longest repeat", max(lcp), "| lcp_of(0, 1) =", lcp_of(0, 1))
```

Output:
```text
suffix arrays: 300 strings ok | a * 20000: 20000 distinct substrings, longest repeat 19999 | lcp_of(0, 1) = 19999
```

```javascript
function suffixArray(s) {                       // s: a string, or an array of non-negative integers
  const n = s.length;
  if (n === 0) return [];
  let rank = typeof s === "string" ? Array.from({ length: n }, (_, i) => s.charCodeAt(i)) : [...s];
  const sa = [...Array(n).keys()];
  for (let k = 1; ; k *= 2) {
    const second = i => (i + k < n ? rank[i + k] : -1);
    const cmp = (a, b) => rank[a] - rank[b] || second(a) - second(b);   // (first k items, next k items)
    sa.sort(cmp);
    const next = new Array(n).fill(0);
    for (let j = 1; j < n; j++) next[sa[j]] = next[sa[j - 1]] + (cmp(sa[j - 1], sa[j]) < 0 ? 1 : 0);
    rank = next;                                // ranks now describe the first 2k items
    if (rank[sa[n - 1]] === n - 1) return sa;   // every rank differs: fully sorted
  }
}

function lcpArray(s, sa) {                      // Kasai: lcp[i] = LCP of suffixes sa[i - 1] and sa[i]; lcp[0] = 0
  const n = s.length, rank = new Array(n).fill(0), lcp = new Array(n).fill(0);
  sa.forEach((p, i) => { rank[p] = i; });
  let h = 0;
  for (let p = 0; p < n; p++) {                 // suffixes in text order, so h falls by at most 1 per step
    if (rank[p] === 0) { h = 0; continue; }
    const q = sa[rank[p] - 1];                  // the suffix just before p in sorted order
    while (p + h < n && q + h < n && s[p + h] === s[q + h]) h++;
    lcp[rank[p]] = h;
    h = Math.max(h - 1, 0);
  }
  return lcp;
}

function findAll(s, sa, p) {                    // every start of p in s, in O(|p| log n)
  const first = strict => {                     // the first suffix whose first |p| letters are >= p (> p if strict)
    let lo = 0, hi = sa.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1, head = s.slice(sa[mid], sa[mid] + p.length);
      if (head < p || (strict && head === p)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return sa.slice(first(false), first(true)).sort((a, b) => a - b);
}

function kthDistinct(s, k) {                    // the k-th smallest distinct substring (k from 1)
  const sa = suffixArray(s), lcp = lcpArray(s, sa);
  for (let i = 0; i < sa.length; i++) {
    const fresh = s.length - sa[i] - lcp[i];    // prefixes of this suffix not seen in an earlier one
    if (k <= fresh) return s.slice(sa[i], sa[i] + lcp[i] + k);
    k -= fresh;
  }
  return "";                                    // fewer than k distinct substrings
}

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
const assert = require("node:assert");

function lcpTools(s) {                            // the LCP of any two suffixes as an O(1) range minimum
  const sa = suffixArray(s), lcp = lcpArray(s, sa), rank = new Array(s.length).fill(0);
  sa.forEach((p, i) => { rank[p] = i; });
  const table = s.length ? new SparseTable(lcp, Math.min) : null;
  const lcpOf = (i, j) => {
    if (i === j) return s.length - i;
    const a = Math.min(rank[i], rank[j]), b = Math.max(rank[i], rank[j]);
    return table.query(a + 1, b);                 // the minimum of the lcp values between the two ranks
  };
  return [sa, lcp, lcpOf];
}

for (let r = 0; r < 300; r++) {
  const al = Math.random() < 0.5 ? "ab" : "abc";
  let s = "";
  for (let i = 0, n = 1 + Math.floor(Math.random() * 14); i < n; i++) s += al[Math.floor(Math.random() * al.length)];
  const n = s.length, [sa, lcp, lcpOf] = lcpTools(s);
  assert.deepStrictEqual(sa, [...Array(n).keys()].sort((a, b) => (s.slice(a) < s.slice(b) ? -1 : 1)));
  const set = new Set();
  for (let i = 0; i < n; i++) for (let j = i + 1; j <= n; j++) set.add(s.slice(i, j));
  const subs = [...set].sort((a, b) => (a < b ? -1 : 1));
  assert.strictEqual(n * (n + 1) / 2 - lcp.reduce((a, b) => a + b, 0), subs.length);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let h = 0;
    while (i + h < n && j + h < n && s[i + h] === s[j + h]) h++;
    assert.strictEqual(lcpOf(i, j), h);
  }
  subs.forEach((sub, k) => assert.strictEqual(kthDistinct(s, k + 1), sub));
  let p = "";
  for (let i = 0, m = 1 + Math.floor(Math.random() * 3); i < m; i++) p += "abc"[Math.floor(Math.random() * 3)];
  const want = [];
  for (let i = 0; i < n; i++) if (s.startsWith(p, i)) want.push(i);
  assert.deepStrictEqual(findAll(s, sa, p), want);
}

const big = "a".repeat(20000);
const [, lcpBig, lcpOfBig] = lcpTools(big);
console.log("suffix arrays: 300 strings ok | a * 20000:", big.length * (big.length + 1) / 2 - lcpBig.reduce((a, b) => a + b, 0), "distinct substrings, longest repeat", Math.max(...lcpBig), "| lcp_of(0, 1) =", lcpOfBig(0, 1));
```

Output:
```text
suffix arrays: 300 strings ok | a * 20000: 20000 distinct substrings, longest repeat 19999 | lcp_of(0, 1) = 19999
```

</details>
