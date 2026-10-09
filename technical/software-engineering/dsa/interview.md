---
title: "Data Structures & Algorithms: interview questions"
track: technical
subject: dsa
created: 2026-10-08
updated: 2026-10-09
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

## L2 Proficient (2026-10-09)

### How do you approach a binary-tree problem?
_Trees_

I decide what each recursive call should return for its subtree (a height, a sum, a pair of values) and what it needs from its children. The code is then: handle the empty tree, recurse left and right, combine. That's O(n) time and O(h) stack space, where h is the height: about log n if the tree is balanced and n if it's a chain. For very deep trees in Python I switch to an iterative version with an explicit stack.

Follow-ups: How would you find the diameter of a tree? · When does a helper need to return two values?

### DFS or BFS on a tree: when do you use each?
_Trees_

DFS goes deep first (pre-, in- or post-order) with recursion or a stack; BFS visits level by level with a queue. I use BFS when the question is about levels or the nearest node (level order, right-side view, minimum depth) and DFS for most other things: path sums, subtree properties, validating a BST. Both are O(n) time; DFS uses O(h) memory and BFS uses O(width).

### How do you validate a binary search tree?
_Trees_

Comparing each node with its children isn't enough: a value deep in the left subtree must still be less than the root. I pass down a (low, high) range: the root gets (−∞, +∞); going left, the node's value becomes the upper bound, and going right, the lower bound. Any node outside its range fails. Another way: an inorder traversal must be strictly increasing. Both are O(n) time and O(h) space.

Follow-ups: What changes if duplicates are allowed?

### When would you use a heap, and how do you get the k largest items?
_Heaps & tries_

A heap gives O(1) access to the smallest (or largest) item and O(log n) push and pop, so it fits “repeatedly take the best next item”: scheduling, merging k sorted lists, Dijkstra, running medians. For the k largest of n items I keep a min-heap of size k, pushing each item and popping when the size passes k: O(n log k) time and O(k) space, better than sorting when k is small. Python has heapq (a min-heap); JavaScript has no built-in heap, so I say that up front and write a small one.

Follow-ups: How would you keep a running median?

### What is a trie, and when is it better than a hash set?
_Heaps & tries_

A trie stores strings character by character in a tree, so words with the same prefix share nodes. Insert and lookup cost O(length of the word). A hash set is just as fast for whole words, but a trie also answers prefix questions, like which words start with “car”, without scanning everything. That's why it's used for autocomplete and Word Search II. The cost is memory: lots of small nodes.

### How do you represent a graph, and why does the choice matter?
_Graphs_

Usually as an adjacency list: a map from each node to its neighbours, O(V + E) memory, so looping over a node's neighbours costs only as many steps as it has neighbours. An adjacency matrix takes O(V²) memory but answers “is there an edge?” in O(1), which suits small dense graphs. In interviews the graph is often implicit, like a grid whose neighbours are the four adjacent cells, and then I don't build anything at all.

### Explain topological sort and how it detects a cycle.
_Graphs_

A topological order lists the nodes of a directed graph so that every edge points forward; one exists only if there's no cycle. With Kahn's algorithm I count in-degrees and queue every node with in-degree 0. Each time I pop a node, I decrement its neighbours' in-degrees and queue any that reach 0. If fewer than V nodes come out, the graph has a cycle: every leftover node is on a cycle or depends on one. It's O(V + E); Course Schedule is the classic problem.

Follow-ups: How would you do it with DFS instead?

### Union-find or BFS/DFS for connectivity: how do you choose?
_Graphs_

If the graph is fixed and I need the components once, BFS or DFS is simple: O(V + E). If edges arrive over time and I'm asked about connectivity in between, union-find is better: each union and find is nearly O(1) amortised with path compression and union by size. Union-find also detects a cycle in an undirected graph (a union that fails) and powers Kruskal's minimum spanning tree. It can't easily handle deleting edges.

### How do you recognise a backtracking problem, and how do you keep it fast enough?
_Backtracking & DP_

The question asks for all (or any) combinations, subsets, permutations or placements, and the input is small: n up to about 20 for subsets, about 10 for permutations. The template is choose, explore, un-choose. To keep it fast I prune early (stop when a partial answer can't work, like a sum that's already too big or a clash on the board), sort to skip duplicates, and count the output size so I can state the complexity, like O(n · 2ⁿ) for subsets.

### How do you get from a brute-force recursion to dynamic programming?
_Backtracking & DP_

I write the recursion first and name its state: the arguments that change between calls. If the same states repeat, I add a cache keyed by the state; that's top-down DP. If I want, I then turn it into a table filled in an order where each state's dependencies come first (bottom-up), and shrink the memory to the rows the recurrence actually reads. The time is the number of states times the work per state.

### Walk me through coin change (the fewest coins).
_Backtracking & DP_

dp[a] is the fewest coins that make amount a; dp[0] = 0 and every other entry starts at infinity. For each amount from 1 up, I try each coin c ≤ a: dp[a] = min(dp[a], dp[a − c] + 1). The answer is dp[amount], or −1 if it's still infinity. That's O(amount × coins) time and O(amount) space. Greedy (the largest coin first) fails for coins like {1, 3, 4} and amount 6, where 3 + 3 beats 4 + 1 + 1.

Follow-ups: How do you count the number of ways instead?

### What's the longest common subsequence recurrence?
_Backtracking & DP_

dp[i][j] is the LCS length of the first i characters of s and the first j of t. If s[i − 1] equals t[j − 1], dp[i][j] = dp[i − 1][j − 1] + 1; otherwise it's the larger of dp[i − 1][j] and dp[i][j − 1]. Empty prefixes give 0. That's O(m × n) time, and the memory drops to two rows if I only need the length, not the subsequence itself.

### How do you know a greedy algorithm is correct?
_Greedy & bits_

First I try to break it with tiny inputs; a counterexample sends me to DP. If I can't break it, I make an exchange argument: take any optimal solution, swap one of its choices for the greedy choice, and show the result is still valid and no worse. For interval scheduling, the interval that ends earliest can always replace the first interval of an optimal schedule.

### Which bit tricks should you know, and what's different in JavaScript?
_Greedy & bits_

x & (x − 1) clears the lowest set bit (with x > 0, a result of 0 means a power of two), x & −x keeps only that bit, XOR cancels pairs (the single-number problem), and the masks 0 to 2ⁿ − 1 list every subset. In JavaScript, bitwise operators work on 32-bit signed integers, so 1 << 31 is negative, and === binds tighter than &, so I always add parentheses. Python ints are unbounded, so I mask with 0xFFFFFFFF when a problem assumes 32 bits.

### You can tell a problem needs DP but you can't see the recurrence. What do you do?
_Interview technique_

I say so, then write the brute-force recursion: what choice do I make at each step, and what's left afterwards? The arguments of that recursion are the state. I draw the call tree for a small input to show the repeated calls, add memoisation, and only then think about a table. Interviewers give credit for a correct memoised solution, and the table version often follows quickly.

### Tell me about a time a choice of data structure made a real difference.
_Behavioural (STAR)_

Use STAR. Situation: the feature and the problem (slow lookups, a growing backlog, an ordering bug). Task: the target, such as under 100 ms. Action: how you measured it, which structure you chose (a heap, a trie, union-find, a graph traversal) and why, and the tests you wrote. Result: the before and after numbers. If you're new, use a lab from this hub, like the autocomplete trie or the graph toolkit.
