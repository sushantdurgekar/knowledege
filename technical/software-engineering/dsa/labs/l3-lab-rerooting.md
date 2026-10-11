---
title: "Every root at once: rerooting"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Every root at once: rerooting

> Data Structures & Algorithms L3 · about 75 min · modules m06

Compute the sum of distances from every node of a tree (LeetCode 834, Sum of Distances in Tree) in O(n) with two iterative passes: one for subtree sizes and the root's answer, one that moves the root across each edge. Check it against a BFS from every node, then run it on a 100,000-node random tree and a 100,000-node path.

## Before you start
- Python 3.12+ and Node.js 22+
- Module 06

## Steps
1. Build adjacency lists, then a BFS order from root 0 with each node's parent. That order replaces recursion: walked backwards it visits children before parents, and walked forwards, parents before children.
2. Pass 1 (backwards): `size[v]` counts the nodes in v's subtree, and `down[v]`, the sum of distances from v to the nodes below it, gains `down[c] + size[c]` from each child c, because every node under c is one step further from v. The root's answer is `down[0]`.
3. Pass 2 (forwards): moving the root from p to its child v brings the size[v] nodes under v one step closer and pushes the other n − size[v] one step away, so `ans[v] = ans[p] - size[v] + (n - size[v])`.
4. Brute force: a BFS from every node, O(n²). Compare on 300 random trees of up to 30 nodes, with shuffled labels so node 0 isn't always where the tree started.
5. Run on two 100,000-node trees: a pseudo-random one from a tiny generator that builds the same tree in both languages, and a path, where every answer must match the formula i(i + 1)/2 + (n − 1 − i)(n − i)/2. Print the totals and the best meeting node as a checksum (never timings).

## Prove it worked
- The two passes match a BFS from every node on 300 random trees, including a single node.
- The 100,000-node path runs without recursion in both languages, every answer matches the formula, and the checksum line is identical in Python and JavaScript.
- You can explain the move from p to v in one sentence, and why two passes are O(n) when a BFS from every node is O(n²).

## Break it (then fix it)
- Run pass 1 forwards instead of backwards. Each node then adds a child's size before that child has counted its own children, so the path 0–1–2 gives 1 0 1 instead of 3 2 3, and the random tests fail.
- Write pass 1 as a recursive DFS. It still gets the 100,000-node random tree right, because that tree is only 26 levels deep, but on the 100,000-node path Python raises RecursionError and Node.js throws RangeError: Maximum call stack size exceeded. Random trees alone would never have caught it.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random
from collections import deque

def sum_of_distances(n, edges):                 # rerooting: O(n) time and space, no recursion
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    parent, order = [-1] * n, [0]               # BFS order from root 0: parents before children
    for u in order:                             # the list grows while we walk it
        for v in adj[u]:
            if v != parent[u]:
                parent[v] = u
                order.append(v)
    size, down = [1] * n, [0] * n               # down[v]: sum of distances from v into its subtree
    for v in reversed(order[1:]):               # pass 1, children before parents
        p = parent[v]
        size[p] += size[v]
        down[p] += down[v] + size[v]            # each node under v is one step further from p
    ans = [0] * n
    ans[0] = down[0]
    for v in order[1:]:                         # pass 2, parents before children: move the root p -> v
        ans[v] = ans[parent[v]] - size[v] + (n - size[v])   # size[v] nodes get closer, the rest further
    return ans

def brute_sums(n, edges):                       # BFS from every node: O(n^2)
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
    out = []
    for s in range(n):
        dist = [-1] * n
        dist[s] = 0
        queue = deque([s])
        while queue:
            u = queue.popleft()
            for v in adj[u]:
                if dist[v] == -1:
                    dist[v] = dist[u] + 1
                    queue.append(v)
        out.append(sum(dist))
    return out

def random_tree(n):                             # node i joins a random earlier node; labels shuffled
    label = random.sample(range(n), n)
    return [(label[i], label[random.randrange(i)]) for i in range(1, n)]

def lcg_tree(n, seed=1):                        # the same "random" tree in both languages
    x, edges = seed, []
    for i in range(1, n):
        x = x * 48271 % 2147483647              # x * 48271 < 2^53, so JavaScript gets it exactly too
        edges.append((i, x % i))
    return edges

for _ in range(300):
    n = random.randint(1, 30)
    edges = random_tree(n)
    assert sum_of_distances(n, edges) == brute_sums(n, edges), edges

n = 100_000
tree = sum_of_distances(n, lcg_tree(n))
path = sum_of_distances(n, [(i, i + 1) for i in range(n - 1)])
assert all(path[i] == i * (i + 1) // 2 + (n - 1 - i) * (n - i) // 2 for i in range(n))   # the formula for a path
sample = sum_of_distances(6, [(0, 1), (0, 2), (2, 3), (2, 4), (2, 5)])
print("sample", *sample, f"| random tree: total {sum(tree)}, best node {tree.index(min(tree))}",
      f"| path: total {sum(path)}, best node {path.index(min(path))}")
```

Output:
```text
sample 8 12 6 10 10 10 | random tree: total 200310852268, best node 1 | path: total 333333333300000, best node 49999
```

```javascript
const assert = require("node:assert");

function sumOfDistances(n, edges) {             // rerooting: O(n) time and space, no recursion
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);
  }
  const parent = new Array(n).fill(-1), order = [0];   // BFS order from root 0: parents before children
  for (let i = 0; i < order.length; i++) {
    const u = order[i];
    for (const v of adj[u]) {
      if (v !== parent[u]) {
        parent[v] = u;
        order.push(v);
      }
    }
  }
  const size = new Array(n).fill(1), down = new Array(n).fill(0);   // down[v]: distances from v into its subtree
  for (let i = n - 1; i > 0; i--) {             // pass 1, children before parents
    const v = order[i], p = parent[v];
    size[p] += size[v];
    down[p] += down[v] + size[v];               // each node under v is one step further from p
  }
  const ans = new Array(n).fill(0);
  ans[0] = down[0];
  for (let i = 1; i < n; i++) {                 // pass 2, parents before children: move the root p -> v
    const v = order[i];
    ans[v] = ans[parent[v]] - size[v] + (n - size[v]);   // size[v] nodes get closer, the rest further
  }
  return ans;
}

function bruteSums(n, edges) {                  // BFS from every node: O(n^2)
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
    adj[v].push(u);
  }
  return [...adj.keys()].map(s => {
    const dist = new Array(n).fill(-1), queue = [s];
    dist[s] = 0;
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head];
      for (const v of adj[u]) {
        if (dist[v] === -1) {
          dist[v] = dist[u] + 1;
          queue.push(v);
        }
      }
    }
    return dist.reduce((a, b) => a + b, 0);
  });
}

const rnd = k => Math.floor(Math.random() * k);
function randomTree(n) {                        // node i joins a random earlier node; labels shuffled
  const label = [...Array(n).keys()].sort(() => Math.random() - 0.5);
  return Array.from({ length: Math.max(n - 1, 0) }, (_, k) => [label[k + 1], label[rnd(k + 1)]]);
}

function lcgTree(n, seed = 1) {                 // the same "random" tree in both languages
  const edges = [];
  for (let i = 1, x = seed; i < n; i++) {
    x = (x * 48271) % 2147483647;               // x * 48271 < 2^53, so the product is exact
    edges.push([i, x % i]);
  }
  return edges;
}

for (let t = 0; t < 300; t++) {
  const n = 1 + rnd(30);
  const edges = randomTree(n);
  assert.deepStrictEqual(sumOfDistances(n, edges), bruteSums(n, edges), JSON.stringify(edges));
}

const n = 100_000;
const tree = sumOfDistances(n, lcgTree(n));
const path = sumOfDistances(n, Array.from({ length: n - 1 }, (_, i) => [i, i + 1]));
path.forEach((s, i) => assert.strictEqual(s, (i * (i + 1)) / 2 + ((n - 1 - i) * (n - i)) / 2));   // the formula for a path
const sum = a => a.reduce((x, y) => x + y, 0);
const best = a => a.reduce((b, x, i) => (x < a[b] ? i : b), 0);   // the first node with the smallest total
const sample = sumOfDistances(6, [[0, 1], [0, 2], [2, 3], [2, 4], [2, 5]]);
console.log("sample", ...sample, `| random tree: total ${sum(tree)}, best node ${best(tree)}`,
  `| path: total ${sum(path)}, best node ${best(path)}`);
```

Output:
```text
sample 8 12 6 10 10 10 | random tree: total 200310852268, best node 1 | path: total 333333333300000, best node 49999
```

</details>
