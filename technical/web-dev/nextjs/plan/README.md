---
title: "Next.js: L1–L4 learning plan"
track: technical
domain: web-dev
subject: nextjs
tags: [nextjs, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Next.js: L1–L4 learning plan

> Full-stack React with the Next.js App Router: rendering, data, caching, auth and deployment.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Build and deploy a multi-page Next.js site with layouts, server components and static content. | 30–40 | No official Next.js certification found (checked 2026-10-08) | Travel blog | `hubs/nextjs-l1-foundation-hub.html` (#13) |
| **L2 Proficient** | Build a full-stack app with data, mutations, auth and caching done correctly. | 50–70 | None official | Trip-planner SaaS v1 | `hubs/nextjs-l2-proficient-hub.html` (#25) |
| **L3 Specialist** | Choose and tune rendering and caching strategies; test, secure and self-host Next.js in production. | 50–70 | None official | Production-ready trip planner | `hubs/nextjs-l3-specialist-hub.html` (#38) |
| **L4 Expert** | Architect large Next.js estates and own upgrade, platform and cost decisions. | 40–60 | None official | Next.js starter accelerator | `hubs/nextjs-l4-expert-hub.html` (#51) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: The bakery

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** Baker Nell, pre-baked cakes on the shelf (static), cakes baked to order (dynamic), the hourly re-bake bell (revalidation), the kitchen (server) and the decorating table (client).

- **Static rendering** = cakes baked before the shop opens: instant to hand over, same for everyone.
- **Dynamic rendering** = baked when you order: fresh and personal, but you wait a bit.
- **Revalidation** = the bell that tells Nell to re-bake the shelf cakes every hour.
- **Server Components** are kitchen work customers never see; **Client Components** are the sprinkles you add yourself at the table.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `examples/todo-list` | App Router + Prisma sample | L1–L2 |
| `../react/courses/udemy-react-complete-guide §26–27` | Next.js sections of the React course | L1 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- App Router, layouts and file conventions
- Rendering strategies (static, dynamic, streaming) and Next.js caching
- Server Actions and route handlers
- Deploying Next.js (Vercel, self-host, Docker)

**This subject links to, but does not re-teach:**
- React components and hooks → `react`
- Auth concepts → `nodejs`
- SEO and performance → `javascript`
- Databases → `sql`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| (none official) | — | none | No Vercel/Next.js certification found; certificates.dev covers JS, React, Vue, Nuxt and Angular, but not Next.js. Evidence = deployed projects. | [link](https://certificates.dev/) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#13 Next.js L1 Foundation hub** → `hubs/nextjs-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `nextjs-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#25 Next.js L2 Proficient hub** → `hubs/nextjs-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `nextjs-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#38 Next.js L3 Specialist hub** → `hubs/nextjs-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `nextjs-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#51 Next.js L4 Expert hub** → `hubs/nextjs-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `nextjs-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #13 (Next.js L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
