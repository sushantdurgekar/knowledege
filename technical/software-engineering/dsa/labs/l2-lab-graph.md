---
title: "Graph toolkit: BFS paths, components and topological order"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Graph toolkit: BFS paths, components and topological order

> Data Structures & Algorithms L2 · about 90 min · modules m05, m06

Write the routines most medium graph problems are built on: an adjacency list from an edge list, the BFS shortest path (by number of edges) with the path itself, connected components with an iterative DFS, and a topological order that reports cycles (Kahn's algorithm).

## Before you start
- Modules 05 and 06

## Steps
1. Build an adjacency list from an edge list: a dict of lists in Python, a Map of arrays in JavaScript. Add both directions for an undirected graph.
2. `shortest_path(graph, start, goal)`: BFS that records each node's parent, then walks back from the goal to rebuild the path. Return an empty path if the goal can't be reached.
3. `components(n, edges)`: start an iterative DFS from every node not seen yet, and count the starts.
4. `topo_order(n, prereqs)`: Kahn's algorithm with in-degrees and a queue. If fewer than n nodes come out, there's a cycle, so return an empty list.
5. Test an unreachable node, start = goal, isolated nodes, a DAG with several valid orders (check the order is valid rather than equal to one answer) and a 3-node cycle.

## Prove it worked
- BFS returns the path itself, and an empty path when the goal can't be reached.
- Your topological order is checked for validity (every edge points forward), not compared with one fixed answer.
- A 3-node cycle gives an empty order.

## Break it (then fix it)
- Mark nodes as seen when you *pop* them instead of when you queue them, and count how often each node enters the queue on a dense graph.
- Write a recursive DFS and run it on path graphs of 1,000, 10,000 and 100,000 nodes in Python and in Node.js. Find where each one breaks, and explain why the iterative version never does.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
from collections import deque, defaultdict

def build_graph(edges, directed=False):
    graph = defaultdict(list)
    for u, v in edges:
        graph[u].append(v)
        if not directed:
            graph[v].append(u)
    return graph

def shortest_path(graph, start, goal):     # BFS: O(V + E)
    parent = {start: None}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        if node == goal:
            path = []
            while node is not None:
                path.append(node)
                node = parent[node]
            return path[::-1]
        for nxt in graph.get(node, ()):
            if nxt not in parent:          # mark when queued, not when popped
                parent[nxt] = node
                queue.append(nxt)
    return []

def components(n, edges):                  # iterative DFS: O(V + E)
    graph = build_graph(edges)
    seen, count = set(), 0
    for s in range(n):
        if s in seen:
            continue
        count += 1
        seen.add(s)
        stack = [s]
        while stack:
            node = stack.pop()
            for nxt in graph.get(node, ()):
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
    return count

def topo_order(n, prereqs):                # Kahn: O(V + E); prereqs are (before, after)
    graph = build_graph(prereqs, directed=True)
    indegree = [0] * n
    for _, after in prereqs:
        indegree[after] += 1
    queue = deque(v for v in range(n) if indegree[v] == 0)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in graph.get(node, ()):
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return order if len(order) == n else []   # leftovers are on, or downstream of, a cycle

roads = build_graph([("home", "park"), ("park", "zoo"), ("home", "shop"),
                     ("shop", "museum"), ("museum", "zoo"), ("lake", "cabin")])
assert shortest_path(roads, "home", "zoo") == ["home", "park", "zoo"]
assert shortest_path(roads, "home", "cabin") == [] and shortest_path(roads, "zoo", "zoo") == ["zoo"]
assert components(6, [(0, 1), (1, 2), (3, 4)]) == 3 and components(3, []) == 3
dag = [(0, 1), (0, 2), (1, 3), (2, 3)]
order = topo_order(4, dag)
pos = {v: i for i, v in enumerate(order)}
assert len(order) == 4 and all(pos[a] < pos[b] for a, b in dag)
assert topo_order(3, [(0, 1), (1, 2), (2, 0)]) == []
print(*shortest_path(roads, "home", "zoo"), "|", components(6, [(0, 1), (1, 2), (3, 4)]), "|", *order)
```

Output:
```text
home park zoo | 3 | 0 1 2 3
```

```javascript
const assert = require("node:assert");

function buildGraph(edges, directed = false) {
  const graph = new Map();
  const add = (u, v) => {
    if (!graph.has(u)) graph.set(u, []);
    graph.get(u).push(v);
  };
  for (const [u, v] of edges) {
    add(u, v);
    if (!directed) add(v, u);
  }
  return graph;
}

function shortestPath(graph, start, goal) {   // BFS: O(V + E)
  const parent = new Map([[start, null]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {   // a head index instead of shift()
    let node = queue[head];
    if (node === goal) {
      const path = [];
      for (; node !== null; node = parent.get(node)) path.push(node);
      return path.reverse();
    }
    for (const nxt of graph.get(node) ?? []) {
      if (!parent.has(nxt)) {               // mark when queued, not when popped
        parent.set(nxt, node);
        queue.push(nxt);
      }
    }
  }
  return [];
}

function components(n, edges) {             // iterative DFS: O(V + E)
  const graph = buildGraph(edges), seen = new Set();
  let count = 0;
  for (let s = 0; s < n; s++) {
    if (seen.has(s)) continue;
    count++;
    seen.add(s);
    const stack = [s];
    while (stack.length) {
      const node = stack.pop();
      for (const nxt of graph.get(node) ?? []) {
        if (!seen.has(nxt)) {
          seen.add(nxt);
          stack.push(nxt);
        }
      }
    }
  }
  return count;
}

function topoOrder(n, prereqs) {            // Kahn: O(V + E); prereqs are [before, after]
  const graph = buildGraph(prereqs, true);
  const indegree = new Array(n).fill(0);
  for (const [, after] of prereqs) indegree[after]++;
  const queue = [];
  for (let v = 0; v < n; v++) if (indegree[v] === 0) queue.push(v);
  for (let head = 0; head < queue.length; head++) {
    for (const nxt of graph.get(queue[head]) ?? []) {
      if (--indegree[nxt] === 0) queue.push(nxt);
    }
  }
  return queue.length === n ? queue : [];   // leftovers are on, or downstream of, a cycle
}

const roads = buildGraph([["home", "park"], ["park", "zoo"], ["home", "shop"],
                          ["shop", "museum"], ["museum", "zoo"], ["lake", "cabin"]]);
assert.deepStrictEqual(shortestPath(roads, "home", "zoo"), ["home", "park", "zoo"]);
assert.deepStrictEqual(shortestPath(roads, "home", "cabin"), []);
assert.deepStrictEqual(shortestPath(roads, "zoo", "zoo"), ["zoo"]);
assert.ok(components(6, [[0, 1], [1, 2], [3, 4]]) === 3 && components(3, []) === 3);
const dag = [[0, 1], [0, 2], [1, 3], [2, 3]];
const order = topoOrder(4, dag);
const pos = new Map(order.map((v, i) => [v, i]));
assert.ok(order.length === 4 && dag.every(([a, b]) => pos.get(a) < pos.get(b)));
assert.deepStrictEqual(topoOrder(3, [[0, 1], [1, 2], [2, 0]]), []);
console.log(...shortestPath(roads, "home", "zoo"), "|", components(6, [[0, 1], [1, 2], [3, 4]]), "|", ...order);
```

Output:
```text
home park zoo | 3 | 0 1 2 3
```

</details>
