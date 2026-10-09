---
title: "Autocomplete with a trie"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Autocomplete with a trie

> Data Structures & Algorithms L2 · about 60 min · modules m04

Build the trie behind a search box: insert words with a popularity count, check whole words and prefixes, return the most popular completions of a prefix, and delete words without leaving dead branches behind.

## Before you start
- Module 04

## Steps
1. Each node holds a map from character to child and a `count` (0 means no word ends here).
2. `insert(word, count=1)` walks the word, creating nodes as needed, and adds to the last node's count. `contains` and `starts_with` walk without creating anything.
3. `suggest(prefix, k)`: walk to the prefix's node, collect every word below it with a DFS, and return the k most popular, ties in alphabetical order.
4. `delete(word)`: set the count to 0, then remove nodes from the bottom up while they have no children and no count.
5. Test an empty prefix, a missing prefix, a word that's a prefix of another (car and card), repeated inserts and deletes.

## Prove it worked
- `suggest` returns the most popular words first, ties in alphabetical order, and nothing for a missing prefix.
- Deleting `car` keeps `card`; deleting `dog` removes its whole branch.

## Break it (then fix it)
- Delete by only setting the count to 0 (no pruning). Insert and delete 100,000 random words and count the nodes left behind.
- Store the top 3 suggestions at every node so `suggest` costs O(prefix length). What does that do to `insert`?

## Reference solution
<details><summary>Open after you've tried</summary>

```python
class TrieNode:
    def __init__(self):
        self.children = {}
        self.count = 0                     # > 0 means a word ends here

class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word, count=1):       # O(len(word))
        node = self.root
        for ch in word:
            node = node.children.setdefault(ch, TrieNode())
        node.count += count

    def _find(self, prefix):
        node = self.root
        for ch in prefix:
            node = node.children.get(ch)
            if node is None:
                return None
        return node

    def contains(self, word):
        node = self._find(word)
        return node is not None and node.count > 0

    def starts_with(self, prefix):
        return self._find(prefix) is not None

    def suggest(self, prefix, k):          # O(size of the subtree + m log m) for m matches
        start, found = self._find(prefix), []
        def dfs(node, path):
            if node.count:
                found.append((-node.count, path))
            for ch, child in node.children.items():
                dfs(child, path + ch)
        if start:
            dfs(start, prefix)
        return [word for _, word in sorted(found)[:k]]

    def delete(self, word):                # True if the word was there
        path, node = [], self.root
        for ch in word:
            path.append((node, ch))
            node = node.children.get(ch)
            if node is None:
                return False
        if node.count == 0:
            return False
        node.count = 0
        for parent, ch in reversed(path):  # prune nodes that no longer lead to a word
            child = parent.children[ch]
            if child.count or child.children:
                break
            del parent.children[ch]
        return True

t = Trie()
for word, n in [("car", 5), ("card", 2), ("care", 7), ("cart", 2), ("cat", 9), ("dog", 4)]:
    t.insert(word, n)
t.insert("car")                            # a repeated insert adds to the count: car is now 6
assert t.contains("car") and not t.contains("ca") and t.starts_with("ca") and not t.starts_with("cow")
assert t.suggest("car", 3) == ["care", "car", "card"]     # 7, 6, then a tie at 2: card before cart
assert t.suggest("", 2) == ["cat", "care"] and t.suggest("x", 3) == []
assert t.delete("car") and not t.contains("car") and t.contains("card")   # card keeps the c-a-r nodes
assert not t.delete("car") and not t.delete("ca")
assert t.delete("dog") and not t.starts_with("d")         # the whole d-o-g branch is gone
print(*t.suggest("ca", 5))
```

Output:
```text
cat care card cart
```

```javascript
const assert = require("node:assert");

class TrieNode {
  constructor() {
    this.children = new Map();
    this.count = 0;                        // > 0 means a word ends here
  }
}

class Trie {
  constructor() { this.root = new TrieNode(); }

  insert(word, count = 1) {                // O(word.length)
    let node = this.root;
    for (const ch of word) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
    }
    node.count += count;
  }

  find(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      node = node.children.get(ch);
      if (node === undefined) return null;
    }
    return node;
  }

  contains(word) {
    const node = this.find(word);
    return node !== null && node.count > 0;
  }

  startsWith(prefix) { return this.find(prefix) !== null; }

  suggest(prefix, k) {                     // O(size of the subtree + m log m) for m matches
    const start = this.find(prefix), found = [];
    const dfs = (node, path) => {
      if (node.count) found.push([node.count, path]);
      for (const [ch, child] of node.children) dfs(child, path + ch);
    };
    if (start) dfs(start, prefix);
    found.sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    return found.slice(0, k).map(([, word]) => word);
  }

  delete(word) {                           // true if the word was there
    const path = [];
    let node = this.root;
    for (const ch of word) {
      path.push([node, ch]);
      node = node.children.get(ch);
      if (node === undefined) return false;
    }
    if (node.count === 0) return false;
    node.count = 0;
    for (const [parent, ch] of path.reverse()) {   // prune nodes that no longer lead to a word
      const child = parent.children.get(ch);
      if (child.count || child.children.size) break;
      parent.children.delete(ch);
    }
    return true;
  }
}

const t = new Trie();
for (const [word, n] of [["car", 5], ["card", 2], ["care", 7], ["cart", 2], ["cat", 9], ["dog", 4]]) t.insert(word, n);
t.insert("car");                           // a repeated insert adds to the count: car is now 6
assert.ok(t.contains("car") && !t.contains("ca") && t.startsWith("ca") && !t.startsWith("cow"));
assert.deepStrictEqual(t.suggest("car", 3), ["care", "car", "card"]);
assert.deepStrictEqual(t.suggest("", 2), ["cat", "care"]);
assert.deepStrictEqual(t.suggest("x", 3), []);
assert.ok(t.delete("car") && !t.contains("car") && t.contains("card"));
assert.ok(!t.delete("car") && !t.delete("ca"));
assert.ok(t.delete("dog") && !t.startsWith("d"));
console.log(...t.suggest("ca", 5));
```

Output:
```text
cat care card cart
```

</details>
