---
title: "Expert library, a problem you set, and the contest log"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, l4, lab]
status: new
created: 2026-10-09
updated: 2026-10-09
---
# Capstone: Expert library, a problem you set, and the contest log

> Data Structures & Algorithms L4 · about 900 min · modules m01, m02, m03, m04, m05, m06, m07, m08, m09, m10

Turn the five labs and the module templates into one tested contest library in **both** Python and JavaScript, set and stress-test one original problem with a full problem package, and keep the problem and contest log that proves L4.

## Deliverables
- A repo with `python/` and `js/` folders: the five labs plus the module templates (Dinic, Hungarian, min-cost flow, binary lifting, suffix array, sparse table, Li Chao tree, monotone convex hull trick, matrix power, SOS DP), with the same API names in both languages.
- A stress test for every routine: a brute force, a seeded generator (the mulberry32 helper from module 10, so both languages see the same tests) and a comparison loop, plus edge-case and extreme-value tests.
- One original problem: statement, constraints, model solution, brute force, validator, generator, at least 20 tests (edge, random, anti-heuristic and maximum size) and a one-page editorial with a proof sketch and the complexity.
- A log of the module problems (about 70) with the technique, the proof idea and any mistake for each, and five-line reviews of 8 contests.

## Steps
1. Create the repo and move in your five lab solutions, one file per topic, with matching names in both languages.
2. Add the remaining module templates, each with a stress test against its brute force and a large-input test.
3. Set your problem: write the statement and constraints first, then the brute force, the model solution, the validator and the generator; build the tests and run every plausible wrong idea against them.
4. Write the editorial, then ask someone (or a fresh chat) to solve your problem from the statement alone and note where they got stuck.
5. Keep the problem log and the contest reviews as you go, and finish with the L4 write-up: your technique map from L1 to L4 and the five problems that taught you most.

## Rubric
- Every routine passes its stress test in both languages, including the large inputs (10⁵ vertices, 2 × 10⁵ queries) with no recursion errors.
- Every routine in the README states its time and space complexity, with amortised and expected costs marked.
- Your problem's model solution and brute force agree on every small test, the validator accepts every test file, and at least two plausible wrong solutions fail your tests.
- You can type Dinic, Kuhn, binary lifting, the suffix array with Kasai, and the monotone chain from a blank file in under 10 minutes each.
- You can explain any one technique to an L2 learner in five minutes: the idea, an example, why it's correct and what it costs.

## Stretch goals
- Replace the O(n log² n) suffix array with the O(n log n) radix-sort version, or SA-IS, and benchmark them on 10⁶ characters.
- Add Hopcroft–Karp, or Dinic on the unit network, and compare it with Kuhn on a dense 10⁴ × 10⁴ bipartite graph.
- Publish your problem on Codeforces Gym or Polygon and collect feedback from real solvers.
