---
title: System Design
track: technical
updated: 2026-10-12
---
# System Design

System design topics and learning plan.

## Start here
- **L1 Foundation hub** (built 2026-10-12): [open the hub](https://claude.ai/artifact/5FDy46yNwWT8pPPZwQUGP9) · offline copy [`hubs/system-design-l1-foundation-hub.html`](hubs/system-design-l1-foundation-hub.html). Networking and latency, scaling and stateless services, availability, load balancing, caching, CDNs and proxies, storage choices, APIs and estimation, with Python + JavaScript simulations, 4 labs and a URL-shortener capstone. Flashcards: deck `system-design-l1`, parked until you start (`python _meta/tools/activate_deck.py system-design-l1`).
- **L2 Proficient hub** (built 2026-10-12): [open the hub](https://claude.ai/artifact/WYKUGQ93VYjG6xBpea5exS) · offline copy [`hubs/system-design-l2-proficient-hub.html`](hubs/system-design-l2-proficient-hub.html). Consistency models, replication and quorums, partitioning, caching strategies, messaging, rate limiting and resilience, service architecture, real time, observability and SLOs, and the interview framework with four classic designs, with Python + JavaScript simulations, 4 labs and a shared-rate-limiter + notification-worker capstone. Flashcards: deck `system-design-l2`, parked until you start (`python _meta/tools/activate_deck.py system-design-l2`).
- **L3 Specialist hub** (built 2026-10-12): [open the hub](https://claude.ai/artifact/W93mxxEWBqV4MS8kJiz9dU) · offline copy [`hubs/system-design-l3-specialist-hub.html`](hubs/system-design-l3-specialist-hub.html). Distributed transactions and sagas, event-driven architecture, stream and batch processing, consensus and coordination, storage engines, search and geo, multi-region and disaster recovery, security architecture, and six classic large designs, with Python + JavaScript simulations, 4 labs (order saga, stream job, Raft, LSM store) and an event-driven order platform capstone. Flashcards: deck `system-design-l3`, parked until you start (`python _meta/tools/activate_deck.py system-design-l3`).
- **L4 Expert hub** (built 2026-10-12): [open the hub](https://claude.ai/artifact/C3GSn1y8nTQ24VT25d5S3X) · offline copy [`hubs/system-design-l4-expert-hub.html`](hubs/system-design-l4-expert-hub.html). Architecture decisions and ADRs, well-architected reviews, capacity and cost (queueing, load testing, FinOps), evolution and migration, socio-technical design (Conway's law, Team Topologies, platform teams) and AI systems design (LLM serving, RAG, agent platforms), with Python + JavaScript models, 4 labs (decision log, capacity model, online migration, LLM serving simulator) and an architecture review pack capstone. Flashcards: deck `system-design-l4`, parked until you start (`python _meta/tools/activate_deck.py system-design-l4`).
**L1–L4 plan (2026-10-08):** [`plan/README.md`](plan/README.md) — levels, certifications, capstones, hub build checklist.

`docs/system-design-200-topics.xlsx`, `docs/system-design-learning-plan.xlsx`. Generator script: `projects/sd-excel-builder`.

## What's in this folder
| Folder | Holds | Items |
|---|---|---|
| `docs/` | PDFs, slides, cheat sheets, reference sheets | 2 |
| `projects/` | Your own builds / POCs | 1 |
| `hubs/` | Study hubs, one HTML page per level | 4 |
| `concepts/` | Concept notes, one per hub module (`l1-NN-*.md`, `l2-NN-*.md`, `l3-NN-*.md`, `l4-NN-*.md`) | 34 |
| `labs/` | Lab and capstone briefs | 20 |

## Learning files (pro-instructor)
- `concepts/` notes, `labs/` briefs, `resources.md`, `misconceptions.md` and `interview.md` (L1 to L4 sections filled from the hubs).
