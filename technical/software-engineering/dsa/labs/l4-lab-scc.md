---
title: "Strongly connected components and 2-SAT"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l4, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Strongly connected components and 2-SAT

> Data Structures & Algorithms L4 · about 75 min · modules m01

Write both SCC algorithms without recursion, make them check each other and a brute force, then build a 2-SAT solver on top and test it against trying every assignment.

## Before you start
- Python 3.12+ and Node.js 22+
- Module 01

## Steps
1. `tarjan_scc(n, edges)` returning (count, comp), with components numbered in reverse topological order. Use an explicit stack of [vertex, next edge index] instead of recursion, and lower low[u] only through vertices still on the vertex stack.
2. `kosaraju(n, edges)`: one pass over the graph recording vertices as they finish, then one pass over the reversed graph taking vertices in reverse finishing order. Components come out in topological order.
3. `two_sat(n, clauses)`: literal 2x means x and 2x + 1 means ¬x. Each clause (a, b) adds the edges a ^ 1 → b and b ^ 1 → a. Report no solution when comp[2x] == comp[2x + 1]; otherwise set x true when comp[2x] < comp[2x + 1] (Tarjan's numbering).
4. A brute force for each: mutual reachability by a search from every vertex, and every assignment for formulas with up to 6 variables.
5. Tests: 300 random graphs (n ≤ 9, with self-loops and repeated edges) where Tarjan, Kosaraju and the brute force agree and every condensation edge points the right way; 300 random formulas; and a 100,000-vertex ring to prove there's no recursion limit.

## Prove it worked
- Tarjan, Kosaraju and the reachability brute force put the same vertices together on every random graph.
- Every edge between components goes from a higher to a lower Tarjan number, and from a lower to a higher Kosaraju number.
- two_sat returns None exactly when brute force finds no assignment, and every assignment it returns satisfies every clause.

## Break it (then fix it)
- Let Tarjan lower low[u] through any visited vertex, not only those still on the stack. Find a small graph where two separate SCCs get merged (a cross edge into a finished component does it).
- In two_sat, set x true when comp[2x] > comp[2x + 1] instead. Find a satisfiable formula for which the returned assignment breaks a clause.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
def tarjan_scc(n, edges):                 # (count, comp); components numbered in reverse topological order
    graph = [[] for _ in range(n)]
    for u, v in edges:
        graph[u].append(v)
    tin, low, comp = [-1] * n, [0] * n, [-1] * n
    on_stack, stack = [False] * n, []
    timer = count = 0
    for s in range(n):
        if tin[s] != -1:
            continue
        tin[s] = low[s] = timer
        timer += 1
        stack.append(s)
        on_stack[s] = True
        work = [[s, 0]]                   # [vertex, next edge index]: an explicit call stack
        while work:
            u, i = work[-1]
            if i < len(graph[u]):
                work[-1][1] += 1
                v = graph[u][i]
                if tin[v] == -1:          # tree edge: "call" v
                    tin[v] = low[v] = timer
                    timer += 1
                    stack.append(v)
                    on_stack[v] = True
                    work.append([v, 0])
                elif on_stack[v]:         # an edge back into the current component
                    low[u] = min(low[u], tin[v])
            else:                         # u is finished: "return" to its parent
                work.pop()
                if work:
                    p = work[-1][0]
                    low[p] = min(low[p], low[u])
                if low[u] == tin[u]:      # u is the root of an SCC: pop the whole SCC
                    while True:
                        w = stack.pop()
                        on_stack[w] = False
                        comp[w] = count
                        if w == u:
                            break
                    count += 1
    return count, comp

def kosaraju(n, edges):
    graph, rev = [[] for _ in range(n)], [[] for _ in range(n)]
    for u, v in edges:
        graph[u].append(v)
        rev[v].append(u)
    order, seen = [], [False] * n
    for s in range(n):                    # pass 1: record vertices by finishing time
        if seen[s]:
            continue
        seen[s] = True
        work = [[s, 0]]
        while work:
            u, i = work[-1]
            if i < len(graph[u]):
                work[-1][1] += 1
                v = graph[u][i]
                if not seen[v]:
                    seen[v] = True
                    work.append([v, 0])
            else:
                work.pop()
                order.append(u)           # u's search is done: record it
    comp, count = [-1] * n, 0
    for s in reversed(order):             # pass 2: the reversed graph, latest finisher first
        if comp[s] != -1:
            continue
        comp[s] = count
        stack = [s]
        while stack:
            u = stack.pop()
            for v in rev[u]:
                if comp[v] == -1:
                    comp[v] = count
                    stack.append(v)
        count += 1
    return count, comp

def two_sat(n, clauses):                  # literal 2*x means x, 2*x + 1 means not x
    edges = []
    for a, b in clauses:                  # (a or b) gives: not a -> b, and not b -> a
        edges.append((a ^ 1, b))
        edges.append((b ^ 1, a))
    _, comp = tarjan_scc(2 * n, edges)
    result = []
    for x in range(n):
        if comp[2 * x] == comp[2 * x + 1]:
            return None                   # x and not x imply each other
        result.append(comp[2 * x] < comp[2 * x + 1])
    return result
import itertools, random
random.seed(1)

def reach_matrix(n, edges):                       # brute force: same SCC when each vertex reaches the other
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
    reach = []
    for s in range(n):
        seen, stack = {s}, [s]
        while stack:
            for v in adj[stack.pop()]:
                if v not in seen:
                    seen.add(v)
                    stack.append(v)
        reach.append(seen)
    return [[v in reach[u] and u in reach[v] for v in range(n)] for u in range(n)]

def condensation(edges, comp):                    # the DAG of components, without repeated edges
    return sorted({(comp[u], comp[v]) for u, v in edges if comp[u] != comp[v]})

for _ in range(300):
    n = random.randint(1, 9)
    es = [(random.randrange(n), random.randrange(n)) for _ in range(random.randint(0, 18))]
    (c1, k1), (c2, k2), same = tarjan_scc(n, es), kosaraju(n, es), reach_matrix(n, es)
    assert c1 == c2 == len({tuple(row) for row in same})
    assert all((k1[u] == k1[v]) == same[u][v] == (k2[u] == k2[v]) for u in range(n) for v in range(n))
    assert all(a > b for a, b in condensation(es, k1))       # Tarjan numbers sinks first
    assert all(a < b for a, b in condensation(es, k2))       # Kosaraju numbers sources first

def holds(asg, a, b):
    lit = lambda l: asg[l >> 1] if l % 2 == 0 else not asg[l >> 1]
    return lit(a) or lit(b)

for _ in range(300):
    n = random.randint(1, 6)
    cl = [(random.randrange(2 * n), random.randrange(2 * n)) for _ in range(random.randint(0, 12))]
    sol = two_sat(n, cl)
    brute = any(all(holds(asg, a, b) for a, b in cl) for asg in itertools.product([False, True], repeat=n))
    assert (sol is not None) == brute
    assert sol is None or all(holds(sol, a, b) for a, b in cl)

N = 100_000
ring = [(i, (i + 1) % N) for i in range(N)]
print("scc: 300 graphs ok | 2-sat: 300 formulas ok | 100000-vertex ring:", tarjan_scc(N, ring)[0], kosaraju(N, ring)[0], "component")
```

Output:
```text
scc: 300 graphs ok | 2-sat: 300 formulas ok | 100000-vertex ring: 1 1 component
```

```javascript
function tarjanScc(n, edges) {            // [count, comp]; components numbered in reverse topological order
  const graph = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) graph[u].push(v);
  const tin = new Array(n).fill(-1), low = new Array(n).fill(0), comp = new Array(n).fill(-1);
  const onStack = new Array(n).fill(false), stack = [];
  let timer = 0, count = 0;
  for (let s = 0; s < n; s++) {
    if (tin[s] !== -1) continue;
    tin[s] = low[s] = timer++;
    stack.push(s);
    onStack[s] = true;
    const work = [[s, 0]];                // [vertex, next edge index]: an explicit call stack
    while (work.length) {
      const top = work[work.length - 1], u = top[0];
      if (top[1] < graph[u].length) {
        const v = graph[u][top[1]++];
        if (tin[v] === -1) {              // tree edge: "call" v
          tin[v] = low[v] = timer++;
          stack.push(v);
          onStack[v] = true;
          work.push([v, 0]);
        } else if (onStack[v]) low[u] = Math.min(low[u], tin[v]);   // an edge back into the current component
      } else {                            // u is finished: "return" to its parent
        work.pop();
        if (work.length) {
          const p = work[work.length - 1][0];
          low[p] = Math.min(low[p], low[u]);
        }
        if (low[u] === tin[u]) {          // u is the root of an SCC: pop the whole SCC
          let w;
          do {
            w = stack.pop();
            onStack[w] = false;
            comp[w] = count;
          } while (w !== u);
          count++;
        }
      }
    }
  }
  return [count, comp];
}

function kosaraju(n, edges) {
  const graph = Array.from({ length: n }, () => []), rev = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    graph[u].push(v);
    rev[v].push(u);
  }
  const order = [], seen = new Array(n).fill(false);
  for (let s = 0; s < n; s++) {           // pass 1: record vertices by finishing time
    if (seen[s]) continue;
    seen[s] = true;
    const work = [[s, 0]];
    while (work.length) {
      const top = work[work.length - 1], u = top[0];
      if (top[1] < graph[u].length) {
        const v = graph[u][top[1]++];
        if (!seen[v]) {
          seen[v] = true;
          work.push([v, 0]);
        }
      } else {
        work.pop();
        order.push(u);                    // u's search is done: record it
      }
    }
  }
  const comp = new Array(n).fill(-1);
  let count = 0;
  for (let k = order.length - 1; k >= 0; k--) {   // pass 2: the reversed graph, latest finisher first
    const s = order[k];
    if (comp[s] !== -1) continue;
    comp[s] = count;
    const stack = [s];
    while (stack.length) {
      const u = stack.pop();
      for (const v of rev[u]) if (comp[v] === -1) { comp[v] = count; stack.push(v); }
    }
    count++;
  }
  return [count, comp];
}

function twoSat(n, clauses) {             // literal 2*x means x, 2*x + 1 means not x
  const edges = [];
  for (const [a, b] of clauses) {         // (a or b) gives: not a -> b, and not b -> a
    edges.push([a ^ 1, b]);
    edges.push([b ^ 1, a]);
  }
  const [, comp] = tarjanScc(2 * n, edges);
  const result = [];
  for (let x = 0; x < n; x++) {
    if (comp[2 * x] === comp[2 * x + 1]) return null;   // x and not x imply each other
    result.push(comp[2 * x] < comp[2 * x + 1]);
  }
  return result;
}
const assert = require("node:assert");

function reachMatrix(n, edges) {                  // brute force: same SCC when each vertex reaches the other
  const adj = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) adj[u].push(v);
  const reach = [];
  for (let s = 0; s < n; s++) {
    const seen = new Set([s]), stack = [s];
    while (stack.length) for (const v of adj[stack.pop()]) if (!seen.has(v)) { seen.add(v); stack.push(v); }
    reach.push(seen);
  }
  return Array.from({ length: n }, (_, u) => Array.from({ length: n }, (_, v) => reach[u].has(v) && reach[v].has(u)));
}

const rnd = k => Math.floor(Math.random() * k);
for (let t = 0; t < 300; t++) {
  const n = 1 + rnd(9);
  const es = Array.from({ length: rnd(19) }, () => [rnd(n), rnd(n)]);
  const [c1, k1] = tarjanScc(n, es), [c2, k2] = kosaraju(n, es), same = reachMatrix(n, es);
  assert.strictEqual(c1, c2);
  assert.strictEqual(c1, new Set(same.map(r => r.join())).size);
  for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
    assert.strictEqual(k1[u] === k1[v], same[u][v]);
    assert.strictEqual(k2[u] === k2[v], same[u][v]);
  }
  for (const [u, v] of es) if (k1[u] !== k1[v]) { assert.ok(k1[u] > k1[v]); assert.ok(k2[u] < k2[v]); }
}

const holds = (asg, a, b) => (a % 2 === 0 ? asg[a >> 1] : !asg[a >> 1]) || (b % 2 === 0 ? asg[b >> 1] : !asg[b >> 1]);
for (let t = 0; t < 300; t++) {
  const n = 1 + rnd(6);
  const cl = Array.from({ length: rnd(13) }, () => [rnd(2 * n), rnd(2 * n)]);
  const sol = twoSat(n, cl);
  let brute = false;
  for (let m = 0; m < 1 << n && !brute; m++) {
    const asg = Array.from({ length: n }, (_, i) => Boolean((m >> i) & 1));
    if (cl.every(([a, b]) => holds(asg, a, b))) brute = true;
  }
  assert.strictEqual(sol !== null, brute);
  if (sol) assert.ok(cl.every(([a, b]) => holds(sol, a, b)));
}

const N = 100000;
const ring = Array.from({ length: N }, (_, i) => [i, (i + 1) % N]);
console.log("scc: 300 graphs ok | 2-sat: 300 formulas ok | 100000-vertex ring:", tarjanScc(N, ring)[0], kosaraju(N, ring)[0], "component");
```

Output:
```text
scc: 300 graphs ok | 2-sat: 300 formulas ok | 100000-vertex ring: 1 1 component
```

</details>
