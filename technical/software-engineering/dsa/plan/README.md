---
title: "Data Structures & Algorithms: L1–L4 learning plan"
track: technical
domain: software-engineering
subject: dsa
tags: [dsa, plan, levels]
status: in-progress
created: 2026-10-08
updated: 2026-10-09
---
# Data Structures & Algorithms: L1–L4 learning plan

> Problem-solving from Big-O and arrays to graphs, dynamic programming and contest-level algorithms.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Each hub build re-verifies facts first.
>
> **L1 hub built 2026-10-09:** [open the hub](https://claude.ai/artifact/SWv6N1Uh2oiFNH1mxefcNr) · saved copy `../hubs/dsa-l1-foundation-hub.html` · 8 modules, every example in Python and JavaScript · deck `dsa-l1` (parked).

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Analyse complexity and solve easy problems with arrays, hashing, two pointers, stacks, queues and binary search. | 50–70 | No widely recognised certification; milestone = 40 easy + 20 medium problems | Mini DS library | `hubs/dsa-l1-foundation-hub.html` (#8) |
| **L2 Proficient** | Solve medium interview problems with trees, heaps, graphs, backtracking and core DP. | 120–150 | None; milestone = 150 curated problems + mock interviews | Interview-ready set | `hubs/dsa-l2-proficient-hub.html` (#20) |
| **L3 Specialist** | Handle hard problems: advanced DP, shortest paths, range queries, strings and number theory; reach a solid contest rating. | 120–150 | None; milestone = 89 hard problems + 6 virtual contests + 4 mock interviews | Contest track | `hubs/dsa-l3-specialist-hub.html` (#33) |
| **L4 Expert** | Master advanced algorithms and teach problem-solving to others. | 150–200 | None; milestone = Codeforces 1900+ or equivalent | Problem-setter pack | `hubs/dsa-l4-expert-hub.html` (#46) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: The toy room and the treasure-map road trip

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Egg cartons (arrays), a treasure hunt of clues (linked lists), a pancake stack (stack), the playground slide queue (queue), the family tree, a road map for the car trip (graphs), sticky notes (memoisation).

- An **array** is an egg carton: slot 4 is always in the same place, so you reach it instantly.
- A **linked list** is a treasure hunt: each clue tells you where the next one is.
- **Binary search** is guessing a number from 1 to 100: 'higher or lower?' halves the options each time.
- **BFS** is ripples in a pond: first every town 1 hour away, then every town 2 hours away.
- **Dynamic programming** is writing answers on sticky notes so you never count the same apples twice.

## Folded into this plan

- `software-engineering/competitive-programming (maths and game-theory courses → L3/L4)`

Their course files stay where they are; this plan points at them, so nothing is studied twice.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `docs/dsa-ultimate-reference.xlsx and docs/dsa-complete-reference.xlsx` | two overlapping reference sheets; use the audited `-verified.xlsx` copies | L1–L4 |
| `../competitive-programming/courses/udemy-cp-maths-puzzles-1` | Euclid, sieve, modular arithmetic, Gaussian elimination | L3 |
| `../competitive-programming/courses/udemy-cp-game-theory` | Nim and variants | L3–L4 |
| `../full-stack/courses/full-stack-roadmap (dsa/ folders)` | practice tasks (work repo, reference only) | L1–L3 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- Complexity analysis (Big-O)
- Core data structures and algorithm patterns
- Competitive-programming maths and game theory
- Coding-interview technique

**This subject links to, but does not re-teach:**
- Python language features → `python`
- System-level scaling → `system-design`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| (no widely recognised DSA certification) | — | none | Use milestones instead: curated problem lists, timed mock interviews, contest ratings (Codeforces/AtCoder/LeetCode). | — |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Audit of the existing sheets (completed 2026-10-08)

All links in both DSA workbooks were opened one by one ([full report](../../../../_meta/hub-program/link-audit/audit-report.md)):

- **dsa-ultimate:** 113 removed, 111 updated, 82 relabelled, 274 kept as is. **dsa-complete:** 129 removed, 138 updated, 97 relabelled, 330 kept.
- Dead GitHub paths in TheAlgorithms/Python and trekhleb were re-pointed to the real files (26 fixes, checked against the repo trees). Invented repos were removed.
- **LeetCode:** all 474 problem references were checked against LeetCode's own list. One wrong number was fixed (*Largest Component Size by Common Factor* is #952, not #2513).
- Cleaned copies: `docs/dsa-ultimate-reference-verified.xlsx` and `docs/dsa-complete-reference-verified.xlsx`, each with an **Audit** sheet. Use *complete* as the topic index and *ultimate* for its larger problem lists.
- Complexity claims in the sheets are re-checked topic by topic as concept notes are written.

## Build checklist (one hub per session)

- [x] **#8 Data Structures & Algorithms L1 Foundation hub** → `hubs/dsa-l1-foundation-hub.html`
  - [x] re-verify versions, cert facts and links · audit existing material for L1
  - [x] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [x] hub published + saved · independent fact/answer-key check · SRS deck `dsa-l1`
  - [x] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [x] **#20 Data Structures & Algorithms L2 Proficient hub** → `hubs/dsa-l2-proficient-hub.html`
  - [x] re-verify versions, cert facts and links · audit existing material for L2
  - [x] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [x] hub published + saved · independent fact/answer-key check · SRS deck `dsa-l2`
  - [x] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [x] **#33 Data Structures & Algorithms L3 Specialist hub** → `hubs/dsa-l3-specialist-hub.html`
  - [x] re-verify versions, cert facts and links · audit existing material for L3
  - [x] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [x] hub published + saved · independent fact/answer-key check · SRS deck `dsa-l3`
  - [x] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [x] **#46 Data Structures & Algorithms L4 Expert hub** → `hubs/dsa-l4-expert-hub.html`
  - [x] re-verify versions, cert facts and links · audit existing material for L4
  - [x] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [x] hub published + saved · fact/answer-key self-check (fresh-agent review still to do) · SRS deck `dsa-l4`
  - [x] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #8 (Data Structures & Algorithms L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
