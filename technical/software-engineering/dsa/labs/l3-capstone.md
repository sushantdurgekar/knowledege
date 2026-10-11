---
title: "Algorithm library + the 89-problem log"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l3, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Capstone: Algorithm library + the 89-problem log

> Data Structures & Algorithms L3 · about 900 min · modules m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12

Turn your six labs into one tested algorithm library in **both** Python and JavaScript, with the same API in each, a Big-O table and a page of L3 templates you can type from memory. Alongside it, solve and log the 89 module problems, and review six virtual contests and four timed mock interviews. This is your L3 evidence.

## Deliverables
- A repo with `python/` and `js/` folders: the six labs as one library (shortest paths, low-link and Euler paths, interval and bitmask DP, rerooting, Fenwick and lazy segment trees, string search and modular arithmetic), with the same API names in both languages (snake_case and camelCase).
- Tests (pytest and `node:test`) that check every routine against a brute force on random inputs, plus the hard cases: a 100,000-vertex path, a reachable and an unreachable negative cycle, an empty pattern, and products past 2⁵³.
- A README with a Big-O table (time and space for every routine, with the variables named) and TEMPLATES.md for the L3 templates: Dijkstra, 0-1 BFS, Bellman–Ford, Floyd–Warshall, low-link, Hierholzer, interval DP, bitmask DP, rerooting, Fenwick tree, lazy segment tree, prefix function, Z-function and fast power, each under 20 lines per language (the lazy segment tree may take 40).
- A problem log for the 89 module problems (problem, technique, the idea that unlocked it, time, space, what tripped you up), six virtual-contest reviews and four mock-interview reviews.

## Steps
1. Create the repo and move in your six lab solutions, one file per topic, with the same API names in both languages.
2. Turn each lab's checks into pytest and `node:test` files: brute force on random inputs, the edge cases (empty, one element, disconnected, unreachable) and the 100,000-node inputs.
3. Write the README's Big-O table and TEMPLATES.md, then retype each template from a blank file once a week until it comes out right first time.
4. Work through the 89 module problems topic by topic, and log each one the same day with the technique that unlocked it.
5. From module 04 on, do a 90-minute virtual contest every two weeks and upsolve the first problem you couldn't finish; once a month, do a 60-minute mock interview (the Interview tab, or the tutor in Examiner mode). Write a five-line review after each.

## Rubric
- All tests pass in both languages, including the random brute-force checks and the 100,000-node inputs.
- Every routine in the README has its time and space complexity, with amortised and expected costs marked as such.
- You can type each template from a blank file in under 5 minutes (the lazy segment tree in under 10).
- The problem log names a technique and the key idea for each of the 89 problems, and every contest and mock review says what to fix next.
- The code reads cleanly: matching names in both languages, no recursion that could pass 1,000 levels, nothing copy-pasted.

## Stretch goals
- Benchmark your lazy-deletion Dijkstra against a version with an indexed heap and decrease-key, on large sparse and dense random graphs, and explain the result.
- Add a merge-sort tree (count the values ≤ x in a range in O(log² n)) or a persistent segment tree (query any earlier version of the array after O(log n) new nodes per update).
- Preview L4: build a suffix array by prefix doubling in O(n log² n) with Kasai's LCP array, and use it to count the distinct substrings of a string.
