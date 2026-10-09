---
title: "Data Structures & Algorithms: misconceptions and traps"
track: technical
subject: dsa
created: 2026-10-08
updated: 2026-10-09
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
