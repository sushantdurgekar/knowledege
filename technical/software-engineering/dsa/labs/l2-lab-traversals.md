---
title: "Tree toolkit: every traversal and a BST check"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Tree toolkit: every traversal and a BST check

> Data Structures & Algorithms L2 · about 75 min · modules m01, m02

Build trees from LeetCode-style lists and write every traversal in both languages: pre-, in- and post-order from one recursive walk, an iterative inorder, level order, height and a BST check. Then find out how deep a recursive walk can go in Python and in Node.js.

## Before you start
- Python 3.12+ and Node.js 22+
- Modules 01 and 02

## Steps
1. Write `TreeNode` and `build(values)`, which turns a level-order list with None / null gaps into a tree.
2. Write one recursive walk that fills the pre-, in- and post-order lists at once. Where each `append` sits decides the order.
3. Write an iterative inorder with an explicit stack, and a level order that returns one list per level.
4. Write `height(root)` (an empty tree has height 0) and `is_bst(root)` that passes a (low, high) range down the tree.
5. Test the empty tree, the sample tree, a tree that only *looks* like a BST locally, and a 2,000-node left-only chain.

## Prove it worked
- All three depth-first orders come from one walk, and you can say where each `append` sits.
- The iterative inorder, level order and height handle the 2,000-node chain in both languages.
- You can explain why Python fails at depth 2,000 and Node.js doesn't (Python's recursion limit is 1,000).

## Break it (then fix it)
- Make `is_bst` compare each node only with its two children, and show that it wrongly accepts [5, 3, 8, 1, 6].
- Raise Python's limit with `sys.setrecursionlimit(200_000)` and run `dfs_orders` on a 100,000-node chain: on Python 3.11+ it works (older versions can crash). Then run the JavaScript version on the same chain, and explain why iterative code is still the real fix (Node.js has a fixed stack of roughly 10,000 simple frames, recursion through C code such as `functools.cache` still hits a lower limit, and every frame costs memory).

## Reference solution
<details><summary>Open after you've tried</summary>

```python
from collections import deque

class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val, self.left, self.right = val, left, right

def build(values):                        # level order, None for a missing child
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue, i = deque([root]), 1
    while queue and i < len(values):
        node = queue.popleft()
        for side in ("left", "right"):
            if i < len(values) and values[i] is not None:
                child = TreeNode(values[i])
                setattr(node, side, child)
                queue.append(child)
            i += 1
    return root

def dfs_orders(root):                     # one recursive walk, three orders: O(n)
    pre, ino, post = [], [], []
    def go(node):
        if node is None:
            return
        pre.append(node.val)              # before the children
        go(node.left)
        ino.append(node.val)              # between them
        go(node.right)
        post.append(node.val)             # after them
    go(root)
    return pre, ino, post

def inorder_iterative(root):              # an explicit stack instead of recursion
    out, stack, node = [], [], root
    while stack or node:
        while node:                       # go as far left as possible
            stack.append(node)
            node = node.left
        node = stack.pop()
        out.append(node.val)
        node = node.right
    return out

def level_order(root):
    levels, queue = [], deque([root] if root else [])
    while queue:
        level = []
        for _ in range(len(queue)):       # exactly the nodes of this level
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        levels.append(level)
    return levels

def height(root):                         # the number of levels; no recursion
    return len(level_order(root))

def is_bst(root):                         # every node must sit inside (low, high)
    stack = [(root, float("-inf"), float("inf"))]
    while stack:
        node, low, high = stack.pop()
        if node is None:
            continue
        if not low < node.val < high:
            return False
        stack.append((node.left, low, node.val))
        stack.append((node.right, node.val, high))
    return True

t = build([5, 3, 8, 1, 4, None, 9])
pre, ino, post = dfs_orders(t)
assert pre == [5, 3, 1, 4, 8, 9] and ino == [1, 3, 4, 5, 8, 9] and post == [1, 4, 3, 9, 8, 5]
assert inorder_iterative(t) == ino and level_order(t) == [[5], [3, 8], [1, 4, 9]]
assert height(t) == 3 and height(None) == 0 and is_bst(t)
assert not is_bst(build([5, 3, 8, 1, 6]))     # 6 is in 5's left subtree
assert dfs_orders(None) == ([], [], []) and level_order(None) == []

chain = None
for v in range(2000, 0, -1):                  # a left-only chain, 2,000 nodes deep
    chain = TreeNode(v, left=chain)
assert height(chain) == 2000 and inorder_iterative(chain)[0] == 2000
try:
    dfs_orders(chain)
    print("recursion at depth 2000: fine")
except RecursionError:
    print("recursion at depth 2000: too deep (RecursionError)")
print("all traversal tests passed")
```

Output:
```text
recursion at depth 2000: too deep (RecursionError)
all traversal tests passed
```

```javascript
const assert = require("node:assert");

class TreeNode {
  constructor(val, left = null, right = null) {
    this.val = val;
    this.left = left;
    this.right = right;
  }
}

function build(values) {                  // level order, null for a missing child
  if (!values.length || values[0] === null) return null;
  const root = new TreeNode(values[0]);
  const queue = [root];
  let head = 0, i = 1;
  while (head < queue.length && i < values.length) {
    const node = queue[head++];
    for (const side of ["left", "right"]) {
      if (i < values.length && values[i] !== null) {
        node[side] = new TreeNode(values[i]);
        queue.push(node[side]);
      }
      i++;
    }
  }
  return root;
}

function dfsOrders(root) {                // one recursive walk, three orders: O(n)
  const pre = [], ino = [], post = [];
  const go = node => {
    if (node === null) return;
    pre.push(node.val);                   // before the children
    go(node.left);
    ino.push(node.val);                   // between them
    go(node.right);
    post.push(node.val);                  // after them
  };
  go(root);
  return [pre, ino, post];
}

function inorderIterative(root) {         // an explicit stack instead of recursion
  const out = [], stack = [];
  let node = root;
  while (stack.length || node) {
    while (node) {                        // go as far left as possible
      stack.push(node);
      node = node.left;
    }
    node = stack.pop();
    out.push(node.val);
    node = node.right;
  }
  return out;
}

function levelOrder(root) {
  const levels = [];
  let level = root ? [root] : [];
  while (level.length) {
    levels.push(level.map(n => n.val));
    level = level.flatMap(n => [n.left, n.right].filter(c => c !== null));   // the next level
  }
  return levels;
}

const height = root => levelOrder(root).length;   // the number of levels; no recursion

function isBST(root) {                    // every node must sit inside (low, high)
  const stack = [[root, -Infinity, Infinity]];
  while (stack.length) {
    const [node, low, high] = stack.pop();
    if (node === null) continue;
    if (!(low < node.val && node.val < high)) return false;
    stack.push([node.left, low, node.val], [node.right, node.val, high]);
  }
  return true;
}

const t = build([5, 3, 8, 1, 4, null, 9]);
const [pre, ino, post] = dfsOrders(t);
assert.deepStrictEqual([pre, ino, post], [[5, 3, 1, 4, 8, 9], [1, 3, 4, 5, 8, 9], [1, 4, 3, 9, 8, 5]]);
assert.deepStrictEqual(inorderIterative(t), ino);
assert.deepStrictEqual(levelOrder(t), [[5], [3, 8], [1, 4, 9]]);
assert.ok(height(t) === 3 && height(null) === 0 && isBST(t));
assert.ok(!isBST(build([5, 3, 8, 1, 6])));    // 6 is in 5's left subtree
assert.deepStrictEqual(dfsOrders(null), [[], [], []]);

let chain = null;
for (let v = 2000; v >= 1; v--) chain = new TreeNode(v, chain);   // a left-only chain
assert.ok(height(chain) === 2000 && inorderIterative(chain)[0] === 2000);
try {
  dfsOrders(chain);
  console.log("recursion at depth 2000: fine");
} catch (e) {
  console.log("recursion at depth 2000: too deep (" + e.name + ")");
}
console.log("all traversal tests passed");
```

Output:
```text
recursion at depth 2000: fine
all traversal tests passed
```

</details>
