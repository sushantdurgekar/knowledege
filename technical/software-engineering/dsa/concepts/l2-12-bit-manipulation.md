---
title: "Bit manipulation"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l2, dsa-l2-m12]
status: new
created: 2026-10-09
updated: 2026-10-09
sources:
  - url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_operators#bitwise_operators
    accessed: 2026-10-09
  - url: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence
    accessed: 2026-10-09
  - url: https://docs.python.org/3/library/stdtypes.html#bitwise-operations-on-integer-types
    accessed: 2026-10-09
  - url: https://graphics.stanford.edu/~seander/bithacks.html
    accessed: 2026-10-09
  - url: https://cp-algorithms.com/algebra/bit-manipulation.html
    accessed: 2026-10-09
---
# Bit manipulation

> Data Structures & Algorithms · L2 Proficient · Greedy & bit manipulation · about 90 min · hub module `m12` ([open the hub](https://claude.ai/artifact/DQhszKFoe8qbiNbSpWkqM5))

## Why it matters
Bits turn up in interview puzzles (find the odd one out, count the 1s, add without +) and in real code: permission flags, bitsets, hashing, subnet masks. Python and JavaScript disagree about how wide an integer is, so the same expression can print different answers in the two languages. Knowing why is half of this topic.

## Pre-question (answer before reading)
**Q:** Every number in a list appears twice except one. How could you find that one in O(n) time and O(1) extra space, without sorting or a hash set?

<details><summary>Answer</summary>

XOR everything together. x ^ x = 0, x ^ 0 = x, and XOR doesn't care about order, so all the pairs cancel and only the single number is left.

</details>

## 🍎 Story time (kid version)
**The toy room and the treasure-map road trip: Odd socks and light switches**

Ben is matching socks after laundry day. He drops each sock on the bed, and if its twin is already there, he takes both away. When the basket is empty, one lonely sock is left: the one without a twin. The order the socks came out never mattered. Then Tara shows him the eight light switches on her toy castle. She writes 1 for on and 0 for off, left to right, so one row of digits describes all eight lights. Flipping one switch changes just that light and leaves the rest alone.

| In the story | In code |
|---|---|
| A sock and its twin leave together | x ^ x = 0: equal values cancel under XOR |
| The order the socks came out never mattered | XOR is commutative and associative |
| The lonely sock left on the bed | The XOR of the whole list is the single number |
| 1 for on, 0 for off, for eight switches | One integer's bits used as eight flags |
| Flipping one switch | x ^ (1 << i) toggles bit i and leaves the other bits alone |

**Where the story breaks:** The bed always holds real socks, but a running XOR usually isn't any of the numbers: 1 ^ 2 = 3. XOR works bit by bit, so each bit position is really its own little sock pile.

## Key ideas (grown-up version)
- **The operators**: AND `&` (1 if both bits are 1), OR `|` (1 if either is), XOR `^` (1 if they differ), NOT `~` (flip every bit), and the shifts `<<` and `>>`. `x << k` multiplies by 2ᵏ; `x >> k` is floor division by 2ᵏ (in JavaScript, only while the values fit in 32 bits).
- **One bit at a time** (bit i counts from 0 at the right): test `(x >> i) & 1`, set `x | (1 << i)`, clear `x & ~(1 << i)`, toggle `x ^ (1 << i)`.
- **Two famous tricks**: `x & (x - 1)` clears the lowest set bit, so `x > 0` and `(x & (x - 1)) == 0` means x is a power of two; `x & -x` keeps only the lowest set bit.
- **XOR facts**: x ^ x = 0, x ^ 0 = x, and the order doesn't matter, so XOR-ing a list cancels every pair. That finds the single number and the missing number in O(1) space.
- **Counting set bits**: Kernighan's loop `x &= x - 1` takes one step per set bit. Python 3.10+ also has `x.bit_count()`; JavaScript has no built-in popcount for Numbers.
- **Integer width differs**: Python ints never overflow, so `~x` is always −x − 1 and a negative number behaves as if it had infinitely many leading 1s. JavaScript's bitwise operators convert Numbers to **32-bit signed** integers: `1 << 31` is −2147483648, and `>>>` is an unsigned right shift. Mask with `& 0xFFFFFFFF` in Python to see 32 bits; use BigInt in JavaScript for wider values.
- **Masks as subsets**: with n items, each number from 0 to 2ⁿ − 1 picks a subset (bit i set = item i is in). Loop over the masks to try every subset in O(n · 2ⁿ); bitmask DP builds on this in Level 3.
- **DP over bits**: `bits[i] = bits[i >> 1] + (i & 1)` counts the set bits of every number from 0 to n in O(n).

## Diagrams
**x & (x − 1) clears the lowest set bit**

| bit | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |

| x = 44 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 0 | 0 | 1 | 0 | 1 | **1** | 0 | 0 |

| x − 1 = 43 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 0 | 0 | 1 | 0 | 1 | **0** | **1** | **1** |

| AND = 40 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| value | 0 | 0 | 1 | 0 | 1 | 0 | 0 | 0 |

_Subtracting 1 flips the lowest 1 and every 0 below it (highlighted). AND keeps only the bits that are 1 in both, so the bits above survive and the lowest 1 is gone._

**XOR of [4, 1, 2, 1, 2], one column at a time**

| bit | 0 | 1 | 2 |
|---|---|---|---|
| value | 2 | 1 | 0 |

| 4 | 0 | 1 | 2 |
|---|---|---|---|
| value | 1 | 0 | 0 |

| 1 | 0 | 1 | 2 |
|---|---|---|---|
| value | 0 | 0 | 1 |

| 2 | 0 | 1 | 2 |
|---|---|---|---|
| value | 0 | 1 | 0 |

| 1 | 0 | 1 | 2 |
|---|---|---|---|
| value | 0 | 0 | 1 |

| 2 | 0 | 1 | 2 |
|---|---|---|---|
| value | 0 | 1 | 0 |

| XOR = 4 | 0 | 1 | 2 |
|---|---|---|---|
| value | 1 | 0 | 0 |

_A column's XOR is 1 when the column holds an odd number of 1s. Each pair puts two 1s (or none) in a column, so only the single value's bits survive. If the others appear three times, count each column mod 3 instead._

## Comparisons
**Bit recipes (bit i counts from 0 at the right)**

| Goal | Expression | Example with x = 11 (0b1011) |
|---|---|---|
| Test bit i | `(x >> i) & 1` | i = 2 → 0 |
| Set bit i | `x | (1 << i)` | i = 2 → 15 (0b1111) |
| Clear bit i | `x & ~(1 << i)` | i = 1 → 9 (0b1001) |
| Toggle bit i | `x ^ (1 << i)` | i = 0 → 10 (0b1010) |
| Clear the lowest set bit | `x & (x - 1)` | 10 (0b1010) |
| Keep only the lowest set bit | `x & -x` | 1 |
| Power of two? | `x > 0 and (x & (x - 1)) == 0` (JS: `&&`, `===`) | no |

**The same expression in Python and JavaScript**

| Expression | Python | JavaScript | Why |
|---|---|---|---|
| `1 << 31` | 2147483648 | −2147483648 | JavaScript's bitwise results are 32-bit signed; bit 31 is the sign |
| `1 << 32` | 4294967296 | 1 | JavaScript takes the shift count mod 32 |
| `~5` | −6 | −6 | `~x` is −x − 1 in both (in JavaScript, for 32-bit values) |
| `-7 >> 1` | −4 | −4 | `>>` is an arithmetic shift: floor division by 2 |
| `2**32 | 0` | 4294967296 | 0 | JavaScript keeps only the low 32 bits |
| `-1 >>> 0` | No `>>>`; write `-1 & 0xFFFFFFFF` | 4294967295 | The same 32 bits read as unsigned |
| `5 & 3`, `5 | 3`, `5 ^ 3` | 1, 7, 6 | 1, 7, 6 | Small non-negative values always agree |

## Code (JavaScript + Python)
### One-bit recipes, the two famous tricks, and counting 1s
```python
def bit(x, i):       return (x >> i) & 1
def set_bit(x, i):   return x | (1 << i)
def clear_bit(x, i): return x & ~(1 << i)
def toggle(x, i):    return x ^ (1 << i)

def is_power_of_two(x):
    return x > 0 and (x & (x - 1)) == 0       # brackets around x & (x - 1): optional in Python only

def count_ones(x):                            # Kernighan: one step per set bit (x >= 0)
    count = 0
    while x:
        x &= x - 1                            # clears the lowest set bit
        count += 1
    return count

x = 0b1011                                    # 11
print(bit(x, 2), set_bit(x, 2), clear_bit(x, 1), toggle(x, 0), x & -x)
print(*("yes" if is_power_of_two(n) else "no" for n in (1, 6, 64, 0)))
print(count_ones(11), count_ones(255), count_ones(0))
```

Output:
```text
0 15 9 10 1
yes no yes no
3 8 0
```

- line 7: `x > 0` rules out 0, which would otherwise pass (0 & −1 is 0).
- line 9: On a negative Python int this never ends: it has infinitely many 1s. Mask with `& 0xFFFFFFFF` first. Python 3.10+ also has `x.bit_count()`, which counts the 1s of abs(x); for the 32-bit pattern use `(x & 0xFFFFFFFF).bit_count()`.
- line 12: x − 1 flips the lowest 1 and the 0s below it, so AND removes exactly that bit.
- line 17: `x & -x` keeps only the lowest set bit: 11 & −11 = 1.

```javascript
const bit = (x, i) => (x >> i) & 1;
const setBit = (x, i) => x | (1 << i);
const clearBit = (x, i) => x & ~(1 << i);
const toggle = (x, i) => x ^ (1 << i);

function isPowerOfTwo(x) {
  return x > 0 && (x & (x - 1)) === 0;      // brackets around x & (x - 1): required in JS
}

function countOnes(x) {                     // Kernighan: one step per set bit
  let count = 0;
  while (x !== 0) {
    x &= x - 1;                             // clears the lowest set bit
    count++;
  }
  return count;
}

const x = 0b1011;                           // 11
console.log(bit(x, 2), setBit(x, 2), clearBit(x, 1), toggle(x, 0), x & -x);
console.log(...[1, 6, 64, 0].map(n => (isPowerOfTwo(n) ? "yes" : "no")));
console.log(countOnes(11), countOnes(255), countOnes(0));
```

Output:
```text
0 15 9 10 1
yes no yes no
3 8 0
```

- line 7: Without the brackets around `x & (x - 1)`, this means `x & ((x - 1) === 0)`, because `===` binds tighter than `&` in JavaScript.
- line 10: Also ends for negative numbers: the operators work on 32 bits, so there are at most 32 set bits.
- line 13: x − 1 flips the lowest 1 and the 0s below it, so AND removes exactly that bit.
- line 20: `x & -x` keeps only the lowest set bit: 11 & −11 = 1.

### XOR cancels pairs: the single number and the missing number
```python
from functools import reduce
from operator import xor

def single_number(nums):          # every value appears twice except one
    return reduce(xor, nums, 0)

def missing_number(nums):         # nums holds n distinct values from 0..n
    result = len(nums)
    for i, v in enumerate(nums):
        result ^= i ^ v           # XOR in each index and each value
    return result

print(single_number([4, 1, 2, 1, 2]), single_number([7]),
      missing_number([3, 0, 1]), missing_number([9, 6, 4, 2, 3, 5, 7, 0, 1]))
```

Output:
```text
4 7 2 8
```

- line 5: Pairs cancel (x ^ x = 0) and order doesn't matter, so only the single value survives.
- line 10: Each number 0..n appears once as an index (or as len(nums)) and once as a value, except the missing one, which appears only once.

```javascript
const singleNumber = nums => nums.reduce((acc, v) => acc ^ v, 0);   // every value twice except one

function missingNumber(nums) {    // nums holds n distinct values from 0..n
  let result = nums.length;
  nums.forEach((v, i) => { result ^= i ^ v; });   // XOR in each index and each value
  return result;
}

console.log(singleNumber([4, 1, 2, 1, 2]), singleNumber([7]),
            missingNumber([3, 0, 1]), missingNumber([9, 6, 4, 2, 3, 5, 7, 0, 1]));
```

Output:
```text
4 7 2 8
```

- line 1: Pairs cancel (x ^ x = 0) and order doesn't matter, so only the single value survives.
- line 5: Each number 0..n appears once as an index (or as nums.length) and once as a value, except the missing one, which appears only once.

### Integer width: the same expressions, two answers
```python
def to_int32(x):                          # wrap to 32 bits, like JavaScript's  x | 0
    x &= 0xFFFFFFFF                       # keep the low 32 bits: now 0 .. 2**32 - 1
    return x - (1 << 32) if x >> 31 else x   # bit 31 set: the value is negative

print("1 << 31   ", 1 << 31)
print("1 << 32   ", 1 << 32)
print("~5        ", ~5)
print("-7 >> 1   ", -7 >> 1)
print("2**32 | 0 ", 2**32 | 0)
print("wrapped   ", to_int32(2**31), to_int32(2**32 + 5))
print("-1 as u32 ", -1 & 0xFFFFFFFF)
print("1 << 40   ", 1 << 40)
```

Output:
```text
1 << 31    2147483648
1 << 32    4294967296
~5         -6
-7 >> 1    -4
2**32 | 0  4294967296
wrapped    -2147483648 5
-1 as u32  4294967295
1 << 40    1099511627776
```

- line 1: This is the wrap JavaScript applies to the operands of `& | ^ ~` and the left side of `<<` and `>>` (its ToInt32 step), written out in Python for whole numbers.
- line 5: Python ints grow as needed, so nothing ever wraps.

```javascript
console.log("1 << 31   ", 1 << 31);
console.log("1 << 32   ", 1 << 32);
console.log("~5        ", ~5);
console.log("-7 >> 1   ", -7 >> 1);
console.log("2**32 | 0 ", 2 ** 32 | 0);
console.log("wrapped   ", 2 ** 31 | 0, (2 ** 32 + 5) | 0);
console.log("-1 as u32 ", -1 >>> 0);
console.log("1n << 40n ", 1n << 40n);
```

Output:
```text
1 << 31    -2147483648
1 << 32    1
~5         -6
-7 >> 1    -4
2**32 | 0  0
wrapped    -2147483648 5
-1 as u32  4294967295
1n << 40n  1099511627776n
```

- line 1: The results of `& | ^ ~ << >>` are 32-bit signed, and bit 31 is the sign bit (`>>>` is the exception).
- line 2: The shift count is taken mod 32, so this is 1 << 0.
- line 7: `>>>` is the unsigned right shift: `x >>> 0` reads the same 32 bits as an unsigned number.
- line 8: BigInt has no width limit, but mixing it with a Number (`1n << 3`) throws a TypeError.

## Worked example
**Problem.** Every value in `nums` appears three times except one, which appears once. Find it in O(n) time and O(1) extra space (LeetCode 137, Single Number II). Values can be negative.

1. Plain XOR fails: a value XOR-ed three times is itself, not 0.
2. Look at one bit position at a time. Each tripled value adds 0 or 3 ones to that position, and the single value adds 0 or 1. So the count of ones mod 3 is the single value's bit.
3. Repeat for all 32 positions: O(32 · n) = O(n) time and O(1) extra space.
4. Negatives: in JavaScript, `1 << 31` sets the sign bit, so the result comes out negative by itself. In Python the result is just a big positive number, so if bit 31 is set, subtract 2³².

```python
def single_number_ii(nums):                     # every value appears 3 times except one
    result = 0
    for i in range(32):
        ones = sum((x >> i) & 1 for x in nums)   # how many values have bit i set
        if ones % 3:                             # so the single value has bit i set
            result |= 1 << i
    return result - (1 << 32) if result >> 31 else result   # bit 31 is the sign

print(single_number_ii([2, 2, 3, 2]), single_number_ii([0, 1, 0, 1, 0, 1, 99]),
      single_number_ii([-4, -4, 7, -4]), single_number_ii([5, -2, 5, 5]))
```

Output:
```text
3 99 7 -2
```

```javascript
function singleNumberII(nums) {                 // every value appears 3 times except one
  let result = 0;
  for (let i = 0; i < 32; i++) {
    let ones = 0;
    for (const x of nums) ones += (x >> i) & 1;   // how many values have bit i set
    if (ones % 3) result |= 1 << i;              // 1 << 31 sets the sign bit itself
  }
  return result;
}

console.log(singleNumberII([2, 2, 3, 2]), singleNumberII([0, 1, 0, 1, 0, 1, 99]),
            singleNumberII([-4, -4, 7, -4]), singleNumberII([5, -2, 5, 5]));
```

Output:
```text
3 99 7 -2
```

**Answer.** 3 99 7 −2. In the last call the answer, −2, has bit 31 set. JavaScript's `1 << 31` makes the result negative directly; Python builds 4294967294 and subtracts 2³² to get −2.

## Your turn (faded example)
**Problem.** Count the subsets of `nums` whose sum equals `target` by trying every subset as a bitmask. Each item counts separately, even if values repeat.

- ✓ Number the items 0 to n − 1. Each mask from 0 to 2ⁿ − 1 picks a subset: bit i set means item i is in it.
- **How do you test whether item i is in the subset?**
  <details><summary>Answer</summary>`(mask >> i) & 1` is 1 when bit i is set (or check that `mask & (1 << i)` isn't 0).</details>
- **Which mask is the empty subset, and does it count when the target is 0?**
  <details><summary>Answer</summary>Mask 0. Its sum is 0, so it counts: [1, 2] with target 0 gives 1.</details>
- **Time, and the largest practical n?**
  <details><summary>Answer</summary>O(n · 2ⁿ), fine up to about n = 20. In JavaScript, `1 << n` also turns negative at n = 31.</details>

Starter:
```python
def count_subsets_with_sum(nums, target):
    n, count = len(nums), 0
    for mask in range(1 << n):              # every subset, as an n-bit number
        total = 0
        for i in range(n):
            ...                             # TODO: add nums[i] if bit i of mask is set
        if total == target:
            count += 1
    return count
```

```javascript
function countSubsetsWithSum(nums, target) {
  const n = nums.length;
  let count = 0;
  for (let mask = 0; mask < 1 << n; mask++) {   // every subset, as an n-bit number
    let total = 0;
    for (let i = 0; i < n; i++) {
      // TODO: add nums[i] if bit i of mask is set
    }
    if (total === target) count++;
  }
  return count;
}
```

<details><summary>Full solution</summary>

```python
def count_subsets_with_sum(nums, target):
    n, count = len(nums), 0
    for mask in range(1 << n):              # every subset, as an n-bit number
        total = 0
        for i in range(n):
            if (mask >> i) & 1:             # is item i in this subset?
                total += nums[i]
        if total == target:
            count += 1
    return count

print(count_subsets_with_sum([1, 2, 3, 4], 5), count_subsets_with_sum([2, 2, 2], 4), count_subsets_with_sum([1, 2], 0))
```

Output:
```text
2 3 1
```

```javascript
function countSubsetsWithSum(nums, target) {
  const n = nums.length;
  let count = 0;
  for (let mask = 0; mask < 1 << n; mask++) {   // every subset, as an n-bit number
    let total = 0;
    for (let i = 0; i < n; i++) {
      if ((mask >> i) & 1) total += nums[i];    // is item i in this subset?
    }
    if (total === target) count++;
  }
  return count;
}

console.log(countSubsetsWithSum([1, 2, 3, 4], 5), countSubsetsWithSum([2, 2, 2], 4), countSubsetsWithSum([1, 2], 0));
```

Output:
```text
2 3 1
```

</details>

## Socratic checks and quiz (answers hidden)
**1. What does this print?**

```python
x, steps = 0b101100, 0
while x:
    x &= x - 1
    steps += 1
print(steps, 0b101100 & -0b101100)
```

```javascript
let x = 0b101100, steps = 0;
while (x) {
  x &= x - 1;
  steps++;
}
console.log(steps, 0b101100 & -0b101100);
```

- A. 3 4
- B. 6 4
- C. 3 2
- D. 2 8

<details><summary>Answer</summary>

3 4. 0b101100 is 44, with three 1 bits, so Kernighan's loop runs 3 times. 44 & −44 keeps only the lowest set bit, which is 4.

</details>

**2. What does this JavaScript print?**

```javascript
const x = 8;
console.log(x & (x - 1) === 0, (x & (x - 1)) === 0);
```

- A. 0 true
- B. true true
- C. false true
- D. 8 true

<details><summary>Answer</summary>

0 true. `===` binds tighter than `&`, so the first test is `8 & ((8 - 1) === 0)`, which is `8 & false`, which is 0. Only the second, fully parenthesised test is right. In Python, `&` binds tighter than `==`, so both forms would work there.

</details>

**3. Which expression clears the lowest set bit of x?**

- A. `x & (x - 1)`
- B. `x & -x`
- C. `x | (x + 1)`
- D. `x ^ (x >> 1)`

<details><summary>Answer</summary>

`x & (x - 1)`. x − 1 flips the lowest 1 and the 0s below it, and AND keeps everything above. `x & -x` *keeps* only the lowest set bit, and `x | (x + 1)` sets the lowest 0 bit.

</details>

**4. Which statements about JavaScript's bitwise operators are true? (choose 2)**

- A. They convert Number operands to 32-bit integers
- B. `>>>` returns an unsigned 32-bit value, so its result is never negative
- C. `1 << 31` is 2147483648
- D. You can mix BigInt and Number operands, as in `1n << 3`
- E. `~x` equals −x + 1

<details><summary>Answer</summary>

They convert Number operands to 32-bit integers, `>>>` returns an unsigned 32-bit value, so its result is never negative. `1 << 31` is −2147483648 because bit 31 is the sign. Mixing BigInt and Number throws a TypeError. `~x` is −x − 1.

</details>

**5. Judge each statement.**

- `x ^ x` is 0 for every integer x.
- In Python, `~5` is 4294967290.
- In Python, `(x & (x - 1)) == 0` on its own is a correct power-of-two test.
- Kernighan's loop (`x &= x - 1`) runs once per set bit of a non-negative x.

<details><summary>Answer</summary>

`x ^ x` is 0 for every integer x.: Yes; In Python, `~5` is 4294967290.: No; In Python, `(x & (x - 1)) == 0` on its own is a correct power-of-two test.: No; Kernighan's loop (`x &= x - 1`) runs once per set bit of a non-negative x.: Yes. XOR of equal values is 0. `~5` is −6, since Python has no 32-bit wrap. 0 passes that test, so you also need `x > 0`. Each step removes exactly one set bit.

</details>

**6. Put the steps for finding the two numbers that appear once, when every other number appears twice (LeetCode 260), in order.**

- (put the steps in order)

<details><summary>Answer</summary>

XOR every number: the pairs cancel, leaving a ^ b → Take the lowest set bit of a ^ b: a bit where a and b differ → Split the numbers into two groups by that bit → XOR each group on its own: one gives a, the other gives b. a ^ b isn't 0 because a ≠ b, so it has a set bit. Every pair lands in the same group and cancels, while a and b land in different groups.

</details>

**7. Complete the JavaScript that counts the set bits of every number from 0 to n.**

```
function countBits(n) {
  const bits = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) bits[i] = bits[i {{0}} 1] + (i {{1}} 1);
  return bits;
}

```

<details><summary>Answer</summary>

>> | &. i >> 1 drops the last bit, and that smaller number's count is already known; i & 1 adds the last bit back.

</details>

**8. Match each goal to its expression.**


<details><summary>Answer</summary>

Test bit i = `(x >> i) & 1`; Set bit i = `x | (1 << i)`; Clear bit i = `x & ~(1 << i)`; Toggle bit i = `x ^ (1 << i)`. OR turns a bit on, AND with the inverted mask turns it off, and XOR flips it.

</details>

## Traps & misconceptions
- **“`x & (x - 1) === 0` tests for a power of two in JavaScript.”** In JavaScript, `===` binds tighter than `&` (as `==` does in C and Java), so that's `x & ((x - 1) === 0)`. Write `(x & (x - 1)) === 0`. Python's precedence is the other way round, so the bug only bites in JS: put the parentheses in everywhere.
- **“Python's `~5` is a huge positive number, like in a 32-bit language.”** Python ints have no width, so `~x` is always −x − 1: `~5` is −6. JavaScript gives −6 too, because its 32-bit integers are signed. Unsigned values like 4294967290 appear only if you mask (`& 0xFFFFFFFF`) or use `>>> 0`.
- **“Shifting left can't change the sign.”** In JavaScript, `1 << 31` is −2147483648 and `1 << 32` is 1 (the shift count is taken mod 32). Python just keeps growing: `1 << 32` is 4294967296.
- **“Kernighan's loop works on any int.”** A negative Python int has infinitely many 1 bits, so `while x: x &= x - 1` never ends. Mask first (`x & 0xFFFFFFFF`) to look at the 32-bit pattern. In JavaScript the 32-bit conversion stops it after at most 32 steps.
- **“Bitwise operators are safe on any JavaScript number.”** They cut values to 32 bits: `2 ** 32 | 0` is 0 and `2 ** 40 >> 1` is 0. For bigger values use arithmetic (`Math.floor(x / 2)`) or BigInt (`1n << 40n`), and don't mix BigInt with Number.
- **“XOR finds the odd one out whatever the counts are.”** XOR cancels pairs only. If the other values appear three times, count each bit position mod 3 (LeetCode 137).

## Discussion prompts
- **Where do bit tricks show up in real code, not just interviews?**
  <details><summary>One good answer</summary>Permission and feature flags packed into one integer, bitsets and Bloom filters, hashing and checksums, compression, graphics, and IP subnet masks. Readable code hides them behind well-named helpers or constants (`READ | WRITE`) rather than bare numbers.</details>
- **Should you write `x & 1` instead of `x % 2` because it's faster?**
  <details><summary>One good answer</summary>Not for speed: compilers and JITs make both fast, so pick the clearer one. They also differ on negatives in JavaScript: `-3 % 2` is −1 but `-3 & 1` is 1. In Python, both give 1, because `%` takes the sign of the divisor.</details>

## Teach-back
**Prompt:** Explain to a junior colleague how XOR finds the one number that appears once when every other number appears twice, and when the trick stops working.

Rubric:
- [ ] x ^ x = 0 and x ^ 0 = x
- [ ] XOR is commutative and associative, so the order doesn't matter
- [ ] The pairs cancel, leaving the single number
- [ ] O(n) time and O(1) space
- [ ] Fails when the others appear three times; count the bits mod 3 instead

<details><summary>Model answer</summary>

XOR compares two numbers bit by bit and gives 1 where the bits differ. So any number XOR itself is 0, and any number XOR 0 is itself. XOR is also commutative and associative, so you can rearrange a long XOR chain freely: put each pair side by side, each pair becomes 0, and what's left is the single number. That's one pass with one variable: O(n) time and O(1) space. The trick depends on pairs. If the other numbers appear three times, a value XOR-ed three times is itself rather than 0, so instead you count how many numbers have each bit set and take that count mod 3.

</details>

## Quick Q&A (also in the SRS deck)
- **What does `x & (x - 1)` do?** Clears the lowest set bit of x. For x > 0, the result is 0 exactly when x is a power of two.
- **What does `x & -x` give?** Only the lowest set bit of x, e.g. 12 & −12 = 4.
- **Why does XOR-ing a list find the one unpaired number?** x ^ x = 0, x ^ 0 = x, and XOR ignores order, so every pair cancels.
- **How wide are JavaScript's bitwise operations?** 32-bit signed integers (`>>>` gives an unsigned result). Use BigInt for wider values.
- **How do you get JavaScript-style 32-bit behaviour in Python?** Mask with `& 0xFFFFFFFF`; if bit 31 is then set, subtract 2³² to get the signed value.
- **How do you count the set bits of every number from 0 to n in O(n)?** `bits[i] = bits[i >> 1] + (i & 1)`.

## Practice problems
- [ ] [LC 191 · Number of 1 Bits](https://leetcode.com/problems/number-of-1-bits/) · Easy · Kernighan's loop: x &= x − 1 until it's 0
- [ ] [LC 338 · Counting Bits](https://leetcode.com/problems/counting-bits/) · Easy · bits[i] = bits[i >> 1] + (i & 1)
- [ ] [LC 190 · Reverse Bits](https://leetcode.com/problems/reverse-bits/) · Easy · 32 times: shift the result left and add the lowest bit of n; in JS finish with >>> 0
- [ ] [LC 371 · Sum of Two Integers](https://leetcode.com/problems/sum-of-two-integers/) · Medium · XOR adds without carries, (a & b) << 1 is the carry; Python needs a 32-bit mask
- [ ] [LC 137 · Single Number II](https://leetcode.com/problems/single-number-ii/) · Medium · the worked example, from memory: count each bit mod 3
- [ ] [LC 260 · Single Number III](https://leetcode.com/problems/single-number-iii/) · Medium · XOR everything, then split by the lowest set bit of a ^ b
- [ ] [LC 201 · Bitwise AND of Numbers Range](https://leetcode.com/problems/bitwise-and-of-numbers-range/) · Medium · the common prefix of left and right: shift both until they match
- [ ] [LC 421 · Maximum XOR of Two Numbers in an Array](https://leetcode.com/problems/maximum-xor-of-two-numbers-in-an-array/) · Medium · a binary trie of the bits, greedy from the top bit (see Tries)

## Sources (accessed 2026-10-09)
- [MDN: Bitwise operators (JavaScript guide)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Expressions_and_operators#bitwise_operators)
- [MDN: Operator precedence](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence)
- [Python docs: Bitwise operations on integer types](https://docs.python.org/3/library/stdtypes.html#bitwise-operations-on-integer-types)
- [Sean Eron Anderson: Bit Twiddling Hacks](https://graphics.stanford.edu/~seander/bithacks.html)
- [cp-algorithms: Bit manipulation](https://cp-algorithms.com/algebra/bit-manipulation.html)
