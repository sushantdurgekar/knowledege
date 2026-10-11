---
title: "String matching: KMP, the Z-function and rolling hashes"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, dsa-l3-m10]
status: new
created: 2026-10-09
updated: 2026-10-09
sources:
  - url: https://cp-algorithms.com/string/prefix-function.html
    accessed: 2026-10-09
  - url: https://cp-algorithms.com/string/z-function.html
    accessed: 2026-10-09
  - url: https://cp-algorithms.com/string/string-hashing.html
    accessed: 2026-10-09
  - url: https://en.wikipedia.org/wiki/Knuth%E2%80%93Morris%E2%80%93Pratt_algorithm
    accessed: 2026-10-09
---
# String matching: KMP, the Z-function and rolling hashes

> Data Structures & Algorithms · L3 Specialist · Strings, number theory & games · about 110 min · hub module `m10` ([open the hub](https://claude.ai/artifact/JfuakQWBwAvSgLi1rcuJUk))

## Why it matters
Find in an editor, `grep`, DNA search and duplicate detection all look for a pattern in a long text. The naive search can take n × m steps on unlucky input; KMP and the Z-function never need more than O(n + m), and rolling hashes compare substrings in O(1), with a small chance of a false match. The same tools answer interview favourites about repeats, periods and palindromes.

## Pre-question (answer before reading)
**Q:** A text is a million letter a's. You search it for a pattern of 1,000 a's followed by one b, trying every start position in turn. About how many character comparisons is that, and what does the search keep forgetting?

<details><summary>Answer</summary>

About a billion: at each of the 999,000 start positions it matches 1,000 a's before the b fails. After each failure it throws away what it has just read. Those characters were all a's, so the first 1,000 comparisons of the next attempt are bound to succeed. KMP keeps that knowledge in the prefix function and never moves backwards in the text.

</details>

## 🍎 Story time (kid version)
**The toy room and the treasure-map road trip: The car-colour game**

On the motorway, Ben plays a spotting game. He must see a red car, a blue car, a red car, a blue car and then a green car, one straight after another. He counts on his fingers how much of the pattern he has seen so far. He has four fingers up (red, blue, red, blue) when a red car passes instead of a green one. He starts to put all his fingers down, but Tara stops him: “Your last two cars were red then blue. That's the start of the pattern too. Keep two fingers up, and this red makes three.” Ben never needs to look back at cars that have gone.

| In the story | In code |
|---|---|
| The cars going past, one at a time | The text, read once from left to right |
| The fingers Ben has up | k: how many characters of the pattern match so far |
| “Your last two cars are also the start of the pattern” | The fallback k = π[k − 1], the longest border of the part already matched: π[3] = 2 for red, blue, red, blue |
| Never looking back at cars that have gone | The text pointer never moves backwards, so the search is O(n + m) |
| Five fingers up | k = m: a match ends at this character |

**Where the story breaks:** Here one fallback was enough. Sometimes the next car doesn't fit even after falling back, so KMP falls back again (k = π[k − 1]) until it fits or k is 0. One car can cost several fallbacks, but k rises by at most one per car, so all the fallbacks together cost O(n).

## Key ideas (grown-up version)
- **The naive search is O(n · m) in the worst case**: it tries each of the n − m + 1 start positions and compares up to m characters. On text aaaa…a with pattern aa…ab every attempt fails only at the last character. On everyday text most attempts fail after a character or two, which is why it's usually fast.
- **The prefix function**: π[i] is the length of the longest proper prefix of s[0..i] that is also a suffix of it (its longest *border*); for “abacabab”, π = 0 0 1 0 1 2 3 2. To compute π[i], start from k = π[i − 1]; while k > 0 and s[i] ≠ s[k], fall back to k = π[k − 1]; then add 1 if s[i] = s[k]. k rises by at most 1 per step and every fallback lowers it, so there are at most n fallbacks in all: O(n) time, O(n) space.
- **KMP search**: compute π of pattern + “#” + text, with a separator that appears in neither string. The separator stops π from passing m, and each index i with π[i] = m ends a match that starts at i − 2m in the text. O(n + m) time and space; the streaming version keeps only the pattern's π, O(m) extra space.
- **The Z-function**: z[i] is the length of the longest common prefix of s and s[i:] (z[0] is set to 0 here; some books use n). Keep the box [l, r), the rightmost segment found so far that equals a prefix of s. For i inside it, start from min(r − i, z[i − l]) and extend by comparing. Every successful comparison pushes r to the right, so it's O(n) time and space. On pattern + “#” + text, z[i] = m marks a match.
- **What π answers besides search**: the shortest period of s is p = n − π[n − 1], and s is one block repeated two or more times exactly when p < n and p divides n (LC 459). The longest happy prefix is s[:π[n − 1]] (LC 1392). The last π value of s + “#” + reverse(s) is the length of the longest palindromic prefix of s (LC 214).
- **Rolling hash (Rabin–Karp)**: h = (s₀·Bᵐ⁻¹ + s₁·Bᵐ⁻² + … + sₘ₋₁) mod M, for a base B and a prime M. Sliding the window drops the first term and adds a new one in O(1). Different strings can share a hash (a collision), so confirm each hit character by character, or use two independent moduli (double hashing). That's O(n + m), plus O(m) for each hit you confirm. Binary search on the length plus hashing finds the longest repeated substring (LC 1044) in O(n log n) on average.
- **JavaScript precision**: the hash code below keeps every value below M = 1,000,000,007 and only ever multiplies a value by the base (131) or by a character code (below 2¹⁶ from `charCodeAt`). So every intermediate value is below 2¹⁶ × M ≈ 6.6 × 10¹³, far under 2⁵³ ≈ 9.0 × 10¹⁵, and plain Numbers stay exact. Multiplying two hash values (up to about 10¹⁸) would not be exact: that needs BigInt.
- **The built-ins**: Python's `str.find` and JavaScript's `indexOf` are fast in practice and fine for LC 28, but neither language promises O(n + m) in the worst case. When the bound matters, or the interviewer asks for it, write KMP or Z.

## Diagrams
**The prefix function of “abacabab”**

| s | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | a | b | a | c | a | b | a | b |

| π | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 0 | 0 | 1 | 0 | 1 | 2 | **3** | 2 |

_At i = 7, k starts at π[6] = 3, but s[7] = b ≠ s[3] = c, so k falls back to π[2] = 1. Now s[7] = s[1] = b, so π[7] = 2: the border “ab”._

**The Z-function of “abacaba”**

| s | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | a | b | a | c | a | b | a |

| z | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| value | 0 | 0 | 1 | 0 | **3** | 0 | 1 |

_z[4] = 3: s[4:] = “aba” matches the first 3 characters, so the box becomes [4, 7). At i = 6, inside the box, z[6 − 4] = z[2] = 1 is copied; that already reaches the end of the string, so no comparison is needed._

**A rolling hash of the 3-digit windows of 31415 (base 10, M = 13)**

| 314 → 2 | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| value | **3** | **1** | **4** | 1 | 5 |

| 141 → 11 | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| value | 3 | **1** | **4** | **1** | 5 |

| 415 → 12 | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| value | 3 | 1 | **4** | **1** | **5** |

_The first digit of a window weighs 10² mod 13 = 9. Sliding from 314 to 141: ((2 − 3 × 9) × 10 + 1) mod 13 = 11, without re-reading the window. The string 115 also hashes to 11 (115 = 8 × 13 + 11): a collision, which is why every hit is confirmed._

## Comparisons
**Four ways to find a pattern (text length n, pattern length m)**

|  | Naive | KMP (prefix function) | Z-function | Rabin–Karp |
|---|---|---|---|---|
| Worst-case time | O(n · m) | O(n + m) | O(n + m) | O(n · m): each hit costs O(m) to confirm |
| Usual time | fast when mismatches come early | O(n + m) | O(n + m) | O(n + m), plus O(m) per hit |
| Extra space | O(1) | O(m) streaming; O(n + m) on pattern + “#” + text | O(n + m) | O(1) |
| Also gives | nothing more | borders and periods | the prefix-match length at every position | O(1) substring comparisons (with prefix hashes) |

**The same jobs in Python and JavaScript**

| Task | Python | JavaScript |
|---|---|---|
| First match, or −1 | `text.find(p)` | `text.indexOf(p)` |
| Does p start at index i? | `text.startswith(p, i)` | `text.startsWith(p, i)` |
| A character's code | `ord(c)` | `s.charCodeAt(i)`: a UTF-16 unit, below 2¹⁶ |
| Reverse a string | `s[::-1]` | `[...s].reverse().join("")` |
| Hash arithmetic mod 10⁹ + 7 | exact at any size | exact while every intermediate value stays below 2⁵³ |

## Code (JavaScript + Python)
### The prefix function and KMP: every match
```python
def prefix_function(s):
    pi = [0] * len(s)
    for i in range(1, len(s)):
        k = pi[i - 1]                        # the longest border of s[:i]
        while k > 0 and s[i] != s[k]:
            k = pi[k - 1]                    # fall back to the next shorter border
        if s[i] == s[k]:
            k += 1                           # the border grows by one
        pi[i] = k
    return pi

def kmp_search(text, pattern):               # every start index of pattern in text
    m = len(pattern)
    if m == 0:
        return list(range(len(text) + 1))
    pi = prefix_function(pattern + "#" + text)   # "#" must appear in neither string
    return [i - 2 * m for i in range(2 * m, len(pi)) if pi[i] == m]

print(*prefix_function("abacabab"))
print(*kmp_search("abababcab", "abab"))
print(*kmp_search("aaaaa", "aa"))
```

Output:
```text
0 0 1 0 1 2 3 2
0 2
0 1 2 3
```

- line 6: Each π[k − 1] is smaller than k, and k rises by at most 1 per i, so this line runs at most n times in total: O(n) amortised.
- line 15: The empty pattern matches at every index from 0 to len(text), the end included.
- line 16: The separator stops a border from running past the pattern, so no π value is bigger than m.
- line 17: A match ending at index i of the combined string starts at i − m + 1, and the text begins at index m + 1, so its start in the text is i − 2m.

```javascript
function prefixFunction(s) {
  const pi = new Array(s.length).fill(0);
  for (let i = 1; i < s.length; i++) {
    let k = pi[i - 1];                       // the longest border of s.slice(0, i)
    while (k > 0 && s[i] !== s[k]) k = pi[k - 1];   // fall back to the next shorter border
    if (s[i] === s[k]) k++;                  // the border grows by one
    pi[i] = k;
  }
  return pi;
}

function kmpSearch(text, pattern) {          // every start index of pattern in text
  const m = pattern.length;
  if (m === 0) return Array.from({ length: text.length + 1 }, (_, i) => i);
  const pi = prefixFunction(pattern + "#" + text);   // "#" must appear in neither string
  const starts = [];
  for (let i = 2 * m; i < pi.length; i++) if (pi[i] === m) starts.push(i - 2 * m);
  return starts;
}

console.log(...prefixFunction("abacabab"));
console.log(...kmpSearch("abababcab", "abab"));
console.log(...kmpSearch("aaaaa", "aa"));
```

Output:
```text
0 0 1 0 1 2 3 2
0 2
0 1 2 3
```

- line 5: Each π[k − 1] is smaller than k, and k rises by at most 1 per i, so the fallbacks total at most n: O(n) amortised.
- line 15: The separator stops a border from running past the pattern, so no π value is bigger than m.
- line 17: A match ending at index i of the combined string starts at i − m + 1, and the text begins at index m + 1, so its start in the text is i − 2m.

### The Z-function, and matching with it
```python
def z_function(s):
    n = len(s)
    z = [0] * n                              # z[0] stays 0 by convention
    l = r = 0                                # the box [l, r): s[l:r] == s[:r - l]
    for i in range(1, n):
        if i < r:
            z[i] = min(r - i, z[i - l])      # copy what the box already knows
        while i + z[i] < n and s[z[i]] == s[i + z[i]]:
            z[i] += 1                        # then extend by comparing
        if i + z[i] > r:
            l, r = i, i + z[i]               # the new rightmost box
    return z

def z_search(text, pattern):                 # every start index of pattern in text
    m = len(pattern)
    if m == 0:
        return list(range(len(text) + 1))
    z = z_function(pattern + "#" + text)     # "#" must appear in neither string
    return [i - m - 1 for i in range(m + 1, len(z)) if z[i] == m]

print(*z_function("abacaba"))
print(*z_function("aaaaa"))
print(*z_search("abababcab", "abab"))
```

Output:
```text
0 0 1 0 3 0 1
0 4 3 2 1
0 2
```

- line 7: s[i:r] is a copy of s[i − l:r − l], whose z value is already known. It can only be trusted up to r, the end of what the box has checked.
- line 9: A comparison that succeeds always looks past the old r, and r only moves right, so there are at most n of them in all: O(n) time.
- line 19: The text starts at index m + 1 of the combined string, so z[i] = m means a match at i − m − 1.

```javascript
function zFunction(s) {
  const n = s.length;
  const z = new Array(n).fill(0);            // z[0] stays 0 by convention
  let l = 0, r = 0;                          // the box [l, r): s.slice(l, r) === s.slice(0, r - l)
  for (let i = 1; i < n; i++) {
    if (i < r) z[i] = Math.min(r - i, z[i - l]);   // copy what the box already knows
    while (i + z[i] < n && s[z[i]] === s[i + z[i]]) z[i]++;   // then extend by comparing
    if (i + z[i] > r) { l = i; r = i + z[i]; }     // the new rightmost box
  }
  return z;
}

function zSearch(text, pattern) {            // every start index of pattern in text
  const m = pattern.length;
  if (m === 0) return Array.from({ length: text.length + 1 }, (_, i) => i);
  const z = zFunction(pattern + "#" + text);  // "#" must appear in neither string
  const starts = [];
  for (let i = m + 1; i < z.length; i++) if (z[i] === m) starts.push(i - m - 1);
  return starts;
}

console.log(...zFunction("abacaba"));
console.log(...zFunction("aaaaa"));
console.log(...zSearch("abababcab", "abab"));
```

Output:
```text
0 0 1 0 3 0 1
0 4 3 2 1
0 2
```

- line 6: s.slice(i, r) is a copy of s.slice(i − l, r − l), whose z value is already known. It can only be trusted up to r, the end of what the box has checked.
- line 7: A comparison that succeeds always looks past the old r, and r only moves right, so there are at most n of them in all: O(n) time.
- line 18: The text starts at index m + 1 of the combined string, so z[i] = m means a match at i − m − 1.

### Rabin–Karp with one modulus, confirming every hit
```python
def rabin_karp(text, pattern, base=131, mod=1_000_000_007):
    n, m = len(text), len(pattern)
    if m == 0:
        return list(range(n + 1))
    if m > n:
        return []
    power = pow(base, m - 1, mod)            # the weight of the window's first character
    hp = ht = 0
    for i in range(m):                       # hash the pattern and the first window
        hp = (hp * base + ord(pattern[i])) % mod
        ht = (ht * base + ord(text[i])) % mod
    found = []
    for i in range(n - m + 1):
        if hp == ht and text.startswith(pattern, i):   # equal hashes: confirm
            found.append(i)
        if i + m < n:                        # slide: drop text[i], add text[i + m]
            ht = ((ht - ord(text[i]) * power) * base + ord(text[i + m])) % mod
    return found

print(*rabin_karp("abracadabra", "abra"))
print(*rabin_karp("abracadabra", "abra", mod=3))   # many collisions, same answer
print(*rabin_karp("aaaaaa", "aaa"))
```

Output:
```text
0 7
0 7
0 1 2 3
```

- line 7: `pow` with three arguments is fast modular power: O(log m) multiplications.
- line 14: Different strings can share a hash, so compare the characters before reporting a match. That costs O(m) per hit.
- line 17: Python's `%` always gives 0 to mod − 1, even when the left side is negative, and its ints never overflow.
- line 21: With mod = 3 there are only three possible hash values, so false hits are common. The check keeps the answer right; only the speed suffers.

```javascript
function rabinKarp(text, pattern, base = 131, mod = 1_000_000_007) {
  const n = text.length, m = pattern.length;
  if (m === 0) return Array.from({ length: n + 1 }, (_, i) => i);
  if (m > n) return [];
  let power = 1;                             // the weight of the window's first character
  for (let i = 1; i < m; i++) power = (power * base) % mod;
  let hp = 0, ht = 0;
  for (let i = 0; i < m; i++) {              // hash the pattern and the first window
    hp = (hp * base + pattern.charCodeAt(i)) % mod;
    ht = (ht * base + text.charCodeAt(i)) % mod;
  }
  const found = [];
  for (let i = 0; i + m <= n; i++) {
    if (hp === ht && text.startsWith(pattern, i)) found.push(i);   // equal hashes: confirm
    if (i + m < n) {                         // slide: drop text[i], add text[i + m]
      ht = (ht - ((text.charCodeAt(i) * power) % mod) + mod) % mod;
      ht = (ht * base + text.charCodeAt(i + m)) % mod;
    }
  }
  return found;
}

console.log(...rabinKarp("abracadabra", "abra"));
console.log(...rabinKarp("abracadabra", "abra", 131, 3));   // many collisions, same answer
console.log(...rabinKarp("aaaaaa", "aaa"));
```

Output:
```text
0 7
0 7
0 1 2 3
```

- line 14: Different strings can share a hash, so compare the characters before reporting a match. That costs O(m) per hit.
- line 16: A code unit is below 2¹⁶ and power is below mod, so the product is under 2¹⁶ × mod ≈ 6.6 × 10¹³: exact. `+ mod` keeps the result non-negative, because JavaScript's `%` keeps the sign of the left side.
- line 17: ht × base (131 here) + a code unit is below 1.4 × 10¹¹, far under 2⁵³, so this is exact too.
- line 24: With mod = 3 there are only three possible hash values, so false hits are common. The check keeps the answer right; only the speed suffers.

## Worked example
**Problem.** Given a string s, add as few characters as possible in front of it to make it a palindrome, and return that palindrome (LeetCode 214, Shortest Palindrome). s can have 5 × 10⁴ characters.

1. Whatever goes in front must mirror the end of s. If the longest prefix of s that is a palindrome has length L, the answer is reverse(s[L:]) + s, and nothing shorter works.
2. A palindromic prefix reads the same backwards, so it's a prefix of s that is also a suffix of reverse(s).
3. So build u = s + “#” + reverse(s). The last π value of u is the length of the longest prefix of u that is also its suffix. The “#” stops it from crossing the middle, so it's exactly L.
4. Return reverse(s[L:]) + s: O(n) time and O(n) space, where testing every prefix for being a palindrome would be O(n²).

```python
def prefix_function(s):
    pi = [0] * len(s)
    for i in range(1, len(s)):
        k = pi[i - 1]
        while k > 0 and s[i] != s[k]:
            k = pi[k - 1]
        if s[i] == s[k]:
            k += 1
        pi[i] = k
    return pi

def shortest_palindrome(s):
    longest = prefix_function(s + "#" + s[::-1])[-1]   # the longest palindromic prefix
    return s[longest:][::-1] + s                        # mirror the rest in front

print(shortest_palindrome("aacecaaa"))
print(shortest_palindrome("abcd"))
print(shortest_palindrome("abab"))
```

Output:
```text
aaacecaaa
dcbabcd
babab
```

```javascript
function prefixFunction(s) {
  const pi = new Array(s.length).fill(0);
  for (let i = 1; i < s.length; i++) {
    let k = pi[i - 1];
    while (k > 0 && s[i] !== s[k]) k = pi[k - 1];
    if (s[i] === s[k]) k++;
    pi[i] = k;
  }
  return pi;
}

const reverse = s => [...s].reverse().join("");

function shortestPalindrome(s) {
  const longest = prefixFunction(s + "#" + reverse(s)).at(-1);   // the longest palindromic prefix
  return reverse(s.slice(longest)) + s;                          // mirror the rest in front
}

console.log(shortestPalindrome("aacecaaa"));
console.log(shortestPalindrome("abcd"));
console.log(shortestPalindrome("abab"));
```

Output:
```text
aaacecaaa
dcbabcd
babab
```

**Answer.** aaacecaaa, dcbabcd and babab. For “aacecaaa”, the last π value of “aacecaaa#aaacecaa” is 7: the palindrome “aacecaa”, so only the final “a” is mirrored in front. For “abcd” the longest palindromic prefix is just “a”, so “dcb” goes in front; for “abab” it's “aba”, so one “b” does.

## Your turn (faded example)
**Problem.** Can s be built by repeating one of its substrings two or more times (LeetCode 459, Repeated Substring Pattern)? Answer it with the prefix function.

- ✓ π[n − 1] is the longest border of s: the longest proper prefix that is also a suffix.
- **Why is p = n − π[n − 1] a period of s, that is, s[i] = s[i + p] for every valid i?**
  <details><summary>Answer</summary>The prefix and the suffix of length π[n − 1] are equal, and the suffix starts p places later, so s[i] = s[i + p] for every i < n − p. The longest border gives the smallest such p.</details>
- **Is s always a repetition when p < n? Try “abaab”.**
  <details><summary>Answer</summary>No. “abaab” has π[4] = 2, so p = 3, but 3 doesn't divide 5. s is a repetition exactly when p < n and n % p == 0, and then it's n / p copies of s[:p].</details>
- **Time and space?**
  <details><summary>Answer</summary>O(n) time for the prefix function and O(n) space for π.</details>

Starter:
```python
def repeated_substring_pattern(s):       # prefix_function is the one from code block 1
    n = len(s)
    period = ...                         # TODO: the shortest period, from the last π value
    return ...                           # TODO: is s two or more whole copies of s[:period]?
```

```javascript
function repeatedSubstringPattern(s) {   // prefixFunction is the one from code block 1
  const n = s.length;
  // TODO: the shortest period, from the last pi value
  // TODO: return whether s is two or more whole copies of s.slice(0, period)
}
```

<details><summary>Full solution</summary>

```python
def prefix_function(s):
    pi = [0] * len(s)
    for i in range(1, len(s)):
        k = pi[i - 1]
        while k > 0 and s[i] != s[k]:
            k = pi[k - 1]
        if s[i] == s[k]:
            k += 1
        pi[i] = k
    return pi

def repeated_substring_pattern(s):
    n = len(s)
    period = n - prefix_function(s)[-1]      # the shortest period of s
    return period < n and n % period == 0    # at least two whole copies

for s in ["abab", "aba", "abcabcabcabc", "abaab", "a", "zzz"]:
    print(s, "yes" if repeated_substring_pattern(s) else "no")
```

Output:
```text
abab yes
aba no
abcabcabcabc yes
abaab no
a no
zzz yes
```

```javascript
function prefixFunction(s) {
  const pi = new Array(s.length).fill(0);
  for (let i = 1; i < s.length; i++) {
    let k = pi[i - 1];
    while (k > 0 && s[i] !== s[k]) k = pi[k - 1];
    if (s[i] === s[k]) k++;
    pi[i] = k;
  }
  return pi;
}

function repeatedSubstringPattern(s) {
  const n = s.length;
  const period = n - prefixFunction(s).at(-1);   // the shortest period of s
  return period < n && n % period === 0;         // at least two whole copies
}

for (const s of ["abab", "aba", "abcabcabcabc", "abaab", "a", "zzz"])
  console.log(s, repeatedSubstringPattern(s) ? "yes" : "no");
```

Output:
```text
abab yes
aba no
abcabcabcabc yes
abaab no
a no
zzz yes
```

</details>

## Socratic checks and quiz (answers hidden)
**1. What does this print?**

```python
s = "aabaaab"
pi = [0] * len(s)
for i in range(1, len(s)):
    k = pi[i - 1]
    while k > 0 and s[i] != s[k]:
        k = pi[k - 1]
    if s[i] == s[k]:
        k += 1
    pi[i] = k
print(*pi)
```

```javascript
const s = "aabaaab";
const pi = new Array(s.length).fill(0);
for (let i = 1; i < s.length; i++) {
  let k = pi[i - 1];
  while (k > 0 && s[i] !== s[k]) k = pi[k - 1];
  if (s[i] === s[k]) k++;
  pi[i] = k;
}
console.log(...pi);
```

- A. 0 1 0 1 2 2 3
- B. 0 1 0 1 2 3 3
- C. 0 1 0 1 2 1 0
- D. 0 0 0 1 2 2 3

<details><summary>Answer</summary>

0 1 0 1 2 2 3. π[1] is 1 because “aa” has the border “a”. At i = 5, k = π[4] = 2, but s[5] = a ≠ s[2] = b, so k falls back to π[1] = 1, and s[5] = s[1] gives π[5] = 2 (the border “aa”). At i = 6, s[6] = b = s[2] extends it to 3 (“aab”).

</details>

**2. What does this print?**

```python
s = "aaabaab"
n = len(s)
z = [0] * n
l = r = 0
for i in range(1, n):
    if i < r:
        z[i] = min(r - i, z[i - l])
    while i + z[i] < n and s[z[i]] == s[i + z[i]]:
        z[i] += 1
    if i + z[i] > r:
        l, r = i, i + z[i]
print(*z)
```

```javascript
const s = "aaabaab", n = s.length;
const z = new Array(n).fill(0);
let l = 0, r = 0;
for (let i = 1; i < n; i++) {
  if (i < r) z[i] = Math.min(r - i, z[i - l]);
  while (i + z[i] < n && s[z[i]] === s[i + z[i]]) z[i]++;
  if (i + z[i] > r) { l = i; r = i + z[i]; }
}
console.log(...z);
```

- A. 0 2 1 0 2 1 0
- B. 7 2 1 0 2 1 0
- C. 0 2 1 0 3 2 1
- D. 0 1 2 0 1 2 0

<details><summary>Answer</summary>

0 2 1 0 2 1 0. z[1] = 2: s[1:] = “aabaab” shares “aa” with s, then b ≠ a. z[4] = 2: “aab” shares “aa”. This code leaves z[0] at 0 (some books set it to n), and “0 1 2 0 1 2 0” is the prefix function of the same string, not its Z-function.

</details>

**3. What is the worst-case time of the naive search (try every start, compare left to right) for a pattern of length m in a text of length n, and which input shows it?**

- A. O(n · m), on text aaaa…a with pattern aa…ab
- B. O(n + m), because every attempt stops at the first mismatch
- C. O(n log m), on text aaaa…a with pattern aa…ab
- D. O(n · m), but only when the pattern is longer than the text

<details><summary>Answer</summary>

O(n · m), on text aaaa…a with pattern aa…ab. Each attempt matches m − 1 a's before the b fails, so it does about (n − m + 1) · m comparisons. Mismatches do stop attempts early on everyday text, but not on this input. A pattern longer than the text has no start positions at all. KMP and Z guarantee O(n + m).

</details>

**4. Which statements about Rabin–Karp rolling hashes are true? (choose 2)**

- A. Sliding the window by one character costs O(1)
- B. Two different strings can have the same hash, so a hit must be confirmed or made very unlikely with two moduli
- C. Two equal strings can have different hashes when the modulus is small
- D. With mod 1,000,000,007 and base 131, JavaScript needs BigInt for `h * base`
- E. Rabin–Karp is O(n + m) in the worst case, even when every window matches

<details><summary>Answer</summary>

Sliding the window by one character costs O(1), Two different strings can have the same hash, so a hit must be confirmed or made very unlikely with two moduli. Equal strings always hash alike. h × 131 stays below about 1.3 × 10¹¹, far under 2⁵³, so plain Numbers are exact. If every window matches (text aaaa…, pattern aaa), each hit costs O(m) to confirm, so the worst case is O(n · m).

</details>

**5. Judge each statement.**

- z[i] is the length of the longest common prefix of s and s[i:].
- n − π[n − 1] is the shortest period of s.
- If the shortest period p of s is less than n, then s is a repetition of s[:p].
- Python's `str.find` is guaranteed to run in O(n + m) time.

<details><summary>Answer</summary>

z[i] is the length of the longest common prefix of s and s[i:].: Yes; n − π[n − 1] is the shortest period of s.: Yes; If the shortest period p of s is less than n, then s is a repetition of s[:p].: No; Python's `str.find` is guaranteed to run in O(n + m) time.: No. The first two are the definitions to rely on. “abaab” has period 3 but isn't a repetition, because 3 doesn't divide 5. Neither Python nor JavaScript promises a worst-case bound for its built-in search.

</details>

**6. Put the steps for computing π[i] in order.**

- (put the steps in order)

<details><summary>Answer</summary>

Set k = π[i − 1], the longest border of the previous prefix → While k > 0 and s[i] ≠ s[k], fall back: k = π[k − 1] → If s[i] = s[k], extend the border: k = k + 1 → Store π[i] = k. You need the previous border before you can test it; you can only extend once the fallbacks have found a border whose next character matches (or reached 0); and π[i] is whatever k is at the end.

</details>

**7. Complete the JavaScript Z-function.**

```
function zFunction(s) {
  const n = s.length, z = new Array(n).fill(0);
  let l = 0, r = 0;
  for (let i = 1; i < n; i++) {
    if (i < r) z[i] = Math.min(r - i, z[{{0}}]);
    while (i + z[i] < n && s[z[i]] === s[{{1}}]) z[i]++;
    if (i + z[i] > r) { l = i; r = {{2}}; }
  }
  return z;
}

```

<details><summary>Answer</summary>

i - l | i + z[i] | i + z[i]. Inside the box, s[i..r) copies s[i − l..r − l), so z[i − l] is known. The extension compares the next unmatched pair, s[z[i]] with s[i + z[i]]. The new box ends where this match ends, at i + z[i]; ending it any later would let a later copy claim characters nobody has checked.

</details>

**8. Match each task to its tool.**


<details><summary>Answer</summary>

Every occurrence of one pattern, O(n + m) in the worst case = π of pattern + “#” + text; The shortest period of s = n − π[n − 1]; The longest palindromic prefix of s = The last π value of s + “#” + reverse(s); The longest substring that appears at least twice = Binary search on the length, with rolling hashes. KMP gives guaranteed linear search; the period and the palindromic prefix come from π too; LC 1044 needs many substring comparisons, which hashing makes O(1) each.

</details>

## Traps & misconceptions
- **“KMP restarts at the next start position after a mismatch, just more cleverly.”** That's the naive search. KMP never moves backwards in the text: it keeps k, the length still matched, and falls back through π. That's why it stays O(n + m) even on aaaa…ab.
- **“The `while` loop inside the prefix function makes it O(n²).”** Each fallback lowers k, and k rises by at most 1 per character, so all the fallbacks together number at most n: O(n) amortised, like a stack where each item is popped at most once.
- **“Any separator works in pattern + “#” + text.”** It must appear in neither string. With pattern “a” and text “a#a”, the combined string “a#a#a” has π = 0 0 1 2 3, so the second match is missed: π at its end is 3, not 1. Pick a character outside the alphabet, or use the streaming KMP, which needs no separator.
- **“Equal rolling hashes mean equal strings.”** Different strings can share a hash: with base 10 and M = 13, “141” and “115” both hash to 11. Confirm every hit character by character, or use two independent moduli so that a false match becomes very unlikely (but not impossible).
- **“In JavaScript, `(h * base + c) % mod` is fine for any modulus.”** Only while every intermediate value stays below 2⁵³. With mod ≈ 10⁹ and base 131 the largest is about 1.3 × 10¹¹, which is fine. Multiplying two hash values, or porting C++ code that hashes modulo a number near 2⁶¹, produces values above 2⁵³ that are silently rounded. Use BigInt for those.
- **“`str.find` and `indexOf` are guaranteed O(n + m).”** Neither Python nor JavaScript promises a worst-case bound for its built-in search. Both are fast in practice and fine for LC 28, but when the bound matters, or the interviewer asks for it, write KMP or Z.

## Discussion prompts
- **KMP, Z or a rolling hash: how do you choose?**
  <details><summary>One good answer</summary>For one pattern, KMP and Z are deterministic O(n + m), and π also answers border and period questions; many people find Z easier to reason about for “how much of the prefix matches here?”. Rolling hashes shine when you compare many substrings: after O(n) prefix hashes, any two substrings compare in O(1), which is what binary search on the answer needs (LC 1044), or a set of windows (LC 187). The price is a small chance of a false match, so confirm hits or use double hashing. On contest sites that allow hacks, a fixed base and modulus can be broken by a crafted input, so pick the base at random when the program starts.</details>
- **Should you hand-write KMP when `find` and `indexOf` exist?**
  <details><summary>One good answer</summary>In product code, usually not: the built-ins are fast and well tested. Hand-write it when you need what they don't give: every match in a stream you read only once, a guaranteed bound on hostile input, or the prefix function itself for periods, borders and palindromic prefixes. In an interview, say you'd use the built-in and ask whether they want the algorithm.</details>

## Teach-back
**Prompt:** Explain to a junior colleague how the prefix function makes KMP search linear, and one other question π can answer.

Rubric:
- [ ] π[i] is the length of the longest proper prefix of s[0..i] that is also a suffix
- [ ] On a mismatch, fall back with k = π[k − 1] instead of restarting; the text pointer never moves back
- [ ] k rises by at most 1 per character, so all the fallbacks total at most n: O(n)
- [ ] Search: π of pattern + “#” + text, where π = m ends a match: O(n + m)
- [ ] Another use: the shortest period n − π[n − 1], or the longest palindromic prefix

<details><summary>Model answer</summary>

The prefix function π[i] is the length of the longest proper prefix of s[0..i] that is also a suffix of it. KMP uses it to avoid re-reading the text. Suppose k characters of the pattern match and the next one doesn't. The naive search would restart one place later, but KMP already knows the last k characters, so it falls back to k = π[k − 1], the longest border of the matched part, and compares again, until a character matches or k is 0. k rises by at most one per character and every fallback lowers it, so there are at most n fallbacks in total and the whole search is O(n + m). The simplest way to code it is to compute π of pattern + “#” + text: every position where π equals m ends a match. The same table answers other questions: n − π[n − 1] is the shortest period, so s is a repeated block exactly when that period is smaller than n and divides it.

</details>

## Quick Q&A (also in the SRS deck)
- **What is π[i], the prefix function?** The length of the longest proper prefix of s[0..i] that is also a suffix of s[0..i].
- **What does KMP do on a mismatch?** Falls back to k = π[k − 1] and compares again; it never moves backwards in the text.
- **What is z[i], the Z-function?** The length of the longest common prefix of s and s[i:].
- **The shortest period of s, from π?** p = n − π[n − 1]. s is a repeated block exactly when p < n and p divides n.
- **The rolling-hash update when the window slides one step?** h′ = ((h − out · Bᵐ⁻¹) · B + in) mod M.
- **Why are a modulus near 10⁹ and a small base safe in JavaScript?** Every intermediate value, such as h · B + c, stays far below 2⁵³, so it is an exact integer.

## Practice problems
- [ ] [LC 28 · Find the Index of the First Occurrence in a String](https://leetcode.com/problems/find-the-index-of-the-first-occurrence-in-a-string/) · Easy · KMP from memory: the first i with π[i] = m in needle + “#” + haystack gives i − 2m
- [ ] [LC 796 · Rotate String](https://leetcode.com/problems/rotate-string/) · Easy · goal is a rotation of s exactly when the lengths match and goal occurs in s + s
- [ ] [LC 459 · Repeated Substring Pattern](https://leetcode.com/problems/repeated-substring-pattern/) · Easy · the faded example: the period n − π[n − 1] must be < n and divide n
- [ ] [LC 686 · Repeated String Match](https://leetcode.com/problems/repeated-string-match/) · Medium · repeat a until it's at least as long as b, then allow one more copy; search with KMP or Z
- [ ] [LC 187 · Repeated DNA Sequences](https://leetcode.com/problems/repeated-dna-sequences/) · Medium · slide a 10-letter window and keep a set of hashes (or 2 bits per letter); report those seen twice
- [ ] [LC 1392 · Longest Happy Prefix](https://leetcode.com/problems/longest-happy-prefix/) · Hard · the longest happy prefix is s[:π[n − 1]]
- [ ] [LC 214 · Shortest Palindrome](https://leetcode.com/problems/shortest-palindrome/) · Hard · the worked example: the last π value of s + “#” + reverse(s)
- [ ] [LC 1044 · Longest Duplicate Substring](https://leetcode.com/problems/longest-duplicate-substring/) · Hard · binary search the length; hash every window of that length and look for a repeat, confirming it or using two moduli

## Sources (accessed 2026-10-09)
- [cp-algorithms: Prefix function, Knuth–Morris–Pratt algorithm](https://cp-algorithms.com/string/prefix-function.html)
- [cp-algorithms: Z-function and its calculation](https://cp-algorithms.com/string/z-function.html)
- [cp-algorithms: String hashing](https://cp-algorithms.com/string/string-hashing.html)
- [Wikipedia: Knuth–Morris–Pratt algorithm](https://en.wikipedia.org/wiki/Knuth%E2%80%93Morris%E2%80%93Pratt_algorithm)
