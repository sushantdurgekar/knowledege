---
title: "React: levels L1–L4"
track: technical
domain: web-dev
subject: react
tags: [react, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# React: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Build interactive single-page UIs from components with props, state, lists and forms.  
**Time:** about 40–55 hours · **Certification:** certificates.dev Junior React (optional, not endorsed by Meta) · **Hub:** `hubs/react-l1-foundation-hub.html`

### L1-01 Why React
- [ ] Declarative UI
- [ ] components
- [ ] virtual DOM idea
- [ ] create a project with Vite

### L1-02 JSX
- [ ] Expressions in JSX
- [ ] fragments
- [ ] className and style
- [ ] conditional rendering

### L1-03 Components and props
- [ ] Function components
- [ ] props and children
- [ ] composition

### L1-04 State
- [ ] useState
- [ ] events
- [ ] immutable updates of arrays and objects
- [ ] lifting state up

### L1-05 Lists and keys
- [ ] Rendering lists
- [ ] why keys matter
- [ ] filtering and sorting

### L1-06 Forms
- [ ] Controlled inputs
- [ ] validation
- [ ] form actions (React 19)

### L1-07 Styling
- [ ] CSS modules
- [ ] Tailwind basics
- [ ] conditional classes

**Capstone.** **Fruit basket app:** add, filter and total apples and oranges in a cart, with a form, derived totals and local persistence.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Build multi-page, data-driven React apps with routing, shared state, typed code and tests.  
**Time:** about 60–80 hours · **Certification:** certificates.dev Mid-Level React (optional); Meta Front-End Developer Professional Certificate (Coursera, optional; check currency) · **Hub:** `hubs/react-l2-proficient-hub.html`

### L2-01 Effects
- [ ] useEffect correctly
- [ ] dependencies
- [ ] cleanup
- [ ] 'you might not need an effect'

### L2-02 Refs and the DOM
- [ ] useRef
- [ ] forwarding refs
- [ ] ref as a prop (React 19)

### L2-03 Reducers and context
- [ ] useReducer
- [ ] useContext
- [ ] avoiding prop drilling

### L2-04 Custom hooks
- [ ] Extracting logic
- [ ] rules of hooks
- [ ] testing hooks

### L2-05 Data fetching
- [ ] TanStack Query
- [ ] loading/error states
- [ ] caching
- [ ] mutations
- [ ] use() with Suspense

### L2-06 Routing
- [ ] React Router: routes, params, loaders, nested layouts

### L2-07 State management
- [ ] When to use Redux Toolkit, Zustand or context
- [ ] server vs client state

### L2-08 React with TypeScript
- [ ] Typing props, state, events and hooks

### L2-09 Testing
- [ ] Vitest + React Testing Library
- [ ] user-event
- [ ] mocking APIs with MSW

**Capstone.** **Road-trip planner:** routed app (trips, stops, budget), TanStack Query against a mock API, Zustand store, typed with TS, 30+ tests.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Design performant, accessible component systems and use concurrent and server features well.  
**Time:** about 60–80 hours · **Certification:** certificates.dev Senior React (optional) · **Hub:** `hubs/react-l3-specialist-hub.html`

### L3-01 Rendering model
- [ ] Render vs commit
- [ ] reconciliation
- [ ] when components re-render
- [ ] StrictMode

### L3-02 Performance
- [ ] React Compiler 1.0
- [ ] memo/useMemo/useCallback when still needed
- [ ] virtualisation
- [ ] profiling

### L3-03 Concurrent features
- [ ] Transitions
- [ ] useDeferredValue
- [ ] Suspense boundaries
- [ ] useOptimistic
- [ ] Actions

### L3-04 Server Components
- [ ] Server vs client components
- [ ] 'use client' and 'use server'
- [ ] security lessons from the Dec 2025 RSC advisories (links nextjs)

### L3-05 Error handling
- [ ] Error boundaries
- [ ] fallback UIs
- [ ] logging

### L3-06 Component patterns
- [ ] Compound components
- [ ] headless components
- [ ] render props vs hooks
- [ ] controlled vs uncontrolled

### L3-07 Accessible component libraries
- [ ] Focus management
- [ ] ARIA patterns
- [ ] Radix/shadcn-style headless libraries

### L3-08 Newer APIs
- [ ] View Transitions, Fragment refs and other React 19.x additions (verify per release)

**Capstone.** **Analytics dashboard:** chart-heavy dashboard with virtualised tables, transitions, error boundaries and a before/after performance report.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Lead React architecture, migrations and standards across teams.  
**Time:** about 40–60 hours · **Certification:** No mainstream certification beyond certificates.dev Senior · **Hub:** `hubs/react-l4-expert-hub.html`

### L4-01 Application architecture
- [ ] Feature-based structure
- [ ] monorepos
- [ ] micro-frontends trade-offs (links javascript L4)

### L4-02 Design systems in React
- [ ] Tokens
- [ ] theming
- [ ] publishing a component library
- [ ] versioning

### L4-03 Migrations
- [ ] Class → hooks
- [ ] legacy state → modern
- [ ] React major upgrades with codemods

### L4-04 Cross-platform awareness
- [ ] React Native and Expo basics
- [ ] when to share code

### L4-05 Team practice
- [ ] Review standards
- [ ] ADRs
- [ ] mentoring (links softskills/leadership)

**Capstone.** **Component library:** publish an accessible React component library (npm) with Storybook docs and a migration guide.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.
