---
title: "Data Structures & Algorithms: misconceptions and traps"
track: technical
subject: dsa
created: 2026-10-08
updated: 2026-10-11
---
# Data Structures & Algorithms: misconceptions and traps

Sections are added by each hub level. Newest build replaces its own level's section.

## L1 Foundation (2026-10-09)

### Big-O: how work grows
- **“Two loops means O(n²).”** Only when one is *inside* the other. Two loops one after the other cost O(n) + O(n) = O(n).
- **“O(2n) is slower than O(n).”** Constants are dropped: O(2n) is O(n). Big-O compares how work grows, not exact speed.
- **“`x in my_list` is O(1) because it's one line.”** Membership on a list or array scans the elements: O(n). Only sets and maps give average O(1).
- **“An outer loop that doubles i, with an inner loop of i steps, is O(n log n).”** Add up the inner work: 1 + 2 + 4 + … stays under 2n, so the total is O(n). (A doubling loop *inside* a loop of n really is O(n log n): check which loop is which.)
- **“Space is only the variables I create.”** Recursion uses stack space: n nested calls is O(n) space even without a single list.
- **“O(1) means fast.”** O(1) means the cost doesn't grow with n. A constant-time step can still be slow: one network call is O(1) and takes milliseconds.

### Arrays, strings and prefix sums
- **“`insert(0, x)` / `unshift(x)` is as cheap as `append` / `push`.”** Adding at the front shifts every element: O(n). In a loop that's O(n²). Append and reverse once at the end, or use a deque (module 05).
- **“Building a string with `+=` in a loop is fine.”** Strings are immutable, so each `+=` may copy everything built so far: O(n²) in the worst case. Engines sometimes optimise it, but the reliable pattern is collect, then `join` once.
- **“`[[0] * cols] * rows` makes a grid.”** It makes `rows` references to the **same** row, so changing one cell changes a whole column. JavaScript's twin is `new Array(rows).fill(new Array(cols).fill(0))`. Build each row separately.
- **“Slicing is free.”** `a[i:j]`, `a.slice(i, j)`, `a + b` and `[...a]` copy: O(k) time and memory. Slicing inside a loop or a recursion can quietly turn O(n) into O(n²).
- **“A string's length is the number of characters people see.”** JavaScript counts UTF-16 units: `'😀'.length` is 2 and `s.split('')` cuts the emoji in half, while `[...s]` keeps it whole. In Python, `len('😀')` is 1. Both count code points, so emoji built from several code points (skin tones, flags) still count as more than one.
- **“The prefix array is the same length as the input.”** Give it n + 1 slots with `prefix[0] = 0`, so `sum(a[l..r]) = prefix[r + 1] − prefix[l]` also works when l = 0.

### Hash maps and sets
- **“Hash lookups are always O(1).”** They're O(1) on *average*. Many collisions (a bad hash or adversarial keys) degrade a lookup to O(n). Say “O(1) on average” in interviews.
- **“I can use a list as a dictionary key.”** Python keys must be hashable, so lists and sets raise `TypeError`: use a tuple or a string. A JavaScript `Map` accepts arrays but compares them by identity, so `m.get([1, 2])` misses unless it's the very same array.
- **“A plain JavaScript object is as good as a Map.”** Objects turn every key into a string (`o[1]` and `o['1']` collide), inherit keys like `toString`, and need O(n) `Object.keys(o).length` for the size. Use `Map` for general key → value data.
- **“In Two Sum, storing first and checking second is the same.”** Store first and a single 3 with target 6 pairs with itself. Check for the partner, then store.
- **“A dict or Map is sorted.”** They keep insertion order, not sorted order. For the smallest key, sort the keys or use a heap (L2).
- **“`d[x] += 1` counts straight away.”** A missing key raises `KeyError` in Python and gives `NaN` in JavaScript (`undefined + 1`). Use `d.get(x, 0) + 1`, `Counter` or `defaultdict(int)`, or `(m.get(x) ?? 0) + 1`.

### Two pointers and sliding windows
- **“Opposite-end pointers work on any array.”** The pair search needs **sorted** data: moving a pointer is only safe because everything beyond it is bigger (or smaller). On unsorted data, sort first (O(n log n)) or use a hash map (O(n)).
- **“The inner `while` makes a sliding window O(n²).”** `left` only moves forward, at most n times over the whole run. Every index enters once and leaves once: O(n).
- **“A shrinking window finds the longest subarray under a sum limit for any numbers.”** Only for non-negative numbers. A negative value can lower the sum later, so shrinking isn't safe. For an exact target (count or longest subarray summing to k), use prefix sums plus a hash map (LeetCode 560); a sum *limit* with negatives needs prefix sums plus a sorted structure or a monotonic stack (L2+).
- **“Recomputing `sum(a[i:i + k])` for each window is fine.”** That's O(k) per window and O(n·k) in total. Keep a running sum and update it in O(1).
- **“Window length is `right − left`.”** With inclusive ends `left..right` it's `right − left + 1`. Mixing inclusive and exclusive ends is the most common window bug: pick one convention and say it out loud.
- **“`while lo <= hi` and `while lo < hi` are the same here.”** For pairs of *different* items use `lo < hi`; with `<=` an item could pair with itself.

### Stacks, queues and deques
- **“`list.pop(0)` / `arr.shift()` makes a fine queue.”** Each removal can shift every remaining item: O(n), so n removals can cost O(n²) (V8 has a shortcut for smaller arrays, but don't rely on it). Use `collections.deque.popleft()` in Python and a head index or circular buffer in JavaScript.
- **“Peeking at an empty stack is harmless.”** Python's `stack[-1]` raises `IndexError`; JavaScript's `stack.at(-1)` quietly returns `undefined` and the bug shows up later. Check for emptiness first.
- **“To check brackets, just count them.”** Counts can't catch `([)]`: order and type matter. Compare each closing bracket with the top of the stack.
- **“Items left on the stack at the end don't matter.”** In bracket matching, leftovers mean unclosed brackets: `((` must be rejected.
- **“A monotonic stack is O(n²) because of the inner while.”** Each index is pushed once and popped at most once: O(n) in total.
- **“Python's `queue.Queue` is the queue for algorithms.”** `queue.Queue` is built for threads and adds locking overhead. For algorithms, use `collections.deque`.

### Linked lists
- **“Reverse by setting `cur.next = prev` first.”** Overwrite `cur.next` before saving it and the rest of the list is lost. Save `nxt = cur.next` first.
- **“The head never changes, so it needs no special case.”** Deleting or inserting at the front changes the head. A dummy node before the head removes the special case: return `dummy.next`.
- **“`fast.next.next` is always safe.”** Check `fast and fast.next` (`fast && fast.next`) first, in that order, or you'll dereference `None` / `null`.
- **“Two nodes with the same value are the same node.”** Cycle and intersection checks compare identity: `is` in Python and `===` on objects in JavaScript, not equal values.
- **“Linked lists beat arrays at everything except indexing.”** Nodes are scattered in memory, so walking a list is slower in practice, and finding *where* to insert is still O(n). The O(1) insert only applies when you already hold the node.
- **“Recursion is a free way to reverse a list.”** Recursive reversal uses O(n) call-stack space, and 100,000 nodes would blow past Python's default recursion limit of 1,000. Prefer the loop.

### Recursion
- **“Recursion without a base case stops eventually.”** It never stops by itself: it fills the call stack and crashes with `RecursionError` (Python) or `RangeError: Maximum call stack size exceeded` (JavaScript).
- **“Every recursive call automatically gets closer to the base case.”** Only if the input really shrinks. `f(n)` calling `f(n)` or `f(n + 1)`, or a negative n that skips past an `== 0` check, recurses forever. Guards like `n <= 0` are safer.
- **“Recursion costs no extra memory.”** Each pending call keeps a stack frame: depth d means O(d) extra space, and 100,000 levels crashes in both languages unless you rewrite it as a loop.
- **“Naive Fibonacci is O(n) because it's only n levels deep.”** Depth is n, but the number of calls is about 1.6ⁿ: exponential time. Memoisation brings it down to O(n).
- **“Slicing in recursive calls is fine.”** `f(a[1:])` or `f(s.slice(1))` copies the rest of the input at every level: O(n²) time and memory in total. Pass indexes instead.
- **“A mutable default argument makes a handy memo.”** In Python, `def f(n, memo={})` shares one dict across every call, forever, which surprises people in tests. Use `@functools.cache` or pass the memo explicitly.

### Sorting and binary search
- **“`[10, 9, 1].sort()` sorts numbers in JavaScript.”** Without a comparator JavaScript compares the items as text, giving `[1, 10, 9]`. Use `a.sort((x, y) => x - y)`.
- **“`mid = (lo + hi) / 2` is fine in JavaScript.”** `/` gives a fraction such as 4.5. Use `Math.floor((lo + hi) / 2)`; in Python use `//`.
- **“`while lo < hi` with `hi = mid − 1` is a working binary search.”** Mixing styles skips answers or loops forever. Closed: `lo <= hi` with `hi = mid − 1`. Half-open: `lo < hi` with `hi = mid`.
- **“Binary search works on any array.”** Only on sorted (or monotonic) data. Sorting first costs O(n log n), which only pays off if you search many times.
- **“`list.sort()` returns the sorted list.”** Python's `list.sort()` sorts in place and returns `None`, so `a = a.sort()` loses your list; use `sorted(a)` for a new one. JavaScript's `sort()` sorts in place *and* returns the same array; use `toSorted()` for a copy.
- **“Quicksort is always O(n log n).”** Bad pivots, such as always the first item on already-sorted input, make it O(n²). Random pivots make that very unlikely.

## L2 Proficient (2026-10-09)

### Binary trees: traversals and tree recursion
- **“Height always counts edges.”** Some books count edges (a single node has height 0); LeetCode's “maximum depth” counts nodes (a single node has depth 1). Either is fine: say which you use and keep the base case consistent.
- **“Inorder gives sorted output for any binary tree.”** Only for a binary *search* tree. For a general binary tree, inorder is just one visiting order.
- **“Tree recursion uses O(log n) space.”** It uses O(h). A balanced tree has h ≈ log n, but a skewed tree has h = n: a 100,000-node chain crashes default recursion in both Python and Node.js.
- **“Level order needs recursion.”** Breadth-first order uses a queue. Process `len(q)` nodes per round (or swap in a fresh array) to know where each level ends.
- **“Looking at a node's two children is enough to judge ‘balanced’ or ‘valid’.”** Many tree properties depend on whole subtrees. Return the summary the parent needs (height, min and max) from each call.
- **“A list works as the BFS queue.”** `list.pop(0)` is O(n) per call. Use `collections.deque.popleft()`; in JavaScript use a head index or a fresh array per level.

### Binary search trees and lowest common ancestor
- **“A BST is valid if every node is bigger than its left child and smaller than its right child.”** The rule covers whole subtrees. In [5, 1, 6, null, null, 3, 7] every parent–child pair looks fine, but 3 sits in 5's right subtree. Pass (low, high) bounds down.
- **“BST operations are O(log n).”** They're O(h). Inserting sorted data into a plain BST builds a chain with h = n. Only self-balancing trees guarantee O(log n).
- **“Python's `dict` or JavaScript's `Map` is a kind of BST.”** They're hash tables: no sorted order and no “next bigger key”. For sorted keys, keep a sorted list with `bisect` or use a sorted container.
- **“To delete a node with two children, just remove it.”** That breaks the tree apart. Copy in the inorder successor's (or predecessor's) value, then delete that node, which has at most one child.
- **“The LCA must be a different node from p and q.”** A node counts as its own descendant: if q is inside p's subtree, the LCA is p itself.
- **“0 and −1 make fine starting bounds.”** Values can be negative or huge. Start with `-inf` / `inf` (`-Infinity` / `Infinity` in JavaScript), or use `None` / `null` to mean “no bound”.

### Heaps and priority queues
- **“A heap is sorted.”** Only parent ≤ children holds. [1, 3, 2, 7, 4, 5, 6] is a valid min-heap but not sorted; only the root is guaranteed to be the minimum.
- **“Python's `heapq` has a flag for a max-heap.”** `heapq` is a min-heap. Push negated numbers (or tuples with a negated priority). Python 3.14 added `heappush_max` and friends, but they don't exist in 3.12–3.13.
- **“For the k largest items, use a max-heap of size k.”** Use a *min*-heap of size k: its root is the weakest of your current top k, which is exactly the one to evict.
- **“Heapify is O(n log n).”** Building a heap bottom-up is O(n). n separate pushes are O(n log n).
- **“You can push any records into `heapq`.”** When priorities tie, Python compares the next tuple element; if that's a dict or an object with no ordering, you get a `TypeError`. Add a counter as a tie-breaker.
- **“Re-sorting a JavaScript array after each insert is a priority queue.”** Each re-sort costs O(n) at best (TimSort on an almost-sorted array) and O(n log n) in general. A heap does each insert and removal in O(log n).

### Tries (prefix trees)
- **“`search('ca')` is true because ‘car’ is stored.”** Only if a word *ends* at that node. Search checks the end flag; starts-with doesn't. Forgetting the flag is the most common trie bug.
- **“A trie is always faster than a hash set.”** For whole-word lookups both read every character (hashing is O(L) too), and a hash set uses less memory. Tries win when you need prefix queries.
- **“Tries save memory because prefixes are shared.”** Every node is an object with its own map. With many words and few shared prefixes, a trie can use far more memory than the words themselves.
- **“Children come out in alphabetical order.”** Dicts and Maps keep insertion order, not sorted order. Sort the child keys (or use a 26-slot array) when order matters.
- **“Deleting a word means removing its last node.”** Other words may share the path. Clear the end flag, then remove nodes only while they have no children and don't end another word.
- **“Building `prefix + ch` strings while walking is free.”** Each concatenation copies the string. That's fine when collecting results, but for heavy searches keep a list of characters and join once.

### Graphs: representations, BFS and DFS
- **“Mark a vertex visited when you pop it from the BFS queue.”** Then different neighbours can queue the same vertex many times before it's popped, wasting time and memory. Mark it when you enqueue it.
- **“BFS finds the shortest path in any graph.”** Only when every edge costs the same. With weights, the fewest edges isn't the cheapest route: use Dijkstra (L3).
- **“Recursive DFS is fine on big grids.”** A 300 × 300 grid of land is a 90,000-deep recursion: far past Python's limit and risky in JavaScript. Use an explicit stack or BFS for big inputs.
- **“An undirected edge only needs to be stored once.”** In an adjacency list, add it in both directions (u → v and v → u), or half the neighbours go missing.
- **“Forgetting the visited set only makes the search slower.”** On any graph with a cycle, including every undirected edge (u → v → u), the search never ends.
- **“In JavaScript, `(d - 1) % 10` wraps 0 to 9 like Python.”** JavaScript's `%` keeps the sign, so `-1 % 10` is −1. Write `(d - 1 + 10) % 10`.

### Topological sort and cycle detection
- **“Every directed graph has a topological order.”** Only DAGs do. In a cycle (a → b → a) neither can go first. Kahn's algorithm shows it: the order comes out shorter than V.
- **“For ‘to take a you need b’, the edge is a → b.”** Prerequisites come first, so the edge is b → a. Reversing it reverses the order. Always say what an edge means before you code.
- **“In a directed DFS, reaching any visited vertex means a cycle.”** Two paths can meet without looping (a diamond: a → b, a → c, b → d, c → d). Only reaching a vertex still on the current path (grey) is a cycle.
- **“In an undirected DFS, any visited neighbour is a cycle.”** The edge you arrived by is stored both ways, so it leads straight back to the parent you came from. Skip the parent; any *other* visited neighbour means a cycle.
- **“The DFS postorder is the topological order.”** It's the reverse: a vertex is added after its descendants, so reverse the list.
- **“The topological order is unique.”** Usually there are many. If a problem wants one in particular, such as the smallest-first order, use a min-heap in Kahn's algorithm.

### Union-find (disjoint sets)
- **“find is O(1).”** Without path compression and union by size, a chain can grow n tall and find becomes O(n). With both, it's O(α(n)) amortised: effectively constant, but not literally O(1).
- **“union(a, b) can set parent[a] = b.”** Link the *roots*: `parent[find(b)] = find(a)` (or the other way round). Re-pointing `a` itself cuts it off from the rest of its old set.
- **“Union-find can remove a connection.”** It only merges. If edges can disappear, rebuild it or use another technique.
- **“Union-find finds the path between two nodes.”** It answers *whether* they're connected, not *how*. Use BFS or DFS for the route.
- **“Union-find detects cycles in directed graphs.”** It works for undirected graphs. For directed cycles, use DFS colours or Kahn's algorithm.
- **“A recursive find is always fine in Python.”** With union by size (or rank) a tree is at most log₂ n deep, about 20 levels for a million items, so recursion is fine. Without it, path compression alone can leave a chain n long until someone walks it, and a recursive find on that chain can pass Python's 1,000-call limit. The two-loop iterative find is safe either way.

### Backtracking: subsets, permutations, combinations
- **“`res.append(path)` saves the current path.”** It saves a reference to the one list you keep changing, so every saved entry ends up the same (often empty). Save a copy: `path[:]` / `[...path]`.
- **“Forgetting to undo a choice only affects that branch.”** The leftover item stays in `path` (or `used`) for every later branch and corrupts all the results that follow. Every choose needs a matching un-choose.
- **“Permutations need a start index, like combinations.”** Combinations use a start index so an earlier item is never picked again (order doesn't matter). Permutations reuse every unused item at each position (order matters), so they track `used` instead.
- **“Remove duplicate results by putting them in a set.”** It works but wastes time generating the duplicates. Sort first and skip equal neighbours at the same depth.
- **“Backtracking is roughly O(n²).”** It's exponential: 2ⁿ subsets or n! permutations. That's why inputs are small, and why you state the output size when giving the complexity.
- **“Building strings with `+` in every call is free.”** For short outputs it's fine, but a list `path` with append/pop avoids copying at every step; join only when you record.

### Dynamic programming: one dimension
- **“DP is just recursion.”** It's recursion *plus* reuse: without a cache or a table, overlapping subproblems make it exponential. Name the state and make sure each one is computed once.
- **“The base case doesn't matter much.”** Most DP bugs are base cases: for coin change dp[0] is 0 coins; for stairs it's 1 way (stand still). Check the recurrence by hand on the two smallest inputs.
- **“Start a minimum-DP table at 0.”** Then every amount looks free. Start at infinity (or amount + 1) for “impossible” and turn it into −1 at the end.
- **“Kadane's algorithm resets the sum to 0 whenever it goes negative.”** Only if you record the best sum *before* resetting and start the best at −∞. Clamping first (`cur = max(0, cur + x)`) or starting the best at 0 reports 0 for all-negative input like [−3, −1, −2], whose answer is −1. The safe form is `cur = max(x, cur + x)`, starting from the first element.
- **“`@cache` works on a function that takes a list.”** Lists aren't hashable, so `functools.cache` raises TypeError. Cache on indexes or tuples and keep the list outside the cached function.
- **“Top-down is always fine in Python.”** The recursion goes as deep as the chain of states: 10,000 stairs passes the default limit of about 1,000. Switch to the bottom-up loop.

### Dynamic programming: grids, knapsack, LCS and LIS
- **“The loop direction in a 1D knapsack doesn't matter.”** Looping capacity upwards lets an item be added again in the same pass (that's the unbounded knapsack). For 0/1 knapsack, loop capacity downwards.
- **“Coin change II: loop amounts on the outside and coins inside.”** That counts orderings (1 + 2 and 2 + 1 separately). Put the coins in the outer loop to count combinations.
- **“LCS and longest common substring share a recurrence.”** On a mismatch, LCS takes max(up, left). A substring must be contiguous, so it resets to 0, and the answer is the largest cell in the table.
- **“Off-by-one doesn't matter with a padded table.”** With an (n + 1) × (m + 1) table, dp[i][j] describes a[:i] and b[:j], so compare a[i − 1] with b[j − 1]. Mixing the two conventions is the most common 2D DP bug.
- **“The tails array in the fast LIS is the subsequence itself.”** Its length is right, but its contents can mix different subsequences. To rebuild the subsequence you need parent pointers.
- **“`[[0] * m] * n` makes a DP table.”** It makes n references to one row (the aliasing bug from L1), so every update leaks into every row. Build each row separately.

### Greedy algorithms and intervals
- **“If a greedy rule works on the examples, it's correct.”** Plausible rules fail on tiny counterexamples: “shortest interval first” and “biggest coin first” both break. Look for a counterexample, or write the exchange argument, before you trust it.
- **“Interval scheduling sorts by start time.”** Sorting by start keeps a long early meeting that blocks many others. Sort by end time; it's *merging* intervals that sorts by start.
- **“Touching intervals [1, 3] and [3, 5] always overlap.”** It depends on the problem: for meeting rooms, a meeting ending at 3 frees the room for one starting at 3; when merging, LeetCode treats them as overlapping. Read the statement and choose < or ≤ on purpose.
- **“Sorting the input in place is harmless.”** It changes the caller's data. Sort a copy (`sorted()` / `toSorted()`) unless changing the input is allowed.
- **“Greedy algorithms are O(n).”** Interval greedies are dominated by the sort, O(n log n); only the pass after it is O(n). Some greedies need no sort at all: the jump game and the gas station are O(n).
- **“Weighted intervals work the same way.”** Once intervals carry values, earliest-end greedy can be beaten; that version needs DP with binary search.

### Bit manipulation
- **“`x & (x - 1) === 0` tests for a power of two in JavaScript.”** In JavaScript, `===` binds tighter than `&` (as `==` does in C and Java), so that's `x & ((x - 1) === 0)`. Write `(x & (x - 1)) === 0`. Python's precedence is the other way round, so the bug only bites in JS: put the parentheses in everywhere.
- **“Python's `~5` is a huge positive number, like in a 32-bit language.”** Python ints have no width, so `~x` is always −x − 1: `~5` is −6. JavaScript gives −6 too, because its 32-bit integers are signed. Unsigned values like 4294967290 appear only if you mask (`& 0xFFFFFFFF`) or use `>>> 0`.
- **“Shifting left can't change the sign.”** In JavaScript, `1 << 31` is −2147483648 and `1 << 32` is 1 (the shift count is taken mod 32). Python just keeps growing: `1 << 32` is 4294967296.
- **“Kernighan's loop works on any int.”** A negative Python int has infinitely many 1 bits, so `while x: x &= x - 1` never ends. Mask first (`x & 0xFFFFFFFF`) to look at the 32-bit pattern. In JavaScript the 32-bit conversion stops it after at most 32 steps.
- **“Bitwise operators are safe on any JavaScript number.”** They cut values to 32 bits: `2 ** 32 | 0` is 0 and `2 ** 40 >> 1` is 0. For bigger values use arithmetic (`Math.floor(x / 2)`) or BigInt (`1n << 40n`), and don't mix BigInt with Number.
- **“XOR finds the odd one out whatever the counts are.”** XOR cancels pairs only. If the other values appear three times, count each bit position mod 3 (LeetCode 137).

## L3 Specialist (2026-10-09)

### Dijkstra's algorithm and 0-1 BFS
- **“Lazy deletion makes Dijkstra safe with negative edges.”** It can repair a distance that was popped too early, because the improved vertex is pushed and processed again. But then a vertex can be processed many times, so the O((V + E) log V) bound is gone, and a reachable negative cycle keeps it lowering distances (practically) forever. Code that never revisits a popped vertex simply returns wrong distances. With negative weights, use Bellman–Ford.
- **“Mark a vertex visited when you push it, as in BFS.”** A vertex's first push is often not its best: in the first example, vertex 1 is pushed at 5 and later improves to 3. A vertex is final only when it's popped. Marking on push freezes a distance that's too big.
- **“A JavaScript heap of `[dist, vertex]` arrays can use the default `<`.”** `<` compares arrays as strings: `[10, 1] < [9, 2]` is true because “10,1” sorts before “9,2”. Pass a comparator such as `(a, b) => a[0] < b[0]`. Python compares tuples item by item, so `heapq` orders them correctly.
- **“In JavaScript, `unshift` and `shift` make a fine deque for 0-1 BFS.”** Both can move every element, so each call can cost O(n) and the search can slow to quadratic time. Use a front stack plus a back array with a head index, as in the 0-1 BFS example, or a ring buffer: O(1) per operation.
- **“Adding the same constant to every weight removes negative edges, so Dijkstra then works.”** It changes the answer, because paths with more edges get a bigger penalty. A two-edge path of weights 1 + 1 beats a single edge of 3 (2 < 3); after adding 2 to every weight it loses (6 > 5). Johnson's algorithm reweights correctly, using vertex potentials from one Bellman–Ford run.
- **“For the longest path, run Dijkstra with a max-heap or negated weights.”** Negated weights are negative, so “popped means final” fails, and the longest simple path is NP-hard in general graphs. On a DAG, find the longest path with DP in topological order, in O(V + E).

### Bellman–Ford, Floyd–Warshall and minimum spanning trees
- **“For at most k flights, relaxing in place is fine.”** In place, a price set earlier in a round can be reused later in the same round, so one round can add several flights. Read from a copy of the previous round's prices, and run exactly k + 1 rounds.
- **“Floyd–Warshall's three loops can go in any order.”** k, the allowed middle vertex, must be outermost: each pass needs the previous pass finished for every pair. Only the order of i and j inside is free.
- **“A big number like 10**9 is a safe ∞.”** With negative edges, `10**9 + (-5) < 10**9`, so a vertex that was never reached seems to improve its neighbours. Use `float('inf')` / `Infinity`, where ∞ + w stays ∞, or skip any u whose distance is still the stand-in.
- **“An MST gives the shortest path from the root to every vertex.”** An MST minimises the total weight of all its edges, not each distance. In the triangle A–B 2, B–C 2, A–C 3, the MST route from A to C costs 4, but the direct edge costs 3.
- **“A Bellman–Ford run from one source finds every negative cycle.”** Only the cycles it can reach. To check the whole graph, start every dist at 0, as if a new source had a 0-weight edge to every vertex.
- **“Prim's and Kruskal's algorithms need non-negative weights.”** They only compare weights, so negative weights are fine. Adding a constant c to every weight adds (V − 1) × c to every spanning tree, so the cheapest tree stays the cheapest.

### Bridges, articulation points and Euler paths
- **“Skip every edge that leads back to the parent.”** With two parallel edges between u and v, the second one is a real cycle. Skipping by parent vertex ignores it and reports a false bridge. Skip only the arriving edge's id.
- **“A recursive DFS is fine for 10⁵ vertices.”** On a path-shaped graph the recursion is 10⁵ calls deep. Python stops at 1,000 by default (RecursionError), and Node's default call stack overflows long before 10⁵ nested calls (RangeError). Use an explicit stack of (vertex, arriving edge id, next neighbour index).
- **“Both endpoints of a bridge are articulation points.”** Not an endpoint of degree 1: removing that vertex leaves the rest connected. In a graph with a single edge, neither endpoint is an articulation point.
- **“The root is a cut vertex when some child has low[child] ≥ tin[root].”** That's always true for the root, because tin[root] is the smallest time. The root is a cut vertex only when it has two or more DFS children.
- **“The degree conditions alone guarantee an Euler path.”** The edges must also form one connected piece (weakly connected, for a directed graph): two separate cycles have every vertex balanced but no Euler circuit. A cheap check is that Hierholzer's result has E + 1 vertices.
- **“Hierholzer's walk is the answer in the order you walk it.”** The first walk can get stuck at the end vertex before every edge is used. The answer is the order in which vertices are popped (finished), reversed, which splices each detour in at the right place.

### Interval dynamic programming
- **“Fill dp[i][j] row by row, with i going up from 0.”** dp[i][j] reads row i + 1, which that order hasn't filled yet, so it silently uses the starting zeros. Loop by increasing length, or run i downwards and j upwards.
- **“In burst balloons, choose which balloon to burst first.”** After the first burst its two neighbours touch, so the left and right parts still affect each other. Choose the last balloon k between walls i and j: until it bursts, it keeps the two sides apart.
- **“A table of n² cells means O(n²) time.”** Each cell of a split-point DP tries O(n) values of k, so it's O(n³) time with O(n²) space. Only the peel-off-the-ends shape costs O(1) per cell.
- **“Cutting a stick needs a table over every position 0..n.”** n can be 10⁶, but there are at most 100 cuts. Index the table by the sorted cut points with 0 and n added: O(m³) time and O(m²) space for m = cuts + 2, whatever n is.
- **“Expanding around the n letters finds every palindrome.”** Even-length palindromes such as “abba” are centred on the gap between two letters. Try all 2n − 1 centres: n letters and n − 1 gaps.
- **“Longest palindromic substring and subsequence share a recurrence.”** A substring must be contiguous: pal[i][j] needs s[i] == s[j] and pal[i + 1][j − 1]. A subsequence may skip letters, so on a mismatch it takes max(dp[i + 1][j], dp[i][j − 1]).

### Bitmask dynamic programming
- **“Bitmask DP is fine for n = 40.”** 2⁴⁰ ≈ 1.1 × 10¹² states is far too many. Masks fit n up to about 20; for n near 40, split the items into two halves of about 2²⁰ each (meet in the middle).
- **“`1 << 31` is an ordinary positive number in JavaScript.”** Bit operators work on 32-bit signed integers, so `1 << 31` is −2147483648 and `1 << 32` is 1. JavaScript masks are safe up to n = 30; past that, use BigInt.
- **“`mask & 1 << i === 0` tests whether bit i is clear.”** Not in JavaScript: `===` binds tighter than `&`, so it means `mask & ((1 << i) === 0)`, which is always 0. Write `(mask >> i & 1) === 0`. Python groups `mask & 1 << i == 0` the way you meant, because its comparisons bind more loosely than `&`.
- **“An `Int32Array` filled with `Infinity` holds infinities.”** Integer typed arrays convert whatever they store: Infinity and NaN become 0, and 3.7 becomes 3. Use a `Float64Array` for Infinity, or a large sentinel such as 1e9 in an `Int32Array`.
- **“Enumerating every submask of every mask costs 4ⁿ.”** Each bit is outside the mask, in the mask only, or in both, so the total is 3ⁿ: about 4.8 million for n = 14, which is fine.
- **“A plain BFS over nodes solves Shortest Path Visiting All Nodes.”** The best walk may pass through a node twice, each time with a different set already seen. A visited-node check refuses the second visit, so the state must be (node, mask).

### DP on trees and rerooting
- **“Recursion is fine for any tree.”** Depth equals the tree's height. A 10⁵-node path raises RecursionError in Python (default limit 1,000 frames) and RangeError in Node.js. Process a precomputed DFS order instead.
- **“Skipping a node means robbing both of its children.”** Skipping only frees the children: each takes max(take, skip). Forcing them to be robbed misses trees where the grandchildren are worth more.
- **“The longest path through a node can use its longest child chain twice.”** A path joins the two longest chains from different children (top1 + top2 + 1 nodes). The node returns only top1 + 1 to its parent, because a path can't fork.
- **“Rerooting means running the DP again from every root.”** That's O(n²). Rerooting reuses the first pass: each move across an edge is an O(1) update, so all n roots cost O(n).
- **“The rerooting pass can walk the order backwards, like the first pass.”** ans[v] needs ans[parent] first, so the second pass walks the order forwards: parents before children.
- **“Sums of distances fit in an Int32Array.”** On a 10⁵-node path they reach about 5 × 10⁹, past 2³¹ − 1. Use a plain array or a Float64Array in JavaScript (exact up to 2⁵³); Python's ints don't overflow.

### Prefix sums, difference arrays and monotonic queues
- **“A shrinking window finds the shortest subarray with sum ≥ K for any numbers.”** Only when no number is negative. A negative number can make a longer window's sum smaller, so shrinking stops too early: for [84, −37, 32, 40, 95] and K = 167 it reports 5, but [32, 40, 95] has length 3. Use prefix sums with an increasing deque.
- **“A rectangle's sum is the corner value minus the strip above and the strip to the left.”** The block above and to the left lies in both strips, so it gets subtracted twice: add P[r1][c1] back once.
- **“A difference array lets you read a[i] cheaply between updates.”** Reading a[i] means summing d[0..i], which is O(n). Difference arrays suit many updates followed by one read pass; for reads mixed with updates, keep the difference array in a Fenwick tree (module 08).
- **“Popping several items per step makes the sliding-window maximum O(n × k).”** Each index is pushed once and popped at most once over the whole run, so all the pops together cost O(n): O(1) amortised per step.
- **“In JavaScript, `shift()` is fine for the front of the deque.”** `shift()` can cost O(n) per call, because the remaining items move down one place; over a run that can be O(n²). These windows never add at the front, so keep a head index: read `dq[head]` and do `head++`.
- **“A sweep can handle starts and ends at the same position in any order.”** With half-open ranges [start, end), a passenger who gets out at 5 frees a seat for one who gets in at 5, so −v must come first, or the load briefly looks too high. Sorting (position, change) pairs does this, because the negative change sorts first.

### Fenwick trees (binary indexed trees)
- **“A Fenwick tree can start at index 0.”** `0 & -0` is 0, so an update at index 0 would loop forever and a query at 0 would stop at once. Use slots 1..n and shift 0-based positions up by one.
- **“`update(i, v)` sets a[i] to v.”** It adds v. To set a value, add v − a[i], which means keeping a plain copy of the array, as LeetCode 307 needs.
- **“tree[i] holds the prefix sum up to i.”** Only when i is a power of two. tree[i] covers just the lowbit(i) values ending at i: tree[6] is a[5] + a[6], and tree[7] is a[7] alone.
- **“A Fenwick tree does range minimum the same way.”** A range sum is query(r) − query(l − 1), but a minimum can't be subtracted away. With arbitrary updates, use a segment tree (module 09).
- **“Building the tree takes n updates, so O(n log n).”** Copying the values in and then adding each tree[i] once into tree[i + (i & −i)] builds the same tree in O(n).
- **“For LeetCode 493, compressing only the values is enough.”** The threshold 2 × nums[j] is usually not one of the values, so it has no rank. Compress the values and the doubled values together, or binary-search for the number of values ≤ 2 × nums[j].

### Segment trees and lazy propagation
- **“A segment tree has 2n − 1 nodes, so 2n slots are always enough.”** In the recursive layout (children at 2x and 2x + 1), an n that isn't a power of two leaves gaps, and the indexes can reach almost 4n. Allocate 4n, or use the bottom-up layout, which needs exactly 2n.
- **“Recursion is too deep for Python on a segment tree.”** The depth is about log₂ n: around 18 calls for n = 10⁵, and about 31 for a dynamic tree over [0, 10⁹). Python's limit of 1,000 frames is far away. (Recursion is slower than a loop in Python, which is one reason the bottom-up tree is popular.)
- **“A lazy tag means the node's own value is out of date.”** The node's value is always right; the tag records what its children still owe. Push it down before visiting them.
- **“With a lazy range add, a node's sum goes up by v.”** Every element in the node's range goes up by v, so the sum goes up by v × (hi − lo + 1). The max (or min) goes up by just v.
- **“Pending tags always combine by adding.”** Adds combine by adding, but an assignment replaces everything below it, so a new assignment overwrites the old tag. Pushing an empty assignment tag must change nothing, which is why it needs a “no tag” marker.
- **“Coordinates up to 10⁹ need an array of 4 × 10⁹ slots.”** Compress the coordinates when every query is known in advance, or create nodes only when they are needed (a dynamic segment tree): O(log C) new nodes per operation.

### String matching: KMP, the Z-function and rolling hashes
- **“KMP restarts at the next start position after a mismatch, just more cleverly.”** That's the naive search. KMP never moves backwards in the text: it keeps k, the length still matched, and falls back through π. That's why it stays O(n + m) even on aaaa…ab.
- **“The `while` loop inside the prefix function makes it O(n²).”** Each fallback lowers k, and k rises by at most 1 per character, so all the fallbacks together number at most n: O(n) amortised, like a stack where each item is popped at most once.
- **“Any separator works in pattern + “#” + text.”** It must appear in neither string. With pattern “a” and text “a#a”, the combined string “a#a#a” has π = 0 0 1 2 3, so the second match is missed: π at its end is 3, not 1. Pick a character outside the alphabet, or use the streaming KMP, which needs no separator.
- **“Equal rolling hashes mean equal strings.”** Different strings can share a hash: with base 10 and M = 13, “141” and “115” both hash to 11. Confirm every hit character by character, or use two independent moduli so that a false match becomes very unlikely (but not impossible).
- **“In JavaScript, `(h * base + c) % mod` is fine for any modulus.”** Only while every intermediate value stays below 2⁵³. With mod ≈ 10⁹ and base 131 the largest is about 1.3 × 10¹¹, which is fine. Multiplying two hash values, or porting C++ code that hashes modulo a number near 2⁶¹, produces values above 2⁵³ that are silently rounded. Use BigInt for those.
- **“`str.find` and `indexOf` are guaranteed O(n + m).”** Neither Python nor JavaScript promises a worst-case bound for its built-in search. Both are fast in practice and fine for LC 28, but when the bound matters, or the interviewer asks for it, write KMP or Z.

### Number theory: gcd, primes and modular arithmetic
- **“`(a * b) % p` is safe in JavaScript.”** Only while a × b stays below 2⁵³. Two residues mod 1,000,000,007 can multiply to about 10¹⁸, which rounds silently. Use BigInt, or a modulus below about 9 × 10⁷.
- **“`%` always gives a remainder from 0 to m − 1.”** In Python, yes. In JavaScript, `%` keeps the sign of the left side: `-7 % 3` is −1. After a subtraction, normalise with `((a % m) + m) % m`.
- **“You can divide modulo m the normal way.”** Plain division breaks: multiply by the inverse instead, a^(p − 2) mod p for a prime p (Fermat), or extended Euclid when gcd(a, m) = 1. If a and m share a factor, no inverse exists.
- **“The sieve must cross out the multiples of p starting from 2p.”** That works, but starting at p² is enough: every smaller multiple k·p with k < p was already crossed out by a prime factor of k. The cost is O(n log log n) either way.
- **“lcm(a, b) = a × b / gcd(a, b) is always fine in code.”** Mathematically, yes, but a × b can overflow a fixed-size integer (or pass 2⁵³ in JavaScript) even when the lcm fits. Divide first: a / gcd(a, b) × b.
- **“Fermat's little theorem gives an inverse for any modulus.”** Only for a prime modulus p, and only for a not divisible by p. For a composite like 1337 = 7 × 191, use extended Euclid, and only when gcd(a, m) = 1.

### Counting and games: digit DP and game theory
- **“A good first move is any move that looks strong.”** A move is good only if it leaves the rival in a *losing* position, one from which every reply hands you back a win. Build the answer up from the base case instead of judging moves by feel.
- **“Greedy play (always take the bigger pile) is optimal.”** Not in general: in [1, 5, 2] the first player loses whichever end they take, and in [1, 5, 233, 7] the winning first move is the small 1, because it keeps 233 for later. Use the score-difference DP.
- **“In Nim, you win by emptying the biggest pile.”** You win by moving to a position whose XOR is 0. If the XOR is already 0 on your turn, every move loses against perfect play.
- **“Add the Grundy numbers to value a sum of games.”** Combine them with XOR, not +. Two games with Grundy number 1 make a losing sum (1 XOR 1 = 0), while 1 + 1 = 2 would wrongly suggest a win.
- **“Digit DP can drop the tight flag after the first digit.”** tight must be carried the whole way: it stays true only while every digit so far equals n's digit. Dropping it counts numbers bigger than n.
- **“Memoising on (position, tight) is always enough.”** The state must hold everything the rest depends on: the previous digit (no consecutive 1s), a count so far, a remainder. Leaving something out makes the cached answers wrong.
