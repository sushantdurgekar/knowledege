---
title: "Python: L1–L4 learning plan"
track: technical
domain: programming
subject: python
tags: [python, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Python: L1–L4 learning plan

> From your first script to designing and shipping Python libraries.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Write, run and debug small Python scripts and command-line tools on your own, using the standard library and Git. | 45–60 | PCEP (Python Institute, entry level) | Pantry tracker CLI | `hubs/python-l1-foundation-hub.html` (#2) |
| **L2 Proficient** | Build and test real applications (web APIs, scripts that call services, data analysis) independently, and review a beginner's code. | 70–90 | PCAP (Python Institute, associate) | Fruit-shop web app | `hubs/python-l2-proficient-hub.html` (#14) |
| **L3 Specialist** | Design maintainable, fast, concurrent Python services; set code standards and mentor others. | 80–100 | PCPP1 (Python Institute, professional level 1) | Order service | `hubs/python-l3-specialist-hub.html` (#27) |
| **L4 Expert** | Shape how teams use Python: internals, library and API design, packaging strategy, and standards that others follow. | 60–90 (plus ongoing practice) | PCPP2 (Python Institute, professional level 2) | Open-source package | `hubs/python-l4-expert-hub.html` (#40) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: Pip the robot chef in Grandma's kitchen

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Pip (the robot chef), Grandma (who writes the recipes), baskets of apples and oranges, labelled jars, a kitchen timer.

- **Variables** are labelled jars: the label is the name and the sugar inside is the value. Relabel the jar and the sugar doesn't move.
- A **list** is a fruit basket in a row: apple, orange, apple. You can count, add or take fruit out by position.
- A **dict** is the spice rack: you ask for 'cinnamon' by name, not by shelf number.
- A **function** is a recipe card. Same card, different ingredients in, a different cake out.
- A **loop** is the kitchen timer telling Pip: stir, check, stir again, until the sauce is thick.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `courses/100-days-of-python/` | your own Day 1–17 work (CoffeeMachine) | L1 |
| `courses/udemy-100-days-of-code/ Days 1–35` | basics, functions, OOP intro, files | L1 |
| `courses/udemy-100-days-of-code/ Days 36–71` | APIs, scraping, Flask, SQL, auth, deploy | L2 |
| `courses/udemy-100-days-of-code/ Days 72–81` | pandas, NumPy, matplotlib, plotly (owned here, linked from AI Engineering) | L2 |
| `docs/python-syntax-cheat-sheet.pdf, 100-days-of-python-syllabus.pdf` | reference | L1 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- Python language and standard library
- Git and command-line basics (first subject in your path)
- pytest and unit-testing basics
- pandas/NumPy basics
- packaging and virtual environments

**This subject links to, but does not re-teach:**
- Big-O and algorithm patterns → `dsa`
- SQL itself → `sql`
- HTTP/REST concepts → `nodejs`
- Containers → `docker`
- ML, LLM and agent code → `ai-engineering`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| PCEP – Certified Entry-Level Python Programmer | L1 | active | PCEP-30-02 active; PCEP-30-03 scheduled for Q3 2026, so check which version is live when you book. 30 questions, 40 min, pass 70%, from $69, valid 5 years. | [link](https://pythoninstitute.org/pcep) |
| PCAP – Certified Associate Python Programmer | L2 | active | PCAP-31-03 active; PCAP-31-04 scheduled for Q3 2026. 40 questions, 65 min, pass 70%, from $295, valid 5 years. | [link](https://pythoninstitute.org/pcap) |
| PCPP1 – Certified Professional Python Programmer 1 | L3 | verify | Advanced OOP, PEP 8/257, GUI (tkinter), network programming, file processing. The page shows inconsistent codes (PCPP-32-10x vs PCPP1-32-0x). | [link](https://pythoninstitute.org/pcpp1) |
| PCPP2 – Certified Professional Python Programmer 2 | L4 | verify | Packaging, design patterns, IPC, testing, network programming. | [link](https://pythoninstitute.org/pcpp2) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#2 Python L1 Foundation hub** → `hubs/python-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `python-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#14 Python L2 Proficient hub** → `hubs/python-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `python-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#27 Python L3 Specialist hub** → `hubs/python-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `python-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#40 Python L4 Expert hub** → `hubs/python-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `python-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #2 (Python L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
