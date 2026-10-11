---
title: "Bridges, cut vertices and an Euler path"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Bridges, cut vertices and an Euler path

> Data Structures & Algorithms L3 · about 90 min · modules m03

Find every bridge and cut vertex of an undirected graph with one low-link DFS, written with an explicit stack so it survives a 100,000-vertex path in Python. Then build a directed Euler path with Hierholzer's algorithm, and check both against brute force on random small graphs.

## Before you start
- Python 3.12+ and Node.js 22+
- Module 03

## Steps
1. `bridges_and_cuts(n, edges)` returns the bridges as sorted (smaller, larger) pairs and the cut vertices in order, like module 03's version. Store the graph as adjacency lists of (neighbour, edge id); each vertex gets a discovery time `tin` and a low-link value `low`: the smallest `tin` its DFS subtree can reach with one back edge.
2. Make the DFS iterative: a stack of (vertex, id of the edge it was reached by), plus `nxt[u]`, the next adjacency index to try. Skip only the edge you arrived by (by its id), so a repeated edge counts as a second route.
3. When vertex u is finished, pop it and update its parent p: `low[p] = min(low[p], low[u])`. The edge p–u is a bridge when `low[u] > tin[p]`, and p is a cut vertex when `low[u] >= tin[p]`, except a DFS root, which is a cut vertex only when it has two or more DFS children.
4. `euler_path(n, edges)` for a directed graph: check the degrees (every vertex balanced, except at most one start with one extra out-edge and one end with one extra in-edge), then walk unused edges with a stack, adding a vertex to the path whenever it's stuck. Reverse the path at the end, and return an empty one if any edge was never used.
5. Test 400 random graphs (up to 8 vertices, with self-loops and repeated edges) against brute force: remove each edge or vertex and count the components. For Euler paths, compare with a brute force that tries every order of the edges, and check that the path uses each edge exactly once.

## Prove it worked
- Bridges and cut vertices match the remove-and-count brute force on 400 random graphs, and a repeated edge is never a bridge.
- The 100,000-vertex path gives 99,999 bridges and 99,998 cut vertices in both languages, with no recursion error.
- Every Euler path follows the edges and uses each one exactly once. In the example, the walk goes 0 → 3 → 4, gets stuck, and then splices in the detour 0 → 1 → 2 → 0.

## Break it (then fix it)
- Skip every edge back to the parent vertex instead of only the edge you arrived by. The brute-force check soon fails, and `bridges_and_cuts(2, [(0, 1), (0, 1)])` now reports the double edge 0–1 as a bridge.
- Write the same DFS recursively and run it on the 100,000-vertex path: Python raises RecursionError (its default limit is 1,000 frames) and Node.js throws RangeError: Maximum call stack size exceeded.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random

def bridges_and_cuts(n, edges):                 # undirected; O(V + E) time and space, no recursion
    adj = [[] for _ in range(n)]
    for i, (u, v) in enumerate(edges):
        adj[u].append((v, i))
        adj[v].append((u, i))
    tin, low, nxt = [-1] * n, [0] * n, [0] * n  # nxt[u]: the next adjacency index to try
    bridges, cut, timer = [], set(), 0
    for root in range(n):
        if tin[root] != -1:
            continue
        tin[root] = low[root] = timer
        timer += 1
        stack, root_kids = [(root, -1)], 0      # (vertex, id of the edge it was reached by)
        while stack:
            u, came_by = stack[-1]
            if nxt[u] < len(adj[u]):
                v, eid = adj[u][nxt[u]]
                nxt[u] += 1
                if eid == came_by:              # skip only that edge, so a parallel edge counts
                    continue
                if tin[v] == -1:                # tree edge: go down
                    tin[v] = low[v] = timer
                    timer += 1
                    stack.append((v, eid))
                    if u == root:
                        root_kids += 1
                else:                           # back edge (or a self-loop)
                    low[u] = min(low[u], tin[v])
            else:                               # u is finished: report to its parent
                stack.pop()
                if stack:
                    p = stack[-1][0]
                    low[p] = min(low[p], low[u])
                    if low[u] > tin[p]:
                        bridges.append((min(p, u), max(p, u)))
                    if low[u] >= tin[p] and p != root:
                        cut.add(p)
        if root_kids > 1:                       # the root is a cut vertex only with 2+ children
            cut.add(root)
    return sorted(bridges), sorted(cut)         # bridges as (smaller, larger) pairs, cut vertices

def euler_path(n, edges):                       # directed; Hierholzer, O(V + E); [] if none
    out, diff = [[] for _ in range(n)], [0] * n # diff: out-degree minus in-degree
    for u, v in edges:
        out[u].append(v)
        diff[u] += 1
        diff[v] -= 1
    starts = [v for v in range(n) if diff[v] == 1]
    if not edges or any(abs(d) > 1 for d in diff) or len(starts) > 1:
        return []
    start = starts[0] if starts else edges[0][0]
    nxt, stack, path = [0] * n, [start], []
    while stack:
        u = stack[-1]
        if nxt[u] < len(out[u]):
            stack.append(out[u][nxt[u]])        # walk on along an unused edge
            nxt[u] += 1
        else:
            path.append(stack.pop())            # stuck: u joins the path (built backwards)
    path.reverse()
    return path if len(path) == len(edges) + 1 else []   # edges left over: not connected

def components(n, edges, skip=-1):              # brute force: count components without vertex skip
    adj = [[] for _ in range(n)]
    for u, v in edges:
        if skip not in (u, v):
            adj[u].append(v)
            adj[v].append(u)
    seen, count = {skip}, 0
    for s in range(n):
        if s not in seen:
            count += 1
            seen.add(s)
            stack = [s]
            while stack:
                for v in adj[stack.pop()]:
                    if v not in seen:
                        seen.add(v)
                        stack.append(v)
    return count

def has_euler_path(edges):                      # brute force: try every order of the edges
    used = [False] * len(edges)
    def walk(at, left):
        if left == 0:
            return True
        for i, (u, v) in enumerate(edges):
            if not used[i] and (at is None or at == u):
                used[i] = True
                found = walk(v, left - 1)
                used[i] = False
                if found:
                    return True
        return False
    return bool(edges) and walk(None, len(edges))

for _ in range(400):
    n = random.randint(1, 8)
    edges = [(random.randrange(n), random.randrange(n)) for _ in range(random.randint(0, 10))]
    c = components(n, edges)
    bridges, cut = bridges_and_cuts(n, edges)
    assert bridges == sorted((min(u, v), max(u, v)) for i, (u, v) in enumerate(edges)
                             if components(n, edges[:i] + edges[i + 1:]) > c)
    assert cut == [v for v in range(n) if components(n, edges, skip=v) > c]
for _ in range(400):
    n = random.randint(1, 5)
    if random.random() < 0.5:                   # the steps of a random walk always have an Euler path
        walk = [random.randrange(n) for _ in range(random.randint(2, 8))]
        edges = list(zip(walk, walk[1:]))
        random.shuffle(edges)
    else:
        edges = [(random.randrange(n), random.randrange(n)) for _ in range(random.randint(0, 7))]
    p = euler_path(n, edges)
    assert bool(p) == has_euler_path(edges)
    if p:                                       # follows the edges and uses each one exactly once
        assert sorted(zip(p, p[1:])) == sorted(edges)

n = 100_000                                     # a path this long would break a recursive DFS
bridges, cut = bridges_and_cuts(n, [(i, i + 1) for i in range(n - 1)])
assert len(bridges) == n - 1 and len(cut) == n - 2
g = [(0, 1), (1, 2), (2, 0), (2, 3), (3, 4), (4, 5), (5, 3), (5, 6)]
br, cv = bridges_and_cuts(7, g)
trip = euler_path(5, [(3, 4), (0, 3), (1, 2), (2, 0), (0, 1)])
print("bridges", *(f"{a}-{b}" for a, b in br), "| cut vertices", *cv,
      f"| path of {n}: {len(bridges)} bridges, {len(cut)} cut vertices | Euler", *trip)
```

Output:
```text
bridges 2-3 5-6 | cut vertices 2 3 5 | path of 100000: 99999 bridges, 99998 cut vertices | Euler 0 1 2 0 3 4
```

```javascript
const assert = require("node:assert");

const byPair = (a, b) => a[0] - b[0] || a[1] - b[1];

function bridgesAndCuts(n, edges) {             // undirected; O(V + E) time and space, no recursion
  const adj = Array.from({ length: n }, () => []);
  edges.forEach(([u, v], i) => { adj[u].push([v, i]); adj[v].push([u, i]); });
  const tin = new Array(n).fill(-1), low = new Array(n).fill(0), nxt = new Array(n).fill(0);
  const bridges = [], cut = new Set();
  let timer = 0;
  for (let root = 0; root < n; root++) {
    if (tin[root] !== -1) continue;
    tin[root] = low[root] = timer++;
    const stack = [[root, -1]];                 // [vertex, id of the edge it was reached by]
    let rootKids = 0;
    while (stack.length) {
      const [u, cameBy] = stack.at(-1);
      if (nxt[u] < adj[u].length) {
        const [v, eid] = adj[u][nxt[u]++];
        if (eid === cameBy) continue;           // skip only that edge, so a parallel edge counts
        if (tin[v] === -1) {                    // tree edge: go down
          tin[v] = low[v] = timer++;
          stack.push([v, eid]);
          if (u === root) rootKids++;
        } else low[u] = Math.min(low[u], tin[v]);   // back edge (or a self-loop)
      } else {                                  // u is finished: report to its parent
        stack.pop();
        if (stack.length) {
          const p = stack.at(-1)[0];
          low[p] = Math.min(low[p], low[u]);
          if (low[u] > tin[p]) bridges.push([Math.min(p, u), Math.max(p, u)]);
          if (low[u] >= tin[p] && p !== root) cut.add(p);
        }
      }
    }
    if (rootKids > 1) cut.add(root);            // the root is a cut vertex only with 2+ children
  }
  return [bridges.sort(byPair), [...cut].sort((a, b) => a - b)];   // [smaller, larger] pairs, vertices
}

function eulerPath(n, edges) {                  // directed; Hierholzer, O(V + E); [] if none
  const out = Array.from({ length: n }, () => []), diff = new Array(n).fill(0);
  for (const [u, v] of edges) {
    out[u].push(v);
    diff[u]++;                                  // diff: out-degree minus in-degree
    diff[v]--;
  }
  const starts = diff.flatMap((d, v) => (d === 1 ? [v] : []));
  if (!edges.length || diff.some(d => Math.abs(d) > 1) || starts.length > 1) return [];
  const nxt = new Array(n).fill(0), stack = [starts.length ? starts[0] : edges[0][0]], path = [];
  while (stack.length) {
    const u = stack.at(-1);
    if (nxt[u] < out[u].length) stack.push(out[u][nxt[u]++]);   // walk on along an unused edge
    else path.push(stack.pop());                // stuck: u joins the path (built backwards)
  }
  path.reverse();
  return path.length === edges.length + 1 ? path : [];   // edges left over: not connected
}

function components(n, edges, skip = -1) {      // brute force: count components without vertex skip
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) if (u !== skip && v !== skip) { adj[u].push(v); adj[v].push(u); }
  const seen = new Set([skip]);
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (seen.has(s)) continue;
    count++;
    seen.add(s);
    const stack = [s];
    while (stack.length) {
      for (const v of adj[stack.pop()]) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    }
  }
  return count;
}

function hasEulerPath(edges) {                  // brute force: try every order of the edges
  const used = new Array(edges.length).fill(false);
  const walk = (at, left) => {
    if (left === 0) return true;
    for (let i = 0; i < edges.length; i++) {
      if (used[i] || (at !== null && at !== edges[i][0])) continue;
      used[i] = true;
      const found = walk(edges[i][1], left - 1);
      used[i] = false;
      if (found) return true;
    }
    return false;
  };
  return edges.length > 0 && walk(null, edges.length);
}

const rnd = k => Math.floor(Math.random() * k);
const key = pairs => pairs.map(([u, v]) => `${u}>${v}`).sort().join(" ");
for (let t = 0; t < 400; t++) {
  const n = 1 + rnd(8);
  const edges = Array.from({ length: rnd(11) }, () => [rnd(n), rnd(n)]);
  const c = components(n, edges);
  const [bridges, cut] = bridgesAndCuts(n, edges);
  const want = edges.filter((_, i) => components(n, edges.toSpliced(i, 1)) > c);
  assert.deepStrictEqual(bridges, want.map(([u, v]) => [Math.min(u, v), Math.max(u, v)]).sort(byPair));
  assert.deepStrictEqual(cut, [...Array(n).keys()].filter(v => components(n, edges, v) > c));
}
for (let t = 0; t < 400; t++) {
  const n = 1 + rnd(5);
  let edges;
  if (Math.random() < 0.5) {                    // the steps of a random walk always have an Euler path
    const walk = Array.from({ length: 2 + rnd(7) }, () => rnd(n));
    edges = walk.slice(1).map((v, i) => [walk[i], v]).sort(() => Math.random() - 0.5);
  } else edges = Array.from({ length: rnd(8) }, () => [rnd(n), rnd(n)]);
  const p = eulerPath(n, edges);
  assert.strictEqual(p.length > 0, hasEulerPath(edges));
  if (p.length) assert.strictEqual(key(p.slice(1).map((v, i) => [p[i], v])), key(edges));   // uses each edge once
}

const n = 100_000;                              // a path this long would break a recursive DFS
const [bridges, cut] = bridgesAndCuts(n, Array.from({ length: n - 1 }, (_, i) => [i, i + 1]));
assert.ok(bridges.length === n - 1 && cut.length === n - 2);
const g = [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 3], [5, 6]];
const [br, cv] = bridgesAndCuts(7, g);
const trip = eulerPath(5, [[3, 4], [0, 3], [1, 2], [2, 0], [0, 1]]);
console.log("bridges", ...br.map(([a, b]) => `${a}-${b}`), "| cut vertices", ...cv,
  `| path of ${n}: ${bridges.length} bridges, ${cut.length} cut vertices | Euler`, ...trip);
```

Output:
```text
bridges 2-3 5-6 | cut vertices 2 3 5 | path of 100000: 99999 bridges, 99998 cut vertices | Euler 0 1 2 0 3 4
```

</details>
