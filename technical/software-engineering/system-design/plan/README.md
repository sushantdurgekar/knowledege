---
title: "System Design: L1–L4 learning plan"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-12
---
# System Design: L1–L4 learning plan

> Design reliable, scalable systems, from client-server basics to distributed consensus and architecture leadership.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Explain how a web app works end to end and sketch a simple scalable design with sensible estimates. | 45–55 | No certification; evidence = design docs | Design + build a URL shortener | `hubs/system-design-l1-foundation-hub.html` (#9) |
| **L2 Proficient** | Design common products (feed, chat, rate limiter) with correct trade-offs, and run a design interview confidently. | 60–80 | None | Distributed rate limiter + notification worker | `hubs/system-design-l2-proficient-hub.html` (#21) |
| **L3 Specialist** | Design distributed, data-intensive systems (payments, streaming, search, geo) and defend them in review. | 80–100 | Optional: AZ-305 Azure Solutions Architect Expert or AWS Solutions Architect – Associate (verify current versions) | Event-driven order platform | `hubs/system-design-l3-specialist-hub.html` (#34) |
| **L4 Expert** | Lead architecture: trade-off decisions, reviews, capacity and cost, and organisation-level design. | 50–70 | Optional: AWS Solutions Architect – Professional (SAP-C03 GA 17 Nov 2026) or AZ-305 | Architecture review pack | `hubs/system-design-l4-expert-hub.html` (#47) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: Pizza Town and the family road trip

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Pizza Town's shops, delivery scooters, a traffic cop at the junction (load balancer), snacks in the car glovebox (cache), the family car on a road trip (requests travelling).

- A **load balancer** is the traffic cop sending each car to the least busy lane.
- A **cache** is the glovebox snack drawer: grab an apple in one second instead of stopping at a shop.
- A **CDN** is a pizza shop in every neighbourhood, so nobody waits for delivery from across the city.
- **Sharding** is splitting a huge school into houses by surname, so each house register stays small.
- A **message queue** is the ticket line at the fair: rides take people at their own pace and nobody gets lost.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `docs/system-design-200-topics.xlsx` | 13 domains, ~200 topics; use the audited `-verified.xlsx` copy | L1–L4 |
| `docs/system-design-learning-plan.xlsx` | 194-topic weekly plan (⚠ ~200+ weeks; regrouped into L1–L4 here) | L1–L4 |
| `projects/sd-excel-builder` | generator for the sheets | — |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- Scalability, availability, latency budgets
- Load balancing, CDNs, caching strategies
- Replication, partitioning/sharding, consistent hashing, CAP/PACELC
- Messaging, streams, event-driven patterns
- Consensus and distributed coordination
- Observability concepts, SLOs
- Design-interview framework

**This subject links to, but does not re-teach:**
- Indexes, transactions, internals → `sql`
- Node implementations → `nodejs`
- Containers and Kubernetes → `docker`
- Big-O → `dsa`
- AI system design → `ai-engineering`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| (no system-design certification) | — | none | Evidence = design docs, ADRs and interviews. Cloud architect exams are optional proxies. | — |
| AWS Certified Solutions Architect – Professional (SAP-C03) | L4 | changing | Registration opens 27 Oct 2026, GA 17 Nov 2026; SAP-C02 ends 16 Nov 2026. Adds GenAI and agentic AI. | [link](https://aws.amazon.com/blogs/training-and-certification/september-2026-new-offerings/) |
| AZ-305: Azure Solutions Architect Expert | L3–L4 | verify | Optional Azure alternative (also in your company's cert list). | [link](https://learn.microsoft.com/en-us/credentials/certifications/azure-solutions-architect/) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Audit of the existing sheets (completed 2026-10-08)

All 1,433 unique links in the system design and DSA workbooks were opened one by one ([full report](../../../../_meta/hub-program/link-audit/audit-report.md)). Results across both system design workbooks:

- **About 1 in 2 links failed:** 494 of the 961 link references per workbook were removed. Most failures were ByteByteGo blog URLs (163 of 168 are invented slugs) and dead or mislabelled YouTube videos.
- **181 references relabelled** (the video or repo is real but the label named a different channel or title), and **29 updated** to the page's new address.
- Cleaned copies: `docs/system-design-200-topics-verified.xlsx` and `docs/system-design-learning-plan-verified.xlsx`, each with an **Audit** sheet listing every change. The originals are untouched.
- 3 topics that lost every link were refilled with verified sources. *Write-Around Cache* still needs one, and about 40 topics are down to a single link. Each hub build adds verified sources for its level.
- The pacing problem still stands: one topic per week across ~200+ weeks. The L1–L4 grouping in levels.md replaces it.

## Build checklist (one hub per session)

- [x] **#9 System Design L1 Foundation hub** → `hubs/system-design-l1-foundation-hub.html` ([open](https://claude.ai/artifact/5FDy46yNwWT8pPPZwQUGP9), built 2026-10-12)
  - [x] re-verify versions, cert facts and links · audit existing material for L1
  - [x] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [x] hub published + saved · fact/answer-key self-check (fresh-agent review still to do) · SRS deck `system-design-l1`
  - [x] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [x] **#21 System Design L2 Proficient hub** → `hubs/system-design-l2-proficient-hub.html` ([open](https://claude.ai/artifact/WYKUGQ93VYjG6xBpea5exS), built 2026-10-12)
  - [x] re-verify versions, cert facts and links · audit existing material for L2
  - [x] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [x] hub published + saved · fact/answer-key self-check (fresh-agent review still to do) · SRS deck `system-design-l2`
  - [x] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#34 System Design L3 Specialist hub** → `hubs/system-design-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `system-design-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#47 System Design L4 Expert hub** → `hubs/system-design-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `system-design-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #9 (System Design L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
