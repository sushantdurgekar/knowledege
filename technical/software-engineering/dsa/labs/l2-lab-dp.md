---
title: "Dynamic programming three ways"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Lab: Dynamic programming three ways

> Data Structures & Algorithms L2 · about 90 min · modules m09, m10

Solve coin change (fewest coins) top-down with memoisation and bottom-up with a table, then rebuild the coins actually used. Compute the longest common subsequence and rebuild one LCS string. Check everything against brute force.

## Before you start
- Modules 09 and 10

## Steps
1. Top-down: `best(a)` = the fewest coins that make amount a, cached with `functools.cache` / a Map. Return −1 when no combination works.
2. Bottom-up: fill `dp[a] = min(dp[a − c] + 1)` from 0 up to the amount, and record in `choice[a]` the coin that achieved it.
3. Rebuild the coins by following `choice` back from the amount to 0.
4. LCS: fill `dp[i][j]` for the first i characters of s and the first j of t, then walk back from the bottom-right corner to rebuild one LCS.
5. Compare every function with brute force on 300 small random inputs.

## Prove it worked
- Memo, table and brute force agree on 300 random cases, and the rebuilt coins add up to the amount.
- Your LCS string is a subsequence of both inputs and has the right length.

## Break it (then fix it)
- Call the memoised Python version with coins [1] and amount 5,000. Read the RecursionError, then explain why the table version is fine.
- Change the table to count the *ways* to make each amount (LeetCode 518: add instead of taking the minimum). With amounts in the outer loop you count orderings (1 + 3 and 3 + 1 separately); swap the loops so you count combinations.

## Reference solution
<details><summary>Open after you've tried</summary>

```python
import random
from functools import cache
from itertools import combinations

def coin_change_memo(coins, amount):       # top-down; recursion depth up to `amount`
    @cache
    def best(a):
        if a == 0:
            return 0
        return min((best(a - c) + 1 for c in coins if c <= a), default=float("inf"))
    result = best(amount)
    return -1 if result == float("inf") else result

def coin_change_table(coins, amount):      # bottom-up, plus the coins themselves
    INF = float("inf")
    dp = [0] + [INF] * amount
    choice = [0] * (amount + 1)             # the last coin used for each amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a], choice[a] = dp[a - c] + 1, c
    if dp[amount] == INF:
        return -1, []
    picked, a = [], amount
    while a:
        picked.append(choice[a])
        a -= choice[a]
    return dp[amount], sorted(picked)

def lcs(s, t):                              # O(m·n) time and space
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if s[i - 1] == t[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    out, i, j = [], m, n                    # walk back to rebuild one LCS
    while i and j:
        if s[i - 1] == t[j - 1]:
            out.append(s[i - 1])
            i, j = i - 1, j - 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    return dp[m][n], "".join(reversed(out))

def brute_coins(coins, amount, start=0):   # every multiset of coins: small inputs only
    if amount == 0:
        return 0
    best = float("inf")
    for i in range(start, len(coins)):
        if coins[i] <= amount:
            best = min(best, 1 + brute_coins(coins, amount - coins[i], i))
    return best

def is_subseq(a, b):
    it = iter(b)
    return all(ch in it for ch in a)

def brute_lcs_len(s, t):
    for r in range(len(s), -1, -1):
        if any(is_subseq("".join(c), t) for c in combinations(s, r)):
            return r

for _ in range(300):
    coins = random.sample(range(1, 9), random.randint(1, 3))
    amount = random.randint(0, 25)
    want = brute_coins(coins, amount)
    want = -1 if want == float("inf") else want
    count, picked = coin_change_table(coins, amount)
    assert coin_change_memo(coins, amount) == want == count, (coins, amount)
    if count == -1:
        assert picked == []
    else:
        assert sum(picked) == amount and len(picked) == count and set(picked) <= set(coins)
    s = "".join(random.choice("abc") for _ in range(random.randint(0, 7)))
    t = "".join(random.choice("abc") for _ in range(random.randint(0, 7)))
    length, seq = lcs(s, t)
    assert length == brute_lcs_len(s, t) == len(seq) and is_subseq(seq, s) and is_subseq(seq, t)

count, picked = coin_change_table([1, 3, 4], 6)
length, seq = lcs("abcbdab", "bdcaba")
print(coin_change_memo([1, 3, 4], 6), count, "+".join(map(str, picked)), coin_change_table([2], 3)[0], length, seq)
```

Output:
```text
2 2 3+3 -1 4 bcba
```

```javascript
const assert = require("node:assert");

function coinChangeMemo(coins, amount) {    // top-down; recursion depth up to `amount`
  const memo = new Map();
  const best = a => {
    if (a === 0) return 0;
    if (memo.has(a)) return memo.get(a);
    let result = Infinity;
    for (const c of coins) if (c <= a) result = Math.min(result, best(a - c) + 1);
    memo.set(a, result);
    return result;
  };
  const result = best(amount);
  return result === Infinity ? -1 : result;
}

function coinChangeTable(coins, amount) {   // bottom-up, plus the coins themselves
  const dp = [0, ...new Array(amount).fill(Infinity)];
  const choice = new Array(amount + 1).fill(0);   // the last coin used for each amount
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) {
      if (c <= a && dp[a - c] + 1 < dp[a]) {
        dp[a] = dp[a - c] + 1;
        choice[a] = c;
      }
    }
  }
  if (dp[amount] === Infinity) return [-1, []];
  const picked = [];
  for (let a = amount; a > 0; a -= choice[a]) picked.push(choice[a]);
  return [dp[amount], picked.sort((x, y) => x - y)];
}

function lcs(s, t) {                        // O(m·n) time and space
  const m = s.length, n = t.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s[i - 1] === t[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out = [];                           // walk back to rebuild one LCS
  let i = m, j = n;
  while (i && j) {
    if (s[i - 1] === t[j - 1]) {
      out.push(s[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return [dp[m][n], out.reverse().join("")];
}

function bruteCoins(coins, amount, start = 0) {   // every multiset of coins: small inputs only
  if (amount === 0) return 0;
  let best = Infinity;
  for (let i = start; i < coins.length; i++) {
    if (coins[i] <= amount) best = Math.min(best, 1 + bruteCoins(coins, amount - coins[i], i));
  }
  return best;
}

function isSubseq(a, b) {
  let k = 0;
  for (const ch of b) if (k < a.length && ch === a[k]) k++;
  return k === a.length;
}

function bruteLcsLen(s, t) {
  let best = 0;
  for (let mask = 0; mask < 1 << s.length; mask++) {
    let sub = "";
    for (let i = 0; i < s.length; i++) if ((mask >> i) & 1) sub += s[i];
    if (sub.length > best && isSubseq(sub, t)) best = sub.length;
  }
  return best;
}

const rnd = k => Math.floor(Math.random() * k);
const randWord = () => Array.from({ length: rnd(8) }, () => "abc"[rnd(3)]).join("");
for (let trial = 0; trial < 300; trial++) {
  const coins = [1, 2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5).slice(0, 1 + rnd(3));
  const amount = rnd(26);
  let want = bruteCoins(coins, amount);
  if (want === Infinity) want = -1;
  const [count, picked] = coinChangeTable(coins, amount);
  assert.ok(coinChangeMemo(coins, amount) === want && count === want, `${coins} ${amount}`);
  if (count === -1) assert.deepStrictEqual(picked, []);
  else assert.ok(picked.reduce((x, y) => x + y, 0) === amount && picked.length === count && picked.every(c => coins.includes(c)));
  const s = randWord(), t = randWord();
  const [length, seq] = lcs(s, t);
  assert.ok(length === bruteLcsLen(s, t) && seq.length === length && isSubseq(seq, s) && isSubseq(seq, t));
}

const [count, picked] = coinChangeTable([1, 3, 4], 6);
const [length, seq] = lcs("abcbdab", "bdcaba");
console.log(coinChangeMemo([1, 3, 4], 6), count, picked.join("+"), coinChangeTable([2], 3)[0], length, seq);
```

Output:
```text
2 2 3+3 -1 4 bcba
```

</details>
