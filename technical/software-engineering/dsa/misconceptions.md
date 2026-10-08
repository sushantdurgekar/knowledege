---
title: "Data Structures & Algorithms: misconceptions and traps"
track: technical
subject: dsa
created: 2026-10-08
updated: 2026-10-08
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
