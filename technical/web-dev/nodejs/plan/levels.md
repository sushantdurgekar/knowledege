---
title: "Node.js (server): levels L1–L4"
track: technical
domain: web-dev
subject: nodejs
tags: [nodejs, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# Node.js (server): levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Build and run a small REST API in Node with routing, validation and file or JSON storage.  
**Time:** about 40–55 hours · **Certification:** None current: OpenJS JSNAD and JSNSD were retired on 30 Sep 2025 · **Hub:** `hubs/nodejs-l1-foundation-hub.html`

### L1-01 The runtime
- [ ] What Node is (V8 + libuv)
- [ ] REPL
- [ ] running scripts
- [ ] --watch
- [ ] LTS versions and the new yearly release model

### L1-02 Modules and npm
- [ ] ES modules vs CommonJS
- [ ] package.json
- [ ] dependencies vs devDependencies
- [ ] npx
- [ ] semver ranges

### L1-03 Core modules
- [ ] fs/promises, path, os, events, url
- [ ] process and env variables

### L1-04 HTTP and REST
- [ ] Methods, status codes, headers
- [ ] REST resource design
- [ ] JSON
- [ ] the http module

### L1-05 Express (or Fastify) basics
- [ ] Routes, params, query
- [ ] middleware
- [ ] static files
- [ ] error handlers

### L1-06 Validation and errors
- [ ] Validating input (zod)
- [ ] consistent error responses
- [ ] logging basics

### L1-07 Async patterns on the server
- [ ] Callbacks → promises → async/await
- [ ] never blocking the loop (links javascript L2-04)

**Capstone.** **Fruit-shop API:** CRUD API for products and orders stored in JSON, with validation, error handling and a Postman/Bruno collection.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Ship a secure, tested API backed by a real database with authentication.  
**Time:** about 60–80 hours · **Certification:** None current (see L1 note) · **Hub:** `hubs/nodejs-l2-proficient-hub.html`

### L2-01 Databases from Node
- [ ] pg driver
- [ ] Prisma or Drizzle ORM
- [ ] migrations
- [ ] transactions
- [ ] N+1 queries

### L2-02 Authentication
- [ ] Password hashing (argon2/bcrypt)
- [ ] sessions vs JWT
- [ ] refresh tokens
- [ ] OAuth2/OIDC login

### L2-03 Authorisation
- [ ] RBAC
- [ ] resource ownership checks
- [ ] policy middleware

### L2-04 Security
- [ ] OWASP API Top 10
- [ ] helmet
- [ ] rate limiting
- [ ] CORS config
- [ ] secrets handling
- [ ] dependency audit

### L2-05 Testing
- [ ] node:test or Vitest
- [ ] supertest integration tests
- [ ] test databases
- [ ] mocking

### L2-06 Files and uploads
- [ ] multipart uploads
- [ ] storing to disk or blob storage
- [ ] streaming downloads

### L2-07 Configuration and logging
- [ ] 12-factor config
- [ ] structured logging with pino
- [ ] request IDs

### L2-08 API design
- [ ] Pagination, filtering, versioning
- [ ] OpenAPI docs
- [ ] idempotency keys

**Capstone.** **Recipe-sharing API:** Postgres + Prisma, signup/login with JWT refresh, roles, uploads, OpenAPI docs, 80% integration-test coverage, Dockerised.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Build high-throughput, real-time and distributed Node services and diagnose production issues.  
**Time:** about 70–90 hours · **Certification:** Optional: AWS Certified Developer – Associate (DVA-C03, GA 1 Dec 2026) · **Hub:** `hubs/nodejs-l3-specialist-hub.html`

### L3-01 Event loop internals
- [ ] libuv phases
- [ ] thread pool
- [ ] process.nextTick vs microtasks
- [ ] diagnosing a blocked loop

### L3-02 Streams and backpressure
- [ ] Readable, writable, transform
- [ ] pipeline()
- [ ] backpressure
- [ ] processing big files

### L3-03 Parallelism
- [ ] worker_threads
- [ ] cluster
- [ ] child processes
- [ ] when to use each

### L3-04 Caching and queues
- [ ] Redis caching patterns
- [ ] BullMQ job queues
- [ ] retries and dead-letter queues (concepts in system-design)

### L3-05 Real-time
- [ ] WebSockets (ws/Socket.IO)
- [ ] SSE
- [ ] scaling with Redis pub/sub

### L3-06 GraphQL and gRPC
- [ ] Schemas and resolvers
- [ ] DataLoader
- [ ] when REST is better

### L3-07 Performance and diagnostics
- [ ] --inspect and Chrome DevTools
- [ ] heap snapshots and memory leaks
- [ ] clinic.js
- [ ] flame graphs

### L3-08 Observability
- [ ] OpenTelemetry traces, metrics and logs
- [ ] health checks
- [ ] graceful shutdown

### L3-09 Microservices
- [ ] Service boundaries
- [ ] API gateway
- [ ] messaging
- [ ] distributed tracing

**Capstone.** **Real-time car-trip tracker:** WebSocket service streaming vehicle positions, Redis pub/sub across 3 instances, BullMQ for trip reports, OpenTelemetry dashboard and a load-test report.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Own Node platform decisions: architecture, supply-chain security, upgrade strategy and team standards.  
**Time:** about 50–70 hours · **Certification:** No mainstream certification; evidence = accelerator + architecture decision records · **Hub:** `hubs/nodejs-l4-expert-hub.html`

### L4-01 Platform architecture
- [ ] Monolith vs modular monolith vs services
- [ ] serverless and edge runtimes
- [ ] Bun/Deno awareness

### L4-02 Supply-chain security
- [ ] Lockfiles
- [ ] npm provenance
- [ ] SBOMs
- [ ] the Node permission model
- [ ] incident playbooks

### L4-03 Upgrade and LTS strategy
- [ ] Release lines and EOL planning
- [ ] one major release a year from Node 27
- [ ] codemods

### L4-04 Native and low-level
- [ ] N-API addons
- [ ] WebAssembly
- [ ] profiling at the V8 level

### L4-05 Backend practice leadership
- [ ] Service templates/accelerators
- [ ] review standards
- [ ] on-call and SLOs
- [ ] mentoring

**Capstone.** **Service accelerator:** a production-ready Node service template (auth, logging, tracing, tests, CI, Docker, security checks) adopted by one real project.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.
