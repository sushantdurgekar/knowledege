---
title: "A dynamic array from scratch"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: A dynamic array from scratch

> Data Structures & Algorithms L1 · about 60 min · modules m01, m02

Build the structure behind Python's list and JavaScript's Array: a fixed-size block that grows by a constant factor when full (we use ×2; CPython grows lists by about 1.125× and V8 by about 1.5×). Count the copies to prove append is O(1) amortised.

## Steps
1. Store `capacity`, `size` and a fixed-size block (a Python list of None / a JS array created once).
2. Implement `append`, `get(i)`, `set(i, x)`, `pop()` and `len`/`size` with bounds checks.
3. When full, allocate a block twice as big and copy everything across; count every copied item.
4. Append 1,000,000 items and print copies ÷ n. It should stay below 2.
5. Add `insert(i, x)` and note why it is O(n).

## Prove it worked
- copies ÷ n stays below 2 for any n.
- `get` and `pop` never loop; `insert` at index 0 is the slow one.

## Break it (then fix it)
- Grow by +10 slots instead of ×2 and watch copies ÷ n grow with n (that's O(n²) total).
- Shrink by half when a quarter full, not when half full, and explain why (avoid thrashing).

## Reference solution
<details><summary>Open after you've tried</summary>

```python
class DynArray:
    def __init__(self):
        self._cap, self._n, self.copies = 1, 0, 0
        self._a = [None] * self._cap

    def __len__(self):
        return self._n

    def _grow(self):
        bigger = [None] * (self._cap * 2)
        for i in range(self._n):          # O(n) copy, but rare
            bigger[i] = self._a[i]
        self.copies += self._n
        self._a, self._cap = bigger, self._cap * 2

    def append(self, x):                  # O(1) amortised
        if self._n == self._cap:
            self._grow()
        self._a[self._n] = x
        self._n += 1

    def get(self, i):                     # O(1)
        if not 0 <= i < self._n:
            raise IndexError(i)
        return self._a[i]

    def set(self, i, x):                  # O(1)
        if not 0 <= i < self._n:
            raise IndexError(i)
        self._a[i] = x

    def pop(self):                        # O(1)
        if self._n == 0:
            raise IndexError("pop from empty")
        self._n -= 1
        x, self._a[self._n] = self._a[self._n], None
        return x

    def insert(self, i, x):               # O(n): shifts the tail right
        if not 0 <= i <= self._n:
            raise IndexError(i)
        self.append(x)
        for k in range(self._n - 1, i, -1):
            self._a[k] = self._a[k - 1]
        self._a[i] = x

d = DynArray()
for k in range(100_000):
    d.append(k)
assert len(d) == 100_000 and d.get(99_999) == 99_999
assert d.copies / len(d) < 2
d.set(5, 42)
assert d.get(5) == 42
d.set(5, 5)
d.insert(0, -1)
assert d.get(0) == -1 and d.get(1) == 0 and d.pop() == 99_999
print("copies per append:", round(d.copies / 100_000, 3))
```

Output:
```text
copies per append: 1.311
```

```javascript
class DynArray {
  constructor() { this.cap = 1; this.n = 0; this.copies = 0; this.a = new Array(this.cap); }
  get length() { return this.n; }
  grow() {
    const bigger = new Array(this.cap * 2);
    for (let i = 0; i < this.n; i++) bigger[i] = this.a[i];   // O(n), but rare
    this.copies += this.n;
    this.a = bigger; this.cap *= 2;
  }
  append(x) { if (this.n === this.cap) this.grow(); this.a[this.n++] = x; }   // O(1) amortised
  get(i) { if (i < 0 || i >= this.n) throw new RangeError(String(i)); return this.a[i]; }
  set(i, x) { if (i < 0 || i >= this.n) throw new RangeError(String(i)); this.a[i] = x; }   // O(1)
  pop() {
    if (this.n === 0) throw new RangeError("pop from empty");
    const x = this.a[--this.n]; this.a[this.n] = undefined; return x;
  }
  insert(i, x) {                                                // O(n)
    if (i < 0 || i > this.n) throw new RangeError(String(i));
    this.append(x);
    for (let k = this.n - 1; k > i; k--) this.a[k] = this.a[k - 1];
    this.a[i] = x;
  }
}

const d = new DynArray();
for (let k = 0; k < 100000; k++) d.append(k);
if (d.length !== 100000 || d.get(99999) !== 99999) throw new Error("append/get");
if (!(d.copies / d.length < 2)) throw new Error("amortised bound");
d.set(5, 42);
if (d.get(5) !== 42) throw new Error("set");
d.set(5, 5);
d.insert(0, -1);
if (d.get(0) !== -1 || d.get(1) !== 0 || d.pop() !== 99999) throw new Error("insert/pop");
console.log("copies per append:", Math.round((d.copies / 100000) * 1000) / 1000);
```

Output:
```text
copies per append: 1.311
```

</details>
