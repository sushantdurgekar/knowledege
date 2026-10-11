---
title: "String search and modular arithmetic"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: String search and modular arithmetic

> Data Structures & Algorithms L3 · about 75 min · modules m10, m11

Write the linear-time string tools (the prefix function with KMP search, and the Z-function) and a Rabin–Karp rolling hash that confirms every candidate. Then build the modular toolkit: fast power, the inverse from Fermat's little theorem, and nCr mod 1,000,000,007 from factorial tables. Test the searches against brute force and the arithmetic against exact big integers.

## Before you start
- Python 3.12+ and Node.js 22+
- Modules 10 and 11

## Steps
1. `prefix_function(s)`: for each i, start from k = π[i − 1] and fall back with k = π[k − 1] while s[i] ≠ s[k], then extend by one on a match. `kmp_find_all` runs the same loop over the text, reports a match whenever k reaches len(pat), and falls back to π[k − 1] so that overlapping matches are found too.
2. `z_function(s)`, with z[0] left at 0 as in module 10: keep [l, r), the match that reaches furthest right so far; inside it, start z[i] at min(r − i, z[i − l]) instead of 0. `z_find_all`: on the string pat + text, pat occurs at text position j exactly when z[m + j] ≥ m. No “#” separator is needed, because z[m + j] ≥ m already says that the m characters starting there equal pat.
3. `hash_find_all`: hash the pattern and the first window with base 131 modulo 1,000,000,007, then slide by removing the leaving character (times base^(m − 1)) and adding the new one. Compare the actual characters whenever the two hashes agree, so a collision can't fake a match.
4. `mod_pow` by repeated squaring, `mod_inv(a)` as a^(p − 2) for the prime p, and `make_ncr(limit)`: factorials up to limit, one inverse for the last, then 1/(i − 1)! = i × 1/i! walking down. In JavaScript, multiply residues through BigInt (`mulMod`), because two numbers near 10⁹ multiply to about 10¹⁸, far past 2⁵³.
5. Test 500 random texts and patterns over the alphabets a, ab and abc (empty patterns and patterns longer than the text included) against a brute-force search, and the prefix and Z functions against their definitions. Test the modular functions on random inputs against exact arithmetic: Python ints and `math.comb`, or BigInt.

## Prove it worked
- KMP, Z and the rolling hash all equal the brute-force search on 500 random cases, overlapping matches included, and the hash stays right even with a modulus of 3.
- `mod_pow`, `mod_inv` and `ncr` match exact big-integer results, and a × mod_inv(a) always leaves remainder 1.
- You can say which JavaScript products need BigInt (two residues multiplied together) and which don't (the hash, whose products stay below 2⁵³).

## Break it (then fix it)
- Delete the character check in `hash_find_all`, keeping only the hash comparison. The full-modulus checks still pass (two different strings of up to 4 letters from a, b and c can't collide modulo 1,000,000,007 with base 131), but the mod-3 check fails at once: `hash_find_all("abcab", "ab", mod=3)` returns 0 1 2 3 instead of 0 3.
- In JavaScript, replace `mulMod` with a plain `(a * b) % m`. The BigInt checks fail on the first random test, and `modInv(2)` returns 550424600 instead of 500000004: each product near 10¹⁸ is rounded to the nearest double before % runs.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random
from math import comb

MOD = 1_000_000_007

def prefix_function(s):                         # pi[i]: the longest proper prefix of s[:i + 1] that is also its suffix
    pi = [0] * len(s)
    for i in range(1, len(s)):
        k = pi[i - 1]
        while k and s[i] != s[k]:
            k = pi[k - 1]                       # fall back to the next shorter border
        if s[i] == s[k]:
            k += 1
        pi[i] = k
    return pi

def kmp_find_all(text, pat):                    # every start index of pat in text: O(n + m)
    if not pat:
        return list(range(len(text) + 1))
    pi, out, k = prefix_function(pat), [], 0
    for i, ch in enumerate(text):
        while k and ch != pat[k]:
            k = pi[k - 1]
        if ch == pat[k]:
            k += 1
        if k == len(pat):                       # a match ends at i
            out.append(i - k + 1)
            k = pi[k - 1]
    return out

def z_function(s):                              # z[i]: the longest common prefix of s and s[i:]; z[0] stays 0
    n = len(s)
    z = [0] * n
    l = r = 0                                   # s[l:r] is the match that reaches furthest right so far
    for i in range(1, n):
        if i < r:
            z[i] = min(r - i, z[i - l])         # reuse what is known inside that match
        while i + z[i] < n and s[z[i]] == s[i + z[i]]:
            z[i] += 1
        if i + z[i] > r:
            l, r = i, i + z[i]
    return z

def z_find_all(text, pat):                      # a match where z of pat + text reaches len(pat)
    if not pat:
        return list(range(len(text) + 1))
    z, m = z_function(pat + text), len(pat)
    return [i - m for i in range(m, m + len(text)) if z[i] >= m]

def mod_pow(a, e, m=MOD):                       # a^e mod m by repeated squaring: O(log e)
    result, a = 1 % m, a % m
    while e > 0:
        if e & 1:
            result = result * a % m
        a = a * a % m                           # square the base, halve the exponent
        e >>= 1
    return result

def mod_inv(a, m=MOD):                          # m prime and a % m != 0: Fermat, a^(m - 2)
    return mod_pow(a, m - 2, m)

def make_ncr(limit, m=MOD):                     # limit < m; O(limit) tables, then O(1) per query
    fact = [1] * (limit + 1)
    for i in range(1, limit + 1):
        fact[i] = fact[i - 1] * i % m
    inv_fact = [1] * (limit + 1)
    inv_fact[limit] = mod_inv(fact[limit], m)   # one inverse, then walk down: 1/(i-1)! = i/i!
    for i in range(limit, 0, -1):
        inv_fact[i - 1] = inv_fact[i] * i % m
    def ncr(n, r):
        return 0 if r < 0 or r > n else fact[n] * inv_fact[r] % m * inv_fact[n - r] % m
    return ncr

def hash_find_all(text, pat, base=131, mod=MOD):   # Rabin–Karp: O(n + m) expected
    n, m = len(text), len(pat)
    if m == 0:
        return list(range(n + 1))
    if m > n:
        return []
    hp = hw = 0
    for i in range(m):
        hp = (hp * base + ord(pat[i])) % mod
        hw = (hw * base + ord(text[i])) % mod
    top, out = mod_pow(base, m - 1, mod), []    # top: the weight of the character leaving the window
    for i in range(n - m + 1):
        if hw == hp and text[i:i + m] == pat:   # confirm, so a collision can't fake a match
            out.append(i)
        if i + m < n:                           # slide: drop text[i], then add text[i + m]
            hw = (hw - ord(text[i]) * top % mod + mod) % mod
            hw = (hw * base + ord(text[i + m])) % mod
    return out

def brute_find_all(text, pat):                  # try every start: O(n * m)
    return [i for i in range(len(text) - len(pat) + 1) if text[i:i + len(pat)] == pat]

def brute_pi(s):                                # straight from the definition
    return [max(k for k in range(i + 1) if s[:k] == s[i + 1 - k:i + 1]) for i in range(len(s))]

def brute_z(s):                                 # straight from the definition (z[0] stays 0)
    return [0 if i == 0 else max(k for k in range(len(s) - i + 1) if s[i:i + k] == s[:k]) for i in range(len(s))]

for _ in range(500):
    abc = random.choice(["a", "ab", "abc"])
    text = "".join(random.choices(abc, k=random.randint(0, 30)))
    pat = "".join(random.choices(abc, k=random.randint(0, 4)))
    want = brute_find_all(text, pat)
    assert kmp_find_all(text, pat) == z_find_all(text, pat) == hash_find_all(text, pat) == want
    assert hash_find_all(text, pat, mod=3) == want            # a tiny modulus: collisions, still right
    assert prefix_function(text) == brute_pi(text) and z_function(text) == brute_z(text)
ncr = make_ncr(1000)
for _ in range(300):
    a, e = random.randrange(MOD), random.randint(0, 60)
    assert mod_pow(a, e) == a ** e % MOD                      # exact big-integer arithmetic
    if a:
        assert a * mod_inv(a) % MOD == 1 and mod_inv(a) == pow(a, -1, MOD)
    n = random.randint(0, 1000)
    r = random.randint(-2, n + 2)
    assert ncr(n, r) == (comb(n, r) % MOD if 0 <= r <= n else 0)

text, pat, big = "abababcabab", "abab", make_ncr(100_000)
print("matches", *kmp_find_all(text, pat), "| pi", *prefix_function(pat), f"| mod p: 1/2 = {mod_inv(2)},",
      f"3^(10^9) = {mod_pow(3, 10 ** 9)}, C(100000, 50000) = {big(100_000, 50_000)}")
```

Output:
```text
matches 0 2 7 | pi 0 0 1 2 | mod p: 1/2 = 500000004, 3^(10^9) = 235939645, C(100000, 50000) = 149033233
```

```javascript
const assert = require("node:assert");

const MOD = 1_000_000_007;

function prefixFunction(s) {                    // pi[i]: the longest proper prefix of s[0..i] that is also its suffix
  const pi = new Array(s.length).fill(0);
  for (let i = 1; i < s.length; i++) {
    let k = pi[i - 1];
    while (k && s[i] !== s[k]) k = pi[k - 1];   // fall back to the next shorter border
    if (s[i] === s[k]) k++;
    pi[i] = k;
  }
  return pi;
}

function kmpFindAll(text, pat) {                // every start index of pat in text: O(n + m)
  if (!pat.length) return [...Array(text.length + 1).keys()];
  const pi = prefixFunction(pat), out = [];
  let k = 0;
  for (let i = 0; i < text.length; i++) {
    while (k && text[i] !== pat[k]) k = pi[k - 1];
    if (text[i] === pat[k]) k++;
    if (k === pat.length) {                     // a match ends at i
      out.push(i - k + 1);
      k = pi[k - 1];
    }
  }
  return out;
}

function zFunction(s) {                         // z[i]: the longest common prefix of s and s.slice(i); z[0] stays 0
  const n = s.length, z = new Array(n).fill(0);
  for (let i = 1, l = 0, r = 0; i < n; i++) {   // s[l..r) is the match that reaches furthest right so far
    if (i < r) z[i] = Math.min(r - i, z[i - l]);   // reuse what is known inside that match
    while (i + z[i] < n && s[z[i]] === s[i + z[i]]) z[i]++;
    if (i + z[i] > r) [l, r] = [i, i + z[i]];
  }
  return z;
}

function zFindAll(text, pat) {                  // a match where z of pat + text reaches pat.length
  if (!pat.length) return [...Array(text.length + 1).keys()];
  const z = zFunction(pat + text), m = pat.length, out = [];
  for (let i = m; i < m + text.length; i++) if (z[i] >= m) out.push(i - m);
  return out;
}

const mulMod = (a, b, m = MOD) => Number((BigInt(a) * BigInt(b)) % BigInt(m));   // a * b can pass 2^53

function modPow(a, e, m = MOD) {                // a^e mod m by repeated squaring: O(log e)
  let result = 1 % m;
  a %= m;
  while (e > 0) {
    if (e % 2 === 1) result = mulMod(result, a, m);
    a = mulMod(a, a, m);                        // square the base, halve the exponent
    e = Math.floor(e / 2);
  }
  return result;
}

const modInv = (a, m = MOD) => modPow(a, m - 2, m);   // m prime and a % m != 0: Fermat, a^(m - 2)

function makeNcr(limit, m = MOD) {              // limit < m; O(limit) tables, then O(1) per query
  const fact = [1];
  for (let i = 1; i <= limit; i++) fact.push(mulMod(fact[i - 1], i, m));
  const invFact = new Array(limit + 1).fill(1);
  invFact[limit] = modInv(fact[limit], m);      // one inverse, then walk down: 1/(i-1)! = i/i!
  for (let i = limit; i > 0; i--) invFact[i - 1] = mulMod(invFact[i], i, m);
  return (n, r) => (r < 0 || r > n ? 0 : mulMod(mulMod(fact[n], invFact[r], m), invFact[n - r], m));
}

function hashFindAll(text, pat, base = 131, mod = MOD) {   // Rabin–Karp: O(n + m) expected
  const n = text.length, m = pat.length;
  if (m === 0) return [...Array(n + 1).keys()];
  if (m > n) return [];
  let hp = 0, hw = 0;                           // every product below stays under 2^53: no BigInt needed
  for (let i = 0; i < m; i++) {
    hp = (hp * base + pat.charCodeAt(i)) % mod;
    hw = (hw * base + text.charCodeAt(i)) % mod;
  }
  const top = modPow(base, m - 1, mod), out = [];   // top: the weight of the character leaving the window
  for (let i = 0; i + m <= n; i++) {
    if (hw === hp && text.startsWith(pat, i)) out.push(i);   // confirm, so a collision can't fake a match
    if (i + m < n) {                            // slide: drop text[i], then add text[i + m]
      hw = (hw - ((text.charCodeAt(i) * top) % mod) + mod) % mod;
      hw = (hw * base + text.charCodeAt(i + m)) % mod;
    }
  }
  return out;
}

const bruteFindAll = (text, pat) =>             // try every start: O(n * m)
  [...Array(Math.max(text.length - pat.length + 1, 0)).keys()].filter(i => text.slice(i, i + pat.length) === pat);
const longest = (top, ok) => { let k = top; while (!ok(k)) k--; return k; };   // the largest k <= top with ok(k)
const brutePi = s => [...s].map((_, i) => longest(i, k => s.slice(0, k) === s.slice(i + 1 - k, i + 1)));
const bruteZ = s => [...s].map((_, i) => (i === 0 ? 0 : longest(s.length - i, k => s.slice(i, i + k) === s.slice(0, k))));
function exactComb(n, r) {                      // exact binomial in BigInt: C(n, i) = C(n, i - 1) * (n - i + 1) / i
  let c = 1n;
  for (let i = 1n; i <= BigInt(r); i++) c = (c * (BigInt(n) - i + 1n)) / i;
  return c;
}

const rnd = k => Math.floor(Math.random() * k);
for (let t = 0; t < 500; t++) {
  const abc = ["a", "ab", "abc"][rnd(3)];
  const word = len => Array.from({ length: len }, () => abc[rnd(abc.length)]).join("");
  const text = word(rnd(31)), pat = word(rnd(5)), want = bruteFindAll(text, pat);
  for (const found of [kmpFindAll(text, pat), zFindAll(text, pat), hashFindAll(text, pat)]) assert.deepStrictEqual(found, want);
  assert.deepStrictEqual(hashFindAll(text, pat, 131, 3), want);   // a tiny modulus: collisions, still right
  assert.deepStrictEqual(prefixFunction(text), brutePi(text));       // straight from the definitions
  assert.deepStrictEqual(zFunction(text), bruteZ(text));
}
const ncr = makeNcr(1000), P = BigInt(MOD);
for (let t = 0; t < 300; t++) {
  const a = rnd(MOD), e = rnd(61);
  assert.strictEqual(modPow(a, e), Number(BigInt(a) ** BigInt(e) % P));   // exact BigInt arithmetic
  if (a) assert.strictEqual((BigInt(a) * BigInt(modInv(a))) % P, 1n);
  const n = rnd(1001), r = rnd(n + 5) - 2;
  assert.strictEqual(ncr(n, r), r < 0 || r > n ? 0 : Number(exactComb(n, r) % P));
}

const text = "abababcabab", pat = "abab", big = makeNcr(100_000);
console.log("matches", ...kmpFindAll(text, pat), "| pi", ...prefixFunction(pat), `| mod p: 1/2 = ${modInv(2)},`,
  `3^(10^9) = ${modPow(3, 10 ** 9)}, C(100000, 50000) = ${big(100_000, 50_000)}`);
```

Output:
```text
matches 0 2 7 | pi 0 0 1 2 | mod p: 1/2 = 500000004, 3^(10^9) = 235939645, C(100000, 50000) = 149033233
```

</details>
