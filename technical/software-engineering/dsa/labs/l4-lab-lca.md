---
title: "Tree queries: ancestors, paths and subtrees"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l4, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Tree queries: ancestors, paths and subtrees

> Data Structures & Algorithms L4 · about 80 min · modules m04

Build a reusable rooted-tree class with binary lifting and an Euler tour, then answer k-th ancestor, LCA, distance, subtree-sum, path-sum and heaviest-edge queries, all checked against naive walks up the tree.

## Before you start
- Python 3.12+ and Node.js 22+
- Module 04

## Steps
1. `Tree(n, edges)`: one iterative DFS from the root (an explicit stack with ~v as the “leave v” marker) for parent, depth, tin and tout, then the jump table up[j][v] = up[j − 1][up[j − 1][v]], with the root pointing at itself.
2. `kth_ancestor`, `lca` and `dist`: one jump per 1 bit of k; equalise depths, then jump both while the ancestors differ; depth[a] + depth[b] − 2 · depth[LCA].
3. A Fenwick tree over the Euler tour: point update plus subtree sum over [tin, tout), and root-path sums by adding each value over its whole subtree range.
4. `heaviest_on_paths`: a maximum stored per jump, mx[j][v] = max(mx[j − 1][v], mx[j − 1][up[j − 1][v]]), combined while lifting.
5. Tests: 200 random trees against naive ancestor lists, plus a 200,000-vertex path to prove the build has no recursion limit.

## Prove it worked
- k-th ancestors, LCAs and distances match the naive lists on every random tree, including k larger than the depth.
- Subtree sums and root-path sums match direct sums after the Fenwick updates.
- The heaviest edge on every queried path matches a walk along the path.

## Break it (then fix it)
- Use ⌊log₂ n⌋ levels instead of the bit length of n − 1. Find the smallest n where a k-th ancestor query now fails (n = 9, k = 8).
- In the LCA loop, jump both vertices when their ancestors are equal instead of different. Watch which random tests fail and explain why.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
class Tree:                                     # rooted at 0; up[j][v] is v's 2^j-th ancestor (the root's is itself)
    def __init__(self, n, edges):
        adj = [[] for _ in range(n)]
        for u, v in edges:
            adj[u].append(v)
            adj[v].append(u)
        self.LOG = max(1, (n - 1).bit_length())     # 2^LOG is more than any depth
        parent, self.depth = [0] * n, [0] * n
        self.tin, self.tout = [0] * n, [0] * n      # v's subtree is the positions [tin[v], tout[v])
        seen, stack, timer = [False] * n, [0], 0
        seen[0] = True
        while stack:                                # preorder without recursion; ~v marks "leave v"
            v = stack.pop()
            if v < 0:
                self.tout[~v] = timer
                continue
            self.tin[v] = timer
            timer += 1
            stack.append(~v)
            for w in reversed(adj[v]):              # reversed, so children are visited in order
                if not seen[w]:
                    seen[w] = True
                    parent[w], self.depth[w] = v, self.depth[v] + 1
                    stack.append(w)
        self.up = [parent]
        for j in range(1, self.LOG):
            prev = self.up[-1]
            self.up.append([prev[prev[v]] for v in range(n)])   # two jumps of 2^(j-1)

    def kth_ancestor(self, v, k):                   # -1 if v has fewer than k ancestors
        if k > self.depth[v]:
            return -1
        j = 0
        while k:
            if k & 1:
                v = self.up[j][v]
            k >>= 1
            j += 1
        return v

    def lca(self, a, b):
        if self.depth[a] < self.depth[b]:
            a, b = b, a
        a = self.kth_ancestor(a, self.depth[a] - self.depth[b])   # lift a to b's depth
        if a == b:
            return a
        for j in range(self.LOG - 1, -1, -1):       # biggest jumps first, while the ancestors differ
            if self.up[j][a] != self.up[j][b]:
                a, b = self.up[j][a], self.up[j][b]
        return self.up[0][a]

    def dist(self, a, b):
        return self.depth[a] + self.depth[b] - 2 * self.depth[self.lca(a, b)]

    def is_ancestor(self, a, b):                    # is a an ancestor of b, or b itself?
        return self.tin[a] <= self.tin[b] < self.tout[a]

class Fenwick:
    def __init__(self, n):
        self.t = [0] * (n + 1)
    def add(self, i, x):                          # position i, from 0
        i += 1
        while i < len(self.t):
            self.t[i] += x
            i += i & -i
    def prefix(self, i):                          # the sum of positions 0 .. i - 1
        s = 0
        while i > 0:
            s += self.t[i]
            i -= i & -i
        return s

def heaviest_on_paths(n, edges, queries):         # edges (u, v, w); for each (a, b), the largest w on the path
    t = Tree(n, [(u, v) for u, v, _ in edges])
    w_up = [0] * n                                # the weight of the edge from v to its parent
    for u, v, w in edges:
        w_up[v if t.up[0][v] == u and v != 0 else u] = w
    mx = [w_up]                                   # mx[j][v]: the heaviest edge on v's 2^j jump
    for j in range(1, t.LOG):
        prev, up = mx[-1], t.up[j - 1]
        mx.append([max(prev[v], prev[up[v]]) for v in range(n)])   # first half, then second half
    out = []
    for a, b in queries:
        best = 0
        if t.depth[a] < t.depth[b]:
            a, b = b, a
        diff, j = t.depth[a] - t.depth[b], 0
        while diff:                               # lift a, keeping the max of every jump
            if diff & 1:
                best, a = max(best, mx[j][a]), t.up[j][a]
            diff, j = diff >> 1, j + 1
        if a != b:
            for j in range(t.LOG - 1, -1, -1):
                if t.up[j][a] != t.up[j][b]:
                    best = max(best, mx[j][a], mx[j][b])
                    a, b = t.up[j][a], t.up[j][b]
            best = max(best, w_up[a], w_up[b])    # the last two edges into the LCA
        out.append(best)
    return out
import random
random.seed(3)

for _ in range(200):
    n = random.randint(1, 40)
    par = [0] + [random.randrange(v) for v in range(1, n)]
    es = [(par[v], v, random.randint(1, 50)) for v in range(1, n)]
    t = Tree(n, [(u, v) for u, v, _ in es])
    weight = {(u, v): w for u, v, w in es}
    def anc(v):                                   # v, its parent, grandparent, ..., the root
        out = [v]
        while out[-1] != 0:
            out.append(par[out[-1]])
        return out
    vals = [random.randint(-9, 9) for _ in range(n)]
    sub, path = Fenwick(n), Fenwick(n + 1)
    for v in range(n):
        sub.add(t.tin[v], vals[v])
        path.add(t.tin[v], vals[v])
        path.add(t.tout[v], -vals[v])
    qs, want = [], []
    for _ in range(30):
        a, b, k = random.randrange(n), random.randrange(n), random.randint(0, n)
        A, B = anc(a), anc(b)
        c = next(x for x in A if x in B)
        assert t.kth_ancestor(a, k) == (A[k] if k < len(A) else -1)
        assert t.lca(a, b) == c and t.dist(a, b) == A.index(c) + B.index(c)
        assert sub.prefix(t.tout[a]) - sub.prefix(t.tin[a]) == sum(vals[x] for x in range(n) if a in anc(x))
        assert path.prefix(t.tin[a] + 1) == sum(vals[x] for x in A)
        on_path = [weight[A[i + 1], A[i]] for i in range(A.index(c))] + [weight[B[i + 1], B[i]] for i in range(B.index(c))]
        qs.append((a, b))
        want.append(max(on_path, default=0))
    assert heaviest_on_paths(n, es, qs) == want

N = 200_000
line = Tree(N, [(i, i + 1) for i in range(N - 1)])
print("tree queries: 200 random trees ok | 200000-vertex path:", line.kth_ancestor(N - 1, N - 2), line.lca(N - 1, 100_000), line.dist(0, N - 1))
```

Output:
```text
tree queries: 200 random trees ok | 200000-vertex path: 1 100000 199999
```

```javascript
class Tree {                                    // rooted at 0; up[j][v] is v's 2^j-th ancestor (the root's is itself)
  constructor(n, edges) {
    const adj = Array.from({ length: n }, () => []);
    for (const [u, v] of edges) { adj[u].push(v); adj[v].push(u); }
    this.LOG = Math.max(1, 32 - Math.clz32(n - 1));   // 2^LOG is more than any depth
    const parent = new Array(n).fill(0);
    this.depth = new Array(n).fill(0);
    this.tin = new Array(n).fill(0);
    this.tout = new Array(n).fill(0);               // v's subtree is the positions [tin[v], tout[v])
    const seen = new Array(n).fill(false), stack = [0];
    seen[0] = true;
    let timer = 0;
    while (stack.length) {                          // preorder without recursion; ~v marks "leave v"
      const v = stack.pop();
      if (v < 0) { this.tout[~v] = timer; continue; }
      this.tin[v] = timer++;
      stack.push(~v);
      for (let i = adj[v].length - 1; i >= 0; i--) {   // reversed, so children are visited in order
        const w = adj[v][i];
        if (!seen[w]) { seen[w] = true; parent[w] = v; this.depth[w] = this.depth[v] + 1; stack.push(w); }
      }
    }
    this.up = [parent];
    for (let j = 1; j < this.LOG; j++) {
      const prev = this.up[j - 1];
      this.up.push(prev.map(p => prev[p]));         // two jumps of 2^(j-1)
    }
  }
  kthAncestor(v, k) {                               // -1 if v has fewer than k ancestors
    if (k > this.depth[v]) return -1;
    for (let j = 0; k > 0; j++, k >>= 1) if (k & 1) v = this.up[j][v];
    return v;
  }
  lca(a, b) {
    if (this.depth[a] < this.depth[b]) [a, b] = [b, a];
    a = this.kthAncestor(a, this.depth[a] - this.depth[b]);   // lift a to b's depth
    if (a === b) return a;
    for (let j = this.LOG - 1; j >= 0; j--) {       // biggest jumps first, while the ancestors differ
      if (this.up[j][a] !== this.up[j][b]) { a = this.up[j][a]; b = this.up[j][b]; }
    }
    return this.up[0][a];
  }
  dist(a, b) {
    return this.depth[a] + this.depth[b] - 2 * this.depth[this.lca(a, b)];
  }
  isAncestor(a, b) {                                // is a an ancestor of b, or b itself?
    return this.tin[a] <= this.tin[b] && this.tin[b] < this.tout[a];
  }
}

class Fenwick {
  constructor(n) { this.t = new Array(n + 1).fill(0); }
  add(i, x) { for (i++; i < this.t.length; i += i & -i) this.t[i] += x; }   // position i, from 0
  prefix(i) { let s = 0; for (; i > 0; i -= i & -i) s += this.t[i]; return s; }   // the sum of positions 0 .. i - 1
}

function heaviestOnPaths(n, edges, queries) {     // edges [u, v, w]; for each [a, b], the largest w on the path
  const t = new Tree(n, edges.map(([u, v]) => [u, v]));
  const wUp = new Array(n).fill(0);               // the weight of the edge from v to its parent
  for (const [u, v, w] of edges) wUp[t.up[0][v] === u && v !== 0 ? v : u] = w;
  const mx = [wUp];                               // mx[j][v]: the heaviest edge on v's 2^j jump
  for (let j = 1; j < t.LOG; j++) {
    const prev = mx[j - 1], up = t.up[j - 1];
    mx.push(prev.map((m, v) => Math.max(m, prev[up[v]])));   // first half, then second half
  }
  return queries.map(([a, b]) => {
    let best = 0;
    if (t.depth[a] < t.depth[b]) [a, b] = [b, a];
    for (let diff = t.depth[a] - t.depth[b], j = 0; diff > 0; diff >>= 1, j++) {   // lift a, keeping the max
      if (diff & 1) { best = Math.max(best, mx[j][a]); a = t.up[j][a]; }
    }
    if (a !== b) {
      for (let j = t.LOG - 1; j >= 0; j--) {
        if (t.up[j][a] !== t.up[j][b]) {
          best = Math.max(best, mx[j][a], mx[j][b]);
          a = t.up[j][a]; b = t.up[j][b];
        }
      }
      best = Math.max(best, wUp[a], wUp[b]);      // the last two edges into the LCA
    }
    return best;
  });
}
const assert = require("node:assert");
const rnd = k => Math.floor(Math.random() * k);

for (let r = 0; r < 200; r++) {
  const n = 1 + rnd(40);
  const par = [0];
  for (let v = 1; v < n; v++) par.push(rnd(v));
  const es = par.slice(1).map((p, i) => [p, i + 1, 1 + rnd(50)]);
  const t = new Tree(n, es.map(([u, v]) => [u, v]));
  const weight = new Map(es.map(([u, v, w]) => [u * n + v, w]));
  const anc = v => { const out = [v]; while (out.at(-1) !== 0) out.push(par[out.at(-1)]); return out; };
  const vals = Array.from({ length: n }, () => rnd(19) - 9);
  const sub = new Fenwick(n), path = new Fenwick(n + 1);
  for (let v = 0; v < n; v++) { sub.add(t.tin[v], vals[v]); path.add(t.tin[v], vals[v]); path.add(t.tout[v], -vals[v]); }
  const qs = [], want = [];
  for (let q = 0; q < 30; q++) {
    const a = rnd(n), b = rnd(n), k = rnd(n + 1), A = anc(a), B = anc(b), Bs = new Set(B);
    const c = A.find(x => Bs.has(x));
    assert.strictEqual(t.kthAncestor(a, k), k < A.length ? A[k] : -1);
    assert.strictEqual(t.lca(a, b), c);
    assert.strictEqual(t.dist(a, b), A.indexOf(c) + B.indexOf(c));
    let inSub = 0;
    for (let x = 0; x < n; x++) if (anc(x).includes(a)) inSub += vals[x];
    assert.strictEqual(sub.prefix(t.tout[a]) - sub.prefix(t.tin[a]), inSub);
    assert.strictEqual(path.prefix(t.tin[a] + 1), A.reduce((s, x) => s + vals[x], 0));
    const onPath = [];
    for (let i = 0; i < A.indexOf(c); i++) onPath.push(weight.get(A[i + 1] * n + A[i]));
    for (let i = 0; i < B.indexOf(c); i++) onPath.push(weight.get(B[i + 1] * n + B[i]));
    qs.push([a, b]);
    want.push(onPath.length ? Math.max(...onPath) : 0);
  }
  assert.deepStrictEqual(heaviestOnPaths(n, es, qs), want);
}

const N = 200000;
const line = new Tree(N, Array.from({ length: N - 1 }, (_, i) => [i, i + 1]));
console.log("tree queries: 200 random trees ok | 200000-vertex path:", line.kthAncestor(N - 1, N - 2), line.lca(N - 1, 100000), line.dist(0, N - 1));
```

Output:
```text
tree queries: 200 random trees ok | 200000-vertex path: 1 100000 199999
```

</details>
