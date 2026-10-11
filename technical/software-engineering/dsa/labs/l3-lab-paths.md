---
title: "Shortest-path toolkit"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Shortest-path toolkit

> Data Structures & Algorithms L3 · about 90 min · modules m01, m02

Write the four shortest-path algorithms that hard graph problems are built on: Dijkstra with a binary heap and lazy deletion (plus the path itself), 0-1 BFS with a deque, Bellman–Ford that reports a reachable negative cycle, and Floyd–Warshall for every pair. Then make them check each other on hundreds of random graphs.

## Before you start
- Python 3.12+ and Node.js 22+
- Modules 01 and 02

## Steps
1. `dijkstra(n, edges, src)` (the signatures of modules 01 and 02, with directed (u, v, w) edges): build adjacency lists and keep a min-heap of (distance, vertex). Pop, skip the entry if it's stale (its distance is bigger than `dist[u]`), then relax every edge, pushing each improvement and recording `parent[v]`. JavaScript has no heap, so write a small one for [key, value] pairs.
2. `path_to(dist, parent, t)`: walk the parents back from t and reverse them; return an empty path when t can't be reached.
3. `zero_one_bfs(n, edges, src)`: a 0-edge sends its vertex to the front of a deque, a 1-edge to the back. In JavaScript, make the deque from a stack for the front and an array read from a head index for the back (not `unshift`, which moves every element).
4. `bellman_ford(n, edges, src)`: up to V − 1 rounds over every edge, stopping early when nothing changes; if one more round still improves a distance, return None / null. `floyd_warshall(n, edges)`: start from the cheapest direct edge for each pair, then run the triple loop with k outermost.
5. Test 300 random graphs (up to 7 vertices, with self-loops and repeated edges): Dijkstra equals Bellman–Ford on weights 0–9, 0-1 BFS equals Dijkstra on the same graph with weights mod 2, and Floyd–Warshall equals Bellman–Ford from every source after shifting each weight by `pot[u] - pot[v]` (edges turn negative, but every cycle keeps its total, as in Johnson's reweighting). Finally, plant a cycle of weight −1 and check that it's caught.

## Prove it worked
- Dijkstra, 0-1 BFS, Bellman–Ford and Floyd–Warshall agree on 300 random graphs, including self-loops, repeated edges and unreachable vertices.
- Every path from `path_to` starts at the source, ends at t, follows real edges and costs exactly dist[t].
- A negative cycle is reported only when the source can reach it: the unreachable cycle in the last test is ignored.

## Break it (then fix it)
- Give Dijkstra negative edges but no negative cycle: 0→1 (2), 0→2 (3), 2→1 (−2), 1→3 (1). Your lazy version still matches Bellman–Ford, because it re-processes any vertex whose distance drops (and so loses its O((V + E) log V) bound). Now add a `done` flag that skips a vertex popped before, as textbook Dijkstra does: vertex 3 comes out as 3 instead of 2.
- Move Floyd–Warshall's k loop inside the i and j loops. The check against Bellman–Ford now fails on every run, because each d[i][j] is settled in one pass over k, before d[i][k] and d[k][j] hold their shortest values, so paths with two or more stops can be missed.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import heapq, random
from collections import deque

INF = float("inf")

def adjacency(n, edges):                       # directed (u, v, w) edges -> adjacency lists
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
    return adj

def dijkstra(n, edges, src):                   # O((V + E) log V) time, O(V + E) space
    adj = adjacency(n, edges)
    dist, parent = [INF] * n, [-1] * n
    dist[src] = 0
    heap = [(0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:                        # stale entry: u was already reached more cheaply
            continue
        for v, w in adj[u]:
            if d + w < dist[v]:
                dist[v], parent[v] = d + w, u
                heapq.heappush(heap, (d + w, v))   # lazy deletion: the old entry stays behind
    return dist, parent

def path_to(dist, parent, t):                  # the vertices from the source to t
    if dist[t] == INF:
        return []
    path = []
    while t != -1:
        path.append(t)
        t = parent[t]
    return path[::-1]

def zero_one_bfs(n, edges, src):               # weights 0 or 1 only: O(V + E)
    adj = adjacency(n, edges)
    dist = [INF] * n
    dist[src] = 0
    dq = deque([src])
    while dq:
        u = dq.popleft()
        for v, w in adj[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                if w == 0:
                    dq.appendleft(v)           # same distance as u: to the front
                else:
                    dq.append(v)               # one more: to the back
    return dist

def bellman_ford(n, edges, src):               # O(V * E); None if a negative cycle is reachable
    dist = [INF] * n
    dist[src] = 0
    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                changed = True
        if not changed:
            break
    for u, v, w in edges:                      # one more round: any improvement means a cycle
        if dist[u] + w < dist[v]:
            return None
    return dist

def floyd_warshall(n, edges):                  # all pairs: O(V^3) time, O(V^2) space
    d = [[0 if i == j else INF for j in range(n)] for i in range(n)]
    for u, v, w in edges:
        d[u][v] = min(d[u][v], w)
    for k in range(n):                         # k outermost: allow 0..k as stops
        for i in range(n):
            if d[i][k] == INF:
                continue
            for j in range(n):
                if d[i][k] + d[k][j] < d[i][j]:
                    d[i][j] = d[i][k] + d[k][j]
    return d

def path_cost(edges, p):                       # cheapest edge between each consecutive pair
    return sum(min(w for a, b, w in edges if (a, b) == (u, v)) for u, v in zip(p, p[1:]))

for _ in range(300):
    n = random.randint(1, 7)
    edges = [(random.randrange(n), random.randrange(n), random.randint(0, 9)) for _ in range(random.randint(0, 15))]
    s = random.randrange(n)
    dist, parent = dijkstra(n, edges, s)
    assert dist == bellman_ford(n, edges, s)
    for t in range(n):
        p = path_to(dist, parent, t)
        if p:
            assert p[0] == s and p[-1] == t and path_cost(edges, p) == dist[t]
        else:
            assert dist[t] == INF
    zo = [(u, v, w % 2) for u, v, w in edges]                # the same graph with 0/1 weights
    assert zero_one_bfs(n, zo, s) == dijkstra(n, zo, s)[0]
    pot = [random.randint(0, 9) for _ in range(n)]            # w + pot[u] - pot[v]: negative edges,
    neg = [(u, v, w + pot[u] - pot[v]) for u, v, w in edges]  # but every cycle keeps its total
    fw = floyd_warshall(n, neg)
    assert all(fw[i] == bellman_ford(n, neg, i) for i in range(n))
    a, b = random.randrange(n), random.randrange(n)           # plant a cycle a -> b -> a of weight -1
    bad = neg + [(s, a, 5), (a, b, 3), (b, a, -4)]
    assert bellman_ford(n, bad, s) is None and floyd_warshall(n, bad)[a][a] < 0
assert bellman_ford(4, [(0, 1, 1), (2, 3, 1), (3, 2, -3)], 0) == [0, 1, INF, INF]   # unreachable cycle

roads = [(0, 1, 4), (0, 2, 1), (2, 1, 2), (1, 3, 1), (2, 3, 5), (3, 4, 3)]
dist, parent = dijkstra(5, roads, 0)
zo = zero_one_bfs(5, [(u, v, w % 2) for u, v, w in roads], 0)
fw = floyd_warshall(5, roads + [(4, 1, -4)])
cycle = bellman_ford(5, roads + [(4, 1, -5)], 0) is None
print("dist", *dist, "| path", *path_to(dist, parent, 4), "| 0-1 BFS", *zo,
      "| d[4][3] =", fw[4][3], "| negative cycle:", "yes" if cycle else "no")
```

Output:
```text
dist 0 3 1 4 7 | path 0 2 1 3 4 | 0-1 BFS 0 0 1 1 2 | d[4][3] = -3 | negative cycle: yes
```

```javascript
const assert = require("node:assert");

class MinHeap {                                // a binary heap of [key, value] pairs
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0 && a[(i - 1) >> 1][0] > a[i][0]) {
      const p = (i - 1) >> 1;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        let m = i;
        for (const c of [2 * i + 1, 2 * i + 2]) if (c < a.length && a[c][0] < a[m][0]) m = c;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function adjacency(n, edges) {                 // directed [u, v, w] edges -> adjacency lists
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v, w] of edges) adj[u].push([v, w]);
  return adj;
}

function dijkstra(n, edges, src) {             // O((V + E) log V) time, O(V + E) space
  const adj = adjacency(n, edges);
  const dist = new Array(n).fill(Infinity), parent = new Array(n).fill(-1);
  dist[src] = 0;
  const heap = new MinHeap();
  heap.push([0, src]);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;                 // stale entry: u was already reached more cheaply
    for (const [v, w] of adj[u]) {
      if (d + w < dist[v]) {
        dist[v] = d + w;
        parent[v] = u;
        heap.push([d + w, v]);                 // lazy deletion: the old entry stays behind
      }
    }
  }
  return [dist, parent];
}

function pathTo(dist, parent, t) {             // the vertices from the source to t
  if (dist[t] === Infinity) return [];
  const path = [];
  for (; t !== -1; t = parent[t]) path.push(t);
  return path.reverse();
}

function zeroOneBfs(n, edges, src) {           // weights 0 or 1 only: O(V + E)
  const adj = adjacency(n, edges);
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;
  const front = [], back = [src];              // deque = front (a stack) + back (read from head)
  let head = 0;
  while (front.length || head < back.length) {
    const u = front.length ? front.pop() : back[head++];
    for (const [v, w] of adj[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        if (w === 0) front.push(v);            // same distance as u: to the front
        else back.push(v);                     // one more: to the back
      }
    }
  }
  return dist;
}

function bellmanFord(n, edges, src) {          // O(V * E); null if a negative cycle is reachable
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;
  for (let round = 1; round < n; round++) {
    let changed = false;
    for (const [u, v, w] of edges) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const [u, v, w] of edges) if (dist[u] + w < dist[v]) return null;   // still improving: a cycle
  return dist;
}

function floydWarshall(n, edges) {             // all pairs: O(V^3) time, O(V^2) space
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (const [u, v, w] of edges) d[u][v] = Math.min(d[u][v], w);
  for (let k = 0; k < n; k++)                  // k outermost: allow 0..k as stops
    for (let i = 0; i < n; i++) {
      if (d[i][k] === Infinity) continue;
      for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j];
    }
  return d;
}

const pathCost = (edges, p) => p.slice(1).reduce((sum, v, i) =>   // cheapest edge for each step
  sum + Math.min(...edges.filter(([a, b]) => a === p[i] && b === v).map(e => e[2])), 0);

const rnd = k => Math.floor(Math.random() * k);
for (let trial = 0; trial < 300; trial++) {
  const n = 1 + rnd(7);
  const edges = Array.from({ length: rnd(16) }, () => [rnd(n), rnd(n), rnd(10)]);
  const s = rnd(n);
  const [dist, parent] = dijkstra(n, edges, s);
  assert.deepStrictEqual(dist, bellmanFord(n, edges, s));
  for (let t = 0; t < n; t++) {
    const p = pathTo(dist, parent, t);
    if (p.length) assert.ok(p[0] === s && p.at(-1) === t && pathCost(edges, p) === dist[t]);
    else assert.strictEqual(dist[t], Infinity);
  }
  const zo = edges.map(([u, v, w]) => [u, v, w % 2]);                // the same graph with 0/1 weights
  assert.deepStrictEqual(zeroOneBfs(n, zo, s), dijkstra(n, zo, s)[0]);
  const pot = Array.from({ length: n }, () => rnd(10));              // w + pot[u] - pot[v]: negative edges,
  const neg = edges.map(([u, v, w]) => [u, v, w + pot[u] - pot[v]]);  // but every cycle keeps its total
  const fw = floydWarshall(n, neg);
  for (let i = 0; i < n; i++) assert.deepStrictEqual(fw[i], bellmanFord(n, neg, i));
  const a = rnd(n), b = rnd(n);                                       // plant a cycle a -> b -> a of weight -1
  const bad = [...neg, [s, a, 5], [a, b, 3], [b, a, -4]];
  assert.ok(bellmanFord(n, bad, s) === null && floydWarshall(n, bad)[a][a] < 0);
}
assert.deepStrictEqual(bellmanFord(4, [[0, 1, 1], [2, 3, 1], [3, 2, -3]], 0), [0, 1, Infinity, Infinity]);

const roads = [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 1], [2, 3, 5], [3, 4, 3]];
const [dist, parent] = dijkstra(5, roads, 0);
const zo = zeroOneBfs(5, roads.map(([u, v, w]) => [u, v, w % 2]), 0);
const fw = floydWarshall(5, [...roads, [4, 1, -4]]);
const cycle = bellmanFord(5, [...roads, [4, 1, -5]], 0) === null;
console.log("dist", ...dist, "| path", ...pathTo(dist, parent, 4), "| 0-1 BFS", ...zo,
  "| d[4][3] =", fw[4][3], "| negative cycle:", cycle ? "yes" : "no");
```

Output:
```text
dist 0 3 1 4 7 | path 0 2 1 3 4 | 0-1 BFS 0 0 1 1 2 | d[4][3] = -3 | negative cycle: yes
```

</details>
