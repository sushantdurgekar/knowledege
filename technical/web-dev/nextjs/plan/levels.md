---
title: "Next.js: levels L1–L4"
track: technical
domain: web-dev
subject: nextjs
tags: [nextjs, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Next.js: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Build and deploy a multi-page Next.js site with layouts, server components and static content.  
**Time:** about 30–40 hours · **Certification:** No official Next.js certification found (checked 2026-10-08) · **Hub:** `hubs/nextjs-l1-foundation-hub.html`

### L1-01 Project set-up
- [ ] create-next-app
- [ ] project structure
- [ ] dev server
- [ ] Turbopack

### L1-02 Routing
- [ ] app/ folder
- [ ] pages and layouts
- [ ] dynamic segments
- [ ] Link and navigation
- [ ] loading and not-found files

### L1-03 Server and client components
- [ ] Default server components
- [ ] 'use client'
- [ ] passing props across the boundary

### L1-04 Assets and styling
- [ ] next/image
- [ ] next/font
- [ ] Tailwind
- [ ] global vs module CSS

### L1-05 Static content
- [ ] Markdown/MDX pages
- [ ] generateStaticParams
- [ ] metadata for SEO

### L1-06 Deploying
- [ ] Vercel deploy
- [ ] environment variables
- [ ] preview deployments

**Capstone.** **Travel blog:** statically generated blog of car-trip stories with MDX, images, tags, metadata and a Vercel deploy.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Build a full-stack app with data, mutations, auth and caching done correctly.  
**Time:** about 50–70 hours · **Certification:** None official · **Hub:** `hubs/nextjs-l2-proficient-hub.html`

### L2-01 Data fetching
- [ ] fetch in server components
- [ ] parallel vs sequential
- [ ] streaming with Suspense

### L2-02 Caching and revalidation
- [ ] Cache Components and 'use cache' (Next.js 16+)
- [ ] revalidatePath/Tag
- [ ] static vs dynamic decisions (verify per version)

### L2-03 Mutations
- [ ] Server Actions
- [ ] forms
- [ ] useActionState
- [ ] optimistic UI
- [ ] validation with zod

### L2-04 Route handlers
- [ ] API routes in app/
- [ ] webhooks
- [ ] streaming responses

### L2-05 Request interception
- [ ] proxy.ts (formerly middleware)
- [ ] redirects and rewrites
- [ ] headers and cookies

### L2-06 Auth
- [ ] Auth.js/Better Auth or a hosted provider
- [ ] protecting routes and actions
- [ ] sessions

### L2-07 Database
- [ ] Prisma or Drizzle with Postgres
- [ ] connection handling in serverless

**Capstone.** **Trip-planner SaaS v1:** extend examples/todo-list into a multi-user trip planner with auth, Postgres, server actions and cached public pages.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Choose and tune rendering and caching strategies; test, secure and self-host Next.js in production.  
**Time:** about 50–70 hours · **Certification:** None official · **Hub:** `hubs/nextjs-l3-specialist-hub.html`

### L3-01 Rendering strategy design
- [ ] Static, dynamic, partial prerendering and streaming
- [ ] picking per route

### L3-02 Performance
- [ ] Bundle analysis
- [ ] image and font strategy
- [ ] Core Web Vitals in Next.js

### L3-03 Security
- [ ] Server Action and RSC security
- [ ] secrets on the server
- [ ] CSP
- [ ] following Next.js security releases

### L3-04 Testing
- [ ] Unit (Vitest), component (RTL) and E2E (Playwright) for App Router apps

### L3-05 Internationalisation
- [ ] Locale routing
- [ ] translations
- [ ] SEO for i18n

### L3-06 Self-hosting
- [ ] next start vs standalone output
- [ ] Docker
- [ ] caching handlers
- [ ] CDN in front

### L3-07 Observability
- [ ] instrumentation.ts
- [ ] OpenTelemetry
- [ ] error tracking

**Capstone.** **Production-ready trip planner:** PPR/streaming, i18n, Playwright suite, Docker self-host, security headers and a Web Vitals report.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Architect large Next.js estates and own upgrade, platform and cost decisions.  
**Time:** about 40–60 hours · **Certification:** None official · **Hub:** `hubs/nextjs-l4-expert-hub.html`

### L4-01 Large-app architecture
- [ ] Monorepo with Turborepo
- [ ] multi-zones
- [ ] shared design system

### L4-02 Platform choices
- [ ] Vercel vs self-host vs other platforms
- [ ] edge vs Node runtime
- [ ] cost modelling

### L4-03 Upgrade strategy
- [ ] Next.js LTS lines and security releases
- [ ] codemods
- [ ] deprecation tracking

### L4-04 Framework internals awareness
- [ ] Router internals
- [ ] Turbopack chunking
- [ ] RSC payload

### L4-05 Practice leadership
- [ ] Starter templates
- [ ] standards
- [ ] reviews
- [ ] mentoring

**Capstone.** **Next.js starter accelerator:** opinionated template (auth, DB, i18n, testing, observability, CI) with ADRs, used to bootstrap one real app.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.
