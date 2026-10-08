---
title: "System Design: levels L1–L4"
track: technical
domain: software-engineering
subject: system-design
tags: [system-design, levels]
status: planned
created: 2026-10-08
updated: 2026-10-08
---
# System Design: levels L1–L4

Keys follow your proficiency-framework format: `L1-03` is the third topic at L1. Skills are listed under each topic; each becomes a lesson or part of one when the hub is built. *(verify)* marks facts to re-check at build time.

## L1 Foundation

*Level definition:* Builds foundational knowledge and practical skills; handles defined tasks with guidance and follows standard practice.

**Outcome:** Explain how a web app works end to end and sketch a simple scalable design with sensible estimates.  
**Time:** about 35–45 hours · **Certification:** No certification; evidence = design docs · **Hub:** `hubs/system-design-l1-foundation-hub.html`

### L1-01 Client-server and networking
- [ ] DNS, TCP/UDP, HTTP/HTTPS, TLS in one diagram
- [ ] latency numbers every engineer should know

### L1-02 Scalability
- [ ] Vertical vs horizontal scaling
- [ ] stateless services
- [ ] bottlenecks

### L1-03 Availability and reliability
- [ ] Nines and downtime maths
- [ ] redundancy
- [ ] single points of failure
- [ ] fault tolerance

### L1-04 Load balancing
- [ ] L4 vs L7
- [ ] algorithms
- [ ] health checks
- [ ] sticky sessions

### L1-05 Caching basics
- [ ] Where caches live
- [ ] cache-aside
- [ ] TTLs
- [ ] hit ratio

### L1-06 CDNs and proxies
- [ ] Forward vs reverse proxy
- [ ] CDN push vs pull
- [ ] edge caching

### L1-07 Data storage choices
- [ ] SQL vs NoSQL at a glance
- [ ] blob storage (links sql)

### L1-08 APIs
- [ ] REST basics, pagination, idempotency (links nodejs)

### L1-09 Back-of-the-envelope estimation
- [ ] QPS, storage and bandwidth estimates
- [ ] powers of two

**Capstone.** **Design + build a URL shortener:** written design doc with estimates, then a tiny working version with a cache and a load test.

**Evidence to mark L1 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L2 Proficient

*Level definition:* Delivers solutions independently, solves problems, and guides others when needed.

**Outcome:** Design common products (feed, chat, rate limiter) with correct trade-offs, and run a design interview confidently.  
**Time:** about 60–80 hours · **Certification:** None · **Hub:** `hubs/system-design-l2-proficient-hub.html`

### L2-01 Consistency models
- [ ] Strong, eventual, read-your-writes
- [ ] CAP and PACELC

### L2-02 Replication
- [ ] Leader-follower, multi-leader, leaderless
- [ ] quorums
- [ ] replication lag

### L2-03 Partitioning
- [ ] Range vs hash
- [ ] consistent hashing
- [ ] hot keys
- [ ] rebalancing

### L2-04 Caching strategies
- [ ] Write-through, write-back, write-around
- [ ] invalidation
- [ ] stampede protection
- [ ] Redis

### L2-05 Messaging
- [ ] Queues vs pub/sub
- [ ] at-least-once vs exactly-once
- [ ] ordering
- [ ] dead-letter queues

### L2-06 Rate limiting and resilience
- [ ] Token bucket, leaky bucket, sliding window
- [ ] timeouts, retries with backoff, circuit breakers, bulkheads

### L2-07 Service architecture
- [ ] Monolith vs microservices
- [ ] API gateway
- [ ] service discovery
- [ ] BFF

### L2-08 Real-time communication
- [ ] Polling, long polling, SSE, WebSockets

### L2-09 Observability
- [ ] Logs, metrics, traces
- [ ] SLIs, SLOs and error budgets

### L2-10 Interview framework
- [ ] Requirements → estimates → API → data model → high-level → deep dives → trade-offs
- [ ] classic designs: rate limiter, news feed, chat, notification service

**Capstone.** **Distributed rate limiter + notification worker:** Redis token bucket used by 3 API instances, queue-based notification worker with retries and DLQ, dashboards.

**Evidence to mark L2 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + a reviewed write-up.

## L3 Specialist

*Level definition:* Designs solutions, solves complex challenges, leads key initiatives, mentors teams and drives quality standards.

**Outcome:** Design distributed, data-intensive systems (payments, streaming, search, geo) and defend them in review.  
**Time:** about 80–100 hours · **Certification:** Optional: AZ-305 Azure Solutions Architect Expert or AWS Solutions Architect – Associate (verify current versions) · **Hub:** `hubs/system-design-l3-specialist-hub.html`

### L3-01 Distributed transactions
- [ ] 2PC
- [ ] sagas
- [ ] outbox and inbox patterns
- [ ] idempotent consumers

### L3-02 Event-driven architecture
- [ ] Event sourcing
- [ ] CQRS
- [ ] schema evolution
- [ ] Kafka partitions and consumer groups

### L3-03 Stream and batch processing
- [ ] Lambda vs Kappa
- [ ] windowing
- [ ] exactly-once processing

### L3-04 Consensus and coordination
- [ ] Raft
- [ ] leader election
- [ ] distributed locks and fencing tokens
- [ ] clocks (Lamport, vector, hybrid)

### L3-05 Storage engines
- [ ] B-tree vs LSM, WAL (owned by sql L4-01
- [ ] design trade-offs here)

### L3-06 Search and geo
- [ ] Inverted indexes
- [ ] ranking
- [ ] geohash and quadtrees

### L3-07 Multi-region and DR
- [ ] Active-active vs active-passive
- [ ] RTO/RPO
- [ ] failover
- [ ] data residency

### L3-08 Security architecture
- [ ] AuthN/AuthZ at scale
- [ ] zero trust
- [ ] secrets
- [ ] encryption

### L3-09 Classic large designs
- [ ] Video streaming, ride-hailing, collaborative docs, payment system, web crawler, distributed key-value store

**Capstone.** **Event-driven order platform:** Kafka-based order, payment and inventory services with saga + outbox, run with Docker Compose, with a failure-injection report.

**Evidence to mark L3 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.

## L4 Expert

*Level definition:* Shapes technology direction, sets best practice, builds capability across teams and advances organisational capability.

**Outcome:** Lead architecture: trade-off decisions, reviews, capacity and cost, and organisation-level design.  
**Time:** about 50–70 hours · **Certification:** Optional: AWS Solutions Architect – Professional (SAP-C03 GA 17 Nov 2026) or AZ-305 · **Hub:** `hubs/system-design-l4-expert-hub.html`

### L4-01 Architecture decision-making
- [ ] ADRs
- [ ] trade-off analysis (ATAM-lite)
- [ ] reversible vs irreversible decisions

### L4-02 Well-architected frameworks
- [ ] AWS and Azure well-architected pillars
- [ ] reliability, security, cost, operations, performance, sustainability

### L4-03 Capacity and cost
- [ ] Capacity planning
- [ ] load testing at scale
- [ ] FinOps basics

### L4-04 Evolution and migration
- [ ] Strangler fig
- [ ] data migrations
- [ ] backwards compatibility

### L4-05 Socio-technical design
- [ ] Conway's law
- [ ] team topologies
- [ ] platform teams

### L4-06 AI systems design
- [ ] LLM serving, RAG at scale, agent platforms (links ai-engineering L4)

**Capstone.** **Architecture review pack:** review an existing system (e.g. your anomaly-detection project), write 5 ADRs, a capacity/cost model and a migration roadmap.

**Evidence to mark L4 complete:** capstone repo or app link + hub mastery ≥ 80% on every topic + passing the mapped certification.
