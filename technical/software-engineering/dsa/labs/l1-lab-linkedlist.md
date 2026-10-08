---
title: "Linked-list toolkit"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Linked-list toolkit

> Data Structures & Algorithms L1 · about 60 min · modules m06

Build a singly linked list and the four classic moves (build from an array, reverse, find the middle, detect a cycle) in both languages.

## Steps
1. Write a `Node` with `val` and `next`, and helpers to build a list from an array and turn it back into an array.
2. Implement `reverse(head)` iteratively with three pointers: prev, cur, next.
3. Implement `middle(head)` with slow and fast pointers.
4. Implement `has_cycle(head)` with Floyd's algorithm, then test it on a list whose tail points back to node 2.
5. Write the Big-O of each function in a comment.

## Prove it worked
- All four functions pass on empty, one-node and even/odd-length lists.
- has_cycle returns for a cyclic list instead of looping forever.

## Break it (then fix it)
- Forget to save `next` before re-pointing in reverse and see the list get cut off.
- Return the first middle instead of the second and adjust the loop condition.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
class Node:
    def __init__(self, val, nxt=None):
        self.val, self.next = val, nxt

def from_list(xs):
    head = None
    for x in reversed(xs):
        head = Node(x, head)
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

def reverse(head):              # O(n) time, O(1) space
    prev = None
    while head:
        nxt = head.next         # save the rest of the list
        head.next = prev        # flip the arrow
        prev, head = head, nxt  # step forward
    return prev

def middle(head):               # O(n) time, O(1) space
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
    return slow

def has_cycle(head):            # O(n) time, O(1) space
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast:
            return True
    return False

assert to_list(reverse(from_list([1, 2, 3, 4]))) == [4, 3, 2, 1]
assert middle(from_list([1, 2, 3, 4, 5])).val == 3
assert middle(from_list([1, 2, 3, 4])).val == 3      # second middle
loop = from_list([1, 2, 3, 4])
loop.next.next.next.next = loop.next                 # 4 -> 2
assert has_cycle(loop) and not has_cycle(from_list([1, 2, 3]))
print("linked-list toolkit OK")
```

Output:
```text
linked-list toolkit OK
```

```javascript
class Node { constructor(val, next = null) { this.val = val; this.next = next; } }
const fromArray = xs => xs.reduceRight((head, x) => new Node(x, head), null);
function toArray(head) { const out = []; for (; head; head = head.next) out.push(head.val); return out; }

function reverse(head) {           // O(n) time, O(1) space
  let prev = null;
  while (head) { const next = head.next; head.next = prev; prev = head; head = next; }
  return prev;
}
function middle(head) {            // O(n) time, O(1) space
  let slow = head, fast = head;
  while (fast && fast.next) { slow = slow.next; fast = fast.next.next; }
  return slow;
}
function hasCycle(head) {          // O(n) time, O(1) space
  let slow = head, fast = head;
  while (fast && fast.next) {
    slow = slow.next; fast = fast.next.next;
    if (slow === fast) return true;
  }
  return false;
}

const assert = require("node:assert");
assert.deepStrictEqual(toArray(reverse(fromArray([1, 2, 3, 4]))), [4, 3, 2, 1]);
assert.strictEqual(middle(fromArray([1, 2, 3, 4, 5])).val, 3);
assert.strictEqual(middle(fromArray([1, 2, 3, 4])).val, 3);
const loop = fromArray([1, 2, 3, 4]);
loop.next.next.next.next = loop.next;
assert.ok(hasCycle(loop) && !hasCycle(fromArray([1, 2, 3])));
console.log("linked-list toolkit OK");
```

Output:
```text
linked-list toolkit OK
```

</details>
