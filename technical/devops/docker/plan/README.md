---
title: "Docker & Containers: L1–L4 learning plan"
track: technical
domain: devops
subject: docker
tags: [docker, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Docker & Containers: L1–L4 learning plan

> Containers from your first Dockerfile to secure images, Compose stacks and Kubernetes.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Containerise a simple app, run it with ports and volumes, and use Compose for an app plus database. | 20–30 | None at L1 | Containerise the fruit-shop API | `hubs/docker-l1-foundation-hub.html` (#12) |
| **L2 Proficient** | Build small, fast, secure images and run multi-service stacks in CI. | 35–50 | Docker Certified Associate (DCA), now run by Mirantis (verify current availability and price) | Full-stack stack in CI | `hubs/docker-l2-proficient-hub.html` (#24) |
| **L3 Specialist** | Run containers on Kubernetes with good security, packaging and observability. | 60–80 | KCNA (Kubernetes and Cloud Native Associate); CKAD (Certified Kubernetes Application Developer) | Deploy to Kubernetes | `hubs/docker-l3-specialist-hub.html` (#37) |
| **L4 Expert** | Design container platforms and delivery pipelines for teams. | 60–80 | CKA (Certified Kubernetes Administrator); CKS (Certified Kubernetes Security Specialist) | Golden-path template | `hubs/docker-l4-expert-hub.html` (#50) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: Lunchboxes and the shipping port

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** A recipe card for a packed lunch (Dockerfile), the packed lunchbox template (image), each lunchbox handed out (container), the picnic basket of several boxes (Compose), the school fridge that keeps things overnight (volume), the shipping port (Kubernetes).

- A **Dockerfile** is the recipe card: 'one apple, one orange, a sandwich'. Follow it and every lunchbox comes out the same.
- An **image** is the sealed template lunchbox; a **container** is one lunchbox opened and being eaten. Many kids can get a box from the same template.
- A **volume** is the school fridge: throw the lunchbox away and the yoghurt in the fridge is still there tomorrow.
- **Compose** is the picnic basket: sandwiches box, drinks box and fruit box, packed and carried together.
- **Kubernetes** is the shipping port that keeps the right number of boxes on the right ships, and replaces any that fall overboard.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `examples/hello-docker` | first Dockerfile | L1 |
| `examples/react-express-app` | multi-container app | L1–L2 |
| `examples/react-express-app-dockerignore` | .dockerignore lesson | L2 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- Containers, images, Dockerfiles and Compose
- Container security and supply chain
- CI/CD basics (GitHub Actions)
- Kubernetes fundamentals

**This subject links to, but does not re-teach:**
- App code being containerised → `python / nodejs / nextjs`
- Scaling concepts → `system-design`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| Docker Certified Associate (DCA), Mirantis | L2 | verify | Moved to Mirantis with Docker Enterprise in 2019; third-party source says still sold at $199. Confirm on Mirantis before booking. | [link](https://certification.mirantis.com/) |
| KCNA – Kubernetes and Cloud Native Associate | L3 | verify | Linux Foundation/CNCF entry-level. | [link](https://training.linuxfoundation.org/certification/kubernetes-cloud-native-associate/) |
| CKAD – Certified Kubernetes Application Developer | L3 | verify | Performance-based exam. | [link](https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad/) |
| CKA / CKS | L4 | verify | Administrator / Security Specialist. | [link](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#12 Docker & Containers L1 Foundation hub** → `hubs/docker-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `docker-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#24 Docker & Containers L2 Proficient hub** → `hubs/docker-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `docker-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#37 Docker & Containers L3 Specialist hub** → `hubs/docker-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `docker-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#50 Docker & Containers L4 Expert hub** → `hubs/docker-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `docker-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #12 (Docker & Containers L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
