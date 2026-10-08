---
title: "Power BI: L1–L4 learning plan"
track: technical
domain: bi-analytics
subject: power-bi
tags: [power-bi, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Power BI: L1–L4 learning plan

> From your first report to semantic models, Fabric and Power BI governance at scale.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Connect to data, clean it, build a simple model and publish an interactive report. | 30–40 | None at L1; start the PL-300 learning path (Microsoft Learn) | Lemonade stand report | `hubs/power-bi-l1-foundation-hub.html` (#5) |
| **L2 Proficient** | Deliver a correct, well-modelled, secure Power BI solution end to end, ready for PL-300. | 60–80 | PL-300: Microsoft Power BI Data Analyst | Fruit-chain sales app | `hubs/power-bi-l2-proficient-hub.html` (#17) |
| **L3 Specialist** | Design enterprise semantic models, tune performance and implement Fabric-based analytics (DP-600 scope). | 70–90 | DP-600: Fabric Analytics Engineer Associate | Fabric lakehouse to Direct Lake model | `hubs/power-bi-l3-specialist-hub.html` (#30) |
| **L4 Expert** | Lead Power BI/Fabric platforms: governance, CoE, embedding, AI and client advisory. | 50–70 | Optional: DP-700 Fabric Data Engineer (verify status) | Power BI CoE kit | `hubs/power-bi-l4-expert-hub.html` (#43) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: The lemonade stand's report book

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Lila who runs a lemonade and fruit-juice stand, crates of apples and oranges, the wash-and-chop table (Power Query), labelled shelves (the model), Lila's rule-following calculator (DAX).

- **Power Query** is the wash-and-chop table: muddy fruit comes in, clean slices go out, and the same steps repeat every morning.
- The **star schema** is a shop layout: one big sales ledger in the middle (fact), small labelled shelves around it (dimensions: fruit, day, stall).
- **Filter context** is which crate you're looking into. 'Total sales' in the orange crate is a different number from the apple crate, from the same formula.
- **CALCULATE** is Lila saying 'pretend we're only looking at oranges in June' before she counts.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `(new folder)` | no material yet; the full-stack roadmap's 04-bi-developer-ecosystem is the work repo reference | — |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- Power Query (M)
- Power BI semantic models and DAX
- Report design and data-visualisation principles
- Power BI service, workspaces, RLS and deployment pipelines
- Microsoft Fabric for analytics

**This subject links to, but does not re-teach:**
- Star schema and SQL → `sql`
- Qlik equivalents → `qlik-sense`
- Python in Fabric notebooks → `python`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| PL-300: Microsoft Power BI Data Analyst | L2 | active | Skills measured as of 20 Apr 2026: prepare the data 25–30%, model the data 25–30%, visualise and analyse 25–30%, manage and secure 15–20%. Pass 700. | [link](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/pl-300) |
| DP-600: Fabric Analytics Engineer Associate | L3 | active | New skills outline from 19 Oct 2026: maintain a data analytics solution 25–30%, prepare data 45–50%, implement and manage semantic models 25–30%. Pass 700. | [link](https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/dp-600) |
| DP-700: Fabric Data Engineer Associate | L4 | verify | Optional, for a data-engineering angle. | [link](https://learn.microsoft.com/en-us/credentials/certifications/fabric-data-engineer-associate/) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#5 Power BI L1 Foundation hub** → `hubs/power-bi-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `power-bi-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#17 Power BI L2 Proficient hub** → `hubs/power-bi-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `power-bi-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#30 Power BI L3 Specialist hub** → `hubs/power-bi-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `power-bi-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#43 Power BI L4 Expert hub** → `hubs/power-bi-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `power-bi-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #5 (Power BI L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
