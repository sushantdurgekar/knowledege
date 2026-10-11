---
title: "Flows, cuts, matchings and assignments"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l4, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Flows, cuts, matchings and assignments

> Data Structures & Algorithms L4 · about 100 min · modules m02, m03

Write Dinic's maximum flow with a minimum-cut extractor, Kuhn's matching with Kőnig's cover, the Hungarian algorithm and min-cost flow, then make them check each other: max flow equals min cut, matching by flow equals Kuhn, and the Hungarian optimum equals min-cost flow.

## Before you start
- Python 3.12+ and Node.js 22+
- Modules 02 and 03

## Steps
1. `MaxFlow` (Dinic) with `add_edge`, `max_flow` and `source_side`: each edge stored beside its reverse (indexes e and e ^ 1), BFS levels, current-arc pointers, and no recursion.
2. `max_matching(n_left, n_right, adj)` by Kuhn's algorithm with an explicit stack, and `matching_by_flow` on the unit network s → left → right → t. They must always agree.
3. `min_vertex_cover` from the matching by Kőnig's alternating search: the left vertices it misses plus the right vertices it reaches.
4. `assignment(cost)` (Hungarian, O(n³)) and `min_cost_flow(n, edges, s, t, k)` (successive shortest paths with a queue-based Bellman–Ford), checked against each other on n × n assignment networks.
5. Tests: random networks against a brute-force minimum cut over every vertex subset, random bipartite graphs against a brute-force matching, random cost matrices against every permutation, and a 2,000-move augmenting chain.

## Prove it worked
- Max flow equals the brute-force minimum cut on every random network, and the edges leaving `source_side` add up to the flow.
- Kuhn, matching by flow and brute force agree on every random bipartite graph, and Kőnig's cover touches every edge with exactly as many vertices.
- The Hungarian algorithm, min-cost flow and trying every permutation give the same optimum.

## Break it (then fix it)
- Stop adding pushed flow to the reverse edge (cap[e ^ 1]). Find a network where the flow now stops below the maximum; the diamond from module 02 is a start.
- In the Hungarian algorithm, start `minv` at 0 instead of infinity, then run the random tests and explain the first failure.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
class MaxFlow:                                  # Dinic's algorithm
    def __init__(self, n):
        self.n, self.adj = n, [[] for _ in range(n)]
        self.to, self.cap = [], []              # edge e and its reverse e ^ 1 sit side by side

    def add_edge(self, u, v, c):
        self.adj[u].append(len(self.to)); self.to.append(v); self.cap.append(c)
        self.adj[v].append(len(self.to)); self.to.append(u); self.cap.append(0)

    def _levels(self, s):                       # BFS distances from s using edges with spare capacity
        level = [-1] * self.n
        level[s], q = 0, [s]
        for u in q:
            for e in self.adj[u]:
                if self.cap[e] > 0 and level[self.to[e]] < 0:
                    level[self.to[e]] = level[u] + 1
                    q.append(self.to[e])
        return level

    def _next_edge(self, u, level, it):         # first usable edge out of u, or -1
        while it[u] < len(self.adj[u]):
            e = self.adj[u][it[u]]
            if self.cap[e] > 0 and level[self.to[e]] == level[u] + 1:
                return e
            it[u] += 1
        return -1

    def max_flow(self, s, t):
        flow = 0
        while (level := self._levels(s))[t] >= 0:
            it = [0] * self.n                   # current-arc pointers: dead edges stay skipped
            while True:                         # one shortest augmenting path per pass
                path, u = [], s
                while u != t:
                    e = self._next_edge(u, level, it)
                    if e >= 0:
                        path.append(e)
                        u = self.to[e]
                    elif u == s:
                        break                   # s is stuck: this level graph is used up
                    else:
                        u = self.to[path.pop() ^ 1]   # back to the tail of the last edge
                        it[u] += 1                    # and never try that edge again this round
                if u != t:
                    break
                f = min(self.cap[e] for e in path)
                for e in path:
                    self.cap[e] -= f
                    self.cap[e ^ 1] += f
                flow += f
        return flow

    def source_side(self, s):                   # after max_flow: what s still reaches is a min cut's side
        return [d >= 0 for d in self._levels(s)]

def max_matching(n_left, n_right, adj):         # Kuhn; adj[u]: the right vertices left vertex u may take
    match_l, match_r, size = [-1] * n_left, [-1] * n_right, 0
    for root in range(n_left):
        seen = [False] * n_right
        stack, via, free = [[root, 0]], [], -1  # left vertices on the path, right vertices between them
        while stack and free < 0:
            u, i = stack[-1]
            if i == len(adj[u]):                # u has nothing left to try: step back
                stack.pop()
                if via:
                    via.pop()
                continue
            stack[-1][1] += 1
            v = adj[u][i]
            if seen[v]:
                continue
            seen[v] = True
            if match_r[v] < 0:
                free = v                        # a free right vertex ends an augmenting path
            else:
                via.append(v)
                stack.append([match_r[v], 0])   # ask v's partner to move instead
        if free >= 0:                           # flip the path: each left vertex takes the next right vertex
            for (u, _), v in zip(stack, via + [free]):
                match_l[u], match_r[v] = v, u
            size += 1
    return size, match_l, match_r

def assignment(cost):                           # Hungarian; n x m costs, n <= m: (least total, column per row)
    n, m = len(cost), len(cost[0])
    u, v = [0] * (n + 1), [0] * (m + 1)         # potentials, 1-based: cost - u[i] - v[j] stays >= 0
    p, way = [0] * (m + 1), [0] * (m + 1)       # p[j]: the row holding column j (0 = none)
    for i in range(1, n + 1):
        p[0], j0 = i, 0                         # park the new row on the dummy column 0
        minv, used = [float("inf")] * (m + 1), [False] * (m + 1)
        while True:                             # a Dijkstra-like search over reduced costs
            used[j0] = True
            i0, delta, j1 = p[j0], float("inf"), 0
            for j in range(1, m + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j], way[j] = cur, j0
                    if minv[j] < delta:
                        delta, j1 = minv[j], j
            for j in range(m + 1):              # shift the potentials: a new zero-cost edge appears
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:                      # a free column: this row's search is over
                break
        while j0:                               # flip the alternating path back to column 0
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
    col = [0] * n
    for j in range(1, m + 1):
        if p[j]:
            col[p[j] - 1] = j - 1
    return -v[0], col

def min_vertex_cover(n_left, n_right, adj):       # Kőnig: as many vertices as the maximum matching has edges
    size, match_l, match_r = max_matching(n_left, n_right, adj)
    seen_l = [m < 0 for m in match_l]             # start from every unmatched left vertex
    seen_r = [False] * n_right
    stack = [u for u in range(n_left) if seen_l[u]]
    while stack:                                  # alternate: any edge to the right, the matched edge back
        u = stack.pop()
        for v in adj[u]:
            if not seen_r[v]:
                seen_r[v] = True
                w = match_r[v]                    # always matched, or the matching wasn't maximum
                if not seen_l[w]:
                    seen_l[w] = True
                    stack.append(w)
    return [u for u in range(n_left) if not seen_l[u]], [v for v in range(n_right) if seen_r[v]]

from collections import deque

def min_cost_flow(n, edges, s, t, k):             # edges (u, v, capacity, cost per unit): send up to k units
    to, cap, cost, adj = [], [], [], [[] for _ in range(n)]
    for u, v, c, w in edges:
        adj[u].append(len(to)); to.append(v); cap.append(c); cost.append(w)
        adj[v].append(len(to)); to.append(u); cap.append(0); cost.append(-w)   # sending back refunds the cost
    sent = total = 0
    while sent < k:
        dist, prev, queued = [None] * n, [-1] * n, [False] * n
        dist[s], q = 0, deque([s])
        while q:                                  # Bellman-Ford with a queue: refunds are negative costs
            u = q.popleft()
            queued[u] = False
            for e in adj[u]:
                v = to[e]
                if cap[e] > 0 and (dist[v] is None or dist[u] + cost[e] < dist[v]):
                    dist[v], prev[v] = dist[u] + cost[e], e
                    if not queued[v]:
                        queued[v] = True
                        q.append(v)
        if dist[t] is None:
            break                                 # no room left: fewer than k units fit
        push, v = k - sent, t
        while v != s:                             # the cheapest path's bottleneck
            push = min(push, cap[prev[v]])
            v = to[prev[v] ^ 1]
        v = t
        while v != s:
            cap[prev[v]] -= push
            cap[prev[v] ^ 1] += push
            v = to[prev[v] ^ 1]
        sent, total = sent + push, total + push * dist[t]
    return sent, total
import itertools, random
random.seed(2)

def matching_by_flow(nl, nr, adj):                # s -> left -> right -> t, every capacity 1
    g = MaxFlow(nl + nr + 2)
    s, t = nl + nr, nl + nr + 1
    for u in range(nl):
        g.add_edge(s, u, 1)
        for v in adj[u]:
            g.add_edge(u, nl + v, 1)
    for v in range(nr):
        g.add_edge(nl + v, t, 1)
    return g.max_flow(s, t)

def brute_cut(n, es, s, t):
    inner = [v for v in range(n) if v not in (s, t)]
    best = None
    for bits in range(1 << len(inner)):
        S = {s} | {inner[i] for i in range(len(inner)) if bits >> i & 1}
        c = sum(cap for u, v, cap in es if u in S and v not in S)
        best = c if best is None else min(best, c)
    return best

def brute_matching(nl, adj, i=0, used=0):
    if i == nl:
        return 0
    best = brute_matching(nl, adj, i + 1, used)
    for v in adj[i]:
        if not used >> v & 1:
            best = max(best, 1 + brute_matching(nl, adj, i + 1, used | 1 << v))
    return best

for _ in range(300):                              # max flow = min cut = the cut that source_side reports
    n = random.randint(2, 7)
    es = [(random.randrange(n), random.randrange(n), random.randint(0, 6)) for _ in range(random.randint(0, 14))]
    g = MaxFlow(n)
    for u, v, c in es:
        g.add_edge(u, v, c)
    f = g.max_flow(0, n - 1)
    side = g.source_side(0)
    assert f == brute_cut(n, es, 0, n - 1) == sum(c for u, v, c in es if side[u] and not side[v])

for _ in range(300):                              # Kuhn = flow = brute force; Konig's cover has the same size
    nl, nr = random.randint(1, 6), random.randint(1, 6)
    adj = [random.sample(range(nr), random.randint(0, nr)) for _ in range(nl)]
    size = max_matching(nl, nr, adj)[0]
    assert size == matching_by_flow(nl, nr, adj) == brute_matching(nl, adj)
    rows, cols = min_vertex_cover(nl, nr, adj)
    assert len(rows) + len(cols) == size and all(u in rows or v in cols for u in range(nl) for v in adj[u])

for _ in range(200):                              # Hungarian = min-cost flow = every permutation
    n = random.randint(1, 5)
    cost = [[random.randint(0, 9) for _ in range(n)] for _ in range(n)]
    best = min(sum(cost[i][p[i]] for i in range(n)) for p in itertools.permutations(range(n)))
    edges = ([(2 * n, i, 1, 0) for i in range(n)] + [(i, n + j, 1, cost[i][j]) for i in range(n) for j in range(n)]
             + [(n + j, 2 * n + 1, 1, 0) for j in range(n)])
    assert assignment(cost)[0] == best == min_cost_flow(2 * n + 2, edges, 2 * n, 2 * n + 1, n)[1]

chain = [[i, i + 1] for i in range(1999)] + [[0]]
print("max flow = min cut: 300 ok | matchings: 300 ok | assignments: 200 ok | 2000-move chain:", max_matching(2000, 2000, chain)[0])
```

Output:
```text
max flow = min cut: 300 ok | matchings: 300 ok | assignments: 200 ok | 2000-move chain: 2000
```

```javascript
class MaxFlow {                                 // Dinic's algorithm
  constructor(n) {
    this.n = n;
    this.adj = Array.from({ length: n }, () => []);
    this.to = []; this.cap = [];                // edge e and its reverse e ^ 1 sit side by side
  }
  addEdge(u, v, c) {
    this.adj[u].push(this.to.length); this.to.push(v); this.cap.push(c);
    this.adj[v].push(this.to.length); this.to.push(u); this.cap.push(0);
  }
  levels(s) {                                   // BFS distances from s using edges with spare capacity
    const level = new Array(this.n).fill(-1), q = [s];
    level[s] = 0;
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const e of this.adj[u]) {
        if (this.cap[e] > 0 && level[this.to[e]] < 0) {
          level[this.to[e]] = level[u] + 1;
          q.push(this.to[e]);
        }
      }
    }
    return level;
  }
  nextEdge(u, level, it) {                      // first usable edge out of u, or -1
    for (; it[u] < this.adj[u].length; it[u]++) {
      const e = this.adj[u][it[u]];
      if (this.cap[e] > 0 && level[this.to[e]] === level[u] + 1) return e;
    }
    return -1;
  }
  maxFlow(s, t) {
    let flow = 0, level;
    while ((level = this.levels(s))[t] >= 0) {
      const it = new Array(this.n).fill(0);     // current-arc pointers: dead edges stay skipped
      for (;;) {                                // one shortest augmenting path per pass
        const path = [];
        let u = s;
        while (u !== t) {
          const e = this.nextEdge(u, level, it);
          if (e >= 0) { path.push(e); u = this.to[e]; continue; }
          if (u === s) break;                   // s is stuck: this level graph is used up
          u = this.to[path.pop() ^ 1];          // back to the tail of the last edge
          it[u]++;                              // and never try that edge again this round
        }
        if (u !== t) break;
        let f = Infinity;
        for (const e of path) f = Math.min(f, this.cap[e]);
        for (const e of path) { this.cap[e] -= f; this.cap[e ^ 1] += f; }
        flow += f;
      }
    }
    return flow;
  }
  sourceSide(s) {                               // after maxFlow: what s still reaches is a min cut's side
    return this.levels(s).map(d => d >= 0);
  }
}

function maxMatching(nLeft, nRight, adj) {      // Kuhn; adj[u]: the right vertices left vertex u may take
  const matchL = new Array(nLeft).fill(-1), matchR = new Array(nRight).fill(-1);
  let size = 0;
  for (let root = 0; root < nLeft; root++) {
    const seen = new Array(nRight).fill(false);
    const stack = [[root, 0]], via = [];        // left vertices on the path, right vertices between them
    let free = -1;
    while (stack.length && free < 0) {
      const top = stack[stack.length - 1], u = top[0];
      if (top[1] === adj[u].length) { stack.pop(); via.pop(); continue; }   // nothing left to try: step back
      const v = adj[u][top[1]++];
      if (seen[v]) continue;
      seen[v] = true;
      if (matchR[v] < 0) free = v;              // a free right vertex ends an augmenting path
      else { via.push(v); stack.push([matchR[v], 0]); }   // ask v's partner to move instead
    }
    if (free >= 0) {                            // flip the path: each left vertex takes the next right vertex
      via.push(free);
      stack.forEach(([u], k) => { matchL[u] = via[k]; matchR[via[k]] = u; });
      size++;
    }
  }
  return [size, matchL, matchR];
}

function assignment(cost) {                     // Hungarian; n x m costs, n <= m: [least total, column per row]
  const n = cost.length, m = cost[0].length;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);   // potentials, 1-based
  const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0); // p[j]: the row holding column j (0 = none)
  for (let i = 1; i <= n; i++) {
    p[0] = i;                                   // park the new row on the dummy column 0
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity), used = new Array(m + 1).fill(false);
    do {                                        // a Dijkstra-like search over reduced costs
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {            // shift the potentials: a new zero-cost edge appears
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);                      // a free column: this row's search is over
    do {                                        // flip the alternating path back to column 0
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const col = new Array(n).fill(0);
  for (let j = 1; j <= m; j++) if (p[j]) col[p[j] - 1] = j - 1;
  return [0 - v[0], col];                       // 0 - x rather than -x, so a zero total is never -0
}

function minVertexCover(nLeft, nRight, adj) {     // Kőnig: as many vertices as the maximum matching has edges
  const [, matchL, matchR] = maxMatching(nLeft, nRight, adj);
  const seenL = matchL.map(m => m < 0);           // start from every unmatched left vertex
  const seenR = new Array(nRight).fill(false);
  const stack = [...seenL.keys()].filter(u => seenL[u]);
  while (stack.length) {                          // alternate: any edge to the right, the matched edge back
    const u = stack.pop();
    for (const v of adj[u]) {
      if (seenR[v]) continue;
      seenR[v] = true;
      const w = matchR[v];                        // always matched, or the matching wasn't maximum
      if (!seenL[w]) { seenL[w] = true; stack.push(w); }
    }
  }
  return [[...seenL.keys()].filter(u => !seenL[u]), [...seenR.keys()].filter(v => seenR[v])];
}

function minCostFlow(n, edges, s, t, k) {         // edges [u, v, capacity, cost per unit]: send up to k units
  const to = [], cap = [], cost = [], adj = Array.from({ length: n }, () => []);
  for (const [u, v, c, w] of edges) {
    adj[u].push(to.length); to.push(v); cap.push(c); cost.push(w);
    adj[v].push(to.length); to.push(u); cap.push(0); cost.push(-w);   // sending back refunds the cost
  }
  let sent = 0, total = 0;
  while (sent < k) {
    const dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), queued = new Array(n).fill(false);
    dist[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {          // Bellman-Ford with a queue: refunds are negative costs
      const u = q[h];
      queued[u] = false;
      for (const e of adj[u]) {
        const v = to[e];
        if (cap[e] > 0 && dist[u] + cost[e] < dist[v]) {
          dist[v] = dist[u] + cost[e];
          prev[v] = e;
          if (!queued[v]) { queued[v] = true; q.push(v); }
        }
      }
    }
    if (dist[t] === Infinity) break;              // no room left: fewer than k units fit
    let push = k - sent;
    for (let v = t; v !== s; v = to[prev[v] ^ 1]) push = Math.min(push, cap[prev[v]]);   // the cheapest path's bottleneck
    for (let v = t; v !== s; v = to[prev[v] ^ 1]) { cap[prev[v]] -= push; cap[prev[v] ^ 1] += push; }
    sent += push;
    total += push * dist[t];
  }
  return [sent, total];
}
const assert = require("node:assert");
const rnd = k => Math.floor(Math.random() * k);

function matchingByFlow(nl, nr, adj) {           // s -> left -> right -> t, every capacity 1
  const g = new MaxFlow(nl + nr + 2), s = nl + nr, t = nl + nr + 1;
  for (let u = 0; u < nl; u++) { g.addEdge(s, u, 1); for (const v of adj[u]) g.addEdge(u, nl + v, 1); }
  for (let v = 0; v < nr; v++) g.addEdge(nl + v, t, 1);
  return g.maxFlow(s, t);
}

function bruteCut(n, es, s, t) {
  const inner = [];
  for (let v = 0; v < n; v++) if (v !== s && v !== t) inner.push(v);
  let best = Infinity;
  for (let bits = 0; bits < 1 << inner.length; bits++) {
    const S = new Set([s]);
    inner.forEach((v, i) => { if ((bits >> i) & 1) S.add(v); });
    let c = 0;
    for (const [u, v, cap] of es) if (S.has(u) && !S.has(v)) c += cap;
    best = Math.min(best, c);
  }
  return best;
}

function bruteMatching(nl, adj, i = 0, used = 0) {
  if (i === nl) return 0;
  let best = bruteMatching(nl, adj, i + 1, used);
  for (const v of adj[i]) if (!((used >> v) & 1)) best = Math.max(best, 1 + bruteMatching(nl, adj, i + 1, used | (1 << v)));
  return best;
}

const perms = xs => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p])));

for (let r = 0; r < 300; r++) {                   // max flow = min cut = the cut that sourceSide reports
  const n = 2 + rnd(6);
  const es = Array.from({ length: rnd(15) }, () => [rnd(n), rnd(n), rnd(7)]);
  const g = new MaxFlow(n);
  for (const [u, v, c] of es) g.addEdge(u, v, c);
  const f = g.maxFlow(0, n - 1), side = g.sourceSide(0);
  assert.strictEqual(f, bruteCut(n, es, 0, n - 1));
  assert.strictEqual(f, es.reduce((sum, [u, v, c]) => sum + (side[u] && !side[v] ? c : 0), 0));
}

for (let r = 0; r < 300; r++) {                   // Kuhn = flow = brute force; Konig's cover has the same size
  const nl = 1 + rnd(6), nr = 1 + rnd(6);
  const adj = Array.from({ length: nl }, () => [...Array(nr).keys()].filter(() => Math.random() < 0.4));
  const size = maxMatching(nl, nr, adj)[0];
  assert.strictEqual(size, matchingByFlow(nl, nr, adj));
  assert.strictEqual(size, bruteMatching(nl, adj));
  const [rows, cols] = minVertexCover(nl, nr, adj);
  assert.strictEqual(rows.length + cols.length, size);
  for (let u = 0; u < nl; u++) for (const v of adj[u]) assert.ok(rows.includes(u) || cols.includes(v));
}

for (let r = 0; r < 200; r++) {                   // Hungarian = min-cost flow = every permutation
  const n = 1 + rnd(5);
  const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => rnd(10)));
  const best = Math.min(...perms([...Array(n).keys()]).map(p => p.reduce((s, j, i) => s + cost[i][j], 0)));
  const edges = [];
  for (let i = 0; i < n; i++) { edges.push([2 * n, i, 1, 0], [n + i, 2 * n + 1, 1, 0]); for (let j = 0; j < n; j++) edges.push([i, n + j, 1, cost[i][j]]); }
  assert.strictEqual(assignment(cost)[0], best);
  assert.strictEqual(minCostFlow(2 * n + 2, edges, 2 * n, 2 * n + 1, n)[1], best);
}

const chain = Array.from({ length: 1999 }, (_, i) => [i, i + 1]).concat([[0]]);
console.log("max flow = min cut: 300 ok | matchings: 300 ok | assignments: 200 ok | 2000-move chain:", maxMatching(2000, 2000, chain)[0]);
```

Output:
```text
max flow = min cut: 300 ok | matchings: 300 ok | assignments: 200 ok | 2000-move chain: 2000
```

</details>
