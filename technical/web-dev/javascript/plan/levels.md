---
title: "JavaScript (browser): levels L1–L4"
track: technical
domain: web-dev
subject: javascript
tags: [javascript, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# JavaScript (browser): levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Build a responsive, accessible multi-page site and add interactivity with plain JavaScript and the DOM.  
**Time:** about 50–70 hours · **Certification:** JSE-40-01 (JS Institute, entry); certificates.dev Junior JavaScript (optional) · **Hub:** `hubs/javascript-l1-foundation-hub.html`

### L1-01 How the web works
- [ ] Browser, server, URL, DNS in one picture
- [ ] HTTP request/response
- [ ] DevTools tour

### L1-02 HTML
- [ ] Semantic elements
- [ ] forms and inputs
- [ ] links and images
- [ ] tables
- [ ] head/meta

### L1-03 CSS foundations
- [ ] Selectors and specificity
- [ ] the box model
- [ ] units
- [ ] colours and fonts
- [ ] the cascade

### L1-04 Layout
- [ ] Flexbox
- [ ] Grid
- [ ] responsive design with media queries
- [ ] mobile-first

### L1-05 JavaScript basics
- [ ] let/const
- [ ] types
- [ ] operators
- [ ] strings and template literals
- [ ] if/loops
- [ ] functions and arrow functions

### L1-06 Arrays and objects
- [ ] Array methods (map, filter, reduce, find)
- [ ] objects
- [ ] destructuring
- [ ] spread
- [ ] JSON

### L1-07 The DOM and events
- [ ] querySelector
- [ ] changing text, classes and styles
- [ ] addEventListener
- [ ] event object
- [ ] forms

### L1-08 First async
- [ ] setTimeout
- [ ] fetch with .then and async/await
- [ ] showing loading and error states

### L1-09 Tooling basics
- [ ] VS Code
- [ ] Live Server
- [ ] npm basics
- [ ] Git (owned by python L1-02)

**Capstone.** **Fruit market site:** responsive 3-page site with a filterable product grid (apples, oranges…) built from a JSON file, a validated order form, and a Lighthouse accessibility score of 90+.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Write modern, tested, modular JavaScript and TypeScript for single-page apps, and explain how async code really runs.  
**Time:** about 60–80 hours · **Certification:** JSA-41-01 (JS Institute, associate); certificates.dev Mid-Level JavaScript (optional) · **Hub:** `hubs/javascript-l2-proficient-hub.html`

### L2-01 Scope and closures
- [ ] Lexical scope
- [ ] hoisting and the TDZ
- [ ] closures and their uses

### L2-02 this, prototypes and classes
- [ ] this binding rules
- [ ] call/apply/bind
- [ ] prototype chain
- [ ] class syntax
- [ ] private fields

### L2-03 Modules
- [ ] ES modules (import/export)
- [ ] dynamic import
- [ ] CommonJS awareness

### L2-04 The event loop
- [ ] Call stack
- [ ] task and microtask queues
- [ ] promises
- [ ] async/await
- [ ] error handling
- [ ] Promise.all/any/allSettled/race

### L2-05 Working with APIs
- [ ] fetch options
- [ ] REST and JSON
- [ ] CORS from the browser side
- [ ] AbortController
- [ ] retries

### L2-06 Browser storage and state
- [ ] localStorage, sessionStorage, IndexedDB
- [ ] cookies
- [ ] URL state

### L2-07 Tooling
- [ ] npm/pnpm
- [ ] Vite
- [ ] ESLint
- [ ] Prettier
- [ ] environment variables

### L2-08 TypeScript basics
- [ ] Types and interfaces
- [ ] unions
- [ ] generics basics
- [ ] type narrowing
- [ ] tsconfig

### L2-09 Testing
- [ ] Vitest unit tests
- [ ] DOM testing
- [ ] mocking fetch

**Capstone.** **Weather and travel planner SPA:** vanilla TypeScript + Vite app calling two public APIs (weather + route distance for a car trip), offline cache in IndexedDB, Vitest suite.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Make web apps fast, secure, accessible and discoverable, and lead front-end quality on a team.  
**Time:** about 70–90 hours · **Certification:** certificates.dev Senior JavaScript (optional) · **Hub:** `hubs/javascript-l3-specialist-hub.html`

### L3-01 Browser internals
- [ ] Parsing
- [ ] critical rendering path
- [ ] layout, paint and composite
- [ ] reflow triggers

### L3-02 Performance
- [ ] Core Web Vitals (LCP, INP, CLS)
- [ ] lazy loading
- [ ] code splitting
- [ ] images
- [ ] caching headers
- [ ] profiling

### L3-03 Web security
- [ ] XSS and CSP
- [ ] CSRF and SameSite cookies
- [ ] CORS in depth
- [ ] clickjacking
- [ ] dependency risk
- [ ] Trusted Types

### L3-04 Advanced Web APIs
- [ ] Web Workers
- [ ] Service Workers and PWAs
- [ ] WebSockets and SSE
- [ ] Intersection/Resize observers

### L3-05 Accessibility
- [ ] WCAG 2.2 AA
- [ ] ARIA when (and when not)
- [ ] keyboard and screen-reader testing

### L3-06 Technical SEO
- [ ] Crawling and indexing
- [ ] meta and structured data
- [ ] sitemaps
- [ ] rendering strategy effects (links nextjs)

### L3-07 Advanced TypeScript
- [ ] Generics, conditional and mapped types
- [ ] utility types
- [ ] strict mode adoption

### L3-08 Patterns and E2E testing
- [ ] Module, observer, pub/sub, state machines
- [ ] Playwright end-to-end tests

**Capstone.** **Offline-first PWA:** installable recipe app with service worker caching, CSP, WCAG 2.2 AA audit, Core Web Vitals report and Playwright tests.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Set front-end architecture and standards across teams.  
**Time:** about 50–80 hours · **Certification:** No mainstream certification; evidence = design system + OSS contributions · **Hub:** `hubs/javascript-l4-expert-hub.html`

### L4-01 Front-end architecture
- [ ] Monorepos
- [ ] micro-frontends and module federation
- [ ] design systems
- [ ] rendering strategy choice

### L4-02 Build tooling internals
- [ ] Bundlers (Vite/Rollup, esbuild, Turbopack) and transpilers
- [ ] tree shaking
- [ ] source maps

### L4-03 Standards and the platform
- [ ] TC39 process
- [ ] browser support strategy
- [ ] progressive enhancement

### L4-04 Observability and budgets
- [ ] Real-user monitoring
- [ ] performance budgets in CI
- [ ] error tracking

### L4-05 Leading front-end practice
- [ ] Code review standards
- [ ] reusable templates
- [ ] mentoring (links softskills/leadership)

**Capstone.** **Design system:** tokens, 10 accessible web components, docs site, visual regression tests and a performance budget in CI.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.
