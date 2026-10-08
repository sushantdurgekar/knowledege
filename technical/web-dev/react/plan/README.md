---
title: "React: L1–L4 learning plan"
track: technical
domain: web-dev
subject: react
tags: [react, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# React: L1–L4 learning plan

> Component-based UIs with React 19: state, data, performance, server components and architecture.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Build interactive single-page UIs from components with props, state, lists and forms. | 40–55 | certificates.dev Junior React (optional, not endorsed by Meta) | Fruit basket app | `hubs/react-l1-foundation-hub.html` (#11) |
| **L2 Proficient** | Build multi-page, data-driven React apps with routing, shared state, typed code and tests. | 60–80 | certificates.dev Mid-Level React (optional); Meta Front-End Developer Professional Certificate (Coursera, optional; check currency) | Road-trip planner | `hubs/react-l2-proficient-hub.html` (#23) |
| **L3 Specialist** | Design performant, accessible component systems and use concurrent and server features well. | 60–80 | certificates.dev Senior React (optional) | Analytics dashboard | `hubs/react-l3-specialist-hub.html` (#36) |
| **L4 Expert** | Lead React architecture, migrations and standards across teams. | 40–60 | No mainstream certification beyond certificates.dev Senior | Component library | `hubs/react-l4-expert-hub.html` (#49) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: LEGO town

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** LEGO bricks (components), stickers handed to a brick (props), a brick's own mood light (state), the town planner (React) who only rebuilds changed bricks.

- A **component** is a LEGO brick design. Build the 'Fruit card' brick once, then snap in an apple card and an orange card.
- **Props** are stickers you hand to a brick from outside: 'you are an orange, price 10'. The brick can't change its own stickers.
- **State** is the brick's own mood light. Flip it, and the town planner rebuilds just that brick (a re-render).
- **useEffect** is a note on the brick: 'after you're placed, phone Grandma'. And a goodbye note for when you're removed.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `courses/udemy-react-complete-guide (§1–25, §32 TypeScript)` | core React, Redux, Router, TypeScript | L1–L2 |
| `courses/react-learning-projects` | class components, custom hooks, HTTP, Redux, routing | L2 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- Component model, JSX, props and state
- Hooks and custom hooks
- Client-side state management
- React performance and the React Compiler
- Component testing (React Testing Library)

**This subject links to, but does not re-teach:**
- JavaScript and TypeScript → `javascript`
- Server Components in a framework → `nextjs`
- Accessibility and performance basics → `javascript`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| certificates.dev React (Junior / Mid / Senior) | L1–L3 | active | Junior: 50 Q in 40 min. Mid and Senior: 40 Q + 105 min coding (135 min). Mid exam-only $170. Not officially endorsed by Meta; reviewed by MVPs/GDEs. React version not stated. | [link](https://certificates.dev/react) |
| Meta Front-End Developer Professional Certificate (Coursera) | L1–L2 | verify | Course certificate, not a proctored exam; check how current its React content is. | [link](https://www.coursera.org/professional-certificates/meta-front-end-developer) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#11 React L1 Foundation hub** → `hubs/react-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `react-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#23 React L2 Proficient hub** → `hubs/react-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `react-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#36 React L3 Specialist hub** → `hubs/react-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `react-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#49 React L4 Expert hub** → `hubs/react-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `react-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #11 (React L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
