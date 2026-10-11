---
title: "Counting and games: digit DP and game theory"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, dsa-l3-m12]
status: new
created: 2026-10-09
updated: 2026-10-09
sources:
  - url: https://cp-algorithms.com/game_theory/sprague-grundy-nim.html
    accessed: 2026-10-09
  - url: https://cp-algorithms.com/game_theory/games_on_graphs.html
    accessed: 2026-10-09
  - url: https://usaco.guide/gold/digit-dp
    accessed: 2026-10-09
  - url: https://en.wikipedia.org/wiki/Nim
    accessed: 2026-10-09
---
# Counting and games: digit DP and game theory

> Data Structures & Algorithms · L3 Specialist · Strings, number theory & games · about 110 min · hub module `m12` ([open the hub](https://claude.ai/artifact/JfuakQWBwAvSgLi1rcuJUk))

## Why it matters
Two kinds of hard problem look as if they need brute force over astronomically many cases: two-player puzzles (“who wins with perfect play?”) and counting questions (“how many numbers up to 10¹⁸ have this property?”). Both shrink to small dynamic programs once you find the right state: win/lose positions and score differences for games, and (position, tight, …) for digit DP.

## Pre-question (answer before reading)
**Q:** Two players take turns removing 1, 2 or 3 coins from a pile of 10, and whoever takes the last coin wins. Should you go first, and what's your first move?

<details><summary>Answer</summary>

Yes: take 2, leaving 8. A multiple of 4 is a losing pile for the player who must move. Whatever they take (1, 2 or 3), you take enough to make 4 in that round, so you keep handing back multiples of 4 until you take the last coin.

</details>

## 🍎 Story time (kid version)
**The toy room and the treasure-map road trip: The last-sweet game**

On the long drive, Tara and Ben play with a pile of sweets: each turn you eat 1, 2 or 3, and whoever eats the last one wins. Ben keeps losing, so Tara shows him her chart. With 0 sweets left on your turn, you've already lost. A pile is a winner for you if one of your moves leaves your rival a loser; it's a loser if every move hands them a winner. She fills the chart from 1 sweet upwards: win, win, win, lose, win, win, win, lose… “See? Never hand me a pile I can win from,” she grins.

| In the story | In code |
|---|---|
| 0 sweets on your turn: you've already lost | The base case: under normal play, a position with no moves is losing |
| A winner if one move leaves your rival a loser | win[n] is true if some move m gives a losing win[n − m] |
| A loser if every move hands them a winner | A losing position: every move leads to a winning one |
| Filling the chart from 1 sweet upwards | Bottom-up DP over positions, smallest first (or memoised recursion) |
| Win, win, win, lose, over and over | The losing piles are exactly the multiples of 4 |

**Where the story breaks:** Tara's chart works because the pile only shrinks and both players have the same moves. If positions can repeat (moves that undo each other), there may be no “smaller first” order and games can be drawn, so you need retrograde analysis on a graph of positions instead. If the two players have different moves, every position needs two answers, one for each player to move.

## Key ideas (grown-up version)
- **Win/lose positions**: under normal play (whoever can't move loses), a position is losing if every move leads to a winning position, and winning if at least one move leads to a losing one. Compute them bottom-up when positions only shrink, or with memoised recursion: O(states × moves).
- **Score-difference minimax**: when players collect points (LeetCode 486, 877), let dp[i][j] be the best (my total − rival's total) the player to move can force on piles i..j. Taking pile i is worth nums[i] − dp[i + 1][j]; taking pile j is worth nums[j] − dp[i][j − 1]. It's an interval DP: O(n²) time, and O(n) space with one reused row.
- **Nim**: with several piles, where a move removes any number of stones from one pile, the player to move wins exactly when the XOR of the pile sizes isn't 0 (Bouton's theorem). A winning move makes the XOR 0 again.
- **Sprague–Grundy**: every position of an impartial game (both players have the same moves) has a Grundy number: the mex, the smallest non-negative integer that none of its moves reaches. 0 means losing. A sum of independent games is won exactly when the XOR of the parts' Grundy numbers isn't 0, so games combine like Nim piles.
- **Memo over a mask**: when the state is “which numbers are already used” (LeetCode 464, n ≤ 20), memoise the result for each mask: O(2ⁿ · n) time and O(2ⁿ) space. Check the cheap cases first, such as the numbers' total being below the target.
- **Digit DP**: to count the integers from 0 to N with a digit property, walk N's digits from the most significant with a state such as (position, tight, extra). tight means the prefix so far equals N's prefix, so the next digit can't exceed N's digit there; once a smaller digit is used, the rest are free. Memoising the states costs about digits × states × 10 steps instead of a loop to N.
- **Counting a range [L, R]**: the answer is count(R) − count(L − 1), so you only ever write count(≤ N). For a property of the binary digits (LeetCode 600), the same idea runs over bits.
- **Counting with combinatorics**: some counting problems need multinomial coefficients mod p. LeetCode 1916 counts the orders for building a tree's rooms as n! divided by the product of all subtree sizes, using the inverse factorials from module 11.

## Diagrams
**Take 1, 2 or 3 coins: winning (W) and losing (L) piles from 0 to 12**

| pile | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| value | **L** | W | W | W | **L** | W | W | W | **L** | W | W | W | **L** |

_A pile is L when every move (−1, −2 or −3) lands on a W. The multiples of 4 are the losing piles: from 10, take 2 to hand your rival 8._

**Grundy numbers g(n) for the game “take 1, 3 or 4 coins”**

| g(n) | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| value | 0 | 1 | 0 | 1 | 2 | 3 | 2 | 0 | 1 | 0 | 1 | 2 | 3 | 2 | 0 |

_g(n) is the mex of g(n − 1), g(n − 3) and g(n − 4). The zeros (n = 0, 2, 7, 9, 14, …) are the losing piles, and the pattern repeats every 7._

## Comparisons
**Game DP shapes**

| Game | State | Rule | Cost |
|---|---|---|---|
| Take 1–3 coins from one pile | The pile size n | win[n] = some move reaches a losing pile | O(n × moves) |
| Take from either end; most points wins (LeetCode 486, 877) | The interval i..j | dp[i][j] = max(nums[i] − dp[i + 1][j], nums[j] − dp[i][j − 1]) | O(n²) |
| Nim with many piles | The pile sizes | Win ⇔ the XOR of the sizes ≠ 0 | O(piles) |
| A sum of different games | Each game's position | Win ⇔ the XOR of the Grundy numbers ≠ 0 | A Grundy table, then O(games) |
| Pick unused numbers 1..m (LeetCode 464) | The used-numbers mask | Win if some pick reaches the target or leaves a losing mask | O(2ᵐ × m) |

**Counting the numbers up to N: a loop or digit DP?**

|  | Loop from 0 to N | Digit DP |
|---|---|---|
| Work for N = 10⁹ | 10⁹ checks, each O(digits) | About 10 digits × 2 tight values × 10 choices × the extra state |
| Work for N = 10¹⁸ | Out of reach | Still only thousands of steps |
| What the state holds | The whole number | (position, tight, extra), e.g. the previous digit or a count so far |
| A range [L, R] | Loop over the range | count(R) − count(L − 1) |

## Code (JavaScript + Python)
### Predict the Winner: the score-difference DP
```python
def score_difference(nums):            # the best (my total - rival's total) for player 1
    n = len(nums)
    dp = nums[:]                        # dp[j] = best difference on nums[i..j]; one pile: take it
    for i in range(n - 2, -1, -1):
        for j in range(i + 1, n):
            dp[j] = max(nums[i] - dp[j], nums[j] - dp[j - 1])
    return dp[n - 1]

def predict_the_winner(nums):
    return score_difference(nums) >= 0  # a tie counts as a win for player 1 (LeetCode 486)

for nums in ([1, 5, 2], [1, 5, 233, 7], [5, 3, 4, 5]):
    print(score_difference(nums), "yes" if predict_the_winner(nums) else "no")
```

Output:
```text
-2 no
222 yes
1 yes
```

- line 3: With one pile left, the player to move just takes it, so the difference for i..i is nums[i].
- line 6: Take the left pile (the rival then plays i + 1..j, still stored in dp[j]) or the right one (the rival plays i..j − 1, already updated in dp[j − 1]). Their best counts against you.

```javascript
function scoreDifference(nums) {        // the best (my total - rival's total) for player 1
  const n = nums.length, dp = [...nums];   // dp[j] = best difference on nums[i..j]; one pile: take it
  for (let i = n - 2; i >= 0; i--)
    for (let j = i + 1; j < n; j++) dp[j] = Math.max(nums[i] - dp[j], nums[j] - dp[j - 1]);
  return dp[n - 1];
}

const predictTheWinner = nums => scoreDifference(nums) >= 0;   // a tie counts as a win for player 1

for (const nums of [[1, 5, 2], [1, 5, 233, 7], [5, 3, 4, 5]])
  console.log(scoreDifference(nums), predictTheWinner(nums) ? "yes" : "no");
```

Output:
```text
-2 no
222 yes
1 yes
```

- line 4: Take the left pile (the rival then plays i + 1..j, still stored in dp[j]) or the right one (the rival plays i..j − 1, already updated in dp[j − 1]). Their best counts against you.

### Grundy numbers with mex, and XOR for a sum of games
```python
def grundy_table(n, moves):
    g = [0] * (n + 1)
    for x in range(1, n + 1):
        seen = {g[x - m] for m in moves if m <= x}
        mex = 0
        while mex in seen:                 # the smallest value no move reaches
            mex += 1
        g[x] = mex
    return g

g = grundy_table(14, (1, 3, 4))
print(*g)
print(*(x for x in range(15) if g[x] == 0))      # the losing piles

total = 0
for pile in (7, 9, 12):                         # three separate piles of the same game
    total ^= g[pile]
print(total, "first player wins" if total else "first player loses")
nim = 3 ^ 4 ^ 5                                 # plain Nim: a pile's Grundy number is its size
print(nim, "first player wins" if nim else "first player loses")
```

Output:
```text
0 1 0 1 2 3 2 0 1 0 1 2 3 2 0
0 2 7 9 14
3 first player wins
2 first player wins
```

- line 4: The Grundy numbers of the positions one move away; a pile too small for move m simply doesn't have that move.
- line 17: g(7) = 0 and g(9) = 0, but g(12) = 3, so the XOR is 3: the first player should move in the pile of 12 to a pile whose g is 0.
- line 19: 3 XOR 4 = 7 and 7 XOR 5 = 2, which isn't 0: by Bouton's theorem the first player wins.

```javascript
function grundyTable(n, moves) {
  const g = new Array(n + 1).fill(0);
  for (let x = 1; x <= n; x++) {
    const seen = new Set(moves.filter(m => m <= x).map(m => g[x - m]));
    let mex = 0;
    while (seen.has(mex)) mex++;                // the smallest value no move reaches
    g[x] = mex;
  }
  return g;
}

const g = grundyTable(14, [1, 3, 4]);
console.log(...g);
console.log(...g.flatMap((v, x) => (v === 0 ? [x] : [])));   // the losing piles

let total = 0;
for (const pile of [7, 9, 12]) total ^= g[pile];   // three separate piles of the same game
console.log(total, total ? "first player wins" : "first player loses");
const nim = 3 ^ 4 ^ 5;                          // plain Nim: a pile's Grundy number is its size
console.log(nim, nim ? "first player wins" : "first player loses");
```

Output:
```text
0 1 0 1 2 3 2 0 1 0 1 2 3 2 0
0 2 7 9 14
3 first player wins
2 first player wins
```

- line 4: The Grundy numbers of the positions one move away; a pile too small for move m simply doesn't have that move.
- line 17: g(7) = 0 and g(9) = 0, but g(12) = 3, so the XOR is 3: the first player should move in the pile of 12 to a pile whose g is 0.

### Digit DP: no two consecutive 1s in binary (LeetCode 600)
```python
from functools import cache

def count_no_adjacent_ones(n):           # how many x in [0, n] have no "11" in binary
    bits = bin(n)[2:]                    # most significant bit first

    @cache
    def go(pos, prev, tight):            # ways to fill bits[pos:] after the bit prev
        if pos == len(bits):
            return 1
        limit = int(bits[pos]) if tight else 1
        total = 0
        for b in range(limit + 1):
            if b == 1 and prev == 1:     # this would make "11"
                continue
            total += go(pos + 1, b, tight and b == limit)
        return total

    return go(0, 0, True)

print(*(count_no_adjacent_ones(n) for n in (1, 2, 5, 10, 10**9)))
```

Output:
```text
2 3 5 8 2178309
```

- line 7: The state space is tiny: about 30 positions × 2 previous bits × 2 tight values, even for n = 10⁹.
- line 10: While tight, the next bit can't exceed n's bit at this position; once free, both 0 and 1 are allowed.
- line 15: tight survives only if this bit equals n's bit; using a 0 where n has a 1 frees every later position.

```javascript
function countNoAdjacentOnes(n) {        // how many x in [0, n] have no "11" in binary
  const bits = n.toString(2);            // most significant bit first
  const memo = new Map();
  function go(pos, prev, tight) {        // ways to fill bits[pos:] after the bit prev
    if (pos === bits.length) return 1;
    const key = `${pos},${prev},${tight}`;
    if (memo.has(key)) return memo.get(key);
    const limit = tight ? Number(bits[pos]) : 1;
    let total = 0;
    for (let b = 0; b <= limit; b++) {
      if (b === 1 && prev === 1) continue;   // this would make "11"
      total += go(pos + 1, b, tight && b === limit);
    }
    memo.set(key, total);
    return total;
  }
  return go(0, 0, true);
}

console.log(...[1, 2, 5, 10, 10 ** 9].map(n => countNoAdjacentOnes(n)));
```

Output:
```text
2 3 5 8 2178309
```

- line 6: A string key turns the three-part state into one Map key; JavaScript has no tuple keys.
- line 12: tight survives only if this bit equals n's bit; using a 0 where n has a 1 frees every later position.

## Worked example
**Problem.** Count the total number of digit 1s in all the integers from 0 to n, for n up to 10⁹ (LeetCode 233, Number of Digit One).

1. Looping from 0 to n and counting the 1s in each number takes about 10⁹ × 10 steps: far too slow.
2. Build the numbers digit by digit from the left. While the prefix equals n's prefix (tight), the next digit can only go up to n's digit; after a smaller digit, any of 0–9 is allowed.
3. The state is (position, how many 1s so far, tight), and go returns the total number of 1s over every way to finish the number. Leading zeros are harmless here, because zeros never add a 1.
4. There are at most 10 positions × 10 counts × 2 tight values = 200 states, each trying up to 10 digits: about 2,000 steps.

```python
from functools import cache

def count_digit_one(n):                  # the total number of 1 digits in 0, 1, …, n
    digits = str(n)

    @cache
    def go(pos, ones, tight):            # the total 1s over every way to finish the number
        if pos == len(digits):
            return ones
        limit = int(digits[pos]) if tight else 9
        return sum(go(pos + 1, ones + (d == 1), tight and d == limit) for d in range(limit + 1))

    return go(0, 0, True)

print(count_digit_one(13), count_digit_one(0), count_digit_one(99), count_digit_one(10**9))
```

Output:
```text
6 0 20 900000001
```

```javascript
function countDigitOne(n) {              // the total number of 1 digits in 0, 1, …, n
  const digits = String(n), memo = new Map();
  function go(pos, ones, tight) {        // the total 1s over every way to finish the number
    if (pos === digits.length) return ones;
    const key = `${pos},${ones},${tight}`;
    if (memo.has(key)) return memo.get(key);
    const limit = tight ? Number(digits[pos]) : 9;
    let total = 0;
    for (let d = 0; d <= limit; d++) total += go(pos + 1, ones + (d === 1 ? 1 : 0), tight && d === limit);
    memo.set(key, total);
    return total;
  }
  return go(0, 0, true);
}

console.log(countDigitOne(13), countDigitOne(0), countDigitOne(99), countDigitOne(10 ** 9));
```

Output:
```text
6 0 20 900000001
```

**Answer.** 6, 0, 20 and 900000001. For 13 the 1s are in 1, 10, 11 (two of them), 12 and 13: six in total. For 10⁹ the DP visits only a few hundred states.

## Your turn (faded example)
**Problem.** Two players take turns picking a number from 1 to m that hasn't been picked yet, adding it to a running total. Whoever first makes the total reach at least the target wins. Can the first player force a win? (LeetCode 464, Can I Win; m ≤ 20)

- ✓ The state is the set of numbers already used, stored as a mask: the remaining target follows from it, so it adds no new information.
- **When is the answer settled before any search?**
  <details><summary>Answer</summary>If the target is 0 or less, the first player has already won. If 1 + 2 + … + m is below the target, nobody can ever reach it, so the first player can't win.</details>
- **When is picking the number i a winning move?**
  <details><summary>Answer</summary>If i alone reaches the remaining target, or if the rival, facing the mask with i added and the target reduced by i, can't win.</details>
- **Time and space?**
  <details><summary>Answer</summary>O(2ᵐ · m) time and O(2ᵐ) memory: each mask is solved once and tries up to m picks.</details>

Starter:
```python
from functools import cache

def can_i_win(m, target):
    if target <= 0:
        return True
    if m * (m + 1) // 2 < target:
        return False

    @cache
    def wins(mask, remaining):              # can the player to move force a win?
        for i in range(1, m + 1):
            bit = 1 << i
            if mask & bit:
                continue
            ...                             # TODO: win now, or leave the rival in a losing position
        return False

    return wins(0, target)
```

```javascript
function canIWin(m, target) {
  if (target <= 0) return true;
  if ((m * (m + 1)) / 2 < target) return false;
  const memo = new Map();
  function wins(mask, remaining) {          // can the player to move force a win?
    if (memo.has(mask)) return memo.get(mask);
    let result = false;
    for (let i = 1; i <= m && !result; i++) {
      const bit = 1 << i;
      if (mask & bit) continue;
      // TODO: win now, or leave the rival in a losing position
    }
    memo.set(mask, result);
    return result;
  }
  return wins(0, target);
}
```

<details><summary>Full solution</summary>

```python
from functools import cache

def can_i_win(m, target):
    if target <= 0:
        return True
    if m * (m + 1) // 2 < target:
        return False

    @cache
    def wins(mask, remaining):              # can the player to move force a win?
        for i in range(1, m + 1):
            bit = 1 << i
            if mask & bit:
                continue
            if i >= remaining or not wins(mask | bit, remaining - i):
                return True
        return False

    return wins(0, target)

print(*("yes" if can_i_win(m, t) else "no" for m, t in ((10, 11), (10, 12), (10, 0), (5, 50), (10, 40))))
```

Output:
```text
no yes yes no no
```

```javascript
function canIWin(m, target) {
  if (target <= 0) return true;
  if ((m * (m + 1)) / 2 < target) return false;
  const memo = new Map();
  function wins(mask, remaining) {          // can the player to move force a win?
    if (memo.has(mask)) return memo.get(mask);
    let result = false;
    for (let i = 1; i <= m && !result; i++) {
      const bit = 1 << i;
      if (mask & bit) continue;
      if (i >= remaining || !wins(mask | bit, remaining - i)) result = true;
    }
    memo.set(mask, result);
    return result;
  }
  return wins(0, target);
}

console.log(...[[10, 11], [10, 12], [10, 0], [5, 50], [10, 40]].map(([m, t]) => (canIWin(m, t) ? "yes" : "no")));
```

Output:
```text
no yes yes no no
```

</details>

## Socratic checks and quiz (answers hidden)
**1. What does this print?**

```python
win = [False] * 9
for n in range(1, 9):
    win[n] = any(not win[n - k] for k in (1, 2, 3) if k <= n)
print(*(n for n in range(9) if not win[n]))
```

```javascript
const win = new Array(9).fill(false);
for (let n = 1; n < 9; n++) win[n] = [1, 2, 3].some(k => k <= n && !win[n - k]);
console.log(...[...win.keys()].filter(n => !win[n]));
```

- A. 0 4 8
- B. 4 8
- C. 1 5
- D. 0 3 6

<details><summary>Answer</summary>

0 4 8. 0 is losing (no moves). 1, 2 and 3 can reach 0, so they win; every move from 4 lands on 1, 2 or 3, so 4 loses; and so on: the multiples of 4.

</details>

**2. What does this print?**

```python
x = 0
for p in [1, 4, 5]:
    x ^= p
print(x, "win" if x else "lose")
```

```javascript
let x = 0;
for (const p of [1, 4, 5]) x ^= p;
console.log(x, x ? "win" : "lose");
```

- A. 0 lose
- B. 10 win
- C. 1 win
- D. 5 win

<details><summary>Answer</summary>

0 lose. 1 XOR 4 = 5 and 5 XOR 5 = 0. A zero XOR is a losing position for the player to move.

</details>

**3. In Predict the Winner, what is taking pile i from piles i..j worth to the player who moves?**

- A. nums[i] − dp[i + 1][j]
- B. nums[i] + dp[i + 1][j]
- C. dp[i + 1][j] − nums[i]
- D. max(nums[i], dp[i + 1][j])

<details><summary>Answer</summary>

nums[i] − dp[i + 1][j]. You gain nums[i], then your rival moves on i + 1..j and gets their best difference, dp[i + 1][j], which counts against you.

</details>

**4. Which statements about Grundy numbers are true? (choose 2)**

- A. A position's Grundy number is the mex of the Grundy numbers of its options
- B. A sum of independent games is lost by the player to move exactly when the XOR of the Grundy numbers is 0
- C. The Grundy numbers of a sum of games add up
- D. Only positions with Grundy number 1 are winning
- E. Grundy numbers work for games where the two players have different moves

<details><summary>Answer</summary>

A position's Grundy number is the mex of the Grundy numbers of its options, A sum of independent games is lost by the player to move exactly when the XOR of the Grundy numbers is 0. Grundy numbers combine by XOR, every non-zero value is a win, and the theory covers impartial games, where both players have the same moves.

</details>

**5. Judge each statement.**

- In the take-1-to-3 game, a pile of 12 is lost for the player to move.
- In Nim with two piles of 2, the first player wins.
- Digit DP counts the numbers in [L, R] as count(R) − count(L − 1).
- mex({0, 1, 3}) is 2.

<details><summary>Answer</summary>

In the take-1-to-3 game, a pile of 12 is lost for the player to move.: Yes; In Nim with two piles of 2, the first player wins.: No; Digit DP counts the numbers in [L, R] as count(R) − count(L − 1).: Yes; mex({0, 1, 3}) is 2.: Yes. 12 is a multiple of 4. 2 XOR 2 = 0, so the second player wins by copying every move in the other pile. Counting up to R minus counting up to L − 1 leaves exactly [L, R]. 2 is the smallest non-negative integer missing from {0, 1, 3}.

</details>

**6. Put the steps of filling the Predict the Winner table in order.**

- (put the steps in order)

<details><summary>Answer</summary>

Set dp[i][i] = nums[i] for every i → Fill the intervals of length 2 from the length-1 values → Fill each longer interval from the two shorter intervals inside it → Read dp[0][n − 1] and check whether it's at least 0. Every interval needs the two intervals one shorter inside it, so lengths go 1, 2, 3, …, and the whole row's answer is ready last.

</details>

**7. Complete the JavaScript Grundy table.**

```
function grundy(n, moves) {
  const g = new Array(n + 1).fill(0);
  for (let x = 1; x <= n; x++) {
    const seen = new Set();
    for (const m of moves) if (m <= x) seen.add(g[{{0}}]);
    let mex = 0;
    while (seen.has(mex)) mex{{1}};
    g[x] = mex;
  }
  return g;
}

```

<details><summary>Answer</summary>

x - m | ++. A move of m from x lands on x − m, and the mex is found by counting up from 0 one step at a time until a value is missing.

</details>

**8. Match each problem to its technique.**


<details><summary>Answer</summary>

Take 1–3 coins from one pile = The losing piles are the multiples of 4; Take from either end of a row of piles = Interval DP on the score difference; Several Nim piles = The XOR of the pile sizes; Count the numbers up to n that follow a digit rule = Digit DP with a tight flag. Each game or count collapses to a small state: a pile size, an interval, an XOR, or (position, tight, extra).

</details>

## Traps & misconceptions
- **“A good first move is any move that looks strong.”** A move is good only if it leaves the rival in a *losing* position, one from which every reply hands you back a win. Build the answer up from the base case instead of judging moves by feel.
- **“Greedy play (always take the bigger pile) is optimal.”** Not in general: in [1, 5, 2] the first player loses whichever end they take, and in [1, 5, 233, 7] the winning first move is the small 1, because it keeps 233 for later. Use the score-difference DP.
- **“In Nim, you win by emptying the biggest pile.”** You win by moving to a position whose XOR is 0. If the XOR is already 0 on your turn, every move loses against perfect play.
- **“Add the Grundy numbers to value a sum of games.”** Combine them with XOR, not +. Two games with Grundy number 1 make a losing sum (1 XOR 1 = 0), while 1 + 1 = 2 would wrongly suggest a win.
- **“Digit DP can drop the tight flag after the first digit.”** tight must be carried the whole way: it stays true only while every digit so far equals n's digit. Dropping it counts numbers bigger than n.
- **“Memoising on (position, tight) is always enough.”** The state must hold everything the rest depends on: the previous digit (no consecutive 1s), a count so far, a remainder. Leaving something out makes the cached answers wrong.

## Discussion prompts
- **Why do game problems use a score difference instead of tracking both totals?**
  <details><summary>One good answer</summary>The game is zero-sum: whatever one player gains counts against the other. A single number, my total minus yours, captures the outcome, and the recurrence just flips its sign each turn: my best is the pile I take minus the rival's best on what's left. Tracking both totals would double the state for no gain.</details>
- **When should you look for a pattern instead of running the DP?**
  <details><summary>One good answer</summary>When positions are huge (a pile of 10¹⁸ coins) the table won't fit, but small games often repeat: take-1-to-3 loses exactly on multiples of 4, and the {1, 3, 4} game repeats every 7. Compute the table for small sizes, spot the period, and prove it, or at least test it against the DP for a few thousand sizes.</details>

## Teach-back
**Prompt:** Explain to a junior colleague how to decide who wins a take-away game with perfect play, and how several separate games combine.

Rubric:
- [ ] A position with no moves is losing (normal play)
- [ ] Winning if some move reaches a losing position; losing if every move reaches a winning one
- [ ] Fill bottom-up or memoise: O(states × moves)
- [ ] A Grundy number is the mex of the options' Grundy numbers; 0 means losing
- [ ] A sum of games: XOR the Grundy numbers (in Nim, the pile sizes)

<details><summary>Model answer</summary>

Work back from the end of the game. Under normal play, a position with no moves is lost for the player who must move. Any other position is winning if at least one move leads to a losing position, and losing if every move leads to a winning one. Because piles only shrink, you can fill this in from small piles upwards in O(positions × moves) time. For several independent games played side by side, win or lose isn't enough: give each position a Grundy number, the smallest non-negative integer that none of its moves reaches (the mex). Zero means losing, and the combined game is won exactly when the XOR of the separate Grundy numbers isn't zero. In plain Nim, a pile's Grundy number is just its size, which is Bouton's theorem.

</details>

## Quick Q&A (also in the SRS deck)
- **When is a game position losing (normal play)?** When every move leads to a winning position; a position with no moves is losing.
- **In Predict the Winner, what does dp[i][j] store?** The best (my total − rival's total) the player to move can force on piles i..j.
- **Who wins Nim?** The player to move wins exactly when the XOR of the pile sizes isn't 0.
- **What is a Grundy number?** The mex of the Grundy numbers of the positions one move away; 0 means losing.
- **What does tight mean in digit DP?** The prefix so far equals n's prefix, so the next digit can't exceed n's digit there.
- **How do you count a range [L, R] with digit DP?** count(R) − count(L − 1).

## Practice problems
- [ ] [LC 292 · Nim Game](https://leetcode.com/problems/nim-game/) · Easy · you lose exactly when n is a multiple of 4
- [ ] [LC 1025 · Divisor Game](https://leetcode.com/problems/divisor-game/) · Easy · Alice wins exactly when n is even; prove it, then check with a small DP
- [ ] [LC 877 · Stone Game](https://leetcode.com/problems/stone-game/) · Medium · the score-difference DP works, and a parity argument shows the first player always wins
- [ ] [LC 486 · Predict the Winner](https://leetcode.com/problems/predict-the-winner/) · Medium · code block 1: dp[i][j] = max(nums[i] − dp[i + 1][j], nums[j] − dp[i][j − 1])
- [ ] [LC 1140 · Stone Game II](https://leetcode.com/problems/stone-game-ii/) · Medium · memoise on (start index, M); suffix sums make each move's gain O(1)
- [ ] [LC 464 · Can I Win](https://leetcode.com/problems/can-i-win/) · Medium · the faded example: memoise over the used-numbers mask
- [ ] [LC 902 · Numbers At Most N Given Digit Set](https://leetcode.com/problems/numbers-at-most-n-given-digit-set/) · Hard · count the shorter lengths with powers, then walk N's digits with a tight flag
- [ ] [LC 233 · Number of Digit One](https://leetcode.com/problems/number-of-digit-one/) · Hard · the worked example: digit DP on (position, ones so far, tight)
- [ ] [LC 600 · Non-negative Integers without Consecutive Ones](https://leetcode.com/problems/non-negative-integers-without-consecutive-ones/) · Hard · digit DP over the bits, with the previous bit in the state
- [ ] [LC 1916 · Count Ways to Build Rooms in an Ant Colony](https://leetcode.com/problems/count-ways-to-build-rooms-in-an-ant-colony/) · Hard · n! divided by the product of all subtree sizes, mod p, with module 11's inverse factorials

## Sources (accessed 2026-10-09)
- [cp-algorithms: Sprague–Grundy theorem and Nim](https://cp-algorithms.com/game_theory/sprague-grundy-nim.html)
- [cp-algorithms: Games on arbitrary graphs](https://cp-algorithms.com/game_theory/games_on_graphs.html)
- [USACO Guide: Digit DP](https://usaco.guide/gold/digit-dp)
- [Wikipedia: Nim](https://en.wikipedia.org/wiki/Nim)
