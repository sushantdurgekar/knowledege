---
title: "Mini DS library + the 60-problem milestone"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l1, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Capstone: Mini DS library + the 60-problem milestone

> Data Structures & Algorithms L1 · about 900 min · modules m01, m02, m03, m05, m06, m08

Package your five lab structures into a small library in **both** Python and JavaScript, with tests and a Big-O table, and log 40 easy + 20 medium problems from the modules. This is your L1 evidence.

## Deliverables
- A repo with `python/` and `js/` folders: DynArray, LinkedList, Stack, RingQueue, HashMap.
- Tests: pytest for Python, `node:test` for JavaScript, covering empty, one-item and resize cases.
- README with a Big-O table (time and space for every operation) and two design decisions.
- A problems log (problem, pattern, time, space, what tripped you up) with 40 easy + 20 medium.

## Steps
1. Create the repo and copy in your lab solutions; give both languages the same API names.
2. Write the tests first for anything not tested yet (pop on empty, wrap-around, resize).
3. Fill in the README Big-O table and the two design decisions (e.g. why ×2, why chaining).
4. Work through each module's practice problems; log each one the same day.
5. Ask for a review (a friend or Claude) and fix what it finds.

## Rubric
- All tests pass in both languages; edge cases (empty, one item, full) are covered.
- Every public method has a correct Big-O in the README.
- Resizing is geometric (×2) and the amortised cost is explained.
- The problems log names a pattern for every problem.
- Code is readable: clear names, no copy-pasted blocks.

## Stretch goals
- Add a `MinStack` (push, pop, min all O(1)) and a `Deque` on a ring buffer.
- Make the hash map iterable in insertion order, like Python's dict and JavaScript's Map.
- Benchmark your HashMap against the built-in and explain the gap.
