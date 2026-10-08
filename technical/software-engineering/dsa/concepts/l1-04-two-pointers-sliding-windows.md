---
title: "Two pointers and sliding windows"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l1, dsa-l1-m04]
status: new
created: 2026-10-09
updated: 2026-10-09
sources:
  - url: https://usaco.guide/silver/two-pointers
    accessed: 2026-10-09
  - url: https://usaco.guide/gold/sliding-window
    accessed: 2026-10-09
  - url: https://neetcode.io/practice/practice/neetcode150
    accessed: 2026-10-09
---
# Two pointers and sliding windows

> Data Structures & Algorithms · L1 Foundation · Arrays, strings, hashing & pointers · about 90 min · hub module `m04` ([open the hub](https://claude.ai/artifact/SWv6N1Uh2oiFNH1mxefcNr))

## Why it matters
Two pointers and sliding windows turn many “check every pair” or “check every subarray” problems from O(n²) into a single O(n) pass. They're among the most common patterns in coding interviews.

## Pre-question (answer before reading)
**Q:** A sorted list and a target sum. If smallest + largest is too big, which of the two can you rule out for good, and why?

<details><summary>Answer</summary>

The largest. Paired with the smallest number it's already too big, so it's too big with every other number too. Move the right pointer one step left.

</details>

## 🍎 Story time (kid version)
**The toy room and the treasure-map road trip: Stepping stones and fence posts**

On the road trip, Tara and Ben play two games. In the first, numbered stones lie in order along the path, smallest to biggest. Tara stands on the first stone, Ben on the last, and they want two stones that add up to 10. Too big? Ben steps one stone inwards. Too small? Tara steps inwards. They never go back. In the second game, Ben adds up the numbers on the three fence posts he can see from the car. As the car rolls on, a new post slides in at the front and an old one slides out at the back, so he adds the new number and takes away the old one instead of re-adding all three.

| In the story | In code |
|---|---|
| Tara and Ben at the two ends of the sorted stones | Two pointers: `lo = 0`, `hi = n − 1` on sorted data |
| Too big → Ben steps in; too small → Tara steps in | Each step rules out one item for good, so one pass: O(n) |
| The three fence posts in the car window | A fixed-size sliding window of k items |
| Add the new number, take away the old one | Update the window total in O(1) instead of re-adding it |

**Where the story breaks:** The stone game only works because the stones are in order: on unsorted data, moving a pointer rules out nothing, so you sort first or use a hash map. Real windows can also stretch and shrink (variable size), which a car window can't.

## Key ideas (grown-up version)
- **Opposite-end pointers** (`lo` at the start, `hi` at the end) work on **sorted** data and on symmetric checks: pair sums, palindromes, container-with-most-water. Each step rules out one candidate for good, so the pass is O(n).
- **Read/write pointers**: `read` scans every item and `write` marks where the next kept item goes. Remove items or move zeros in place: O(n) time, O(1) extra space.
- **Fixed-size window**: keep a running sum (or count) of exactly k items; add `a[i]` and subtract `a[i − k]`. O(n) instead of O(n·k).
- **Variable-size window**: grow on the right; while the window breaks the rule, shrink from the left. Each index enters once and leaves at most once, so it's O(n) even with the inner `while`.
- **Window state** lives in a running sum, a set or a map of counts (for example, the letters inside the window), updated as items enter and leave.
- **Know the precondition**: shrinking a window for a sum limit needs non-negative numbers, because adding must never lower the sum. With negatives and an *exact* target sum, use prefix sums plus a hash map (LeetCode 560).
- **Spot it**: “contiguous subarray or substring”, “longest or shortest with a condition”, “pair in a sorted array”, “in place with O(1) extra space”.

## Diagrams
**Opposite-end pointers, target 10**

| 1 + 11 = 12 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | **1** | 3 | 4 | 6 | 8 | **11** |
| pointer | lo |  |  |  |  | hi |

| 1 + 8 = 9 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | **1** | 3 | 4 | 6 | **8** | 11 |
| pointer | lo |  |  |  | hi |  |

| 3 + 8 = 11 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 1 | **3** | 4 | 6 | **8** | 11 |
| pointer |  | lo |  |  | hi |  |

| 3 + 6 = 9 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 1 | **3** | 4 | **6** | 8 | 11 |
| pointer |  | lo |  | hi |  |  |

| 4 + 6 = 10 ✓ | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 1 | 3 | **4** | **6** | 8 | 11 |
| pointer |  |  | lo | hi |  |  |

_Too big → hi moves left. Too small → lo moves right. Neither pointer ever moves back, so at most n steps._

**A fixed window of 3 sliding along**

| sum 8 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | **2** | **1** | **5** | 1 | 3 | 2 |

| 8 − 2 + 1 = 7 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 2 | **1** | **5** | **1** | 3 | 2 |

| 7 − 1 + 3 = 9 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 2 | 1 | **5** | **1** | **3** | 2 |

| 9 − 5 + 2 = 6 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 2 | 1 | 5 | **1** | **3** | **2** |

_Each slide adds the new item and subtracts the one that left: O(1) per step. The best window sums to 9._

## Comparisons
**Four pointer patterns**

| Pattern | How the pointers move | Typical problem | Time / extra space |
|---|---|---|---|
| Opposite ends | `lo` up or `hi` down | Pair sum in a sorted array; palindrome check | O(n) / O(1) |
| Read / write | `read` every step, `write` only when keeping | Remove items, move zeros | O(n) / O(1) |
| Fixed window | Both ends move together | Best sum or average of k in a row | O(n) / O(1) |
| Variable window | Right grows; left shrinks while invalid | Longest substring without repeats | O(n) / O(size of the window's set) |

## Code (JavaScript + Python)
### Opposite ends: a pair with a given sum (sorted input)
```python
def pair_with_sum(a, target):              # a must be sorted
    lo, hi = 0, len(a) - 1
    while lo < hi:                         # two different items
        s = a[lo] + a[hi]
        if s == target:
            return lo, hi
        if s < target:
            lo += 1                        # need bigger: a[lo] can't work
        else:
            hi -= 1                        # need smaller: a[hi] can't work
    return -1, -1

print(*pair_with_sum([1, 3, 4, 6, 8, 11], 10))
print(*pair_with_sum([1, 2, 5], 100))
```

Output:
```text
2 3
-1 -1
```

- line 3: `lo < hi`, not `<=`: an item may not pair with itself.
- line 8: Everything left of `hi` is smaller, so if even a[hi] is too small with a[lo], a[lo] is useless.

```javascript
function pairWithSum(a, target) {          // a must be sorted
  let lo = 0, hi = a.length - 1;
  while (lo < hi) {                        // two different items
    const s = a[lo] + a[hi];
    if (s === target) return [lo, hi];
    if (s < target) lo++;                  // need bigger: a[lo] can't work
    else hi--;                             // need smaller: a[hi] can't work
  }
  return [-1, -1];
}

console.log(pairWithSum([1, 3, 4, 6, 8, 11], 10).join(" "));
console.log(pairWithSum([1, 2, 5], 100).join(" "));
```

Output:
```text
2 3
-1 -1
```

- line 3: `lo < hi`, not `<=`: an item may not pair with itself.
- line 6: Each step throws away one candidate for good: at most n steps.

### Read / write: remove a value in place
```python
def remove_value(a, val):                  # in place; returns the new length
    write = 0
    for read in range(len(a)):
        if a[read] != val:                 # keep it: copy it to the write slot
            a[write] = a[read]
            write += 1
    return write                           # a[:write] holds the kept items

a = [3, 2, 2, 3, 4, 3, 5]
k = remove_value(a, 3)
print(k, *a[:k])
```

Output:
```text
4 2 2 4 5
```

- line 4: `write` never passes `read`, so we never overwrite an item we haven't looked at yet.

```javascript
function removeValue(a, val) {             // in place; returns the new length
  let write = 0;
  for (let read = 0; read < a.length; read++) {
    if (a[read] !== val) a[write++] = a[read];   // keep it: copy it to the write slot
  }
  return write;                            // a.slice(0, write) holds the kept items
}

const a = [3, 2, 2, 3, 4, 3, 5];
const k = removeValue(a, 3);
console.log(k, ...a.slice(0, k));
```

Output:
```text
4 2 2 4 5
```

- line 4: `a[write++] = …` stores, then moves `write` on: the same as two lines in Python.

### Fixed window: best sum of k in a row
```python
def best_window_sum(a, k):
    window = sum(a[:k])                    # the first window
    best = window
    for i in range(k, len(a)):
        window += a[i] - a[i - k]          # add the new item, drop the old one
        best = max(best, window)
    return best

print(best_window_sum([2, 1, 5, 1, 3, 2], 3), best_window_sum([4, -1, 2], 1))
```

Output:
```text
9 4
```

- line 5: O(1) per slide instead of re-adding k items: O(n) in total.

```javascript
function bestWindowSum(a, k) {
  let win = 0;
  for (let i = 0; i < k; i++) win += a[i];   // the first window
  let best = win;
  for (let i = k; i < a.length; i++) {
    win += a[i] - a[i - k];                  // add the new item, drop the old one
    best = Math.max(best, win);
  }
  return best;
}

console.log(bestWindowSum([2, 1, 5, 1, 3, 2], 3), bestWindowSum([4, -1, 2], 1));
```

Output:
```text
9 4
```

- line 2: Named `win`, not `window`: in a browser, `window` is the global object.
- line 6: O(1) per slide instead of re-adding k items: O(n) in total.

## Worked example
**Problem.** Snack stalls stand in a row with prices `prices` (all ≥ 0). With a budget, what's the longest run of *consecutive* stalls you can buy one snack from each?

1. Brute force: try every start and extend while the total fits: O(n²).
2. Variable window: add `prices[right]` to `total`. While `total > budget`, subtract `prices[left]` and move `left` right.
3. After shrinking, the window `left..right` is affordable, so record its length `right − left + 1`.
4. Each index enters once and leaves at most once: O(n) time and O(1) space. It works because prices are non-negative, so adding a stall never lowers the total.

```python
def longest_affordable(prices, budget):
    left = total = best = 0
    for right, p in enumerate(prices):
        total += p                          # grow the window on the right
        while total > budget:               # too expensive: shrink from the left
            total -= prices[left]
            left += 1
        best = max(best, right - left + 1)  # left..right fits the budget
    return best

print(longest_affordable([3, 1, 2, 7, 1, 1, 1, 2], 5), longest_affordable([9, 9], 5))
```

Output:
```text
4 0
```

```javascript
function longestAffordable(prices, budget) {
  let left = 0, total = 0, best = 0;
  for (let right = 0; right < prices.length; right++) {
    total += prices[right];                 // grow the window on the right
    while (total > budget) {                // too expensive: shrink from the left
      total -= prices[left];
      left++;
    }
    best = Math.max(best, right - left + 1); // left..right fits the budget
  }
  return best;
}

console.log(longestAffordable([3, 1, 2, 7, 1, 1, 1, 2], 5), longestAffordable([9, 9], 5));
```

Output:
```text
4 0
```

**Answer.** 4: the last four stalls (1 + 1 + 1 + 2 = 5). With [9, 9] and a budget of 5 nothing fits, so 0. O(n) time and O(1) extra space.

## Your turn (faded example)
**Problem.** Reverse only the vowels in a string: “hello” becomes “holle”.

- ✓ Strings are immutable, so copy the characters into a list or array first.
- **When do you move only one pointer?**
  <details><summary>Answer</summary>When the character under it isn't a vowel: skip it and leave the other pointer where it is.</details>
- **What happens when both pointers sit on vowels?**
  <details><summary>Answer</summary>Swap the two characters, then move `lo` right and `hi` left.</details>
- **What are the time and extra space?**
  <details><summary>Answer</summary>O(n) time. O(n) for the character list, which you need anyway because strings are immutable.</details>

Starter:
```python
def reverse_vowels(s):
    chars = list(s)                        # strings are immutable: use a list
    lo, hi = 0, len(chars) - 1
    vowels = set("aeiouAEIOU")
    while lo < hi:
        if chars[lo] not in vowels:
            lo += 1
        elif chars[hi] not in vowels:
            hi -= 1
        else:
            lo, hi = lo + 1, hi - 1        # TODO: swap chars[lo] and chars[hi] first
    return "".join(chars)

print(reverse_vowels("hello"))             # expect holle
```

```javascript
function reverseVowels(s) {
  const chars = [...s];                    // strings are immutable: use an array
  let lo = 0, hi = chars.length - 1;
  const vowels = new Set("aeiouAEIOU");
  while (lo < hi) {
    if (!vowels.has(chars[lo])) lo++;
    else if (!vowels.has(chars[hi])) hi--;
    else {
      lo++; hi--;                          // TODO: swap chars[lo] and chars[hi] first
    }
  }
  return chars.join("");
}

console.log(reverseVowels("hello"));       // expect holle
```

<details><summary>Full solution</summary>

```python
def reverse_vowels(s):
    chars = list(s)
    lo, hi = 0, len(chars) - 1
    vowels = set("aeiouAEIOU")
    while lo < hi:
        if chars[lo] not in vowels:
            lo += 1
        elif chars[hi] not in vowels:
            hi -= 1
        else:
            chars[lo], chars[hi] = chars[hi], chars[lo]
            lo += 1
            hi -= 1
    return "".join(chars)

print(reverse_vowels("hello"), reverse_vowels("leetcode"))
```

Output:
```text
holle leotcede
```

```javascript
function reverseVowels(s) {
  const chars = [...s];
  let lo = 0, hi = chars.length - 1;
  const vowels = new Set("aeiouAEIOU");
  while (lo < hi) {
    if (!vowels.has(chars[lo])) lo++;
    else if (!vowels.has(chars[hi])) hi--;
    else {
      [chars[lo], chars[hi]] = [chars[hi], chars[lo]];
      lo++;
      hi--;
    }
  }
  return chars.join("");
}

console.log(reverseVowels("hello"), reverseVowels("leetcode"));
```

Output:
```text
holle leotcede
```

</details>

## Socratic checks and quiz (answers hidden)
**1. What does this print?**

```python
a = [1, 4, 2, 6, 3]
k = 2
window = a[0] + a[1]
best = window
for i in range(k, len(a)):
    window += a[i] - a[i - k]
    best = max(best, window)
print(best)
```

```javascript
const a = [1, 4, 2, 6, 3];
const k = 2;
let win = a[0] + a[1];
let best = win;
for (let i = k; i < a.length; i++) {
  win += a[i] - a[i - k];
  best = Math.max(best, win);
}
console.log(best);
```

- A. 9
- B. 8
- C. 16
- D. 6

<details><summary>Answer</summary>

9. The windows sum to 5, 6, 8 and 9 (6 + 3). The best is 9.

</details>

**2. What does this print?**

```python
a = [1, 2, 4, 7, 11, 15]
lo, hi, steps = 0, len(a) - 1, 0
while a[lo] + a[hi] != 15:
    if a[lo] + a[hi] < 15:
        lo += 1
    else:
        hi -= 1
    steps += 1
print(a[lo], a[hi], steps)
```

```javascript
const a = [1, 2, 4, 7, 11, 15];
let lo = 0, hi = a.length - 1, steps = 0;
while (a[lo] + a[hi] !== 15) {
  if (a[lo] + a[hi] < 15) lo++;
  else hi--;
  steps++;
}
console.log(a[lo], a[hi], steps);
```

- A. 4 11 3
- B. 4 11 4
- C. 1 15 0
- D. 2 11 2

<details><summary>Answer</summary>

4 11 3. 1 + 15 = 16 is too big (hi moves); 1 + 11 = 12 and 2 + 11 = 13 are too small (lo moves twice); 4 + 11 = 15 stops after 3 steps.

</details>

**3. In “longest substring without repeating characters”, the new character is already inside the window. What do you do?**

- A. Move the left end forward until the earlier copy of that character has left the window
- B. Clear the window and restart it at the new character
- C. Move the right end back one step
- D. Sort the characters in the window

<details><summary>Answer</summary>

Move the left end forward until the earlier copy of that character has left the window. Shrink from the left only as far as needed. Restarting from scratch throws away valid characters: in “abca”, the window should become “bca”, not “a”.

</details>

**4. Which of these fit a sliding window? (choose 2)**

- A. Longest substring with at most 2 different letters
- B. Shortest run of non-negative numbers with sum ≥ target
- C. Count the pairs (i, j) anywhere in the array with a[i] = a[j]
- D. Find the median of an unsorted array
- E. Count the subarrays summing to k when values can be negative

<details><summary>Answer</summary>

Longest substring with at most 2 different letters, Shortest run of non-negative numbers with sum ≥ target. Windows need a contiguous range and a rule that changes predictably as the window grows or shrinks. Pairs anywhere is a counting job for a hash map, the median needs sorting or selection, and negative values break the shrinking rule (use prefix sums and a hash map).

</details>

**5. Judge each statement.**

- Opposite-end pointers for pair sums need the array to be sorted.
- A variable-size window with an inner `while` loop is O(n²).
- Read/write pointers can remove items in place with O(1) extra space.
- For a fixed window of size k, recomputing each window's sum is O(n) in total.

<details><summary>Answer</summary>

Opposite-end pointers for pair sums need the array to be sorted.: Yes; A variable-size window with an inner `while` loop is O(n²).: No; Read/write pointers can remove items in place with O(1) extra space.: Yes; For a fixed window of size k, recomputing each window's sum is O(n) in total.: No. Sorted order is what makes ruling items out safe. The left end only moves forward, so the window is O(n). Recomputing costs O(k) per window, O(n·k) in total.

</details>

**6. Complete the Python variable-size window.**

```
def longest_affordable(prices, budget):
    left = total = best = 0
    for right, p in enumerate(prices):
        total += p
        while total {{0}} budget:
            total -= prices[{{1}}]
            left += 1
        best = max(best, {{2}})
    return best

```

<details><summary>Answer</summary>

> | left | right - left + 1. Shrink while the total is over budget (`>`), always removing the leftmost item, then measure the inclusive window `right − left + 1`.

</details>

**7. You need the pair whose sum is closest to a target in an unsorted array of 100,000 numbers. What's a good plan?**

- A. Sort it (O(n log n)), then use opposite-end pointers and track the closest sum (O(n))
- B. Use opposite-end pointers on the unsorted array (O(n))
- C. Check every pair (O(n²))
- D. Use a hash map of complements, which finds the closest sum directly

<details><summary>Answer</summary>

Sort it (O(n log n)), then use opposite-end pointers and track the closest sum (O(n)). Pointers need sorted data. A hash map answers exact questions (is target − x present?), not “closest”. Checking every pair is about 5 × 10⁹ sums.

</details>

**8. Match each problem to its pattern.**


<details><summary>Answer</summary>

Is this string a palindrome? = Opposite-end pointers; Move all zeros to the end, in place = Read/write pointers; Highest total over 5 consecutive days = Fixed-size window; Longest substring without repeating characters = Variable-size window. Symmetry → opposite ends; in-place filtering → read/write; “k in a row” → fixed window; “longest with a rule” → variable window.

</details>

## Traps & misconceptions
- **“Opposite-end pointers work on any array.”** The pair search needs **sorted** data: moving a pointer is only safe because everything beyond it is bigger (or smaller). On unsorted data, sort first (O(n log n)) or use a hash map (O(n)).
- **“The inner `while` makes a sliding window O(n²).”** `left` only moves forward, at most n times over the whole run. Every index enters once and leaves once: O(n).
- **“A shrinking window finds the longest subarray under a sum limit for any numbers.”** Only for non-negative numbers. A negative value can lower the sum later, so shrinking isn't safe. For an exact target (count or longest subarray summing to k), use prefix sums plus a hash map (LeetCode 560); a sum *limit* with negatives needs prefix sums plus a sorted structure or a monotonic stack (L2+).
- **“Recomputing `sum(a[i:i + k])` for each window is fine.”** That's O(k) per window and O(n·k) in total. Keep a running sum and update it in O(1).
- **“Window length is `right − left`.”** With inclusive ends `left..right` it's `right − left + 1`. Mixing inclusive and exclusive ends is the most common window bug: pick one convention and say it out loud.
- **“`while lo <= hi` and `while lo < hi` are the same here.”** For pairs of *different* items use `lo < hi`; with `<=` an item could pair with itself.

## Discussion prompts
- **Two Sum on an unsorted array: sort plus two pointers, or a hash map?**
  <details><summary>One good answer</summary>The hash map is O(n) time and O(n) space and keeps the original indexes. Sorting costs O(n log n) and loses the original positions unless you sort (value, index) pairs. If the array is already sorted, two pointers win: O(n) time and O(1) space.</details>
- **How can you tell a problem wants a sliding window?**
  <details><summary>One good answer</summary>It asks about a contiguous subarray or substring (longest, shortest, count, best) under a condition that changes predictably as the window grows or shrinks, such as a sum limit or “no repeated characters”.</details>

## Teach-back
**Prompt:** Explain to a junior colleague how a variable-size sliding window works, and why it's O(n) even though there's a loop inside a loop.

Rubric:
- [ ] Grow the window by moving the right end one step at a time
- [ ] While the window breaks the rule, shrink it by moving the left end
- [ ] Record the answer when the window is valid
- [ ] Each index enters once and leaves at most once, so total work is O(n)
- [ ] States the precondition (for sum limits: non-negative numbers)

<details><summary>Model answer</summary>

Keep two indexes, left and right, that mark a window over the array. Move right one step at a time to add an item. If the window now breaks the rule, for example the sum is over budget or a character repeats, move left forward, removing items until the window is valid again, then record its length. It looks like a loop inside a loop, but left only ever moves forward, so over the whole run each index enters the window once and leaves at most once: O(n). It relies on the rule behaving predictably; for sum limits that means non-negative numbers.

</details>

## Quick Q&A (also in the SRS deck)
- **When do opposite-end pointers work for pair sums?** When the array is sorted: too big → move hi left; too small → move lo right.
- **Why is a variable sliding window O(n) despite the inner while?** Each index enters once (right) and leaves at most once (left), so there are at most 2n moves.
- **Update rule for a fixed window of size k?** window += a[i] − a[i − k]: add the new item, drop the one that left.
- **Remove items in place with O(1) extra space: which pattern?** Read/write pointers: read scans every item; write marks where the next kept item goes.
- **Why can't a shrinking window handle negative numbers in a sum problem?** A negative value can lower the sum later, so a too-big window might become valid again; shrinking isn't safe. Use prefix sums plus a hash map when the target is an exact sum.
- **Length of an inclusive window left..right?** right − left + 1.

## Practice problems
- [ ] [LC 125 · Valid Palindrome](https://leetcode.com/problems/valid-palindrome/) · Easy · opposite ends, skipping anything that isn't a letter or digit; compare in lowercase
- [ ] [LC 26 · Remove Duplicates from Sorted Array](https://leetcode.com/problems/remove-duplicates-from-sorted-array/) · Easy · read/write pointers
- [ ] [LC 283 · Move Zeroes](https://leetcode.com/problems/move-zeroes/) · Easy · read/write, keeping the order
- [ ] [LC 977 · Squares of a Sorted Array](https://leetcode.com/problems/squares-of-a-sorted-array/) · Easy · fill the answer from the back with opposite-end pointers
- [ ] [LC 1984 · Minimum Difference Between Highest and Lowest of K Scores](https://leetcode.com/problems/minimum-difference-between-highest-and-lowest-of-k-scores/) · Easy · sort, then a fixed window of k
- [ ] [LC 11 · Container With Most Water](https://leetcode.com/problems/container-with-most-water/) · Medium · opposite ends: move the shorter wall
- [ ] [LC 3 · Longest Substring Without Repeating Characters](https://leetcode.com/problems/longest-substring-without-repeating-characters/) · Medium · variable window with a set or last-seen map
- [ ] [LC 209 · Minimum Size Subarray Sum](https://leetcode.com/problems/minimum-size-subarray-sum/) · Medium · variable window: shrink while the sum is big enough
- [ ] [LC 15 · 3Sum](https://leetcode.com/problems/3sum/) · Medium · sort; fix one number, then two pointers; skip duplicates

## Sources (accessed 2026-10-09)
- [USACO Guide: Two pointers](https://usaco.guide/silver/two-pointers)
- [USACO Guide: Sliding window](https://usaco.guide/gold/sliding-window)
- [NeetCode 150: Two Pointers and Sliding Window problem groups](https://neetcode.io/practice/practice/neetcode150)
