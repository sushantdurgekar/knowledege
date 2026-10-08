---
title: "SQL & Databases: L1–L4 learning plan"
track: technical
domain: databases
subject: sql
tags: [sql, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# SQL & Databases: L1–L4 learning plan

> Query, model, tune and run relational databases, from SELECT to internals and AI-enabled SQL.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Answer business questions with correct SELECT queries over joined tables, and create simple tables safely. | 30–40 | None required; LeetCode 'SQL 50' as a practice milestone | Fruit-stall database | `hubs/sql-l1-foundation-hub.html` (#3) |
| **L2 Proficient** | Model a database or data mart from requirements and write advanced analytical SQL others can trust. | 50–70 | Oracle Database SQL Certified Associate 1Z0-071 (optional; verify) | Sales data mart | `hubs/sql-l2-proficient-hub.html` (#15) |
| **L3 Specialist** | Diagnose and fix slow queries, design secure and highly available databases, and add AI features (vectors, RAG) in SQL. | 70–90 | Microsoft DP-800: SQL AI Developer Associate | Tuned order system + 'ask the database' RAG | `hubs/sql-l3-specialist-hub.html` (#28) |
| **L4 Expert** | Set database architecture and standards: internals-level trade-offs, platform choices, governance and team practice. | 60–80 | Optional: DP-300 Azure Database Administrator (verify status) | Database architecture review | `hubs/sql-l4-expert-hub.html` (#41) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: The school library and the lunch-box register

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Ms. Rows the librarian, class registers (tables), library cards (keys), baskets of apples and oranges.

- A **table** is a class register: one row per child, one column per fact (name, class, favourite fruit).
- A **primary key** is a library card number: two kids can share a name but never a card.
- A **JOIN** matches each child to their lunch box using the name tag on both.
- **GROUP BY** is tipping all the fruit onto the table and sorting it into an apple basket and an orange basket, then counting each.
- An **index** is the book's index page: you jump straight to 'oranges, page 42' instead of reading every page.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `(new folder)` | no material yet; Python Days 63–64 and Power BI/Qlik work give practice data | L1 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- SQL querying (all dialects; PostgreSQL first, T-SQL notes)
- Relational and dimensional modelling (star schema, facts, dimensions, SCDs)
- Indexes, transactions and isolation
- Database internals (B-tree, LSM, WAL, MVCC)
- Generic row-level security

**This subject links to, but does not re-teach:**
- Sharding, replication and CAP → `system-design`
- Power BI and Qlik modelling specifics → `power-bi / qlik-sense`
- Vector search and RAG design → `ai-engineering`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| Oracle Database SQL Certified Associate (1Z0-071) | L2 | verify | Vendor SQL exam, optional. Confirm the exam is still offered and the current price. | [link](https://education.oracle.com/) |
| Microsoft DP-800: SQL AI Developer Associate | L3 | active | Skills measured as of 19 Oct 2026: design and develop database solutions 35–40%; secure, optimise and deploy 35–40%; implement AI capabilities (embeddings, intelligent search, RAG) 25–30%. Pass 700. Renew yearly (free). | [link](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/dp-800) |
| Microsoft DP-300: Azure Database Administrator Associate | L4 | verify | Optional, for an operations/DBA angle. Check whether it is still active. | [link](https://learn.microsoft.com/en-us/credentials/certifications/azure-database-administrator-associate/) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#3 SQL & Databases L1 Foundation hub** → `hubs/sql-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `sql-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#15 SQL & Databases L2 Proficient hub** → `hubs/sql-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `sql-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#28 SQL & Databases L3 Specialist hub** → `hubs/sql-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `sql-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#41 SQL & Databases L4 Expert hub** → `hubs/sql-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `sql-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #3 (SQL & Databases L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
