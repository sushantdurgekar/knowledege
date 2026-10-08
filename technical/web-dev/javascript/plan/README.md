---
title: "JavaScript (browser): L1–L4 learning plan"
track: technical
domain: web-dev
subject: javascript
tags: [javascript, plan, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# JavaScript (browser): L1–L4 learning plan

> HTML, CSS and JavaScript in the browser, from the DOM to performance, security and architecture.
>
> Plan written 2026-10-08 (research + structure). **Hubs are built one at a time** from the queue in [`_meta/hub-program/README.md`](../../../../_meta/hub-program/README.md). Nothing here is taught yet; each hub build re-verifies facts first.

## The ladder

| Level | You can… | Hours | Certification(s) | Capstone | Hub (build #) |
|---|---|---|---|---|---|
| **L1 Foundation** | Build a responsive, accessible multi-page site and add interactivity with plain JavaScript and the DOM. | 50–70 | JSE-40-01 (JS Institute, entry); certificates.dev Junior JavaScript (optional) | Fruit market site | `hubs/javascript-l1-foundation-hub.html` (#7) |
| **L2 Proficient** | Write modern, tested, modular JavaScript and TypeScript for single-page apps, and explain how async code really runs. | 60–80 | JSA-41-01 (JS Institute, associate); certificates.dev Mid-Level JavaScript (optional) | Weather and travel planner SPA | `hubs/javascript-l2-proficient-hub.html` (#19) |
| **L3 Specialist** | Make web apps fast, secure, accessible and discoverable, and lead front-end quality on a team. | 70–90 | certificates.dev Senior JavaScript (optional) | Offline-first PWA | `hubs/javascript-l3-specialist-hub.html` (#32) |
| **L4 Expert** | Set front-end architecture and standards across teams. | 50–80 | No mainstream certification; evidence = design system + OSS contributions | Design system | `hubs/javascript-l4-expert-hub.html` (#45) |

Full topic tree with skill keys: [levels.md](levels.md) · Rated sources: [../resources.md](../resources.md)

## Story world: The puppet theatre

Every lesson opens with a short kid-style story from this world, then a story→tech mapping table, then where the story breaks, then the grown-up explanation (rules: [`story-style-guide.md`](../../../../_meta/hub-program/story-style-guide.md)).

**Cast:** The stage (HTML), costumes (CSS), Jo the puppeteer (JavaScript), a to-do board for the puppeteer (the event loop), the audience clicking buttons (events).

- **HTML** is the stage and props, **CSS** the costumes and lights, **JavaScript** the puppeteer who moves things when the audience claps.
- The **DOM** is the list of every puppet on stage. JavaScript can add an orange puppet or paint the apple puppet green.
- The **event loop**: Jo can only move one puppet at a time. Slow jobs (fetching a new puppet from the car) go on a board, and Jo picks them up when free.
- A **promise** is a cloakroom ticket: 'your coat will come back, or we'll tell you it's lost'.
- A **closure** is a child's backpack: the function takes the things it packed at home everywhere it goes.

## Folded into this plan

- `web-dev/fundamentals (HTML, CSS, jQuery, Bootstrap course)`
- `web-dev/seo (technical SEO goes into L3)`

Their course files stay where they are; this plan points at them, so nothing is studied twice.

## Material already in your vault

| Where (relative to the subject folder) | What | Used at |
|---|---|---|
| `../fundamentals/courses/udemy-complete-web-dev-15-projects §1–15` | HTML, CSS, Flexbox/Grid/Sass, JS, DOM, jQuery, Bootstrap, ES6 | L1–L2 |
| `../seo/notes/seo-basics.txt` | SEO basics | L3 |
| `../../software-engineering/full-stack/courses/full-stack-roadmap (01-beginner/frontend-foundations, 02-intermediate/advanced-frontend)` | practice tasks (work repo, reference only) | L1–L2 |

## No-repeat rules (from [`concept-ownership.md`](../../../../_meta/hub-program/concept-ownership.md))

**This subject teaches (owns):**
- HTML/CSS
- JavaScript language (closures, this, prototypes, modules)
- Event loop, promises, async/await
- TypeScript
- Browser security (XSS, CSP, CORS, cookies)
- Web performance and Core Web Vitals
- Accessibility (WCAG)
- Technical SEO
- Front-end testing basics (Vitest, Playwright)

**This subject links to, but does not re-teach:**
- HTTP/REST from the server side → `nodejs`
- Components and state → `react`
- Algorithms → `dsa`

## Certifications (researched 2026-10-08)

| Certification | Level | Status | Key facts | Source |
|---|---|---|---|---|
| JSE – Certified Entry-Level JavaScript Programmer (JSE-40-01) | L1 | active | JS Institute / OpenEDG. Sold via edube.org, delivered by TestNow or Pearson VUE. | [link](https://ums.edube.org/products/0-jsi-jse-4001-e) |
| JSA – Certified Associate JavaScript Programmer (JSA-41-01) | L2 | active | JS Institute / OpenEDG (Credly badge). | [link](https://www.credly.com/org/openedg/badge/jsa-41-01-jsa-certified-associate-javascript-programmer) |
| certificates.dev JavaScript (Junior / Mid / Senior) | L1–L3 | active | Junior: 35 MCQ in 30 min. Mid: 30 MCQ + 105 min coding (135 min total, $170 exam-only). Senior: 40 MCQ + 95 min coding. Not endorsed by any vendor. | [link](https://certificates.dev/javascript) |

Status *verify* means it was not confirmed on the vendor's own page in this session; the hub build checks it before writing any exam prep. Exam tracks get their own `technical/certifications/<code>/` folder (blueprint, mocks, readiness gate) only when the hub that prepares for them is built.

## Build checklist (one hub per session)

- [ ] **#7 JavaScript (browser) L1 Foundation hub** → `hubs/javascript-l1-foundation-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L1
  - [ ] concept notes `concepts/l1-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `javascript-l1`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#19 JavaScript (browser) L2 Proficient hub** → `hubs/javascript-l2-proficient-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L2
  - [ ] concept notes `concepts/l2-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `javascript-l2`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#32 JavaScript (browser) L3 Specialist hub** → `hubs/javascript-l3-specialist-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L3
  - [ ] concept notes `concepts/l3-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `javascript-l3`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit
- [ ] **#45 JavaScript (browser) L4 Expert hub** → `hubs/javascript-l4-expert-hub.html`
  - [ ] re-verify versions, cert facts and links · audit existing material for L4
  - [ ] concept notes `concepts/l4-NN-*.md` (story + diagram + worked example)
  - [ ] hub published + saved · independent fact/answer-key check · SRS deck `javascript-l4`
  - [ ] capstone brief in `labs/` · interview Q&A · README/INDEX updated · commit

**Start a build with:**
> Use pro-instructor. Build hub #7 (JavaScript (browser) L1) from `_meta/hub-program/README.md`, following `hub-spec.md`.
