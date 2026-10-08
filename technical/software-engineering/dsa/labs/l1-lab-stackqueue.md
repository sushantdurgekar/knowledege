---
title: "Stack, queue and a ring buffer"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Stack, queue and a ring buffer

> Data Structures & Algorithms L1 · about 60 min · modules m05

Implement a stack on a dynamic array, a queue as a fixed-size ring buffer, and use both: check brackets, and compute "next warmer day" with a monotonic stack.

## Steps
1. Stack: a list / array with push (append), pop, a peek at the last item and an emptiness check, all O(1).
2. Ring buffer queue with capacity k: head index, size, wrap-around with modulo; enqueue fails (returns false) when full.
3. Use the stack to validate brackets `([]{})`.
4. Use a monotonic stack to compute, for each temperature, how many days until a warmer one.

## Prove it worked
- The ring buffer wraps around without ever shifting elements.
- You can explain why the monotonic stack is O(n) even though it has a while loop inside a for loop.

## Break it (then fix it)
- Use list.pop(0) / array.shift() as your queue and time 100,000 dequeues (V8 only slows down past roughly 16,000 items).
- Python: delete `not stack or` from the check inside the loop of `balanced` and find the input that crashes it. Then explain why the JavaScript version doesn't crash.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
class RingQueue:
    def __init__(self, k):
        self.a, self.head, self.size = [None] * k, 0, 0

    def enqueue(self, x):                       # O(1)
        if self.size == len(self.a):
            return False
        self.a[(self.head + self.size) % len(self.a)] = x
        self.size += 1
        return True

    def dequeue(self):                          # O(1)
        if self.size == 0:
            raise IndexError("empty queue")
        x = self.a[self.head]
        self.head = (self.head + 1) % len(self.a)
        self.size -= 1
        return x

def balanced(s):                                # O(n) time, O(n) space
    pairs, stack = {")": "(", "]": "[", "}": "{"}, []
    for ch in s:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack

def days_until_warmer(temps):                   # O(n): each index pushed and popped once
    ans, stack = [0] * len(temps), []           # stack holds indices of colder days
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            ans[j] = i - j
        stack.append(i)
    return ans

q = RingQueue(3)
assert q.enqueue(1) and q.enqueue(2) and q.enqueue(3) and not q.enqueue(4)
assert q.dequeue() == 1 and q.enqueue(4) and [q.dequeue() for _ in range(3)] == [2, 3, 4]
assert balanced("([]{})") and not balanced("(]") and not balanced("((")
assert days_until_warmer([73, 74, 75, 71, 69, 72, 76, 73]) == [1, 1, 4, 2, 1, 1, 0, 0]
print("stack and queue OK")
```

Output:
```text
stack and queue OK
```

```javascript
class RingQueue {
  constructor(k) { this.a = new Array(k); this.head = 0; this.size = 0; }
  enqueue(x) {                                   // O(1)
    if (this.size === this.a.length) return false;
    this.a[(this.head + this.size) % this.a.length] = x; this.size++; return true;
  }
  dequeue() {                                    // O(1)
    if (this.size === 0) throw new RangeError("empty queue");
    const x = this.a[this.head];
    this.head = (this.head + 1) % this.a.length; this.size--; return x;
  }
}
function balanced(s) {                           // O(n) time, O(n) space
  const pairs = new Map([[")", "("], ["]", "["], ["}", "{"]]), stack = [];
  for (const ch of s) {
    if ("([{".includes(ch)) stack.push(ch);
    else if (pairs.has(ch) && stack.pop() !== pairs.get(ch)) return false;   // pop() on empty gives undefined
  }
  return stack.length === 0;
}
function daysUntilWarmer(temps) {                // O(n)
  const ans = new Array(temps.length).fill(0), stack = [];
  temps.forEach((t, i) => {
    while (stack.length && temps[stack[stack.length - 1]] < t) { const j = stack.pop(); ans[j] = i - j; }
    stack.push(i);
  });
  return ans;
}

const assert = require("node:assert");
const q = new RingQueue(3);
assert.ok(q.enqueue(1) && q.enqueue(2) && q.enqueue(3) && !q.enqueue(4));
assert.ok(q.dequeue() === 1 && q.enqueue(4));
assert.deepStrictEqual([q.dequeue(), q.dequeue(), q.dequeue()], [2, 3, 4]);
assert.ok(balanced("([]{})") && !balanced("(]") && !balanced("(("));
assert.deepStrictEqual(daysUntilWarmer([73, 74, 75, 71, 69, 72, 76, 73]), [1, 1, 4, 2, 1, 1, 0, 0]);
console.log("stack and queue OK");
```

Output:
```text
stack and queue OK
```

</details>
