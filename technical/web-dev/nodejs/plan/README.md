---
title: "Node.js (server): L1–L4 learning plan"
track: technical
domain: web-dev
subject: nodejs
tags: [nodejs, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Node.js (server): L1–L4 learning plan

> Server-side JavaScript: APIs, data, auth, real-time and production operations.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Build and run a small REST API in Node with routing, validation and file or JSON storage. | 40–55 | None current: OpenJS JSNAD and JSNSD were retired on 30 Sep 2025 | Fruit-shop API | `hubs/nodejs-l1-foundation-hub.html` (#10) |
| **L2 Proficient** | Ship a secure, tested API backed by a real database with authentication. | 60–80 | None current (see L1 note) | Recipe-sharing API | `hubs/nodejs-l2-proficient-hub.html` (#22) |
| **L3 Specialist** | Build high-throughput, real-time and distributed Node services and diagnose production issues. | 70–90 | Optional: AWS Certified Developer – Associate (DVA-C03, GA 1 Dec 2026) | Real-time car-trip tracker | `hubs/nodejs-l3-specialist-hub.html` (#35) |
| **L4 Expert** | Own Node platform decisions: architecture, supply-chain security, upgrade strategy and team standards. | 50–70 | No mainstream certification; evidence = accelerator + architecture decision records | Service accelerator | `hubs/nodejs-l4-expert-hub.html` (#48) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: The one-waiter restaurant

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Nodi the single waiter (the event loop), the kitchen (libuv thread pool and the OS), order tickets (callbacks/promises), the garden hose (streams).

- Node has **one waiter**. He never stands at the oven; he hands orders to the kitchen and serves other tables while food cooks. That's non-blocking I/O.
- If the waiter starts peeling 1,000 oranges himself (CPU-heavy work), every table waits. Send that job to a **worker thread**.
- A **stream** is a garden hose: water (data) flows in small sips, so you never need a bucket big enough for the whole lake.
- **Middleware** is the line of helpers at the restaurant door: one checks the booking, one takes coats, one shows you to the table.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `../fundamentals/courses/udemy-complete-web-dev-15-projects §16–32` | Node, Express, MongoDB, APIs (older tech; use selectively) | L1 |
| `../../devops/docker/examples/react-express-app` | Express API sample | L1 |
| `../../software-engineering/full-stack/courses/full-stack-roadmap (backend folders)` | practice tasks (work repo, reference only) | L1–L3 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- HTTP, REST, status codes and JSON APIs
- Server-side auth (sessions, JWT, OAuth2/OIDC)
- Server-side security (OWASP API Top 10)
- libuv, streams and worker threads
- Node implementation of caching, queues and WebSockets

**This subject links to, but does not re-teach:**
- Event loop basics and promises → `javascript`
- SQL and modelling → `sql`
- Caching, queues and scaling concepts → `system-design`
- Containers and deployment → `docker`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| OpenJS Node.js Application Developer (JSNAD) | — | retired | Retired 30 Sep 2025 (Linux Foundation). No named replacement. | [link](https://training.linuxfoundation.org/jsnad-cert-inactive/) |
| OpenJS Node.js Services Developer (JSNSD) | — | retired | Retired 30 Sep 2025 (Linux Foundation). | [link](https://training.linuxfoundation.org/certification/jsnsd/) |
| AWS Certified Developer – Associate (DVA-C03) | L3 | changing | Optional. Registration opens 27 Oct 2026, GA 1 Dec 2026; DVA-C02 ends 30 Nov 2026. Adds AI security. | [link](https://aws.amazon.com/blogs/training-and-certification/september-2026-new-offerings/) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#10 Node.js (server) L1 Foundation hub** → `hubs/nodejs-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `nodejs-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#22 Node.js (server) L2 Proficient hub** → `hubs/nodejs-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `nodejs-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#35 Node.js (server) L3 Specialist hub** → `hubs/nodejs-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `nodejs-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#48 Node.js (server) L4 Expert hub** → `hubs/nodejs-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `nodejs-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #10 (Node.js (server) L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
