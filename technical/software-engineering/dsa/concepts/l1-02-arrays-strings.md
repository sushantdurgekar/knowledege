---
title: "Arrays, strings and prefix sums"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l1, dsa-l1-m02]
status: new
created: 2026-10-09
updated: 2026-10-09
sources:
  - url: https://docs.python.org/3/tutorial/datastructures.html#more-on-lists
    accessed: 2026-10-09
  - url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array
    accessed: 2026-10-09
  - url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length
    accessed: 2026-10-09
  - url: https://usaco.guide/silver/prefix-sums
    accessed: 2026-10-09
  - url: https://wiki.python.org/moin/TimeComplexity
    accessed: 2026-10-09
---
# Arrays, strings and prefix sums

> Data Structures & Algorithms · L1 Foundation · Arrays, strings, hashing & pointers · about 80 min · hub module `m02` ([open the hub](https://claude.ai/artifact/SWv6N1Uh2oiFNH1mxefcNr))

## Why it matters
Arrays are the most-used structure in every language and in most interview problems. Knowing what's cheap (reading `a[i]`) and what's secretly expensive (inserting at the front, building strings in a loop, slicing) is half of every solution.

## Pre-question (answer before reading)
**Q:** How can a computer jump straight to `a[700000]` without looking at the 700,000 items before it?

<details><summary>Answer</summary>

The items (or references to them) sit side by side in memory, all the same size, so the address of item i is start + i × size. That's one multiplication and one addition: O(1).

</details>

## 🍎 Story time (kid version)
**The toy room and the treasure-map road trip: The egg carton**

Ben's eggs sit in a long carton with numbered cups, all the same size. To reach cup 7 he doesn't count: cup 7 is exactly seven cup-widths from the start, so his finger lands on it straight away. Adding an egg at the far end is easy too. But when Tara wants to squeeze a new egg into cup 0, every egg has to shuffle one cup along, and with a long carton that takes ages. When the carton is full, they fetch one twice as big and move every egg across, which is slow, but it doesn't happen often.

| In the story | In code |
|---|---|
| Numbered cups, all the same size | Contiguous memory: address = start + i × size |
| Finger lands on cup 7 straight away | Indexing `a[i]` is O(1) |
| Squeezing an egg into cup 0 | Inserting at the front is O(n): everything shifts |
| Moving to a carton twice as big | Resizing a dynamic array: O(n) now and then, O(1) amortised |

**Where the story breaks:** Python lists and JavaScript arrays hold references to objects, not the objects themselves, so the cups are the same size even when the items aren't. Very sparse JavaScript arrays may even be stored like hash maps by the engine.

## Key ideas (grown-up version)
- **An array is one contiguous block**: items (or references to them) sit side by side, so `a[i]` is O(1). Python `list` and JavaScript `Array` are *dynamic* arrays that grow automatically.
- **The middle and the front are expensive**: inserting or deleting at position i shifts everything after it, O(n − i). Appending and popping at the end are O(1) amortised.
- **Strings are immutable** in Python and JavaScript: every change builds a new string. `+=` in a loop *can* cost O(n²); collect pieces and join once with `''.join(parts)` / `parts.join('')`.
- **Prefix sums**: build `prefix[i + 1] = prefix[i] + a[i]` once in O(n) with `prefix[0] = 0`; then any range sum `a[l..r]` is `prefix[r + 1] − prefix[l]` in O(1).
- **In place saves memory**: reverse with two indexes swapping inward; rotate right by k with three reversals. Both are O(n) time and O(1) extra space.
- **Grids**: `grid[r][c]`, and a full scan costs O(rows × cols). Build every row separately: `[[0] * cols for _ in range(rows)]`, never `[[0] * cols] * rows`.
- **Hidden copies**: slicing (`a[i:j]`, `a.slice(i, j)`), `a + b` and spreading (`[...a]`) all copy, costing O(k) time and memory.

## Diagrams
**Inserting 7 at index 1 shifts everything after it**

| before | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| value | 3 | 8 | 1 | 9 | 4 |

| after | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 3 | **7** | 8 | 1 | 9 | 4 |
| pointer |  |  | → | → | → | → |

_Four items moved to make room for one. At the front, all n items move: O(n)._

**Prefix sums: running totals with a 0 in front**

| a | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| value | 2 | 4 | 1 | 5 | 3 |

| prefix | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 0 | **2** | 6 | 7 | **12** | 15 |

_sum of a[1..3] = prefix[4] − prefix[1] = 12 − 2 = 10, which is 4 + 1 + 5._

## Comparisons
**Everyday array and string idioms**

| Task | Python | JavaScript | Cost |
|---|---|---|---|
| Length | `len(a)` | `a.length` | O(1) |
| Join pieces into one string | `''.join(parts)` | `parts.join('')` | O(total length) |
| Reversed copy | `a[::-1]` | `a.toReversed()` or `[...a].reverse()` | O(n) |
| Reverse in place | `a.reverse()` | `a.reverse()` | O(n) time, O(1) extra |
| Character code | `ord('a')` gives 97 | `'a'.charCodeAt(0)` gives 97 | O(1) |
| Split into characters | `list(s)` | `[...s]` (keeps simple emoji whole) | O(n) |
| Grid of zeros | `[[0] * cols for _ in range(rows)]` | `Array.from({ length: rows }, () => new Array(cols).fill(0))` | O(rows × cols) |

## Code (JavaScript + Python)
### Prefix sums: any range sum in O(1)
```python
def build_prefix(a):
    prefix = [0] * (len(a) + 1)
    for i, x in enumerate(a):
        prefix[i + 1] = prefix[i] + x      # sum of a[0..i]
    return prefix

def range_sum(prefix, l, r):               # sum of a[l..r], inclusive
    return prefix[r + 1] - prefix[l]

a = [2, 4, 1, 5, 3]
p = build_prefix(a)
print(*p)
print(range_sum(p, 1, 3), range_sum(p, 0, 4), range_sum(p, 2, 2))
```

Output:
```text
0 2 6 7 12 15
10 15 1
```

- line 2: n + 1 slots with `prefix[0] = 0`, so ranges starting at 0 need no special case.
- line 8: O(1) per query after the O(n) build.

```javascript
function buildPrefix(a) {
  const prefix = new Array(a.length + 1).fill(0);
  for (let i = 0; i < a.length; i++)
    prefix[i + 1] = prefix[i] + a[i];      // sum of a[0..i]
  return prefix;
}

const rangeSum = (prefix, l, r) => prefix[r + 1] - prefix[l];   // a[l..r], inclusive

const a = [2, 4, 1, 5, 3];
const p = buildPrefix(a);
console.log(p.join(" "));
console.log(rangeSum(p, 1, 3), rangeSum(p, 0, 4), rangeSum(p, 2, 2));
```

Output:
```text
0 2 6 7 12 15
10 15 1
```

- line 2: n + 1 slots with `prefix[0] = 0`, so ranges starting at 0 need no special case.
- line 8: O(1) per query after the O(n) build.

### Rotate right by k in place: three reversals
```python
def reverse(a, lo, hi):                    # reverse a[lo..hi] in place
    while lo < hi:
        a[lo], a[hi] = a[hi], a[lo]
        lo += 1
        hi -= 1

def rotate_right(a, k):                    # O(n) time, O(1) extra space
    n = len(a)
    if n == 0:
        return
    k %= n                                 # rotating by n changes nothing
    reverse(a, 0, n - 1)                   # 7 6 5 4 3 2 1
    reverse(a, 0, k - 1)                   # 5 6 7 | 4 3 2 1
    reverse(a, k, n - 1)                   # 5 6 7 | 1 2 3 4

a = [1, 2, 3, 4, 5, 6, 7]
rotate_right(a, 3)
print(*a)
```

Output:
```text
5 6 7 1 2 3 4
```

- line 12: Reversing everything puts the last k items at the front, but backwards.
- line 13: Fix the order of the first k items, then of the rest.

```javascript
function reverse(a, lo, hi) {             // reverse a[lo..hi] in place
  while (lo < hi) {
    [a[lo], a[hi]] = [a[hi], a[lo]];
    lo++;
    hi--;
  }
}

function rotateRight(a, k) {              // O(n) time, O(1) extra space
  const n = a.length;
  if (n === 0) return;
  k %= n;                                 // rotating by n changes nothing
  reverse(a, 0, n - 1);                   // 7 6 5 4 3 2 1
  reverse(a, 0, k - 1);                   // 5 6 7 | 4 3 2 1
  reverse(a, k, n - 1);                   // 5 6 7 | 1 2 3 4
}

const a = [1, 2, 3, 4, 5, 6, 7];
rotateRight(a, 3);
console.log(a.join(" "));
```

Output:
```text
5 6 7 1 2 3 4
```

- line 3: Destructuring swap: swaps two slots without a temporary variable you have to name.
- line 13: Reversing everything puts the last k items at the front, but backwards.

### The shared-row bug (and the fix)
```python
rows, cols = 3, 4
bad = [[0] * cols] * rows                  # 3 references to ONE row
good = [[0] * cols for _ in range(rows)]   # 3 separate rows
bad[0][0] = 1
good[0][0] = 1
print(sum(r[0] for r in bad), sum(r[0] for r in good))
```

Output:
```text
3 1
```

- line 2: `* rows` copies the reference, not the row: every row is the same list.
- line 6: Writing one cell of `bad` changed the whole first column.

```javascript
const rows = 3, cols = 4;
const bad = new Array(rows).fill(new Array(cols).fill(0));        // ONE row, shared 3 times
const good = Array.from({ length: rows }, () => new Array(cols).fill(0));
bad[0][0] = 1;
good[0][0] = 1;
console.log(bad.reduce((s, r) => s + r[0], 0), good.reduce((s, r) => s + r[0], 0));
```

Output:
```text
3 1
```

- line 2: `fill` puts the same array object in every slot.
- line 3: `Array.from` calls the function once per row, so each row is new.

## Worked example
**Problem.** Find the leftmost index where the sum of everything to its left equals the sum of everything to its right (LeetCode 724, Find Pivot Index). Return −1 if there isn't one.

1. Brute force: for each index, add up the left side and the right side. That's O(n) per index, O(n²) in total.
2. Spot the repeated work: as i moves right, the left sum only grows by one item. Keep a running `left` instead of recomputing it.
3. The right side is everything else: `right = total − left − a[i]`. Compute `total` once.
4. One pass for the total and one for the scan, with two numbers of memory: O(n) time, O(1) extra space. It's the prefix-sum idea without storing the array.

```python
def pivot_index(nums):
    total = sum(nums)
    left = 0
    for i, x in enumerate(nums):
        if left == total - left - x:       # right side = total - left - x
            return i
        left += x                          # x joins the left side
    return -1

print(pivot_index([1, 7, 3, 6, 5, 6]), pivot_index([1, 2, 3]), pivot_index([2, 1, -1]))
```

Output:
```text
3 -1 0
```

```javascript
function pivotIndex(nums) {
  const total = nums.reduce((s, x) => s + x, 0);
  let left = 0;
  for (let i = 0; i < nums.length; i++) {
    if (left === total - left - nums[i]) return i;   // right side = total - left - x
    left += nums[i];                                 // x joins the left side
  }
  return -1;
}

console.log(pivotIndex([1, 7, 3, 6, 5, 6]), pivotIndex([1, 2, 3]), pivotIndex([2, 1, -1]));
```

Output:
```text
3 -1 0
```

**Answer.** 3 for [1, 7, 3, 6, 5, 6]: the left side 1 + 7 + 3 = 11 equals the right side 5 + 6 = 11. O(n) time and O(1) extra space.

## Your turn (faded example)
**Problem.** Given daily prices, return the best profit from buying on one day and selling on a later day (0 if no profit is possible). Finish the update line.

- ✓ Brute force tries every buy day with every later sell day: O(n²).
- **If you sell today, which earlier day should you have bought on?**
  <details><summary>Answer</summary>The cheapest day so far, so keep a running minimum `lowest`.</details>
- **What is the time and space complexity of one pass that tracks `lowest` and `best`?**
  <details><summary>Answer</summary>O(n) time and O(1) extra space.</details>

Starter:
```python
def max_profit(prices):
    best = 0
    lowest = float("inf")          # cheapest price seen so far
    for p in prices:
        lowest = min(lowest, p)
        best = ...                 # TODO: what if you sell today?
    return best

print(max_profit([7, 1, 5, 3, 6, 4]))   # expect 5
```

```javascript
function maxProfit(prices) {
  let best = 0;
  let lowest = Infinity;         // cheapest price seen so far
  for (const p of prices) {
    lowest = Math.min(lowest, p);
    best = /* TODO: what if you sell today? */ 0;
  }
  return best;
}

console.log(maxProfit([7, 1, 5, 3, 6, 4]));   // expect 5
```

<details><summary>Full solution</summary>

```python
def max_profit(prices):
    best = 0
    lowest = float("inf")
    for p in prices:
        lowest = min(lowest, p)          # buy day comes first
        best = max(best, p - lowest)     # sell today?
    return best

print(max_profit([7, 1, 5, 3, 6, 4]), max_profit([7, 6, 4, 3, 1]))
```

Output:
```text
5 0
```

```javascript
function maxProfit(prices) {
  let best = 0;
  let lowest = Infinity;
  for (const p of prices) {
    lowest = Math.min(lowest, p);        // buy day comes first
    best = Math.max(best, p - lowest);   // sell today?
  }
  return best;
}

console.log(maxProfit([7, 1, 5, 3, 6, 4]), maxProfit([7, 6, 4, 3, 1]));
```

Output:
```text
5 0
```

</details>

## Socratic checks and quiz (answers hidden)
**1. What does this print?**

```python
a = [2, 4, 1, 5, 3]
prefix = [0]
for x in a:
    prefix.append(prefix[-1] + x)
print(prefix[4] - prefix[1])
```

```javascript
const a = [2, 4, 1, 5, 3];
const prefix = [0];
for (const x of a) prefix.push(prefix[prefix.length - 1] + x);
console.log(prefix[4] - prefix[1]);
```

- A. 10
- B. 12
- C. 9
- D. 15

<details><summary>Answer</summary>

10. prefix is 0 2 6 7 12 15, and prefix[4] − prefix[1] = 12 − 2 = 10: the sum of a[1..3] = 4 + 1 + 5.

</details>

**2. What does this print?**

```python
grid = [[0] * 3] * 2
grid[0][1] = 5
print(grid[1][1])
```

```javascript
const grid = new Array(2).fill(new Array(3).fill(0));
grid[0][1] = 5;
console.log(grid[1][1]);
```

- A. 5
- B. 0
- C. It raises an error
- D. 3

<details><summary>Answer</summary>

5. Both rows are the same object, so writing grid[0][1] also changes grid[1][1].

</details>

**3. Which of these are O(1), or O(1) amortised, on a Python list or JavaScript array? (choose 3)**

- A. `a[i] = x`
- B. `a.append(x)` / `a.push(x)`
- C. `a.pop()` from the end
- D. `a.pop(0)` / `a.shift()`
- E. `a[::-1]` / `a.toReversed()`

<details><summary>Answer</summary>

`a[i] = x`, `a.append(x)` / `a.push(x)`, `a.pop()` from the end. Removing from the front shifts everything (O(n)), and a reversed copy touches all n items.

</details>

**4. You must answer 100,000 queries of the form “sum of a[l..r]?” on 100,000 numbers that never change. What's the best approach?**

- A. Build a prefix-sum array once in O(n), then answer each query in O(1)
- B. Sum each range with a loop: it's simpler and just as fast
- C. Sort the array first, then add up the range
- D. Put the values in a hash set

<details><summary>Answer</summary>

Build a prefix-sum array once in O(n), then answer each query in O(1). Loops could cost up to 10¹⁰ steps in total. The prefix array costs O(n) once, then O(1) per query. Sorting would scramble the positions the queries refer to.

</details>

**5. Judge each statement.**

- Strings are immutable in both Python and JavaScript.
- `a.slice(1)` in JavaScript is O(1) because it doesn't change `a`.
- Rotating with three reversals needs only O(1) extra space.
- In JavaScript, `'😀'.length` is 1.

<details><summary>Answer</summary>

Strings are immutable in both Python and JavaScript.: Yes; `a.slice(1)` in JavaScript is O(1) because it doesn't change `a`.: No; Rotating with three reversals needs only O(1) extra space.: Yes; In JavaScript, `'😀'.length` is 1.: No. Immutable strings mean every edit makes a new string. Slices copy, so they're O(k). The reversal trick swaps in place. The emoji is two UTF-16 units, so its length is 2.

</details>

**6. Complete the Python rotate-right-by-k function (three reversals).**

```
def rotate_right(a, k):
    n = len(a)
    if n == 0:
        return
    k {{0}} n
    reverse(a, 0, n - 1)
    reverse(a, 0, {{1}})
    reverse(a, {{2}}, n - 1)

```

<details><summary>Answer</summary>

%= | k - 1 | k. `k %= n` handles k ≥ n. After reversing everything, the first k slots hold the moved items backwards, so reverse a[0..k − 1], then a[k..n − 1].

</details>

**7. What is the time complexity of `build` for n words of bounded length?**

```python
def build(words):
    out = []
    for w in words:
        out = out + [w.upper()]
    return out
```

```javascript
function build(words) {
  let out = [];
  for (const w of words) out = [...out, w.toUpperCase()];
  return out;
}
```

- A. O(n²): each step copies everything built so far
- B. O(n): there is only one loop
- C. O(n log n)
- D. O(1)

<details><summary>Answer</summary>

O(n²): each step copies everything built so far. `out + [x]` and `[...out, x]` build a new list every time: 1 + 2 + … + n copies = O(n²). `append` / `push` makes it O(n).

</details>

**8. Match each task to the best tool.**


<details><summary>Answer</summary>

Many range-sum queries on data that never changes = A prefix-sum array; Rotate in place with O(1) extra space = Three reversals; Build one long string from many pieces = Collect pieces, then join once; Reverse in place = Two indexes swapping inward. Each tool removes repeated work or extra memory: precompute once, swap in place, copy once.

</details>

## Traps & misconceptions
- **“`insert(0, x)` / `unshift(x)` is as cheap as `append` / `push`.”** Adding at the front shifts every element: O(n). In a loop that's O(n²). Append and reverse once at the end, or use a deque (module 05).
- **“Building a string with `+=` in a loop is fine.”** Strings are immutable, so each `+=` may copy everything built so far: O(n²) in the worst case. Engines sometimes optimise it, but the reliable pattern is collect, then `join` once.
- **“`[[0] * cols] * rows` makes a grid.”** It makes `rows` references to the **same** row, so changing one cell changes a whole column. JavaScript's twin is `new Array(rows).fill(new Array(cols).fill(0))`. Build each row separately.
- **“Slicing is free.”** `a[i:j]`, `a.slice(i, j)`, `a + b` and `[...a]` copy: O(k) time and memory. Slicing inside a loop or a recursion can quietly turn O(n) into O(n²).
- **“A string's length is the number of characters people see.”** JavaScript counts UTF-16 units: `'😀'.length` is 2 and `s.split('')` cuts the emoji in half, while `[...s]` keeps it whole. In Python, `len('😀')` is 1. Both count code points, so emoji built from several code points (skin tones, flags) still count as more than one.
- **“The prefix array is the same length as the input.”** Give it n + 1 slots with `prefix[0] = 0`, so `sum(a[l..r]) = prefix[r + 1] − prefix[l]` also works when l = 0.

## Discussion prompts
- **When would you build a prefix-sum array instead of summing each range when asked?**
  <details><summary>One good answer</summary>When there are many range queries on data that doesn't change: O(n) once, then O(1) per query, instead of O(length) per query. If the data changes often you'd have to rebuild it; L3 covers Fenwick and segment trees for that case.</details>
- **Python lists and JavaScript arrays can hold mixed types. Does that break the O(1) indexing argument?**
  <details><summary>One good answer</summary>No. They store references of the same size, so slot i is still at start + i × size. The objects themselves live elsewhere in memory.</details>

## Teach-back
**Prompt:** Explain to a junior colleague why `a[i]` is O(1) but inserting at the front of an array is O(n), and when a prefix-sum array helps.

Rubric:
- [ ] Items (or references) sit side by side, so slot i's address is calculated directly
- [ ] Inserting or deleting at the front shifts every other item: O(n)
- [ ] Appending is O(1) amortised because the array grows by a multiple
- [ ] Prefix sums: O(n) setup, then any range sum in O(1) as prefix[r + 1] − prefix[l]
- [ ] Names a cost: O(n) extra memory and a rebuild if the data changes

<details><summary>Model answer</summary>

An array keeps its items, or references to them, side by side in one block, so the computer finds slot i by arithmetic, start + i × size, without looking at anything else: O(1). Putting something at the front means every existing item must move one place along, which costs O(n). Appending is cheap because the array grows by a multiple when it's full, so the rare copies average out. A prefix-sum array stores running totals with prefix[0] = 0; after O(n) setup, the sum of a[l..r] is prefix[r + 1] − prefix[l] in O(1). It costs O(n) extra memory and must be rebuilt when the data changes.

</details>

## Quick Q&A (also in the SRS deck)
- **Why is `a[i]` O(1)?** Items (or references) are stored contiguously, so the address of slot i is start + i × size: one calculation, no scanning.
- **What does inserting at index 0 of an n-item array cost?** O(n): every item shifts one place right.
- **Range sum of a[l..r] from a prefix array with n + 1 slots?** prefix[r + 1] − prefix[l], where prefix[0] = 0 and prefix[i + 1] = prefix[i] + a[i].
- **Safe way to build a long string in a loop (Python and JavaScript)?** Collect pieces in a list or array, then join once: `''.join(parts)` / `parts.join('')`.
- **Rotate an array right by k in O(n) time and O(1) extra space?** k %= n; reverse the whole array, then the first k items, then the rest.
- **Why is `[[0] * 3] * 3` a bug in Python?** All three rows are the same list, so changing one cell changes the whole column. Use `[[0] * 3 for _ in range(3)]`.

## Practice problems
- [ ] [LC 88 · Merge Sorted Array](https://leetcode.com/problems/merge-sorted-array/) · Easy · fill from the back so nothing shifts
- [ ] [LC 303 · Range Sum Query - Immutable](https://leetcode.com/problems/range-sum-query-immutable/) · Easy · prefix sums, exactly as above
- [ ] [LC 14 · Longest Common Prefix](https://leetcode.com/problems/longest-common-prefix/) · Easy · compare column by column
- [ ] [LC 118 · Pascal's Triangle](https://leetcode.com/problems/pascals-triangle/) · Easy · 2D lists: build each row from the one above
- [ ] [LC 1752 · Check if Array Is Sorted and Rotated](https://leetcode.com/problems/check-if-array-is-sorted-and-rotated/) · Easy · count the drops, including last → first; a rotated sorted array has at most one
- [ ] [LC 238 · Product of Array Except Self](https://leetcode.com/problems/product-of-array-except-self/) · Medium · prefix and suffix products, no division
- [ ] [LC 48 · Rotate Image](https://leetcode.com/problems/rotate-image/) · Medium · in place: transpose, then reverse each row
- [ ] [LC 54 · Spiral Matrix](https://leetcode.com/problems/spiral-matrix/) · Medium · walk four boundaries inward

## Sources (accessed 2026-10-09)
- [Python tutorial: More on lists](https://docs.python.org/3/tutorial/datastructures.html#more-on-lists)
- [MDN: Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array)
- [MDN: String length (UTF-16 code units)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/length)
- [USACO Guide: Prefix sums](https://usaco.guide/silver/prefix-sums)
- [Python wiki: TimeComplexity](https://wiki.python.org/moin/TimeComplexity)
