---
title: "Data Structures & Algorithms: interview questions"
track: technical
subject: dsa
created: 2026-10-08
updated: 2026-10-11
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

## L3 Specialist (2026-10-09)

### Explain Dijkstra's algorithm and why it fails with negative edges.
_Shortest paths_

Dijkstra keeps tentative distances and a min-heap of (distance, vertex). It repeatedly pops the closest unfinished vertex, which is now final, and relaxes its edges, pushing any improved distance. With a binary heap and lazy deletion (skip popped entries whose distance is out of date) it takes O((V + E) log V) time and O(V + E) space. It relies on one fact: once the closest vertex is popped, no later path to it can be shorter. That holds only when weights are non-negative; a negative edge found later could lower a distance that's already final. With negative edges I use Bellman–Ford instead.

Follow-ups: How would you return the path itself? · When is 0-1 BFS better?

### When would you use Bellman–Ford or Floyd–Warshall instead of Dijkstra?
_Shortest paths_

Bellman–Ford handles negative edges and detects negative cycles: relax every edge V − 1 times, and if a V-th round still improves something, a negative cycle is reachable. It's O(V · E). Running only k rounds, each reading a copy of the previous round's distances, also solves “at most k edges” problems like Cheapest Flights Within K Stops. Floyd–Warshall gives all-pairs distances in O(V³) time and O(V²) space with three nested loops, the intermediate vertex outermost. It suits a few hundred vertices when I need every pair, or a transitive closure.

### How do you adapt Dijkstra to minimise the largest single step instead of the total?
_Shortest paths_

I change how a path's cost combines: extending a path costs max(current cost, edge weight) instead of current + weight. Dijkstra still works, because the cost never decreases as a path grows. Path With Minimum Effort and Swim in Rising Water are this “bottleneck” version. Alternatives are binary search on the answer with a BFS check, or union-find adding edges in increasing order until the two ends connect.

### What's the cut property, and how do Kruskal's and Prim's algorithms use it?
_Graph structure_

For any split of the vertices into two groups, a lightest edge crossing the split belongs to some minimum spanning tree. Kruskal sorts all the edges and adds each one that joins two different components, checked with union-find: O(E log E). Prim grows one tree from a start vertex, always adding the cheapest edge leaving it, using a min-heap: O(E log V), or a simple O(V²) array version for dense graphs. Both are greedy algorithms, and the cut property is what proves them correct.

### How do you find bridges, and why does the iterative version matter in Python?
_Graph structure_

One DFS records each vertex's discovery time tin and its low-link value: the smallest tin its subtree can reach with one back edge. A tree edge u → v is a bridge when low[v] > tin[u], because nothing below v can get back to u or above without it. To handle repeated edges between the same two vertices, I skip only the edge I arrived by (by its id), not every edge to the parent. It's O(V + E). A recursive DFS on a 10⁵-vertex path passes Python's 1,000-frame limit, so I keep an explicit stack of (vertex, next-edge index).

### How do you recognise an interval DP, and in what order do you fill it?
_Advanced DP_

The answer for a range i..j comes from splitting it at some k, or from peeling off its ends: palindromes, burst balloons, merging stones, triangulating a polygon. The state is dp[i][j], and the transition tries every split in between, so it's usually O(n³) time and O(n²) space. The table must be filled by increasing length, because each interval depends only on shorter intervals inside it. For burst balloons, the trick is to choose the *last* balloon to burst in the range, which makes the two sides independent.

### When is bitmask DP the right tool?
_Advanced DP_

When the state must remember which items of a small set are used, with n up to about 20: assignments, the travelling salesman problem, covering problems. The state is a mask, often with an extra index such as the last city, so Held–Karp TSP is O(2ⁿ · n²) time and O(2ⁿ · n) space instead of O(n!). Enumerating every submask of every mask costs 3ⁿ. With 2²⁰ masks I keep the tables in flat lists in Python and typed arrays in JavaScript.

### Explain rerooting with an example.
_Advanced DP_

Some tree problems ask for an answer with every node as the root, like the sum of distances from each node. Running a DFS from every node is O(n²). Instead, I compute the answer for root 0 with one DFS that also stores subtree sizes, then move the root across each edge: when the root moves from u to its child v, the size[v] nodes under v get one step closer and the other n − size[v] get one step further, so ans[v] = ans[u] − size[v] + (n − size[v]). That's two passes, O(n) in total, and in Python I do both iteratively with a precomputed DFS order.

### What is digit DP?
_Advanced DP_

A way to count the numbers up to N with some digit property: no two consecutive 1s in binary, how many 1 digits, only allowed digits. I walk N's digits from the most significant, with a state like (position, tight, extra information), where tight means the prefix so far equals N's prefix, so the next digit can't exceed N's digit at that position. Memoising the states makes the cost about digits × states × 10, tiny compared with looping to N.

### Fenwick tree or segment tree: how do you choose?
_Range queries_

A Fenwick tree does point updates and prefix queries for sums (or anything you can subtract) in O(log n) with about ten lines of code and n + 1 array slots. A segment tree is more general: any associative operation (min, max, gcd, sum), range updates through lazy propagation, and searching for the first position that meets a condition, all in O(log n), at the cost of more code and up to 4n nodes. Sums with point updates: Fenwick. Range min or max with updates, or range assignment: segment tree.

### How does lazy propagation work?
_Range queries_

When an update covers a node's whole range, I apply it to that node's stored value and leave a pending tag, like “add 5”, instead of updating every node below. Whenever a later operation needs to go below that node, it first pushes the tag down to the two children. Each update or query then touches O(log n) nodes, so range add with range sum or range max costs O(log n) per operation.

### How would you count, for each element, how many smaller elements come after it?
_Range queries_

I go through the array from the right, keeping a Fenwick tree over the values seen so far. For each element, the number of smaller values already seen is a prefix sum up to its value minus one; then I add the element. Values can be large or negative, so I first compress them to ranks 1..m by sorting the distinct values. That's O(n log n) time and O(n) space. A merge sort that counts how many right-half elements move past each left element works too.

### Explain the KMP prefix function and one use beyond searching.
_Strings & maths_

π[i] is the length of the longest proper prefix of s[0..i] that is also a suffix of it. It's computed in O(n) by reusing earlier values: on a mismatch I fall back to π[k − 1] instead of starting over. Searching for p in t is the prefix function of p + “#” + t, where every position whose value equals len(p) ends a match: O(n + m) in total. Beyond searching, n − π[n − 1] gives the shortest period of a string, which answers Repeated Substring Pattern, and the prefix function of s + “#” + reverse(s) gives the longest palindromic prefix, which solves Shortest Palindrome.

### How do you compute a^b mod m and a modular inverse, and what changes in JavaScript?
_Strings & maths_

Fast exponentiation squares the base and halves the exponent, so it needs O(log b) multiplications. When m is prime, Fermat's little theorem gives the inverse as a^(m − 2) mod m; otherwise I use the extended Euclidean algorithm. Python has both built in: pow(a, b, m) and pow(a, -1, m). In JavaScript, a product of two numbers near 10⁹ is about 10¹⁸, beyond 2⁵³, so it silently loses precision; I do the multiplication in BigInt (or split it into halves) and convert back.

### How do you approach a hard problem you haven't seen before?
_Problem-solving technique_

I read the constraints first, because they hint at the intended complexity: n ≤ 20 suggests bitmasks, n ≤ 500 an O(n³) DP, n ≤ 10⁵ with updates a tree structure. Then I look for the L2 pattern underneath: a graph with weights, a DP whose state needs one more piece of information, a range query. I write a brute force for small inputs, both to understand the problem and to test my real solution against it on random cases. In an interview I explain the reduction and the complexity before I start coding.

### Tell me about a time you made something much faster with a better algorithm.
_Behavioural (STAR)_

Use STAR. Situation: what was slow, how slow, and who noticed. Task: the target. Action: how you measured it, the complexity you found (an O(n²) scan, a shortest-path search repeated for every request), the algorithm or structure you replaced it with (a heap, a Fenwick tree, precomputation) and how you tested it against the old version. Result: the before and after numbers. If you're new, use a lab from this hub, like the shortest-path toolkit or the range-query lab.
