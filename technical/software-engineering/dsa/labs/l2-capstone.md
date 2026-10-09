---
title: "Pattern library + the 150-problem milestone"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l2, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Capstone: Pattern library + the 150-problem milestone

> Data Structures & Algorithms L2 · about 900 min · modules m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12

Turn your six labs into one small pattern library in **both** Python and JavaScript, with tests, a Big-O table and a page of templates you can type from memory. Alongside it, finish the NeetCode 150 with a pattern logged for every problem, and do four timed mock interviews. This is your L2 evidence.

## Deliverables
- A repo with `python/` and `js/` folders: tree helpers, MinHeap, Trie, graph routines (BFS path, components, topological order), DSU and the DP examples.
- Tests (pytest and `node:test`) for empty inputs, one element, cycles, disconnected graphs and 10,000-deep chains.
- A TEMPLATES.md page: tree recursion, BFS, iterative DFS, Kahn's algorithm, DSU, backtracking, a DP table, interval greedy and the bit recipes, each under 15 lines per language.
- A problem log for the NeetCode 150 (problem, pattern, time, space, what tripped you up) and four short mock-interview reviews.

## Steps
1. Create the repo and copy in your lab solutions, with the same API names in both languages.
2. Add the deep-input tests and remove any recursion that could reach 10,000 levels.
3. Write TEMPLATES.md, then retype each template from a blank file once a week until it's automatic.
4. Work through the NeetCode 150 by pattern and log each problem the same day.
5. Every two weeks, run a 45-minute mock interview (the Interview tab, or the tutor in Examiner mode) and write a five-line review.

## Rubric
- All tests pass in both languages, including the deep-input cases.
- Every routine has its time and space complexity in the README.
- You can type each template from a blank file in under 5 minutes.
- The problem log names a pattern for every problem, and each mock review says what to fix next.
- The code is readable: clear names, small functions, nothing copy-pasted.

## Stretch goals
- Add Dijkstra's shortest paths using your MinHeap (a preview of L3).
- Make the trie keep the top 3 suggestions at every node, and measure insert and suggest times.
- Benchmark your MinHeap against Python's heapq and explain the gap.
