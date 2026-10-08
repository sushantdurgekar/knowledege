---
title: "Qlik Sense: L1–L4 learning plan"
track: technical
domain: bi-analytics
subject: qlik-sense
tags: [qlik-sense, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Qlik Sense: L1–L4 learning plan

> Qlik Sense and Qlik Cloud: associative modelling, scripting, set analysis, development, administration and AI.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Build a working Qlik Sense app from several sources with a clean data model, QVDs, master items, sheets and basic security. | 45–60 | Qlik Sense Business Analyst Qualification; Data Literacy Qualification (optional) | Fruit-market app | `hubs/qlik-sense-l1-foundation-hub.html` (#4) |
| **L2 Proficient** | Independently design and deliver Qlik solutions, troubleshoot reloads and models, and coach L1 developers. | 60–80 | Qlik Sense Business Analyst Certification; Qlik Sense Data Architect Certification | Multi-fact supply-chain app | `hubs/qlik-sense-l2-proficient-hub.html` (#16) |
| **L3 Specialist** | Design, deploy and administer Qlik solutions, extend Qlik with code and AI, and lead delivery. | 70–90 | Qlik AI Specialist; (System Administrator: verify) | Embedded analytics portal | `hubs/qlik-sense-l3-specialist-hub.html` (#29) |
| **L4 Expert** | Lead the Qlik practice: people, accelerators, standards, client impact and thought leadership. | 40–60 | No higher Qlik certification; evidence = accelerators, talks, client outcomes | Qlik accelerator pack | `hubs/qlik-sense-l4-expert-hub.html` (#42) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

> Topic keys L1-01…L4-04 match your **framework-qliksense** export so the plan can be uploaded back. Rows marked ⚠ need a fix before upload (see the audit list in plan/README.md).

## Story world: The magic highlighter at the fruit market

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Quinn with a magic highlighter, market stalls joined by invisible strings (associations), frozen fruit packs (QVDs), the recipe book for loading fruit (load script).

- Click 'oranges' and the magic highlighter turns them **green**. Every stall that sells oranges stays **white**. Stalls with no oranges go **grey**. That's the associative engine.
- All tables are stalls joined by strings with the **same field name**. Two strings between the same two stalls tangle into a **synthetic key**.
- A **QVD** is a frozen fruit pack: prepare once, then every app thaws it in seconds (an optimised load).
- **Set analysis** is saying 'count only last summer's apples', whatever the shopper has highlighted.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `courses/getting-started-with-qlik-sense/exercise-files` | starter .qvf apps | L1 |
| `examples/sample-apps` | sample apps | L1–L2 |
| `examples/extension-sample, examples/nebula-hello, examples/web*` | extensions, nebula.js, mashups | L3 |
| `docs/multi-tenant-diagrams` | Qlik Cloud multi-tenant architecture | L3–L4 |
| `docs/qlik-education-course-catalog.pdf` | Qlik course catalogue | all |
| `../../../framework-qliksense 3 - Copy.xlsx (vault root)` | proficiency framework export; topic keys reused below | L1–L4 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- Qlik associative model and selection states
- Qlik load script and QVD layering
- Set analysis and Qlik expressions
- Qlik Cloud administration and automation
- Qlik extensions, mashups and APIs

**This subject links to, but does not re-teach:**
- Star schema and SQL → `sql`
- Visualisation principles → `power-bi`
- Embedding JS → `javascript`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| Qlik Sense Business Analyst Qualification | L1 | active | Build a Qlik Sense app, then a multiple-choice exam; 1 h 15. 'Not our expert-level certification.' (2025 exam) | [link](https://www.qlik.com/us/services/training/validate-your-skills) |
| Qlik Sense Data Architect Qualification | L1–L2 | active | Build an app + MCQ; 1 h 30 (2025 exam). | [link](https://www.qlik.com/us/services/training/validate-your-skills) |
| Qlik Sense Business Analyst Certification | L2 | verify | Expert-level, platform-neutral (client-managed + Qlik Cloud). Domains: identify requirements, design application, prepare and load data, develop application. Confirm weights and timing on Qlik Learning. | [link](https://pages.qlik.com/rs/049-DKK-796/images/AI-Reality-Tour-Qlik-Certifications-Descriptions.pdf) |
| Qlik Sense Data Architect Certification | L2 | active | 50 questions, 90 min, pass 62% (scaled), platform-neutral. Identify requirements 20%, data connectivity 8%, data model design 28%, data transformations 38%, validation 6%. (Some third-party sites call this the 'Qlik Cloud Analytics Developer' and say 120 min; the official page says 90.) | [link](https://learning.qlik.com/student/page/2161345-qlik-sense-data-architect-certification-exam-details) |
| Qlik AI Specialist Certification | L3 | active | AI concepts, Qlik predictive models (Qlik Predict) and generative AI assistants (Qlik Answers). | [link](https://learning.qlik.com/student/page/2537679-qlik-ai-specialist-certification-exam) |
| Qlik Sense System Administrator Certification | L3 | verify | Not in Qlik's 2025 certification descriptions. May be retired; confirm before planning around it. | [link](https://learning.qlik.com/) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Audit of your framework export (first pass, 2026-10-08)

The `framework-qliksense 3 - Copy.xlsx` export is the source of the L1–L4 keys here. These rows look wrong or risky and should be fixed before the framework is uploaded again:

| Row | Issue | Suggested fix |
|---|---|---|
| L1-15 *Qlik Data Architect Certificate* | The Data Architect **certification** is an expert-level, 50-question exam weighted 38% on transformations and 28% on model design: an L2 outcome, not L1. Qlik's L1-friendly option is the **Qualification**. | L1: Business Analyst/Data Architect *Qualification*; move the certification to L2 (done in levels.md as L2-05). |
| L1-16 *Qlik Cloud Data Architect Certificate* | No separate "Qlik Cloud Data Architect" certification found; the official Data Architect exam is platform-neutral (client-managed + Qlik Cloud). | Merge into the single Data Architect certification row. |
| L3-03 *Qlik System Administrator Certificate* | Not in Qlik's 2025 certification descriptions (Data Architect, Business Analyst, AI Specialist, Talend). May be retired. | Verify on Qlik Learning; if retired, replace with "Qlik Cloud tenant administration" skills (L3-02). |
| L1-04.5 *SAP Sources* | Needs a licensed SAP connector and SAP knowledge, which is unusual for L1. | Move to L2-02 (additional technical skills). |
| L1-03.5 *Streams* vs L1-03.2–.4 *Spaces* | Streams exist only in client-managed Qlik Sense; spaces are Qlik Cloud. The framework mixes them without saying so. | Label each skill with its platform. |
| L1-14 *Automation* | Product renamed **Qlik Automate** (verify current name at build). | Update the title. |
| L2-01…L2-04 | Only 4 umbrella topics: no advanced scripting, set analysis, Aggr or performance skills, so L2 can't be assessed. | Added L2-01.a–c skills in levels.md. |
| Qlik AI | No row for Qlik Answers, Qlik Predict or the **Qlik AI Specialist** certification (present in your cert list). | Added L3-02.c. |

The xlsx is git-ignored (`*.xlsx`) and sits at the vault root. If it's an employer framework, consider moving it to `work/`.

## Build checklist (one hub per session)

- [ ] **#4 Qlik Sense L1 Foundation hub** → `hubs/qlik-sense-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `qlik-sense-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#16 Qlik Sense L2 Proficient hub** → `hubs/qlik-sense-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `qlik-sense-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#29 Qlik Sense L3 Specialist hub** → `hubs/qlik-sense-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `qlik-sense-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#42 Qlik Sense L4 Expert hub** → `hubs/qlik-sense-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `qlik-sense-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #4 (Qlik Sense L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
