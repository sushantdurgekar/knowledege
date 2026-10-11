---
title: "Prefix sums, difference arrays and monotonic queues"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, dsa-l3-m07]
status: new
created: 2026-10-09
updated: 2026-10-09
sources:
  - url: https://cp-algorithms.com/data_structures/stack_queue_modification.html
    accessed: 2026-10-09
  - url: https://usaco.guide/silver/prefix-sums
    accessed: 2026-10-09
  - url: https://usaco.guide/silver/more-prefix-sums
    accessed: 2026-10-09
  - url: https://en.wikipedia.org/wiki/Summed-area_table
    accessed: 2026-10-09
---
# Prefix sums, difference arrays and monotonic queues

> Data Structures & Algorithms · L3 Specialist · Range queries · about 100 min · hub module `m07` ([open the hub](https://claude.ai/artifact/JfuakQWBwAvSgLi1rcuJUk))

## Why it matters
Range questions are everywhere: the total of any rectangle of an image or a spreadsheet, the load on a car at every stop, the best score over the last k moves. Precompute running totals once and every range sum costs O(1); keep a deque in order and every window's maximum costs O(1) amortised. These tricks crack many hard interview problems before you need the trees of modules 08 and 09.

## Pre-question (answer before reading)
**Q:** A car-sharing app gets 10⁵ bookings, each adding p passengers to every stop from l to r, and only afterwards needs the load at every stop. Must each booking touch every stop in its range?

<details><summary>Answer</summary>

No. Write +p at stop l and −p at stop r + 1 in a difference array, which is O(1) per booking. One running sum at the end then gives the load at every stop in O(n): O(n + m) for m bookings, instead of O(n × m).

</details>

## 🍎 Story time (kid version)
**The toy room and the treasure-map road trip: The passenger log and the tallest hill**

On the road trip, Ben keeps the passenger log. When cousins get in at a town, he writes “+2” by that town; when they get out, he writes “−2” by the town where they leave. To know how many are aboard leaving any town, he adds up the notes from the start. Tara watches the last three hills through the back window and wants the tallest one in view. Each new hill crosses out every hill on her card that is no taller: those leave view sooner, so they'll never be needed. When the oldest hill drops out of view, she crosses it off the front. The tallest is always first.

| In the story | In code |
|---|---|
| “+2” where cousins get in, “−2” where they get out | A difference array: `diff[start] += p` and `diff[end] -= p`, O(1) per trip |
| Adding up the notes from the start | A running (prefix) sum over the difference array gives the load at every stop in one O(n) pass |
| A new hill crosses out every hill that is no taller | Pop indexes whose values are ≤ the new value from the back of the deque, then push the new index |
| The oldest hill dropping out of view is crossed off the front | Pop the front index once it is ≤ i − k |
| The tallest hill is always first on the card | The deque's front is the window's maximum; each index is pushed and popped at most once, so O(n) in total |

**Where the story breaks:** Tara sees a hill leave the window, but code has to work it out: the deque stores positions (indexes), not just heights, and drops the front once its index is ≤ i − k. And Ben's notes give the right count only after all of them are written: a difference array suits many updates followed by one read, not reads mixed in between (the Fenwick tree of module 08 handles those).

## Key ideas (grown-up version)
- **1-D prefix sums**: `pre[i + 1] = pre[i] + a[i]` with `pre[0] = 0`, so the sum of a[l..r] is `pre[r + 1] - pre[l]`. O(n) time and space to build, O(1) per query. Any condition on a subarray's sum becomes a condition on a pair of prefix sums, which is the door to LeetCode 862.
- **2-D prefix sums**: give the table an extra row and column of zeros, and fill `P[r + 1][c + 1] = a[r][c] + P[r][c + 1] + P[r + 1][c] - P[r][c]`. The rectangle from (r1, c1) to (r2, c2) sums to `P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1]`: inclusion–exclusion, because the block above and to the left is subtracted twice. O(R × C) time and space to build, O(1) per query.
- **Difference arrays**: to add v to a[l..r], do `d[l] += v` and `d[r + 1] -= v`; after all the updates, one running sum over d rebuilds the array. O(1) per update and O(n) for the final pass, but reading one value in between costs O(n). In 2-D, add v at (r1, c1) and (r2 + 1, c2 + 1), subtract it at (r1, c2 + 1) and (r2 + 1, c1), then take 2-D prefix sums.
- **Sweeping sorted events**: when positions are huge (up to 10⁹) but the ranges are few, turn each range into two events, +v at its start and −v at its end, sort them and keep a running total. O(m log m) time and O(m) space for m ranges, whatever the coordinate size. For half-open ranges [start, end), handle −v before +v at the same position.
- **Monotonic deque**: for the maximum of every window of size k, keep indexes whose values decrease from front to back. Before pushing i, pop indexes with values ≤ nums[i] from the back; then pop the front if its index is ≤ i − k. The front is the window's maximum. Each index enters and leaves once, so it's O(n) time in total and O(k) extra space. Flip the comparison for the minimum.
- **DP sped up by a deque**: when dp[i] = nums[i] + max(dp[i − k .. i − 1]) (LeetCode 1696; LeetCode 1425 uses max(0, …)), that max is a sliding-window maximum over dp, so the DP drops from O(n × k) to O(n) time.
- **Shortest subarray with sum ≥ K, negatives allowed (LeetCode 862)**: a shrinking window fails, because a negative number can make a longer window's sum smaller. Keep a deque of start indexes whose prefix sums increase. For each j, pop the front while `P[j] - P[front] >= K` (each pop is a candidate answer), pop the back while `P[back] >= P[j]`, then push j. O(n) time and O(n) space.
- **JavaScript has no deque**: these windows never add at the front, so an array with a head index is enough. The front is `dq[head]`, popping it is `head++`, popping the back is `dq.pop()`, and it's empty when `dq.length === head`. Avoid `shift()`, which can cost O(n). The dead slots stay in the array, so it can grow to n entries: O(n) space. Python has `collections.deque`.

## Diagrams
**2-D prefix table P for a = [[1, 2, 3], [4, 5, 6], [7, 8, 9]], with a zero row and column**

| P row 0 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| value | 0 | 0 | 0 | 0 |

| P row 1 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| value | 0 | 1 | 3 | **6** |
| pointer |  | + |  | − |

| P row 2 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| value | 0 | 5 | 12 | 21 |

| P row 3 | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| value | 0 | **12** | 27 | 45 |
| pointer |  | − |  | + |

_The sum of a's rows 1–2 and columns 1–2 (5 + 6 + 8 + 9 = 28) is P[3][3] − P[1][3] − P[3][1] + P[1][1] = 45 − 6 − 12 + 1. P[1][1] lies inside both subtracted strips, so it is added back once._

**A difference array for three flight bookings (LeetCode 1109's example)**

| flight | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 1 | 2 | 3 | 4 | 5 | 6 |

| +10 on 1–2 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 10 | 0 | −10 | 0 | 0 | 0 |

| +20 on 2–3 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 0 | 20 | 0 | −20 | 0 | 0 |

| +25 on 2–5 | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 0 | 25 | 0 | 0 | 0 | −25 |

| diff | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | **10** | **45** | **−10** | **−20** | 0 | **−25** |

| running sum | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| value | 10 | 55 | 45 | 25 | 25 | 0 |

_Each booking writes just two numbers, however long its range. One running sum then gives the seats on every flight: 10 55 45 25 25. Slot 6 exists only to absorb the −25._

**The deque for [9, 2, 4, 1, 3, 8] with k = 3 (values shown, their indexes underneath)**

| i = 0, x = 9 | 0 |
|---|---|
| value | 9 |
| pointer | 0 |

| i = 1, x = 2 | 0 | 1 |
|---|---|---|
| value | 9 | 2 |
| pointer | 0 | 1 |

| i = 2, x = 4 | 0 | 1 |
|---|---|---|
| value | 9 | 4 |
| pointer | 0 | 2 |

| i = 3, x = 1 | 0 | 1 |
|---|---|---|
| value | 4 | 1 |
| pointer | 2 | 3 |

| i = 4, x = 3 | 0 | 1 |
|---|---|---|
| value | 4 | 3 |
| pointer | 2 | 4 |

| i = 5, x = 8 | 0 |
|---|---|
| value | 8 |
| pointer | 5 |

_The green fronts are the window maxima: 9 4 4 8. At i = 2 the 4 pops the 2 from the back. At i = 3 index 0 is outside the window [1, 3], so the 9 leaves from the front. At i = 4 the 3 pops the 1, and at i = 5 the 8 pops everything._

## Comparisons
**Which tool for which range job?**

| Job | Tool | Time | Space |
|---|---|---|---|
| Many range sums on data that never changes | Prefix sums (1-D or 2-D) | O(n) build, O(1) per query | O(n) |
| Many range additions, then one read of everything | Difference array | O(1) per update, O(n) final pass | O(n) |
| Range additions on positions up to 10⁹ | Sorted events (a sweep) | O(m log m) for m ranges | O(m) |
| The max or min of every window of size k | Monotonic deque | O(n) in total | O(k); O(n) for the JavaScript head-index array |
| Point updates mixed with range sums | Fenwick tree (module 08) | O(log n) per operation | O(n) |
| Range updates mixed with range sums or maxima | Segment tree with lazy tags (module 09) | O(log n) per operation | O(n) |

**Shortest subarray with sum ≥ K: three approaches**

| Approach | Time | Extra space | Correct when |
|---|---|---|---|
| Try every start, extend until the sum reaches K | O(n²) | O(1) | Always (the brute force) |
| Shrinking two-pointer window | O(n) | O(1) | Only if no number is negative |
| Prefix sums + a deque of increasing prefix sums | O(n) | O(n) | Always, negatives included |

## Code (JavaScript + Python)
### 2-D prefix sums: any rectangle in O(1)
```python
def build_2d(grid):
    rows, cols = len(grid), len(grid[0])
    P = [[0] * (cols + 1) for _ in range(rows + 1)]   # an extra row and column of zeros
    for r in range(rows):
        for c in range(cols):
            P[r + 1][c + 1] = grid[r][c] + P[r][c + 1] + P[r + 1][c] - P[r][c]
    return P

def rect_sum(P, r1, c1, r2, c2):                      # corners included, O(1)
    return P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1]

grid = [[3, 0, 1, 4, 2],
        [5, 6, 3, 2, 1],
        [1, 2, 0, 1, 5],
        [4, 1, 0, 1, 7],
        [1, 0, 3, 0, 5]]
P = build_2d(grid)                                    # O(rows x cols), once
print(rect_sum(P, 2, 1, 4, 3), rect_sum(P, 1, 1, 2, 2), rect_sum(P, 1, 2, 2, 4))
print(rect_sum(P, 0, 0, 4, 4), rect_sum(P, 3, 4, 3, 4))
```

Output:
```text
8 11 12
58 7
```

- line 3: The zero row and column mean a rectangle that touches row 0 or column 0 needs no special case.
- line 6: The cell above plus the cell to the left counts the block above-left twice, so subtract it once.
- line 10: Inclusion–exclusion: both subtracted strips contain the block P[r1][c1], so it is added back.

```javascript
function build2d(grid) {
  const rows = grid.length, cols = grid[0].length;
  const P = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));   // extra zero row and column
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      P[r + 1][c + 1] = grid[r][c] + P[r][c + 1] + P[r + 1][c] - P[r][c];
  return P;
}

const rectSum = (P, r1, c1, r2, c2) =>                // corners included, O(1)
  P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1];

const grid = [[3, 0, 1, 4, 2],
              [5, 6, 3, 2, 1],
              [1, 2, 0, 1, 5],
              [4, 1, 0, 1, 7],
              [1, 0, 3, 0, 5]];
const P = build2d(grid);                              // O(rows x cols), once
console.log(rectSum(P, 2, 1, 4, 3), rectSum(P, 1, 1, 2, 2), rectSum(P, 1, 2, 2, 4));
console.log(rectSum(P, 0, 0, 4, 4), rectSum(P, 3, 4, 3, 4));
```

Output:
```text
8 11 12
58 7
```

- line 3: `Array.from` with a function makes a fresh row each time; `fill` with one array would make every row the same array.
- line 6: The cell above plus the cell to the left counts the block above-left twice, so subtract it once.
- line 11: Inclusion–exclusion: both subtracted strips contain the block P[r1][c1], so it is added back.

### Many range additions: a difference array, and a sweep over sorted events
```python
def flight_bookings(bookings, n):              # LeetCode 1109: flights 1..n
    diff = [0] * (n + 2)                       # slot n + 1 absorbs the last -seats
    for first, last, seats in bookings:
        diff[first] += seats                   # the range starts here...
        diff[last + 1] -= seats                # ...and stops after `last`
    out, running = [], 0
    for i in range(1, n + 1):
        running += diff[i]                     # running sum = seats on flight i
        out.append(running)
    return out

def car_pooling(trips, capacity):              # LeetCode 1094, as a sweep over events
    events = []
    for p, start, end in trips:
        events.append((start, p))              # p people get in at start
        events.append((end, -p))               # and get out at end: [start, end)
    load = 0
    for _, change in sorted(events):           # at one position, -p sorts before +p
        load += change
        if load > capacity:
            return False
    return True

print(*flight_bookings([[1, 2, 10], [2, 3, 20], [2, 5, 25]], 5))
print(*("yes" if car_pooling([[2, 1, 5], [3, 3, 7]], c) else "no" for c in (4, 5)))
```

Output:
```text
10 55 45 25 25
no yes
```

- line 2: n + 2 slots: the flights are numbered from 1, and `last + 1` can be n + 1.
- line 5: A booking costs O(1), however many flights it covers.
- line 8: One pass rebuilds every value: O(n + m) for m bookings in total.
- line 18: Tuples compare by position first and then by change, so drop-offs come before pick-ups at the same stop. Sorting costs O(m log m) for m trips, whatever the distances.

```javascript
function flightBookings(bookings, n) {         // LeetCode 1109: flights 1..n
  const diff = new Array(n + 2).fill(0);       // slot n + 1 absorbs the last -seats
  for (const [first, last, seats] of bookings) {
    diff[first] += seats;                      // the range starts here...
    diff[last + 1] -= seats;                   // ...and stops after `last`
  }
  const out = [];
  let running = 0;
  for (let i = 1; i <= n; i++) {
    running += diff[i];                        // running sum = seats on flight i
    out.push(running);
  }
  return out;
}

function carPooling(trips, capacity) {         // LeetCode 1094, as a sweep over events
  const events = [];
  for (const [p, start, end] of trips) events.push([start, p], [end, -p]);   // in at start, out at end
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // at one position, -p before +p
  let load = 0;
  for (const [, change] of events) {
    load += change;
    if (load > capacity) return false;
  }
  return true;
}

console.log(...flightBookings([[1, 2, 10], [2, 3, 20], [2, 5, 25]], 5));
console.log(...[4, 5].map(c => (carPooling([[2, 1, 5], [3, 3, 7]], c) ? "yes" : "no")));
```

Output:
```text
10 55 45 25 25
no yes
```

- line 2: n + 2 slots: the flights are numbered from 1, and `last + 1` can be n + 1.
- line 5: A booking costs O(1), however many flights it covers.
- line 10: One pass rebuilds every value: O(n + m) for m bookings in total.
- line 19: Sort by position, then by change, so drop-offs come before pick-ups at the same stop. Without a comparator, `sort` would compare the pairs as strings.

### Sliding-window maximum with a monotonic deque
```python
from collections import deque

def max_sliding_window(nums, k):
    dq = deque()                          # indexes; their values decrease front to back
    out = []
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:
            dq.pop()                      # never a maximum again: x is as big and stays longer
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()                  # the front has slid out of the window
        if i >= k - 1:
            out.append(nums[dq[0]])       # the front is this window's maximum
    return out

print(*max_sliding_window([1, 3, -1, -3, 5, 3, 6, 7], 3))
print(*max_sliding_window([9, 8, 7, 6, 5], 2), "|", *max_sliding_window([4, 2, 12, 3], 1))
```

Output:
```text
3 3 5 5 6 7
9 8 7 6 | 4 2 12 3
```

- line 7: Each index is pushed once and popped at most once, so all the pops together cost O(n).
- line 10: Only index i − k can leave at step i, so one check is enough.
- line 13: The values decrease from front to back, so the front is the window's maximum.

```javascript
function maxSlidingWindow(nums, k) {
  const dq = [];                          // indexes; their values decrease front to back
  let head = 0;                           // the front is dq[head]
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    while (dq.length > head && nums[dq.at(-1)] <= nums[i])
      dq.pop();                           // never a maximum again: nums[i] is as big and stays longer
    dq.push(i);
    if (dq[head] <= i - k) head++;        // the front has slid out of the window
    if (i >= k - 1) out.push(nums[dq[head]]);   // the front is this window's maximum
  }
  return out;
}

console.log(...maxSlidingWindow([1, 3, -1, -3, 5, 3, 6, 7], 3));
console.log(...maxSlidingWindow([9, 8, 7, 6, 5], 2), "|", ...maxSlidingWindow([4, 2, 12, 3], 1));
```

Output:
```text
3 3 5 5 6 7
9 8 7 6 | 4 2 12 3
```

- line 3: JavaScript has no deque. Nothing is ever added at the front here, so an array plus a head index does the job; `shift()` could cost O(n) per call.
- line 6: `dq.length > head` means “not empty”. Each index is pushed once and popped at most once: O(n) in total.
- line 9: Popping the front is just `head++`. The dead slots stay in the array, so it can grow to n entries.

## Worked example
**Problem.** Return the length of the shortest non-empty subarray of `nums` whose sum is at least k, or −1 if there is none. `nums` can hold negative numbers, and k ≥ 1 (LeetCode 862, Shortest Subarray with Sum at Least K).

1. A shrinking window fails: a negative number can make a longer window's sum smaller, so “shrink while the sum is ≥ k” stops too early. For [84, −37, 32, 40, 95] and k = 167 it reports 5, but [32, 40, 95] has length 3.
2. Use prefix sums P[0..n] with P[0] = 0. Now we want the smallest j − i with i < j and P[j] − P[i] ≥ k.
3. Keep a deque of candidate starts i whose P values increase. For each j, pop the front while P[j] − P[front] ≥ k and record j − front: any later end would only be longer from that start. Then pop the back while P[back] ≥ P[j]: j starts later with a prefix no higher, so it beats them for every future end. Push j.
4. Each index enters and leaves the deque at most once: O(n) time, and O(n) space for the prefix sums and the deque.

```python
from collections import deque

def shortest_subarray(nums, k):
    pre = [0]
    for x in nums:
        pre.append(pre[-1] + x)                 # pre[j] - pre[i] = sum of nums[i..j-1]
    best = len(nums) + 1
    dq = deque()                                # candidate starts, with increasing pre
    for j, p in enumerate(pre):
        while dq and p - pre[dq[0]] >= k:
            best = min(best, j - dq.popleft())  # the shortest window from that start
        while dq and pre[dq[-1]] >= p:
            dq.pop()                            # j starts later with a prefix no higher: better
        dq.append(j)
    return best if best <= len(nums) else -1

print(shortest_subarray([2, -1, 2], 3), shortest_subarray([1, 2], 4),
      shortest_subarray([84, -37, 32, 40, 95], 167), shortest_subarray([1], 1))
```

Output:
```text
3 -1 3 1
```

```javascript
function shortestSubarray(nums, k) {
  const pre = [0];
  for (const x of nums) pre.push(pre.at(-1) + x);   // pre[j] - pre[i] = sum of nums[i..j-1]
  let best = nums.length + 1;
  const dq = [];                                     // candidate starts, with increasing pre
  let head = 0;                                      // the front is dq[head]
  for (let j = 0; j < pre.length; j++) {
    while (dq.length > head && pre[j] - pre[dq[head]] >= k)
      best = Math.min(best, j - dq[head++]);         // the shortest window from that start
    while (dq.length > head && pre[dq.at(-1)] >= pre[j])
      dq.pop();                                      // j starts later with a prefix no higher: better
    dq.push(j);
  }
  return best <= nums.length ? best : -1;
}

console.log(shortestSubarray([2, -1, 2], 3), shortestSubarray([1, 2], 4),
            shortestSubarray([84, -37, 32, 40, 95], 167), shortestSubarray([1], 1));
```

Output:
```text
3 -1 3 1
```

**Answer.** 3 −1 3 1. [2, −1, 2] needs all three numbers; [1, 2] never reaches 4; the third call finds [32, 40, 95], which a shrinking window misses; and [1] reaches 1 at once. O(n) time and O(n) space.

## Your turn (faded example)
**Problem.** You start at index 0 of `nums` and must reach the last index. Each move jumps forward by 1 to k places, and your score is the sum of every number you land on, the first and last included. Return the maximum score (LeetCode 1696, Jump Game VI).

- ✓ dp[i] = nums[i] + max(dp[i − k .. i − 1]), with dp[0] = nums[0]. Scanning the last k values every time is O(n × k), up to 10¹⁰ steps for n = k = 10⁵.
- **What does the deque hold, and what is at its front?**
  <details><summary>Answer</summary>Indexes from the last k positions, with dp values decreasing from front to back; the front is the best index you can jump from.</details>
- **For each i, in what order do you use and update the deque?**
  <details><summary>Answer</summary>Drop the front if it is out of range (front < i − k), set dp[i] = nums[i] + dp[front], then pop indexes with dp ≤ dp[i] from the back and push i.</details>
- **Time and space?**
  <details><summary>Answer</summary>O(n) time, because each index enters and leaves the deque once; O(n) space for dp and the deque.</details>

Starter:
```python
from collections import deque

def max_result(nums, k):
    dp = [0] * len(nums)
    dp[0] = nums[0]
    dq = deque([0])                          # indexes with decreasing dp values
    for i in range(1, len(nums)):
        ...                                  # TODO: drop the front if it is out of range
        dp[i] = nums[i] + dp[dq[0]]
        ...                                  # TODO: pop smaller-or-equal dp from the back, then push i
    return dp[-1]

print(max_result([1, -1, -2, 4, -7, 3], 2))   # expect 7
```

```javascript
function maxResult(nums, k) {
  const dp = new Array(nums.length).fill(0);
  dp[0] = nums[0];
  const dq = [0];                            // indexes with decreasing dp values
  let head = 0;                              // the front is dq[head]
  for (let i = 1; i < nums.length; i++) {
    // TODO: drop the front if it is out of range
    dp[i] = nums[i] + dp[dq[head]];
    // TODO: pop smaller-or-equal dp from the back, then push i
  }
  return dp.at(-1);
}

console.log(maxResult([1, -1, -2, 4, -7, 3], 2));   // expect 7
```

<details><summary>Full solution</summary>

```python
from collections import deque

def max_result(nums, k):
    dp = [0] * len(nums)
    dp[0] = nums[0]
    dq = deque([0])                          # indexes with decreasing dp values
    for i in range(1, len(nums)):
        if dq[0] < i - k:
            dq.popleft()                     # too far back to jump from
        dp[i] = nums[i] + dp[dq[0]]          # the best index in reach, plus this square
        while dq and dp[dq[-1]] <= dp[i]:
            dq.pop()                         # i is as good and stays in reach longer
        dq.append(i)
    return dp[-1]

print(max_result([1, -1, -2, 4, -7, 3], 2), max_result([10, -5, -2, 4, 0, 3], 3),
      max_result([1, -5, -20, 4, -1, 3, -6, -3], 2))
```

Output:
```text
7 17 0
```

```javascript
function maxResult(nums, k) {
  const dp = new Array(nums.length).fill(0);
  dp[0] = nums[0];
  const dq = [0];                            // indexes with decreasing dp values
  let head = 0;                              // the front is dq[head]
  for (let i = 1; i < nums.length; i++) {
    if (dq[head] < i - k) head++;            // too far back to jump from
    dp[i] = nums[i] + dp[dq[head]];          // the best index in reach, plus this square
    while (dq.length > head && dp[dq.at(-1)] <= dp[i]) dq.pop();   // i is as good and stays longer
    dq.push(i);
  }
  return dp.at(-1);
}

console.log(maxResult([1, -1, -2, 4, -7, 3], 2), maxResult([10, -5, -2, 4, 0, 3], 3),
            maxResult([1, -5, -20, 4, -1, 3, -6, -3], 2));
```

Output:
```text
7 17 0
```

</details>

## Socratic checks and quiz (answers hidden)
**1. What does this print?**

```python
d = [0] * 6
for l, r, v in [(0, 2, 3), (1, 4, 2), (3, 3, 5)]:
    d[l] += v
    d[r + 1] -= v
run, out = 0, []
for x in d[:5]:
    run += x
    out.append(run)
print(*out)
```

```javascript
const d = new Array(6).fill(0);
for (const [l, r, v] of [[0, 2, 3], [1, 4, 2], [3, 3, 5]]) {
  d[l] += v;
  d[r + 1] -= v;
}
let run = 0;
const out = [];
for (const x of d.slice(0, 5)) {
  run += x;
  out.push(run);
}
console.log(...out);
```

- A. 3 5 5 7 2
- B. 3 2 0 2 -5
- C. 3 5 5 7 0
- D. 3 5 5 2 2

<details><summary>Answer</summary>

3 5 5 7 2. The difference array ends as [3, 2, 0, 2, −5, −2], and its running sums are the final values. Check one directly: index 3 gets 2 from the second update and 5 from the third, so 7; index 4 gets only the second update's 2.

</details>

**2. What does this print?**

```python
from collections import deque

nums, k = [4, 2, 5, 1, 3], 3
dq, out = deque(), []
for i, x in enumerate(nums):
    while dq and nums[dq[-1]] >= x:
        dq.pop()
    dq.append(i)
    if dq[0] <= i - k:
        dq.popleft()
    if i >= k - 1:
        out.append(nums[dq[0]])
print(*out)
```

```javascript
const nums = [4, 2, 5, 1, 3], k = 3;
const dq = [], out = [];
let head = 0;
for (let i = 0; i < nums.length; i++) {
  while (dq.length > head && nums[dq.at(-1)] >= nums[i]) dq.pop();
  dq.push(i);
  if (dq[head] <= i - k) head++;
  if (i >= k - 1) out.push(nums[dq[head]]);
}
console.log(...out);
```

- A. 2 1 1
- B. 5 5 5
- C. 4 2 1
- D. 2 1 3

<details><summary>Answer</summary>

2 1 1. The comparison is `>=`, so bigger values are popped and the deque keeps increasing values: it computes the sliding-window minimum. The windows [4, 2, 5], [2, 5, 1] and [5, 1, 3] have minimums 2, 1 and 1.

</details>

**3. `nums` holds 10⁵ numbers, some of them negative. You need the shortest subarray with sum ≥ K. Which approach is correct and O(n)?**

- A. Prefix sums with a deque of start indexes whose prefix sums increase
- B. A two-pointer window that shrinks while its sum is ≥ K
- C. Prefix sums with a hash map from each sum to its latest index
- D. Sorting the numbers and taking the largest until the sum reaches K

<details><summary>Answer</summary>

Prefix sums with a deque of start indexes whose prefix sums increase. Negatives break the shrinking window, because a longer window can have a smaller sum. A hash map of prefix sums finds an exact sum (LeetCode 560), not “at least”. Sorting destroys the order, and a subarray must be contiguous.

</details>

**4. Which statements about difference arrays are true? (choose 2)**

- A. Adding v to a[l..r] costs O(1): `d[l] += v` and `d[r + 1] -= v`
- B. One running sum over d after all the updates rebuilds the whole array in O(n)
- C. Reading a single a[i] between updates costs O(1)
- D. They can also answer range-maximum queries
- E. They only work when the array starts as all zeros

<details><summary>Answer</summary>

Adding v to a[l..r] costs O(1): `d[l] += v` and `d[r + 1] -= v`, One running sum over d after all the updates rebuilds the whole array in O(n). Reading a[i] needs the sum of d[0..i], which is O(n). A difference array knows nothing about maxima. Any starting array works: begin with d[0] = a[0] and d[i] = a[i] − a[i − 1].

</details>

**5. Judge each statement.**

- In the sliding-window maximum, each index is pushed and popped at most once.
- For a window maximum, the deque's values increase from front to back.
- Jump Game VI's dp[i] = nums[i] + max(dp[i − k .. i − 1]) can use the same kind of deque, over dp.
- In JavaScript, `shift()` always removes the first item in O(1).

<details><summary>Answer</summary>

In the sliding-window maximum, each index is pushed and popped at most once.: Yes; For a window maximum, the deque's values increase from front to back.: No; Jump Game VI's dp[i] = nums[i] + max(dp[i − k .. i − 1]) can use the same kind of deque, over dp.: Yes; In JavaScript, `shift()` always removes the first item in O(1).: No. Each index enters once and leaves at most once, so the total is O(n). The values decrease from front to back, which puts the maximum at the front. The max over the last k dp values is a sliding-window maximum. `shift()` can cost O(n), so use a head index.

</details>

**6. Put the steps of checking Car Pooling (LeetCode 1094) with a sweep over sorted events in order.**

- (put the steps in order)

<details><summary>Answer</summary>

Turn each trip into two events: (start, +p) and (end, −p) → Sort the events by position, with −p before +p at the same position → Walk the sorted events, adding each change to a running load → Return false as soon as the load exceeds the capacity. You can't sort events you haven't made, the walk needs them in order, and the load is only known once each change is added. Putting −p first lets a seat freed at a stop be reused at that stop.

</details>

**7. Complete this JavaScript sliding-window maximum, which uses an array with a head index.**

```
function maxSlidingWindow(nums, k) {
  const dq = [], out = [];
  let head = 0;
  for (let i = 0; i < nums.length; i++) {
    while (dq.length > head && nums[dq.at(-1)] {{0}} nums[i]) dq.pop();
    dq.push(i);
    if (dq[head] {{1}} i - k) head++;
    if (i >= k - 1) out.push(nums[dq[{{2}}]]);
  }
  return out;
}

```

<details><summary>Answer</summary>

<= | <= | head. Pop back values that are ≤ nums[i], so the values decrease from front to back. The front leaves once its index is ≤ i − k (with `<` it would stay one step too long). The maximum is at the front, `dq[head]`, not at index 0 of the array or at the back.

</details>

**8. Match each job to its tool.**


<details><summary>Answer</summary>

The sum of any rectangle in a grid that never changes = A 2-D prefix table with a zero row and column; Add to many ranges, then read every value once = A difference array and one running sum; The maximum of every window of size k = A deque of indexes with decreasing values; The shortest subarray with sum ≥ K, negatives allowed = Prefix sums and a deque of increasing prefix sums. A hash map of prefix sums counts subarrays with an exact sum (LeetCode 560); none of these jobs needs it.

</details>

## Traps & misconceptions
- **“A shrinking window finds the shortest subarray with sum ≥ K for any numbers.”** Only when no number is negative. A negative number can make a longer window's sum smaller, so shrinking stops too early: for [84, −37, 32, 40, 95] and K = 167 it reports 5, but [32, 40, 95] has length 3. Use prefix sums with an increasing deque.
- **“A rectangle's sum is the corner value minus the strip above and the strip to the left.”** The block above and to the left lies in both strips, so it gets subtracted twice: add P[r1][c1] back once.
- **“A difference array lets you read a[i] cheaply between updates.”** Reading a[i] means summing d[0..i], which is O(n). Difference arrays suit many updates followed by one read pass; for reads mixed with updates, keep the difference array in a Fenwick tree (module 08).
- **“Popping several items per step makes the sliding-window maximum O(n × k).”** Each index is pushed once and popped at most once over the whole run, so all the pops together cost O(n): O(1) amortised per step.
- **“In JavaScript, `shift()` is fine for the front of the deque.”** `shift()` can cost O(n) per call, because the remaining items move down one place; over a run that can be O(n²). These windows never add at the front, so keep a head index: read `dq[head]` and do `head++`.
- **“A sweep can handle starts and ends at the same position in any order.”** With half-open ranges [start, end), a passenger who gets out at 5 frees a seat for one who gets in at 5, so −v must come first, or the load briefly looks too high. Sorting (position, change) pairs does this, because the negative change sorts first.

## Discussion prompts
- **Why does LeetCode 862's deque keep prefix sums increasing, while the window maximum keeps values decreasing?**
  <details><summary>One good answer</summary>Both throw away candidates that can never win. In LeetCode 862 the deque holds starts: a start is better when it is later (shorter subarray) and its prefix sum is lower (bigger subarray sum), so a new start with a prefix no higher makes earlier, higher ones useless. In the window maximum, a new value at least as big makes earlier, smaller ones useless, because it also stays in the window longer.</details>
- **When would you sweep over sorted events instead of using a difference array?**
  <details><summary>One good answer</summary>When the positions are huge or sparse (times up to 10⁹), so an array indexed by position won't fit, but there are few ranges. Sorting 2m events costs O(m log m) whatever the coordinate range. With small positions (say up to 10⁶), the difference array is simpler and O(n + m).</details>

## Teach-back
**Prompt:** Explain to a junior colleague how a monotonic deque gives the maximum of every window of size k in O(n), and how the same idea speeds up the DP in Jump Game VI.

Rubric:
- [ ] The deque stores indexes whose values decrease from front to back
- [ ] Pop values ≤ the new one from the back before pushing; pop the front once it leaves the window
- [ ] The front is the window's maximum
- [ ] Each index is pushed and popped at most once: O(n) in total
- [ ] Jump Game VI: dp[i] = nums[i] + the max of the last k dp values, so the same deque runs over dp

<details><summary>Model answer</summary>

A monotonic deque keeps the indexes of the current window whose values decrease from front to back. When index i arrives, every index at the back whose value is no bigger than nums[i] is popped: it leaves the window sooner and is never bigger, so it can never be the maximum again. Then i is pushed, and if the front index is now outside the window (≤ i − k), it is popped from the front. The front is always the window's maximum. Each index is pushed once and popped at most once, so the whole run is O(n) time with O(k) extra space. Jump Game VI has dp[i] = nums[i] + the max of dp over the last k indexes, which is exactly a sliding-window maximum over dp, so the same deque turns an O(n × k) DP into O(n). In JavaScript I use an array with a head index, since nothing is ever added at the front.

</details>

## Quick Q&A (also in the SRS deck)
- **Sum of the rectangle (r1, c1)–(r2, c2) from a padded 2-D prefix table P?** P[r2 + 1][c2 + 1] − P[r1][c2 + 1] − P[r2 + 1][c1] + P[r1][c1].
- **How do you add v to a[l..r] with a difference array?** d[l] += v and d[r + 1] −= v; a running sum of d at the end gives the array.
- **Why is the sliding-window maximum with a deque O(n)?** Each index is pushed once and popped at most once.
- **In what order are the values in a sliding-window-maximum deque?** Decreasing from front to back (stored as indexes), so the front is the maximum.
- **LeetCode 862: what happens at each prefix index j?** Pop the front while P[j] − P[front] ≥ K, recording the length; pop the back while P[back] ≥ P[j]; push j.
- **How do you pop the front of a JavaScript array used as a deque in O(1)?** Keep a head index: read dq[head], then head++. Never shift().

## Practice problems
- [ ] [LC 304 · Range Sum Query 2D - Immutable](https://leetcode.com/problems/range-sum-query-2d-immutable/) · Medium · a 2-D table with a zero row and column; four lookups per query
- [ ] [LC 1314 · Matrix Block Sum](https://leetcode.com/problems/matrix-block-sum/) · Medium · one 2-D prefix query per cell, with the block's corners clamped to the grid
- [ ] [LC 1094 · Car Pooling](https://leetcode.com/problems/car-pooling/) · Medium · a difference array over the stops (out at `to`), or sorted events with drop-offs first
- [ ] [LC 1109 · Corporate Flight Bookings](https://leetcode.com/problems/corporate-flight-bookings/) · Medium · +seats at first, −seats at last + 1, then one running sum
- [ ] [LC 2381 · Shifting Letters II](https://leetcode.com/problems/shifting-letters-ii/) · Medium · a difference array of +1/−1 shifts, then each running total mod 26; in JavaScript, add 26 before the final % to fix negatives
- [ ] [LC 239 · Sliding Window Maximum](https://leetcode.com/problems/sliding-window-maximum/) · Hard · a deque of indexes with decreasing values; drop the front when it leaves the window
- [ ] [LC 862 · Shortest Subarray with Sum at Least K](https://leetcode.com/problems/shortest-subarray-with-sum-at-least-k/) · Hard · the worked example: prefix sums plus a deque of starts with increasing prefix sums
- [ ] [LC 1696 · Jump Game VI](https://leetcode.com/problems/jump-game-vi/) · Medium · the faded example: a deque over the last k dp values
- [ ] [LC 1425 · Constrained Subsequence Sum](https://leetcode.com/problems/constrained-subsequence-sum/) · Hard · dp[i] = nums[i] + max(0, the best dp in the last k), kept in a deque; the answer is max(dp)

## Sources (accessed 2026-10-09)
- [cp-algorithms: Minimum stack / Minimum queue](https://cp-algorithms.com/data_structures/stack_queue_modification.html)
- [USACO Guide: Prefix sums](https://usaco.guide/silver/prefix-sums)
- [USACO Guide: More on prefix sums](https://usaco.guide/silver/more-prefix-sums)
- [Wikipedia: Summed-area table](https://en.wikipedia.org/wiki/Summed-area_table)
