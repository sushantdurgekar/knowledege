---
title: "Data Structures & Algorithms: interview questions"
track: technical
subject: dsa
created: 2026-10-08
updated: 2026-10-08
---
# Data Structures & Algorithms: interview questions

Sections are added by each hub level. Newest build replaces its own level's section.

## L1 Foundation (2026-10-09)

### What is Big-O and why do interviewers care about it?
_Complexity_

Big-O describes how an algorithm's running time or memory grows as the input grows, ignoring constant factors and smaller terms. Interviewers care because it predicts whether a solution survives real input sizes: an O(n²) solution that's instant on 100 items can take hours on a million. I give time and space for every solution and say which part dominates.

Follow-ups: What's the difference between O, Θ and Ω? · What's the complexity of appending to a Python list?

### Explain amortised O(1) with the dynamic array example.
_Complexity_

A dynamic array grows its capacity by a constant factor (say ×2) when it's full. Most appends just write into a free slot (O(1)); a few trigger a copy of everything (O(n)). With doubling, the total copying over n appends is less than 2n (any constant factor gives a similar bound), so the average cost per append is constant. That's amortised O(1): a guarantee about the average over a sequence, not about every single call.

Follow-ups: What happens if you grow by a fixed amount instead?

### How do you use the input constraints to choose an approach?
_Complexity_

I estimate the work allowed: roughly 10⁸ simple operations per second in a compiled language, far fewer in Python. With n up to 10⁵, O(n²) is about 10¹⁰ operations, too slow, so I aim for O(n log n) or O(n). With n up to 20, even O(2ⁿ) is fine. The constraint often tells you the intended pattern.

### Walk me through Two Sum and its trade-offs.
_Arrays & hashing_

Brute force checks every pair: O(n²) time, O(1) space. Better: one pass with a hash map from value to index. For each number I check whether target − number is already in the map; if so I return both indices, otherwise I store the number. That's O(n) time and O(n) space. If the array were sorted, two pointers would give O(n) time and O(1) space.

Follow-ups: What if there can be several valid pairs? · What if the array is too big for memory?

### When would you use a hash set versus sorting to find duplicates?
_Arrays & hashing_

A hash set finds duplicates in one pass: O(n) time but O(n) extra memory. Sorting first costs O(n log n) time, and then duplicates sit next to each other; an in-place sort such as heapsort needs only O(1) extra memory (Python's and JavaScript's built-in sorts can use up to O(n), still usually less than a set). If memory is tight, or the data must end up sorted anyway, sorting wins; otherwise the set is faster and simpler.

### What is a prefix sum and when do you use one?
_Arrays & hashing_

prefix[i] holds the sum of the first i elements, built in one O(n) pass. The sum of any range i..j is then prefix[j+1] − prefix[i] in O(1). I use it when there are many range-sum queries, or combined with a hash map to count subarrays that add up to k.

### How do you recognise a sliding-window problem?
_Pointers & windows_

The question asks about a contiguous subarray or substring (longest, shortest, number of) with a condition that can be updated as you add one element on the right and remove one on the left. Fixed windows move both ends together; variable windows grow the right end and shrink the left end until the condition holds again. Each element enters and leaves once, so it's O(n).

Follow-ups: Why doesn't sliding window work for 'subarray sum equals k' with negative numbers?

### Two pointers versus a hash map: how do you choose?
_Pointers & windows_

Two pointers need structure, usually sorted data, so moving a pointer has a predictable effect on the sum or condition. They use O(1) space. A hash map works on unsorted data and gives O(n) time but O(n) space. If the input is sorted or I can afford to sort, two pointers; if I must keep original indices or can't sort, a hash map.

### Give two problems where a stack is the natural tool, and why.
_Stacks, queues & lists_

Balanced brackets, because the most recent opening bracket must close first; and 'next greater element', where a monotonic stack keeps the items still waiting for a bigger value. Both rely on last in, first out, and both run in O(n) because every item is pushed and popped at most once.

### Why is list.pop(0) a bad queue in Python, and what do you use instead?
_Stacks, queues & lists_

pop(0) removes the first element and shifts every other element left, which is O(n), so a loop of n dequeues becomes O(n²). collections.deque gives O(1) appends and pops at both ends. In JavaScript, shift() has the same problem on large arrays, so I keep a head index or use a ring buffer.

### How do you reverse a linked list, and what can go wrong?
_Stacks, queues & lists_

Walk the list with three references: prev, current and next. Save next, point current.next back to prev, then move prev and current forward. It's O(n) time and O(1) space. The classic bug is overwriting current.next before saving it, which loses the rest of the list.

### How does Floyd's cycle detection work?
_Stacks, queues & lists_

A slow pointer moves one step and a fast pointer two. If there's no cycle, fast reaches the end. If there is a cycle, fast enters it first and gains one step per move on slow, so they must meet inside the cycle. O(n) time, O(1) space, versus O(n) space for a visited set.

### What happens in memory when a recursive function runs?
_Recursion & sorting_

Each call gets a stack frame with its own arguments and local variables, pushed on the call stack. Frames unwind as calls return. Recursion depth therefore costs O(depth) space, and a missing or unreachable base case overflows the stack (Python's default recursion limit is 1,000).

### Merge sort or quick sort: which would you pick and why?
_Recursion & sorting_

Merge sort guarantees O(n log n) and is stable, but needs O(n) extra space. Quick sort is usually faster in practice and sorts in place (O(log n) stack on average), but has an O(n²) worst case; random or median-of-three pivots make that very unlikely, not impossible. In real code I use the language's built-in sort: stable in both languages, and O(n log n) in CPython and V8 (the JavaScript spec doesn't promise a complexity).

### What is 'binary search on the answer'?
_Recursion & sorting_

When the question asks for the smallest (or largest) value that satisfies a condition, and the condition is monotonic (if speed 5 works, speed 6 also works), I binary search over possible answers instead of over an array. Each step runs a check, often O(n), so the total is O(n log range). Koko Eating Bananas is the classic.

### You're stuck on a problem in an interview. What do you do?
_Interview technique_

I say what I know out loud: restate the problem, work a small example, and give the brute force with its complexity. Then I look for the repeated work and ask which tool removes it: a hash map, two pointers, a stack, sorting or binary search. Interviewers often give hints when they can see the reasoning.

### Tell me about a time you improved the performance of some code.
_Behavioural (STAR)_

Use STAR. Situation: what was slow and who noticed. Task: your goal (for example, under one second). Action: how you measured it, found the O(n²) part (a nested loop or a list used for lookups) and replaced it (hash map, sorting, a better algorithm), with tests. Result: the before/after numbers. If you're new, use a lab from this hub, such as the stopwatch lab.
