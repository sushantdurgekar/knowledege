---
title: "Hash map with chaining and resizing"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Hash map with chaining and resizing

> Data Structures & Algorithms L1 · about 75 min · modules m03

Build a hash map with separate chaining: an array of buckets, a hash function, and a resize to twice the buckets when the load factor passes 0.75. Then use it to count words.

## Steps
1. Pick a bucket with `hash(key) % len(buckets)` (Python) or a small string hash (JavaScript).
2. Each bucket is a list of [key, value] pairs; `put` updates an existing key or appends a new pair.
3. Track `size`; when size ÷ buckets > 0.75, double the bucket count and re-insert every pair.
4. Implement `get` (with a default) and `delete`.
5. Count words in a sentence with your map and check against Counter / a Map.

## Prove it worked
- Average bucket length stays below 1 after many inserts.
- Updating an existing key doesn't grow `size`.

## Break it (then fix it)
- Make the hash function return 0 for every key and time 10,000 inserts: every bucket operation becomes O(n).
- Remove the resize and watch the buckets get long.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
class HashMap:
    def __init__(self, buckets=8):
        self.b, self.size = [[] for _ in range(buckets)], 0

    def _bucket(self, key):
        return self.b[hash(key) % len(self.b)]

    def put(self, key, val):                 # O(1) average
        bucket = self._bucket(key)
        for pair in bucket:
            if pair[0] == key:
                pair[1] = val
                return
        bucket.append([key, val])
        self.size += 1
        if self.size / len(self.b) > 0.75:
            self._resize()

    def get(self, key, default=None):        # O(1) average
        for k, v in self._bucket(key):
            if k == key:
                return v
        return default

    def delete(self, key):
        bucket = self._bucket(key)
        for i, (k, _) in enumerate(bucket):
            if k == key:
                bucket.pop(i)
                self.size -= 1
                return True
        return False

    def _resize(self):                       # O(n), but rare
        old = [pair for bucket in self.b for pair in bucket]
        self.b, self.size = [[] for _ in range(len(self.b) * 2)], 0
        for k, v in old:
            self.put(k, v)

from collections import Counter
words = "the cat and the hat and the bat".split()
m = HashMap()
for w in words:
    m.put(w, m.get(w, 0) + 1)
assert all(m.get(w) == c for w, c in Counter(words).items())
for i in range(1000):
    m.put(i, i * i)
assert m.get(999) == 998001 and len(m.b) >= 1000 / 0.75
assert m.delete("cat") and m.get("cat") is None
print("hash map OK:", m.get("the"), "x the")
```

Output:
```text
hash map OK: 3 x the
```

```javascript
class HashMap {
  constructor(buckets = 8) { this.b = Array.from({ length: buckets }, () => []); this.size = 0; }
  hash(key) {                                  // a simple string hash (31 * h + code)
    const s = String(key); let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  bucket(key) { return this.b[this.hash(key) % this.b.length]; }
  put(key, val) {                              // O(1) average
    const bucket = this.bucket(key);
    for (const pair of bucket) if (pair[0] === key) { pair[1] = val; return; }
    bucket.push([key, val]); this.size++;
    if (this.size / this.b.length > 0.75) this.resize();
  }
  get(key, dflt = undefined) {                 // O(1) average
    for (const [k, v] of this.bucket(key)) if (k === key) return v;
    return dflt;
  }
  delete(key) {
    const bucket = this.bucket(key);
    const i = bucket.findIndex(p => p[0] === key);
    if (i < 0) return false;
    bucket.splice(i, 1); this.size--; return true;
  }
  resize() {                                   // O(n), but rare
    const old = this.b.flat();
    this.b = Array.from({ length: this.b.length * 2 }, () => []); this.size = 0;
    for (const [k, v] of old) this.put(k, v);
  }
}

const words = "the cat and the hat and the bat".split(" ");
const m = new HashMap();
for (const w of words) m.put(w, m.get(w, 0) + 1);
const ref = new Map();
for (const w of words) ref.set(w, (ref.get(w) ?? 0) + 1);
for (const [w, c] of ref) if (m.get(w) !== c) throw new Error("count " + w);
for (let i = 0; i < 1000; i++) m.put(i, i * i);
if (m.get(999) !== 998001 || m.b.length < 1000 / 0.75) throw new Error("resize");
if (!m.delete("cat") || m.get("cat") !== undefined) throw new Error("delete");
console.log("hash map OK:", m.get("the"), "x the");
```

Output:
```text
hash map OK: 3 x the
```

</details>
