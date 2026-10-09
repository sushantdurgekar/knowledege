---
title: "A binary heap from scratch, heap sort and top-k"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: A binary heap from scratch, heap sort and top-k

> Data Structures & Algorithms L2 · about 75 min · modules m03

Write the array-based min-heap behind Python's `heapq`, and the one JavaScript doesn't have: push, pop, peek and an O(n) heapify. Use it for heap sort and for the k largest values, and test both against the built-in sort.

## Before you start
- Module 03

## Steps
1. Store the heap in an array: the children of index i are 2i + 1 and 2i + 2, and its parent is (i − 1) // 2.
2. `push`: append, then sift up while the item is smaller than its parent. `pop`: swap the root with the last item, remove it, then sift down.
3. Heapify in the constructor: sift down every non-leaf, from the last one back to index 0. That's O(n), not O(n log n).
4. Heap sort: heapify, then pop n times. Compare with the built-in sort on 1,000 random arrays, including empty ones and duplicates.
5. Top-k: keep a min-heap of size k, pushing each value and popping whenever the size passes k.

## Prove it worked
- Heap sort matches the built-in sort on 1,000 random arrays, including empty ones and duplicates.
- `k_largest` keeps at most k + 1 items at any moment.
- You can explain why heapify is O(n): most nodes sit near the bottom and sift down only a step or two.

## Break it (then fix it)
- Build a 100,000-item heap from values in descending order (the worst case for a min-heap), once by pushing them one at a time and once with heapify, and count the swaps each way. Then repeat with random values and explain why the gap shrinks.
- In JavaScript, push [priority, task] pairs and notice `<` compares arrays as strings ([10, "a"] < [9, "b"] is true). Add a compare function to fix it.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random

class MinHeap:
    def __init__(self, items=()):
        self.a = list(items)
        for i in range(len(self.a) // 2 - 1, -1, -1):   # heapify: O(n)
            self._down(i)

    def __len__(self):
        return len(self.a)

    def peek(self):
        if not self.a:
            raise IndexError("peek from an empty heap")
        return self.a[0]

    def push(self, x):                    # O(log n)
        self.a.append(x)
        self._up(len(self.a) - 1)

    def pop(self):                        # O(log n)
        a = self.a
        if not a:
            raise IndexError("pop from an empty heap")
        a[0], a[-1] = a[-1], a[0]
        smallest = a.pop()
        if a:
            self._down(0)
        return smallest

    def _up(self, i):
        a = self.a
        while i > 0 and a[i] < a[(i - 1) // 2]:
            p = (i - 1) // 2
            a[i], a[p] = a[p], a[i]
            i = p

    def _down(self, i):
        a, n = self.a, len(self.a)
        while True:
            smallest = i
            for c in (2 * i + 1, 2 * i + 2):
                if c < n and a[c] < a[smallest]:
                    smallest = c
            if smallest == i:
                return
            a[i], a[smallest] = a[smallest], a[i]
            i = smallest

def heap_sort(values):                    # O(n log n)
    h = MinHeap(values)
    return [h.pop() for _ in range(len(h))]

def k_largest(values, k):                 # O(n log k) time, O(k) space
    h = MinHeap()
    for v in values:
        h.push(v)
        if len(h) > k:
            h.pop()                       # drop the smallest of the k + 1
    return sorted(h.a, reverse=True)

for _ in range(1000):
    data = [random.randint(-50, 50) for _ in range(random.randint(0, 40))]
    assert heap_sort(data) == sorted(data)
    k = random.randint(1, 5)
    assert k_largest(data, k) == sorted(data, reverse=True)[:k]
h = MinHeap([5, 3, 8])
h.push(1)
assert h.peek() == 1 and h.pop() == 1 and h.pop() == 3 and len(h) == 2
try:
    MinHeap().pop()
    raise AssertionError("pop on an empty heap should fail")
except IndexError:
    pass
print(" ".join(map(str, heap_sort([5, 2, 9, 1, 5, 6]))), "|", " ".join(map(str, k_largest([3, 1, 4, 1, 5, 9, 2, 6], 3))))
```

Output:
```text
1 2 5 5 6 9 | 9 6 5
```

```javascript
const assert = require("node:assert");

class MinHeap {
  constructor(items = []) {
    this.a = [...items];
    for (let i = Math.floor(this.a.length / 2) - 1; i >= 0; i--) this.down(i);   // heapify: O(n)
  }
  get size() { return this.a.length; }
  peek() {
    if (!this.a.length) throw new RangeError("peek from an empty heap");
    return this.a[0];
  }
  push(x) {                               // O(log n)
    this.a.push(x);
    this.up(this.a.length - 1);
  }
  pop() {                                 // O(log n)
    const a = this.a;
    if (!a.length) throw new RangeError("pop from an empty heap");
    [a[0], a[a.length - 1]] = [a[a.length - 1], a[0]];
    const smallest = a.pop();
    if (a.length) this.down(0);
    return smallest;
  }
  up(i) {
    const a = this.a;
    while (i > 0 && a[i] < a[(i - 1) >> 1]) {
      const p = (i - 1) >> 1;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  down(i) {
    const a = this.a, n = a.length;
    for (;;) {
      let smallest = i;
      for (const c of [2 * i + 1, 2 * i + 2]) if (c < n && a[c] < a[smallest]) smallest = c;
      if (smallest === i) return;
      [a[i], a[smallest]] = [a[smallest], a[i]];
      i = smallest;
    }
  }
}

function heapSort(values) {               // O(n log n)
  const h = new MinHeap(values);
  return Array.from({ length: h.size }, () => h.pop());
}

function kLargest(values, k) {            // O(n log k) time, O(k) space
  const h = new MinHeap();
  for (const v of values) {
    h.push(v);
    if (h.size > k) h.pop();              // drop the smallest of the k + 1
  }
  return h.a.toSorted((x, y) => y - x);
}

for (let t = 0; t < 1000; t++) {
  const data = Array.from({ length: Math.floor(Math.random() * 41) }, () => Math.floor(Math.random() * 101) - 50);
  const sorted = data.toSorted((x, y) => x - y);
  assert.deepStrictEqual(heapSort(data), sorted);
  const k = 1 + Math.floor(Math.random() * 5);
  assert.deepStrictEqual(kLargest(data, k), sorted.toReversed().slice(0, k));
}
const h = new MinHeap([5, 3, 8]);
h.push(1);
assert.ok(h.peek() === 1 && h.pop() === 1 && h.pop() === 3 && h.size === 2);
assert.throws(() => new MinHeap().pop(), RangeError);
console.log(heapSort([5, 2, 9, 1, 5, 6]).join(" "), "|", kLargest([3, 1, 4, 1, 5, 9, 2, 6], 3).join(" "));
```

Output:
```text
1 2 5 5 6 9 | 9 6 5
```

</details>
