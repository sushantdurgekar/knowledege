---
title: "Union-find and Kruskal's minimum spanning tree"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Union-find and Kruskal's minimum spanning tree

> Data Structures & Algorithms L2 · about 60 min · modules m07

Write a disjoint-set union with path compression and union by size. Use it to count components as links arrive, to find the first redundant link, and to build Kruskal's minimum spanning tree. Check the component counts and the MST totals against brute force.

## Before you start
- Module 07

## Steps
1. `find(x)` with path compression, written as a loop so long chains can't overflow the stack; `union(a, b)` by size that returns False when a and b were already connected.
2. Keep a `count` of separate sets: it starts at n and drops by 1 on every successful union.
3. Redundant connection: the first edge whose union fails closes a cycle.
4. Kruskal: sort the edges by weight, keep each edge whose union succeeds, and stop at n − 1 edges. Return None / null if the graph is disconnected.
5. Compare against a brute-force DFS (components) and a brute-force search over edge subsets (MST) on 300 random small graphs.

## Prove it worked
- The component count and Kruskal's total match brute force on 300 random graphs, including self-loops and repeated edges.
- `find` is a loop, so even a long chain can't overflow the stack.

## Break it (then fix it)
- Remove union by size and path compression, call `union(i, i - 1)` for i from 1 to 100,000 so each new node becomes the root, and time `find(0)`. Then put the two optimisations back.
- Return Kruskal's total without checking `used == n - 1`, and find a disconnected graph where the wrong answer looks plausible.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random
from itertools import combinations

class DSU:
    def __init__(self, n):
        self.parent = list(range(n))
        self.size = [1] * n
        self.count = n                     # the number of separate sets

    def find(self, x):                     # path compression, as a loop
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while x != root:                   # point every node on the path at the root
            nxt = self.parent[x]
            self.parent[x] = root
            x = nxt
        return root

    def union(self, a, b):                 # union by size; False if already joined
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        self.count -= 1
        return True

def redundant_edge(n, edges):
    dsu = DSU(n)
    for u, v in edges:
        if not dsu.union(u, v):
            return u, v                    # u and v were already connected
    return None

def kruskal(n, edges):                     # edges are (weight, u, v); O(E log E)
    dsu, total, used = DSU(n), 0, 0
    for w, u, v in sorted(edges):
        if dsu.union(u, v):
            total += w
            used += 1
            if used == n - 1:
                break
    return total if used == n - 1 else None   # None: the graph is disconnected

def brute_components(n, pairs):
    adj = [[] for _ in range(n)]
    for u, v in pairs:
        adj[u].append(v)
        adj[v].append(u)
    seen, count = set(), 0
    for s in range(n):
        if s not in seen:
            count += 1
            seen.add(s)
            stack = [s]
            while stack:
                for nxt in adj[stack.pop()]:
                    if nxt not in seen:
                        seen.add(nxt)
                        stack.append(nxt)
    return count

def brute_mst(n, edges):                   # try every set of n - 1 edges
    best = None
    for subset in combinations(edges, n - 1):
        if brute_components(n, [(u, v) for _, u, v in subset]) == 1:
            w = sum(e[0] for e in subset)
            best = w if best is None else min(best, w)
    return best

for _ in range(300):
    n = random.randint(1, 6)
    edges = [(random.randint(1, 9), random.randrange(n), random.randrange(n)) for _ in range(random.randint(0, 8))]
    dsu = DSU(n)
    for _, u, v in edges:
        dsu.union(u, v)
    assert dsu.count == brute_components(n, [(u, v) for _, u, v in edges])
    assert kruskal(n, edges) == brute_mst(n, edges), (n, edges)

u, v = redundant_edge(5, [(0, 1), (1, 2), (3, 4), (2, 0), (1, 3)])
mst = kruskal(4, [(1, 0, 1), (4, 1, 2), (3, 0, 2), (2, 2, 3), (5, 1, 3)])
print(f"redundant {u}-{v}, MST weight {mst}, disconnected: {'yes' if kruskal(3, [(1, 0, 1)]) is None else 'no'}")
```

Output:
```text
redundant 2-0, MST weight 6, disconnected: yes
```

```javascript
const assert = require("node:assert");

class DSU {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = new Array(n).fill(1);
    this.count = n;                        // the number of separate sets
  }
  find(x) {                                // path compression, as a loop
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (x !== root) {                   // point every node on the path at the root
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }
  union(a, b) {                            // union by size; false if already joined
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    this.count--;
    return true;
  }
}

function redundantEdge(n, edges) {
  const dsu = new DSU(n);
  for (const [u, v] of edges) if (!dsu.union(u, v)) return [u, v];   // already connected
  return null;
}

function kruskal(n, edges) {               // edges are [weight, u, v]; O(E log E)
  const dsu = new DSU(n);
  let total = 0, used = 0;
  for (const [w, u, v] of edges.toSorted((a, b) => a[0] - b[0])) {
    if (dsu.union(u, v)) {
      total += w;
      if (++used === n - 1) break;
    }
  }
  return used === n - 1 ? total : null;   // null: the graph is disconnected
}

function bruteComponents(n, pairs) {
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of pairs) { adj[u].push(v); adj[v].push(u); }
  const seen = new Set();
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (seen.has(s)) continue;
    count++;
    seen.add(s);
    const stack = [s];
    while (stack.length) {
      for (const nxt of adj[stack.pop()]) {
        if (!seen.has(nxt)) { seen.add(nxt); stack.push(nxt); }
      }
    }
  }
  return count;
}

function bruteMst(n, edges) {               // try every set of n - 1 edges
  let best = null;
  const pick = (start, chosen) => {
    if (chosen.length === n - 1) {
      if (bruteComponents(n, chosen.map(([, u, v]) => [u, v])) === 1) {
        const w = chosen.reduce((s, e) => s + e[0], 0);
        best = best === null ? w : Math.min(best, w);
      }
      return;
    }
    for (let i = start; i < edges.length; i++) pick(i + 1, [...chosen, edges[i]]);
  };
  pick(0, []);
  return best;
}

const rnd = k => Math.floor(Math.random() * k);
for (let t = 0; t < 300; t++) {
  const n = 1 + rnd(6);
  const edges = Array.from({ length: rnd(9) }, () => [1 + rnd(9), rnd(n), rnd(n)]);
  const dsu = new DSU(n);
  for (const [, u, v] of edges) dsu.union(u, v);
  assert.strictEqual(dsu.count, bruteComponents(n, edges.map(([, u, v]) => [u, v])));
  assert.strictEqual(kruskal(n, edges), bruteMst(n, edges));
}

const [u, v] = redundantEdge(5, [[0, 1], [1, 2], [3, 4], [2, 0], [1, 3]]);
const mst = kruskal(4, [[1, 0, 1], [4, 1, 2], [3, 0, 2], [2, 2, 3], [5, 1, 3]]);
console.log(`redundant ${u}-${v}, MST weight ${mst}, disconnected: ${kruskal(3, [[1, 0, 1]]) === null ? "yes" : "no"}`);
```

Output:
```text
redundant 2-0, MST weight 6, disconnected: yes
```

</details>
